import { BadRequestHttpError } from '../../util/errors/BadRequestHttpError';
import type { DataboxRequestContext } from '../context/DataboxRequestContext';
import type { EvidenceDecision, PolicyEvaluation } from '../evidence/AuditEvidence';
import { buildAuditRecord } from '../evidence/AuditEvidence';
import type { HashChainedEvidenceLedger } from '../evidence/EvidenceLedgerStore';
import { DBX_DUTIES } from '../odrl/terms';
import type { DutyState } from './DutyStateMachine';
import { assertTransition, isFulfilled } from './DutyStateMachine';

/**
 * The durable obligation engine (component C12, IF-16; ADR-0012 §state machine, ADR-0019 §append-only
 * evidence). It owns the AUTHORITATIVE "Duty state" (DBX-04 §6 matrix) and enforces the ADR-0012 rules the
 * whole register turns on:
 *
 * - **`queued` != fulfilled.** A duty is created `queued`; only `accepted`/`acknowledged` are fulfilled
 *   ({@link ./DutyStateMachine}). A `signalHolder` whose delivery is deferred to DBX-21 stays `queued` and
 *   is therefore NEVER reported fulfilled (T-50).
 * - **Every transition is evidence.** Each transition appends a `duty-transition`
 *   {@link ../evidence/AuditEvidence} record to the C13 hash-chained ledger (DBX-19), binding the duty
 *   action, the resulting state, the policy version+digest and (for a receipt) the receipt digest — the
 *   actor is bound from the VERIFIED context, never headers.
 * - **Retries are idempotent.** The duty instance carries a stable idempotency key; re-running a handler on
 *   an already-fulfilled instance returns the ORIGINAL outcome and does NOT re-invoke the handler or append
 *   a second transition (ADR-0012 rule 3, T-24) — no double-count, no double side effect.
 */

/** The immutable public view of a durable duty instance. */
export interface DutyInstance {
  /** The stable idempotency key identifying this logical duty instance (never per-attempt, ADR-0012 §3). */
  readonly dutyId: string;
  /** The duty action IRI (a `dbx:` duty, ADR-0012). */
  readonly action: string;
  /** The duty target as a digest or `opaque:` reference (never a raw path/payload, T-55). */
  readonly targetDigest: string;
  /** The current authoritative state (C12 owns this). */
  readonly state: DutyState;
  /** The number of delivery attempts (incremented on each move to `attempted`). */
  readonly attempts: number;
  /** The structured failure reason, when the instance last `failed`. */
  readonly failureReason?: string;
  /** The `urn:sha256` digest of the fulfilment evidence bound into the ledger, when `accepted`. */
  readonly evidenceDigest?: string;
}

/** What a handler reports after performing (or deferring) its side effect. */
export interface HandlerOutcome {
  /**
   * `accepted` — the fulfilment condition was met; `failed` — a settled failure (retryable/remediable);
   * `queued` — the side effect is DEFERRED (e.g. a signal awaiting DBX-21 delivery) so the duty stays
   * `queued` and is NOT fulfilled.
   */
  readonly resultState: 'accepted' | 'failed' | 'queued';
  /** The `urn:sha256` fulfilment-evidence digest, bound into the ledger when `accepted`. */
  readonly evidenceDigest?: string;
  /** A structured reason (never protected content), recorded on the transition. */
  readonly reason?: string;
}

/** A duty handler: performs the side effect for a duty instance and reports the outcome. */
export type DutyHandler = (instance: DutyInstance) => Promise<HandlerOutcome>;

/** The result of running a handler: the settled instance and whether it was an idempotent replay. */
export interface DutyRunResult {
  /** The instance after the run (unchanged and original on a replay). */
  readonly instance: DutyInstance;
  /** True when the instance was already fulfilled and the handler was NOT re-invoked (idempotent, T-24). */
  readonly replayed: boolean;
}

/** The engine's evidence-binding context (the tenant, verified actor and governing policy). */
export interface DutyEngineContext {
  /** Opaque tenant identifier the transitions belong to. */
  readonly tenantId: string;
  /** The verified request context whose actor is bound into each transition (never headers). */
  readonly context: DataboxRequestContext;
  /** The governing policy binding (odrlPolicy/version/digest) recorded on every transition (ADR-0019). */
  readonly policy: PolicyEvaluation;
}

/** The activation input for a new duty instance. */
export interface DutyActivation {
  /** The stable idempotency key (per logical duty instance). */
  readonly dutyId: string;
  /** The duty action IRI. */
  readonly action: string;
  /** The target as a digest or `opaque:` reference. */
  readonly targetDigest: string;
}

