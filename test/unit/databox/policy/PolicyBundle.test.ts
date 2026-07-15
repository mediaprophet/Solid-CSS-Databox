import { DBX_SOURCE_RANKS } from '../../../../src/databox/odrl/terms';
import {
  computeBundleDigest,
  EVALUATOR_VERSION,
  isBundleSubstituted,
  SOURCE_RANK_ORDER,
} from '../../../../src/databox/policy/PolicyBundle';
import { buildBundle, DBX_LEFT_OPERANDS, EQ_OP } from './PolicyTestSupport';

describe('PolicyBundle constants', (): void => {
  it('pins the evaluator version and the WebCivics source-rank order (more authoritative = lower).', (): void => {
    expect(EVALUATOR_VERSION).toBe('dbx-eval/1');
    expect(SOURCE_RANK_ORDER[DBX_SOURCE_RANKS.mandatoryBaseline]).toBe(0);
    expect(SOURCE_RANK_ORDER[DBX_SOURCE_RANKS.guardianPolicy]).toBe(1);
    expect(SOURCE_RANK_ORDER[DBX_SOURCE_RANKS.userPreference]).toBe(2);
  });
});

describe('computeBundleDigest / isBundleSubstituted', (): void => {
  it('produces a stable digest a validly-sealed bundle matches (not substituted).', (): void => {
    const bundle = buildBundle();
    expect(bundle.compiledPolicyDigest).toBe(computeBundleDigest(bundle));
    expect(isBundleSubstituted(bundle)).toBe(false);
  });

  it('detects substitution when a rule is tampered but the bound digest is kept (T-25).', (): void => {
    const sealed = buildBundle();
    // Tamper the rules AFTER sealing, keeping the old digest — the recomputed digest no longer matches.
    const tampered = { ...sealed, rules: [ ...sealed.rules, { ...sealed.rules[0], ruleType: 'prohibition' as const }]};
    expect(isBundleSubstituted(tampered)).toBe(true);
  });

  it('is invariant to the excluded fields (attestation + the bound digest itself).', (): void => {
    const bundle = buildBundle();
    const digest = computeBundleDigest(bundle);
    const reAttested = {
      ...bundle,
      attestation: { ...bundle.attestation!, attester: 'https://org.example/legal#other' },
      compiledPolicyDigest: 'urn:sha256:different',
    };
    expect(computeBundleDigest(reAttested)).toBe(digest);
  });

  it('covers the optional interval-until, jurisdiction, constraint and conflict-strategy branches.', (): void => {
    const withOptionals = buildBundle({
      effectiveInterval: { effectiveFrom: '2026-07-15T00:00:00.000Z', effectiveUntil: '2027-01-01T00:00:00.000Z' },
      jurisdiction: 'synthetic-jurisdiction',
      rules: [{
        ruleType: 'permission',
        target: 'retail-receipt',
        action: 'https://example/act',
        source: DBX_SOURCE_RANKS.mandatoryBaseline,
        constraints: [{ leftOperand: DBX_LEFT_OPERANDS.declaredPurpose, operator: EQ_OP, rightOperand: 'x' }],
        duties: [ 'https://example/duty' ],
        conflictStrategy: 'https://example/strategy',
      }],
    });
    // Two structurally-different bundles (optionals present vs absent) yield different digests.
    expect(computeBundleDigest(withOptionals)).not.toBe(computeBundleDigest(buildBundle()));
    expect(isBundleSubstituted(withOptionals)).toBe(false);
  });
});
