import type { KeyObject } from 'node:crypto';
import { BadRequestHttpError } from '../../util/errors/BadRequestHttpError';
import type { DataboxConnectionCredential, PublicJwk } from './ConnectionCredentialTypes';
import {
  CONNECTION_CREDENTIAL_JWS_TYP,
  DATABOX_CONNECTION_CREDENTIAL_TYPE,
  FORBIDDEN_CREDENTIAL_KEYS,
  VERIFIABLE_CREDENTIAL_TYPE,
} from './ConnectionCredentialTypes';
import { decodeCompactJws, jwkThumbprint, verifyCompactJws } from './Es256';

/**
 * The connection-credential validator (the verifying counterpart to {@link ConnectionCredentialIssuer},
 * ADR-0007). It is what a vault runs on install (step 6 of the installation ceremony) and what the token
 * exchange runs on every request. It establishes, fail-closed and in order:
 *
 * 1. **Authenticity** — the JWS verifies against a *trusted* issuer key (an unknown issuer is rejected,
 *    never trusted-on-first-use).
 * 2. **Shape** — VC 2.0 type + `DataboxConnectionCredential`, a holder binding whose embedded thumbprint
 *    actually matches its embedded JWK (no swapped-key credential).
 * 3. **Not-a-bearer-token** — a recursive scan rejects any forbidden key (access/refresh token, global
 *    customer id, private key material) anywhere in the document (T-18).
 * 4. **Validity** — `now` must be within `[validFrom, validUntil)`, else expired → reject.
 * 5. **Binding to the addressed realm** — the caller's expected program / databox / access-grant digest /
 *    relationship must match, so a credential minted for program A cannot be replayed against program B
 *    (T-08).
 */

/** Expectations the addressed realm asserts; any mismatch is a fail-closed rejection (T-08). */
export interface CredentialExpectations {
  readonly program?: string;
  readonly databox?: string;
  readonly accessGrantDigest?: string;
  readonly relationship?: string;
  /** Current instant (epoch ms), injectable for tests; defaults to `Date.now()`. */
  readonly now?: number;
}

/** The result of a successful validation: the parsed credential plus the bound holder key. */
export interface ValidatedConnectionCredential {
  readonly credential: DataboxConnectionCredential;
  readonly holderPublicJwk: PublicJwk;
  readonly holderThumbprint: string;
}

/**
 * Recursively assert no {@link FORBIDDEN_CREDENTIAL_KEYS} appears anywhere in the credential (T-18, R-04).
 * Object keys are compared case-insensitively; this is the structural "not a bearer token / no global id"
 * property made checkable.
 */
export function assertNoForbiddenKeys(value: unknown): void {
  if (Array.isArray(value)) {
    for (const item of value) {
      assertNoForbiddenKeys(item);
    }
    return;
  }
  if (value !== null && typeof value === 'object') {
    for (const [ key, nested ] of Object.entries(value as Record<string, unknown>)) {
      if (FORBIDDEN_CREDENTIAL_KEYS.includes(key.toLowerCase())) {
        throw new BadRequestHttpError(`Forbidden key '${key}' in connection credential (not a bearer token, T-18).`);
      }
      assertNoForbiddenKeys(nested);
    }
  }
}

export class ConnectionCredentialValidator {
  private readonly issuerKeys: ReadonlyMap<string, KeyObject>;

  /**
   * @param trustedIssuerKeys - The trusted issuer verification keys, keyed by issuer identifier. A
   *   credential whose `issuer` is not in this map is rejected (ADR-0005: never trust an unknown issuer).
   */
  public constructor(trustedIssuerKeys: ReadonlyMap<string, KeyObject>) {
    this.issuerKeys = trustedIssuerKeys;
  }

