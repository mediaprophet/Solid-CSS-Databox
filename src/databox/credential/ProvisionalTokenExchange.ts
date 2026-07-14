import { BadRequestHttpError } from '../../util/errors/BadRequestHttpError';
import type { BitstringStatusList, StatusListManager } from './BitstringStatusList';
import type { ConnectionCredentialRegistry } from './ConnectionCredentialRegistry';
import type { ConnectionCredentialValidator } from './ConnectionCredentialValidator';
import type { ProvisionalShortLivedToken } from './ConnectionCredentialTypes';
import type { HolderKeyProofVerifier } from './HolderKeyProof';

/**
 * The credential → short-lived-token exchange (component seam, ADR-0009). This is where every acceptance
 * gate converges. It runs the full ceremony fail-closed and, only if all of it passes, returns a
 * **conceptual** short-lived, audience-bound token.
 *
 * PROVISIONAL SEAM (ADR-0005/0006 — RFC 8693 binding BLOCKED): the LWS token-exchange wire format is not
 * specified upstream, so this does NOT fabricate it. It models the *outcome* — a
 * {@link ProvisionalShortLivedToken} carrying `notWireFormat: true` — and stops exactly at the point where
 * the real RFC 8693 request/response bytes would be produced. The token embeds no reusable secret.
 *
 * Ordered checks (each a fail-closed deny):
 * 1. **Credential validity + realm binding** — via the validator: untrusted issuer, tampered doc, forbidden
 *    key (T-18), expired credential, or program/box/grant-digest mismatch (T-08) all deny here.
 * 2. **Fresh holder-key proof** — the proof must verify against the credential's *bound* holder key on a
 *    fresh, single-use, audience-bound challenge. Credential bytes with no proof, or with a proof from a
 *    different key, deny (T-17); a replayed/expired/foreign-audience proof denies (T-19/T-52).
 * 3. **Status** — a revoked entry in the BitstringStatusList denies (per-request re-check, ADR-0009).
 * 4. **Lifecycle state** — the connection must be `active` in the registry (suspended/revoked/superseded
 *    deny), so revocation and migration take effect within one exchange, not one token lifetime.
 */

/** Five minutes — the default short-lived access-token lifetime (ADR-0009). */
export const DEFAULT_TOKEN_TTL_MS = 300_000;

/** One exchange request. The holder key is always taken from the credential, never from the caller. */
export interface ExchangeRequest {
  /** The `application/vc+jwt` connection credential (compact JWS). */
  readonly credentialJws: string;
  /** The holder-key proof (compact JWS) produced for a fresh challenge from the proof verifier. */
  readonly proofJws: string;
  /** The single storage-realm audience the token is requested for (bound into both proof and token). */
  readonly audience: string;
  /** The program the addressed realm belongs to (checked against the credential — T-08). */
  readonly program: string;
  /** The opaque databox the realm belongs to, when the caller can assert it (T-08). */
  readonly databox?: string;
  /** The immutable access-grant digest the realm asserts, when known (T-08). */
  readonly accessGrantDigest?: string;
  /** The opaque relationship the realm asserts, when known (T-08). */
  readonly relationship?: string;
  /** The token lifetime in ms (default {@link DEFAULT_TOKEN_TTL_MS}). */
  readonly tokenTtlMs?: number;
  /** Current instant (epoch ms), injectable for tests; defaults to `Date.now()`. */
  readonly now?: number;
}

/** Optional collaborators for the status + lifecycle checks (a minimal deployment may omit them). */
export interface ExchangeDependencies {
  readonly validator: ConnectionCredentialValidator;
  readonly proofVerifier: HolderKeyProofVerifier;
  readonly statusManager?: StatusListManager;
  readonly registry?: ConnectionCredentialRegistry;
  /**
   * A published status-list checker used *instead of* an in-process {@link StatusListManager} when status
   * is fetched (e.g. a vault checking an organisation's published list). Given the credential's status
   * index, returns whether it is set (revoked). Takes precedence over `statusManager` when present.
   */
  readonly statusList?: BitstringStatusList;
}

export class ProvisionalTokenExchange {
  public constructor(private readonly deps: ExchangeDependencies) {}

  /** Run the full ceremony; return a provisional short-lived token, or throw (fail closed). */
  public exchange(request: ExchangeRequest): ProvisionalShortLivedToken {
    const now = request.now ?? Date.now();

    // 1. Credential validity + realm binding (T-08, T-18, expiry). Throws on any failure.
    const validated = this.deps.validator.validate(request.credentialJws, {
      program: request.program,
      databox: request.databox,
      accessGrantDigest: request.accessGrantDigest,
      relationship: request.relationship,
      now,
    });
    const connectionId = validated.credential.id;
    const connection = validated.credential.credentialSubject.connection;

    // 1b. MED-4: the requested token audience MUST be the credential's OWN bound databox (or its storage
    //     description). Otherwise a holder bound to box X could mint a token whose audience is box Y.
    if (request.audience !== connection.databox && request.audience !== connection.storageDescription) {
      throw new BadRequestHttpError('Requested audience is not the credential\'s bound databox; refusing (MED-4).');
    }

    // 2. Fresh holder-key proof against the credential's BOUND holder key (T-17, T-19, T-52). Throws on
    //    any failure — including "no proof / wrong key" (an empty/foreign proof cannot verify).
    this.deps.proofVerifier.verify(request.proofJws, validated.holderPublicJwk, request.audience, now);

    // 3. Status re-check (per request, ADR-0009). A revoked entry — or NO status source — denies.
    this.assertNotRevoked(validated.credential.credentialStatus.statusListIndex);

    // 4. Lifecycle state (registry authority): only an active connection may exchange.
    if (this.deps.registry) {
      const stored = this.deps.registry.get(request.program, connectionId);
      if (!stored) {
        throw new BadRequestHttpError('Connection is not present in the registry; refusing exchange.');
      }
      if (stored.state !== 'active') {
        throw new BadRequestHttpError(`Connection is ${stored.state}; refusing exchange (ADR-0009).`);
      }
    }

    // Success: model the short-lived token conceptually (NOT the RFC 8693 wire format — ADR-0005 Blocked).
    const ttl = request.tokenTtlMs ?? DEFAULT_TOKEN_TTL_MS;
    return {
      connectionId,
      audience: request.audience,
      holderThumbprint: validated.holderThumbprint,
      issuedAt: new Date(now).toISOString(),
      expiresAt: new Date(now + ttl).toISOString(),
      notWireFormat: true,
      note: 'Provisional seam: RFC 8693 token-exchange binding BLOCKED (ADR-0005/0006); not a transmissible token.',
    };
  }

  /**
   * MED-1 + MED-3: check status by the credential's OWN `statusListIndex` and **fail closed** when no status
   * source resolves. A published {@link BitstringStatusList} takes precedence over an in-process
   * {@link StatusListManager}; if neither is configured the exchange is denied rather than silently allowed
   * (revocation must never fail open).
   */
  private assertNotRevoked(statusListIndex: number): void {
    if (this.deps.statusList) {
      if (this.deps.statusList.getStatus(statusListIndex)) {
        throw new BadRequestHttpError('Connection credential status is revoked (published status list, ADR-0009).');
      }
      return;
    }
    if (this.deps.statusManager) {
      if (this.deps.statusManager.isRevokedByIndex(statusListIndex)) {
        throw new BadRequestHttpError('Connection credential status is revoked (ADR-0009).');
      }
      return;
    }
    throw new BadRequestHttpError('No credential status source is configured; refusing exchange (fail closed, MED-1).');
  }
}
