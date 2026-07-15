import type { KeyObject } from 'node:crypto';
import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { BadRequestHttpError } from '../../util/errors/BadRequestHttpError';
import { APPLICATION_LD_JSON } from '../../util/ContentTypes';
import { DataboxBridge } from '../bridge/DataboxBridge';
import type {
  BridgeDepositReport,
  DurableCommitConfirmer,
  ProgramServiceIdentity,
  SourceEvent,
} from '../bridge/DataboxBridge';
import { InstitutionalRecordBuilder } from '../bridge/InstitutionalRecordBuilder';
import { KeyedHmacRelationshipResolver } from '../bridge/RelationshipResolver';
import { InMemorySourceOutbox } from '../bridge/SourceOutbox';
import { StatusListManager } from '../credential/BitstringStatusList';
import { ConnectionCredentialIssuer } from '../credential/ConnectionCredentialIssuer';
import type { IssuedConnectionCredential } from '../credential/ConnectionCredentialIssuer';
import type { PublicJwk } from '../credential/ConnectionCredentialTypes';
import { publicJwkFromKeyObject } from '../credential/Es256';
import { BinaryEvidenceQuarantine, FailClosedScanner } from '../gateway/BinaryEvidenceQuarantine';
import { DepositSubmissionGateway } from '../gateway/DepositSubmissionGateway';
import type { GatewayBounds } from '../gateway/DepositSubmissionGateway';
import { IdempotencyRegistry } from '../gateway/IdempotencyRegistry';
import { DEFAULT_RDF_SHAPE_LIMITS } from '../gateway/RdfShapeValidator';
import { RandomOpaqueIdentifierGenerator } from '../identifiers/OpaqueIdentifierGenerator';
import type { InstitutionProfile } from '../profile/InstitutionProfile';
import { loadInstitutionProfile } from '../profile/InstitutionProfileValidator';
import { DataboxProvisioner } from '../provisioning/DataboxProvisioner';
import { InMemoryRelationshipMappingRegistry } from '../provisioning/RelationshipMappingRegistry';
import type { ProvisionResult } from '../provisioning/ProvisioningTypes';
import { AcceptanceReceiptSigner } from '../receipt/AcceptanceReceiptSigner';

/** Business-controlled settings for one program in the mapping forge. */
export interface ForgeProgramInput {
  readonly profile: unknown;
  readonly programUri: string;
  readonly databoxBaseUrl: string;
  readonly issuer?: string;
}

export interface ForgeProgramSummary {
  readonly profileId: string;
  readonly profileVersion: string;
  readonly programUri: string;
  readonly databoxBaseUrl: string;
  readonly recordClasses: readonly string[];
  readonly submissionClasses: readonly string[];
}

export interface ForgeMappingInput {
  readonly profileId: string;
  readonly sourceSystem: string;
  readonly customerIdNamespace: string;
  /** Control-plane PII. Deliberately absent from ForgeMappingResult. */
  readonly customerId: string;
  readonly pairwiseWebId: string;
  readonly holderPublicJwk: PublicJwk;
}

export interface ForgeMappingResult {
  readonly provisioning: ProvisionResult;
  readonly credential: IssuedConnectionCredential;
}

export interface ForgeSourceEventInput {
  readonly profileId: string;
  readonly sourceSystem: string;
  readonly eventType: string;
  readonly sourceEventId: string;
  readonly customerIdNamespace: string;
  /** Control-plane PII. Deliberately absent from BridgeDepositReport. */
  readonly customerId: string;
  readonly recordClass: string;
  readonly legalBasis: string;
  readonly purpose: string;
  readonly payload: Readonly<Record<string, unknown>>;
}

interface ProgramRuntime {
  readonly profile: InstitutionProfile;
  readonly summary: ForgeProgramSummary;
  readonly provisioner: DataboxProvisioner;
  readonly credentialIssuer: ConnectionCredentialIssuer;
  readonly status: StatusListManager;
  readonly statusListCredential: string;
  readonly outbox: InMemorySourceOutbox;
  readonly bridge: DataboxBridge;
}

