import { BadRequestHttpError } from '../../../../util/errors/BadRequestHttpError';

// JSON-LD keywords as constants so they can be used as computed keys (the linter's naming
// convention forbids `@`-prefixed object-literal property names).
const LD_CONTEXT = '@context';
const LD_TYPE = '@type';
const LD_ID = '@id';

export interface EventInput {
  readonly id: string;
  readonly name: string;
  readonly startDate: string;
  readonly endDate?: string;
  readonly location?: string;
  readonly organizer?: string;
}

function requireAbsoluteUri(value: string): string {
  try {
    return new URL(value).href;
  } catch {
    throw new BadRequestHttpError('An event id must be an absolute URI.');
  }
}

/**
 * Build an event as schema.org JSON-LD (see `databox/solid-cms-plan.md`, §10 events/ticketing).
 * Pure and deterministic — all dates are supplied by the caller.
 */
export function buildEvent(input: EventInput): Record<string, unknown> {
  const id = requireAbsoluteUri(input.id);
  if (input.name.trim().length === 0) {
    throw new BadRequestHttpError('An event needs a name.');
  }
  if (input.startDate.trim().length === 0) {
    throw new BadRequestHttpError('An event needs a start date.');
  }

  const event: Record<string, unknown> = {
    [LD_CONTEXT]: 'https://schema.org/',
    [LD_TYPE]: 'Event',
    [LD_ID]: id,
    name: input.name,
    startDate: input.startDate,
  };
  if (input.endDate !== undefined) {
    event.endDate = input.endDate;
  }
  if (input.location !== undefined) {
    event.location = { [LD_TYPE]: 'Place', name: input.location };
  }
  if (input.organizer !== undefined) {
    event.organizer = { [LD_TYPE]: 'Organization', name: input.organizer };
  }
  return event;
}