const SHA256_URN = /^urn:sha256:[0-9a-f]{64}$/u;
const UNSAFE_REASON_CHARS = /[^\w.:-]/gu;

/**
 * LOW-3: constrain a caller-supplied reason to a safe charset before it becomes part of a structured
 * `reasonCode`. Canonicalization already escapes it in the ledger, but structuring it keeps the reason code
 * a stable, non-injectable token (never free-form content).
 */
function safeReason(reason: string): string {
  return reason.replaceAll(UNSAFE_REASON_CHARS, '_').slice(0, 64);
}

/** LOW-2: a fulfilment-evidence digest MUST be a `urn:sha256:<64 hex>`; anything else fails closed. */
function assertEvidenceDigest(evidenceDigest: string | undefined): void {
  if (evidenceDigest !== undefined && !SHA256_URN.test(evidenceDigest)) {
    throw new BadRequestHttpError('Duty evidenceDigest must be a urn:sha256:<64 hex> digest (fail closed).');
  }
}

export class DutyEngine {
  private readonly ledger: HashChainedEvidenceLedger;
  private readonly context: DutyEngineContext;
  private readonly instances = new Map<string, DutyInstance>();
  /** MED-3: per-dutyId serialization chain so concurrent runs cannot double-invoke a handler. */
  private readonly inFlight = new Map<string, Promise<unknown>>();

  public constructor(ledger: HashChainedEvidenceLedger, context: DutyEngineContext) {
    this.ledger = ledger;
    this.context = context;
  }

  /** The current instance for `dutyId`, or `undefined` if it was never activated. */
  public get(dutyId: string): DutyInstance | undefined {
    return this.instances.get(dutyId);
  }

  /**
   * Activate a duty in `queued` and append its first evidence transition. Idempotent: re-activating an
   * existing `dutyId` returns the ORIGINAL instance and appends nothing (no duplicate logical duty).
   */
  public async activate(activation: DutyActivation): Promise<DutyInstance> {
    const existing = this.instances.get(activation.dutyId);
    if (existing) {
      return existing;
    }
    if (typeof activation.dutyId !== 'string' || activation.dutyId.length === 0) {
      throw new BadRequestHttpError('A duty instance requires a non-empty stable dutyId (idempotency key).');
    }
    const instance: DutyInstance = {
      dutyId: activation.dutyId,
      action: activation.action,
      targetDigest: activation.targetDigest,
      state: 'queued',
      attempts: 0,
    };
    await this.appendTransition(instance, 'queued', 'allow', 'duty:queued');
    this.instances.set(instance.dutyId, instance);
    return instance;
  }

  /**
   * Run `handler` for the duty, driving the state machine and appending each transition. Idempotent: if the
   * instance is already fulfilled it returns the original WITHOUT re-invoking the handler. A `queued`
   * outcome leaves the duty `queued` (deferred, not fulfilled). An `accepted`/`failed` outcome moves
   * `queued`/`failed → attempted → accepted|failed`, appending both transitions.
   */
  public async run(dutyId: string, handler: DutyHandler): Promise<DutyRunResult> {
    // MED-3: serialize per dutyId. Two concurrent run()s both observing `queued` would each invoke the
    // handler and each append attempted+accepted (double receipt / double stage / two accepted records). By
    // chaining after any in-flight run for the same dutyId, the SECOND observer runs only after the first
    // settles — it then sees the fulfilled state and idempotently replays WITHOUT re-invoking the handler.
    const prior = this.inFlight.get(dutyId) ?? Promise.resolve();
    const next = prior.then(async(): Promise<DutyRunResult> => this.runExclusive(dutyId, handler));
    // Store a settled-swallowing tail so one run's failure does not break the chain for later callers.
    this.inFlight.set(dutyId, next.then((): void => undefined, (): void => undefined));
    return next;
  }

