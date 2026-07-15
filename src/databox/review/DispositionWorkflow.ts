import type { KeyObject } from 'node:crypto';
import { randomUUID } from 'node:crypto';
import { BadRequestHttpError } from '../../util/errors/BadRequestHttpError';
import { ConflictHttpError } from '../../util/errors/ConflictHttpError';
import { ForbiddenHttpError } from '../../util/errors/ForbiddenHttpError';
import type { DataboxRequestContext } from '../context/DataboxRequestContext';
import { buildAuditRecord } from '../evidence/AuditEvidence';
import type { HashChainedEvidenceLedger } from '../evidence/EvidenceLedgerStore';
import { DBX_DUTIES } from '../odrl/terms';
import type { DutyHandler, DutyRunResult } from '../policy/DutyEngine';
import { DutyEngine } from '../policy/DutyEngine';
import { canonicalDigest, digestOfBytes } from '../proof/Canonicalization';
import { AppendOnlyDispositionStore } from './AppendOnlyDispositionStore';
import { GovernedReviewQueue } from './GovernedReviewQueue';
import { meetsAssurance } from './ReviewAssurance';
import { buildSignedDisposition } from './SignedDisposition';
import type {
  CommittedSubmissionEvent,
  DispositionDecision,
  ReviewCase,
  Reviewer,
  ReviewerAssuranceRequirement,
  SignedDisposition,
  SubmitterIdentity,
} from './ReviewTypes';
import { SUPERSEDING_OUTCOMES } from './ReviewTypes';

/**
 * The submission review + disposition workflow (component C17, DBX-04 §49/IF-12/IF-13; ADR-0016/0017/0018/
 * 0023/0012). It is the orchestrator that couples the governed queue, the assurance gate, the signed
 * disposition model and the append-only store to the DBX-20 duty engine and the DBX-19 evidence ledger, and
 * it is the barrel entry (re-exports its siblings).
 *
 * The invariants it enforces (acceptance gate):
 * - **No source-of-record write before an authorized disposition (T-45).** {@link stage}/{@link claim}
 *   never touch the source of record. Only a `recordDisposition` by an ASSIGNED, sufficiently-ASSURED
 *   reviewer — after the signed disposition is durably appended — routes a governed correction case, and
 *   even then it is a NEW governed case, never an in-place source rewrite (ADR-0016).
 * - **Fail closed.** An unassigned reviewer, a wrong reviewer, or an under-assured reviewer is refused
 *   BEFORE any signing/append/routing.
 * - **Append-only, linked, signed disposition (ADR-0018/IF-13).** The disposition is ES256-signed and
 *   appended linked to the submission; the append IS the `recordDisposition` fulfilment condition.
 * - **Duties coupled (ADR-0012).** `stageForReview` is fulfilled on staging; `recordDisposition` is
 *   fulfilled on the durably-appended signed disposition; a failed append leaves the duty `failed` and
 *   VISIBLE (never done-by-default).
 * - **Reconstructable actor transfers + decisions (evidence).** Staging binds the submitter; claiming binds
 *   the reviewer; the disposition binds the reviewer + the outcome + the envelope digest — all appended to
 *   the hash-chained ledger, so who held and decided the case is reconstructable.
 */

/** A governed source-of-record correction case (ADR-0016 — routed AFTER disposition; never an in-place write). */
export interface GovernedSourceCase {
  /** The opaque governed-case reference. */
  readonly caseRef: string;
  /** The opaque prior source record the correction concerns, when known. */
  readonly priorRecordRef?: string;
  /** The superseding record reference the disposition named (a NEW appended record). */
  readonly supersedingRecordRef: string;
  /** The disposition that authorized opening this case. */
  readonly dispositionId: string;
  /** ISO-8601 instant the governed case was opened. */
  readonly openedAt: string;
}

/** Opens a governed source-of-record correction case (the integration-plane seam; DBX-22 wires the bridge). */
export interface GovernedSourceCaseOpener {
  /** Open a governed correction case for an authorized superseding disposition (never an in-place write). */
  readonly openCorrectionCase: (input: {
    readonly supersedingRecordRef: string;
    readonly dispositionId: string;
    readonly priorRecordRef?: string;
  }) => GovernedSourceCase;
  /** The governed cases opened so far (defensive copy). */
  readonly cases: () => readonly GovernedSourceCase[];
}

/**
 * The synthetic source of record (reference model, T-45). Its seeded records are NEVER mutated in place: a
 * correction opens a NEW governed case referencing a superseding record, so the prior source bytes and their
 * digest are preserved (ADR-0016/0018). A production integration plane (DBX-22 bridge) replaces this behind
 * the same surface.
 */
export class SyntheticSourceOfRecord implements GovernedSourceCaseOpener {
  private readonly records: Map<string, string>;
  private readonly opened = new Map<string, GovernedSourceCase>();
  private readonly now: () => string;

