import { ForbiddenHttpError } from '../../util/errors/ForbiddenHttpError';
import { sha256Hex } from '../credential/Es256';
import type { DepositSubmissionGateway, GatewayBounds, GatewayContext } from '../gateway/DepositSubmissionGateway';
import type { DepositRequest, GatewayAcceptance, PolicyRefClaim, TrustedIssuerKey } from '../gateway/GatewayTypes';
import type { InstitutionProfile } from '../profile/InstitutionProfile';
import type { RelationshipRecord } from '../provisioning/ProvisioningTypes';
import type { AcceptanceReceiptRequest, AcceptanceReceiptSigner } from '../receipt/AcceptanceReceiptSigner';
import type { DurableCommit } from '../receipt/DurableCommit';
import type { SignedAcceptanceReceipt } from '../receipt/ReceiptTypes';
import { freezeTenantContext, tenantIdOf } from '../tenant/TenantContext';
import type {
  BridgeReconciliation,
  ProgramServiceIdentity,
  SignedInstitutionalRecord,
  SourceEvent,
} from './BridgeTypes';
import type { InstitutionalRecordBuilder } from './InstitutionalRecordBuilder';
import type { RelationshipResolver } from './RelationshipResolver';
import type { TransactionalSourceOutbox } from './SourceOutbox';

// Re-export the bridge plane so a SINGLE barrel line — `export * from './bridge/DataboxBridge'` (to be added
// to src/databox/index.ts by whoever wires C21; see databox/handoffs/DBX-22.md §barrel) — transitively
// re-exports every DBX-22 symbol, mirroring the DBX-11/DBX-14/DBX-15/DBX-18 sibling re-export pattern.
export * from './BridgeTypes';
export * from './SourceOutbox';
export * from './RelationshipResolver';
export * from './InstitutionalRecordBuilder';

/** The confirmed-payload facts the durable-commit seam turns into a {@link DurableCommit}. */
export interface DurableCommitInput {
  /** The source-event id the durable commit is for (the receipt binds it as `commitEventId`). */
  readonly eventId: string;
  /** ISO-8601 durable-commit instant. */
  readonly committedAt: string;
  /** `urn:sha256:<hex>` of the exact deposited payload. */
  readonly payloadDigest: string;
  /** Final assigned Solid resource URI. */
  readonly resource: string;
  /** Container the accepted resource belongs to. */
  readonly target: string;
  /** Exact accepted bytes; a durable adapter MUST store these bytes unchanged. */
  readonly body: Buffer;
  /** Media type of {@link body}. */
  readonly mediaType: string;
}

/**
 * The durable-commit seam (§7.0). Production wires the transactional-outbox/ledger commit boundary here; the
 * reference default confirms in-memory. Modelled as an injectable function so a transient commit failure is
 * testable: a throw leaves the deposit accepted-at-gateway but un-receipted, so the drain resumes it and
 * exactly one logical receipt is ever issued (ADR-0016/0019 §Failure — never a receipt before durable commit).
 */
export type DurableCommitConfirmer = (input: DurableCommitInput) => DurableCommit | Promise<DurableCommit>;

/** The disposition of one deposit attempt: a reconciled receipt, an unresolved mapping, or a failure. */
export type BridgeDepositReport = {
  readonly status: 'reconciled';
  readonly reconciliation: BridgeReconciliation;
  readonly acceptance: GatewayAcceptance;
  readonly receipt: SignedAcceptanceReceipt;
} | { readonly status: 'unresolved'; readonly reconciliation: BridgeReconciliation } |
{ readonly status: 'failed'; readonly reconciliation: BridgeReconciliation };

