import { IdempotencyRegistry } from '../../../../src/databox/gateway/IdempotencyRegistry';
import type { GatewayAcceptance, NamespacedEventKey } from '../../../../src/databox/gateway/GatewayTypes';
import { BadRequestHttpError } from '../../../../src/util/errors/BadRequestHttpError';

const event: NamespacedEventKey = {
  organisation: 'org-1',
  program: 'prog-1',
  sourceSystem: 'sor-pos',
  eventType: 'receipt',
  sourceEventId: 'urn:uuid:abc',
};

const acceptance: GatewayAcceptance = {
  container: 'records',
  classId: 'rc-receipt',
  relationshipId: 'rel-1',
  payloadDigest: 'deadbeef',
  policyRef: { policyTemplate: 'pt-records', policyVersion: '1.0.0' },
};

const fixedSecret = { secretFactory: (): Buffer => Buffer.alloc(32, 7) };

describe('IdempotencyRegistry (namespaced deposit idempotency, ADR-0016 HD-12, T-24)', (): void => {
  it('derives a stable keyed HMAC for a complete tuple (deterministic across retries).', (): void => {
    const registry = new IdempotencyRegistry(fixedSecret);
    const key = registry.keyFor(event);
    expect(key).toMatch(/^[0-9a-f]{64}$/u);
    // Same tuple + same program secret → same key (stable across attempts, not minted per retry).
    expect(new IdempotencyRegistry(fixedSecret).keyFor(event)).toBe(key);
  });

  it('caches the per-program secret across calls and separates programs.', (): void => {
    const registry = new IdempotencyRegistry(fixedSecret);
    const keyA = registry.keyFor(event);
    const keyAgain = registry.keyFor(event);
    const keyOtherProgram = registry.keyFor({ ...event, program: 'prog-2' });
    expect(keyAgain).toBe(keyA);
    // The program is part of the HMAC message, so a different program yields an unrelated key.
    expect(keyOtherProgram).not.toBe(keyA);
  });

  it('fails closed on an incomplete tuple (never mints a per-attempt key).', (): void => {
    const registry = new IdempotencyRegistry(fixedSecret);
    expect((): string => registry.keyFor({ ...event, sourceEventId: '' }))
      .toThrow(BadRequestHttpError);
  });

  it('remembers the first acceptance and returns the ORIGINAL on a duplicate (never overwrites).', (): void => {
    const registry = new IdempotencyRegistry(fixedSecret);
    const key = registry.keyFor(event);
    expect(registry.lookup(key)).toBeUndefined();

    const first = registry.remember(key, acceptance);
    expect(first).toEqual({ duplicate: false, acceptance });
    expect(registry.lookup(key)).toEqual(acceptance);

    const second = registry.remember(key, { ...acceptance, payloadDigest: 'CHANGED' });
    expect(second.duplicate).toBe(true);
    expect(second.acceptance).toEqual(acceptance);
  });

  it('works with the CSPRNG secret default when no options are given.', (): void => {
    const registry = new IdempotencyRegistry();
    expect(registry.keyFor(event)).toMatch(/^[0-9a-f]{64}$/u);
  });
});