  public constructor(seededRecords: Readonly<Record<string, string>> = {}, now?: () => string) {
    this.records = new Map(Object.entries(seededRecords));
    this.now = now ?? ((): string => new Date().toISOString());
  }

  /** The synthetic source digest for a seeded record ref, or `undefined`. Used by tests to prove no rewrite. */
  public recordDigest(ref: string): string | undefined {
    return this.records.get(ref);
  }

  public openCorrectionCase(input: {
    readonly supersedingRecordRef: string;
    readonly dispositionId: string;
    readonly priorRecordRef?: string;
  }): GovernedSourceCase {
    if (this.opened.has(input.supersedingRecordRef)) {
      throw new ConflictHttpError(`A governed case already exists for '${input.supersedingRecordRef}'.`);
    }
    const governed: GovernedSourceCase = {
      caseRef: `governed-case:${input.supersedingRecordRef}`,
      supersedingRecordRef: input.supersedingRecordRef,
      dispositionId: input.dispositionId,
      openedAt: this.now(),
      ...input.priorRecordRef === undefined ? {} : { priorRecordRef: input.priorRecordRef },
    };
    // NB: the seeded `records` map is deliberately NOT modified — the source of record is never rewritten in
    // place; the correction is a governed case referencing a superseding record (ADR-0016).
    this.opened.set(input.supersedingRecordRef, governed);
    return governed;
  }

  public cases(): readonly GovernedSourceCase[] {
    return [ ...this.opened.values() ];
  }
}

/** Options for {@link DispositionWorkflow}. */
export interface DispositionWorkflowOptions {
  /** The DBX-19 hash-chained evidence ledger every review action is appended to. */
  readonly ledger: HashChainedEvidenceLedger;
  /** The ES256 (P-256) private key the reviewer/governed process signs dispositions with (test keys ok). */
  readonly signingKey: KeyObject;
  /** The verification-method (`kid`) of {@link signingKey}. */
  readonly verificationMethod: string;
  /** The governed review queue; defaults to a fresh {@link GovernedReviewQueue}. */
  readonly queue?: GovernedReviewQueue;
  /** The append-only disposition store; defaults to a fresh {@link AppendOnlyDispositionStore}. */
  readonly store?: AppendOnlyDispositionStore;
  /** The governed source-of-record case opener; defaults to a fresh {@link SyntheticSourceOfRecord}. */
  readonly sourceOfRecord?: GovernedSourceCaseOpener;
  /** ISO-8601 clock; defaults to `Date.now`. */
  readonly now?: () => string;
  /** Stable disposition-id factory; defaults to `urn:uuid:<random>`. Injectable for deterministic tests. */
  readonly dispositionId?: () => string;
}

/** A visible duty record (for overdue/failed-duty visibility). */
export interface ReviewDutyRecord {
  readonly dutyId: string;
  readonly action: string;
  readonly caseId: string;
  readonly state: string;
}

/** The result of recording a disposition. */
export interface DispositionResult {
  /** The signed disposition (built + signed regardless of whether the append fulfilled). */
  readonly signed: SignedDisposition;
  /** The case after the attempt (disposed on success; still `claimed` on a failed append). */
  readonly case: ReviewCase;
  /** The `recordDisposition` duty id (query its state via {@link DispositionWorkflow.duty}). */
  readonly dutyId: string;
  /** True iff the disposition was durably appended and the case moved to `disposed`. */
  readonly disposed: boolean;
  /** The governed source-of-record case, when a superseding outcome routed one (never before disposition). */
  readonly sourceCase?: GovernedSourceCase;
}

export class DispositionWorkflow {
  private readonly ledger: HashChainedEvidenceLedger;
  private readonly signingKey: KeyObject;
  private readonly verificationMethod: string;
  public readonly queue: GovernedReviewQueue;
  public readonly store: AppendOnlyDispositionStore;
  private readonly sourceOfRecord: GovernedSourceCaseOpener;
  private readonly now: () => string;
  private readonly newDispositionId: () => string;
  private readonly duties = new Map<string, ReviewDutyRecord>();

  public constructor(options: DispositionWorkflowOptions) {
    this.ledger = options.ledger;
    this.signingKey = options.signingKey;
    this.verificationMethod = options.verificationMethod;
    this.queue = options.queue ?? new GovernedReviewQueue({ now: options.now });
    this.store = options.store ?? new AppendOnlyDispositionStore();
    this.sourceOfRecord = options.sourceOfRecord ?? new SyntheticSourceOfRecord({}, options.now);
    this.now = options.now ?? ((): string => new Date().toISOString());
    this.newDispositionId = options.dispositionId ?? ((): string => `urn:uuid:${randomUUID()}`);
  }

