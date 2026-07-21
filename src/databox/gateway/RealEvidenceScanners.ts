import { spawn } from 'node:child_process';
import { Socket } from 'node:net';
import type { EvidenceScanner, ScanVerdict } from './BinaryEvidenceQuarantine';

/**
 * A real malware scanner that delegates to a ClamAV daemon over the INSTREAM protocol
 * (ADR-0022 §5). The daemon listens on a Unix socket or TCP port; this client streams
 * the raw bytes to the daemon and interprets the verdict.
 *
 * Connection defaults follow the standard ClamAV installation: Unix socket at
 * `/var/run/clamd/clamd.sock` or TCP `localhost:3310`. Override via constructor options.
 *
 * **Fail-closed behaviour:** any connection error, timeout, or unrecognised response
 * returns `error` — the resource stays quarantined and is never served.
 */
export interface ClamAvScannerOptions {
  /** Unix socket path (mutually exclusive with host/port). */
  readonly socketPath?: string;
  /** TCP host (used when socketPath is not set). */
  readonly host?: string;
  /** TCP port (used with host). */
  readonly port?: number;
  /** Per-scan timeout in milliseconds (default: 30 000). */
  readonly timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 30_000;
const CLAMAV_HOST = 'localhost';
const CLAMAV_PORT = 3310;
const CLAMAV_SOCKET = '/var/run/clamd/clamd.sock';

const INSTREAM_CHUNK_SIZE = 64 * 1024;

export class ClamAvScanner implements EvidenceScanner {
  public readonly id = 'databox:scanner:clamav';

  private readonly socketPath?: string;
  private readonly host: string;
  private readonly port: number;
  private readonly timeoutMs: number;

  public constructor(options: ClamAvScannerOptions = {}) {
    this.socketPath = options.socketPath;
    this.host = options.host ?? CLAMAV_HOST;
    this.port = options.port ?? CLAMAV_PORT;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  public async scan(bytes: Buffer): Promise<ScanVerdict> {
    let socket: Socket;
    try {
      socket = this.connect();
    } catch {
      return 'error';
    }

    return new Promise<ScanVerdict>((resolve): void => {
      const chunks: Buffer[] = [];
      let settled = false;

      const finish = (verdict: ScanVerdict): void => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timer);
        socket.destroy();
        resolve(verdict);
      };

      const timer = setTimeout((): void => {
        finish('error');
      }, this.timeoutMs);

      socket.on('error', (): void => finish('error'));
      socket.on('close', (): void => {
        if (!settled) {
          const response = Buffer.concat(chunks).toString('utf-8').trim();
          finish(parseClamAvResponse(response));
        }
      });
      socket.on('data', (data: Buffer): void => {
        chunks.push(data);
        // Check if we have a complete response (ClamAV responses end with null byte)
        const response = Buffer.concat(chunks).toString('utf-8');
        if (response.includes('\0') || response.includes('\n')) {
          finish(parseClamAvResponse(response.trim()));
        }
      });

      // INSTREAM protocol: send zINSTREAM command, then length-prefixed chunks, then 0-length terminator
      const sendAll = (): void => {
        socket.write('zINSTREAM\0');
        let offset = 0;
        const sendNext = (): void => {
          while (offset < bytes.length) {
            const slice = bytes.subarray(offset, offset + INSTREAM_CHUNK_SIZE);
            const header = Buffer.alloc(4);
            header.writeUInt32BE(slice.length, 0);
            if (!socket.write(Buffer.concat([ header, slice ]))) {
              offset += slice.length;
              socket.once('drain', sendNext);
              return;
            }
            offset += slice.length;
          }
          // Send zero-length terminator
          const terminator = Buffer.alloc(4);
          socket.write(terminator);
        };
        sendNext();
      };

      // Wait for connection before sending
      socket.on('connect', sendAll);
    });
  }

