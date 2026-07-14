import type { Patch } from '../../../../src/http/representation/Patch';
import type { Representation } from '../../../../src/http/representation/Representation';
import { AppendOnlyStore } from '../../../../src/databox/storage/AppendOnlyStore';
import type { ResourceStore } from '../../../../src/storage/ResourceStore';
import { ForbiddenHttpError } from '../../../../src/util/errors/ForbiddenHttpError';

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
    expect(source.setRepresentation).toHaveBeenCalledTimes(0);
  });

  it('rejects deleteResource.', async(): Promise<void> => {
    await expect(store.deleteResource({ path: 'existing' })).rejects.toThrow(ForbiddenHttpError);
    expect(source.deleteResource).toHaveBeenCalledTimes(0);
  });

  it('rejects modifyResource.', async(): Promise<void> => {
    await expect(store.modifyResource({ path: 'existing' }, {} as Patch)).rejects.toThrow(ForbiddenHttpError);
    expect(source.modifyResource).toHaveBeenCalledTimes(0);
  });
});
