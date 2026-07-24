import type { IpmsModuleRouter } from '../../IpmsModuleRouter';
import type { HttpHandlerInput } from '../../../../server/HttpHandler';
import { readJsonBody, writeJson } from '../../IpmsHttpUtils';
import type { BackupCreateInput, BackupRestoreInput } from './BackupManager';
import { buildBackupManifest, createBackup, restoreBackup } from './BackupManager';

export function registerBackupRoutes(router: IpmsModuleRouter<(input: HttpHandlerInput) => Promise<void>>): void {
  router.register('POST', '/backups/create', async({ request, response }: HttpHandlerInput): Promise<void> => {
    try {
      const input = await readJsonBody<unknown>(request);
      const result = createBackup(input as BackupCreateInput);
      writeJson(response, 200, result.record, 'application/ld+json');
    } catch (error: unknown) {
      writeJson(response, 400, { error: error instanceof Error ? error.message : 'Invalid backup create request.' });
    }
  });

  router.register('POST', '/backups/restore', async({ request, response }: HttpHandlerInput): Promise<void> => {
    try {
      const input = await readJsonBody<unknown>(request);
      const result = restoreBackup(input as BackupRestoreInput);
      writeJson(response, 200, result.record, 'application/ld+json');
    } catch (error: unknown) {
      writeJson(response, 400, { error: error instanceof Error ? error.message : 'Invalid backup restore request.' });
    }
  });

  router.register('POST', '/backups/manifest', async({ request, response }: HttpHandlerInput): Promise<void> => {
    try {
      const input = await readJsonBody<{
        id: string;
        organisation: string;
        format: string;
        resourceCount: number;
        totalSize: number;
        createdAt: string;
        encryptedBlob: string;
      }>(request);
      const result = buildBackupManifest(
        input.id,
        input.organisation,
        input.format as 'json-ld' | 'turtle' | 'n-quads' | 'json',
        input.resourceCount,
        input.totalSize,
        input.createdAt,
        input.encryptedBlob,
      );
      writeJson(response, 200, result.record, 'application/ld+json');
    } catch (error: unknown) {
      writeJson(response, 400, { error: error instanceof Error ? error.message : 'Invalid backup manifest request.' });
    }
  });
}
