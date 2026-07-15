import type { ProvisionalShortLivedToken } from '../credential/ConnectionCredentialTypes';
import type { ValidatedConnectionCredential } from '../credential/ConnectionCredentialValidator';
import { signHolderProof } from '../credential/HolderKeyProof';
import type { CommittedEvent } from '../feed/CursorFeed';
import type { ReceiptVerification } from '../receipt/AcceptanceReceiptVerifier';
import { BadRequestHttpError } from '../../util/errors/BadRequestHttpError';
import type { ConnectionImport, ConsumerAgentDependencies } from './AgentTypes';
import type { ConsumerConnection } from './ConsumerConnectionRegistry';
import { ConsumerConnectionRegistry } from './ConsumerConnectionRegistry';
import { toInertRecord } from './InertRecord';
import type { EvidenceBundle, StoredRecord } from './LocalKnowledgeStore';
import type { OdrlPolicy, PresentedOdrlTerms } from './OdrlTermsPresenter';
import { presentOdrlTerms } from './OdrlTermsPresenter';
import { buildScopedSubmission } from './ScopedSubmission';
import type { ScopedSubmission, ScopedSubmissionMeta } from './ScopedSubmission';

// One entry file re-exports its siblings (the DBX-11/14/15/16/18 pattern), so a SINGLE barrel line added by
// whoever wires C20 — `export * from './agent/ReferenceConsumerAgent'` in src/databox/index.ts — transitively
// re-exports every DBX-24 symbol. See databox/handoffs/DBX-24.md §barrel.
export * from './AgentTypes';
export * from './InertRecord';
export * from './LocalKnowledgeStore';
export * from './OdrlTermsPresenter';
export * from './ScopedSubmission';
export * from './ConsumerConnectionRegistry';

/**
 * The reference **consumer agent** (component C20; ADR-0026 — the consumer accesses their org-hosted databox
 * through their OWN Solid-compatible pod/agent; dbx-04 §7.2). It is the only standard access path: it imports
 * connection credentials into a per-program isolated registry, authenticates by proving control of the holder
 * key it controls (never a bearer secret), retrieves + INDEPENDENTLY verifies records and receipts, keeps its
 * own copies, recovers missed events off the authoritative cursor feed, presents ODRL terms understandably,
 * and submits scoped (selected-field-only) preferences/corrections.
 *
 * Security posture (all enforced here, fail-closed):
 * - **Per-program isolation + no cross-program correlation (T-03/T-08).** A program only ever gets a
 *   {@link ProgramAgent} scoped to its own program id; it cannot name, list or reach another program's
 *   connections, identities, keys, tokens or cursors.
 * - **No embedded bearer secret (ADR-0007).** The imported credential is validated to carry no forbidden
 *   key; access is bootstrapped purely by a fresh holder-key proof.
 * - **Inert data (T-51).** A retrieved record is copied as opaque data; NO link is auto-dereferenced and NO
 *   directive is auto-submitted — the agent makes an outbound request only for an operation the CONSUMER
 *   explicitly invokes.
 * - **Data minimisation (T-51).** A submission discloses ONLY the explicitly selected fields.
 * - **No wallet-browsing API.** There is no method that exposes the full connection set to a program.
 */
export class ReferenceConsumerAgent {
  private readonly registry = new ConsumerConnectionRegistry();
  private readonly now: () => number;

  public constructor(private readonly deps: ConsumerAgentDependencies) {
    this.now = deps.now ?? Date.now;
  }

  /**
   * Obtain the program-scoped agent for `programId`. This is the ONLY handle a program is given: every
   * operation on it is confined to that program's own connections, so one program can never observe or affect
   * another's (T-03). There is deliberately no agent-wide "list all connections" method.
   */
  public forProgram(programId: string): ProgramAgent {
    if (typeof programId !== 'string' || programId.length === 0) {
      throw new BadRequestHttpError('A program id must be a non-empty string.');
    }
    return new ProgramAgent(programId, this.registry, this.deps, this.now);
  }
}

/** The result of a verified submission: the scoped disclosure + the verified acceptance receipt. */
export interface SubmissionResult {
  readonly submission: ScopedSubmission;
  readonly receiptVerification: ReceiptVerification;
}

/**
 * A program-scoped view of the consumer agent (component C20, per program). Every method is confined to
 * `programId`; it holds no reference to any other program's connections. This is the object a single
 * synthetic program is handed — it is structurally incapable of naming another program's connection.
 */
export class ProgramAgent {
  public constructor(
    public readonly programId: string,
    private readonly registry: ConsumerConnectionRegistry,
    private readonly deps: ConsumerAgentDependencies,
    private readonly now: () => number,
  ) {}

