import { BadRequestHttpError } from '../../../../util/errors/BadRequestHttpError';
import { createCipheriv, createDecipheriv, scryptSync, randomBytes, createHash } from 'crypto';

const LD_CONTEXT = '@context';
const LD_TYPE = '@type';
const LD_ID = '@id';

const ALGORITHM = 'aes-256-gcm';
const SALT_LENGTH = 32;
const IV_LENGTH = 16;
const TAG_LENGTH = 16;
const KEY_LENGTH = 32;

export type BackupFormat = 'json-ld' | 'turtle' | 'n-quads' | 'json';

export interface BackupCreateInput {
  readonly id: string;
  readonly organisation: string;
  readonly password: string;
  readonly format: BackupFormat;
  readonly resources: readonly BackupResource[];
  readonly metadata?: Record<string, string>;
  readonly createdAt?: string;
}

export interface BackupResource {
  readonly uri: string;
  readonly contentType: string;
  readonly data: string;
}

export interface BackupCreateResult {
  readonly id: string;
  readonly encryptedBlob: string;
  readonly salt: string;
  readonly iv: string;
  readonly tag: string;
  readonly resourceCount: number;
  readonly totalSize: number;
  readonly record: Record<string, unknown>;
}

export interface BackupRestoreInput {
  readonly id: string;
  readonly password: string;
  readonly encryptedBlob: string;
  readonly salt: string;
  readonly iv: string;
  readonly tag: string;
  readonly format: BackupFormat;
}

export interface BackupRestoreResult {
  readonly id: string;
  readonly resources: BackupResource[];
  readonly resourceCount: number;
  readonly record: Record<string, unknown>;
}

export interface BackupManifest {
  readonly id: string;
  readonly organisation: string;
  readonly format: BackupFormat;
  readonly resourceCount: number;
  readonly totalSize: number;
  readonly createdAt: string;
  readonly checksum: string;
  readonly record: Record<string, unknown>;
}

function requireNonEmpty(value: string, field: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new BadRequestHttpError(`A backup ${field} must not be empty.`);
  }
  return trimmed;
}

function requirePassword(value: string): string {
  if (typeof value !== 'string' || value.length < 8) {
    throw new BadRequestHttpError('Backup password must be at least 8 characters.');
  }
  return value;
}

function requireUri(value: string, field: string): string {
  try {
    return new URL(value).href;
  } catch {
    throw new BadRequestHttpError(`A backup ${field} must be an absolute URI.`);
  }
}

function deriveKey(password: string, salt: Buffer): Buffer {
  return scryptSync(password, salt, KEY_LENGTH);
}

/**
 * Create a password-protected encrypted backup of CMS resources.
 * Uses AES-256-GCM for authenticated encryption.
 */