  /** Validate a compact-JWS connection credential against `expectations`, returning the bound holder key. */
  public validate(jws: string, expectations: CredentialExpectations = {}): ValidatedConnectionCredential {
    // Read the (unverified) header/payload only to resolve which trusted issuer key to verify against.
    const preview = decodeCompactJws(jws);
    if (preview.header.typ !== CONNECTION_CREDENTIAL_JWS_TYP) {
      throw new BadRequestHttpError(`Unexpected JWS typ; expected ${CONNECTION_CREDENTIAL_JWS_TYP}.`);
    }
    const issuer = preview.payload.issuer;
    if (typeof issuer !== 'string') {
      throw new BadRequestHttpError('Connection credential is missing an issuer.');
    }
    const issuerKey = this.issuerKeys.get(issuer);
    if (!issuerKey) {
      throw new BadRequestHttpError(`Connection credential issuer is not trusted: ${issuer}.`);
    }

    // Authenticity — this throws if the signature does not verify against the trusted issuer key.
    const verified = verifyCompactJws(jws, issuerKey);
    const credential = verified.payload as unknown as DataboxConnectionCredential;

    this.assertShape(credential);
    assertNoForbiddenKeys(credential);
    const holder = this.assertHolderBinding(credential);
    this.assertValidity(credential, expectations.now ?? Date.now());
    this.assertBoundRealm(credential, expectations);

    return { credential, holderPublicJwk: holder.publicKeyJwk, holderThumbprint: holder.thumbprint };
  }

  private assertShape(credential: DataboxConnectionCredential): void {
    if (!Array.isArray(credential.type) ||
      !credential.type.includes(VERIFIABLE_CREDENTIAL_TYPE) ||
      !credential.type.includes(DATABOX_CONNECTION_CREDENTIAL_TYPE)) {
      throw new BadRequestHttpError('Credential is not a VerifiableCredential + DataboxConnectionCredential.');
    }
    if (typeof credential.validFrom !== 'string' || typeof credential.validUntil !== 'string') {
      throw new BadRequestHttpError('Connection credential is missing validFrom/validUntil.');
    }
    if (typeof credential.credentialSubject !== 'object' || credential.credentialSubject === null) {
      throw new BadRequestHttpError('Connection credential is missing a credentialSubject.');
    }
  }

  private assertHolderBinding(
    credential: DataboxConnectionCredential,
  ): { publicKeyJwk: PublicJwk; thumbprint: string } {
    const holder = credential.credentialSubject.holder;
    if (typeof holder !== 'object' || holder === null ||
      typeof holder.publicKeyJwk !== 'object' || holder.publicKeyJwk === null) {
      throw new BadRequestHttpError('Connection credential is missing a holder-key binding.');
    }
    // Integrity: the embedded thumbprint MUST be the real thumbprint of the embedded JWK. A mismatch means
    // the credential was tampered to swap the holder key (defence in depth on top of the issuer signature).
    const recomputed = jwkThumbprint(holder.publicKeyJwk);
    if (holder.thumbprint !== recomputed) {
      throw new BadRequestHttpError('Holder-key thumbprint does not match the embedded holder JWK.');
    }
    return { publicKeyJwk: holder.publicKeyJwk, thumbprint: recomputed };
  }

  private assertValidity(credential: DataboxConnectionCredential, now: number): void {
    const from = Date.parse(credential.validFrom);
    const until = Date.parse(credential.validUntil);
    if (Number.isNaN(from) || Number.isNaN(until)) {
      throw new BadRequestHttpError('Connection credential has an unparseable validity window.');
    }
    if (now < from) {
      throw new BadRequestHttpError('Connection credential is not yet valid.');
    }
    if (now >= until) {
      throw new BadRequestHttpError('Connection credential has expired.');
    }
  }

  private assertBoundRealm(credential: DataboxConnectionCredential, expectations: CredentialExpectations): void {
    const connection = credential.credentialSubject.connection;
    if (typeof connection !== 'object' || connection === null) {
      throw new BadRequestHttpError('Connection credential is missing a connection binding.');
    }
    const checks: [ string | undefined, unknown, string ][] = [
      [ expectations.program, connection.program, 'program' ],
      [ expectations.databox, connection.databox, 'databox' ],
      [ expectations.accessGrantDigest, connection.accessGrantDigest, 'accessGrantDigest' ],
      [ expectations.relationship, connection.relationship, 'relationship' ],
    ];
    for (const [ expected, actual, field ] of checks) {
      if (expected !== undefined && expected !== actual) {
        throw new BadRequestHttpError(
          `Connection credential ${field} does not match the addressed realm (cross-program replay, T-08).`,
        );
      }
    }
  }
}