/** Constructor dependencies for a {@link DataboxBridge}. */
export interface DataboxBridgeOptions {
  /** The bridge's own program service identity (least-privilege, HD-13; per-program, no cross-program role). */
  readonly identity: ProgramServiceIdentity;
  /** The validated program profile the deposit is checked against. */
  readonly profile: InstitutionProfile;
  /** The transactional source-outbox the bridge drains. */
  readonly outbox: TransactionalSourceOutbox;
  /** The protected relationship resolver (typed customerID → opaque relationship/box). */
  readonly resolver: RelationshipResolver;
  /** The institutional record builder (transform + Es256 sign). */
  readonly builder: InstitutionalRecordBuilder;
  /** The deposit/submission gateway the record is deposited THROUGH. */
  readonly gateway: DepositSubmissionGateway;
  /** The gateway media/size/shape bounds. */
  readonly gatewayBounds: GatewayBounds;
  /** The program's OWN trusted institutional signer key(s) — never another program's. */
  readonly issuerKeys: readonly TrustedIssuerKey[];
  /** The signed-acceptance-receipt signer whose receipt the bridge retains. */
  readonly receiptSigner: AcceptanceReceiptSigner;
  /** Injectable clock seam (default: real time). */
  readonly clock?: () => string;
  /** Injectable durable-commit seam (default: confirm in-memory). */
  readonly durableCommit?: DurableCommitConfirmer;
}

/** A record class resolved to its versioned policy template + ODRL profile. */
interface ResolvedPolicy {
  readonly claim: PolicyRefClaim;
  readonly odrlProfile: string;
}

/**
 * The synthetic institutional bridge (component C21, DBX-04 §7.1 deposit trace; DBX-22; ADR-0016/0017). It
 * drains its program's source-outbox and, for each committed event: resolves the typed customerID to the
 * opaque relationship through the protected mapping registry; transforms + ES256-signs the record; deposits
 * it THROUGH the {@link DepositSubmissionGateway} as its own program service identity; retains the returned
 * signed acceptance receipt; and reconciles source→Databox.
 *
 * The security invariants held here (with the layers they compose with):
 * - **Least-privilege, no cross-program role (HD-13, T-02).** The bridge appends only to its own program:
 *   an event for another program is denied and thrown (audit-visible) before any resolve/deposit; the gateway
 *   additionally rejects a mismatched relationship/container and any signature from an untrusted issuer.
 * - **No raw customerID on the Solid surface (invariant 2).** The customerID is used ONLY to resolve the
 *   mapping; the deposited record, its URI and the receipt carry only opaque identifiers.
 * - **Stable namespaced idempotency (T-24).** The gateway dedups the source-event tuple and the receipt
 *   signer dedups the protected key, so replaying a source event creates NO duplicate logical receipt.
 * - **Observable + recoverable (fail closed).** An unresolved mapping or a failed deposit leaves the outbox
 *   row PENDING with an observable reconciliation; a later drain resumes it.
 */
export class DataboxBridge {
  private readonly identity: ProgramServiceIdentity;
  private readonly profile: InstitutionProfile;
  private readonly outbox: TransactionalSourceOutbox;
  private readonly resolver: RelationshipResolver;
  private readonly builder: InstitutionalRecordBuilder;
  private readonly gateway: DepositSubmissionGateway;
  private readonly gatewayBounds: GatewayBounds;
  private readonly issuerKeys: readonly TrustedIssuerKey[];
  private readonly receiptSigner: AcceptanceReceiptSigner;
  private readonly clock: () => string;
  private readonly durableCommit: DurableCommitConfirmer;
  /** The retained signed acceptance receipts, keyed by source-event id (exactly one per logical event). */
  private readonly retained = new Map<string, SignedAcceptanceReceipt>();

  public constructor(options: DataboxBridgeOptions) {
    this.identity = options.identity;
    this.profile = options.profile;
    this.outbox = options.outbox;
    this.resolver = options.resolver;
    this.builder = options.builder;
    this.gateway = options.gateway;
    this.gatewayBounds = options.gatewayBounds;
    this.issuerKeys = options.issuerKeys;
    this.receiptSigner = options.receiptSigner;
    this.clock = options.clock ?? ((): string => new Date().toISOString());
    this.durableCommit = options.durableCommit ?? ((input): DurableCommit => ({
      eventId: input.eventId,
      committedAt: input.committedAt,
      payloadDigest: input.payloadDigest,
      confirmed: true,
    }));
  }

