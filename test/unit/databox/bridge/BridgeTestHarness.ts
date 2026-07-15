import type { KeyObject } from 'node:crypto';
import { generateKeyPairSync } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DataboxBridge } from '../../../../src/databox/bridge/DataboxBridge';
import type { DataboxBridgeOptions, ProgramServiceIdentity } from '../../../../src/databox/bridge/DataboxBridge';
import { InstitutionalRecordBuilder } from '../../../../src/databox/bridge/InstitutionalRecordBuilder';
import { KeyedHmacRelationshipResolver } from '../../../../src/databox/bridge/RelationshipResolver';
import { InMemorySourceOutbox } from '../../../../src/databox/bridge/SourceOutbox';
import { publicJwkFromKeyObject } from '../../../../src/databox/credential/Es256';
import { APPLICATION_LD_JSON } from '../../../../src/util/ContentTypes';
import {
  DepositSubmissionGateway,
} from '../../../../src/databox/gateway/DepositSubmissionGateway';
import type { GatewayBounds } from '../../../../src/databox/gateway/DepositSubmissionGateway';
import { BinaryEvidenceQuarantine, FailClosedScanner } from '../../../../src/databox/gateway/BinaryEvidenceQuarantine';
import { IdempotencyRegistry } from '../../../../src/databox/gateway/IdempotencyRegistry';
import { DEFAULT_RDF_SHAPE_LIMITS } from '../../../../src/databox/gateway/RdfShapeValidator';
import { RandomOpaqueIdentifierGenerator } from '../../../../src/databox/identifiers/OpaqueIdentifierGenerator';
import type { InstitutionProfile } from '../../../../src/databox/profile/InstitutionProfile';
import { loadInstitutionProfile } from '../../../../src/databox/profile/InstitutionProfileValidator';
import { DataboxProvisioner } from '../../../../src/databox/provisioning/DataboxProvisioner';
import { InMemoryRelationshipMappingRegistry } from '../../../../src/databox/provisioning/RelationshipMappingRegistry';
import type { InstitutionalKey, RelationshipRecord } from '../../../../src/databox/provisioning/ProvisioningTypes';
import { AcceptanceReceiptSigner } from '../../../../src/databox/receipt/AcceptanceReceiptSigner';

/**
 * Shared synthetic-only harness for the DBX-22 bridge tests. It builds two isolated synthetic programs
 * (RetailCo + AgencyCo), a shared protected mapping registry, and a per-program bridge. No real
 * organisation or customer data appears anywhere here.
 */

/** A deterministic per-program HMAC secret shared between the provisioner and the resolver (so lookups match). */
export function SHARED_SECRET(): Buffer {
  return Buffer.alloc(32, 7);
}

export const BOX_BASE = 'https://databox.example/boxes/';

/** An ES256 (P-256) keypair as `node:crypto` key objects. */
export interface KeyPair {
  readonly publicKey: KeyObject;
  readonly privateKey: KeyObject;
}

export function generateEs256KeyPair(): KeyPair {
  return generateKeyPairSync('ec', { namedCurve: 'P-256' });
}

/** Load the DBX-08 synthetic loyalty profile (RetailCo's program facts). */
export function loadRetailProfile(): InstitutionProfile {
  const raw = readFileSync(
    join(__dirname, '../../../../databox/fixtures/loyalty-institution-profile.json'),
    'utf8',
  );
  return loadInstitutionProfile(JSON.parse(raw));
}

/**
 * Build AgencyCo's profile by cloning the loyalty profile and swapping in an agency `service-notice` record
 * class + its retention and system-of-record. It is a distinct synthetic program; it still validates.
 */
export function loadAgencyProfile(): InstitutionProfile {
  const raw = readFileSync(
    join(__dirname, '../../../../databox/fixtures/loyalty-institution-profile.json'),
    'utf8',
  );
  const clone = JSON.parse(raw) as Record<string, unknown>;
  clone.profileId = 'prog-agencyco-services';
  (clone.recordClasses as Record<string, unknown>[]).push({
    id: 'rc-service-notice',
    label: 'Agency service notice (SYNTHETIC)',
    minimumAssurance: [{ dimension: 'identityProofing', minLevel: 1 }],
    policyTemplate: 'pt-records',
    legalBasis: 'lb-legal-obligation',
    purposes: [ 'p-safety' ],
    existenceVisibility: 'visible',
  });
  (clone.retention as Record<string, unknown>[]).push({
    recordClass: 'rc-service-notice',
    retentionDays: 1825,
    deletionMode: 'tombstone',
    tombstoneOnExpiry: true,
  });
  (clone.systemsOfRecord as Record<string, unknown>[]).push({
    id: 'sor-agency-notices',
    label: 'Agency notices (SYNTHETIC)',
    recordClasses: [ 'rc-service-notice' ],
  });
  return loadInstitutionProfile(clone);
}

