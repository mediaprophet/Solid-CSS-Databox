import { BadRequestHttpError } from '../../../../util/errors/BadRequestHttpError';

// JSON-LD keywords as constants so they can be used as computed keys (the linter's naming
// convention forbids `@`-prefixed object-literal property names).
const LD_CONTEXT = '@context';
const LD_TYPE = '@type';
const LD_ID = '@id';

export interface DeliveryInput {
  readonly id: string;
  readonly order: string;
  readonly requestedBy: string;
  readonly pickup: string;
  readonly dropoff: string;
}

function requireUri(value: string, field: string): string {
  try {
    return new URL(value).href;
  } catch {
    throw new BadRequestHttpError(`A delivery request ${field} must be an absolute URI.`);
  }
}

function requireNonEmpty(value: string, field: string): string {
  if (value.trim().length === 0) {
    throw new BadRequestHttpError(`A delivery request needs a ${field}.`);
  }
  return value;
}

/**
 * Build a delivery request as an ActivityStreams `Offer` (see `databox/solid-ipms-plan.md`, §10.6
 * delivery/logistics). Pure and deterministic — all identifiers are supplied by the caller.
 */
export function buildDeliveryRequest(input: DeliveryInput): Record<string, unknown> {
  const id = requireUri(input.id, 'id');
  const order = requireUri(input.order, 'order');
  const requestedBy = requireUri(input.requestedBy, 'requestedBy');
  const pickup = requireNonEmpty(input.pickup, 'pickup location');
  const dropoff = requireNonEmpty(input.dropoff, 'dropoff location');

  return {
    [LD_CONTEXT]: 'https://www.w3.org/ns/activitystreams',
    [LD_TYPE]: 'Offer',
    [LD_ID]: id,
    actor: { [LD_ID]: requestedBy },
    object: { [LD_ID]: order },
    origin: pickup,
    target: dropoff,
  };
}
