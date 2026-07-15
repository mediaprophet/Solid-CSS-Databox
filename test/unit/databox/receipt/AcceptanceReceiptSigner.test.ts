import type {
  AcceptanceReceiptRequest,
  IssuedReceipt,
} from '../../../../src/databox/receipt/AcceptanceReceiptSigner';
import {
  AcceptanceReceiptSigner,
  AcceptanceReceiptVerifier,
  ReceiptRegistry,
} from '../../../../src/databox/receipt/AcceptanceReceiptSigner';
import { BadRequestHttpError } from '../../../../src/util/errors/BadRequestHttpError';
import {
  ACCEPTED_PAYLOAD,
  baseRequest,
  ISSUER,
  KID,
  signerKey,
  trustStore,
  validCommit,
} from './ReceiptTestSupport';

function signer(registry?: ReceiptRegistry): AcceptanceReceiptSigner {
  return new AcceptanceReceiptSigner(ISSUER, signerKey.privateKey, KID, registry);
}

const verifier = new AcceptanceReceiptVerifier();

describe('ReceiptRegistry', (): void => {
  it('returns undefined for an unseen idempotency key.', (): void => {
    expect(new ReceiptRegistry().lookup('k1')).toBeUndefined();
  });

  it('stores the first receipt and never overwrites it on a duplicate.', (): void => {
    const registry = new ReceiptRegistry();
    const first = signer().issue(baseRequest({ idempotencyKey: 'k1' })).receipt;
    expect(registry.remember('k1', first)).toBe(first);
    const second = signer().issue(baseRequest({ idempotencyKey: 'k1' })).receipt;
    expect(registry.remember('k1', second)).toBe(first);
  });
});

