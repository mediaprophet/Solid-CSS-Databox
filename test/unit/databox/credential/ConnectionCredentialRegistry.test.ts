import { StatusListManager } from '../../../../src/databox/credential/BitstringStatusList';
import type { IssuedConnectionCredential } from '../../../../src/databox/credential/ConnectionCredentialIssuer';
import { ConnectionCredentialIssuer } from '../../../../src/databox/credential/ConnectionCredentialIssuer';
import { ConnectionCredentialRegistry } from '../../../../src/databox/credential/ConnectionCredentialRegistry';
import { BadRequestHttpError } from '../../../../src/util/errors/BadRequestHttpError';
import { InternalServerError } from '../../../../src/util/errors/InternalServerError';
import type { TestKeyPair } from './TestKeys';
import { generateEs256KeyPair } from './TestKeys';

const issuerKeys = generateEs256KeyPair();
const keyA = generateEs256KeyPair();
const keyB = generateEs256KeyPair();
const PROGRAM = 'https://databox.example/programs/rewards-v1';

function issue(
  holder: TestKeyPair,
  overrides: { program?: string; relationship?: string; statusListIndex?: number } = {},
): IssuedConnectionCredential {
  const issuer = new ConnectionCredentialIssuer('https://databox.example/id#issuer', issuerKeys.privateKey, 'k');
  return issuer.issue({
    pairwiseWebId: 'https://vault.example/id#me',
    holderPublicJwk: holder.publicJwk,
    program: overrides.program ?? PROGRAM,
    databox: 'https://databox.example/boxes/bx_7/',
    storageDescription: 'https://databox.example/boxes/bx_7/description',
    accessGrant: { id: 'g', bytes: 'x' },
    accessProfile: 'https://w3id.org/solid-databox/access/v1',
    conformsTo: [ 'https://solidproject.org/TR/protocol' ],
    syncProfile: 'https://w3id.org/solid-databox/sync/v1',
    relationship: overrides.relationship ?? 'urn:uuid:rel-1',
    statusListIndex: overrides.statusListIndex ?? 0,
    statusListCredential: 'https://databox.example/status/1',
    validForMs: 1_000_000,
  });
}