  /** The retained acceptance receipt for a source event, or `undefined` if none was reconciled. */
  public retainedReceipt(sourceEventId: string): SignedAcceptanceReceipt | undefined {
    return this.retained.get(sourceEventId);
  }

  /**
   * Drain the bridge's OWN program scope and deposit each pending committed event, in commit order. Safe to
   * re-run: reconciled rows are not re-drained, and a still-pending row (unresolved/failed) is resumed.
   */
  public async drain(): Promise<readonly BridgeDepositReport[]> {
    const reports: BridgeDepositReport[] = [];
    const scope = { organisation: this.identity.organisation, program: this.identity.program };
    for (const committed of this.outbox.drain(scope)) {
      reports.push(await this.deposit(committed.event));
    }
    return reports;
  }

  /**
   * Deposit ONE source event. Fails closed if the event is for another program (T-02, thrown + audit-visible
   * before any work). Otherwise runs the pipeline; a transient failure (e.g. durable commit unavailable) is
   * caught and recorded as an observable, recoverable failure rather than propagated.
   */
  public async deposit(event: SourceEvent): Promise<BridgeDepositReport> {
    if (event.organisation !== this.identity.organisation || event.program !== this.identity.program) {
      throw new ForbiddenHttpError(
        `Bridge ${this.identity.serviceIdentity} may not deposit into program ` +
        `${event.organisation}/${event.program}: no cross-program role (T-02).`,
      );
    }
    try {
      return await this.tryDeposit(event);
    } catch {
      // Fail closed + recoverable: leave the row pending with a non-leaking reason (T-23); a later drain
      // resumes it. The gateway already deduped this event, so the resumed attempt cannot double-issue.
      return this.record(event.sourceEventId, 'failed', 'deposit-failed');
    }
  }

  /** The resolve → build → deposit → durable-commit → receipt pipeline for one in-program event. */
  private async tryDeposit(event: SourceEvent): Promise<BridgeDepositReport> {
    const relationship = await this.resolver.resolve({
      organisation: event.organisation,
      program: event.program,
      sourceSystem: event.sourceSystem,
      customerIdNamespace: event.customerIdNamespace,
      customerId: event.customerId,
    });
    if (!relationship) {
      // No active mapping: quarantine for review, never guess a box (ADR-0016 §Failure). Recoverable once
      // the relationship is provisioned and the drain re-runs.
      return this.record(event.sourceEventId, 'unresolved', 'mapping-unresolved');
    }
    /* istanbul ignore next -- the resolver derives a program-scoped key, so a cross-program record is unreachable. */
    if (relationship.organisation !== this.identity.organisation || relationship.program !== this.identity.program) {
      throw new ForbiddenHttpError('Resolved relationship is outside the bridge program (cross-program denied).');
    }

    const policy = this.policyFor(event.recordClass);
    if (!policy) {
      return this.record(event.sourceEventId, 'failed', 'unknown-record-class');
    }

    const signed = this.builder.build(event, relationship, policy.claim);
    const request: DepositRequest = {
      operation: 'deposit',
      target: signed.target,
      mediaType: signed.mediaType,
      body: signed.body,
      purpose: event.purpose,
      policyRef: policy.claim,
      addressedRelationshipId: relationship.relationshipId,
      recordClass: event.recordClass,
      legalBasis: event.legalBasis,
      signature: signed.signature,
      idempotency: {
        organisation: event.organisation,
        program: event.program,
        sourceSystem: event.sourceSystem,
        eventType: event.eventType,
        sourceEventId: event.sourceEventId,
      },
    };

    const outcome = await this.gateway.validateDeposit(request, this.gatewayContext(relationship));
    if (outcome.status === 'rejected') {
      return this.record(event.sourceEventId, 'failed', outcome.rejection.code);
    }
    /* istanbul ignore next -- the bridge only deposits RDF/JSON, so the gateway never quarantines here. */
    if (outcome.status === 'quarantined') {
      return this.record(event.sourceEventId, 'failed', 'unexpected-quarantine');
    }
    // Accepted or duplicate: durably commit, then retain the signed acceptance receipt (exactly one).
    return this.retainReceipt(event, relationship, signed, outcome.acceptance, policy.odrlProfile);
  }

