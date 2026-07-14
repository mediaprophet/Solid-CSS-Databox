import { ensureTrailingSlash } from '../../util/PathUtil';
import { keyObjectFromPublicJwk, sha256Hex, verifyCompactJws } from '../credential/Es256';
import type { InstitutionProfile, RecordClass, SubmissionClass } from '../profile/InstitutionProfile';
import type { TenantContext } from '../tenant/TenantContext';
import type { BinaryEvidenceQuarantine } from './BinaryEvidenceQuarantine';
import { DATABOX_GATEWAY_CODES, gatewayRejection } from './GatewayReasonCodes';
import type { GatewayRejection } from './GatewayReasonCodes';
import type { IdempotencyRegistry } from './IdempotencyRegistry';
import { isRdfMediaType, validateRdfShape } from './RdfShapeValidator';
import type { RdfShapeConfig } from './RdfShapeValidator';
import type {
  DepositRequest,
  GatewayAcceptance,
  GatewayOutcome,
  GatewayRequest,
  InstitutionalSignatureClaim,
  PolicyRefClaim,
  SubmissionRequest,
  TrustedIssuerKey,
} from './GatewayTypes';

// Re-export the gateway plane so a SINGLE barrel line — `export * from './gateway/DepositSubmissionGateway'`
// (to be added to src/databox/index.ts by whoever wires C7; see databox/handoffs/DBX-15.md §barrel) —
// transitively re-exports every DBX-15 symbol, mirroring the DBX-11/DBX-14 sibling re-export pattern.
export * from './GatewayReasonCodes';
export * from './GatewayTypes';
export * from './RdfShapeValidator';
export * from './BinaryEvidenceQuarantine';
export * from './IdempotencyRegistry';

/**
 * Size + media-type bound for a class of payload (ADR-0022 §1 "each program profile declares a maximum
 * size and an allowed media-type set per record class"). The DBX-06 profile does not yet carry per-class
 * media bounds (ADR-0022 §Open sub-questions leaves them to DBX-15), so the gateway takes them here.
 */
export interface MediaBounds {
  readonly maxBytes: number;
  readonly allowedMediaTypes: readonly string[];
}

/** The gateway's bounds: a default {@link MediaBounds}, optional per-class overrides, and RDF limits. */
export interface GatewayBounds {
  readonly default: MediaBounds;
  /** Per-class media bounds keyed by record/submission class id; falls back to {@link default}. */
  readonly perClass?: Record<string, MediaBounds>;
  /** Pinned-context + resource budget for the bounded RDF/JSON shape validator (T-21). */
  readonly rdf: RdfShapeConfig;
}

/**
 * The per-request context the gateway validates against: the validated program profile, the resolved
 * (immutable) tenant, the size/media/shape bounds and the trusted institutional signer keys. None of
 * these come from the request body; they are resolved by C5/C10/C11 upstream.
 */
export interface GatewayContext {
  readonly profile: InstitutionProfile;
  readonly tenant: TenantContext;
  readonly bounds: GatewayBounds;
  readonly issuerKeys: readonly TrustedIssuerKey[];
}

/**
 * The deposit/submission protocol gateway (component C7, DBX-04 §7.1/§7.2; ADR-0016/0017/0022; DBX-15).
 *
 * It runs AFTER the composed authorizer (C4/DBX-14) admits a request and BEFORE the append-only accept +
 * durable C13 commit (§7.0). It validates a deposit/submission's **content, shape and policy binding**
 * and produces a deterministic {@link GatewayOutcome}: `accepted`, `quarantined` (binary evidence),
 * `duplicate` (idempotent replay → original outcome) or `rejected` (a non-leaking reason code).
 *
 * Invariants held here:
 * - **Deterministic, non-leaking (T-23):** every rejection is a {@link GatewayRejection} naming only the
 *   failed check — never resource content, never whether another tenant/box/record exists.
 * - **Bytes are never transformed:** the exact `body` is digested and (for binary) quarantined as-is; the
 *   gateway validates, it does not rewrite.
 * - **Duplicate → original outcome (T-24):** a repeated namespaced idempotency tuple returns the first
 *   acceptance, never a second record.
 * - **Fail closed:** an unrecognised/absent input rejects rather than defaulting to accept.
 */
