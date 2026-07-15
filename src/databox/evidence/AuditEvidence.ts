import { BadRequestHttpError } from '../../util/errors/BadRequestHttpError';
import type { DataboxRequestContext } from '../context/DataboxRequestContext';

/**
 * The bound evidence record the ledger commits (component C13; ADR-0019 §Evidence ledger;
 * exchange-and-evidence.md §Audit). One record captures the full set of Audit-section facts for a single
 * governed decision — successful, denied or partial — WITHOUT any protected payload: it stores digests and
 * opaque references, never record content or another tenant's facts (T-55, isolation-and-privacy.md).
 *
 * Two invariants are load-bearing:
 * - The actor context is bound from the **cryptographically-verified** {@link DataboxRequestContext}
 *   (component C3), never from request headers — {@link bindActorFromContext} reads only verified fields.
 * - Attacker-controlled fields (WebID, purpose, reason) are STRUCTURED and validated, never concatenated
 *   into the chain; a target that is not a digest/opaque reference is rejected so raw content or a raw path
 *   can never enter the ledger (T-55 injection; DBX-01 §2 no identifying data in logs).
 */

/** The decision an evidence record attests. `partial` records a partial-failure outcome. */
export type EvidenceDecision = 'allow' | 'deny' | 'partial';

/** A `urn:sha256:<64 hex>` digest. */
const SHA256_URN = /^urn:sha256:[0-9a-f]{64}$/u;
/** A digest OR an `opaque:<token>` reference — the only shapes a ledger target/ref may take (no payloads). */
const DIGEST_OR_OPAQUE = /^(?:urn:sha256:[0-9a-f]{64}|opaque:[\w.:-]+)$/u;

/** Fail closed on an absent/blank required string field. */
export function assertNonEmpty(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new BadRequestHttpError(`Evidence field '${name}' must be a non-empty string.`);
  }
  return value;
}

function assertDigest(value: unknown, name: string): string {
  if (typeof value !== 'string' || !SHA256_URN.test(value)) {
    throw new BadRequestHttpError(`Evidence field '${name}' must be a urn:sha256:<64 hex> digest.`);
  }
  return value;
}

function assertOptionalDigest(value: string | undefined, name: string): void {
  if (value !== undefined) {
    assertDigest(value, name);
  }
}

/**
 * The verified actor context bound into an evidence record, derived ONLY from the C3
 * {@link DataboxRequestContext} (never from request headers). Distinguishes the acting party from the
 * represented entity (ADR-0004) and retains the client, issuer, assurance and delegation-grant reference
 * so a decision is attributable to who was actually verified.
 */
export interface BoundActor {
  /** The verified acting agent (RFC 8693 `act`); defaults to the WebID when the token asserts no actor. */
  readonly actor?: string;
  /** The verified WebID of the acting agent. */
  readonly webId?: string;
  /** The verified represented entity the actor is acting on behalf of (kept DISTINCT from {@link actor}). */
  readonly representedEntity?: string;
  /** Opaque reference to the delegation/guardianship grant (never the grant contents). */
  readonly delegationGrantRef?: string;
  /** The verified OAuth/OIDC client identifier. */
  readonly clientId?: string;
  /** The verified issuer that asserted the claims. */
  readonly issuer?: string;
  /** The audience the presented token was bound to. */
  readonly audience?: string;
  /** The opaque assurance grade token (ADR-0010). */
  readonly assuranceGrade?: string;
  /** The per-dimension assurance levels (ADR-0010). */
  readonly assuranceDimensions?: Readonly<Record<string, number>>;
  /** Identifier+version of the crosswalk that produced the assurance levels (traceability). */
  readonly crosswalkVersion?: string;
  /** The verified authentication instant (ISO-8601). */
  readonly authTime?: string;
}

/**
 * Bind the actor context from the verified request context (C3). Reads ONLY verified fields; a caller can
 * never inject an actor via a request header because there is no header input here — the source is the
 * immutable, frozen {@link DataboxRequestContext}. The result is frozen so a downstream layer cannot mutate
 * a bound claim before it is committed.
 */
export function bindActorFromContext(context: DataboxRequestContext): BoundActor {
  return Object.freeze({
    actor: context.actor ?? context.webId,
    webId: context.webId,
    representedEntity: context.representedEntity ?? context.delegation?.onBehalfOf,
    delegationGrantRef: context.delegation?.grantRef,
    clientId: context.clientId,
    issuer: context.issuer,
    audience: context.audience,
    assuranceGrade: context.assurance?.grade,
    assuranceDimensions: context.assurance?.dimensions,
    crosswalkVersion: context.assurance?.crosswalkVersion,
    authTime: context.authTime ?? context.assurance?.authTime,
  });
}

/**
 * The policy evaluation bound into an evidence record (ADR-0014; exchange-and-evidence.md §Audit — "policy
 * version and reason code" + "ODRL ... evaluated and its resulting state"). Binds a policy DIGEST, not only
 * a mutable version label (review #18).
 */
