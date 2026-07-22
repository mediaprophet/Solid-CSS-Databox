import {
  buildBackupManifest,
  createBackup,
  restoreBackup,
} from '../../../../src/databox/cms/modules/backups/BackupManager';
import type { BackupCreateInput, BackupRestoreInput } from '../../../../src/databox/cms/modules/backups/BackupManager';

describe('Password-Protected Backups module', () => {
  const sampleResources = [
    {
      uri: 'https://databox.example.org/resource/1',
      contentType: 'application/ld+json',
      data: '{"@type":"Product","name":"Coffee"}',
    },
    {
      uri: 'https://databox.example.org/resource/2',
      contentType: 'text/turtle',
      data: '<> a <https://schema.org/Product> ; <https://schema.org/name> "Tea" .',
    },
  ];

  describe('createBackup', () => {
    it('creates an encrypted backup', () => {
      const input: BackupCreateInput = {
        id: 'https://databox.example.org/backups/001',
        organisation: 'https://databox.example.org/org',
        password: 'securePassword123',
        format: 'json-ld',
        resources: sampleResources,
      };
      const result = createBackup(input);
      expect(result.id).toBe('https://databox.example.org/backups/001');
      expect(result.encryptedBlob).toBeTruthy();
      expect(result.salt).toBeTruthy();
      expect(result.iv).toBeTruthy();
      expect(result.tag).toBeTruthy();
      expect(result.resourceCount).toBe(2);
      expect(result.totalSize).toBeGreaterThan(0);
      expect(result.record['@type']).toBe('DataDownload');
      expect(result.record.encryptionAlgorithm).toBe('AES-256-GCM');
    });

    it('rejects short password', () => {
      expect(() => createBackup({
        id: 'https://databox.example.org/backups/002',
        organisation: 'https://databox.example.org/org',
        password: 'short',
        format: 'json-ld',
        resources: sampleResources,
      })).toThrow('at least 8 characters');
    });

    it('rejects empty resources', () => {
      expect(() => createBackup({
        id: 'https://databox.example.org/backups/003',
        organisation: 'https://databox.example.org/org',
        password: 'securePassword123',
        format: 'json-ld',
        resources: [],
      })).toThrow('at least one resource');
    });

    it('rejects invalid URI', () => {
      expect(() => createBackup({
        id: 'not-a-uri',
        organisation: 'https://databox.example.org/org',
        password: 'securePassword123',
        format: 'json-ld',
        resources: sampleResources,
      })).toThrow('must be an absolute URI');
    });
  });

  describe('restoreBackup', () => {
    it('restores an encrypted backup with correct password', () => {
      const createInput: BackupCreateInput = {
        id: 'https://databox.example.org/backups/001',
        organisation: 'https://databox.example.org/org',
        password: 'securePassword123',
        format: 'json-ld',
        resources: sampleResources,
      };
      const created = createBackup(createInput);

      const restoreInput: BackupRestoreInput = {
        id: created.id,
        password: 'securePassword123',
        encryptedBlob: created.encryptedBlob,
        salt: created.salt,
        iv: created.iv,
        tag: created.tag,
        format: 'json-ld',
      };
      const result = restoreBackup(restoreInput);
      expect(result.id).toBe(created.id);
      expect(result.resourceCount).toBe(2);
      expect(result.resources[0].uri).toBe(sampleResources[0].uri);
      expect(result.resources[0].data).toBe(sampleResources[0].data);
      expect(result.record['@type']).toBe('DataFeed');
    });

    it('fails with incorrect password', () => {
      const createInput: BackupCreateInput = {
        id: 'https://databox.example.org/backups/001',
        organisation: 'https://databox.example.org/org',
        password: 'securePassword123',
        format: 'json-ld',
        resources: sampleResources,
      };
      const created = createBackup(createInput);

      expect(() => restoreBackup({
        id: created.id,
        password: 'wrongPassword!!!',
        encryptedBlob: created.encryptedBlob,
        salt: created.salt,
        iv: created.iv,
        tag: created.tag,
        format: 'json-ld',
      })).toThrow('decryption failed');
    });
  });

  describe('buildBackupManifest', () => {
    it('builds a manifest with checksum', () => {
      const manifest = buildBackupManifest(
        'https://databox.example.org/backups/001',
        'https://databox.example.org/org',
        'json-ld',
        42,
        1024,
        '2025-07-22T10:00:00Z',
        'base64data',
      );
      expect(manifest.id).toBe('https://databox.example.org/backups/001');
      expect(manifest.format).toBe('json-ld');
      expect(manifest.resourceCount).toBe(42);
      expect(manifest.totalSize).toBe(1024);
      expect(manifest.checksum).toMatch(/^[\da-f]{64}$/u);
      expect(manifest.record['@type']).toBe('DataCatalog');
    });
  });
});
