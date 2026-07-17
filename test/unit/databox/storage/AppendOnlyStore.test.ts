import type { Patch } from '../../../../src/http/representation/Patch';
import type { Representation } from '../../../../src/http/representation/Representation';
import type { ResourceIdentifier } from '../../../../src/http/representation/ResourceIdentifier';
import type { AppendOnlyEvidence, AppendOnlyEvidenceSink } from '../../../../src/databox/storage/AppendOnlyEvidence';
import { AppendOnlyStore } from '../../../../src/databox/storage/AppendOnlyStore';
import { InMemorySupersessionRegistry } from '../../../../src/databox/storage/AppendOnlySupersession';
import { InMemoryTombstoneRegistry } from '../../../../src/databox/storage/AppendOnlyTombstone';
import type { ResourceStore } from '../../../../src/storage/ResourceStore';
import { BadRequestHttpError } from '../../../../src/util/errors/BadRequestHttpError';
import { ConflictHttpError } from '../../../../src/util/errors/ConflictHttpError';
import { ForbiddenHttpError } from '../../../../src/util/errors/ForbiddenHttpError';
import { NotFoundHttpError } from '../../../../src/util/errors/NotFoundHttpError';

// Every mutating denial below is asserted for each of the four actor classes named in DBX-17. The
// decorator sits *below* authorization, so the actor label is irrelevant — the point of these cases is
// to prove exactly that: identical denial regardless of who reaches the store.
const ACTORS = [ 'consumer', 'program', 'owner', 'admin' ] as const;

function makeSink(): jest.Mocked<AppendOnlyEvidenceSink> {
  return { record: jest.fn<Promise<void>, [AppendOnlyEvidence]>(async(): Promise<void> => undefined) };
}

