import { BadRequestHttpError } from '../../../../src/util/errors/BadRequestHttpError';
import { signCompactJws } from '../../../../src/databox/credential/Es256';
import type { DispositionDecision, DispositionOutcomeKind } from '../../../../src/databox/review/ReviewTypes';
import { buildSignedDisposition, verifyDisposition } from '../../../../src/databox/review/SignedDisposition';
import { generateEs256KeyPair, KID, makeEvent, signerKey } from './ReviewTestSupport';

const CASE_ID = 'review-case:submission-abc';

function signingInput(dispositionId = 'disp-1'): Parameters<typeof buildSignedDisposition>[3] {
  return {
    dispositionId,
    reviewerId: 'reviewer-1',
    decidedAt: '2026-07-15T12:00:00.000Z',
    signingKey: signerKey.privateKey,
    verificationMethod: KID,
  };
}

function decision(overrides: Partial<DispositionDecision> = {}): DispositionDecision {
  return {
    caseId: CASE_ID,
    outcomeKind: 'no-change',
    reasonCode: 'insufficient-evidence',
    appealRoute: 'appeal:body-1',
    ...overrides,
  };
}

describe('buildSignedDisposition — validation', (): void => {
  it('fails closed when the decision caseId does not match the case.', (): void => {
    expect((): unknown => buildSignedDisposition(makeEvent(), 'other-case', decision(), signingInput()))
      .toThrow(BadRequestHttpError);
  });

  it('fails closed on a malformed committed payload digest.', (): void => {
    expect((): unknown =>
      buildSignedDisposition(makeEvent({ payloadDigest: 'not-a-digest' }), CASE_ID, decision(), signingInput()))
      .toThrow('urn:sha256');
  });

  it('fails closed on a blank dispositionId.', (): void => {
    expect((): unknown => buildSignedDisposition(makeEvent(), CASE_ID, decision(), signingInput('')))
      .toThrow('dispositionId');
  });

  it('fails closed on a blank reasonCode.', (): void => {
    expect((): unknown => buildSignedDisposition(makeEvent(), CASE_ID, decision({ reasonCode: '' }), signingInput()))
      .toThrow('reasonCode');
  });

  it('sanitizes an unsafe reason code into a non-injectable token.', (): void => {
    const dirty = decision({ reasonCode: 'evil reason/with spaces' });
    const signed = buildSignedDisposition(makeEvent(), CASE_ID, dirty, signingInput());
    expect(signed.envelope.reasonCode).toMatch(/^[\w.:-]+$/u);
    expect(signed.envelope.reasonCode).not.toContain(' ');
  });

  it('fails closed on an unknown outcome kind.', (): void => {
    const bad = decision({ outcomeKind: 'bogus' as unknown as DispositionOutcomeKind });
    expect((): unknown => buildSignedDisposition(makeEvent(), CASE_ID, bad, signingInput()))
      .toThrow('Unknown disposition');
  });
});

describe('buildSignedDisposition — outcome references', (): void => {
  const kinds: [ DispositionOutcomeKind, Partial<DispositionDecision>, keyof DispositionDecision ][] = [
    [ 'corrected', { supersedingRecordRef: 'record:v2' }, 'supersedingRecordRef' ],
    [ 'partially-corrected', { supersedingRecordRef: 'record:v2' }, 'supersedingRecordRef' ],
    [ 'statement-associated', { associatedStatementRef: 'stmt:1' }, 'associatedStatementRef' ],
    [ 'redirected', { redirectTarget: 'redirect:agency' }, 'redirectTarget' ],
    [ 'no-change', { appealRoute: 'appeal:body-1' }, 'appealRoute' ],
    [ 'more-information-required', { deadlineEffect: 'paused' }, 'deadlineEffect' ],
  ];

  it.each(kinds)('accepts %s with its required reference and preserves submitter + digest.', (kind, extra): void => {
    const event = makeEvent();
    const signed = buildSignedDisposition(event, CASE_ID, decision({ outcomeKind: kind, ...extra }), signingInput());
    expect(signed.envelope.outcomeKind).toBe(kind);
    expect(signed.envelope.submitter).toStrictEqual(event.submitter);
    expect(signed.envelope.payloadDigest).toBe(event.payloadDigest);
    expect(signed.envelope.links.submissionRef).toBe(event.submissionRef);
    expect(signed.envelopeDigest).toMatch(/^urn:sha256:[0-9a-f]{64}$/u);
  });

  it.each(kinds)('fails closed when %s is missing its required reference.', (kind, _extra, field): void => {
    const bare = decision({
      outcomeKind: kind,
      supersedingRecordRef: undefined,
      associatedStatementRef: undefined,
      redirectTarget: undefined,
      appealRoute: undefined,
      deadlineEffect: undefined,
    });
    expect((): unknown => buildSignedDisposition(makeEvent(), CASE_ID, bare, signingInput())).toThrow(field);
  });

  it('binds the superseding record into the links for a corrected outcome.', (): void => {
    const corrected = decision({ outcomeKind: 'corrected', supersedingRecordRef: 'record:v2' });
    const signed = buildSignedDisposition(makeEvent(), CASE_ID, corrected, signingInput());
    expect(signed.envelope.links.supersedes).toBe('record:v2');
  });
});

describe('verifyDisposition', (): void => {
  it('verifies a well-formed signed disposition and returns the envelope.', (): void => {
    const signed = buildSignedDisposition(makeEvent(), CASE_ID, decision(), signingInput());
    expect(verifyDisposition(signed, signerKey.publicKey).dispositionId).toBe('disp-1');
  });

  it('fails closed on an unexpected JWS typ.', (): void => {
    const signed = buildSignedDisposition(makeEvent(), CASE_ID, decision(), signingInput());
    const wrongTyp = signCompactJws(
      { alg: 'ES256', typ: 'other+jws', kid: KID },
      signed.envelope as unknown as Record<string, unknown>,
      signerKey.privateKey,
    );
    expect((): unknown => verifyDisposition({ ...signed, jws: wrongTyp }, signerKey.publicKey)).toThrow('typ');
  });

  it('fails closed on a signature that does not verify (wrong key).', (): void => {
    const signed = buildSignedDisposition(makeEvent(), CASE_ID, decision(), signingInput());
    expect((): unknown => verifyDisposition(signed, generateEs256KeyPair().publicKey)).toThrow(BadRequestHttpError);
  });

  it('fails closed when the bound envelope digest does not match the signed payload (tampered).', (): void => {
    const signed = buildSignedDisposition(makeEvent(), CASE_ID, decision(), signingInput());
    const tampered = { ...signed, envelopeDigest: `urn:sha256:${'b'.repeat(64)}` };
    expect((): unknown => verifyDisposition(tampered, signerKey.publicKey)).toThrow('tampered');
  });
});
