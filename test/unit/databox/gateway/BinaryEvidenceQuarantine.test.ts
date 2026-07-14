import {
  BinaryEvidenceQuarantine,
  FailClosedScanner,
  StubVerdictScanner,
} from '../../../../src/databox/gateway/BinaryEvidenceQuarantine';
import type { EvidenceScanner, ScanVerdict } from '../../../../src/databox/gateway/BinaryEvidenceQuarantine';
import { DATABOX_GATEWAY_CODES } from '../../../../src/databox/gateway/GatewayReasonCodes';
import { sha256Hex } from '../../../../src/databox/credential/Es256';

const bytes = Buffer.from('synthetic-binary-evidence', 'utf8');
const fixedOptions = { idFactory: (): string => 'qid-1', clock: (): string => '2026-07-15T00:00:00Z' };

function isRejection(value: unknown): value is { code: string } {
  return typeof value === 'object' && value !== null && 'code' in value;
}

describe('Evidence scanners (production deferred, ADR-0022 §5)', (): void => {
  it('FailClosedScanner returns unknown so nothing releases.', async(): Promise<void> => {
    await expect(new FailClosedScanner().scan()).resolves.toBe('unknown');
    expect(new FailClosedScanner().id).toBe('databox:scanner:fail-closed-stub');
  });

  it('StubVerdictScanner marks synthetic-malicious bytes, else clean.', async(): Promise<void> => {
    const scanner = new StubVerdictScanner((input): boolean => input.toString('utf8').includes('evil'));
    await expect(scanner.scan(Buffer.from('evil', 'utf8'))).resolves.toBe('malicious');
    await expect(scanner.scan(Buffer.from('safe', 'utf8'))).resolves.toBe('clean');
    expect(scanner.id).toBe('databox:scanner:stub-verdict');
  });
});

describe('BinaryEvidenceQuarantine (state machine, ADR-0022 §2)', (): void => {
  it('accepts bytes into the non-servable quarantined state, digesting the exact bytes.', (): void => {
    const q = new BinaryEvidenceQuarantine(new FailClosedScanner(), fixedOptions);
    const record = q.accept(bytes, 'application/octet-stream');
    expect(record).toEqual({
      id: 'qid-1',
      digest: sha256Hex(bytes),
      mediaType: 'application/octet-stream',
      byteLength: bytes.length,
      state: 'quarantined',
      updatedAt: '2026-07-15T00:00:00Z',
    });
  });

  it('withholds bytes for a quarantined resource and for an unknown id (never serves unscanned).', (): void => {
    const q = new BinaryEvidenceQuarantine(new FailClosedScanner(), fixedOptions);
    const record = q.accept(bytes, 'application/octet-stream');
    const withheld = q.retrieve(record.id);
    expect(isRejection(withheld) && withheld.code).toBe(DATABOX_GATEWAY_CODES.quarantineWithheld);
    const unknown = q.retrieve('nope');
    expect(isRejection(unknown) && unknown.code).toBe(DATABOX_GATEWAY_CODES.quarantineWithheld);
  });

  it('releases on a clean verdict and only THEN serves the exact bytes.', async(): Promise<void> => {
    const q = new BinaryEvidenceQuarantine(new StubVerdictScanner((): boolean => false), fixedOptions);
    const record = q.accept(bytes, 'application/octet-stream');
    const released = await q.scanAndRelease(record.id);
    expect(released?.state).toBe('released');
    expect(released?.verdict).toBe('clean');
    expect(released?.scanner).toBe('databox:scanner:stub-verdict');
    expect(q.retrieve(record.id)).toEqual(bytes);
  });

  it('rejects on a malicious verdict and keeps withholding the bytes.', async(): Promise<void> => {
    const q = new BinaryEvidenceQuarantine(new StubVerdictScanner((): boolean => true), fixedOptions);
    const record = q.accept(bytes, 'application/octet-stream');
    const rejected = await q.scanAndRelease(record.id);
    expect(rejected?.state).toBe('rejected');
    const withheld = q.retrieve(record.id);
    expect(isRejection(withheld) && withheld.code).toBe(DATABOX_GATEWAY_CODES.quarantineWithheld);
  });

  it('fails closed on an error/unknown verdict — stays quarantined, never released.', async(): Promise<void> => {
    const errorScanner: EvidenceScanner = { id: 'err', scan: async(): Promise<ScanVerdict> => 'error' };
    const q = new BinaryEvidenceQuarantine(errorScanner, fixedOptions);
    const record = q.accept(bytes, 'application/octet-stream');
    const scanned = await q.scanAndRelease(record.id);
    expect(scanned?.state).toBe('quarantined');
    // The FailClosedScanner 'unknown' verdict lands on the same fail-closed branch.
    const q2 = new BinaryEvidenceQuarantine(new FailClosedScanner(), fixedOptions);
    const r2 = q2.accept(bytes, 'application/octet-stream');
    const state2 = (await q2.scanAndRelease(r2.id))?.state;
    expect(state2).toBe('quarantined');
  });

  it('scanAndRelease is a no-op once released or rejected (idempotent), and undefined for unknown id.', async():
  Promise<void> => {
    const clean = new BinaryEvidenceQuarantine(new StubVerdictScanner((): boolean => false), fixedOptions);
    const cid = clean.accept(bytes, 'application/octet-stream').id;
    await clean.scanAndRelease(cid);
    const cleanReplay = (await clean.scanAndRelease(cid))?.state;
    expect(cleanReplay).toBe('released');

    const bad = new BinaryEvidenceQuarantine(new StubVerdictScanner((): boolean => true), fixedOptions);
    const bid = bad.accept(bytes, 'application/octet-stream').id;
    await bad.scanAndRelease(bid);
    const badReplay = (await bad.scanAndRelease(bid))?.state;
    expect(badReplay).toBe('rejected');

    const unknown = await clean.scanAndRelease('unknown');
    expect(unknown).toBeUndefined();
  });

  it('inspect returns the byte-free record or undefined.', (): void => {
    const q = new BinaryEvidenceQuarantine(new FailClosedScanner(), fixedOptions);
    const record = q.accept(bytes, 'application/octet-stream');
    expect(q.inspect(record.id)?.id).toBe('qid-1');
    expect(q.inspect('nope')).toBeUndefined();
  });

  it('uses CSPRNG id + clock defaults when no options are given.', (): void => {
    const q = new BinaryEvidenceQuarantine(new FailClosedScanner());
    const record = q.accept(bytes, 'application/octet-stream');
    expect(record.id).toMatch(/^[0-9a-f]{32}$/u);
    expect(Number.isNaN(Date.parse(record.updatedAt))).toBe(false);
  });
});