export class DepositSubmissionGateway {
  private readonly idempotency: IdempotencyRegistry;
  private readonly quarantine: BinaryEvidenceQuarantine;

  public constructor(idempotency: IdempotencyRegistry, quarantine: BinaryEvidenceQuarantine) {
    this.idempotency = idempotency;
    this.quarantine = quarantine;
  }

  /** Validate a deposit or a submission, dispatching on the operation discriminant. */
  public async validate(request: GatewayRequest, context: GatewayContext): Promise<GatewayOutcome> {
    if (request.operation === 'deposit') {
      return this.validateDeposit(request, context);
    }
    return this.validateSubmission(request, context);
  }

  /** Validate an institutional deposit (org → consumer) against its record class. */
  public async validateDeposit(request: DepositRequest, context: GatewayContext): Promise<GatewayOutcome> {
    const { profile, tenant, bounds, issuerKeys } = context;

    // 1. Namespaced idempotency key: well-formed → derive; malformed → fail closed.
    let key: string;
    try {
      key = this.idempotency.keyFor(request.idempotency);
    } catch {
      return reject(DATABOX_GATEWAY_CODES.idempotencyMalformed, 'Namespaced idempotency tuple is incomplete.');
    }
    // 2. Duplicate replay → the ORIGINAL outcome, never a second record (T-24).
    const original = this.idempotency.lookup(key);
    if (original) {
      return { status: 'duplicate', acceptance: original };
    }

    // 3. Addressed relationship must equal the resolved tenant's relationship (misaddressed, T-23).
    if (request.addressedRelationshipId !== tenant.relationshipId) {
      return reject(DATABOX_GATEWAY_CODES.relationshipMismatch, 'Addressed relationship does not match tenant.');
    }
    // 4. Record class must be declared in the profile (wrong-class, T-23).
    const recordClass = profile.recordClasses.find((rc): boolean => rc.id === request.recordClass);
    if (!recordClass) {
      return reject(DATABOX_GATEWAY_CODES.unknownClass, 'Record class is not declared in the profile.');
    }
    // 5. Target container must be the addressed box's records/<class>/ container.
    if (!isExpectedContainer(request.target, tenant.boxRoot, 'records', recordClass.id)) {
      return reject(DATABOX_GATEWAY_CODES.containerMismatch, 'Target is not the class records container.');
    }
    // 6. Declared purpose must be permitted for the class (wrong-purpose, T-23).
    if (!recordClass.purposes.includes(request.purpose)) {
      return reject(DATABOX_GATEWAY_CODES.purposeNotPermitted, 'Purpose is not permitted for the class.');
    }
    // 7. Legal basis must be the class's declared basis and resolve in the profile.
    if (request.legalBasis !== recordClass.legalBasis ||
      !profile.legalBases.some((lb): boolean => lb.id === request.legalBasis)) {
      return reject(DATABOX_GATEWAY_CODES.legalBasisMismatch, 'Legal basis is not the class basis.');
    }
    // 8. Policy reference must resolve to the class's versioned template (ADR-0014).
    const policyRejection = checkPolicyRef(request.policyRef, recordClass, profile);
    if (policyRejection) {
      return { status: 'rejected', rejection: policyRejection };
    }
    // 9. Media type + size bounds (T-22).
    const boundRejection = checkMediaAndSize(request.mediaType, request.body, bounds, recordClass.id);
    if (boundRejection) {
      return { status: 'rejected', rejection: boundRejection };
    }
    // 10. Institutional signature: trusted issuer + verifies + binds the payload digest (ADR-0016).
    const signatureRejection = verifySignature(request.signature, request.body, issuerKeys);
    if (signatureRejection) {
      return { status: 'rejected', rejection: signatureRejection };
    }

    const acceptance = this.buildAcceptance('records', recordClass.id, tenant, request.policyRef, request.body, key);

    // 11. RDF/JSON → bounded shape validation then accept; binary → quarantine (bytes not servable, T-22).
    if (isRdfMediaType(request.mediaType)) {
      const shapeRejection = validateRdfShape(request.body, request.mediaType, bounds.rdf);
      if (shapeRejection) {
        return { status: 'rejected', rejection: shapeRejection };
      }
      this.idempotency.remember(key, acceptance);
      return { status: 'accepted', acceptance };
    }
    const record = this.quarantine.accept(request.body, request.mediaType);
    const quarantined: GatewayAcceptance = { ...acceptance, quarantineId: record.id };
    this.idempotency.remember(key, quarantined);
    return { status: 'quarantined', acceptance: quarantined };
  }

