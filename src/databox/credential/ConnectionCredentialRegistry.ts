import { BadRequestHttpError } from '../../util/errors/BadRequestHttpError';
import { InternalServerError } from '../../util/errors/InternalServerError';
import type { StatusListManager } from './BitstringStatusList';
import type { IssuedConnectionCredential } from './ConnectionCredentialIssuer';
import type {
  ConnectionLifecycleState,
  DataboxConnectionCredential,
  KeyHistoryEntry,
  PublicJwk,
} from './ConnectionCredentialTypes';

/**
 * The per-program connection registry (vault side; consumed by DBX-24). It is the private store where a
 * vault holds **many** connection credentials — one per program — and drives their lifecycle: install,
 * installation-acknowledgement, suspension, revocation, expiry, renewal, holder-key rotation and vault
 * migration (ADR-0007/0009 lifecycle).
 *
 * Two invariants are structural, not conventional:
 * - **Per-program isolation (invariant 5, T-08).** Every accessor is scoped by `program`; {@link exportConnection}
 *   emits exactly one connection with **no** reference to any sibling, and {@link listConnections} only ever
 *   returns ids within one program. There is no method that discloses the vault's full connection list.
 * - **Migration preserves history, not obsolete access (T-48).** Renewal/rotation/migration mint a fresh
 *   active connection and mark the predecessor `superseded`/`revoked`; the predecessor's holder key and
 *   credential id are retained in {@link StoredConnection.keyHistory} for provenance, but its state is no
 *   longer `active`, so the token exchange denies it. Copying an old credential file cannot restore access.
 */

/** A stored connection and its full lifecycle state. */
export interface StoredConnection {
  readonly connectionId: string;
  readonly program: string;
  readonly relationship: string;
  readonly databox: string;
  readonly jws: string;
  readonly credential: DataboxConnectionCredential;
  readonly holderThumbprint: string;
  readonly holderPublicJwk: PublicJwk;
  state: ConnectionLifecycleState;
  /** Evidence reference recorded at installation acknowledgement (append-only; set once). */
  installedAck?: string;
  /** Retired holder keys / superseded credential ids for provenance (T-33/T-48). */
  readonly keyHistory: KeyHistoryEntry[];
  /** The connection id that superseded this one (renewal/rotation/migration), when superseded. */
  supersededBy?: string;
  /** The connection id this one superseded, when it is a successor. */
  readonly supersedes?: string;
}

/** The serialisable single-connection bundle used for export/import. Discloses no sibling connections. */
export interface ConnectionBundle {
  readonly connectionId: string;
  readonly program: string;
  readonly jws: string;
  readonly credential: DataboxConnectionCredential;
  readonly holderThumbprint: string;
  readonly holderPublicJwk: PublicJwk;
  readonly state: ConnectionLifecycleState;
  readonly keyHistory: readonly KeyHistoryEntry[];
}

function connectionOf(issued: IssuedConnectionCredential): { program: string; relationship: string; databox: string } {
  const { connection } = issued.credential.credentialSubject;
  return { program: connection.program, relationship: connection.relationship, databox: connection.databox };
}

export class ConnectionCredentialRegistry {
  private readonly byProgram = new Map<string, Map<string, StoredConnection>>();

  /**
   * @param statusManager - Optional status-list manager (MED-2). When present, revoke/rotate/migrate flip
   *   the predecessor credential's **published** status bit (by its embedded `statusListIndex`) so a
   *   verifier reading only the published BitstringStatusList — not this in-memory state — also sees the
   *   superseded/revoked credential as revoked. Without it, only the in-memory lifecycle state changes.
   */
  public constructor(private readonly statusManager?: StatusListManager) {}

  /** Flip the published status bit for a credential now rendered unusable (MED-2), if a manager is wired. */
  private markRevokedInStatusList(stored: StoredConnection): void {
    this.statusManager?.setRevokedByIndex(stored.credential.credentialStatus.statusListIndex, true);
  }

  private program(program: string): Map<string, StoredConnection> {
    let map = this.byProgram.get(program);
    if (!map) {
      map = new Map<string, StoredConnection>();
      this.byProgram.set(program, map);
    }
    return map;
  }

