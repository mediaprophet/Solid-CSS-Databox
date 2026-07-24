import { BasicRepresentation } from '../../../../src/http/representation/BasicRepresentation';
import type { Representation } from '../../../../src/http/representation/Representation';
import type { ResourceIdentifier } from '../../../../src/http/representation/ResourceIdentifier';
import { RepresentationMetadata } from '../../../../src/http/representation/RepresentationMetadata';
import { BaseActivityEmitter } from '../../../../src/server/notifications/ActivityEmitter';
import type { ChangeMap, ResourceStore } from '../../../../src/storage/ResourceStore';
import {
  canonicalIpmsRdfResourceDescriptors,
  defaultOxigraphIpmsSyncResourcePaths,
  OxigraphIpmsSyncInitializer,
} from '../../../../src/databox/ipms/OxigraphIpmsSyncComposition';
import type {
  OxigraphIpmsHydrationExecutor,
  OxigraphIpmsHydrationOperation,
} from '../../../../src/databox/ipms/OxigraphIpmsHydration';
import { IdentifierMap } from '../../../../src/util/map/IdentifierMap';
import { readableToString } from '../../../../src/util/StreamUtil';
import { AS, SOLID_AS } from '../../../../src/util/Vocabularies';

const baseUrl = 'https://fresh.example/';
const receiptState = `${baseUrl}.databox/ipms/modules/receipt`;
const menuState = `${baseUrl}.databox/ipms/modules/menu`;

class RecordingHydrationExecutor implements OxigraphIpmsHydrationExecutor {
  public readonly operations: OxigraphIpmsHydrationOperation[] = [];

  public async executeUpdate(_update: string, operation: OxigraphIpmsHydrationOperation): Promise<void> {
    this.operations.push(operation);
  }
}

function createResourceStore(data = new Map<string, string>()): {
  readonly data: Map<string, string>;
  readonly resourceStore: ResourceStore;
} {
  return {
    data,
    resourceStore: {
      hasResource: jest.fn(async(id: ResourceIdentifier): Promise<boolean> => data.has(id.path)),
      getRepresentation: jest.fn(async(id: ResourceIdentifier): Promise<Representation> =>
        new BasicRepresentation(data.get(id.path) ?? '', 'text/turtle')),
      setRepresentation: jest.fn(async(id: ResourceIdentifier, representation: Representation): Promise<ChangeMap> => {
        data.set(id.path, await readableToString(representation.data));
        return new IdentifierMap([
          [ id, new RepresentationMetadata({ [SOLID_AS.activity]: AS.terms.Update }) ],
        ]);
      }),
    } as unknown as ResourceStore,
  };
}

describe('OxigraphIpmsSyncComposition', (): void => {
  it('resolves the canonical allowlist from the Solid base URL with deduplication.', (): void => {
    const descriptors = canonicalIpmsRdfResourceDescriptors(baseUrl, [
      '.databox/ipms/modules/receipt',
      receiptState,
      '.databox/ipms/modules/receipt',
    ]);

    expect(descriptors).toEqual([
      { path: receiptState },
    ]);
    expect(canonicalIpmsRdfResourceDescriptors(baseUrl)).toHaveLength(defaultOxigraphIpmsSyncResourcePaths().length);
  });

  it('stays disabled by default and does not perform startup hydration.', async(): Promise<void> => {
    const { resourceStore } = createResourceStore(new Map([
      [ receiptState, '<> <urn:example:status> "enabled" .' ],
    ]));
    const emitter = new BaseActivityEmitter();
    const executor = new RecordingHydrationExecutor();
    const initializer = new OxigraphIpmsSyncInitializer(
      resourceStore,
      emitter,
      executor,
      baseUrl,
      false,
      [ '.databox/ipms/modules/receipt' ],
    );

    await initializer.handle();
    emitter.emit('changed', { path: receiptState }, AS.terms.Update, new RepresentationMetadata());
    await initializer.finalize();

    expect(executor.operations).toHaveLength(0);
    expect(initializer.getLastStartupResult()).toBeUndefined();
  });

  it('hydrates the allowlisted canonical Solid resources on startup.', async(): Promise<void> => {
    const { resourceStore } = createResourceStore(new Map([
      [ receiptState, '<> <urn:example:status> "enabled" .' ],
    ]));
    const executor = new RecordingHydrationExecutor();
    const initializer = new OxigraphIpmsSyncInitializer(
      resourceStore,
      new BaseActivityEmitter(),
      executor,
      baseUrl,
      true,
      [ '.databox/ipms/modules/receipt', '.databox/ipms/modules/menu' ],
    );

    await initializer.handle();

    expect(initializer.getLastStartupResult()?.synchronizedPaths).toEqual([ menuState, receiptState ]);
    expect(executor.operations).toEqual([
      expect.objectContaining({ graph: menuState, tripleCount: 0 }),
      expect.objectContaining({ graph: receiptState, tripleCount: 1 }),
    ]);
  });

  it('subscribes to canonical Solid updates and disposes that subscription on finalize.', async(): Promise<void> => {
    const { data, resourceStore } = createResourceStore(new Map([
      [ receiptState, '<> <urn:example:status> "enabled" .' ],
    ]));
    const emitter = new BaseActivityEmitter();
    const executor = new RecordingHydrationExecutor();
    const initializer = new OxigraphIpmsSyncInitializer(
      resourceStore,
      emitter,
      executor,
      baseUrl,
      true,
      [ '.databox/ipms/modules/receipt' ],
      false,
    );

    data.set(receiptState, '<> <urn:example:status> "updated" .');
    emitter.emit('changed', { path: receiptState }, AS.terms.Update, new RepresentationMetadata());
    await initializer.getHydrationQueue().waitForIdle();
    await initializer.finalize();
    emitter.emit('changed', { path: receiptState }, AS.terms.Update, new RepresentationMetadata());
    await initializer.getHydrationQueue().waitForIdle();

    expect(executor.operations).toHaveLength(1);
    expect(executor.operations[0]).toMatchObject({
      graph: receiptState,
      tripleCount: 1,
    });
    expect(executor.operations[0].turtle).toContain('updated');
  });

  it('clears the hydrated named graph when a canonical Solid delete notification arrives.', async(): Promise<void> => {
    const { resourceStore } = createResourceStore(new Map([
      [ receiptState, '<> <urn:example:status> "stale" .' ],
    ]));
    const emitter = new BaseActivityEmitter();
    const executor = new RecordingHydrationExecutor();
    const initializer = new OxigraphIpmsSyncInitializer(
      resourceStore,
      emitter,
      executor,
      baseUrl,
      true,
      [ '.databox/ipms/modules/receipt' ],
      false,
    );

    emitter.emit('changed', { path: receiptState }, AS.terms.Delete, new RepresentationMetadata());
    await initializer.getHydrationQueue().waitForIdle();

    expect(executor.operations).toEqual([
      expect.objectContaining({ graph: receiptState, tripleCount: 0 }),
    ]);
  });
});
