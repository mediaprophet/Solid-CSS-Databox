import { BadRequestHttpError } from '../../../../util/errors/BadRequestHttpError';

// JSON-LD keywords as constants so they can be used as computed keys (the linter's naming
// convention forbids `@`-prefixed object-literal property names).
const LD_CONTEXT = '@context';
const LD_TYPE = '@type';
const LD_ID = '@id';

export interface NoteInput {
  readonly id: string;
  readonly author: string;
  readonly content: string;
  readonly published: string;
  readonly inReplyTo?: string;
}

function requireUri(value: string, field: string): string {
  try {
    return new URL(value).href;
  } catch {
    throw new BadRequestHttpError(`A note ${field} must be an absolute URI.`);
  }
}

/**
 * Build an ActivityStreams social note (see `databox/solid-cms-plan.md`, §10 social).
 * Pure and deterministic — the published timestamp is supplied by the caller.
 */
export function buildNote(input: NoteInput): Record<string, unknown> {
  const id = requireUri(input.id, 'id');
  const author = requireUri(input.author, 'author');
  if (input.content.trim().length === 0) {
    throw new BadRequestHttpError('A note needs content.');
  }
  if (input.published.trim().length === 0) {
    throw new BadRequestHttpError('A note needs a published date.');
  }

  const note: Record<string, unknown> = {
    [LD_CONTEXT]: 'https://www.w3.org/ns/activitystreams',
    [LD_TYPE]: 'Note',
    [LD_ID]: id,
    attributedTo: { [LD_ID]: author },
    content: input.content,
    published: input.published,
  };
  if (input.inReplyTo !== undefined) {
    note.inReplyTo = { [LD_ID]: input.inReplyTo };
  }
  return note;
}