  /**
   * Import a connection credential into this program's isolated registry. The credential is validated against
   * the addressed realm — including that its bound program equals THIS program (a credential minted for
   * another program is rejected, T-08) — and must carry no embedded bearer secret (T-18). Returns the opaque
   * connection id.
   */
  public importConnection(input: ConnectionImport): string {
    const validated = this.validateImport(input);
    return this.register(input, validated, input.tenantId).connectionId;
  }

  /** Validate an imported credential against THIS program's addressed realm (T-08/T-18). */
  private validateImport(input: ConnectionImport): ValidatedConnectionCredential {
    return this.deps.credentialValidator.validate(input.credentialJws, {
      program: this.programId,
      now: this.now(),
    });
  }

  /** Add a validated connection to the registry under `tenantId` (rotation reuses the predecessor's tenant). */
  private register(
    input: ConnectionImport,
    validated: ValidatedConnectionCredential,
    tenantId: string,
  ): ConsumerConnection {
    const binding = validated.credential.credentialSubject.connection;
    return this.registry.add({
      connectionId: validated.credential.id,
      program: this.programId,
      relationship: binding.relationship,
      databox: binding.databox,
      tenantId,
      credentialJws: input.credentialJws,
      validated,
      holderPrivateKey: input.holderPrivateKey,
      holderThumbprint: validated.holderThumbprint,
      verification: input.verification,
    });
  }

  /** The connection ids in THIS program only (never any other program's — T-03). */
  public listConnections(): string[] {
    return this.registry.list(this.programId);
  }

  /**
   * Authenticate a connection: prove control of the holder key over a fresh, single-use, audience-bound
   * challenge and exchange it for a short-lived token (IF-01). No bearer secret is ever transmitted; the
   * holder private key never leaves the registry. The token is cached on the connection (isolated).
   */
  public authenticate(connectionId: string): ProvisionalShortLivedToken {
    const connection = this.registry.requireActive(this.programId, connectionId);
    const binding = connection.validated.credential.credentialSubject.connection;
    const audience = connection.databox;
    const now = this.now();
    const challenge = this.deps.challengeSource.issueChallenge(audience, { now });
    const proofJws = signHolderProof(challenge, connection.holderPrivateKey, connection.holderThumbprint);
    const token = this.deps.tokenExchange.exchange({
      credentialJws: connection.credentialJws,
      proofJws,
      audience,
      program: this.programId,
      databox: connection.databox,
      accessGrantDigest: binding.accessGrantDigest,
      relationship: connection.relationship,
      now,
    });
    this.registry.setToken(connection, token);
    return token;
  }

  /**
   * Retrieve the connection's records, INDEPENDENTLY verify each (record proof + acceptance receipt against
   * the consumer's own trust config, with the exact payload digest checked), and store inert copies with
   * provenance. Returns the stored records. A retrieved record is NEVER dereferenced or auto-submitted — the
   * only outbound calls are the token exchange and the single record fetch the consumer invoked (T-51).
   */
  public async retrieveAndStore(connectionId: string): Promise<readonly StoredRecord[]> {
    const connection = this.registry.requireActive(this.programId, connectionId);
    const token = this.authenticate(connectionId);
    const items = await this.deps.recordEndpoint.fetchRecords(token);
    const retrievedAt = new Date(this.now()).toISOString();
    const stored: StoredRecord[] = [];
    for (const item of items) {
      const recordVerification = this.deps.recordValidator.validate(item.recordJws, {
        trustStore: connection.verification.recordTrustStore,
        pinnedContexts: connection.verification.pinnedContexts,
        statusListResolver: connection.verification.statusListResolver,
        now: this.now(),
        acceptedPayload: item.payload,
      });
      const receiptVerification = this.deps.receiptVerifier.verify(item.receiptJws, {
        trustStore: connection.verification.receiptTrustStore,
        acceptedPayload: item.payload,
      });
      // T-51: reduce to inert data — a pure copy, no link followed, no directive obeyed.
      const inert = toInertRecord(connectionId, recordVerification, item.payload, 'authenticated-pull', retrievedAt);
      stored.push(connection.store.storeRecord({
        inert,
        recordJws: item.recordJws,
        receiptJws: item.receiptJws,
        recordVerification,
        receiptVerification,
      }));
    }
    return stored;
  }

