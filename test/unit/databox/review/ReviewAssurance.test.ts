import type { AssuranceDimensionLevels } from '../../../../src/databox/context/DataboxRequestContext';
import { evaluateAssurance, meetsAssurance } from '../../../../src/databox/review/ReviewAssurance';
import { fullDimensions, makeContext } from './ReviewTestSupport';

describe('ReviewAssurance.evaluateAssurance', (): void => {
  it('meets an empty requirement even with no verified assurance (nothing required).', (): void => {
    expect(evaluateAssurance(makeContext(), {})).toStrictEqual({ met: true });
  });

  it('fails closed when the context carries no verified assurance and a dimension is required.', (): void => {
    const result = evaluateAssurance(makeContext(), { identityProofing: 2 });
    expect(result).toStrictEqual({ met: false, shortfallDimension: 'identityProofing' });
  });

  it('meets a requirement when every required dimension is at or above its minimum.', (): void => {
    expect(evaluateAssurance(makeContext(fullDimensions(3)), { identityProofing: 2, stepUpState: 3 }).met).toBe(true);
  });

  it('fails on the first dimension below its minimum, naming it.', (): void => {
    const result = evaluateAssurance(makeContext(fullDimensions(1)), { authenticatorStrength: 2 });
    expect(result).toStrictEqual({ met: false, shortfallDimension: 'authenticatorStrength' });
  });

  it('treats a required dimension missing from the verified levels as 0 (fail closed).', (): void => {
    // A partial levels object (missing authenticationFreshness) exercises the `?? 0` default.
    const partial = { identityProofing: 3 } as unknown as AssuranceDimensionLevels;
    const result = evaluateAssurance(makeContext(partial), { authenticationFreshness: 1 });
    expect(result).toStrictEqual({ met: false, shortfallDimension: 'authenticationFreshness' });
  });
});

describe('ReviewAssurance.meetsAssurance', (): void => {
  it('is a boolean convenience over evaluateAssurance.', (): void => {
    expect(meetsAssurance(makeContext(fullDimensions(2)), { identityProofing: 2 })).toBe(true);
    expect(meetsAssurance(makeContext(fullDimensions(1)), { identityProofing: 2 })).toBe(false);
  });
});