  /** Validate a consumer submission (consumer → org) against its submission class. */
  public async validateSubmission(request: SubmissionRequest, context: GatewayContext): Promise<GatewayOutcome> {
    const { profile, tenant, bounds } = context;

    // Optional namespaced idempotency (a submission is not a source-outbox event); dedupe when present.
    let key: string | undefined;
    if (request.idempotency) {
      try {
        key = this.idempotency.keyFor(request.idempotency);
      } catch {
        return reject(DATABOX_GATEWAY_CODES.idempotencyMalformed, 'Namespaced idempotency tuple is incomplete.');
      }
      const original = this.idempotency.lookup(key);
      if (original) {
        return { status: 'duplicate', acceptance: original };
      }
    }

    if (request.addressedRelationshipId !== tenant.relationshipId) {
      return reject(DATABOX_GATEWAY_CODES.relationshipMismatch, 'Addressed relationship does not match tenant.');
    }
    const submissionClass = profile.submissionClasses.find((sc): boolean => sc.id === request.submissionClass);
    if (!submissionClass) {
      return reject(DATABOX_GATEWAY_CODES.unknownClass, 'Submission class is not declared in the profile.');
    }
    if (!isExpectedContainer(request.target, tenant.boxRoot, 'submissions', submissionClass.id)) {
      return reject(DATABOX_GATEWAY_CODES.containerMismatch, 'Target is not the class submissions container.');
    }
    if (!submissionClass.purposes.includes(request.purpose)) {
      return reject(DATABOX_GATEWAY_CODES.purposeNotPermitted, 'Purpose is not permitted for the class.');
    }
    const policyRejection = checkPolicyRef(request.policyRef, submissionClass, profile);
    if (policyRejection) {
      return { status: 'rejected', rejection: policyRejection };
    }
    const boundRejection = checkMediaAndSize(request.mediaType, request.body, bounds, submissionClass.id);
    if (boundRejection) {
      return { status: 'rejected', rejection: boundRejection };
    }

    const acceptance = this.buildAcceptance(
      'submissions',
      submissionClass.id,
      tenant,
      request.policyRef,
      request.body,
      key,
    );

    if (isRdfMediaType(request.mediaType)) {
      const shapeRejection = validateRdfShape(request.body, request.mediaType, bounds.rdf);
      if (shapeRejection) {
        return { status: 'rejected', rejection: shapeRejection };
      }
      if (key !== undefined) {
        this.idempotency.remember(key, acceptance);
      }
      return { status: 'accepted', acceptance };
    }
    const record = this.quarantine.accept(request.body, request.mediaType);
    const quarantined: GatewayAcceptance = { ...acceptance, quarantineId: record.id };
    if (key !== undefined) {
      this.idempotency.remember(key, quarantined);
    }
    return { status: 'quarantined', acceptance: quarantined };
  }

  /** Build the validated acceptance facts (digest of exact bytes; resolved policy ref). */
  private buildAcceptance(
    container: 'records' | 'submissions',
    classId: string,
    tenant: TenantContext,
    policyRef: PolicyRefClaim,
    body: Buffer,
    key: string | undefined,
  ): GatewayAcceptance {
    return {
      container,
      classId,
      relationshipId: tenant.relationshipId,
      payloadDigest: sha256Hex(body),
      policyRef,
      idempotencyKey: key,
    };
  }
}

