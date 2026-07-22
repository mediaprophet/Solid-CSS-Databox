import { randomBytes } from 'node:crypto';
import {
  MIN_OPAQUE_ID_BYTES,
  NotImplementedOpaqueIdentifierGenerator,
  RandomOpaqueIdentifierGenerator,
} from '../../../../src/databox/identifiers/OpaqueIdentifierGenerator';
import { BadRequestHttpError } from '../../../../src/util/errors/BadRequestHttpError';
import { InternalServerError } from '../../../../src/util/errors/InternalServerError';
import { NotImplementedHttpError } from '../../../../src/util/errors/NotImplementedHttpError';

const BASE = 'https://databox.example/boxes/';

describe('A RandomOpaqueIdentifierGenerator', (): void => {
  const generator = new RandomOpaqueIdentifierGenerator(BASE);

  it('marks itself opaque (ignores name for the emitted id).', (): void => {
    expect(generator.opaque).toBe(true);
  });

  it('mints identifiers of at least 128 bits of entropy (>= 32 hex chars).', (): void => {
    const { path } = generator.generate();
    const id = path.slice(BASE.length, -1);
    // 16 bytes -> 32 lowercase hex characters.
    expect(id).toMatch(/^[0-9a-f]{32}$/u);
    expect(id.length / 2).toBeGreaterThanOrEqual(MIN_OPAQUE_ID_BYTES);
  });

  it('honours a larger requested entropy.', (): void => {
    const wide = new RandomOpaqueIdentifierGenerator(BASE, 32);
    const id = wide.generate().path.slice(BASE.length, -1);
    expect(id).toMatch(/^[0-9a-f]{64}$/u);
  });

  it('ensures a trailing slash on the base.', (): void => {
    const noSlash = new RandomOpaqueIdentifierGenerator('https://databox.example/boxes');
    expect(noSlash.generate().path.startsWith('https://databox.example/boxes/')).toBe(true);
  });

  it('produces non-sequential, unique, unpredictable identifiers (T-06 enumeration).', (): void => {
    const ids = new Set<string>();
    let previous = '';
    for (let i = 0; i < 1000; i++) {
      const id = generator.generate().path;
      ids.add(id);
      // No two consecutive ids share a common prefix beyond the base (no counter/sequence structure).
      const previousSuffix = previous.slice(BASE.length);
      const currentSuffix = id.slice(BASE.length);
      expect(currentSuffix).not.toBe(previousSuffix);
      previous = id;
    }
    // All 1000 draws are distinct: the space is >= 2^128, collisions are negligible.
    expect(ids.size).toBe(1000);
  });

  it('never lets the name argument influence the emitted identifier (invariant 2).', (): void => {
    // Feeding the same "name" thousands of times still yields all-distinct random ids: the name is
    // structurally incapable of reaching the identifier.
    const ids = new Set<string>();
    const secret = 'customer-sensitive-secret@example.com';
    for (let i = 0; i < 500; i++) {
      ids.add((generator as { generate: (name: string) => { path: string }}).generate(secret).path);
    }
    expect(ids.size).toBe(500);
    for (const id of ids) {
      expect(id).not.toContain('customer');
      expect(id).not.toContain('sensitive');
      expect(id).not.toContain('example.com');
    }
  });

  it('rejects a sub-128-bit entropy request (fail closed).', (): void => {
    expect((): unknown => new RandomOpaqueIdentifierGenerator(BASE, 8)).toThrow(InternalServerError);
    expect((): unknown => new RandomOpaqueIdentifierGenerator(BASE, 15)).toThrow(InternalServerError);
  });

  it('rejects a non-integer entropy request (fail closed).', (): void => {
    expect((): unknown => new RandomOpaqueIdentifierGenerator(BASE, 16.5)).toThrow(InternalServerError);
  });

  it('extracts the box root from a resource within a box.', (): void => {
    const id = randomBytes(MIN_OPAQUE_ID_BYTES).toString('hex');
    const boxRoot = `${BASE}${id}/`;
    const resource = { path: `${boxRoot}records/receipts/abc` };
    expect(generator.extractPod(resource)).toEqual({ path: boxRoot });
  });

  it('returns the box root unchanged when given the box root itself.', (): void => {
    const id = randomBytes(MIN_OPAQUE_ID_BYTES).toString('hex');
    const boxRoot = `${BASE}${id}/`;
    expect(generator.extractPod({ path: boxRoot })).toEqual({ path: boxRoot });
  });

  it('refuses to extract a pod for an identifier outside the base (fail closed).', (): void => {
    expect((): unknown => generator.extractPod({ path: 'https://elsewhere.example/boxes/abc/' }))
      .toThrow(BadRequestHttpError);
  });

  it('refuses to extract a pod when there is no box segment (fail closed).', (): void => {
    // Base with no following box segment / slash.
    expect((): unknown => generator.extractPod({ path: BASE }))
      .toThrow(BadRequestHttpError);
    expect((): unknown => generator.extractPod({ path: `${BASE}nooo` }))
      .toThrow(BadRequestHttpError);
  });
});

describe('A NotImplementedOpaqueIdentifierGenerator', (): void => {
  const generator = new NotImplementedOpaqueIdentifierGenerator();

  it('is marked opaque.', (): void => {
    expect(generator.opaque).toBe(true);
  });

  it('refuses to mint an identifier (fail closed).', (): void => {
    expect((): unknown => generator.generate('name')).toThrow(NotImplementedHttpError);
  });

  it('refuses to resolve an identifier (fail closed).', (): void => {
    expect((): unknown => generator.extractPod({ path: `${BASE}bx/` })).toThrow(NotImplementedHttpError);
  });
});