  /**
   * Recover missed committed events off the authoritative cursor feed (IF-09; ADR-0011). Pulls from the
   * connection's last cursor, records each event exactly once (dedup on `eventId`), and advances the cursor
   * so a re-run reprocesses nothing. A cursor that has fallen outside retention makes the feed throw
   * (recovery gap) rather than silently masking missed events. Returns the newly recovered events.
   */
  public async recover(connectionId: string): Promise<readonly CommittedEvent[]> {
    const connection = this.registry.requireActive(this.programId, connectionId);
    const page = await this.deps.cursorFeed.pull(connection.tenantId, connection.lastCursor);
    const recovered: CommittedEvent[] = [];
    for (const event of page.events) {
      if (connection.store.recordRecoveredEvent(event)) {
        recovered.push(event);
      }
    }
    this.registry.setCursor(connection, page.nextCursor);
    return recovered;
  }

  /**
   * Present an ODRL policy in an understandable form while preserving its machine-readable expression
   * (ADR-0013/0017). Requires the connection to exist (scoped to this program) but does not authenticate —
   * presentation is a local, read-only rendering.
   */
  public presentTerms(connectionId: string, policy: OdrlPolicy): PresentedOdrlTerms {
    this.registry.require(this.programId, connectionId);
    return presentOdrlTerms(policy);
  }

  /**
   * Submit a scoped preference/correction disclosing ONLY the selected fields (T-51 minimisation), then
   * verify the returned acceptance receipt against the consumer's own trust config and keep a copy. Returns
   * the exact scoped disclosure + the verified receipt.
   */
  public async submitCorrection(
    connectionId: string,
    candidate: Readonly<Record<string, unknown>>,
    selectedFields: readonly string[],
    meta: ScopedSubmissionMeta,
  ): Promise<SubmissionResult> {
    const connection = this.registry.requireActive(this.programId, connectionId);
    // Minimise BEFORE any transport: only the selected fields ever leave the agent.
    const submission = buildScopedSubmission(candidate, selectedFields, meta);
    const token = this.authenticate(connectionId);
    const ack = await this.deps.submissionEndpoint.submit(token, submission);
    const receiptVerification = this.deps.receiptVerifier.verify(ack.receiptJws, {
      trustStore: connection.verification.receiptTrustStore,
      acceptedPayload: ack.payload,
    });
    connection.store.storeReceipt({
      receiptJws: ack.receiptJws,
      verification: receiptVerification,
      provenance: 'submission-accepted',
    });
    return { submission, receiptVerification };
  }

  /** The verified records stored for a connection (independent copies). */
  public storedRecords(connectionId: string): readonly StoredRecord[] {
    return this.registry.require(this.programId, connectionId).store.listRecords();
  }

  /** Export a connection's evidence bundle for independent re-verification (T-46). */
  public exportEvidence(connectionId: string): EvidenceBundle {
    return this.registry.require(this.programId, connectionId).store.exportEvidence();
  }

  /** Pause a connection (reversible). Only affects this connection. */
  public pause(connectionId: string): void {
    this.registry.pause(this.programId, connectionId);
  }

  /** Resume a paused connection. Only affects this connection. */
  public resume(connectionId: string): void {
    this.registry.resume(this.programId, connectionId);
  }

  /** Remove a connection entirely (terminal). Only affects this connection. */
  public remove(connectionId: string): void {
    this.registry.remove(this.programId, connectionId);
  }

  /**
   * Rotate a connection to a freshly issued credential for the SAME relationship: validate the successor,
   * add it as a new active connection, then remove the predecessor. The successor starts with its own fresh
   * token/cursor/knowledge (isolation). A successor for a different relationship is rejected (T-08). Returns
   * the new connection id.
   */
  public rotate(connectionId: string, replacement: ConnectionImport): string {
    const predecessor = this.registry.require(this.programId, connectionId);
    // Validate the successor BEFORE touching the registry so a rejected rotation leaves it unchanged.
    const validated = this.validateImport(replacement);
    if (validated.credential.credentialSubject.connection.relationship !== predecessor.relationship) {
      throw new BadRequestHttpError('A rotated credential must be for the same relationship (T-08).');
    }
    // Rotation CONTINUES the same relationship/recovery stream, so the successor reuses the predecessor's
    // tenant + cursor and inherits its retained evidence. Remove the predecessor first (freeing its tenant),
    // then register the successor on that same tenant and MIGRATE the evidence + recovery state (M1: routine
    // rotation must never destroy the consumer's durable, independently-verifiable evidence — T-46).
    const carriedStore = predecessor.store;
    const carriedCursor = predecessor.lastCursor;
    const tenantId = predecessor.tenantId;
    this.registry.remove(this.programId, connectionId);
    const successor = this.register(replacement, validated, tenantId);
    successor.store.migrateFrom(carriedStore);
    successor.lastCursor = carriedCursor;
    return successor.connectionId;
  }
}
