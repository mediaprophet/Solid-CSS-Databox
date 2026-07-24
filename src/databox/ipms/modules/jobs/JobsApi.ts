import type { IpmsModuleRouter } from '../../IpmsModuleRouter';
import type { HttpHandlerInput } from '../../../../server/HttpHandler';
import { isRecord, readJsonBody, writeJson } from '../../IpmsHttpUtils';
import type { JobState } from './WorkOrder';
import { advanceJob } from './WorkOrder';

export function registerJobsRoutes(router: IpmsModuleRouter<(input: HttpHandlerInput) => Promise<void>>): void {
  router.register('POST', '/jobs/advance', async({ request, response }: HttpHandlerInput): Promise<void> => {
    try {
      const input = await readJsonBody<unknown>(request);
      assertAdvanceJobInput(input);
      writeJson(response, 200, { state: advanceJob(input.current, input.event) });
    } catch (error: unknown) {
      writeJson(response, 400, { error: error instanceof Error ? error.message : 'Invalid advance job request.' });
    }
  });
}

function assertAdvanceJobInput(value: unknown): asserts value is { current: JobState; event: string } {
  if (!isRecord(value) || typeof value.current !== 'string' || typeof value.event !== 'string') {
    throw new TypeError('An advance job request needs current state and event string.');
  }
}
