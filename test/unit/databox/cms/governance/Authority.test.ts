import { evaluateAuthority } from '../../../../../src/databox/cms/governance/Authority';

describe('evaluateAuthority', (): void => {
  it('permits an action a held role is granted, with no limit.', (): void => {
    const decision = evaluateAuthority(
      [{ role: 'director', action: 'payment.capture' }],
      { roles: [ 'director' ], action: 'payment.capture' },
    );
    expect(decision.permitted).toBe(true);
    expect(decision.reason).toContain('director');
  });

  it('denies when no held role grants the action.', (): void => {
    expect(evaluateAuthority(
      [{ role: 'director', action: 'payment.capture' }],
      { roles: [ 'clerk' ], action: 'payment.capture' },
    ).permitted).toBe(false);
    expect(evaluateAuthority(
      [{ role: 'director', action: 'payment.capture' }],
      { roles: [ 'director' ], action: 'config.change' },
    ).permitted).toBe(false);
  });

  it('honours a spending limit: within permits, over denies.', (): void => {
    const grants = [{ role: 'clerk', action: 'payment.capture', maxAmount: 100 }];
    expect(evaluateAuthority(grants, { roles: [ 'clerk' ], action: 'payment.capture', amount: 50 }).permitted)
      .toBe(true);
    const over = evaluateAuthority(grants, { roles: [ 'clerk' ], action: 'payment.capture', amount: 500 });
    expect(over.permitted).toBe(false);
    expect(over.reason).toContain('exceeds');
  });

  it('treats a missing amount as zero against a limited grant.', (): void => {
    expect(evaluateAuthority(
      [{ role: 'clerk', action: 'payment.capture', maxAmount: 100 }],
      { roles: [ 'clerk' ], action: 'payment.capture' },
    ).permitted).toBe(true);
  });

  it('falls through an over-limit grant to an unlimited one for the same action.', (): void => {
    const decision = evaluateAuthority(
      [
        { role: 'clerk', action: 'payment.capture', maxAmount: 100 },
        { role: 'director', action: 'payment.capture' },
      ],
      { roles: [ 'clerk', 'director' ], action: 'payment.capture', amount: 500 },
    );
    expect(decision.permitted).toBe(true);
    expect(decision.reason).toContain('director');
  });
});