  /** The actual, non-reentrant run body (guarded by the {@link run} per-dutyId chain). */
  private async runExclusive(dutyId: string, handler: DutyHandler): Promise<DutyRunResult> {
    const instance = this.require(dutyId);
    if (isFulfilled(instance.state)) {
      return { instance, replayed: true };
    }
    const outcome = await handler(instance);
    assertEvidenceDigest(outcome.evidenceDigest);
    if (outcome.resultState === 'queued') {
      // Deferred: the side effect is not yet attempted (e.g. signalHolder awaiting DBX-21). The duty stays
      // `queued` — NOT fulfilled (T-50). No spurious transition is appended.
      return { instance, replayed: false };
    }
    // Re-read the authoritative state immediately before transitioning (defence-in-depth against a state
    // change between the fulfilment check and the write).
    const current = this.require(dutyId);
    const attempted = await this.transition(current, 'attempted', 'allow', 'duty:attempted', outcome.reason);
    const decision: EvidenceDecision = outcome.resultState === 'failed' ? 'partial' : 'allow';
    const settled = await this.transition(
      attempted,
      outcome.resultState,
      decision,
      `duty:${outcome.resultState}`,
      outcome.reason,
      outcome.evidenceDigest,
    );
    return { instance: settled, replayed: false };
  }

  /** Retry a `failed` duty by re-running its handler (`failed → attempted → …`), idempotent per instance. */
  public async retry(dutyId: string, handler: DutyHandler): Promise<DutyRunResult> {
    const instance = this.require(dutyId);
    if (instance.state !== 'failed') {
      throw new BadRequestHttpError('Only a failed duty can be retried (ADR-0012 §5).');
    }
    return this.run(dutyId, handler);
  }

  /** Record a consequence/remedy for a `failed` duty (`failed → remedied`). */
  public async remedy(dutyId: string, reason: string): Promise<DutyInstance> {
    const instance = this.require(dutyId);
    return this.transition(instance, 'remedied', 'allow', `duty:remedied:${safeReason(reason)}`);
  }

  /** Supersede/cancel a `queued` duty by an authorized policy event (`queued → superseded`, ADR-0012). */
  public async supersede(dutyId: string, reason: string): Promise<DutyInstance> {
    const instance = this.require(dutyId);
    return this.transition(instance, 'superseded', 'allow', `duty:superseded:${safeReason(reason)}`);
  }

  /**
   * Record a consumer/vault acknowledgement (`accepted → acknowledged`), permitted ONLY for a
   * `dbx:acknowledge` duty (never inferred from signalHolder/makeAvailable, ADR-0012 §diagram).
   */
  public async acknowledge(dutyId: string, evidenceDigest: string): Promise<DutyInstance> {
    const instance = this.require(dutyId);
    if (instance.action !== DBX_DUTIES.acknowledge) {
      throw new BadRequestHttpError('acknowledged is reachable only for a dbx:acknowledge duty (ADR-0012).');
    }
    assertEvidenceDigest(evidenceDigest);
    return this.transition(instance, 'acknowledged', 'allow', 'duty:acknowledged', undefined, evidenceDigest);
  }

  private require(dutyId: string): DutyInstance {
    const instance = this.instances.get(dutyId);
    if (!instance) {
      throw new BadRequestHttpError(`Unknown duty instance '${dutyId}' (activate it first).`);
    }
    return instance;
  }

  /** Validate + apply one transition, append its evidence, and store the new instance. */
  private async transition(
    instance: DutyInstance,
    to: DutyState,
    decision: EvidenceDecision,
    reasonCode: string,
    failureReason?: string,
    evidenceDigest?: string,
  ): Promise<DutyInstance> {
    assertTransition(instance.state, to);
    const next: DutyInstance = {
      dutyId: instance.dutyId,
      action: instance.action,
      targetDigest: instance.targetDigest,
      state: to,
      attempts: to === 'attempted' ? instance.attempts + 1 : instance.attempts,
      ...to === 'failed' && failureReason !== undefined ? { failureReason } : {},
      ...evidenceDigest === undefined ? {} : { evidenceDigest },
    };
    await this.appendTransition(next, to, decision, reasonCode, evidenceDigest);
    this.instances.set(next.dutyId, next);
    return next;
  }

  /** Append a `duty-transition` evidence record to the C13 ledger (DBX-19); binds the receipt digest. */
  private async appendTransition(
    instance: DutyInstance,
    state: DutyState,
    decision: EvidenceDecision,
    reasonCode: string,
    evidenceDigest?: string,
  ): Promise<void> {
    const record = buildAuditRecord({
      kind: 'duty-transition',
      decision,
      reasonCode,
      operation: 'duty-transition',
      targetDigest: instance.targetDigest,
      policy: { ...this.context.policy, odrlRule: instance.action, odrlState: state },
      // Already validated as a urn:sha256 upstream (assertEvidenceDigest), so it binds directly.
      ...evidenceDigest === undefined ? {} : { receiptDigest: evidenceDigest },
    }, this.context.context);
    await this.ledger.append({ tenantId: this.context.tenantId, record });
  }
}