  /** Install (import) an issued credential as a fresh active connection. Re-installing the same id fails. */
  public install(issued: IssuedConnectionCredential): StoredConnection {
    const { program, relationship, databox } = connectionOf(issued);
    const map = this.program(program);
    if (map.has(issued.connectionId)) {
      throw new BadRequestHttpError(`Connection ${issued.connectionId} is already installed.`);
    }
    const stored: StoredConnection = {
      connectionId: issued.connectionId,
      program,
      relationship,
      databox,
      jws: issued.jws,
      credential: issued.credential,
      holderThumbprint: issued.holderThumbprint,
      holderPublicJwk: issued.credential.credentialSubject.holder.publicKeyJwk,
      state: 'active',
      keyHistory: [],
    };
    map.set(stored.connectionId, stored);
    return stored;
  }

  /** Import a connection bundle produced by {@link exportConnection} on another vault (DBX-24). */
  public importConnection(bundle: ConnectionBundle): StoredConnection {
    const map = this.program(bundle.program);
    if (map.has(bundle.connectionId)) {
      throw new BadRequestHttpError(`Connection ${bundle.connectionId} is already present.`);
    }
    const stored: StoredConnection = {
      connectionId: bundle.connectionId,
      program: bundle.program,
      relationship: bundle.credential.credentialSubject.connection.relationship,
      databox: bundle.credential.credentialSubject.connection.databox,
      jws: bundle.jws,
      credential: bundle.credential,
      holderThumbprint: bundle.holderThumbprint,
      holderPublicJwk: bundle.holderPublicJwk,
      state: bundle.state,
      keyHistory: [ ...bundle.keyHistory ],
    };
    map.set(stored.connectionId, stored);
    return stored;
  }

  private require(program: string, connectionId: string): StoredConnection {
    const stored = this.byProgram.get(program)?.get(connectionId);
    if (!stored) {
      throw new BadRequestHttpError(`No connection ${connectionId} in program ${program}.`);
    }
    return stored;
  }

  /** Resolve a stored connection, or `undefined` (no existence leak across programs). */
  public get(program: string, connectionId: string): StoredConnection | undefined {
    return this.byProgram.get(program)?.get(connectionId);
  }

  /** The connection ids in one program only (never the vault's full list — invariant 5). */
  public listConnections(program: string): string[] {
    return [ ...this.byProgram.get(program)?.keys() ?? [] ];
  }

  /**
   * Record installation acknowledgement (step 9 of the ceremony). Append-only: the ack is set exactly once;
   * a second acknowledgement is refused rather than overwriting the evidence.
   */
  public acknowledgeInstallation(program: string, connectionId: string, evidenceRef: string): StoredConnection {
    if (typeof evidenceRef !== 'string' || evidenceRef.length === 0) {
      throw new BadRequestHttpError('Installation acknowledgement requires a non-empty evidence reference.');
    }
    const stored = this.require(program, connectionId);
    if (stored.installedAck !== undefined) {
      throw new BadRequestHttpError('Installation has already been acknowledged (append-only).');
    }
    stored.installedAck = evidenceRef;
    return stored;
  }

  /** Suspend an active connection (reversible). */
  public suspend(program: string, connectionId: string): StoredConnection {
    const stored = this.require(program, connectionId);
    if (stored.state !== 'active') {
      throw new BadRequestHttpError(`Only an active connection can be suspended (state=${stored.state}).`);
    }
    stored.state = 'suspended';
    return stored;
  }

  /** Reactivate a suspended connection. */
  public reactivate(program: string, connectionId: string): StoredConnection {
    const stored = this.require(program, connectionId);
    if (stored.state !== 'suspended') {
      throw new BadRequestHttpError(`Only a suspended connection can be reactivated (state=${stored.state}).`);
    }
    stored.state = 'active';
    return stored;
  }

  /** Revoke a connection (terminal). A revoked connection can never be reactivated. */
  public revoke(program: string, connectionId: string): StoredConnection {
    const stored = this.require(program, connectionId);
    if (stored.state === 'revoked') {
      throw new BadRequestHttpError('Connection is already revoked.');
    }
    stored.state = 'revoked';
    // MED-2: a verifier reading the published status list MUST see this as revoked, not just this store.
    this.markRevokedInStatusList(stored);
    return stored;
  }

