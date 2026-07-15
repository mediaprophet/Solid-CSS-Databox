import type { KeyObject } from 'node:crypto';
import { BadRequestHttpError } from '../../util/errors/BadRequestHttpError';
import { decodeCompactJws, signCompactJws, verifyCompactJws } from '../credential/Es256';
import { canonicalDigest, normalizeSha256 } from '../proof/Canonicalization';
import type {
  CommittedSubmissionEvent,
  DispositionDecision,
  DispositionEnvelope,
  DispositionLinks,
  DispositionOutcomeKind,
  SignedDisposition,
} from './ReviewTypes';

/**
 * The signed disposition model (component C17, IF-13; ADR-0018 §append-only, ADR-0023 §Correction). A
 * reviewer/governed process records a reasoned disposition; this builds the canonical {@link
 * DispositionEnvelope} — copying the preserved submitter identity + exact-bytes payload digest verbatim from
 * the committed event (T-45) — and ES256-signs it with the hardened {@link signCompactJws} (no new crypto).
 *
 * The result is a NEW appended, linked artefact, never an in-place edit (ADR-0018): its `links` bind it to
 * the submission (and, for a superseding/associated/redirected outcome, to the governed target). Every
 * outcome kind has a REQUIRED reference; a decision missing it fails closed (a `corrected` outcome with no
 * superseding record, or a `no-change` with no appeal route, is inadmissible).
 */

const DISPOSITION_JWS_TYP = 'dbx-disposition+jws';
const SHA256_URN = /^urn:sha256:[0-9a-f]{64}$/u;
const UNSAFE_REASON_CHARS = /[^\w.:-]/gu;

/** Constrain a reason code to a safe, non-injectable token (never free-form protected content). */
function safeReasonCode(reasonCode: unknown): string {
  if (typeof reasonCode !== 'string' || reasonCode.length === 0) {
    throw new BadRequestHttpError('A disposition requires a non-empty structured reasonCode.');
  }
  return reasonCode.replaceAll(UNSAFE_REASON_CHARS, '_').slice(0, 64);
}

function requireRef(value: unknown, outcome: DispositionOutcomeKind, field: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new BadRequestHttpError(`A '${outcome}' disposition requires a non-empty ${field}.`);
  }
  return value;
}

/**
 * Resolve the outcome-specific links + optional envelope fields for a decision, failing closed on an
 * unknown outcome or a missing required reference. This is the single place the ADR-0023 outcome contract
 * is enforced.
 */
function resolveOutcome(
  decision: DispositionDecision,
  submissionRef: string,
): { links: DispositionLinks; appealRoute?: string; deadlineEffect?: string } {
  const base: DispositionLinks = { submissionRef };
  switch (decision.outcomeKind) {
    case 'corrected':
    case 'partially-corrected': {
      const supersedes = requireRef(decision.supersedingRecordRef, decision.outcomeKind, 'supersedingRecordRef');
      return { links: { ...base, supersedes }};
    }
    case 'statement-associated': {
      const ref = requireRef(decision.associatedStatementRef, 'statement-associated', 'associatedStatementRef');
      return { links: { ...base, associatedWith: ref }};
    }
    case 'redirected': {
      const redirectsTo = requireRef(decision.redirectTarget, 'redirected', 'redirectTarget');
      return { links: { ...base, redirectsTo }};
    }
    case 'no-change': {
      const appealRoute = requireRef(decision.appealRoute, 'no-change', 'appealRoute');
      return { links: base, appealRoute };
    }
    case 'more-information-required': {
      const deadlineEffect = requireRef(decision.deadlineEffect, 'more-information-required', 'deadlineEffect');
      return { links: base, deadlineEffect };
    }
    default:
      throw new BadRequestHttpError(`Unknown disposition outcome kind '${String(decision.outcomeKind)}'.`);
  }
}

/** The inputs to {@link buildSignedDisposition} that are not carried on the decision or the event. */
export interface DispositionSigningInput {
  /** The stable disposition identifier (used as the append-only store key). */
  readonly dispositionId: string;
  /** The disposing reviewer/governed-process id (bound into the envelope + as the acting party). */
  readonly reviewerId: string;
  /** ISO-8601 instant the disposition was decided. */
  readonly decidedAt: string;
  /** The ES256 (P-256) private signing key (reviewer/governed custody; test keys via node:crypto). */
  readonly signingKey: KeyObject;
  /** The verification-method (`kid`) of the signing key. */
  readonly verificationMethod: string;
}

/**
 * Build and ES256-sign a disposition for a committed submission event. The envelope copies the submitter
 * identity, payload digest and governing policy verbatim from `event` (preserved end to end), the outcome's
 * required reference is enforced, and the canonical envelope is signed. Fails closed on a mismatched
 * `decision.caseId`, a malformed payload digest, or a missing outcome reference.
 */
export function buildSignedDisposition(
  event: CommittedSubmissionEvent,
  caseId: string,
  decision: DispositionDecision,
  input: DispositionSigningInput,
): SignedDisposition {
  if (decision.caseId !== caseId) {
    throw new BadRequestHttpError('Disposition decision caseId does not match the case under review.');
  }
  if (typeof event.payloadDigest !== 'string' || !SHA256_URN.test(event.payloadDigest)) {
    throw new BadRequestHttpError('Committed submission payloadDigest must be a urn:sha256:<64 hex> digest.');
  }
  if (typeof input.dispositionId !== 'string' || input.dispositionId.length === 0) {
    throw new BadRequestHttpError('A disposition requires a non-empty dispositionId.');
  }
  const reasonCode = safeReasonCode(decision.reasonCode);
  const { links, appealRoute, deadlineEffect } = resolveOutcome(decision, event.submissionRef);

  const envelope: DispositionEnvelope = {
    dispositionId: input.dispositionId,
    caseId,
    submissionRef: event.submissionRef,
    submitter: event.submitter,
    payloadDigest: event.payloadDigest,
    outcomeKind: decision.outcomeKind,
    reasonCode,
    reviewerId: input.reviewerId,
    decidedAt: input.decidedAt,
    links,
    policy: event.policy,
    ...appealRoute === undefined ? {} : { appealRoute },
    ...deadlineEffect === undefined ? {} : { deadlineEffect },
  };

  const jws = signCompactJws(
    { alg: 'ES256', typ: DISPOSITION_JWS_TYP, kid: input.verificationMethod },
    envelope as unknown as Record<string, unknown>,
    input.signingKey,
  );
  return Object.freeze({ envelope: Object.freeze(envelope), jws, envelopeDigest: canonicalDigest(envelope) });
}

/**
 * Verify a signed disposition against `publicKey`: the ES256 signature must verify AND the recomputed
 * canonical digest of the signed envelope must equal the bound `envelopeDigest`. Fails closed (raises)
 * on a bad signature, a wrong `typ`, or a digest mismatch — a tampered disposition never verifies.
 */
export function verifyDisposition(signed: SignedDisposition, publicKey: KeyObject): DispositionEnvelope {
  const header = decodeCompactJws(signed.jws).header;
  if (header.typ !== DISPOSITION_JWS_TYP) {
    throw new BadRequestHttpError(`Unexpected disposition JWS typ; only ${DISPOSITION_JWS_TYP} is accepted.`);
  }
  const decoded = verifyCompactJws(signed.jws, publicKey);
  const digest = canonicalDigest(decoded.payload);
  if (normalizeSha256(digest) !== normalizeSha256(signed.envelopeDigest)) {
    throw new BadRequestHttpError('Disposition envelope digest does not match the signed payload (tampered).');
  }
  return decoded.payload as unknown as DispositionEnvelope;
}