describe('An AppendOnlyStore', (): void => {
  let source: jest.Mocked<ResourceStore>;
  let store: AppendOnlyStore;

  beforeEach((): void => {
    source = {
      hasResource: jest.fn(async(): Promise<boolean> => false),
      getRepresentation: jest.fn(async(): Promise<any> => 'get'),
      addResource: jest.fn(async(): Promise<any> => 'add'),
      setRepresentation: jest.fn(async(): Promise<any> => 'set'),
      deleteResource: jest.fn(),
      modifyResource: jest.fn(),
    } as any;
    store = new AppendOnlyStore(source);
  });

  describe('base append-only behaviour (DBX-09 contract, kept green)', (): void => {
    it('passes reads through to the source.', async(): Promise<void> => {
      await expect(store.getRepresentation({ path: 'getPath' }, {})).resolves.toBe('get');
      expect(source.getRepresentation).toHaveBeenCalledTimes(1);
    });

    it('allows creating a resource via addResource.', async(): Promise<void> => {
      await expect(store.addResource({ path: 'container/' }, {} as Representation)).resolves.toBe('add');
      expect(source.addResource).toHaveBeenCalledTimes(1);
    });

    it('allows setRepresentation when the resource does not yet exist (create).', async(): Promise<void> => {
      source.hasResource.mockResolvedValueOnce(false);
      await expect(store.setRepresentation({ path: 'new' }, {} as Representation)).resolves.toBe('set');
      expect(source.setRepresentation).toHaveBeenCalledTimes(1);
    });

    it('rejects setRepresentation when the resource already exists (replace).', async(): Promise<void> => {
      source.hasResource.mockResolvedValueOnce(true);
      await expect(store.setRepresentation({ path: 'existing' }, {} as Representation))
        .rejects.toThrow(ForbiddenHttpError);
      expect(source.setRepresentation).not.toHaveBeenCalled();
    });

    it('rejects deleteResource.', async(): Promise<void> => {
      await expect(store.deleteResource({ path: 'existing' })).rejects.toThrow(ForbiddenHttpError);
      expect(source.deleteResource).not.toHaveBeenCalled();
    });

    it('rejects modifyResource.', async(): Promise<void> => {
      await expect(store.modifyResource({ path: 'existing' }, {} as Patch)).rejects.toThrow(ForbiddenHttpError);
      expect(source.modifyResource).not.toHaveBeenCalled();
    });
  });

  describe('bypass resistance: every actor class is denied (below authorization, T-26)', (): void => {
    it.each(ACTORS)('denies replace (PUT on existing) for the %s actor.', async(actor): Promise<void> => {
      source.hasResource.mockResolvedValueOnce(true);
      await expect(store.setRepresentation({ path: `res-${actor}` }, {} as Representation))
        .rejects.toThrow(ForbiddenHttpError);
      expect(source.setRepresentation).not.toHaveBeenCalled();
    });

    it.each(ACTORS)('denies modify (PATCH) for the %s actor.', async(actor): Promise<void> => {
      await expect(store.modifyResource({ path: `res-${actor}` }, {} as Patch)).rejects.toThrow(ForbiddenHttpError);
      expect(source.modifyResource).not.toHaveBeenCalled();
    });

    it.each(ACTORS)('denies delete (DELETE) for the %s actor.', async(actor): Promise<void> => {
      await expect(store.deleteResource({ path: `res-${actor}` })).rejects.toThrow(ForbiddenHttpError);
      expect(source.deleteResource).not.toHaveBeenCalled();
    });
  });

  describe('supersession (correction = new linked record, ADR-0018 §2)', (): void => {
    const prior: ResourceIdentifier = { path: 'records/r1' };
    const next: ResourceIdentifier = { path: 'records/r2' };

    it('appends a new record linked to the prior, which stays retrievable.', async(): Promise<void> => {
      const sink = makeSink();
      store = new AppendOnlyStore(source, { evidence: sink, now: (): string => '2026-07-15T00:00:00Z' });
      // Prior exists; the new identifier does not.
      source.hasResource.mockImplementation(async(id: ResourceIdentifier): Promise<boolean> => id.path === prior.path);

      const result = await store.supersedeResource(next, {} as Representation, prior);

      expect(result.changes).toBe('set');
      expect(source.setRepresentation).toHaveBeenCalledTimes(1);
      expect(result.evidence).toEqual({
        kind: 'supersession',
        target: prior.path,
        supersedes: prior.path,
        supersededBy: next.path,
        recordedAt: '2026-07-15T00:00:00Z',
      });
      expect(sink.record).toHaveBeenCalledWith(result.evidence);
      // The link is recorded and the prior remains readable.
      await expect(store.supersededBy(prior)).resolves.toBe(next.path);
      await expect(store.getRepresentation(prior, {})).resolves.toBe('get');
    });

    it('works without an evidence sink (events are only returned).', async(): Promise<void> => {
      source.hasResource.mockImplementation(async(id: ResourceIdentifier): Promise<boolean> => id.path === prior.path);
      const result = await store.supersedeResource(next, {} as Representation, prior);
      expect(result.evidence.supersededBy).toBe(next.path);
      // Default clock produced a valid ISO-8601 timestamp.
      expect(result.evidence.recordedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/u);
    });

    it('rejects a dangling supersession whose prior does not exist.', async(): Promise<void> => {
      source.hasResource.mockResolvedValue(false);
      await expect(store.supersedeResource(next, {} as Representation, prior)).rejects.toThrow(NotFoundHttpError);
      expect(source.setRepresentation).not.toHaveBeenCalled();
    });

    it('rejects superseding a tombstoned record.', async(): Promise<void> => {
      const tombstones = new InMemoryTombstoneRegistry();
      await tombstones.mark({ target: prior.path, recordClass: 'c', legalBasis: 'lb', tombstonedAt: 't' });
      store = new AppendOnlyStore(source, { tombstones });
      await expect(store.supersedeResource(next, {} as Representation, prior)).rejects.toThrow(ConflictHttpError);
      expect(source.setRepresentation).not.toHaveBeenCalled();
    });

    it('rejects superseding the same prior twice (no fork).', async(): Promise<void> => {
      const supersessions = new InMemorySupersessionRegistry();
      await supersessions.record({ prior: prior.path, next: 'records/other', recordedAt: 't' });
      store = new AppendOnlyStore(source, { supersessions });
      source.hasResource.mockImplementation(async(id: ResourceIdentifier): Promise<boolean> => id.path === prior.path);
      await expect(store.supersedeResource(next, {} as Representation, prior)).rejects.toThrow(ConflictHttpError);
      expect(source.setRepresentation).not.toHaveBeenCalled();
    });

    it('rejects a supersession whose new identifier already exists (replace-no holds).', async(): Promise<void> => {
      // Both prior and the new identifier already exist -> the create path rejects the replace.
      source.hasResource.mockResolvedValue(true);
      await expect(store.supersedeResource(next, {} as Representation, prior)).rejects.toThrow(ForbiddenHttpError);
    });
  });

  describe('tombstone (lawful deletion = tombstone + evidence, never destruction, ADR-0018 §3, T-29)', (): void => {
    const target: ResourceIdentifier = { path: 'records/r1' };
    const request = { recordClass: 'retail-receipt', legalBasis: 'urn:legal:erasure-req-1' };

    it('records a tombstone and evidence without destroying bytes.', async(): Promise<void> => {
      const sink = makeSink();
      store = new AppendOnlyStore(source, { evidence: sink, now: (): string => '2026-07-15T00:00:00Z' });
      source.hasResource.mockResolvedValue(true);

      const evidence = await store.tombstoneResource(target, request);

      expect(evidence).toEqual({
        kind: 'tombstone',
        target: target.path,
        recordClass: request.recordClass,
        legalBasis: request.legalBasis,
        recordedAt: '2026-07-15T00:00:00Z',
      });
      expect(sink.record).toHaveBeenCalledWith(evidence);
      // Never destructive: the source delete is never invoked.
      expect(source.deleteResource).not.toHaveBeenCalled();
      await expect(store.isTombstoned(target)).resolves.toBe(true);
    });

    it('works without an evidence sink and a default clock.', async(): Promise<void> => {
      source.hasResource.mockResolvedValue(true);
      const evidence = await store.tombstoneResource(target, request);
      expect(evidence.recordedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/u);
      expect(source.deleteResource).not.toHaveBeenCalled();
    });

    it('rejects a tombstone request lacking a legal-basis reference.', async(): Promise<void> => {
      await expect(store.tombstoneResource(target, { recordClass: 'c', legalBasis: '   ' }))
        .rejects.toThrow(BadRequestHttpError);
      expect(source.hasResource).not.toHaveBeenCalled();
    });

    it('distinguishes a never-existed resource (404) from a tombstoned one.', async(): Promise<void> => {
      source.hasResource.mockResolvedValue(false);
      await expect(store.tombstoneResource(target, request)).rejects.toThrow(NotFoundHttpError);
      await expect(store.isTombstoned(target)).resolves.toBe(false);
    });

    it('replays idempotently for an already-tombstoned resource, no re-emit or destroy.', async(): Promise<void> => {
      const sink = makeSink();
      store = new AppendOnlyStore(source, { evidence: sink, now: (): string => '2026-07-15T00:00:00Z' });
      source.hasResource.mockResolvedValue(true);

      const first = await store.tombstoneResource(target, request);
      const second = await store.tombstoneResource(target, request);

      expect(second).toEqual(first);
      // Emitted once, not twice; bytes never destroyed.
      expect(sink.record).toHaveBeenCalledTimes(1);
      expect(source.deleteResource).not.toHaveBeenCalled();
    });

    it('refuses to recreate (setRepresentation) over a tombstoned path.', async(): Promise<void> => {
      const tombstones = new InMemoryTombstoneRegistry();
      await tombstones.mark({ target: target.path, recordClass: 'c', legalBasis: 'lb', tombstonedAt: 't' });
      store = new AppendOnlyStore(source, { tombstones });
      await expect(store.setRepresentation(target, {} as Representation)).rejects.toThrow(ForbiddenHttpError);
      expect(source.setRepresentation).not.toHaveBeenCalled();
    });
  });
});

