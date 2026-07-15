import { presentOdrlTerms } from '../../../../src/databox/agent/OdrlTermsPresenter';
import type { OdrlPolicy } from '../../../../src/databox/agent/OdrlTermsPresenter';
import { DBX_PROFILE_V1 } from '../../../../src/databox/odrl/terms';

const READ = 'http://www.w3.org/ns/odrl/2/read';
const SUBMIT = 'https://w3id.org/solid-databox/ns#submit';
const PURPOSE = 'http://www.w3.org/ns/odrl/2/purpose';
const EQ = 'http://www.w3.org/ns/odrl/2/eq';
const PERSONAL = 'https://w3id.org/solid-databox/ns#personalRecordkeeping';

describe('presentOdrlTerms', (): void => {
  it('renders permissions/prohibitions/duties understandably, keeping the machine-readable policy.', (): void => {
    const policy: OdrlPolicy = {
      uid: 'https://org.example/policy/1',
      profile: DBX_PROFILE_V1,
      permission: [{ action: READ, constraints: [{ leftOperand: PURPOSE, operator: EQ, rightOperand: PERSONAL }]}],
      prohibition: [{ action: 'http://www.w3.org/ns/odrl/2/distribute' }],
      obligation: [{ action: 'https://w3id.org/solid-databox/ns#issueReceipt' }],
    };
    const presented = presentOdrlTerms(policy);
    expect(presented.profileSupported).toBe(true);
    expect(presented.fullyUnderstood).toBe(true);
    expect(presented.machineReadable).toBe(policy);
    expect(presented.rules).toHaveLength(3);
    const [ perm, prohib, duty ] = presented.rules;
    expect(perm.ruleType).toBe('permission');
    expect(perm.humanReadable).toContain('permits you to read this record');
    expect(perm.humanReadable).toContain('where');
    expect(perm.constraints[0].supported).toBe(true);
    expect(prohib.ruleType).toBe('prohibition');
    expect(prohib.humanReadable).toContain('prohibits');
    expect(duty.ruleType).toBe('duty');
    expect(duty.humanReadable).toContain('requires');
  });

  it('flags an unknown action + unsupported profile as not fully understood (fail closed).', (): void => {
    const presented = presentOdrlTerms({
      profile: 'https://example.com/other-profile',
      permission: [{ action: 'https://example.com/unknown-action' }],
    });
    expect(presented.profileSupported).toBe(false);
    expect(presented.rules[0].actionSupported).toBe(false);
    expect(presented.rules[0].humanReadable).toContain('perform the action');
    expect(presented.fullyUnderstood).toBe(false);
  });

  it('marks a rule with an unsupported constraint operand as not understood but still presents it.', (): void => {
    const presented = presentOdrlTerms({
      profile: DBX_PROFILE_V1,
      permission: [{ action: SUBMIT, constraints: [{ leftOperand: 'x', operator: EQ, rightOperand: PERSONAL }]}],
    });
    expect(presented.rules[0].actionSupported).toBe(true);
    expect(presented.rules[0].constraints[0].supported).toBe(false);
    expect(presented.fullyUnderstood).toBe(false);
  });

  it('handles a policy with no rules (an empty but supported policy).', (): void => {
    const presented = presentOdrlTerms({ profile: DBX_PROFILE_V1 });
    expect(presented.rules).toHaveLength(0);
    expect(presented.fullyUnderstood).toBe(true);
  });
});