export function createBackup(input: BackupCreateInput): BackupCreateResult {
  const id = requireUri(input.id, 'id');
  const organisation = requireUri(input.organisation, 'organisation');
  const password = requirePassword(input.password);

  if (input.resources.length === 0) {
    throw new BadRequestHttpError('A backup must contain at least one resource.');
  }

  const createdAt = input.createdAt ?? new Date().toISOString();

  // Serialize resources based on format
  const payload = serializeBackupPayload(input.resources, input.format, input.metadata ?? {});

  // Generate cryptographic parameters
  const salt = randomBytes(SALT_LENGTH);
  const iv = randomBytes(IV_LENGTH);
  const key = deriveKey(password, salt);

  // Encrypt
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(payload, 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  const totalSize = encrypted.length;

  const record: Record<string, unknown> = {
    [LD_CONTEXT]: [ 'https://schema.org/' ],
    [LD_TYPE]: 'DataDownload',
    [LD_ID]: id,
    name: `Encrypted backup (${input.format})`,
    encodingFormat: 'application/aes-256-gcm',
    contentSize: totalSize,
    dateCreated: createdAt,
    provider: { [LD_ID]: organisation },
    encryptionAlgorithm: 'AES-256-GCM',
    keyDerivation: 'scrypt',
    resourceCount: input.resources.length,
  };

  if (input.metadata) {
    record.metadata = input.metadata;
  }

  return {
    id,
    encryptedBlob: encrypted.toString('base64'),
    salt: salt.toString('base64'),
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    resourceCount: input.resources.length,
    totalSize,
    record,
  };
}

/**
 * Restore a password-protected encrypted backup.
 * Decrypts and deserializes the resources.
 */
export function restoreBackup(input: BackupRestoreInput): BackupRestoreResult {
  const id = requireNonEmpty(input.id, 'id');
  const password = requirePassword(input.password);

  const encrypted = Buffer.from(input.encryptedBlob, 'base64');
  const salt = Buffer.from(input.salt, 'base64');
  const iv = Buffer.from(input.iv, 'base64');
  const tag = Buffer.from(input.tag, 'base64');

  const key = deriveKey(password, salt);

  let decrypted: string;
  try {
    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);
    decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    throw new BadRequestHttpError('Backup decryption failed. Incorrect password or corrupted data.');
  }

  const resources = deserializeBackupPayload(decrypted, input.format);

  const record: Record<string, unknown> = {
    [LD_CONTEXT]: [ 'https://schema.org/' ],
    [LD_TYPE]: 'DataFeed',
    [LD_ID]: id,
    dateRestored: new Date().toISOString(),
    resourceCount: resources.length,
  };

  return {
    id,
    resources,
    resourceCount: resources.length,
    record,
  };
}

/**
 * Build a backup manifest (metadata without the encrypted data).
 */
export function buildBackupManifest(
  id: string,
  organisation: string,
  format: BackupFormat,
  resourceCount: number,
  totalSize: number,
  createdAt: string,
  encryptedBlob: string,
): BackupManifest {
  const checksum = computeChecksum(encryptedBlob);

  const record: Record<string, unknown> = {
    [LD_CONTEXT]: [ 'https://schema.org/' ],
    [LD_TYPE]: 'DataCatalog',
    [LD_ID]: id,
    provider: { [LD_ID]: organisation },
    encodingFormat: format,
    resourceCount,
    contentSize: totalSize,
    dateCreated: createdAt,
    checksum,
  };

  return {
    id,
    organisation,
    format,
    resourceCount,
    totalSize,
    createdAt,
    checksum,
    record,
  };
}

function serializeBackupPayload(
  resources: readonly BackupResource[],
  format: BackupFormat,
  metadata: Record<string, string>,
): string {
  if (format === 'json' || format === 'json-ld') {
    return JSON.stringify({ metadata, resources });
  }

  if (format === 'turtle') {
    const lines: string[] = [];
    for (const res of resources) {
      lines.push(`# Resource: ${res.uri} (${res.contentType})`);
      lines.push(res.data);
      lines.push('');
    }
    return lines.join('\n');
  }

  if (format === 'n-quads') {
    return resources.map((r) => r.data).join('\n');
  }

  return JSON.stringify({ resources });
}

function deserializeBackupPayload(
  payload: string,
  format: BackupFormat,
): BackupResource[] {
  if (format === 'json' || format === 'json-ld') {
    const parsed = JSON.parse(payload) as { resources: BackupResource[] };
    return parsed.resources;
  }

  if (format === 'n-quads') {
    return [{
      uri: 'urn:databox:backup:n-quads',
      contentType: 'application/n-quads',
      data: payload,
    }];
  }

  // Turtle — split by resource markers
  const resources: BackupResource[] = [];
  const blocks = payload.split(/^# Resource: /m);
  for (const block of blocks) {
    if (block.trim().length === 0) continue;
    const headerMatch = block.match(/^(.+?) \((.+?)\)\n([\s\S]*)$/);
    if (headerMatch) {
      resources.push({
        uri: headerMatch[1],
        contentType: headerMatch[2],
        data: headerMatch[3].trim(),
      });
    }
  }

  if (resources.length === 0) {
    return [{
      uri: 'urn:databox:backup:turtle',
      contentType: 'text/turtle',
      data: payload,
    }];
  }

  return resources;
}

function computeChecksum(data: string): string {
  return createHash('sha256').update(data).digest('hex');
}