export interface MappingForgeOptions {
  readonly now?: () => string;
  readonly keyFactory?: () => { readonly publicKey: KeyObject; readonly privateKey: KeyObject };
  readonly secretFactory?: () => Buffer;
  /** Optional live storage/provisioning sink. The reference default remains in-memory. */
  readonly durableCommit?: DurableCommitConfirmer;
  /** Creates the Solid container/ACL surface after a relationship is provisioned. */
  readonly provision?: (result: ProvisionResult) => Promise<void>;
}

/** Control plane for validating profiles, forging mappings, issuing credentials, and bridging source events. */
export class MappingForge {
  private readonly programs = new Map<string, ProgramRuntime>();
  private readonly registry = new InMemoryRelationshipMappingRegistry();
  private readonly now: () => string;
  private readonly keyFactory: () => { readonly publicKey: KeyObject; readonly privateKey: KeyObject };
  private readonly secretFactory: () => Buffer;
  private readonly durableCommit?: DurableCommitConfirmer;
  private readonly provision?: (result: ProvisionResult) => Promise<void>;

  public constructor(options: MappingForgeOptions = {}) {
    this.now = options.now ?? ((): string => new Date().toISOString());
    this.keyFactory = options.keyFactory ??
      ((): { publicKey: KeyObject; privateKey: KeyObject } => generateKeyPairSync('ec', { namedCurve: 'P-256' }));
    this.secretFactory = options.secretFactory ?? ((): Buffer => randomBytes(32));
    this.durableCommit = options.durableCommit;
    this.provision = options.provision;
  }

  public registerProgram(input: ForgeProgramInput): ForgeProgramSummary {
    const profile = loadInstitutionProfile(input.profile);
    if (this.programs.has(profile.profileId)) {
      throw new BadRequestHttpError(`Program '${profile.profileId}' is already registered.`);
    }
    requireHttps(input.programUri, 'programUri');
    requireHttps(input.databoxBaseUrl, 'databoxBaseUrl');
    const issuer = input.issuer ?? `${new URL(input.programUri).origin}/databox/issuer`;
    requireHttps(issuer, 'issuer');

    const keys = this.keyFactory();
    const secret = this.secretFactory();
    const provisioner = new DataboxProvisioner(
      new RandomOpaqueIdentifierGenerator(input.databoxBaseUrl),
      this.registry,
      { secretFactory: (): Buffer => secret, clock: this.now },
    );
    const identity: ProgramServiceIdentity = {
      organisation: profile.program.principal.id,
      program: profile.profileId,
      programPrincipal: profile.program.principal.id,
      serviceIdentity: `${new URL(input.programUri).origin}/databox/bridge`,
      issuer,
    };
    const outbox = new InMemorySourceOutbox({ clock: this.now });
    const resolver = new KeyedHmacRelationshipResolver(this.registry, { secretFactory: (): Buffer => secret });
    const gateway = new DepositSubmissionGateway(
      new IdempotencyRegistry(),
      new BinaryEvidenceQuarantine(new FailClosedScanner()),
    );
    const bounds: GatewayBounds = {
      default: { maxBytes: 1_000_000, allowedMediaTypes: [ APPLICATION_LD_JSON ]},
      rdf: { pinnedContexts: [], limits: DEFAULT_RDF_SHAPE_LIMITS },
    };
    const bridge = new DataboxBridge({
      identity,
      profile,
      outbox,
      resolver,
      builder: new InstitutionalRecordBuilder(identity, keys.privateKey, { clock: this.now }),
      gateway,
      gatewayBounds: bounds,
      issuerKeys: [{ issuer, publicKey: publicJwkFromKeyObject(keys.publicKey) }],
      receiptSigner: new AcceptanceReceiptSigner(issuer, keys.privateKey, `${issuer}#key-1`),
      clock: this.now,
      ...this.durableCommit === undefined ? {} : { durableCommit: this.durableCommit },
    });
    const summary: ForgeProgramSummary = {
      profileId: profile.profileId,
      profileVersion: profile.profileVersion,
      programUri: input.programUri,
      databoxBaseUrl: input.databoxBaseUrl,
      recordClasses: profile.recordClasses.map((entry): string => entry.id),
      submissionClasses: profile.submissionClasses.map((entry): string => entry.id),
    };
    const statusListCredential = `${issuer}/status/1`;
    this.programs.set(profile.profileId, {
      profile,
      summary,
      provisioner,
      credentialIssuer: new ConnectionCredentialIssuer(issuer, keys.privateKey, `${issuer}#key-1`),
      status: new StatusListManager(statusListCredential),
      statusListCredential,
      outbox,
      bridge,
    });
    return summary;
  }

