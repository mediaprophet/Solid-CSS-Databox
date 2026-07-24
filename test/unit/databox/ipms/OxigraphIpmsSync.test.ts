import { BasicRepresentation } from '../../../../src/http/representation/BasicRepresentation';
import type { Representation } from '../../../../src/http/representation/Representation';
import type { ResourceIdentifier } from '../../../../src/http/representation/ResourceIdentifier';
import { RepresentationMetadata } from '../../../../src/http/representation/RepresentationMetadata';
import { BaseActivityEmitter } from '../../../../src/server/notifications/ActivityEmitter';
import type { ChangeMap, ResourceStore } from '../../../../src/storage/ResourceStore';
import { OxigraphIpmsSync } from '../../../../src/databox/ipms/OxigraphIpmsSync';
import type {
  OxigraphIpmsHydrationExecutor,
  OxigraphIpmsHydrationOperation,
} from '../../../../src/databox/ipms/OxigraphIpmsHydration';
import { IdentifierMap } from '../../../../src/util/map/IdentifierMap';
import { readableToString } from '../../../../src/util/StreamUtil';
import { AS, SOLID_AS } from '../../../../src/util/Vocabularies';

const receiptState = 'https://fresh.example/.databox/ipms/modules/receipt';
const menuState = 'https://fresh.example/.databox/ipms/modules/menu';
const unrelatedResource = 'https://fresh.example/profile/card';

class RecordingHydrationExecutor implements OxigraphIpmsHydrationExecutor {
  public readonly operations: OxigraphIpmsHydrationOperation[] = [];
  public readonly updates: string[] = [];

  public async executeUpdate(update: string, operation: OxigraphIpmsHydrationOperation): Promise<void> {
    this.updates.push(update);
    this.operations.push(operation);
  }
}

function createResourceStore(data = new Map<string, string>()): {
  readonly data: Map<string, string>;
  readonly resourceStore: ResourceStore;
  readonly getRepresentation: jest.Mock;
} {
  const getRepresentation = jest.fn(async(id: ResourceIdentifier): Promise<Representation> =>
    new BasicRepresentation(data.get(id.path) ?? '', 'text/turtle'));
  return {
    data,
    getRepresentation,
    resourceStore: {
      hasResource: jest.fn(async(id: ResourceIdentifier): Promise<boolean> => data.has(id.path)),
      getRepresentation,
      setRepresentation: jest.fn(async(id: ResourceIdentifier, representation: Representation): Promise<ChangeMap> => {
        data.set(id.path, await readableToString(representation.data));
        return changeMap([[ id, AS.terms.Update ]]);
      }),
    } as unknown as ResourceStore,
  };
}

function changeMap(
  entries: [ResourceIdentifier, typeof AS.terms.Update | typeof AS.terms.Create | typeof AS.terms.Delete][],
): ChangeMap {
  return new IdentifierMap(entries.map(([ identifier, activity ]): [ResourceIdentifier, RepresentationMetadata] => [
    identifier,
    new RepresentationMetadata({ [SOLID_AS.activity]: activity }),
  ]));
}

describe('OxigraphIpmsSync', (): void => {
  it('degrades to a disabled no-op without a store or executor.', async(): Promise<void> => {
    const sync = new OxigraphIpmsSync();

    await expect(sync.syncResource({ path: receiptState })).resolves.toEqual({
      enabled: false,
      source: 'notification',
      requestedPaths: [ receiptState ],
      synchronizedPaths: [],
      skippedPaths: [ receiptState ],
      operations: [],
    });
  });

  it('hydrates only explicitly allowed canonical Solid resources from write results.', async(): Promise<void> => {
    const { data, resourceStore } = createResourceStore(new Map([
      [ receiptState, '<> <urn:example:printer> "front-counter" .' ],
      [ unrelatedResource, '<> <urn:example:name> "Ada" .' ],
    ]));
    const executor = new RecordingHydrationExecutor();
    const sync = new OxigraphIpmsSync({
      enabled: true,
      source: resourceStore,
      executor,
      resources: [{ path: receiptState }],
    });

    data.set(receiptState, '<> <urn:example:printer> "back-counter" .');
    const result = await sync.syncChangeMap(changeMap([
      [{ path: unrelatedResource }, AS.terms.Update ],
      [{ path: receiptState }, AS.terms.Update ],
    ]));

    expect(result).toMatchObject({
      enabled: true,
      source: 'write-result',
      requestedPaths: [ unrelatedResource, receiptState ],
      synchronizedPaths: [ receiptState ],
      skippedPaths: [ unrelatedResource ],
    });
    expect(executor.operations).toHaveLength(1);
    expect(executor.operations[0]).toMatchObject({
      sourcePath: receiptState,
      graph: receiptState,
      tripleCount: 1,
    });
    expect(executor.updates[0]).toContain('"back-counter"');
  });

  it('can subscribe to canonical Solid change notifications.', async(): Promise<void> => {
    const { resourceStore } = createResourceStore(new Map([
      [ receiptState, '<> <urn:example:status> "enabled" .' ],
    ]));
    const executor = new RecordingHydrationExecutor();
    const sync = new OxigraphIpmsSync({
      enabled: true,
      source: resourceStore,
      executor,
      resources: [{ path: receiptState }],
    });
    const emitter = new BaseActivityEmitter();
    const subscription = sync.subscribeToCanonicalChanges(emitter);

    emitter.emit('changed', { path: receiptState }, AS.terms.Update, new RepresentationMetadata());
    await sync.waitForIdle();
    subscription.dispose();
    emitter.emit('changed', { path: receiptState }, AS.terms.Update, new RepresentationMetadata());
    await sync.waitForIdle();

    expect(executor.operations).toHaveLength(1);
    expect(executor.operations[0].sourcePath).toBe(receiptState);
  });

  it('clears a hydrated named graph for delete notifications without reading Oxigraph as canonical.', async():
  Promise<void> => {
    const { resourceStore, getRepresentation } = createResourceStore(new Map([
      [ receiptState, '<> <urn:example:status> "stale" .' ],
    ]));
    const executor = new RecordingHydrationExecutor();
    const sync = new OxigraphIpmsSync({
      enabled: true,
      source: resourceStore,
      executor,
      resources: [{ path: receiptState }],
    });

    const result = await sync.syncChangeMap(changeMap([[{ path: receiptState }, AS.terms.Delete ]]));

    expect(result.synchronizedPaths).toEqual([ receiptState ]);
    expect(getRepresentation).not.toHaveBeenCalled();
    expect(executor.operations[0]).toMatchObject({
      graph: receiptState,
      tripleCount: 0,
    });
    expect(executor.updates[0]).toContain(`DELETE WHERE { GRAPH <${receiptState}> { ?s ?p ?o. } };`);
    expect(executor.updates[0]).not.toContain('INSERT DATA');
  });

  it('refuses to process more allowed resources than the configured bound.', async(): Promise<void> => {
    const { resourceStore } = createResourceStore(new Map([
      [ receiptState, '<> <urn:example:status> "enabled" .' ],
      [ menuState, '<> <urn:example:status> "enabled" .' ],
    ]));
    const executor = new RecordingHydrationExecutor();
    const sync = new OxigraphIpmsSync({
      enabled: true,
      source: resourceStore,
      executor,
      resources: [{ path: receiptState }, { path: menuState }],
      maxResourcesPerBatch: 1,
    });

    await expect(sync.syncAll()).rejects.toThrow('IPMS Oxigraph sync refused to hydrate 2 resources');
    expect(executor.operations).toHaveLength(0);
  });
});
