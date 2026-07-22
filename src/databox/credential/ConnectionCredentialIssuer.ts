import type { KeyObject } from 'node:crypto';
import { randomUUID } from 'node:crypto';
import { BadRequestHttpError } from '../../util/errors/BadRequestHttpError';
import type {
  ConnectionBinding,
  CredentialStatusReference,
  DataboxConnectionCredential,
  PublicJwk,
} from './ConnectionCredentialTypes';
import {
  BITSTRING_STATUS_LIST_ENTRY_TYPE,
  CONNECTION_CREDENTIAL_ALG,
  CONNECTION_CREDENTIAL_JWS_TYP,
  CONNECTION_CREDENTIAL_SCHEMA,
  DATABOX_CONNECTION_CREDENTIAL_TYPE,
  DBX_CREDENTIAL_CONTEXT,
  VC_V2_CONTEXT,
  VERIFIABLE_CREDENTIAL_TYPE,
} from './ConnectionCredentialTypes';
import { jwkThumbprint, sha256Hex, signCompactJws } from './Es256';

/**
 * The connection-credential issuer (component C7, ADR-0007). It mints a holder-bound W3C VC 2.0
 * `DataboxConnectionCredential`, secured as an `application/vc+jwt` ES256 compact JWS.
 *
 * What it binds (ADR-0007 §Decision): the accountable issuer, the program, the opaque Databox, standards
 * discovery, the immutable access-grant identifier **and digest**, the compatibility profiles, the pairwise
 * consumer subject, and the holder **public** key. What it deliberately does **not** carry: any access or
 * refresh token, and any global customer key/identifier (R-04, invariant). The digest is what binds the
 * exact grant so the same credential cannot be re-pointed at another grant (T-08).
 */

/** The immutable access-grant reference to bind. Supply either the raw bytes to digest, or a pre-digest. */
export interface AccessGrantReference {
  /** The access-grant / policy identifier (ADR-0014 versioned). */
  readonly id: string;
  /** The canonical grant bytes to digest, when the issuer computes the digest. */
  readonly bytes?: Buffer | string;
  /** A pre-computed `urn:sha256:<hex>` digest, when the caller already has it. */
  readonly digest?: string;
}

/** Everything one issuance needs. No field can carry an access token or a global customer id (ADR-0007). */
export interface IssuanceRequest {
  /** The vault-controlled pairwise HTTPS WebID (holder subject, ADR-0004). */
  readonly pairwiseWebId: string;
  /** The bound holder public key (EC P-256). */
  readonly holderPublicJwk: PublicJwk;
  /** The bounded program identifier. */
  readonly program: string;
  /** The opaque Databox/box root (ADR-0002). */
  readonly databox: string;
  /** The standards-conforming storage description / discovery entry point. */
  readonly storageDescription: string;
  /** The authorization-discovery entry point, when distinct. */
  readonly authorizationDiscovery?: string;
  /** The immutable access grant to bind (id + digest). */
  readonly accessGrant: AccessGrantReference;
  /** The access-profile identifier + version. */
  readonly accessProfile: string;
  /** The Solid/LWS/Databox compatibility profiles (non-empty). */
  readonly conformsTo: readonly string[];
  /** The synchronisation-profile identifier. */
  readonly syncProfile: string;
  /** The opaque relationship identifier. */
  readonly relationship: string;
  /** The BitstringStatusList index assigned to this connection (from the status manager). */
  readonly statusListIndex: number;
  /** The published status-list credential identifier. */
  readonly statusListCredential: string;
  /** The status purpose (default `revocation`). */
  readonly statusPurpose?: string;
  /** Issue instant (epoch ms), injectable for tests; defaults to `Date.now()`. */
  readonly now?: number;
  /** Validity in ms from `now` (months/years, ADR-0007). Mutually exclusive with {@link validUntil}. */
  readonly validForMs?: number;
  /** Explicit expiry instant (epoch ms). Takes precedence over {@link validForMs}. */
  readonly validUntil?: number;
}

/** The issued artefacts: the credential object, its securing JWS, and the derived connection id. */
export interface IssuedConnectionCredential {
  readonly credential: DataboxConnectionCredential;
  readonly jws: string;
  /** The stable connection id (the credential `id`), used as the registry + status-list key. */
  readonly connectionId: string;
  /** The holder thumbprint the credential is bound to. */
  readonly holderThumbprint: string;
}

/** One year in ms — the demo default lifetime (ADR-0007/HD-06). */
export const DEFAULT_CREDENTIAL_LIFETIME_MS = 365 * 24 * 60 * 60 * 1000;

function requireAbsoluteHttps(value: unknown, field: string): string {
  try {
    if (typeof value !== 'string') {
      throw new TypeError('not a string');
    }
    const parsed = new URL(value);
    const loopback = parsed.protocol === 'http:' &&
      (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1' || parsed.hostname === '::1');
    if (parsed.protocol !== 'https:' && !loopback) {
      throw new TypeError('not secure');
    }
    return value;
  } catch {
    throw new BadRequestHttpError(
      `Connection credential field '${field}' must be an absolute HTTPS URL or HTTP loopback URL.`,
    );
  }
}

function requireNonEmpty(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new BadRequestHttpError(`Connection credential field '${field}' must be a non-empty string.`);
  }
  return value;
}