/** Shorthand for a rejected outcome. */
function reject(code: GatewayRejection['code'], reason: string): GatewayOutcome {
  return { status: 'rejected', rejection: gatewayRejection(code, reason) };
}

/** Whether `target` is exactly the addressed box's `<kind>/<class>/` container. */
function isExpectedContainer(
  target: string,
  boxRoot: string,
  kind: 'records' | 'submissions',
  classId: string,
): boolean {
  const expected = `${ensureTrailingSlash(boxRoot)}${kind}/${encodeURIComponent(classId)}/`;
  return ensureTrailingSlash(target) === expected;
}

/** Resolve the policy reference against the class's template + version in the validated profile. */
function checkPolicyRef(
  policyRef: PolicyRefClaim,
  klass: RecordClass | SubmissionClass,
  profile: InstitutionProfile,
): GatewayRejection | undefined {
  if (policyRef.policyTemplate !== klass.policyTemplate) {
    return gatewayRejection(DATABOX_GATEWAY_CODES.policyRefUnresolved, 'Policy template is not the class template.');
  }
  const template = profile.policies.templates.find((pt): boolean => pt.id === klass.policyTemplate);
  if (!template || template.version !== policyRef.policyVersion) {
    return gatewayRejection(DATABOX_GATEWAY_CODES.policyRefUnresolved, 'Policy version does not resolve.');
  }
  return undefined;
}

/** Enforce the media-type allow-list and the size bound for a class (T-22). */
function checkMediaAndSize(
  mediaType: string,
  body: Buffer,
  bounds: GatewayBounds,
  classId: string,
): GatewayRejection | undefined {
  const media = bounds.perClass?.[classId] ?? bounds.default;
  if (!media.allowedMediaTypes.includes(mediaType)) {
    return gatewayRejection(DATABOX_GATEWAY_CODES.unsupportedMediaType, 'Media type is not allowed for the class.');
  }
  if (body.length > media.maxBytes) {
    return gatewayRejection(DATABOX_GATEWAY_CODES.payloadTooLarge, 'Payload exceeds the size bound.');
  }
  return undefined;
}

/**
 * Verify the institutional deposit signature: the issuer must be a trusted signer, the compact ES256 JWS
 * must verify (reusing {@link ../credential/Es256}), and its payload MUST bind the SHA-256 of the exact
 * body (a signature over other bytes does not authenticate THIS payload). Fails closed to a non-leaking
 * code on every branch.
 */
function verifySignature(
  signature: InstitutionalSignatureClaim,
  body: Buffer,
  issuerKeys: readonly TrustedIssuerKey[],
): GatewayRejection | undefined {
  const trusted = issuerKeys.find((entry): boolean => entry.issuer === signature.issuer);
  if (!trusted) {
    return gatewayRejection(DATABOX_GATEWAY_CODES.issuerUntrusted, 'Issuer is not a trusted signer.');
  }
  let boundDigest: unknown;
  try {
    const key = keyObjectFromPublicJwk(trusted.publicKey);
    const decoded = verifyCompactJws(signature.jws, key);
    boundDigest = decoded.payload.payloadDigest;
  } catch {
    return gatewayRejection(DATABOX_GATEWAY_CODES.signatureInvalid, 'Signature does not verify.');
  }
  const expected = sha256Hex(body);
  if (typeof boundDigest !== 'string' || normalizeDigest(boundDigest) !== expected) {
    return gatewayRejection(DATABOX_GATEWAY_CODES.signatureInvalid, 'Signature does not bind the payload digest.');
  }
  return undefined;
}

/** Normalise a bound digest to bare lowercase hex (accepts a `urn:sha256:` prefix, per the record envelope). */
function normalizeDigest(digest: string): string {
  return digest.replace(/^urn:sha256:/u, '').toLowerCase();
}