  private connect(): Socket {
    const socket = new Socket();
    if (this.socketPath) {
      socket.connect(this.socketPath);
    } else {
      socket.connect(this.port, this.host);
    }
    return socket;
  }
}

function parseClamAvResponse(response: string): ScanVerdict {
  // ClamAV responses look like: "stream: OK" or "stream: Eicar-Test-Signature FOUND"
  // or "UNKNOWN COMMAND" / "ERROR: ..." on protocol errors
  const lower = response.toLowerCase();
  if (lower.includes('ok')) {
    return 'clean';
  }
  if (lower.includes('found') || lower.includes('infected')) {
    return 'malicious';
  }
  return 'error';
}

/**
 * A real malware scanner that delegates to the VirusTotal v3 API (ADR-0022 §5).
 * Uploads the bytes (or their SHA-256 hash for the cached lookup path) and polls
 * the analysis until completion.
 *
 * **Fail-closed behaviour:** any network error, rate limit, API error, or timeout
 * returns `error` — the resource stays quarantined and is never served.
 *
 * Note: VirusTotal has rate limits (4 requests/minute on the free tier). This scanner
 * is most appropriate for low-volume, high-value evidence deposits.
 */
export interface VirusTotalScannerOptions {
  /** VirusTotal API key (required). */
  readonly apiKey: string;
  /** Per-scan timeout in milliseconds (default: 120 000). */
  readonly timeoutMs?: number;
  /** Polling interval in milliseconds (default: 5 000). */
  readonly pollIntervalMs?: number;
  /** Base URL (default: https://www.virustotal.com/api/v3). */
  readonly baseUrl?: string;
}

const VT_DEFAULT_TIMEOUT = 120_000;
const VT_DEFAULT_POLL = 5_000;
const VT_BASE_URL = 'https://www.virustotal.com/api/v3';

export class VirusTotalScanner implements EvidenceScanner {
  public readonly id = 'databox:scanner:virustotal';

  private readonly apiKey: string;
  private readonly timeoutMs: number;
  private readonly pollIntervalMs: number;
  private readonly baseUrl: string;

  public constructor(options: VirusTotalScannerOptions) {
    if (!options.apiKey) {
      throw new TypeError('VirusTotalScanner requires an apiKey.');
    }
    this.apiKey = options.apiKey;
    this.timeoutMs = options.timeoutMs ?? VT_DEFAULT_TIMEOUT;
    this.pollIntervalMs = options.pollIntervalMs ?? VT_DEFAULT_POLL;
    this.baseUrl = options.baseUrl ?? VT_BASE_URL;
  }

  public async scan(bytes: Buffer): Promise<ScanVerdict> {
    const sha256 = await computeSha256(bytes);

    // First try a cached lookup by hash — avoids upload if already scanned
    const cached = await this.cachedLookup(sha256);
    if (cached !== null) {
      return cached;
    }

    // Upload the file for a new analysis
    const analysisId = await this.uploadFile(bytes);
    if (analysisId === null) {
      return 'error';
    }

    // Poll until the analysis completes
    return this.pollAnalysis(analysisId);
  }

