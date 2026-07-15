import { KeyedHmacRelationshipResolver } from '../../../../src/databox/bridge/RelationshipResolver';
import { RandomOpaqueIdentifierGenerator } from '../../../../src/databox/identifiers/OpaqueIdentifierGenerator';
import { DataboxProvisioner } from '../../../../src/databox/provisioning/DataboxProvisioner';
import { InMemoryRelationshipMappingRegistry } from '../../../../src/databox/provisioning/RelationshipMappingRegistry';
import type { InstitutionalKey } from '../../../../src/databox/provisioning/ProvisioningTypes';
import { BadRequestHttpError } from '../../../../src/util/errors/BadRequestHttpError';
import { loadRetailProfile, retailKey, SHARED_SECRET } from './BridgeTestHarness';

function key(overrides: Partial<InstitutionalKey> = {}): InstitutionalKey {
  return { ...retailKey('cust-1'), ...overrides };
}

describe('A KeyedHmacRelationshipResolver', (): void => {
  it('resolves the opaque relationship a provisioned mapping is stored under.', async(): Promise<void> => {
    const registry = new InMemoryRelationshipMappingRegistry();
    const provisioner = new DataboxProvisioner(
      new RandomOpaqueIdentifierGenerator('https://databox.example/boxes/'),
      registry,
      { secretFactory: SHARED_SECRET },
    );
    const provisioned = await provisioner.provision(loadRetailProfile(), key(), 'https://vault.example/p#me');

    const resolver = new KeyedHmacRelationshipResolver(registry, { secretFactory: SHARED_SECRET });
    const resolved = await resolver.resolve(key());
    expect(resolved?.relationshipId).toBe(provisioned.relationship.relationshipId);
    expect(resolved?.boxId).toBe(provisioned.relationship.boxId);
  });

  it('returns undefined for an unmapped key, reusing the per-program secret.', async(): Promise<void> => {
    const registry = new InMemoryRelationshipMappingRegistry();
    const resolver = new KeyedHmacRelationshipResolver(registry);
    await expect(resolver.resolve(key())).resolves.toBeUndefined();
    // A second resolve in the same program reuses the cached secret (no crash / no re-mint path).
    await expect(resolver.resolve(key({ customerId: 'cust-2' }))).resolves.toBeUndefined();
  });

  it('fails closed on a malformed institutional key.', async(): Promise<void> => {
    const resolver = new KeyedHmacRelationshipResolver(new InMemoryRelationshipMappingRegistry());
    await expect(resolver.resolve(key({ customerId: '' }))).rejects.toThrow(BadRequestHttpError);
  });
});