export interface PolicyEvaluation {
  /** The ODRL policy identifier that governs the class (ADR-0012). */
  readonly odrlPolicy: string;
  /** The policy version that governed the decision. */
  readonly policyVersion: string;
  /** The compiled-policy digest that governed the decision (review #18 — not a bare version string). */
  readonly policyDigest: string;
  /** The specific ODRL permission/prohibition/duty that was evaluated. */
  readonly odrlRule?: string;
  /** The resulting ODRL state of that rule (e.g. `activated`, `fulfilled`, `failed`). */
  readonly odrlState?: string;
  /** The evaluator version that applied the policy. */
  readonly evaluatorVersion?: string;
}

/** The consumer-visible lifecycle state of the record a decision concerns. */
export type EvidenceRecordState = 'current' | 'superseded' | 'disputed';

/**
 * The input to {@link buildAuditRecord}: every Audit-section fact EXCEPT the actor context (which is bound
 * from the verified {@link DataboxRequestContext}, not supplied by the caller).
 */
export interface AuditRecordInput {
  /** Event kind, e.g. `deposit-accepted`, `access-denied`, `duty-transition`. */
  readonly kind: string;
  /** The decision attested. */
  readonly decision: EvidenceDecision;
  /** Structured reason code (never free-text content). */
  readonly reasonCode: string;
  /** The operation, e.g. `read`, `write`, `deposit`, `supersession`, `tombstone`. */
  readonly operation: string;
  /** Digest or `opaque:` reference of the target — NEVER a raw path or payload (no-leak). */
  readonly targetDigest: string;
  /** Pre-operation digest, when applicable. */
  readonly priorDigest?: string;
  /** Post-operation digest, when applicable. */
  readonly postDigest?: string;
  /** The record grade/class token (structural). */
  readonly recordGrade?: string;
  /** The institutional principal/staff identifier — SUPPRESSED in the consumer audit projection. */
  readonly institutionalPrincipal?: string;
  /** The policy evaluation bound to the decision. */
  readonly policy: PolicyEvaluation;
  /** Digest of the issued acceptance receipt (DBX-18), when one was issued. */
  readonly receiptDigest?: string;
  /** Notification disposition outcome token (delivered/failed/suppressed), when applicable. */
  readonly notificationDisposition?: string;
  /** Governed disposition outcome token, when applicable. */
  readonly disposition?: string;
  /** The lifecycle state of the concerned record (defaults to `current` in the projection). */
  readonly recordState?: EvidenceRecordState;
}

/**
 * A fully bound evidence record: the {@link AuditRecordInput} plus the verified {@link BoundActor}. This is
 * exactly what the ledger commits. It contains only structured facts, digests and opaque references — never
 * protected content — so recording a DENIED or partial request never leaks payload or another box's facts.
 */
export interface AuditEvidenceRecord extends AuditRecordInput {
  /** The actor context bound from the verified C3 context (never from headers). */
  readonly actor: BoundActor;
}

/** The atomically-appended outbox record (IF-07): what C14 drains to deliver the notification hint. */
export interface OutboxRecord {
  /** Opaque committed-event id (monotonic within the tenant). */
  readonly eventId: string;
  /** Opaque tenant identifier — MUST equal the appending tenant (no cross-tenant outbox). */
  readonly tenantId: string;
  /** Opaque reference to the resource the event concerns (never a payload). */
  readonly resourceRef: string;
  /** The activity classifier (e.g. `Create`, `Update`). */
  readonly activity: string;
}

function assertDecision(decision: unknown): EvidenceDecision {
  if (decision !== 'allow' && decision !== 'deny' && decision !== 'partial') {
    throw new BadRequestHttpError(`Evidence decision must be one of allow/deny/partial.`);
  }
  return decision;
}

function assertPolicy(policy: PolicyEvaluation): void {
  if (typeof policy !== 'object' || policy === null) {
    throw new BadRequestHttpError(`Evidence field 'policy' must be a policy-evaluation object.`);
  }
  assertNonEmpty(policy.odrlPolicy, 'policy.odrlPolicy');
  assertNonEmpty(policy.policyVersion, 'policy.policyVersion');
  assertDigest(policy.policyDigest, 'policy.policyDigest');
}

/**
 * Build a bound {@link AuditEvidenceRecord} from structured inputs and the verified context. Validates and
 * fails closed so a malformed or leak-prone record never reaches the ledger: the decision must be a known
 * value; the target must be a digest/opaque reference (a raw path or content string is rejected); any bound
 * digest must be a `urn:sha256`; the policy binding must carry a digest. The actor is bound from the
 * verified context. The returned record is frozen.
 */
export function buildAuditRecord(input: AuditRecordInput, context: DataboxRequestContext): AuditEvidenceRecord {
  assertDecision(input.decision);
  assertNonEmpty(input.kind, 'kind');
  assertNonEmpty(input.reasonCode, 'reasonCode');
  assertNonEmpty(input.operation, 'operation');
  if (typeof input.targetDigest !== 'string' || !DIGEST_OR_OPAQUE.test(input.targetDigest)) {
    throw new BadRequestHttpError(
      `Evidence 'targetDigest' must be a urn:sha256 digest or opaque: reference, never a raw path/payload.`,
    );
  }
  assertOptionalDigest(input.priorDigest, 'priorDigest');
  assertOptionalDigest(input.postDigest, 'postDigest');
  assertOptionalDigest(input.receiptDigest, 'receiptDigest');
  assertPolicy(input.policy);
  return Object.freeze({ ...input, actor: bindActorFromContext(context) });
}
