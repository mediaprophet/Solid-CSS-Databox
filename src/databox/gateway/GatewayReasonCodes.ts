import { BadRequestHttpError } from '../../util/errors/BadRequestHttpError';
import type { HttpError } from '../../util/errors/HttpError';
import { PayloadHttpError } from '../../util/errors/PayloadHttpError';
import { UnprocessableEntityHttpError } from '../../util/errors/UnprocessableEntityHttpError';
import { UnsupportedMediaTypeHttpError } from '../../util/errors/UnsupportedMediaTypeHttpError';

/**
 * Structured, non-leaking reason codes for the deposit/submission gateway (component C7, DBX-04 §2/§7.1
 * step "C7 gateway validate"; ADR-0016/0017/0022; DBX-15). These are the **content/shape/policy**
 * validation outcomes that run AFTER the composed authorizer (C4, DBX-14) has admitted the request and
 * BEFORE the append-only accept + durable C13 commit.
 *
 * They are a DISTINCT vocabulary from the authorization reason codes ({@link
 * ../authorization/AuthorizationReasonCodes}, `databox:*`): every gateway code carries the `gateway:`
 * segment (`databox:gateway:*`) so an auditor can tell a *policy/authorization* denial apart from a
 * *content-validation* rejection, and so the two vocabularies can never collide.
 *
 * Like the authz codes, a gateway code names ONLY the abstract check that failed — never resource
 * content, never whether another tenant/box/record exists, never a customer identifier (ADR-0016
 * §Failure behavior "deterministic, non-leaking"; DBX-03 T-23). The code is safe to write to the C13
 * evidence ledger and to return to the caller.
 */
export const DATABOX_GATEWAY_CODES = {
  /** A required gateway input was absent or structurally malformed — fail closed on the unrecognised. */
  missingInput: 'databox:gateway:missing-input',
  /** The target container is not the addressed relationship's `records/<class>/` or `submissions/<class>/`. */
  containerMismatch: 'databox:gateway:container-mismatch',
  /** The addressed relationship does not match the resolved tenant/box (misaddressed, T-23). */
  relationshipMismatch: 'databox:gateway:relationship-mismatch',
  /** The declared record/submission class is not a class declared in the program profile (wrong-class, T-23). */
  unknownClass: 'databox:gateway:unknown-class',
  /** The declared purpose is not permitted for the class (wrong-purpose, T-23). */
  purposeNotPermitted: 'databox:gateway:purpose-not-permitted',
  /** The declared legal basis is not the class's declared basis / does not resolve (T-23). */
  legalBasisMismatch: 'databox:gateway:legal-basis-mismatch',
  /** The policy reference does not resolve to the class's versioned template (ADR-0014). */
  policyRefUnresolved: 'databox:gateway:policy-ref-unresolved',
  /** The media type is not allowed for the class, or the declared type mismatches the class contract. */
  unsupportedMediaType: 'databox:gateway:unsupported-media-type',
  /** The payload exceeds the class/default size bound (oversized / zip-bomb, T-22). */
  payloadTooLarge: 'databox:gateway:payload-too-large',
  /** The RDF/JSON payload failed bounded shape validation (unparsable / expansion bomb, T-21). */
  malformedPayload: 'databox:gateway:malformed-payload',
  /** The payload references a remote / non-pinned `@context` or a remote import (T-21). */
  remoteContext: 'databox:gateway:remote-context',
  /** The institutional issuer is not a trusted signer for this program (deposit signature, ADR-0016). */
  issuerUntrusted: 'databox:gateway:issuer-untrusted',
  /** The institutional signature is absent, does not verify, or does not bind the payload digest. */
  signatureInvalid: 'databox:gateway:signature-invalid',
  /** The namespaced idempotency key is incomplete/malformed (ADR-0016 HD-12 tuple). */
  idempotencyMalformed: 'databox:gateway:idempotency-malformed',
  /** Binary evidence has not been released from quarantine; its bytes are withheld (ADR-0022). */
  quarantineWithheld: 'databox:gateway:quarantine-withheld',
} as const;

/** A machine-usable, audit-safe gateway rejection reason code. */
export type DataboxGatewayCode = typeof DATABOX_GATEWAY_CODES[keyof typeof DATABOX_GATEWAY_CODES];

/**
 * The HTTP status family each gateway code maps to. Deliberately coarse and deterministic so that a
 * *misaddressed / wrong-class / wrong-purpose* rejection all look identical on the wire (a plain `400`)
 * and cannot be used to probe which check a request tripped — only the size/media-type/shape families,
 * which reveal nothing about other tenants, get their standard specific status.
 */
const CODE_STATUS: Record<DataboxGatewayCode, number> = {
  [DATABOX_GATEWAY_CODES.missingInput]: 400,
  [DATABOX_GATEWAY_CODES.containerMismatch]: 400,
  [DATABOX_GATEWAY_CODES.relationshipMismatch]: 400,
  [DATABOX_GATEWAY_CODES.unknownClass]: 400,
  [DATABOX_GATEWAY_CODES.purposeNotPermitted]: 400,
  [DATABOX_GATEWAY_CODES.legalBasisMismatch]: 400,
  [DATABOX_GATEWAY_CODES.policyRefUnresolved]: 400,
  [DATABOX_GATEWAY_CODES.issuerUntrusted]: 400,
  [DATABOX_GATEWAY_CODES.signatureInvalid]: 400,
  [DATABOX_GATEWAY_CODES.idempotencyMalformed]: 400,
  [DATABOX_GATEWAY_CODES.quarantineWithheld]: 400,
  [DATABOX_GATEWAY_CODES.unsupportedMediaType]: 415,
  [DATABOX_GATEWAY_CODES.payloadTooLarge]: 413,
  [DATABOX_GATEWAY_CODES.malformedPayload]: 422,
  [DATABOX_GATEWAY_CODES.remoteContext]: 422,
};

/**
 * A deterministic, non-leaking gateway rejection. It is a value (not thrown by the validators) so the
 * gateway core stays total and testable; {@link toGatewayHttpError} converts it to the CSS HTTP error at
 * the request boundary. The `reason` is a short, abstract, content-free phrase safe for the C13 ledger.
 */
export interface GatewayRejection {
  readonly code: DataboxGatewayCode;
  readonly reason: string;
}

/** Build a {@link GatewayRejection}. The reason MUST NOT embed payload content or existence facts. */
export function gatewayRejection(code: DataboxGatewayCode, reason: string): GatewayRejection {
  return { code, reason };
}

/**
 * Map a {@link GatewayRejection} to a CSS {@link HttpError} for the response surface. The message is the
 * abstract reason code text only — never payload content — so the wire response leaks nothing (T-23).
 */
export function toGatewayHttpError(rejection: GatewayRejection): HttpError {
  const message = `Deposit/submission rejected (${rejection.code}).`;
  switch (CODE_STATUS[rejection.code]) {
    case 413:
      return new PayloadHttpError(message);
    case 415:
      return new UnsupportedMediaTypeHttpError(message);
    case 422:
      return new UnprocessableEntityHttpError(message);
    default:
      return new BadRequestHttpError(message);
  }
}
