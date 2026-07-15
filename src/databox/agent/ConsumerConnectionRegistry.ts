import type { KeyObject } from 'node:crypto';
import { BadRequestHttpError } from '../../util/errors/BadRequestHttpError';
import { NotFoundHttpError } from '../../util/errors/NotFoundHttpError';
import type { ProvisionalShortLivedToken } from '../credential/ConnectionCredentialTypes';
import type { ValidatedConnectionCredential } from '../credential/ConnectionCredentialValidator';
import type { ConnectionVerificationConfig } from './AgentTypes';
import { LocalKnowledgeStore } from './LocalKnowledgeStore';

/**
 * The consumer agent's **per-program isolated connection registry** (ADR-0026; consumer-vault-interoperability
 * §per-program connection registry; T-03/T-08). It is the vault the consumer keeps its imported connection
 * credentials in — one connection per (program, relationship) — and the keys/tokens/cursors/knowledge for
 * each are held STRICTLY per connection. The isolation is structural:
 *
 * - Every accessor is scoped by `program`; there is no method that returns the vault's full connection list
 *   or reveals one program's connections to another (T-03 no cross-program correlation).
 * - A cross-program lookup returns `undefined`/`NotFound`, never a 403 that would confirm existence.
 * - Adding, pausing, resuming, rotating or removing ONE connection mutates only that connection's own map
 *   entry; no sibling — in the same or another program — is touched (T-08 replay isolation).
 *
 * The holder PRIVATE key stored per connection is the consumer's own (ADR-0026: the organisation never holds
 * it); it never leaves the registry and is used only to sign holder proofs for that one connection.
 */

/** The usable lifecycle state of a stored consumer connection (removal deletes the entry entirely). */
export type ConsumerConnectionState = 'active' | 'paused';

/** A stored consumer connection: its identity, holder key, verification config, token/cursor and knowledge. */
export interface ConsumerConnection {
  readonly connectionId: string;
  readonly program: string;
  readonly relationship: string;
  readonly databox: string;
  readonly tenantId: string;
  readonly credentialJws: string;
  readonly validated: ValidatedConnectionCredential;
  /** The consumer-controlled holder private key (never the organisation's — ADR-0026). */
  readonly holderPrivateKey: KeyObject;
  readonly holderThumbprint: string;
  readonly verification: ConnectionVerificationConfig;
  /** The connection's own local knowledge store (isolated copies for this connection only). */
  readonly store: LocalKnowledgeStore;
  state: ConsumerConnectionState;
  /** The current cached short-lived token, if authenticated (isolated per connection). */
  token?: ProvisionalShortLivedToken;
  /** The last acknowledged cursor for missed-event recovery (isolated per connection). */
  lastCursor?: string;
}

/** The immutable facts needed to add a fresh connection (the agent supplies these after validation). */
export interface NewConnectionInput {
  readonly connectionId: string;
  readonly program: string;
  readonly relationship: string;
  readonly databox: string;
  readonly tenantId: string;
  readonly credentialJws: string;
  readonly validated: ValidatedConnectionCredential;
  readonly holderPrivateKey: KeyObject;
  readonly holderThumbprint: string;
  readonly verification: ConnectionVerificationConfig;
}

export class ConsumerConnectionRegistry {
  private readonly byProgram = new Map<string, Map<string, ConsumerConnection>>();
  /**
   * Every tenant id currently bound to a connection. The cursor feed is shared and keyed only by tenant, so
   * two DISTINCT connections sharing a tenant would recover the SAME event stream — cross-program correlation
   * (T-03). A tenant is therefore unique per connection (ADR-0004 pairwise); {@link add} rejects a reuse.
   */
  private readonly tenants = new Set<string>();

  private program(program: string): Map<string, ConsumerConnection> {
    let map = this.byProgram.get(program);
    if (!map) {
      map = new Map<string, ConsumerConnection>();
      this.byProgram.set(program, map);
    }
    return map;
  }

