import type { ProgramServiceIdentity, SourceEvent } from '../../../../src/databox/bridge/BridgeTypes';
import { InstitutionalRecordBuilder } from '../../../../src/databox/bridge/InstitutionalRecordBuilder';
import {
  keyObjectFromPublicJwk,
  publicJwkFromKeyObject,
  sha256Hex,
  verifyCompactJws,
} from '../../../../src/databox/credential/Es256';
import type { PolicyRefClaim } from '../../../../src/databox/gateway/GatewayTypes';
import type { RelationshipRecord } from '../../../../src/databox/provisioning/ProvisioningTypes';
import { generateEs256KeyPair, RETAIL_IDENTITY } from './BridgeTestHarness';

const RELATIONSHIP: RelationshipRecord = {
  relationshipId: 'rel-opaque-1',
  boxId: 'box-opaque-1',
  boxRoot: 'https://databox.example/boxes/box-opaque-1/',
  pairwiseWebId: 'https://vault.example/p#me',
  organisation: 'org-retailco',
  program: 'prog-retailco-loyalty',
  sourceSystem: 'sor-pos',
  status: 'active',
  provisionedAt: '2026-07-15T00:00:00.000Z',
};

const POLICY: PolicyRefClaim = { policyTemplate: 'pt-records', policyVersion: '1.0.0' };

function event(overrides: Partial<SourceEvent> = {}): SourceEvent {
  return {
    organisation: 'org-retailco',
    program: 'prog-retailco-loyalty',
    sourceSystem: 'sor-pos',
    eventType: 'receipt',
    sourceEventId: 'evt-1',
    customerIdNamespace: 'loyalty',
    customerId: 'CUSTOMER-SECRET-42',
    recordClass: 'rc-receipt',
    legalBasis: 'lb-contract',
    purpose: 'p-account',
    payload: { receiptId: 'rcpt-1' },
    ...overrides,
  };
}

describe('An InstitutionalRecordBuilder', (): void => {
  it('builds an opaque, signed record that binds the exact payload digest.', (): void => {
    const keys = generateEs256KeyPair();
    const builder = new InstitutionalRecordBuilder(RETAIL_IDENTITY, keys.privateKey, {
      clock: (): string => '2026-07-15T02:00:00.000Z',
    });
    const signed = builder.build(event(), RELATIONSHIP, POLICY);

    expect(signed.target).toBe('https://databox.example/boxes/box-opaque-1/records/rc-receipt/');
    expect(signed.record.resource.startsWith(signed.target)).toBe(true);
    expect(signed.record.box).toBe('box-opaque-1');
    expect(signed.record.supersedes).toBeNull();
    // The raw customerID never enters the envelope or the resource URI (invariant 2).
    expect(JSON.stringify(signed.record)).not.toContain('CUSTOMER-SECRET-42');
    expect(signed.record.resource).not.toContain('CUSTOMER-SECRET-42');
    // The digest is of the exact bytes; the signature binds it.
    expect(signed.payloadDigest).toBe(sha256Hex(signed.body));
    const verifyKey = keyObjectFromPublicJwk(publicJwkFromKeyObject(keys.publicKey));
    const decoded = verifyCompactJws(signed.signature.jws, verifyKey);
    expect(decoded.payload.payloadDigest).toBe(`urn:sha256:${signed.payloadDigest}`);
    expect(signed.signature.issuer).toBe(RETAIL_IDENTITY.issuer);
  });

  it('records provenance identifying the distinct software actor and program principal (HD-02).', (): void => {
    const builder = new InstitutionalRecordBuilder(RETAIL_IDENTITY, generateEs256KeyPair().privateKey, {
      clock: (): string => '2026-07-15T02:00:00.000Z',
    });
    const identity: ProgramServiceIdentity = RETAIL_IDENTITY;
    const signed = builder.build(event(), RELATIONSHIP, POLICY);
    expect(signed.record.provenance.softwareActor).toBe(identity.serviceIdentity);
    expect(signed.record.provenance.programPrincipal).toBe(identity.programPrincipal);
    expect(signed.record.provenance.softwareActor).not.toBe(signed.record.provenance.programPrincipal);
  });

  it('carries a supersession pointer for a recall update.', (): void => {
    const builder = new InstitutionalRecordBuilder(RETAIL_IDENTITY, generateEs256KeyPair().privateKey, {
      clock: (): string => '2026-07-15T02:00:00.000Z',
    });
    const signed = builder.build(
      event({ supersedes: { sourceEventId: 'evt-0', resource: 'https://databox.example/boxes/box-opaque-1/records/rc-receipt/rec-old' }}),
      RELATIONSHIP,
      POLICY,
    );
    expect(signed.record.supersedes).toBe('https://databox.example/boxes/box-opaque-1/records/rc-receipt/rec-old');
  });

  it('uses a real clock by default.', (): void => {
    const builder = new InstitutionalRecordBuilder(RETAIL_IDENTITY, generateEs256KeyPair().privateKey);
    const signed = builder.build(event(), RELATIONSHIP, POLICY);
    expect(Number.isNaN(Date.parse(signed.record.provenance.signedAt))).toBe(false);
  });
});
