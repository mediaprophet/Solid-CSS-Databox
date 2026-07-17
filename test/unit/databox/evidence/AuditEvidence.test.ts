import type { AuditRecordInput, PolicyEvaluation } from '../../../../src/databox/evidence/AuditEvidence';
import {
  assertNonEmpty,
  bindActorFromContext,
  buildAuditRecord,
} from '../../../../src/databox/evidence/AuditEvidence';
import {
  allowInput,
  DELEGATED_CONTEXT,
  DIGEST_A,
  FULL_CONTEXT,
  MINIMAL_CONTEXT,
  POLICY,
  RECEIPT_DIGEST,
} from './EvidenceTestSupport';

describe('assertNonEmpty', (): void => {
  it('returns a valid non-empty string.', (): void => {
    expect(assertNonEmpty('x', 'f')).toBe('x');
  });

  it('rejects a non-string and an empty string.', (): void => {
    expect((): string => assertNonEmpty(42, 'f')).toThrow(`Evidence field 'f'`);
    expect((): string => assertNonEmpty('', 'f')).toThrow(`Evidence field 'f'`);
  });
});

describe('bindActorFromContext', (): void => {
  it('binds every field from a full verified context (never from headers).', (): void => {
    expect(bindActorFromContext(FULL_CONTEXT)).toStrictEqual({
      actor: 'https://id.example/guardian#me',
      webId: 'https://id.example/alice#me',
      representedEntity: 'https://id.example/alice#me',
      delegationGrantRef: 'opaque:grant-1',
      clientId: 'client-1',
      issuer: 'https://issuer.example',
      audience: 'https://databox.example/t1',
      assuranceGrade: 'strong',
      assuranceDimensions: FULL_CONTEXT.assurance!.dimensions,
      crosswalkVersion: 'crosswalk-v1',
      authTime: '2026-07-15T09:00:00.000Z',
    });
  });

  it('fails closed to undefined for every absent field on a minimal context.', (): void => {
    const actor = bindActorFromContext(MINIMAL_CONTEXT);
    expect(actor.actor).toBeUndefined();
    expect(actor.representedEntity).toBeUndefined();
    expect(actor.delegationGrantRef).toBeUndefined();
    expect(actor.assuranceGrade).toBeUndefined();
    expect(actor.authTime).toBeUndefined();
  });

  it('falls through to the WebID, delegation and assurance authTime when the primaries are absent.', (): void => {
    const actor = bindActorFromContext(DELEGATED_CONTEXT);
    expect(actor.actor).toBe('https://id.example/bob#me');
    expect(actor.representedEntity).toBe('https://id.example/ward#me');
    expect(actor.delegationGrantRef).toBe('opaque:grant-2');
    expect(actor.authTime).toBe('2026-07-15T07:00:00.000Z');
  });

  it('returns a frozen actor so a downstream layer cannot mutate a bound claim.', (): void => {
    expect(Object.isFrozen(bindActorFromContext(FULL_CONTEXT))).toBe(true);
  });
});

describe('buildAuditRecord', (): void => {
  it('builds a frozen record binding the actor from the verified context and all valid digests.', (): void => {
    const record = buildAuditRecord(
      allowInput({ priorDigest: DIGEST_A, postDigest: DIGEST_A, receiptDigest: RECEIPT_DIGEST }),
      FULL_CONTEXT,
    );
    expect(record.actor.webId).toBe('https://id.example/alice#me');
    expect(record.policy).toBe(POLICY);
    expect(Object.isFrozen(record)).toBe(true);
  });

  it('accepts an opaque: target reference as well as a urn:sha256 digest.', (): void => {
    expect(buildAuditRecord(allowInput({ targetDigest: 'opaque:box-1.rec-1' }), FULL_CONTEXT).targetDigest)
      .toBe('opaque:box-1.rec-1');
  });

  it('rejects an unknown decision (fail closed).', (): void => {
    expect((): unknown =>
      buildAuditRecord(allowInput({ decision: 'maybe' as AuditRecordInput['decision'] }), FULL_CONTEXT))
      .toThrow('decision must be one of allow/deny/partial');
  });

  it('rejects blank kind / reasonCode / operation.', (): void => {
    expect((): unknown => buildAuditRecord(allowInput({ kind: '' }), FULL_CONTEXT)).toThrow(`'kind'`);
    expect((): unknown => buildAuditRecord(allowInput({ reasonCode: '' }), FULL_CONTEXT)).toThrow(`'reasonCode'`);
    expect((): unknown => buildAuditRecord(allowInput({ operation: '' }), FULL_CONTEXT)).toThrow(`'operation'`);
  });

  it('rejects a target that is a raw path or payload, never a digest/opaque reference (no-leak).', (): void => {
    expect((): unknown => buildAuditRecord(allowInput({ targetDigest: '/boxes/bx/rec-1' }), FULL_CONTEXT))
      .toThrow('never a raw path/payload');
  });

  it('rejects a malformed optional digest.', (): void => {
    expect((): unknown => buildAuditRecord(allowInput({ priorDigest: 'not-a-digest' }), FULL_CONTEXT))
      .toThrow(`'priorDigest'`);
  });

  it('rejects a non-object policy and a policy missing its digest.', (): void => {
    expect((): unknown =>
      buildAuditRecord(allowInput({ policy: null as unknown as PolicyEvaluation }), FULL_CONTEXT))
      .toThrow(`'policy'`);
    expect((): unknown =>
      buildAuditRecord(allowInput({ policy: { ...POLICY, policyDigest: 'x' }}), FULL_CONTEXT))
      .toThrow('policy.policyDigest');
    expect((): unknown =>
      buildAuditRecord(allowInput({ policy: { ...POLICY, policyDigest: 7 as unknown as string }}), FULL_CONTEXT))
      .toThrow('policy.policyDigest');
    expect((): unknown =>
      buildAuditRecord(allowInput({ policy: { ...POLICY, odrlPolicy: '' }}), FULL_CONTEXT))
      .toThrow('policy.odrlPolicy');
    expect((): unknown =>
      buildAuditRecord(allowInput({ policy: { ...POLICY, policyVersion: '' }}), FULL_CONTEXT))
      .toThrow('policy.policyVersion');
  });

  it('records a DENIED request binding actor + policy context but with NO protected content field.', (): void => {
    const denied = buildAuditRecord(
      allowInput({ decision: 'deny', reasonCode: 'assurance-insufficient', targetDigest: 'opaque:box-1' }),
      FULL_CONTEXT,
    );
    expect(denied.decision).toBe('deny');
    // Actor + policy context are retained...
    expect(denied.actor.webId).toBe('https://id.example/alice#me');
    expect(denied.policy.policyVersion).toBe('p1@2026-07-01');
    // ...but nothing that could carry protected content is present.
    expect(Object.keys(denied)).not.toContain('payload');
    expect(Object.keys(denied)).not.toContain('content');
    expect(Object.keys(denied)).not.toContain('body');
  });
});
