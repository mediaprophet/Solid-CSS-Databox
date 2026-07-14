import { randomBytes } from 'node:crypto';
import { sha256Hex } from '../credential/Es256';
import { DATABOX_GATEWAY_CODES, gatewayRejection } from './GatewayReasonCodes';
import type { GatewayRejection } from './GatewayReasonCodes';

/**
 * Bounded binary-evidence handler + quarantine state machine (component C6/C7; ADR-0022; DBX-15;
 * DBX-03 T-22). Binary deposits (a scan, a photo, a recording) are NOT parsed as RDF; they flow through
 * an explicit, evidence-emitting state machine and **unscanned or unreleased bytes are NEVER served as an
 * accepted resource** (ADR-0022 §2 invariant).
 *
 * States (ADR-0022 §2): `quarantined` → `scanning` → `released` | `rejected`.
 * - **quarantined:** bytes are durably captured in a namespace that is NOT servable.
 * - **scanning:** the bytes are handed to the scan step.
 * - **released:** a CLEAN verdict transitions the resource to servable; only now do the bytes retrieve.
 * - **rejected:** a MALICIOUS verdict withholds the bytes permanently (retained/tombstoned per policy).
 *
 * **Fail closed (ADR-0022 §Failure behavior):** an `error`/`unknown`/unavailable scanner verdict leaves
 * the resource `quarantined` — never released, never served. Production scanning is DEFERRED (ADR-0022
 * §5): the default {@link FailClosedScanner} returns `unknown`, so nothing releases until a real scanner
 * (or an explicit synthetic-clean stub) is wired in. This is a labelled stub, not production scanning.
 */

/** The quarantine lifecycle states (ADR-0022 §2). */
export type QuarantineState = 'quarantined' | 'scanning' | 'released' | 'rejected';

/** A scan verdict. Only `clean` releases; `malicious` rejects; `error`/`unknown` fail closed. */
export type ScanVerdict = 'clean' | 'malicious' | 'error' | 'unknown';

/**
 * The scan step (ADR-0022 §5, deferred in production). An implementation MUST fail closed: any doubt
 * returns `error`/`unknown` (which keeps the resource quarantined), never `clean`.
 */
export interface EvidenceScanner {
  /** A stable scanner identity/version, recorded on the evidence transition. */
  readonly id: string;
  /** Scan the exact bytes and return a verdict. Never throws for a normal verdict; fail closed on doubt. */
  scan: (bytes: Buffer) => Promise<ScanVerdict>;
}

/**
 * The production-deferred default scanner (ADR-0022 §5). It performs no scanning and returns `unknown`,
 * so a deposit stays quarantined and its bytes are never served until a real scanner is configured. It is
 * unmistakably a stub — it must not be represented as production scanning.
 */
export class FailClosedScanner implements EvidenceScanner {
  public readonly id = 'databox:scanner:fail-closed-stub';

  public async scan(): Promise<ScanVerdict> {
    return 'unknown';
  }
}

/**
 * A deterministic verdict scanner for fixtures/tests (ADR-0022 §5): a supplied predicate marks the
 * synthetic-malicious bytes; everything else is synthetic-clean. This exercises the release AND reject
 * paths without any production scanner. It is a labelled stub.
 */
export class StubVerdictScanner implements EvidenceScanner {
  public readonly id = 'databox:scanner:stub-verdict';
  private readonly isMalicious: (bytes: Buffer) => boolean;

  public constructor(isMalicious: (bytes: Buffer) => boolean) {
    this.isMalicious = isMalicious;
  }

  public async scan(bytes: Buffer): Promise<ScanVerdict> {
    return this.isMalicious(bytes) ? 'malicious' : 'clean';
  }
}

/** A public (byte-free) view of a quarantine record — safe to place in an evidence event or receipt. */
export interface QuarantineRecord {
  /** Opaque quarantine identifier. */
  readonly id: string;
  /** SHA-256 (hex) of the exact quarantined bytes. */
  readonly digest: string;
  /** The declared media type of the binary evidence. */
  readonly mediaType: string;
  /** Byte length of the quarantined payload. */
  readonly byteLength: number;
  /** Current lifecycle state. */
  readonly state: QuarantineState;
  /** The scan verdict, once scanning has run. */
  readonly verdict?: ScanVerdict;
  /** The scanner identity/version that produced {@link verdict}. */
  readonly scanner?: string;
  /** ISO-8601 time of the last transition. */
  readonly updatedAt: string;
}

