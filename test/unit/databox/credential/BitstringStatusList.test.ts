import {
  BitstringStatusList,
  MIN_STATUS_LIST_SIZE,
  StatusListManager,
} from '../../../../src/databox/credential/BitstringStatusList';
import { BadRequestHttpError } from '../../../../src/util/errors/BadRequestHttpError';
import { InternalServerError } from '../../../../src/util/errors/InternalServerError';

describe('BitstringStatusList', (): void => {
  it('defaults to the minimum size and rejects weak/odd sizes.', (): void => {
    expect(new BitstringStatusList().size).toBe(MIN_STATUS_LIST_SIZE);
    expect((): unknown => new BitstringStatusList(8)).toThrow(InternalServerError);
    expect((): unknown => new BitstringStatusList(MIN_STATUS_LIST_SIZE + 1)).toThrow(InternalServerError);
    expect((): unknown => new BitstringStatusList(1.5)).toThrow(InternalServerError);
  });

  it('sets, clears and reads status bits.', (): void => {
    const list = new BitstringStatusList();
    expect(list.getStatus(42)).toBe(false);
    list.setStatus(42, true);
    expect(list.getStatus(42)).toBe(true);
    expect(list.populationCount).toBe(1);
    list.setStatus(42, false);
    expect(list.getStatus(42)).toBe(false);
    expect(list.populationCount).toBe(0);
  });

  it('rejects out-of-range indices.', (): void => {
    const list = new BitstringStatusList();
    expect((): unknown => list.getStatus(-1)).toThrow(BadRequestHttpError);
    expect((): unknown => list.setStatus(list.size, true)).toThrow(BadRequestHttpError);
    expect((): unknown => list.getStatus(1.2)).toThrow(BadRequestHttpError);
  });

  it('encodes with the multibase "u" prefix and decodes losslessly (LOW-4).', (): void => {
    const list = new BitstringStatusList();
    list.setStatus(7, true);
    list.setStatus(9000, true);
    const encoded = list.encode();
    expect(encoded.startsWith('u')).toBe(true);
    const decoded = BitstringStatusList.decode(encoded);
    expect(decoded.getStatus(7)).toBe(true);
    expect(decoded.getStatus(9000)).toBe(true);
    expect(decoded.getStatus(8)).toBe(false);
  });

  it('rejects an encoded list missing the "u" prefix or with bad gzip.', (): void => {
    expect((): unknown => BitstringStatusList.decode('!!!not-gzip!!!')).toThrow('multibase base64url');
    // Correct "u" prefix but the payload is not GZIP (base64url "AAAA" = 3 zero bytes) — the catch rejects it.
    expect((): unknown => BitstringStatusList.decode('uAAAA')).toThrow('valid GZIP');
  });

  describe('StatusListManager', (): void => {
    it('assigns stable indices idempotently.', (): void => {
      const manager = new StatusListManager('https://databox.example/status/1');
      const first = manager.register('urn:uuid:a');
      expect(manager.register('urn:uuid:a')).toBe(first);
      expect(manager.register('urn:uuid:b')).toBe(first + 1);
    });

    it('revokes a registered connection and reports status; unknown ids are not revoked.', (): void => {
      const manager = new StatusListManager('https://databox.example/status/1');
      manager.register('urn:uuid:a');
      expect(manager.isRevoked('urn:uuid:a')).toBe(false);
      expect(manager.isRevoked('urn:uuid:unknown')).toBe(false);
      manager.setRevoked('urn:uuid:a', true);
      expect(manager.isRevoked('urn:uuid:a')).toBe(true);
    });

    it('refuses to set status for an unregistered connection.', (): void => {
      const manager = new StatusListManager('https://databox.example/status/1');
      expect((): unknown => manager.setRevoked('urn:uuid:x', true)).toThrow(BadRequestHttpError);
    });

    it('is the single source of truth for the index: register() index == the bit read/written (MED-3).', (): void => {
      const manager = new StatusListManager('https://databox.example/status/1');
      const index = manager.register('urn:uuid:a');
      // The index the issuer would embed in the credential.
      expect(manager.indexForConnection('urn:uuid:a')).toBe(index);
      expect(manager.indexForConnection('urn:uuid:never')).toBeUndefined();
      // Revoking by connection flips exactly the bit a verifier reads by the credential's embedded index.
      expect(manager.isRevokedByIndex(index)).toBe(false);
      manager.setRevoked('urn:uuid:a', true);
      expect(manager.isRevokedByIndex(index)).toBe(true);
      // And the registry-side index setter agrees.
      manager.setRevokedByIndex(index, false);
      expect(manager.isRevoked('urn:uuid:a')).toBe(false);
    });

    it('publishes only above the herd-privacy floor.', (): void => {
      const manager = new StatusListManager('https://databox.example/status/1', 'revocation', 2);
      manager.register('urn:uuid:a');
      expect((): unknown => manager.publish()).toThrow(InternalServerError);
      manager.register('urn:uuid:b');
      const published = manager.publish();
      expect(published).toMatchObject({ statusPurpose: 'revocation', herdSize: 2 });
      expect(BitstringStatusList.decode(published.encodedList).size).toBeGreaterThanOrEqual(MIN_STATUS_LIST_SIZE);
    });
  });
});