  /**
   * Stage a committed submission event into the governed queue and fulfil its `stageForReview` duty. The
   * stage is the durable act; the duty is therefore fulfilled (ADR-0012 §stageForReview — fulfilled when
   * durably present in the governed queue). Binds the SUBMITTER as the acting party in evidence. Idempotent:
   * re-staging the same committed event returns the original case.
   */
  public async stage(event: CommittedSubmissionEvent): Promise<{ case: ReviewCase; dutyId: string }> {
    const staged = this.queue.stage(event);
    const target = digestOfBytes(event.submissionRef);
    const dutyId = `stageForReview:${staged.caseId}`;
    // Idempotent: a re-stage of the same committed event does not re-run the duty (no duplicate transitions).
    if (!this.duties.has(dutyId)) {
      const evidenceDigest = canonicalDigest({
        submissionRef: event.submissionRef,
        submissionClass: event.submissionClass,
        stagedAt: staged.stagedAt,
      });
      // The submitter is the acting party for the staging record (ADR-0004 typed actor).
      await this.runDuty(event.tenantId, this.submitterContext(event.submitter), event.policy, {
        dutyId,
        action: DBX_DUTIES.stageForReview,
        targetDigest: target,
      }, this.acceptHandler(evidenceDigest, 'staged-for-review'), staged.caseId);
    }
    return { case: this.queue.require(staged.caseId), dutyId };
  }

  /**
   * Claim (assign) a case to a reviewer, assurance-gated (fail closed). Records the actor transfer to the
   * reviewer as an evidence event (so who took the case is reconstructable). Does NOT touch the source of
   * record.
   */
  public async claim(
    caseId: string,
    reviewer: Reviewer,
    requirement: ReviewerAssuranceRequirement,
  ): Promise<ReviewCase> {
    const claimed = this.queue.claim(caseId, reviewer, requirement);
    await this.ledger.append({
      tenantId: claimed.event.tenantId,
      record: buildAuditRecord({
        kind: 'review-claim',
        decision: 'allow',
        reasonCode: 'review:claimed',
        operation: 'review-assign',
        targetDigest: digestOfBytes(claimed.event.submissionRef),
        policy: claimed.event.policy,
      }, reviewer.context),
    });
    return claimed;
  }

  /**
   * Record a reasoned, ES256-signed disposition for a claimed case. Fails closed BEFORE any signing/append/
   * routing unless the case is `claimed` by exactly this reviewer AND the reviewer's VERIFIED assurance
   * meets the minimum. The signed disposition is appended linked to the submission (the append fulfils the
   * `recordDisposition` duty); on success the case is disposed, an evidence record binds the outcome, and a
   * superseding outcome routes a governed source-of-record case (NEVER an in-place write). A failed append
   * leaves the duty `failed` and visible.
   */
  public async recordDisposition(
    reviewer: Reviewer,
    decision: DispositionDecision,
    requirement: ReviewerAssuranceRequirement,
  ): Promise<DispositionResult> {
    const current = this.queue.require(decision.caseId);
    // Fail closed: an unassigned/wrong/under-assured reviewer cannot dispose (T-45), before ANY side effect.
    if (current.state !== 'claimed' || current.reviewerId === undefined) {
      throw new ForbiddenHttpError(`Case '${decision.caseId}' is not claimed; it cannot be disposed.`);
    }
    if (current.reviewerId !== reviewer.reviewerId) {
      throw new ForbiddenHttpError(`Only the assigned reviewer may dispose case '${decision.caseId}'.`);
    }
    if (!meetsAssurance(reviewer.context, requirement)) {
      throw new ForbiddenHttpError(`Reviewer no longer meets the assurance minimum; disposition refused.`);
    }

    const dispositionId = this.newDispositionId();
    const signed = buildSignedDisposition(current.event, current.caseId, decision, {
      dispositionId,
      reviewerId: reviewer.reviewerId,
      decidedAt: this.now(),
      signingKey: this.signingKey,
      verificationMethod: this.verificationMethod,
    });

    const dutyId = `recordDisposition:${dispositionId}`;
    // The durable append IS the recordDisposition fulfilment condition (ADR-0012). A conflict → `failed`.
    const run = await this.runDuty(
      current.event.tenantId,
      reviewer.context,
      current.event.policy,
      { dutyId, action: DBX_DUTIES.recordDisposition, targetDigest: digestOfBytes(current.event.submissionRef) },
      this.appendHandler(signed),
      current.caseId,
    );

    if (run.instance.state !== 'accepted') {
      // Failed append: the duty is visible as failed; the case stays claimed; NO source-of-record write.
      return { signed, case: this.queue.require(current.caseId), dutyId, disposed: false };
    }

    const disposedCase = this.queue.markDisposed(current.caseId, dispositionId, reviewer.reviewerId);
    // Bind the reasoned decision as an evidence event (outcome reconstructable), reviewer as acting party.
    await this.ledger.append({
      tenantId: current.event.tenantId,
      record: buildAuditRecord({
        kind: 'disposition-recorded',
        decision: 'allow',
        reasonCode: `disposition:${decision.outcomeKind}`,
        operation: 'record-disposition',
        targetDigest: digestOfBytes(current.event.submissionRef),
        receiptDigest: signed.envelopeDigest,
        disposition: decision.outcomeKind,
        policy: current.event.policy,
      }, reviewer.context),
    });

    const sourceCase = this.routeSourceCase(current.event, decision, dispositionId);
    return { signed, case: disposedCase, dutyId, disposed: true, ...sourceCase === undefined ? {} : { sourceCase }};
  }

