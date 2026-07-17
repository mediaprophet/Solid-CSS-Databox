import type { Patch } from '../../../src/http/representation/Patch';
import type { PatchHandler } from '../../../src/storage/patch/PatchHandler';
import { PatchingStore } from '../../../src/storage/PatchingStore';
import type { ChangeMap, ResourceStore } from '../../../src/storage/ResourceStore';
import { NotImplementedHttpError } from '../../../src/util/errors/NotImplementedHttpError';

describe('A PatchingStore', (): void => {
  let store: PatchingStore;
  let source: jest.Mocked<ResourceStore>;
  let patcher: PatchHandler;
  let handleSafeFn: jest.Mock<Promise<void>, []>;

  beforeEach(async(): Promise<void> => {
    source = {
      modifyResource: jest.fn(async(): Promise<any> => 'modify'),
    } satisfies Partial<ResourceStore> as any;

    handleSafeFn = jest.fn(async(): Promise<any> => 'patcher');
    patcher = { handleSafe: handleSafeFn } as unknown as PatchHandler;

    store = new PatchingStore(source, patcher);
  });

  it('calls modifyResource directly from the source if available.', async(): Promise<void> => {
    await expect(store.modifyResource({ path: 'modifyPath' }, {} as Patch)).resolves.toBe('modify');
    expect(source.modifyResource).toHaveBeenCalledTimes(1);
    expect(source.modifyResource).toHaveBeenLastCalledWith({ path: 'modifyPath' }, {}, undefined);
  });

  it('calls its patcher if modifyResource is not implemented.', async(): Promise<void> => {
    jest.spyOn(source, 'modifyResource').mockImplementation(async(): Promise<any> => {
      throw new NotImplementedHttpError();
    });
    await expect(store.modifyResource({ path: 'modifyPath' }, {} as Patch)).resolves.toBe('patcher');
    expect(source.modifyResource).toHaveBeenCalledTimes(1);
    expect(source.modifyResource).toHaveBeenLastCalledWith({ path: 'modifyPath' }, {}, undefined);
    // Narrow the `MockResult` union so the subject is the typed `Promise` the source returned:
    // `results[0].value` is `any` on the raw union, which hides the rejection from the assertion.
    const returned = source.modifyResource.mock.results
      .filter((result): result is jest.MockResultReturn<Promise<ChangeMap>> => result.type === 'return');
    expect(returned).toHaveLength(1);
    await expect(returned[0].value).rejects.toThrow(NotImplementedHttpError);
    expect(handleSafeFn).toHaveBeenCalledTimes(1);
    expect(handleSafeFn).toHaveBeenLastCalledWith({ source, identifier: { path: 'modifyPath' }, patch: {}});
  });

  it('rethrows source modifyResource errors.', async(): Promise<void> => {
    jest.spyOn(source, 'modifyResource').mockImplementation(async(): Promise<any> => {
      throw new Error('dummy');
    });
    await expect(store.modifyResource({ path: 'modifyPath' }, {} as Patch)).rejects.toThrow('dummy');
    expect(source.modifyResource).toHaveBeenCalledTimes(1);
    expect(source.modifyResource).toHaveBeenLastCalledWith({ path: 'modifyPath' }, {}, undefined);
    expect(handleSafeFn).not.toHaveBeenCalled();
  });
});
