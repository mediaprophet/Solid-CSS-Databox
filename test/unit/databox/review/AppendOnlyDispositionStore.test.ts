import { ConflictHttpError } from '../../../../src/util/errors/ConflictHttpError';
import { AppendOnlyDispositionStore } from '../../../../src/databox/review/AppendOnlyDispositionStore';
import type { SignedDisposition } from '../../../../src/databox/review/ReviewTypes';
import { buildSignedDisposition } from '../../../../src/databox/review/SignedDisposition';
import { KID, makeEvent, signerKey } from './ReviewTestSupport';

function signed(dispositionId: string, submissionRef = 'submission-abc'): SignedDisposition {
  return buildSignedDisposition(
    makeEvent({ submissionRef }),
    `review-case:${submissionRef}`,
    { caseId: `review-case:${submissionRef}`, outcomeKind: 'no-change', reasonCode: 'r', appealRoute: 'appeal:1' },
    {
      dispositionId,
      reviewerId: 'reviewer-1',
      decidedAt: '2026-07-15T12:00:00.000Z',
      signingKey: signerKey.privateKey,
      verificationMethod: KID,
    },
  );
}

describe('AppendOnlyDispositionStore', (): void => {
  it('appends a signed disposition linked to its submission.', (): void => {
    const store = new AppendOnlyDispositionStore();
    const disposition = signed('disp-1');
    expect(store.append(disposition)).toBe(disposition);
    expect(store.has('disp-1')).toBe(true);
    expect(store.get('disp-1')).toBe(disposition);
    expect(store.get('missing')).toBeUndefined();
    expect(store.has('missing')).toBe(false);
  });

  it('refuses to overwrite an existing disposition id (append-only, 409).', (): void => {
    const store = new AppendOnlyDispositionStore();
    store.append(signed('disp-1'));
    expect((): unknown => store.append(signed('disp-1'))).toThrow(ConflictHttpError);
  });

  it('keeps multiple dispositions for one submission in append order.', (): void => {
    const store = new AppendOnlyDispositionStore();
    store.append(signed('disp-1'));
    store.append(signed('disp-2'));
    const forSub = store.forSubmission('submission-abc');
    expect(forSub.map((d): string => d.envelope.dispositionId)).toStrictEqual([ 'disp-1', 'disp-2' ]);
    expect(store.forSubmission('unknown')).toStrictEqual([]);
    expect(store.all()).toHaveLength(2);
  });
});
