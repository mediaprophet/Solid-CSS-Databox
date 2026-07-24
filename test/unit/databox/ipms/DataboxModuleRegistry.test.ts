import { InMemoryDataboxModuleRegistry } from '../../../../src/databox/ipms/DataboxModuleRegistry';
import type { SolidModuleManifest } from '../../../../src/databox/ipms/SolidModuleManifest';

describe('An InMemoryDataboxModuleRegistry', (): void => {
  let registry: InMemoryDataboxModuleRegistry;
  const manifest: SolidModuleManifest = {
    id: 'hosting',
    name: 'Hosting',
    version: '0.1.0',
    description: 'Domain / hosting setup.',
    capabilities: [ 'hosting' ],
    routes: [ '/hosting' ],
    adminUi: { navLabel: 'Domains & Hosting', path: '/hosting' },
  };

  beforeEach((): void => {
    registry = new InMemoryDataboxModuleRegistry();
  });

  it('registers and retrieves a module.', (): void => {
    registry.register(manifest);
    expect(registry.get('hosting')).toBe(manifest);
    expect(registry.list()).toEqual([ manifest ]);
  });

  it('returns undefined for an unknown module.', (): void => {
    expect(registry.get('nope')).toBeUndefined();
  });

  it('rejects a manifest with an empty id.', (): void => {
    expect((): void => registry.register({ ...manifest, id: '' }))
      .toThrow('A module manifest must have a non-empty id.');
  });

  it('rejects re-registering the same id.', (): void => {
    registry.register(manifest);
    expect((): void => registry.register(manifest))
      .toThrow('Module hosting is already registered.');
  });

  it('keeps modules disabled until enabled, and toggles both ways.', (): void => {
    registry.register(manifest);
    expect(registry.isEnabled('hosting')).toBe(false);
    expect(registry.listEnabled()).toEqual([]);

    registry.setEnabled('hosting', true);
    expect(registry.isEnabled('hosting')).toBe(true);
    expect(registry.listEnabled()).toEqual([ manifest ]);

    registry.setEnabled('hosting', false);
    expect(registry.isEnabled('hosting')).toBe(false);
    expect(registry.listEnabled()).toEqual([]);
  });

  it('rejects toggling the enabled state of an unknown module.', (): void => {
    expect((): void => registry.setEnabled('nope', true))
      .toThrow('Cannot change enabled state of unknown module nope.');
  });
});
