import type { HttpHandlerInput } from '../../server/HttpHandler';
import { HttpError } from '../../util/errors/HttpError';

export async function readJsonBody<T>(request: HttpHandlerInput['request']): Promise<T> {
  let body = '';
  for await (const chunk of request) {
    body += requestChunkToString(chunk);
    if (Buffer.byteLength(body, 'utf8') > 65_536) {
      throw new Error('CMS request body is too large.');
    }
  }
  if (body.trim().length === 0) {
    throw new Error('CMS request body must be JSON.');
  }
  return JSON.parse(body) as T;
}

export function requestChunkToString(chunk: unknown): string {
  if (typeof chunk === 'string') {
    return chunk;
  }
  if (Buffer.isBuffer(chunk)) {
    return chunk.toString('utf8');
  }
  if (chunk instanceof Uint8Array) {
    return Buffer.from(chunk).toString('utf8');
  }
  throw new TypeError('CMS request body contained an unsupported chunk type.');
}

export function errorStatusCode(error: unknown): number {
  return error instanceof HttpError && typeof error.statusCode === 'number' ? error.statusCode : 400;
}

export async function readPersistedResource(
  response: HttpHandlerInput['response'],
  store: { load: (iri: string, contentType?: string) => Promise<string | undefined> } | undefined,
  url: string | undefined,
  storeName: string,
): Promise<void> {
  try {
    if (!store) {
      throw new Error(`Reading persisted resources requires a ${storeName}.`);
    }
    const iri = new URL(url ?? '/', 'http://localhost').searchParams.get('iri');
    if (iri === null || iri.length === 0) {
      throw new Error('A persisted-resource read requires an ?iri= query parameter.');
    }
    const record = await store.load(iri);
    if (record === undefined) {
      writeJson(response, 404, { error: 'cms-resource-not-found' });
      return;
    }
    writeJson(response, 200, JSON.parse(record), 'application/ld+json');
  } catch (error: unknown) {
    writeJson(response, errorStatusCode(error), {
      error: error instanceof Error ? error.message : 'Invalid persisted-resource read request.',
    });
  }
}

export function writeJson(
  response: HttpHandlerInput['response'],
  statusCode: number,
  body: unknown,
  contentType = 'application/json',
): void {
  response.statusCode = statusCode;
  response.setHeader('content-type', `${contentType}; charset=utf-8`);
  response.end(JSON.stringify(body));
}

export function writeTurtle(
  response: HttpHandlerInput['response'],
  statusCode: number,
  body: string,
): void {
  response.statusCode = statusCode;
  response.setHeader('content-type', 'text/turtle; charset=utf-8');
  response.setHeader('cache-control', 'public, max-age=60');
  response.setHeader('vary', 'host, x-forwarded-proto');
  response.end(body);
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