  private supersede(
    program: string,
    predecessorId: string,
    successor: IssuedConnectionCredential,
    reason: KeyHistoryEntry['reason'],
    predecessorState: 'superseded' | 'revoked',
    now: number,
  ): StoredConnection {
    const predecessor = this.require(program, predecessorId);
    if (predecessor.state === 'revoked' || predecessor.state === 'superseded') {
      throw new BadRequestHttpError(`Cannot supersede a ${predecessor.state} connection.`);
    }
    const successorFacts = connectionOf(successor);
    if (successorFacts.program !== predecessor.program || successorFacts.relationship !== predecessor.relationship) {
      throw new BadRequestHttpError('Successor credential must be for the same program and relationship.');
    }
    const sameKey = successor.holderThumbprint === predecessor.holderThumbprint;
    if (reason === 'renewal' && !sameKey) {
      throw new BadRequestHttpError('Renewal must keep the same holder key; use rotate/migrate to change keys.');
    }
    if (reason !== 'renewal' && sameKey) {
      throw new BadRequestHttpError('Rotation/migration must bind a new holder key.');
    }

    const map = this.program(program);
    if (map.has(successor.connectionId)) {
      throw new InternalServerError(`Successor connection ${successor.connectionId} already exists.`);
    }
    // Carry the predecessor's own history forward, then retire the predecessor's key/credential into it
    // (provenance retained — T-33/T-48). The successor's key is the live one and is NOT in history.
    const history: KeyHistoryEntry[] = [
      ...predecessor.keyHistory,
      {
        thumbprint: predecessor.holderThumbprint,
        publicKeyJwk: predecessor.holderPublicJwk,
        retiredAt: new Date(now).toISOString(),
        reason,
        credentialId: predecessor.connectionId,
      },
    ];
    const stored: StoredConnection = {
      connectionId: successor.connectionId,
      program,
      relationship: successorFacts.relationship,
      databox: successorFacts.databox,
      jws: successor.jws,
      credential: successor.credential,
      holderThumbprint: successor.holderThumbprint,
      holderPublicJwk: successor.credential.credentialSubject.holder.publicKeyJwk,
      state: 'active',
      keyHistory: history,
      supersedes: predecessor.connectionId,
    };
    map.set(stored.connectionId, stored);
    predecessor.state = predecessorState;
    predecessor.supersededBy = stored.connectionId;
    // MED-2: the predecessor credential is now unusable (renewed/rotated/migrated). Flip its published
    // status bit so a verifier reading only the published BitstringStatusList also rejects it — this is the
    // "migration preserves history, not obsolete access" property made visible off-registry (T-48/T-33).
    this.markRevokedInStatusList(predecessor);
    return stored;
  }

  /**
   * Renew: mint a fresh active connection with the **same** holder key and a new validity, superseding the
   * old one. Ordinary renewal keeps access continuous; the predecessor is retained (superseded) for audit.
   */
  public renew(
    program: string,
    connectionId: string,
    renewed: IssuedConnectionCredential,
    now: number = Date.now(),
  ): StoredConnection {
    return this.supersede(program, connectionId, renewed, 'renewal', 'superseded', now);
  }

  /**
   * Rotate the holder key (T-33): the predecessor's key is retired into history (still usable to verify
   * historical records) and superseded; the successor binds a new holder key. The old key can no longer
   * obtain access.
   */
  public rotateHolderKey(
    program: string,
    connectionId: string,
    rotated: IssuedConnectionCredential,
    now: number = Date.now(),
  ): StoredConnection {
    return this.supersede(program, connectionId, rotated, 'rotation', 'superseded', now);
  }

  /**
   * Vault migration (T-48): the successor binds the new vault's holder key; the predecessor is **revoked**
   * (obsolete access dropped) while its key + credential id are retained in the successor's history
   * (provenance preserved). Copying the old credential file alone cannot preserve access.
   */
  public migrate(
    program: string,
    connectionId: string,
    migrated: IssuedConnectionCredential,
    now: number = Date.now(),
  ): StoredConnection {
    return this.supersede(program, connectionId, migrated, 'migration', 'revoked', now);
  }

  /**
   * Export exactly one connection as a portable bundle. The bundle contains only this connection's own
   * material and history — never any reference to sibling connections (invariant 5).
   */
  public exportConnection(program: string, connectionId: string): ConnectionBundle {
    const stored = this.require(program, connectionId);
    return {
      connectionId: stored.connectionId,
      program: stored.program,
      jws: stored.jws,
      credential: stored.credential,
      holderThumbprint: stored.holderThumbprint,
      holderPublicJwk: stored.holderPublicJwk,
      state: stored.state,
      keyHistory: [ ...stored.keyHistory ],
    };
  }
}
