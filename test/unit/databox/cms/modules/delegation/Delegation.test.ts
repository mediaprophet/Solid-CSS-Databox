import { buildDelegation, isDelegationValid } from '../../../../../../src/databox/cms/modules/delegation/Delegation';
import type { DelegationInput } from '../../../../../../src/databox/cms/modules/delegation/Delegation';

const base: DelegationInput = {
  id: 'https://example.org/delegations/grant-1',
  principal: 'https://example.org/people/timothy',
  delegate: 'https://example.org/people/assistant',
  scope: [ 'https://example.org/actions/pay-invoice' ],
  expires: '2026-08-01T00:00:00Z',
};

function record(value: unknown): Record<string, unknown> {
  return value as Record<string, unknown>;
}

describe('buildDelegation', (): void => {
  it('builds a scoped DelegateAction with agent, participant, and actionOption.', (): void => {
    const grant = buildDelegation(base);
    expect(grant['@context']).toBe('https://schema.org/');
    expect(grant['@id']).toBe('https://example.org/delegations/grant-1');
    expect(grant['@type']).toBe('DelegateAction');
    expect(record(grant.agent)['@id']).toBe('https://example.org/people/timothy');
    expect(record(grant.participant)['@id']).toBe('https://example.org/people/assistant');
    expect(grant.actionOption).toEqual([ 'https://example.org/actions/pay-invoice' ]);
    expect(grant.expires).toBe('2026-08-01T00:00:00Z');
  });

  it('rejects a non-URI id.', (): void => {
    expect((): unknown => buildDelegation({ ...base, id: 'not-a-uri' }))
      .toThrow('id must be an absolute URI');
  });

  it('rejects a non-URI principal.', (): void => {
    expect((): unknown => buildDelegation({ ...base, principal: 'not-a-uri' }))
      .toThrow('principal must be an absolute URI');
  });

  it('rejects a non-URI delegate.', (): void => {
    expect((): unknown => buildDelegation({ ...base, delegate: 'not-a-uri' }))
      .toThrow('delegate must be an absolute URI');
  });

  it('rejects an empty scope.', (): void => {
    expect((): unknown => buildDelegation({ ...base, scope: []}))
      .toThrow('at least one scope entry');
  });

  it('rejects an empty expires.', (): void => {
    expect((): unknown => buildDelegation({ ...base, expires: '  ' }))
      .toThrow('expires timestamp');
  });
});

describe('isDelegationValid', (): void => {
  it('is true when the action is in scope and asOfIso is before expiry.', (): void => {
    expect(isDelegationValid(base, 'https://example.org/actions/pay-invoice', '2026-07-19T00:00:00Z'))
      .toBe(true);
  });

  it('is false when the action is not in scope.', (): void => {
    expect(isDelegationValid(base, 'https://example.org/actions/delete-account', '2026-07-19T00:00:00Z'))
      .toBe(false);
  });

  it('is false when asOfIso is after expiry.', (): void => {
    expect(isDelegationValid(base, 'https://example.org/actions/pay-invoice', '2026-09-01T00:00:00Z'))
      .toBe(false);
  });
});