  /** The visible record of a duty (overdue/failed-duty visibility), or `undefined` if unknown. */
  public duty(dutyId: string): ReviewDutyRecord | undefined {
    return this.duties.get(dutyId);
  }

  /** Every review duty in a non-fulfilled `failed` state (visible for remediation, never done-by-default). */
  public failedDuties(): readonly ReviewDutyRecord[] {
    return [ ...this.duties.values() ].filter((record): boolean => record.state === 'failed');
  }

  /** Overdue cases (response clock elapsed, not yet disposed) — delegates to the governed queue. */
  public overdueCases(atIso?: string): readonly ReviewCase[] {
    return atIso === undefined ? this.queue.overdue() : this.queue.overdue(atIso);
  }

  /** Route a governed source-of-record case for a superseding outcome (never before disposition/in-place). */
  private routeSourceCase(
    event: CommittedSubmissionEvent,
    decision: DispositionDecision,
    dispositionId: string,
  ): GovernedSourceCase | undefined {
    if (!SUPERSEDING_OUTCOMES.includes(decision.outcomeKind)) {
      return undefined;
    }
    // A superseding outcome always carries a superseding record ref (validated in buildSignedDisposition).
    return this.sourceOfRecord.openCorrectionCase({
      supersedingRecordRef: decision.supersedingRecordRef!,
      dispositionId,
      ...event.targetRecordRef === undefined ? {} : { priorRecordRef: event.targetRecordRef },
    });
  }

  /** A handler that unconditionally accepts (the caller already performed the durable act). */
  private acceptHandler(evidenceDigest: string, reason: string): DutyHandler {
    return async(): Promise<{ resultState: 'accepted'; evidenceDigest: string; reason: string }> =>
      ({ resultState: 'accepted', evidenceDigest, reason });
  }

  /** A handler whose durable act is the append; a duplicate append (409) settles the duty as `failed`. */
  private appendHandler(signed: SignedDisposition): DutyHandler {
    return async(): Promise<{ resultState: 'accepted' | 'failed'; evidenceDigest?: string; reason: string }> => {
      try {
        this.store.append(signed);
        return { resultState: 'accepted', evidenceDigest: signed.envelopeDigest, reason: 'disposition-appended' };
      } catch {
        return { resultState: 'failed', reason: 'disposition-append-conflict' };
      }
    };
  }

  /** Activate + run a duty on a per-op engine (binding the given actor), recording its visible state. */
  private async runDuty(
    tenantId: string,
    context: DataboxRequestContext,
    policy: CommittedSubmissionEvent['policy'],
    activation: { readonly dutyId: string; readonly action: string; readonly targetDigest: string },
    handler: DutyHandler,
    caseId: string,
  ): Promise<DutyRunResult> {
    const engine = new DutyEngine(this.ledger, { tenantId, context, policy });
    await engine.activate(activation);
    const run = await engine.run(activation.dutyId, handler);
    this.duties.set(activation.dutyId, {
      dutyId: activation.dutyId,
      action: activation.action,
      caseId,
      state: run.instance.state,
    });
    return run;
  }

  /** Synthesize a minimal verified context binding the SUBMITTER as the acting party (evidence only). */
  private submitterContext(submitter: SubmitterIdentity): DataboxRequestContext {
    if (typeof submitter.submitterRef !== 'string' || submitter.submitterRef.length === 0) {
      throw new BadRequestHttpError('A committed submission requires a non-empty submitter reference.');
    }
    return {
      webId: submitter.submitterRef,
      actor: submitter.actorRef ?? submitter.submitterRef,
      ...submitter.issuer === undefined ? {} : { issuer: submitter.issuer },
    };
  }
}

// Barrel: a single `export * from './review/DispositionWorkflow'` added to src/databox/index.ts by whoever
// DI-wires C17 (see databox/handoffs/DBX-23.md §barrel) re-exports every DBX-23 symbol (DBX-15/18/22 pattern).
export * from './ReviewTypes';
export * from './ReviewAssurance';
export * from './GovernedReviewQueue';
export * from './SignedDisposition';
export * from './AppendOnlyDispositionStore';