  /** Build the gateway context for a resolved relationship, scoped to THIS bridge's service identity. */
  private gatewayContext(relationship: RelationshipRecord): GatewayContext {
    const tenant = freezeTenantContext({
      organisation: relationship.organisation,
      program: relationship.program,
      tenantId: tenantIdOf(relationship.organisation, relationship.program),
      boxId: relationship.boxId,
      boxRoot: relationship.boxRoot,
      relationshipId: relationship.relationshipId,
      serviceIdentity: this.identity.serviceIdentity,
    });
    return { profile: this.profile, tenant, bounds: this.gatewayBounds, issuerKeys: this.issuerKeys };
  }

  /** Durably commit the accepted deposit and issue + retain its signed acceptance receipt. */
  private async retainReceipt(
    event: SourceEvent,
    relationship: RelationshipRecord,
    signed: SignedInstitutionalRecord,
    acceptance: GatewayAcceptance,
    odrlProfile: string,
  ): Promise<BridgeDepositReport> {
    const payloadDigest = `urn:sha256:${signed.payloadDigest}`;
    const committedAt = this.clock();
    const commit = await this.durableCommit({
      eventId: event.sourceEventId,
      committedAt,
      payloadDigest,
      resource: signed.record.resource,
      target: signed.target,
      body: signed.body,
      mediaType: signed.mediaType,
    });

    const request: AcceptanceReceiptRequest = {
      transaction: `txn-${relationship.relationshipId}-${event.sourceEventId}`,
      acceptedResource: signed.record.resource,
      payloadDigest,
      sender: this.identity.issuer,
      addressedRelationship: relationship.relationshipId,
      operation: 'deposit',
      profileVersion: this.profile.profileVersion,
      profileDigest: this.profile.compiledPolicy.profileDigest,
      policyDigest: `urn:sha256:${sha256Hex(JSON.stringify({ ...signed.record.policyRef, odrlProfile }))}`,
      odrlPolicy: odrlProfile,
      activatedDuties: [],
      durableCommit: commit,
      acceptedAt: committedAt,
      // A deposit always carries a namespaced tuple, so the gateway always echoes the protected key here.
      idempotencyKey: acceptance.idempotencyKey,
    };
    const issued = this.receiptSigner.issue(request);
    this.retained.set(event.sourceEventId, issued.receipt);

    const reconciliation: BridgeReconciliation = {
      sourceEventId: event.sourceEventId,
      status: 'reconciled',
      relationshipId: relationship.relationshipId,
      acceptedResource: signed.record.resource,
      receiptId: issued.receipt.receiptId,
      payloadDigest,
      at: committedAt,
      idempotencyKey: acceptance.idempotencyKey,
    };
    this.outbox.markReconciled(event.sourceEventId, reconciliation);
    return { status: 'reconciled', reconciliation, acceptance, receipt: issued.receipt };
  }

  /** Record a non-reconciled (unresolved/failed) disposition, keeping the outbox row pending + observable. */
  private record(
    sourceEventId: string,
    status: 'unresolved' | 'failed',
    reason: string,
  ): BridgeDepositReport {
    const reconciliation: BridgeReconciliation = { sourceEventId, status, reason, at: this.clock() };
    this.outbox.markReconciled(sourceEventId, reconciliation);
    return { status, reconciliation };
  }

  /** Resolve a record class to its versioned policy template + ODRL profile from the validated profile. */
  private policyFor(recordClass: string): ResolvedPolicy | undefined {
    const rc = this.profile.recordClasses.find((entry): boolean => entry.id === recordClass);
    if (!rc) {
      return undefined;
    }
    const template = this.profile.policies.templates.find((entry): boolean => entry.id === rc.policyTemplate);
    /* istanbul ignore next -- the profile validator guarantees every class template resolves. */
    if (!template) {
      return undefined;
    }
    return {
      claim: { policyTemplate: template.id, policyVersion: template.version },
      odrlProfile: template.odrlProfile,
    };
  }
}
