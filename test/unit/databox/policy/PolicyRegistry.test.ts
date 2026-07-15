import { BadRequestHttpError } from '../../../../src/util/errors/BadRequestHttpError';
import type { AdmissionResult } from '../../../../src/databox/policy/BundleAdmission';
import { computeBundleDigest } from '../../../../src/databox/policy/PolicyBundle';
import { PolicyRegistry } from '../../../../src/databox/policy/PolicyRegistry';
import { buildBundle } from './PolicyTestSupport';

function admitted(bundle = buildBundle()): AdmissionResult {
  return { admitted: true, reason: 'admitted', bundle };
}

describe('PolicyRegistry.register', (): void => {
  it('registers an admitted bundle and retains it per asset class (history is kept).', (): void => {
    const registry = new PolicyRegistry();
    const bundle = registry.register(admitted());
    expect(registry.versionsFor('retail-receipt')).toStrictEqual([ bundle ]);
    expect(registry.versionsFor('other-class')).toStrictEqual([]);
  });

  it('refuses to register a non-admitted or bundle-less result (fail closed).', (): void => {
    const registry = new PolicyRegistry();
    expect((): unknown => registry.register({ admitted: false, reason: 'proposed' }))
      .toThrow(BadRequestHttpError);
    expect((): unknown => registry.register({ admitted: true, reason: 'admitted', bundle: undefined }))
      .toThrow(BadRequestHttpError);
  });

  it('refuses to register a substituted bundle even if flagged admitted (defence in depth, T-25).', (): void => {
    const registry = new PolicyRegistry();
    const sealed = buildBundle();
    const tampered = { ...sealed, policyVersion: 'tampered' };
    expect((): unknown => registry.register({ admitted: true, reason: 'admitted', bundle: tampered }))
      .toThrow('substituted');
  });
});

describe('PolicyRegistry.resolve (ADR-0014 effective-time)', (): void => {
  const v1 = buildBundle({
    policyVersion: 'v1',
    effectiveInterval: { effectiveFrom: '2026-01-01T00:00:00Z', effectiveUntil: '2026-07-01T00:00:00Z' },
  });
  const v2 = buildBundle({
    policyVersion: 'v2',
    effectiveInterval: { effectiveFrom: '2026-07-01T00:00:00Z' },
  });

  function registry(): PolicyRegistry {
    const reg = new PolicyRegistry();
    reg.register(admitted(v1));
    reg.register(admitted(v2));
    return reg;
  }

  it('selects the version whose effective interval contains the time (prospective governance).', (): void => {
    const reg = registry();
    const before = reg.resolve('retail-receipt', '2026-03-01T00:00:00Z');
    const after = reg.resolve('retail-receipt', '2026-09-01T00:00:00Z');
    expect(before.ok && before.bundle.policyVersion).toBe('v1');
    expect(after.ok && after.bundle.policyVersion).toBe('v2');
  });

  it('fails closed when no version governs the time.', (): void => {
    expect(registry().resolve('retail-receipt', '2025-01-01T00:00:00Z'))
      .toStrictEqual({ ok: false, reason: 'no-governing-version' });
  });

  it('fails closed on OVERLAPPING intervals (ambiguous selection).', (): void => {
    const reg = new PolicyRegistry();
    reg.register(admitted(buildBundle({
      policyVersion: 'a',
      effectiveInterval: { effectiveFrom: '2026-01-01T00:00:00Z' },
    })));
    reg.register(admitted(buildBundle({
      policyVersion: 'b',
      effectiveInterval: { effectiveFrom: '2026-02-01T00:00:00Z' },
    })));
    expect(reg.resolve('retail-receipt', '2026-06-01T00:00:00Z'))
      .toStrictEqual({ ok: false, reason: 'ambiguous-version' });
  });

  it('fails closed on an unparseable request time.', (): void => {
    expect(registry().resolve('retail-receipt', 'not-a-time'))
      .toStrictEqual({ ok: false, reason: 'malformed-time' });
  });

  it('fails closed on a malformed effective interval (bad from, or until <= from).', (): void => {
    const badFrom = new PolicyRegistry();
    badFrom.register(admitted(buildBundle({ effectiveInterval: { effectiveFrom: 'nope' }})));
    expect(badFrom.resolve('retail-receipt', '2026-08-01T00:00:00Z').reason).toBe('malformed-interval');

    const badUntil = new PolicyRegistry();
    badUntil.register(admitted(buildBundle({
      effectiveInterval: { effectiveFrom: '2026-07-01T00:00:00Z', effectiveUntil: '2026-01-01T00:00:00Z' },
    })));
    expect(badUntil.resolve('retail-receipt', '2026-08-01T00:00:00Z').reason).toBe('malformed-interval');
  });

  it('keeps the sealed digests intact so resolve returns the exact governing bytes.', (): void => {
    const reg = registry();
    const resolved = reg.resolve('retail-receipt', '2026-03-01T00:00:00Z');
    expect(resolved.ok && computeBundleDigest(resolved.bundle)).toBe(v1.compiledPolicyDigest);
  });
});