/** Injectable seams for {@link BinaryEvidenceQuarantine}; defaulted to CSPRNG/clock primitives. */
export interface QuarantineOptions {
  /** Mints the opaque quarantine id (default: 128-bit `randomBytes` hex). */
  readonly idFactory?: () => string;
  /** Supplies the transition timestamp (default: `Date.now` as ISO-8601). */
  readonly clock?: () => string;
}

const QUARANTINE_ID_BYTES = 16;

/** Internal store entry: the public record plus the withheld bytes (never exposed until released). */
interface QuarantineEntry {
  record: QuarantineRecord;
  readonly bytes: Buffer;
}

/**
 * The quarantine namespace + state machine. Bytes live only inside this handler and are returned by
 * {@link retrieve} ONLY when the record is `released`.
 */
export class BinaryEvidenceQuarantine {
  private readonly scanner: EvidenceScanner;
  private readonly idFactory: () => string;
  private readonly clock: () => string;
  private readonly entries = new Map<string, QuarantineEntry>();

  public constructor(scanner: EvidenceScanner, options: QuarantineOptions = {}) {
    this.scanner = scanner;
    this.idFactory = options.idFactory ?? ((): string => randomBytes(QUARANTINE_ID_BYTES).toString('hex'));
    this.clock = options.clock ?? ((): string => new Date().toISOString());
  }

  /**
   * Accept binary evidence INTO quarantine (state `quarantined`). The bytes are captured exactly (a digest
   * is computed, never a re-encode) and are NOT servable. Size/media-type bounds are the gateway's job
   * (they run before this); this is the durable capture + state-machine entry.
   */
  public accept(bytes: Buffer, mediaType: string): QuarantineRecord {
    const record: QuarantineRecord = {
      id: this.idFactory(),
      digest: sha256Hex(bytes),
      mediaType,
      byteLength: bytes.length,
      state: 'quarantined',
      updatedAt: this.clock(),
    };
    this.entries.set(record.id, { record, bytes });
    return record;
  }

  /**
   * Run the scan step and transition (ADR-0022 §2). `quarantined` → `scanning` → `released` (clean) /
   * `rejected` (malicious) / stays `quarantined` (error/unknown — fail closed). Re-scanning a resource
   * that is already `released`/`rejected` is a no-op returning its current record (idempotent). An unknown
   * id yields `undefined` (no existence leak).
   */
  public async scanAndRelease(id: string): Promise<QuarantineRecord | undefined> {
    const entry = this.entries.get(id);
    if (!entry) {
      return undefined;
    }
    if (entry.record.state === 'released' || entry.record.state === 'rejected') {
      return entry.record;
    }
    entry.record = { ...entry.record, state: 'scanning', updatedAt: this.clock() };
    const verdict = await this.scanner.scan(entry.bytes);
    const nextState = verdictToState(verdict);
    entry.record = {
      ...entry.record,
      state: nextState,
      verdict,
      scanner: this.scanner.id,
      updatedAt: this.clock(),
    };
    return entry.record;
  }

  /**
   * Retrieve the bytes of a quarantined resource. Returns the exact bytes ONLY when the record is
   * `released`; for any other state (or an unknown id) it returns a non-leaking `quarantineWithheld`
   * rejection and NEVER the bytes (ADR-0022 §2 invariant; §Failure "retrieval of a non-released resource
   * returns state/denial, never the bytes").
   */
  public retrieve(id: string): Buffer | GatewayRejection {
    const entry = this.entries.get(id);
    if (!entry || entry.record.state !== 'released') {
      return gatewayRejection(
        DATABOX_GATEWAY_CODES.quarantineWithheld,
        'Binary evidence is not released from quarantine.',
      );
    }
    return entry.bytes;
  }

  /** The current public (byte-free) record for an id, or `undefined` if unknown. */
  public inspect(id: string): QuarantineRecord | undefined {
    return this.entries.get(id)?.record;
  }
}

/** Map a scan verdict to the resulting quarantine state (fail closed: only `clean` releases). */
function verdictToState(verdict: ScanVerdict): QuarantineState {
  if (verdict === 'clean') {
    return 'released';
  }
  if (verdict === 'malicious') {
    return 'rejected';
  }
  // `error` / `unknown` / anything unrecognised fails closed: stays quarantined, never served.
  return 'quarantined';
}
