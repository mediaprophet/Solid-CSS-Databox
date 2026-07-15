import type { CommittedEvent } from '../../../../src/databox/feed/CursorFeed';
import { toInertRecord } from '../../../../src/databox/agent/InertRecord';
import { LocalKnowledgeStore } from '../../../../src/databox/agent/LocalKnowledgeStore';
import type { StoredRecord } from '../../../../src/databox/agent/LocalKnowledgeStore';
import type { RecordVerification } from '../../../../src/databox/proof/RecordProofValidator';
import type { ReceiptVerification } from '../../../../src/databox/receipt/AcceptanceReceiptVerifier';

function verification(recordDigest: string): RecordVerification {
  return {
    cryptographicallyValid: true,
    humanAttested: false,
    requiresHumanAttestation: false,
    issuer: 'https://org.example/id#issuer',
    verificationMethod: 'https://org.example/id#key-1',
    recordDigest,
    payloadDigest: `urn:sha256:${'a'.repeat(64)}`,
    claim: { author: 'a', method: 'institutional-record', verificationStatus: 'verified' },
    caveat: 'c',
  };
}

const receiptVerification = { cryptographicallyValid: true } as unknown as ReceiptVerification;

function storedRecord(connectionId: string, recordDigest: string, payload: Buffer | string): StoredRecord {
  return {
    inert: toInertRecord(connectionId, verification(recordDigest), payload, 'authenticated-pull', '2026-07-15T00:00Z'),
    recordJws: 'r',
    receiptJws: 'rcpt',
    recordVerification: verification(recordDigest),
    receiptVerification,
  };
}

const event: CommittedEvent = { cursor: 'c1', eventId: 'e1', tenantId: 't', resourceRef: 'ref', activity: 'Create' };

describe('LocalKnowledgeStore', (): void => {
  it('fails closed on an empty connection id.', (): void => {
    expect((): unknown => new LocalKnowledgeStore('')).toThrow('non-empty connection id');
  });

  it('stores a record and is idempotent on the record digest (a re-pull adds no second copy).', (): void => {
    const store = new LocalKnowledgeStore('conn-a');
    const first = store.storeRecord(storedRecord('conn-a', 'urn:sha256:d1', 'bytes'));
    const again = store.storeRecord(storedRecord('conn-a', 'urn:sha256:d1', 'bytes'));
    expect(again).toBe(first);
    expect(store.listRecords()).toHaveLength(1);
  });

  it('refuses to store a record from another connection (isolation, T-03).', (): void => {
    const store = new LocalKnowledgeStore('conn-a');
    expect((): unknown => store.storeRecord(storedRecord('conn-b', 'urn:sha256:d2', 'bytes')))
      .toThrow('another connection');
  });

  it('copies a Buffer payload defensively (inert copy).', (): void => {
    const store = new LocalKnowledgeStore('conn-a');
    const bytes = Buffer.from('hello');
    const stored = store.storeRecord(storedRecord('conn-a', 'urn:sha256:d3', bytes));
    expect(stored.inert.payload).toEqual(bytes);
    expect(stored.inert.payload).not.toBe(bytes);
  });

  it('records a recovered event exactly once and lists it.', (): void => {
    const store = new LocalKnowledgeStore('conn-a');
    expect(store.recordRecoveredEvent(event)).toBe(true);
    expect(store.recordRecoveredEvent(event)).toBe(false);
    expect(store.listRecoveredEvents()).toEqual([ event ]);
  });

  it('deep-copies + freezes the inert claim so source mutation cannot leak in (L2).', (): void => {
    const claim = { author: 'a', method: 'institutional-record' as const, verificationStatus: 'verified' as const };
    const source = { ...verification('urn:sha256:d5'), claim };
    const inert = toInertRecord('conn-a', source, 'bytes', 'authenticated-pull', 'z');
    // Mutating the source claim does not alter the retained inert copy.
    claim.author = 'HACKED';
    expect(inert.claim.author).toBe('a');
    // The inert claim is frozen (a handed-out reference cannot be widened).
    expect((): unknown => (inert.claim as { author: string }).author = 'x').toThrow(TypeError);
  });

  it('stores + lists receipts and exports an evidence bundle.', (): void => {
    const store = new LocalKnowledgeStore('conn-a');
    store.storeRecord(storedRecord('conn-a', 'urn:sha256:d4', 'bytes'));
    store.storeReceipt({ receiptJws: 'sub-rcpt', verification: receiptVerification, provenance: 'submission' });
    expect(store.listReceipts()).toHaveLength(1);
    const bundle = store.exportEvidence();
    expect(bundle.connectionId).toBe('conn-a');
    expect(bundle.records).toEqual([{ recordJws: 'r', receiptJws: 'rcpt', payload: 'bytes' }]);
    expect(bundle.receipts).toEqual([ 'sub-rcpt' ]);
  });
});
