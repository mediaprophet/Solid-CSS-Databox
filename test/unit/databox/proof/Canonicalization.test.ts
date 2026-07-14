import { sha256Hex } from '../../../../src/databox/credential/Es256';
import {
  canonicalDigest,
  canonicalize,
  digestOfBytes,
  normalizeSha256,
  PINNED_CANONICALIZATION_ALG,
} from '../../../../src/databox/proof/Canonicalization';
import { BadRequestHttpError } from '../../../../src/util/errors/BadRequestHttpError';

describe('canonicalize', (): void => {
  it('sorts object members by code unit and emits minimal separators, regardless of input order.', (): void => {
    expect(canonicalize({ b: 1, a: 2, A: 3 })).toBe('{"A":3,"a":2,"b":1}');
    // Two differently-ordered inputs produce the identical canonical string (determinism).
    expect(canonicalize({ z: { y: 2, x: 1 }, a: [ 3, 2, 1 ]}))
      .toBe(canonicalize({ a: [ 3, 2, 1 ], z: { x: 1, y: 2 }}));
  });

  it('preserves array order and length, mapping holes/undefined elements to null (JSON semantics).', (): void => {
    expect(canonicalize([ 3, 1, 2 ])).toBe('[3,1,2]');
    // eslint-disable-next-line no-sparse-arrays -- deliberately exercising the hole->null branch.
    expect(canonicalize([ 1, , 2 ])).toBe('[1,null,2]');
    expect(canonicalize([ 1, undefined, 2 ])).toBe('[1,null,2]');
  });

  it('omits undefined-valued object members but keeps null.', (): void => {
    expect(canonicalize({ a: undefined, b: null, c: 1 })).toBe('{"b":null,"c":1}');
  });

  it('handles primitives, booleans and finite numbers.', (): void => {
    expect(canonicalize('x')).toBe('"x"');
    expect(canonicalize(true)).toBe('true');
    expect(canonicalize(null)).toBe('null');
    expect(canonicalize(12)).toBe('12');
  });

  it('does not mutate the input object.', (): void => {
    const input = Object.freeze({ b: 1, a: Object.freeze({ y: 2, x: 1 }) });
    expect((): string => canonicalize(input)).not.toThrow();
    expect(input).toEqual({ b: 1, a: { y: 2, x: 1 }});
  });

  it('fails closed on a non-finite number.', (): void => {
    expect((): string => canonicalize(Number.NaN)).toThrow(BadRequestHttpError);
    expect((): string => canonicalize(Number.POSITIVE_INFINITY)).toThrow('non-finite');
  });

  it('rejects a number outside the portable decimal domain (>= 1e21) deterministically (M2).', (): void => {
    expect((): string => canonicalize(1e21)).toThrow('portable decimal domain');
    expect((): string => canonicalize(-1e21)).toThrow(BadRequestHttpError);
    expect((): string => canonicalize({ n: 1e30 })).toThrow('portable decimal domain');
    // A large-but-in-domain integer still canonicalizes to a plain decimal.
    expect(canonicalize(1e20)).toBe('100000000000000000000');
  });

  it('normalises negative zero to 0 (M2).', (): void => {
    expect(canonicalize(-0)).toBe('0');
    expect(canonicalize({ a: -0 })).toBe('{"a":0}');
  });

  it('rejects a non-NFC string and accepts its NFC form (M2).', (): void => {
    // Precomposed e-acute (NFC, one code point) vs e + combining acute (NFD): same text, other bytes.
    const nfc = 'é';
    const nonNfc = 'é';
    expect(nfc).not.toBe(nonNfc);
    expect(canonicalize(nfc)).toBe(JSON.stringify(nfc));
    expect((): string => canonicalize(nonNfc)).toThrow('NFC');
    expect((): string => canonicalize({ label: nonNfc })).toThrow(BadRequestHttpError);
  });

  it('fails closed on a non-serialisable value (undefined/function/symbol/bigint).', (): void => {
    expect((): string => canonicalize(undefined)).toThrow(BadRequestHttpError);
    expect((): string => canonicalize((): void => undefined)).toThrow('type');
    expect((): string => canonicalize(Symbol('s'))).toThrow('symbol');
    expect((): string => canonicalize(10n)).toThrow('bigint');
  });
});

describe('digests', (): void => {
  it('digestOfBytes is the sha256 of the exact bytes as a urn.', (): void => {
    expect(digestOfBytes('abc')).toBe(`urn:sha256:${sha256Hex('abc')}`);
    expect(digestOfBytes(Buffer.from('abc', 'utf8'))).toBe(digestOfBytes('abc'));
  });

  it('canonicalDigest is the sha256 of the canonical form.', (): void => {
    expect(canonicalDigest({ a: 1, b: 2 })).toBe(`urn:sha256:${sha256Hex('{"a":1,"b":2}')}`);
    expect(canonicalDigest({ b: 2, a: 1 })).toBe(canonicalDigest({ a: 1, b: 2 }));
  });

  it('normalizeSha256 strips a urn prefix and lowercases.', (): void => {
    expect(normalizeSha256('urn:sha256:ABCD')).toBe('abcd');
    expect(normalizeSha256('ABCD')).toBe('abcd');
  });

  it('exposes the pinned canonicalization identifier.', (): void => {
    expect(PINNED_CANONICALIZATION_ALG).toBe('dbx-jcs/1.0.0');
  });
});