describe('ConnectionCredentialRegistry', (): void => {
  it('installs a connection and rejects a duplicate install.', (): void => {
    const registry = new ConnectionCredentialRegistry();
    const cred = issue(keyA);
    const stored = registry.install(cred);
    expect(stored.state).toBe('active');
    expect(registry.get(PROGRAM, cred.connectionId)?.state).toBe('active');
    expect((): unknown => registry.install(cred)).toThrow('already installed');
  });

  it('isolates connections by program and never lists the whole vault.', (): void => {
    const registry = new ConnectionCredentialRegistry();
    const a = issue(keyA);
    const b = issue(keyB, { program: 'https://databox.example/programs/other', relationship: 'urn:uuid:rel-2' });
    registry.install(a);
    registry.install(b);
    expect(registry.listConnections(PROGRAM)).toEqual([ a.connectionId ]);
    expect(registry.listConnections('https://databox.example/programs/other')).toEqual([ b.connectionId ]);
    expect(registry.get('https://databox.example/programs/other', a.connectionId)).toBeUndefined();
    expect(registry.listConnections('https://databox.example/programs/absent')).toEqual([]);
  });

  it('exports and imports a single connection without disclosing siblings.', (): void => {
    const source = new ConnectionCredentialRegistry();
    const cred = issue(keyA);
    source.install(cred);
    const bundle = source.exportConnection(PROGRAM, cred.connectionId);
    expect(Object.keys(bundle)).not.toContain('siblings');
    expect(bundle.connectionId).toBe(cred.connectionId);

    const target = new ConnectionCredentialRegistry();
    expect(target.importConnection(bundle).state).toBe('active');
    expect((): unknown => target.importConnection(bundle)).toThrow('already present');
    expect((): unknown => source.exportConnection(PROGRAM, 'urn:uuid:missing')).toThrow(BadRequestHttpError);
  });

  it('acknowledges installation exactly once (append-only).', (): void => {
    const registry = new ConnectionCredentialRegistry();
    const cred = issue(keyA);
    registry.install(cred);
    expect(registry.acknowledgeInstallation(PROGRAM, cred.connectionId, 'urn:evidence:1').installedAck)
      .toBe('urn:evidence:1');
    expect((): unknown => registry.acknowledgeInstallation(PROGRAM, cred.connectionId, 'urn:evidence:2'))
      .toThrow('already been acknowledged');
    expect((): unknown => registry.acknowledgeInstallation(PROGRAM, cred.connectionId, ''))
      .toThrow('non-empty evidence');
    expect((): unknown => registry.acknowledgeInstallation(PROGRAM, 'urn:uuid:missing', 'e'))
      .toThrow('No connection');
  });

  it('suspends, reactivates and revokes with correct state guards.', (): void => {
    const registry = new ConnectionCredentialRegistry();
    const cred = issue(keyA);
    registry.install(cred);
    expect(registry.suspend(PROGRAM, cred.connectionId).state).toBe('suspended');
    expect((): unknown => registry.suspend(PROGRAM, cred.connectionId)).toThrow('active connection can be suspended');
    expect(registry.reactivate(PROGRAM, cred.connectionId).state).toBe('active');
    expect((): unknown => registry.reactivate(PROGRAM, cred.connectionId))
      .toThrow('suspended connection can be reactivated');
    expect(registry.revoke(PROGRAM, cred.connectionId).state).toBe('revoked');
    expect((): unknown => registry.revoke(PROGRAM, cred.connectionId)).toThrow('already revoked');
  });

  it('renews with the same holder key, superseding the predecessor and retaining its history.', (): void => {
    const registry = new ConnectionCredentialRegistry();
    const p = issue(keyA);
    registry.install(p);
    const renewed = registry.renew(PROGRAM, p.connectionId, issue(keyA), 5000);
    expect(renewed.state).toBe('active');
    expect(renewed.supersedes).toBe(p.connectionId);
    expect(renewed.keyHistory.map((entry): string => entry.credentialId)).toEqual([ p.connectionId ]);
    expect(registry.get(PROGRAM, p.connectionId)?.state).toBe('superseded');
    expect(registry.get(PROGRAM, p.connectionId)?.supersededBy).toBe(renewed.connectionId);
  });

  it('rejects a renewal that changes the holder key and a rotation that keeps it.', (): void => {
    const registry = new ConnectionCredentialRegistry();
    const p = issue(keyA);
    registry.install(p);
    expect((): unknown => registry.renew(PROGRAM, p.connectionId, issue(keyB))).toThrow('keep the same holder key');
    expect((): unknown => registry.rotateHolderKey(PROGRAM, p.connectionId, issue(keyA)))
      .toThrow('bind a new holder key');
  });

  it('rotates the holder key, retiring the old key into history (T-33).', (): void => {
    const registry = new ConnectionCredentialRegistry();
    const p = issue(keyA);
    registry.install(p);
    const rotated = registry.rotateHolderKey(PROGRAM, p.connectionId, issue(keyB), 7000);
    expect(rotated.holderThumbprint).not.toBe(p.holderThumbprint);
    expect(rotated.keyHistory[0]).toMatchObject({ reason: 'rotation', thumbprint: p.holderThumbprint });
    expect(registry.get(PROGRAM, p.connectionId)?.state).toBe('superseded');
  });

  it('migrates: predecessor revoked, history preserved, obsolete access dropped (T-48).', (): void => {
    const registry = new ConnectionCredentialRegistry();
    const p = issue(keyA);
    registry.install(p);
    const migrated = registry.migrate(PROGRAM, p.connectionId, issue(keyB));
    expect(registry.get(PROGRAM, p.connectionId)?.state).toBe('revoked');
    expect(migrated.state).toBe('active');
    expect(migrated.keyHistory[0]).toMatchObject({ reason: 'migration', credentialId: p.connectionId });
  });

  it('carries history forward across successive supersessions.', (): void => {
    const registry = new ConnectionCredentialRegistry();
    const p1 = issue(keyA);
    registry.install(p1);
    const p2 = registry.renew(PROGRAM, p1.connectionId, issue(keyA));
    const p3 = registry.rotateHolderKey(PROGRAM, p2.connectionId, issue(keyB));
    expect(p3.keyHistory.map((entry): string => entry.credentialId)).toEqual([ p1.connectionId, p2.connectionId ]);
  });

  it('refuses to supersede a non-active or cross-relationship connection, or collide an existing id.', (): void => {
    const registry = new ConnectionCredentialRegistry();
    const p = issue(keyA);
    registry.install(p);
    registry.renew(PROGRAM, p.connectionId, issue(keyA));
    expect((): unknown => registry.renew(PROGRAM, p.connectionId, issue(keyA)))
      .toThrow('Cannot supersede a superseded');

    const q = issue(keyA);
    registry.install(q);
    expect((): unknown => registry.renew(PROGRAM, q.connectionId, issue(keyA, { relationship: 'urn:uuid:rel-99' })))
      .toThrow('same program and relationship');

    const r = issue(keyA);
    registry.install(r);
    const successor = issue(keyB);
    registry.install(successor);
    expect((): unknown => registry.rotateHolderKey(PROGRAM, r.connectionId, successor)).toThrow(InternalServerError);
  });

  it('flips the published status bit on revoke (MED-2).', (): void => {
    const statusManager = new StatusListManager('https://databox.example/status/1');
    const registry = new ConnectionCredentialRegistry(statusManager);
    const cred = issue(keyA, { statusListIndex: 3 });
    registry.install(cred);
    expect(statusManager.isRevokedByIndex(3)).toBe(false);
    registry.revoke(PROGRAM, cred.connectionId);
    expect(statusManager.isRevokedByIndex(3)).toBe(true);
  });

  it('flips the predecessor\'s published status bit on migrate, preserving history (MED-2 / T-48).', (): void => {
    const statusManager = new StatusListManager('https://databox.example/status/1');
    const registry = new ConnectionCredentialRegistry(statusManager);
    const predecessor = issue(keyA, { statusListIndex: 3 });
    registry.install(predecessor);
    const migrated = registry.migrate(PROGRAM, predecessor.connectionId, issue(keyB, { statusListIndex: 4 }));
    // Predecessor's own status bit is now revoked in the PUBLISHED list; the successor's bit is untouched.
    expect(statusManager.isRevokedByIndex(3)).toBe(true);
    expect(statusManager.isRevokedByIndex(4)).toBe(false);
    expect(migrated.keyHistory[0]).toMatchObject({ reason: 'migration', credentialId: predecessor.connectionId });
  });
});
