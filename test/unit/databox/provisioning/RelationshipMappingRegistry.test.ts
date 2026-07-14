import { InMemoryRelationshipMappingRegistry } from '../../../../src/databox/provisioning/RelationshipMappingRegistry';
import type { InstitutionalKey, RelationshipRecord } from '../../../../src/databox/provisioning/ProvisioningTypes';
import { InternalServerError } from '../../../../src/util/errors/InternalServerError';

function customer(customerId: string): InstitutionalKey {
  return {
    organisation: 'org-acme',
    program: 'prog-rewards',
    sourceSystem: 'sys-pos',
    customerIdNamespace: 'loyalty',
    customerId,
  };
}

function record(overrides: Partial<RelationshipRecord> = {}): RelationshipRecord {
  return {
    relationshipId: 'rel-1',
    boxId: 'box-1',
    boxRoot: 'https://databox.example/boxes/box-1/',
    pairwiseWebId: 'https://vault.example/profile/1#me',
    organisation: 'org-acme',
    program: 'prog-rewards',
    sourceSystem: 'sys-pos',
    status: 'active',
    provisionedAt: '2026-07-15T00:00:00.000Z',
    ...overrides,
  };
}

describe('An InMemoryRelationshipMappingRegistry', (): void => {
  let registry: InMemoryRelationshipMappingRegistry;

  beforeEach((): void => {
    registry = new InMemoryRelationshipMappingRegistry();
  });

  it('stores and resolves a relationship by its idempotency key.', async(): Promise<void> => {
    const stored = await registry.register({ idempotencyKey: 'idem-1', record: record(), customer: customer('c1') });
    expect(stored).toEqual(record());
    await expect(registry.findByIdempotencyKey('idem-1')).resolves.toEqual(record());
  });

  it('is idempotent: a second register with the same key returns the original record.', async(): Promise<void> => {
    const first = await registry.register({ idempotencyKey: 'idem-1', record: record(), customer: customer('c1') });
    const second = await registry.register({
      idempotencyKey: 'idem-1',
      record: record({ relationshipId: 'rel-2', boxId: 'box-2' }),
      customer: customer('c1'),
    });
    // The second attempt does not create a second box; it returns the first record unchanged.
    expect(second).toBe(first);
    await expect(registry.findByBoxId('box-2')).resolves.toBeUndefined();
  });

  it('refuses to reassign a box id already bound to another relationship (fail closed).', async(): Promise<void> => {
    await registry.register({ idempotencyKey: 'idem-1', record: record(), customer: customer('c1') });
    await expect(registry.register({
      idempotencyKey: 'idem-2',
      record: record({ relationshipId: 'rel-2', boxId: 'box-1' }),
      customer: customer('c2'),
    })).rejects.toThrow(InternalServerError);
  });

  it('resolves a relationship by its opaque box id (protected map).', async(): Promise<void> => {
    await registry.register({ idempotencyKey: 'idem-1', record: record(), customer: customer('c1') });
    await expect(registry.findByBoxId('box-1')).resolves.toEqual(record());
  });

  it('fails safely (undefined, no leak) for an unknown/guessed box id (T-06).', async(): Promise<void> => {
    await expect(registry.findByBoxId('box-guessed')).resolves.toBeUndefined();
    await expect(registry.findByIdempotencyKey('idem-guessed')).resolves.toBeUndefined();
  });

  it('exposes the raw customer only through the control-plane reverse-resolution path.', async(): Promise<void> => {
    await registry.register({ idempotencyKey: 'idem-1', record: record(), customer: customer('secret-cust') });
    await expect(registry.resolveCustomer('rel-1')).resolves.toEqual(customer('secret-cust'));
    // The stored, emitted record carries no customerId field.
    const stored = await registry.findByBoxId('box-1');
    expect(Object.keys(stored!)).not.toContain('customerId');
  });

  it('returns undefined resolving a customer for an unknown relationship.', async(): Promise<void> => {
    await expect(registry.resolveCustomer('rel-unknown')).resolves.toBeUndefined();
  });
});