  /**
   * Add a fresh active connection. Re-adding the same id within a program fails closed, and re-using a
   * `tenantId` already bound to any connection fails closed (T-03: a shared recovery stream is forbidden).
   */
  public add(input: NewConnectionInput): ConsumerConnection {
    const map = this.program(input.program);
    if (map.has(input.connectionId)) {
      throw new BadRequestHttpError(`Connection ${input.connectionId} is already imported for this program.`);
    }
    if (this.tenants.has(input.tenantId)) {
      throw new BadRequestHttpError(
        'tenantId is already bound to another connection; refusing a shared recovery stream (T-03).',
      );
    }
    const connection: ConsumerConnection = {
      connectionId: input.connectionId,
      program: input.program,
      relationship: input.relationship,
      databox: input.databox,
      tenantId: input.tenantId,
      credentialJws: input.credentialJws,
      validated: input.validated,
      holderPrivateKey: input.holderPrivateKey,
      holderThumbprint: input.holderThumbprint,
      verification: input.verification,
      store: new LocalKnowledgeStore(input.connectionId),
      state: 'active',
    };
    map.set(connection.connectionId, connection);
    this.tenants.add(connection.tenantId);
    return connection;
  }

  /** Resolve a stored connection or `undefined` — never leaks existence across programs (T-03). */
  public get(program: string, connectionId: string): ConsumerConnection | undefined {
    return this.byProgram.get(program)?.get(connectionId);
  }

  /** Resolve a stored connection, failing with 404 (existence-hiding) when it is not present in `program`. */
  public require(program: string, connectionId: string): ConsumerConnection {
    const connection = this.get(program, connectionId);
    if (!connection) {
      // 404, not 403: a probe must not be able to confirm another program's connection exists.
      throw new NotFoundHttpError();
    }
    return connection;
  }

  /** Resolve an ACTIVE connection, failing closed when it is missing or paused. */
  public requireActive(program: string, connectionId: string): ConsumerConnection {
    const connection = this.require(program, connectionId);
    if (connection.state !== 'active') {
      throw new BadRequestHttpError(`Connection ${connectionId} is ${connection.state}; refusing (fail closed).`);
    }
    return connection;
  }

  /** The connection ids within ONE program only — never the vault's full list (T-03). */
  public list(program: string): string[] {
    return [ ...this.byProgram.get(program)?.keys() ?? [] ];
  }

  /** Pause an active connection (reversible). Only mutates this connection. */
  public pause(program: string, connectionId: string): ConsumerConnection {
    const connection = this.require(program, connectionId);
    if (connection.state !== 'active') {
      throw new BadRequestHttpError(`Only an active connection can be paused (state=${connection.state}).`);
    }
    connection.state = 'paused';
    // A paused connection must not keep a usable token around.
    connection.token = undefined;
    return connection;
  }

  /** Resume a paused connection. Only mutates this connection. */
  public resume(program: string, connectionId: string): ConsumerConnection {
    const connection = this.require(program, connectionId);
    if (connection.state !== 'paused') {
      throw new BadRequestHttpError(`Only a paused connection can be resumed (state=${connection.state}).`);
    }
    connection.state = 'active';
    return connection;
  }

  /** Remove a connection entirely (terminal). Only deletes this connection's own entry; frees its tenant. */
  public remove(program: string, connectionId: string): void {
    // Require first so removing an absent connection fails closed rather than silently succeeding.
    const connection = this.require(program, connectionId);
    this.tenants.delete(connection.tenantId);
    this.byProgram.get(program)!.delete(connectionId);
  }

  /** Cache the current short-lived token for a connection (isolated per connection). */
  public setToken(connection: ConsumerConnection, token: ProvisionalShortLivedToken): void {
    connection.token = token;
  }

  /** Advance the recovery cursor for a connection (isolated per connection). */
  public setCursor(connection: ConsumerConnection, cursor: string): void {
    connection.lastCursor = cursor;
  }
}
