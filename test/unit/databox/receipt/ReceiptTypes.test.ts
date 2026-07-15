import {
  DATABOX_RECEIPT_CREDENTIAL_TYPE,
  PINNED_CANONICALIZATION_ALG,
  RECEIPT_OPERATIONS,
  RECEIPT_STATES,
  receiptStateOrdinal,
  RECORD_PROOF_ALG,
  RECORD_PROOF_JWS_TYP,
  RECORD_PROOF_MEDIA_TYPE,
} from '../../../../src/databox/receipt/ReceiptTypes';

describe('ReceiptTypes', (): void => {
  it('defines the six monotonic receipt states in order.', (): void => {
    expect(RECEIPT_STATES).toStrictEqual(
      [ 'accepted', 'notified', 'retrieved', 'acknowledged', 'reviewed', 'disposed' ],
    );
  });

  it('exposes the two operation types.', (): void => {
    expect(RECEIPT_OPERATIONS).toStrictEqual([ 'deposit', 'submission' ]);
  });

  it('reuses the pinned DBX-16 proof-suite constants verbatim (single source of truth).', (): void => {
    expect(RECORD_PROOF_ALG).toBe('ES256');
    expect(RECORD_PROOF_JWS_TYP).toBe('vc+jwt');
    expect(RECORD_PROOF_MEDIA_TYPE).toBe('application/vc+jwt');
    expect(PINNED_CANONICALIZATION_ALG).toBe('dbx-jcs/1.0.0');
    expect(DATABOX_RECEIPT_CREDENTIAL_TYPE).toBe('DataboxAcceptanceReceipt');
  });

  it('returns a strictly increasing ordinal per state, accepted lowest and disposed highest.', (): void => {
    expect(receiptStateOrdinal('accepted')).toBe(0);
    expect(receiptStateOrdinal('notified')).toBe(1);
    expect(receiptStateOrdinal('disposed')).toBe(5);
    expect(receiptStateOrdinal('accepted')).toBeLessThan(receiptStateOrdinal('disposed'));
  });
});
