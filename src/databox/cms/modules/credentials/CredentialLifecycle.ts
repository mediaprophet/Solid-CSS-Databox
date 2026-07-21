import { BadRequestHttpError } from '../../../../util/errors/BadRequestHttpError';
import { buildAttestation } from './Attestation';
import type { AttestationInput } from './Attestation';

const LD_CONTEXT = '@context';
const LD_TYPE = '@type';
const LD_ID = '@id';

export interface CredentialIssuanceInput extends AttestationInput {
  readonly issuerKey?: string;
  readonly issuanceDate?: string;
}

export interface CredentialVerificationInput {
  readonly credential: Record<string, unknown>;
  readonly expectedIssuer?: string;
  readonly now: string;
}

export interface CredentialRevocationInput {
  readonly id: string;
  readonly revokedBy: string;
  readonly revokedAt: string;
  readonly reason: string;
}

export interface CredentialVerificationResult {
  readonly valid: boolean;
  readonly errors: string[];
}

/**
 * Issue a verifiable credential — builds the VC shape from the attestation input
 * and adds issuance metadata. In production, this would sign the credential with
 * the issuer's private key (Ed25519 / ES256); here we produce the unsigned envelope
 * with the proof placeholder.
 */
export function issueCredential(input: CredentialIssuanceInput): Record<string, unknown> {
  const vc = buildAttestation(input);
  const issuanceDate = input.issuanceDate ?? new Date().toISOString();

  return {
    ...vc,
    issuanceDate,
    proof: {
      [LD_TYPE]: 'DataIntegrityProof',
      cryptosuite: 'eddsa-2022',
      verificationMethod: input.issuer
        ? `${input.issuer}#key-1`
        : 'urn:placeholder:verification-method',
      proofPurpose: 'assertionMethod',
      proofValue: 'urn:placeholder:signed-in-production',
    },
  };
}

/**
 * Verify a credential's structural integrity, expiry, and optional issuer binding.
 * Does not verify the cryptographic proof — that requires the issuer's public key.
 */
export function verifyCredential(input: CredentialVerificationInput): CredentialVerificationResult {
  const errors: string[] = [];
  const vc = input.credential;

  if (!isRecord(vc)) {
    return { valid: false, errors: [ 'Credential must be a JSON object.' ] };
  }

  if (!Array.isArray(vc[LD_TYPE]) || !(vc[LD_TYPE] as unknown[]).includes('VerifiableCredential')) {
    errors.push('Credential @type must include "VerifiableCredential".');
  }

  const issuer = vc.issuer;
  if (!isRecord(issuer) || typeof issuer[LD_ID] !== 'string') {
    errors.push('Credential issuer must have an @id URI.');
  } else if (input.expectedIssuer && issuer[LD_ID] !== input.expectedIssuer) {
    errors.push(`Issuer mismatch: expected ${input.expectedIssuer}, got ${issuer[LD_ID]}.`);
  }

  const expirationDate = vc.expirationDate;
  if (typeof expirationDate === 'string') {
    const expiry = new Date(expirationDate);
    const now = new Date(input.now);
    if (Number.isNaN(expiry.getTime())) {
      errors.push('Credential expirationDate is not a valid date.');
    } else if (expiry < now) {
      errors.push(`Credential expired at ${expirationDate}.`);
    }
  } else {
    errors.push('Credential must have an expirationDate.');
  }

  const subject = vc.credentialSubject;
  if (!isRecord(subject) || typeof subject[LD_ID] !== 'string') {
    errors.push('Credential credentialSubject must have an @id URI.');
  }

  if (!isRecord(vc.proof) || typeof vc.proof[LD_TYPE] !== 'string') {
    errors.push('Credential proof is missing or malformed.');
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Build a revocation status entry — a W3C CCF-style revocation record
 * stored as a Solid resource that verifiers can check.
 */
export function revokeCredential(input: CredentialRevocationInput): Record<string, unknown> {
  try {
    new URL(input.id);
  } catch {
    throw new BadRequestHttpError('A revocation id must be an absolute URI.');
  }
  try {
    new URL(input.revokedBy);
  } catch {
    throw new BadRequestHttpError('A revocation revokedBy must be an absolute URI.');
  }
  if (input.reason.trim().length === 0) {
    throw new BadRequestHttpError('A revocation reason must not be empty.');
  }

  return {
    [LD_CONTEXT]: [ 'https://www.w3.org/2018/credentials/v1' ],
    [LD_ID]: `${input.id}#revocation`,
    [LD_TYPE]: 'RevocationStatus',
    credential: { [LD_ID]: input.id },
    revokedBy: { [LD_ID]: input.revokedBy },
    revokedAt: input.revokedAt,
    reason: input.reason,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
