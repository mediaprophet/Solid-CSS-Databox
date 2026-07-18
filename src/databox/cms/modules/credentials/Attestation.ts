import { BadRequestHttpError } from '../../../../util/errors/BadRequestHttpError';

// JSON-LD keywords as constants so they can be used as computed keys (the linter's naming
// convention forbids `@`-prefixed object-literal property names).
const LD_CONTEXT = '@context';
const LD_TYPE = '@type';
const LD_ID = '@id';

export interface AttestationInput {
  readonly id: string;
  readonly issuer: string;
  readonly subject: string;
  readonly claim: string;
  readonly expires: string;
}

function requireUri(value: string, field: string): string {
  try {
    return new URL(value).href;
  } catch {
    throw new BadRequestHttpError(`An attestation ${field} must be an absolute URI.`);
  }
}

/**
 * Build a minimal-disclosure attestation as an (unsigned) VC-shaped JSON-LD claim (see
 * `databox/solid-cms-plan.md`, §1.4 / §12). The point: a narrow claim ("holds valid WWCC",
 * "income sufficient") about a subject referenced by `@id` — the claim is a single short
 * string, never the underlying data it was derived from. Pure and deterministic (the
 * expiry is supplied by the caller — this function never reads the clock).
 */
export function buildAttestation(input: AttestationInput): Record<string, unknown> {
  const id = requireUri(input.id, 'id');
  const issuer = requireUri(input.issuer, 'issuer');
  const subject = requireUri(input.subject, 'subject');
  if (input.claim.trim().length === 0) {
    throw new BadRequestHttpError('An attestation needs a claim.');
  }
  if (input.expires.trim().length === 0) {
    throw new BadRequestHttpError('An attestation needs an expires value.');
  }

  return {
    [LD_CONTEXT]: [ 'https://www.w3.org/2018/credentials/v1' ],
    [LD_ID]: id,
    [LD_TYPE]: [ 'VerifiableCredential' ],
    issuer: { [LD_ID]: issuer },
    expirationDate: input.expires,
    credentialSubject: { [LD_ID]: subject, holds: input.claim },
  };
}