/** Generous synthetic gateway bounds: JSON-LD allowed, no pinned contexts needed (records carry none). */
export function bounds(): GatewayBounds {
  return {
    default: { maxBytes: 1_000_000, allowedMediaTypes: [ APPLICATION_LD_JSON ]},
    rdf: { pinnedContexts: [], limits: DEFAULT_RDF_SHAPE_LIMITS },
  };
}

/** A shared registry + provisioner using the deterministic shared secret. */
export interface Plane {
  readonly registry: InMemoryRelationshipMappingRegistry;
  readonly provisioner: DataboxProvisioner;
}

export function makePlane(): Plane {
  let counter = 0;
  const registry = new InMemoryRelationshipMappingRegistry();
  const provisioner = new DataboxProvisioner(new RandomOpaqueIdentifierGenerator(BOX_BASE), registry, {
    relationshipIdFactory: (): string => {
      counter += 1;
      return `rel-${counter}`;
    },
    secretFactory: SHARED_SECRET,
    clock: (): string => '2026-07-15T00:00:00.000Z',
  });
  return { registry, provisioner };
}

/** Provision a relationship for a typed institutional key, returning the opaque record. */
export async function provision(
  plane: Plane,
  profile: InstitutionProfile,
  key: InstitutionalKey,
): Promise<RelationshipRecord> {
  const result = await plane.provisioner.provision(profile, key, 'https://vault.example/profile/1#me');
  return result.relationship;
}

/** Options for {@link makeBridge}: which program, profile, key material and injectable seams. */
export interface BridgeSetup {
  readonly identity: ProgramServiceIdentity;
  readonly profile: InstitutionProfile;
  readonly registry: InMemoryRelationshipMappingRegistry;
  readonly keys: KeyPair;
  readonly clock?: () => string;
  readonly durableCommit?: DataboxBridgeOptions['durableCommit'];
  readonly gateway?: DepositSubmissionGateway;
}

/** Assemble a fully-wired bridge (outbox, resolver, builder, gateway, receipt signer). */
export function makeBridge(setup: BridgeSetup): {
  bridge: DataboxBridge;
  outbox: InMemorySourceOutbox;
} {
  const clock = setup.clock ?? ((): string => '2026-07-15T01:00:00.000Z');
  const outbox = new InMemorySourceOutbox({ clock });
  const resolver = new KeyedHmacRelationshipResolver(setup.registry, { secretFactory: SHARED_SECRET });
  const builder = new InstitutionalRecordBuilder(setup.identity, setup.keys.privateKey, { clock });
  const gateway = setup.gateway ??
    new DepositSubmissionGateway(new IdempotencyRegistry(), new BinaryEvidenceQuarantine(new FailClosedScanner()));
  const receiptSigner = new AcceptanceReceiptSigner(
    setup.identity.issuer,
    setup.keys.privateKey,
    `${setup.identity.issuer}#key-1`,
  );
  const options: DataboxBridgeOptions = {
    identity: setup.identity,
    profile: setup.profile,
    outbox,
    resolver,
    builder,
    gateway,
    gatewayBounds: bounds(),
    issuerKeys: [{ issuer: setup.identity.issuer, publicKey: publicJwkFromKeyObject(setup.keys.publicKey) }],
    receiptSigner,
    ...setup.clock === undefined ? {} : { clock },
    ...setup.durableCommit === undefined ? {} : { durableCommit: setup.durableCommit },
  };
  return { bridge: new DataboxBridge(options), outbox };
}

/** The RetailCo typed institutional key for a synthetic customer. */
export function retailKey(customerId = 'CUSTOMER-SECRET-42'): InstitutionalKey {
  return {
    organisation: 'org-retailco',
    program: 'prog-retailco-loyalty',
    sourceSystem: 'sor-pos',
    customerIdNamespace: 'loyalty',
    customerId,
  };
}

/** The AgencyCo typed institutional key for a synthetic customer. */
export function agencyKey(customerId = 'CLIENT-SECRET-99'): InstitutionalKey {
  return {
    organisation: 'org-agencyco',
    program: 'prog-agencyco-services',
    sourceSystem: 'sor-catalog',
    customerIdNamespace: 'agency',
    customerId,
  };
}

/** RetailCo's program service identity (distinct principal, service actor and signer, HD-02). */
export const RETAIL_IDENTITY: ProgramServiceIdentity = {
  organisation: 'org-retailco',
  program: 'prog-retailco-loyalty',
  programPrincipal: 'https://retailco.example/id/organisation',
  serviceIdentity: 'https://retailco.example/id/bridge-service',
  issuer: 'https://retailco.example/id/records-signer',
};

/** AgencyCo's program service identity. */
export const AGENCY_IDENTITY: ProgramServiceIdentity = {
  organisation: 'org-agencyco',
  program: 'prog-agencyco-services',
  programPrincipal: 'https://agencyco.example/id/organisation',
  serviceIdentity: 'https://agencyco.example/id/bridge-service',
  issuer: 'https://agencyco.example/id/records-signer',
};