/** Compute the immutable access-grant digest as a `urn:sha256:<hex>` URN (ADR-0007, T-08). */
export function computeAccessGrantDigest(grant: AccessGrantReference): string {
  if (typeof grant.digest === 'string' && grant.digest.length > 0) {
    if (!/^urn:sha256:[0-9a-f]{64}$/u.test(grant.digest)) {
      throw new BadRequestHttpError('Provided access-grant digest must be a urn:sha256:<64 hex> URN.');
    }
    return grant.digest;
  }
  if (grant.bytes === undefined) {
    throw new BadRequestHttpError('Access grant must supply either canonical bytes or a precomputed digest.');
  }
  return `urn:sha256:${sha256Hex(grant.bytes)}`;
}

export class ConnectionCredentialIssuer {
  /**
   * @param issuer - The accountable-organisation issuer identifier (ADR-0004).
   * @param issuerPrivateKey - The issuer's ES256 (P-256) signing key object.
   * @param verificationMethod - The `kid` / verification-method identifier for the issuer key.
   */
  public constructor(
    private readonly issuer: string,
    private readonly issuerPrivateKey: KeyObject,
    private readonly verificationMethod: string,
  ) {}

  /**
   * Issue one holder-bound connection credential. Every discovery/binding field is validated fail-closed;
   * the holder thumbprint is computed here (not taken from the caller) so the binding is authoritative.
   */
  public issue(request: IssuanceRequest): IssuedConnectionCredential {
    const holderThumbprint = jwkThumbprint(request.holderPublicJwk);
    const now = request.now ?? Date.now();
    const validUntil = request.validUntil ?? (now + (request.validForMs ?? DEFAULT_CREDENTIAL_LIFETIME_MS));
    if (validUntil <= now) {
      throw new BadRequestHttpError('Connection credential validUntil must be after validFrom.');
    }
    if (!Number.isInteger(request.statusListIndex) || request.statusListIndex < 0) {
      throw new BadRequestHttpError('Connection credential statusListIndex must be a non-negative integer.');
    }

    const connection: ConnectionBinding = {
      program: requireAbsoluteHttps(request.program, 'program'),
      databox: requireAbsoluteHttps(request.databox, 'databox'),
      storageDescription: requireAbsoluteHttps(request.storageDescription, 'storageDescription'),
      ...request.authorizationDiscovery === undefined ?
          {} :
          { authorizationDiscovery: requireAbsoluteHttps(request.authorizationDiscovery, 'authorizationDiscovery') },
      accessGrant: requireNonEmpty(request.accessGrant.id, 'accessGrant'),
      accessGrantDigest: computeAccessGrantDigest(request.accessGrant),
      accessProfile: requireNonEmpty(request.accessProfile, 'accessProfile'),
      conformsTo: this.requireConformsTo(request.conformsTo),
      syncProfile: requireNonEmpty(request.syncProfile, 'syncProfile'),
      relationship: requireNonEmpty(request.relationship, 'relationship'),
    };

    const status: CredentialStatusReference = {
      id: `${requireNonEmpty(request.statusListCredential, 'statusListCredential')}#${request.statusListIndex}`,
      type: BITSTRING_STATUS_LIST_ENTRY_TYPE,
      statusPurpose: request.statusPurpose ?? 'revocation',
      statusListIndex: request.statusListIndex,
      statusListCredential: request.statusListCredential,
    };

    const connectionId = `urn:uuid:${randomUUID()}`;
    const credential: DataboxConnectionCredential = {

      '@context': [ VC_V2_CONTEXT, DBX_CREDENTIAL_CONTEXT ],
      id: connectionId,
      type: [ VERIFIABLE_CREDENTIAL_TYPE, DATABOX_CONNECTION_CREDENTIAL_TYPE ],
      issuer: requireNonEmpty(this.issuer, 'issuer'),
      validFrom: new Date(now).toISOString(),
      validUntil: new Date(validUntil).toISOString(),
      credentialSubject: {
        id: requireAbsoluteHttps(request.pairwiseWebId, 'pairwiseWebId'),
        holder: {
          id: requireAbsoluteHttps(request.pairwiseWebId, 'pairwiseWebId'),
          publicKeyJwk: request.holderPublicJwk,
          thumbprint: holderThumbprint,
        },
        connection,
      },
      credentialStatus: status,
      credentialSchema: { id: CONNECTION_CREDENTIAL_SCHEMA, type: 'JsonSchema' },
    };

    const jws = signCompactJws(
      { alg: CONNECTION_CREDENTIAL_ALG, typ: CONNECTION_CREDENTIAL_JWS_TYP, cty: 'vc', kid: this.verificationMethod },
      credential as unknown as Record<string, unknown>,
      this.issuerPrivateKey,
    );
    return { credential, jws, connectionId, holderThumbprint };
  }

  private requireConformsTo(conformsTo: readonly string[]): readonly string[] {
    if (!Array.isArray(conformsTo) || conformsTo.length === 0) {
      throw new BadRequestHttpError('Connection credential \'conformsTo\' must be a non-empty array.');
    }
    return conformsTo.map((value): string => requireNonEmpty(value, 'conformsTo[]'));
  }
}