  private async cachedLookup(sha256: string): Promise<ScanVerdict | null> {
    try {
      const res = await fetch(`${this.baseUrl}/files/${sha256}`, {
        headers: { 'x-apikey': this.apiKey },
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      if (res.status === 404) {
        return null; // Not previously scanned — proceed to upload
      }
      if (!res.ok) {
        return 'error';
      }
      const data = await res.json() as VirusTotalFileReport;
      const malicious = data?.data?.attributes?.last_analysis_stats?.malicious ?? 0;
      const suspicious = data?.data?.attributes?.last_analysis_stats?.suspicious ?? 0;
      if (malicious > 0 || suspicious > 0) {
        return 'malicious';
      }
      const harmless = data?.data?.attributes?.last_analysis_stats?.harmless ?? 0;
      const undetected = data?.data?.attributes?.last_analysis_stats?.undetected ?? 0;
      if (harmless + undetected > 0) {
        return 'clean';
      }
      return 'unknown';
    } catch {
      return 'error';
    }
  }

  private async uploadFile(bytes: Buffer): Promise<string | null> {
    try {
      const form = new FormData();
      const blob = new Blob([new Uint8Array(bytes)]);
      form.append('file', blob, 'evidence.bin');

      const res = await fetch(`${this.baseUrl}/files`, {
        method: 'POST',
        headers: { 'x-apikey': this.apiKey },
        body: form,
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      if (!res.ok) {
        return null;
      }
      const data = await res.json() as VirusTotalUploadResponse;
      return data?.data?.id ?? null;
    } catch {
      return null;
    }
  }

  private async pollAnalysis(analysisId: string): Promise<ScanVerdict> {
    const deadline = Date.now() + this.timeoutMs;
    while (Date.now() < deadline) {
      await sleep(this.pollIntervalMs);
      try {
        const res = await fetch(`${this.baseUrl}/analyses/${analysisId}`, {
          headers: { 'x-apikey': this.apiKey },
          signal: AbortSignal.timeout(this.timeoutMs),
        });
        if (!res.ok) {
          return 'error';
        }
        const data = await res.json() as VirusTotalAnalysisResult;
        const status = data?.data?.attributes?.status;
        if (status === 'completed') {
          const malicious = data?.data?.attributes?.stats?.malicious ?? 0;
          const suspicious = data?.data?.attributes?.stats?.suspicious ?? 0;
          if (malicious > 0 || suspicious > 0) {
            return 'malicious';
          }
          return 'clean';
        }
        if (status === 'failure' || status === 'error') {
          return 'error';
        }
        // status === 'queued' or 'in-progress' — keep polling
      } catch {
        return 'error';
      }
    }
    return 'error'; // Timed out
  }
}

/**
 * A composite scanner that runs multiple scanners in sequence. The first `clean` verdict
 * wins (short-circuit). If any scanner returns `malicious`, the composite returns `malicious`.
 * Otherwise, fail-closed: the most severe non-clean verdict wins (`error` > `unknown`).
 *
 * This is useful for defence-in-depth: e.g. ClamAV first, then VirusTotal for anything
 * ClamAV can't scan (e.g. if the daemon is down).
 */
export class CompositeScanner implements EvidenceScanner {
  public readonly id = 'databox:scanner:composite';

  private readonly scanners: EvidenceScanner[];

  public constructor(scanners: EvidenceScanner[]) {
    if (scanners.length === 0) {
      throw new TypeError('CompositeScanner requires at least one scanner.');
    }
    this.scanners = scanners;
  }

  public async scan(bytes: Buffer): Promise<ScanVerdict> {
    let worst: ScanVerdict = 'unknown';
    for (const scanner of this.scanners) {
      const verdict = await scanner.scan(bytes);
      if (verdict === 'clean') {
        return 'clean';
      }
      if (verdict === 'malicious') {
        return 'malicious';
      }
      // error is worse than unknown
      if (verdict === 'error') {
        worst = 'error';
      }
    }
    return worst;
  }
}

async function computeSha256(bytes: Buffer): Promise<string> {
  const { createHash } = await import('node:crypto');
  return createHash('sha256').update(bytes).digest('hex');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve): void => {
    setTimeout(resolve, ms);
  });
}

interface VirusTotalFileReport {
  data?: {
    attributes?: {
      last_analysis_stats?: {
        malicious?: number;
        suspicious?: number;
        harmless?: number;
        undetected?: number;
      };
    };
  };
}

interface VirusTotalUploadResponse {
  data?: {
    id?: string;
  };
}

interface VirusTotalAnalysisResult {
  data?: {
    attributes?: {
      status?: string;
      stats?: {
        malicious?: number;
        suspicious?: number;
        harmless?: number;
        undetected?: number;
      };
    };
  };
}

// Re-export spawn for potential CLI usage by external tooling
export { spawn };
