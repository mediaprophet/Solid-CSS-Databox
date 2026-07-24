import { BasicRepresentation } from '../../../../src/http/representation/BasicRepresentation';
import type { Representation } from '../../../../src/http/representation/Representation';
import type { ResourceIdentifier } from '../../../../src/http/representation/ResourceIdentifier';
import { ModuleConfigStore } from '../../../../src/databox/ipms/ModuleConfigStore';
import type { ResourceStore } from '../../../../src/storage/ResourceStore';
import { readableToString } from '../../../../src/util/StreamUtil';

describe('A ModuleConfigStore', (): void => {
  const baseUrl = 'http://localhost:3000/';
  let data: Map<string, string>;
  let configStore: ModuleConfigStore;

  beforeEach((): void => {
    data = new Map<string, string>();
    const store = {
      hasResource: async(id: ResourceIdentifier): Promise<boolean> => data.has(id.path),
      getRepresentation: async(id: ResourceIdentifier): Promise<Representation> =>
        new BasicRepresentation(data.get(id.path) ?? '', 'text/turtle'),
      setRepresentation: async(id: ResourceIdentifier, representation: Representation): Promise<void> => {
        data.set(id.path, await readableToString(representation.data));
      },
    } as unknown as ResourceStore;
    configStore = new ModuleConfigStore(store, baseUrl);
  });

  it('saves and loads a module state graph as Turtle.', async(): Promise<void> => {
    await configStore.save('hosting', '<> <urn:example:x> "y" .');
    expect(data.get(`${baseUrl}.databox/ipms/modules/hosting`)).toContain('urn:example:x');
    await expect(configStore.load('hosting')).resolves.toContain('urn:example:x');
  });

  it('loads undefined for a module with no state yet.', async(): Promise<void> => {
    await expect(configStore.load('missing')).resolves.toBeUndefined();
  });

  it('persists and reads back an enabled flag.', async(): Promise<void> => {
    await configStore.setEnabled('hosting', true);
    await expect(configStore.isEnabled('hosting')).resolves.toBe(true);
  });

  it('preserves existing config triples when changing the enabled flag.', async(): Promise<void> => {
    await configStore.save('hosting', '<> <urn:example:colour> "blue" .');
    await configStore.setEnabled('hosting', true);

    const turtle = await configStore.load('hosting');
    expect(turtle).toContain('urn:example:colour');
    expect(turtle).toContain('urn:solid-server:databox:ipms#enabled');
  });

  it('reads back a disabled flag as not enabled.', async(): Promise<void> => {
    await configStore.setEnabled('hosting', false);
    await expect(configStore.isEnabled('hosting')).resolves.toBe(false);
  });

  it('treats a module with no state as not enabled.', async(): Promise<void> => {
    await expect(configStore.isEnabled('missing')).resolves.toBe(false);
  });

  it('treats stored state without an enabled flag as not enabled.', async(): Promise<void> => {
    await configStore.save('hosting', '<> <urn:example:x> "y" .');
    await expect(configStore.isEnabled('hosting')).resolves.toBe(false);
  });

  it('rejects unsafe module ids instead of writing outside the module container.', async(): Promise<void> => {
    await expect(configStore.save('../escape', '<> <urn:example:x> "y" .')).rejects.toThrow('Unsafe IPMS module id');
  });
});
