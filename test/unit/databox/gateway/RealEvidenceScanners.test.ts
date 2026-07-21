import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { Server, Socket } from 'node:net';
import { ClamAvScanner, CompositeScanner, VirusTotalScanner } from '../../../../src/databox/gateway/RealEvidenceScanners';
import type { EvidenceScanner } from '../../../../src/databox/gateway/BinaryEvidenceQuarantine';
import { StubVerdictScanner } from '../../../../src/databox/gateway/BinaryEvidenceQuarantine';

describe('ClamAvScanner', () => {
  let server: Server;
  let port: number;
  const connections: Socket[] = [];

  let handler: ((socket: Socket) => void) = (): void => { /* no-op */ };

  beforeAll(async () => {
    server = new Server();
    await new Promise<void>((resolve): void => {
      server.listen(0, 'localhost', (): void => {
        const addr = server.address();
        if (addr && typeof addr === 'object') {
          port = addr.port;
        }
        resolve();
      });
    });
    server.on('connection', (socket: Socket): void => {
      connections.push(socket);
      socket.on('close', (): void => {
        const idx = connections.indexOf(socket);
        if (idx >= 0) {
          connections.splice(idx, 1);
        }
      });
      handler(socket);
    });
  });

  afterAll(async () => {
    for (const conn of connections) {
      conn.destroy();
    }
    await new Promise<void>((resolve): void => {
      server.close((): void => resolve());
    });
  });

  it('returns clean when ClamAV responds with OK', async () => {
    handler = (socket: Socket): void => {
      let buf = Buffer.alloc(0);
      let phase: 'command' | 'chunks' = 'command';
      socket.on('data', (data: Buffer): void => {
        buf = Buffer.concat([ buf, data ]);
        if (phase === 'command') {
          const nullIdx = buf.indexOf(0);
          if (nullIdx >= 0) {
            buf = buf.subarray(nullIdx + 1);
            phase = 'chunks';
          }
        }
        if (phase === 'chunks') {
          while (buf.length >= 4) {
            const chunkLen = buf.readUInt32BE(0);
            if (chunkLen === 0) {
              socket.write('stream: OK\0');
              socket.end();
              return;
            }
            if (buf.length < 4 + chunkLen) {
              break;
            }
            buf = buf.subarray(4 + chunkLen);
          }
        }
      });
    };

    const scanner = new ClamAvScanner({ host: 'localhost', port, timeoutMs: 5_000 });
    const verdict = await scanner.scan(Buffer.from('clean bytes'));
    expect(verdict).toBe('clean');
  });

  it('returns malicious when ClamAV responds with FOUND', async () => {
    handler = (socket: Socket): void => {
      let buf = Buffer.alloc(0);
      let phase: 'command' | 'chunks' = 'command';
      socket.on('data', (data: Buffer): void => {
        buf = Buffer.concat([ buf, data ]);
        if (phase === 'command') {
          const nullIdx = buf.indexOf(0);
          if (nullIdx >= 0) {
            buf = buf.subarray(nullIdx + 1);
            phase = 'chunks';
          }
        }
        if (phase === 'chunks') {
          while (buf.length >= 4) {
            const chunkLen = buf.readUInt32BE(0);
            if (chunkLen === 0) {
              socket.write('stream: Eicar-Test-Signature FOUND\0');
              socket.end();
              return;
            }
            if (buf.length < 4 + chunkLen) {
              break;
            }
            buf = buf.subarray(4 + chunkLen);
          }
        }
      });
    };

    const scanner = new ClamAvScanner({ host: 'localhost', port, timeoutMs: 5_000 });
    const verdict = await scanner.scan(Buffer.from('eicar bytes'));
    expect(verdict).toBe('malicious');
  });

  it('returns error when connection fails', async () => {
    const scanner = new ClamAvScanner({ host: 'localhost', port: 1, timeoutMs: 2_000 });
    const verdict = await scanner.scan(Buffer.from('test'));
    expect(verdict).toBe('error');
  });

  it('returns error on timeout', async () => {
    handler = (): void => {
      // Never respond — let the scanner time out
    };

    const scanner = new ClamAvScanner({ host: 'localhost', port, timeoutMs: 500 });
    const verdict = await scanner.scan(Buffer.from('test'));
    expect(verdict).toBe('error');
  });

  it('has a stable scanner id', () => {
    const scanner = new ClamAvScanner({ host: 'localhost', port });
    expect(scanner.id).toBe('databox:scanner:clamav');
  });
});

describe('VirusTotalScanner', () => {
  it('requires an API key', () => {
    expect((): void => {
      new VirusTotalScanner({ apiKey: '' });
    }).toThrow();
  });

  it('has a stable scanner id', () => {
    const scanner = new VirusTotalScanner({ apiKey: 'test-key' });
    expect(scanner.id).toBe('databox:scanner:virustotal');
  });

  it('returns error on network failure', async () => {
    const scanner = new VirusTotalScanner({
      apiKey: 'test-key',
      baseUrl: 'http://localhost:1',
      timeoutMs: 1_000,
    });
    const verdict = await scanner.scan(Buffer.from('test bytes'));
    expect(verdict).toBe('error');
  });
});

describe('CompositeScanner', () => {
  it('returns clean if any scanner returns clean', async () => {
    const scanners: EvidenceScanner[] = [
      new StubVerdictScanner((): boolean => false), // clean
      new StubVerdictScanner((): boolean => true),  // malicious
    ];
    const composite = new CompositeScanner(scanners);
    const verdict = await composite.scan(Buffer.from('test'));
    expect(verdict).toBe('clean');
  });

  it('returns malicious if any scanner returns malicious (and none clean)', async () => {
    const scanners: EvidenceScanner[] = [
      new StubVerdictScanner((): boolean => true),  // malicious
      new StubVerdictScanner((): boolean => false), // clean — but we hit malicious first
    ];
    const composite = new CompositeScanner(scanners);
    const verdict = await composite.scan(Buffer.from('test'));
    expect(verdict).toBe('malicious');
  });

  it('returns unknown when all scanners return unknown', async () => {
    const failClosed = new (class implements EvidenceScanner {
      public readonly id = 'test:fail-closed';
      public async scan(): Promise<'unknown'> {
        return 'unknown';
      }
    })();
    const composite = new CompositeScanner([ failClosed ]);
    const verdict = await composite.scan(Buffer.from('test'));
    expect(verdict).toBe('unknown');
  });

  it('returns error when at least one scanner errors and none are clean/malicious', async () => {
    const errorScanner = new (class implements EvidenceScanner {
      public readonly id = 'test:error';
      public async scan(): Promise<'error'> {
        return 'error';
      }
    })();
    const unknownScanner = new (class implements EvidenceScanner {
      public readonly id = 'test:unknown';
      public async scan(): Promise<'unknown'> {
        return 'unknown';
      }
    })();
    const composite = new CompositeScanner([ unknownScanner, errorScanner ]);
    const verdict = await composite.scan(Buffer.from('test'));
    expect(verdict).toBe('error');
  });

  it('requires at least one scanner', () => {
    expect((): void => {
      new CompositeScanner([]);
    }).toThrow();
  });

  it('has a stable scanner id', () => {
    const composite = new CompositeScanner([ new StubVerdictScanner((): boolean => false) ]);
    expect(composite.id).toBe('databox:scanner:composite');
  });
});
