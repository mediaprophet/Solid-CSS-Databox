import { decodeCompactJws, verifyCompactJws } from '../credential/Es256';
import { isProfileSupported } from '../odrl/TermSupport';
import type { IssuerTrustStore } from '../proof/IssuerTrustStore';
import type { CompiledPolicyBundle } from './PolicyBundle';
import { EVALUATOR_VERSION, isBundleSubstituted } from './PolicyBundle';

/**
 * Compiled-policy bundle admission (component C12, IF-19; ADR-0015 §Failure behavior — "Fail closed, hard").
 *
 * A bundle enters the runtime ONLY through {@link admitBundle}, which verifies, in order and totally:
 * a well-formed signed envelope; a signature from a TRUSTED program key (resolved from the
 * {@link IssuerTrustStore}, never from the token header — reusing the hardened
 * {@link verifyCompactJws}); the synthetic-fixture label; the supported profile; a PRESENT `attested`
 * attestation (a `proposed`/absent one is NOT admitted); every required digest binding present; the exact
 * evaluator version; and finally the content-digest match that makes substitution detectable (T-25).
 *
 * It NEVER interprets law (ADR-0015): it reads only `attestation.status` and the digest/version bindings.
 * Any failure yields a specific reason for the audit ledger and `admitted: false` — there is no
 * best-effort/default-admit path.
 */

/** Why a bundle-admission decision resolved the way it did (audit reason code). */
export type AdmissionReason =
  | 'admitted' |
  'malformed-bundle' |
  'bad-signature' |
  'not-synthetic' |
  'unsupported-profile' |
  'unattested' |
  'proposed' |
  'missing-digest' |
  'incompatible-evaluator' |
  'failed-digest';

/** The outcome of an {@link admitBundle} call; `bundle` is present only when `admitted` is true. */
export interface AdmissionResult {
  /** True only when every admission check passed. */
  readonly admitted: boolean;
  /** The specific reason; `admitted` iff this is `admitted`. */
  readonly reason: AdmissionReason;
  /** The admitted bundle (frozen), present only on success. */
  readonly bundle?: CompiledPolicyBundle;
}

const SHA256_URN = /^urn:sha256:[0-9a-f]{64}$/u;

/** A digest binding is present iff it is a well-formed `urn:sha256` value. */
function hasDigest(value: unknown): boolean {
  return typeof value === 'string' && SHA256_URN.test(value);
}

/**
 * Validate the already-signature-verified bundle body. Returns the first failing reason, or `admitted`.
 * Order is deliberate and each branch is reachable: synthetic → profile → attestation presence → attestation
 * status → digest presence → evaluator version → content-digest (substitution).
 */
function validateBody(bundle: CompiledPolicyBundle): AdmissionReason {
  if ((bundle.syntheticFixture as unknown) !== true) {
    return 'not-synthetic';
  }
  if (!isProfileSupported(bundle.profile)) {
    return 'unsupported-profile';
  }
  if (typeof bundle.attestation !== 'object' || bundle.attestation === null) {
    return 'unattested';
  }
  if (bundle.attestation.status !== 'attested') {
    return 'proposed';
  }
  if (!hasDigest(bundle.compiledPolicyDigest) ||
    !hasDigest(bundle.corpusManifestDigest) ||
    !hasDigest(bundle.profileDigest)) {
    return 'missing-digest';
  }
  if (bundle.evaluatorVersion !== EVALUATOR_VERSION) {
    return 'incompatible-evaluator';
  }
  // MED-1: the digest computation dereferences effectiveInterval / spreads affectedAssetClasses / maps rules,
  // so a signature-valid but STRUCTURALLY-MALFORMED body (missing/non-object interval, non-array classes or
  // rules) would throw. Keep admitBundle TOTAL — a throw here fails closed as `malformed-bundle`, never an
  // uncaught error out of the admission contract.
  let substituted: boolean;
  try {
    substituted = isBundleSubstituted(bundle);
  } catch {
    return 'malformed-bundle';
  }
  // Substitution: the bound digest must equal the recomputed content digest (T-25). Checked LAST so a
  // tampered rule set on an otherwise well-formed, correctly-signed envelope is still rejected.
  if (substituted) {
    return 'failed-digest';
  }
  return 'admitted';
}

/**
 * Deep-freeze the admitted bundle (LOW-1). `Object.freeze` alone is shallow, so `bundle.rules`, each rule and
 * `bundle.effectiveInterval` would stay mutable and `PolicyRegistry.versionsFor` would hand out mutable refs.
 * Freezing the whole graph makes the immutable-version guarantee (ADR-0014) hold structurally.
 */
function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    for (const nested of Object.values(value)) {
      deepFreeze(nested);
    }
    Object.freeze(value);
  }
  return value;
}

/**
 * Admit a signed compiled-policy bundle presented as a compact JWS whose payload is the
 * {@link CompiledPolicyBundle}. Fails closed with a specific reason on every failure. The signing key is
 * resolved from the trusted program key set at the bundle's `issuedAt` (key-history aware, T-20); the
 * header-declared key is never trusted on its own.
 */
export function admitBundle(signedBundleJws: string, trust: IssuerTrustStore): AdmissionResult {
  let bundle: CompiledPolicyBundle;
  try {
    const decoded = decodeCompactJws(signedBundleJws);
    bundle = decoded.payload as unknown as CompiledPolicyBundle;
    if (typeof bundle.issuer !== 'string' || typeof bundle.issuedAt !== 'string' ||
      typeof decoded.header.kid !== 'string') {
      return { admitted: false, reason: 'malformed-bundle' };
    }
    const issuanceTime = Date.parse(bundle.issuedAt);
    if (Number.isNaN(issuanceTime)) {
      return { admitted: false, reason: 'malformed-bundle' };
    }
    // Resolve the TRUSTED key (fail closed on an untrusted/revoked/out-of-window key) and verify — an
    // alg-swap or a bad signature raises inside verifyCompactJws and is caught below.
    const key = trust.resolve(bundle.issuer, decoded.header.kid, issuanceTime);
    verifyCompactJws(signedBundleJws, key);
  } catch {
    return { admitted: false, reason: 'bad-signature' };
  }
  const reason = validateBody(bundle);
  if (reason !== 'admitted') {
    return { admitted: false, reason };
  }
  return { admitted: true, reason, bundle: deepFreeze(bundle) };
}
