import { ClusterManager, WorkerManager } from '../../../../src';

describe('A WorkerManager', (): void => {
  it('can be created from a ClusterManager.', (): void => {
    expect(new WorkerManager(new ClusterManager(4))).toBeInstanceOf(WorkerManager);
  });

  it('can call handle.', async(): Promise<void> => {
    const cm = new ClusterManager(4);
    const wm = new WorkerManager(cm);
    Object.assign(cm, { spawnWorkers: jest.fn() });
    await wm.handle();
    expect(cm.spawnWorkers).toHaveBeenCalledWith();
  });
});