describe('AcceptanceReceiptSigner', (): void => {
  it('issues a signed acceptance receipt binding every immutable transaction fact.', (): void => {
    const { receipt, duplicate } = signer().issue(baseRequest());
    expect(duplicate).toBe(false);
    const receiptBinding = receipt.credential.credentialSubject.receipt;
    expect(receiptBinding.state).toBe('accepted');
    expect(receiptBinding.commitEventId).toBe('evt-1');
    expect(receiptBinding.canonicalization).toBe('dbx-jcs/1.0.0');
    expect(receiptBinding.activatedDuties).toStrictEqual([ 'issueReceipt', 'signalHolder' ]);
    expect(receipt.jws.split('.')).toHaveLength(3);
  });

  it('the issued receipt verifies against the trusted key (round-trip).', (): void => {
    const { receipt } = signer().issue(baseRequest());
    const result = verifier.verify(receipt.jws, { trustStore: trustStore(), acceptedPayload: ACCEPTED_PAYLOAD });
    expect(result.cryptographicallyValid).toBe(true);
    expect(result.state).toBe('accepted');
    expect(result.binding.transaction).toBe('urn:uuid:txn-1');
  });

  it('never issues a receipt before durable commit (unconfirmed signal fails closed, no receipt).', (): void => {
    const unconfirmed = { ...validCommit(), confirmed: false } as unknown as AcceptanceReceiptRequest['durableCommit'];
    expect((): IssuedReceipt => signer().issue(baseRequest({ durableCommit: unconfirmed }))).toThrow(
      BadRequestHttpError,
    );
  });

  it('models no-receipt-before-commit end to end: no signal → no receipt; after commit → receipt.', (): void => {
    // Before the durable commit exists there is no signal, and issuance cannot proceed.
    const noCommit = baseRequest({ durableCommit: undefined as unknown as AcceptanceReceiptRequest['durableCommit'] });
    expect((): IssuedReceipt => signer().issue(noCommit)).toThrow(BadRequestHttpError);
    // Once the durable commit is confirmed, the same operation issues a receipt.
    const { receipt } = signer().issue(baseRequest());
    expect(receipt.receiptId).toMatch(/^urn:uuid:/u);
  });

  it('refuses to attest a payload digest that differs from the durably-committed digest.', (): void => {
    const mismatched = validCommit({ payloadDigest: `urn:sha256:${'b'.repeat(64)}` });
    expect((): IssuedReceipt => signer().issue(baseRequest({ durableCommit: mismatched }))).toThrow(
      'does not match the durably-committed digest',
    );
  });

  it('a duplicate idempotency key returns the ORIGINAL receipt, not a new one (T-24).', (): void => {
    const registry = new ReceiptRegistry();
    const s = signer(registry);
    const first = s.issue(baseRequest({ idempotencyKey: 'hmac-key-1' }));
    const replay = s.issue(baseRequest({ idempotencyKey: 'hmac-key-1' }));
    expect(replay.duplicate).toBe(true);
    expect(replay.receipt).toBe(first.receipt);
    expect(replay.receipt.jws).toBe(first.receipt.jws);
  });

  it('binds an injected legal-policy reference verbatim (does not interpret law).', (): void => {
    const legalPolicy = {
      compiledPolicyDigest: `urn:sha256:${'c'.repeat(64)}`,
      corpusManifestDigest: `urn:sha256:${'d'.repeat(64)}`,
      attestationId: 'attestation-99',
      evaluatorVersion: 'evaluator-2.1.0',
    };
    const { receipt } = signer().issue(baseRequest({ legalPolicy, subjectId: 'urn:uuid:subject-1' }));
    expect(receipt.credential.credentialSubject.receipt.legal).toStrictEqual(legalPolicy);
    expect(receipt.credential.credentialSubject.id).toBe('urn:uuid:subject-1');
  });

  it('defaults acceptedAt to the durable-commit time and honours an explicit override.', (): void => {
    const def = signer().issue(baseRequest());
    expect(def.receipt.credential.credentialSubject.receipt.acceptedAt).toBe(validCommit().committedAt);
    const at = '2026-07-14T05:00:00.000Z';
    const over = signer().issue(baseRequest({ acceptedAt: at }));
    expect(over.receipt.credential.validFrom).toBe(at);
  });

  it('rejects an invalid operation type.', (): void => {
    expect((): IssuedReceipt =>
      signer().issue(baseRequest({ operation: 'delete' as unknown as AcceptanceReceiptRequest['operation'] })))
      .toThrow('deposit or submission');
  });

  it('rejects an unparseable acceptedAt override.', (): void => {
    expect((): IssuedReceipt => signer().issue(baseRequest({ acceptedAt: 'not-a-date' }))).toThrow(
      'parseable ISO-8601',
    );
  });

  it('rejects activatedDuties that is not an array.', (): void => {
    expect((): IssuedReceipt =>
      signer().issue(baseRequest({ activatedDuties: 'x' as unknown as string[] }))).toThrow('array of non-empty');
  });

  it('rejects activatedDuties containing an empty entry.', (): void => {
    expect((): IssuedReceipt => signer().issue(baseRequest({ activatedDuties: [ '' ]}))).toThrow('array of non-empty');
  });

  it('rejects an empty required field (transaction).', (): void => {
    expect((): IssuedReceipt => signer().issue(baseRequest({ transaction: '' }))).toThrow(
      'must be a non-empty string',
    );
  });

  it('rejects a non-string required field (sender).', (): void => {
    expect((): IssuedReceipt =>
      signer().issue(baseRequest({ sender: 42 as unknown as string }))).toThrow('must be a non-empty string');
  });

  it('rejects a malformed policy digest.', (): void => {
    expect((): IssuedReceipt => signer().issue(baseRequest({ policyDigest: 'not-a-digest' }))).toThrow(
      'urn:sha256:<64 hex>',
    );
  });

  it('rejects a non-string policy digest.', (): void => {
    expect((): IssuedReceipt =>
      signer().issue(baseRequest({ policyDigest: 9 as unknown as string }))).toThrow('urn:sha256:<64 hex>');
  });

  it('rejects an incomplete injected legal binding (review #18).', (): void => {
    const legalPolicy = {
      compiledPolicyDigest: `urn:sha256:${'c'.repeat(64)}`,
      corpusManifestDigest: `urn:sha256:${'d'.repeat(64)}`,
      attestationId: '',
      evaluatorVersion: 'evaluator-2.1.0',
    };
    expect((): IssuedReceipt => signer().issue(baseRequest({ legalPolicy }))).toThrow('legal.attestationId');
  });

  it('rejects an empty issuer configured on the signer.', (): void => {
    const s = new AcceptanceReceiptSigner('', signerKey.privateKey, KID);
    expect((): IssuedReceipt => s.issue(baseRequest())).toThrow('\'issuer\'');
  });

  it('omits the idempotency key from the receipt when none is supplied.', (): void => {
    const { receipt } = signer().issue(baseRequest());
    expect(receipt.idempotencyKey).toBeUndefined();
    expect(receipt.credential.credentialSubject.receipt.idempotencyKey).toBeUndefined();
  });
});