  public listPrograms(): readonly ForgeProgramSummary[] {
    return [ ...this.programs.values() ].map((runtime): ForgeProgramSummary => runtime.summary);
  }

  public async forgeMapping(input: ForgeMappingInput): Promise<ForgeMappingResult> {
    const runtime = this.requireProgram(input.profileId);
    const provisioning = await runtime.provisioner.provision(runtime.profile, {
      organisation: runtime.profile.program.principal.id,
      program: runtime.profile.profileId,
      sourceSystem: input.sourceSystem,
      customerIdNamespace: input.customerIdNamespace,
      customerId: input.customerId,
    }, input.pairwiseWebId);
    await this.provision?.(provisioning);
    const statusListIndex = runtime.status.register(provisioning.relationship.relationshipId);
    const credential = runtime.credentialIssuer.issue({
      pairwiseWebId: input.pairwiseWebId,
      holderPublicJwk: input.holderPublicJwk,
      program: runtime.summary.programUri,
      databox: provisioning.databox.root,
      storageDescription: `${provisioning.databox.root}.well-known/solid`,
      accessGrant: { id: `${provisioning.databox.root}access-grant`, bytes: JSON.stringify(provisioning.policyRefs) },
      accessProfile: 'solid-databox-access/1.0',
      conformsTo: [ 'https://www.w3.org/TR/solid-protocol/', 'https://w3id.org/solid-databox/profile/v1' ],
      syncProfile: 'solid-databox-sync/1.0',
      relationship: provisioning.relationship.relationshipId,
      statusListIndex,
      statusListCredential: runtime.statusListCredential,
    });
    return { provisioning, credential };
  }

  public async depositSourceEvent(input: ForgeSourceEventInput): Promise<BridgeDepositReport> {
    const runtime = this.requireProgram(input.profileId);
    const event: SourceEvent = {
      organisation: runtime.profile.program.principal.id,
      program: runtime.profile.profileId,
      sourceSystem: input.sourceSystem,
      eventType: input.eventType,
      sourceEventId: input.sourceEventId,
      customerIdNamespace: input.customerIdNamespace,
      customerId: input.customerId,
      recordClass: input.recordClass,
      legalBasis: input.legalBasis,
      purpose: input.purpose,
      payload: input.payload,
    };
    runtime.outbox.commit(event);
    const reports = await runtime.bridge.drain();
    const report = reports.find((entry): boolean => entry.reconciliation.sourceEventId === input.sourceEventId);
    if (!report) {
      throw new BadRequestHttpError(`Source event '${input.sourceEventId}' is already reconciled.`);
    }
    return report;
  }

  private requireProgram(profileId: string): ProgramRuntime {
    const runtime = this.programs.get(profileId);
    if (!runtime) {
      throw new BadRequestHttpError(`Unknown program profile '${profileId}'.`);
    }
    return runtime;
  }
}

function requireHttps(value: string, field: string): void {
  try {
    const parsed = new URL(value);
    const loopback = parsed.protocol === 'http:' &&
      (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1' || parsed.hostname === '::1');
    if (parsed.protocol !== 'https:' && !loopback) {
      throw new Error('not https');
    }
  } catch {
    throw new BadRequestHttpError(`Forge field '${field}' must be an absolute HTTPS URL or HTTP loopback URL.`);
  }
}