describe('An InMemorySupersessionRegistry', (): void => {
  it('records and resolves links in both directions and lists them.', async(): Promise<void> => {
    const registry = new InMemorySupersessionRegistry();
    const link = { prior: 'a', next: 'b', recordedAt: 't' };
    await registry.record(link);
    await expect(registry.supersededBy('a')).resolves.toBe('b');
    await expect(registry.supersedes('b')).resolves.toBe('a');
    await expect(registry.links()).resolves.toEqual([ link ]);
  });

  it('resolves undefined for unknown records.', async(): Promise<void> => {
    const registry = new InMemorySupersessionRegistry();
    await expect(registry.supersededBy('missing')).resolves.toBeUndefined();
    await expect(registry.supersedes('missing')).resolves.toBeUndefined();
  });
});

describe('An InMemoryTombstoneRegistry', (): void => {
  it('marks, resolves and reports tombstone state.', async(): Promise<void> => {
    const registry = new InMemoryTombstoneRegistry();
    const state = { target: 'a', recordClass: 'c', legalBasis: 'lb', tombstonedAt: 't' };
    await registry.mark(state);
    await expect(registry.get('a')).resolves.toEqual(state);
    await expect(registry.isTombstoned('a')).resolves.toBe(true);
  });

  it('reports never-existed targets as not tombstoned.', async(): Promise<void> => {
    const registry = new InMemoryTombstoneRegistry();
    await expect(registry.get('missing')).resolves.toBeUndefined();
    await expect(registry.isTombstoned('missing')).resolves.toBe(false);
  });
});
