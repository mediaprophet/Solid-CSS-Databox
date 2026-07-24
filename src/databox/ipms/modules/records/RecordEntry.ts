import { BadRequestHttpError } from '../../../../util/errors/BadRequestHttpError';

// JSON-LD keywords as constants so they can be used as computed keys (the linter's naming
// convention forbids `@`-prefixed object-literal property names).
const LD_CONTEXT = '@context';
const LD_TYPE = '@type';
const LD_ID = '@id';

export interface RecordEntryInput {
  readonly id: string;
  readonly subject: string;
  readonly recordedAt: string;
  readonly payload: Record<string, unknown>;
  readonly previous?: string;
}

function requireUri(value: string, field: string): string {
  try {
    return new URL(value).href;
  } catch {
    throw new BadRequestHttpError(`A record entry ${field} must be an absolute URI.`);
  }
}

/**
 * Build a longitudinal, owner-controlled record entry as schema.org JSON-LD (see
 * `databox/solid-ipms-plan.md`, §12.3) — the vehicle-log pattern: an `Action` tied to a `subject`
 * resource at a point in time, optionally chained to the entry that preceded it via `isBasedOn` so
 * the full history stays provenance-linked. Pure and deterministic (the timestamp is supplied by the
 * caller — this function never reads the clock).
 */
export function buildRecordEntry(input: RecordEntryInput): Record<string, unknown> {
  const id = requireUri(input.id, 'id');
  const subject = requireUri(input.subject, 'subject');
  if (input.recordedAt.trim().length === 0) {
    throw new BadRequestHttpError('A record entry needs a recordedAt timestamp.');
  }

  const entry: Record<string, unknown> = {
    [LD_CONTEXT]: 'https://schema.org/',
    [LD_TYPE]: 'Action',
    [LD_ID]: id,
    object: { [LD_ID]: subject },
    startTime: input.recordedAt,
    result: input.payload,
  };
  if (input.previous !== undefined) {
    entry.isBasedOn = { [LD_ID]: input.previous };
  }
  return entry;
}
