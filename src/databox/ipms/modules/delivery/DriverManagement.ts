import { BadRequestHttpError } from '../../../../util/errors/BadRequestHttpError';

const LD_CONTEXT = '@context';
const LD_TYPE = '@type';
const LD_ID = '@id';

export interface DriverRegistrationInput {
  readonly id: string;
  readonly person: string;
  readonly organisation: string;
  readonly vehicleType: string;
  readonly vehicleRego?: string;
  readonly licenseNumber: string;
  readonly licenseExpiry: string;
  readonly zones: readonly string[];
  readonly availability: 'available' | 'busy' | 'offline';
  readonly registeredAt: string;
}

export interface DriverRegistrationResult {
  readonly record: Record<string, unknown>;
  readonly driverId: string;
  readonly status: 'registered';
}

export interface JobOfferInput {
  readonly id: string;
  readonly organisation: string;
  readonly driver: string;
  readonly pickupLocation: string;
  readonly dropoffLocation: string;
  readonly pickupTime: string;
  readonly estimatedDurationMinutes: number;
  readonly paymentAmount: number;
  readonly currency: string;
  readonly storeName: string;
  readonly priority: 'low' | 'normal' | 'high';
  readonly offeredAt: string;
}

export interface JobOfferResult {
  readonly record: Record<string, unknown>;
  readonly status: 'offered';
}

export interface JobAcceptInput {
  readonly jobId: string;
  readonly driver: string;
  readonly acceptedAt: string;
}

export interface JobStatusUpdateInput {
  readonly jobId: string;
  readonly driver: string;
  readonly status: 'accepted' | 'picked-up' | 'in-transit' | 'delivered' | 'failed';
  readonly updatedAt: string;
  readonly notes?: string;
}

function requireUri(value: string, field: string): string {
  try {
    return new URL(value).href;
  } catch {
    throw new BadRequestHttpError(`A driver ${field} must be an absolute URI.`);
  }
}

function requireNonEmpty(value: string, field: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new BadRequestHttpError(`A driver ${field} must not be empty.`);
  }
  return trimmed;
}

function requireDate(value: string, field: string): string {
  const date = new Date(value);
  if (value.trim().length === 0 || Number.isNaN(date.getTime())) {
    throw new BadRequestHttpError(`A driver ${field} must be a valid date.`);
  }
  return value;
}

function requirePositiveNumber(value: number, field: string): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new BadRequestHttpError(`A driver ${field} must be a positive number.`);
  }
  return value;
}

/**
 * Register a delivery driver — creates a driver directory entry with
 * vehicle info, zones, and availability status.
 */
export function registerDriver(input: DriverRegistrationInput): DriverRegistrationResult {
  const id = requireUri(input.id, 'id');
  const person = requireUri(input.person, 'person');
  const organisation = requireUri(input.organisation, 'organisation');
  const vehicleType = requireNonEmpty(input.vehicleType, 'vehicleType');
  const licenseNumber = requireNonEmpty(input.licenseNumber, 'licenseNumber');
  const licenseExpiry = requireDate(input.licenseExpiry, 'licenseExpiry');
  const registeredAt = requireDate(input.registeredAt, 'registeredAt');

  if (input.zones.length === 0) {
    throw new BadRequestHttpError('A driver must have at least one zone.');
  }

  const record: Record<string, unknown> = {
    [LD_CONTEXT]: [ 'https://schema.org/', 'https://www.w3.org/ns/activitystreams' ],
    [LD_TYPE]: [ 'Person', 'Driver' ],
    [LD_ID]: id,
    agent: { [LD_ID]: person },
    worksFor: { [LD_ID]: organisation },
    vehicleType,
    licenseNumber,
    licenseExpiry,
    knowsAbout: input.zones,
    availability: input.availability,
    dateRegistered: registeredAt,
  };

  if (input.vehicleRego) {
    record.identifier = requireNonEmpty(input.vehicleRego, 'vehicleRego');
  }

  return { record, driverId: id, status: 'registered' };
}

/**
 * Create a job offer for a driver — an LDN notification that can be
 * sent to the driver's pod inbox.
 */
export function createJobOffer(input: JobOfferInput): JobOfferResult {
  const id = requireUri(input.id, 'id');
  const organisation = requireUri(input.organisation, 'organisation');
  const driver = requireUri(input.driver, 'driver');
  const pickupLocation = requireNonEmpty(input.pickupLocation, 'pickupLocation');
  const dropoffLocation = requireNonEmpty(input.dropoffLocation, 'dropoffLocation');
  const pickupTime = requireDate(input.pickupTime, 'pickupTime');
  const estimatedDurationMinutes = requirePositiveNumber(input.estimatedDurationMinutes, 'estimatedDurationMinutes');
  const paymentAmount = requirePositiveNumber(input.paymentAmount, 'paymentAmount');
  const currency = requireNonEmpty(input.currency, 'currency');
  const storeName = requireNonEmpty(input.storeName, 'storeName');
  const offeredAt = requireDate(input.offeredAt, 'offeredAt');

  const record: Record<string, unknown> = {
    [LD_CONTEXT]: [ 'https://schema.org/', 'https://www.w3.org/ns/activitystreams' ],
    [LD_TYPE]: [ 'Offer', 'Action' ],
    [LD_ID]: id,
    actor: { [LD_ID]: organisation },
    target: { [LD_ID]: driver },
    actionStatus: 'PotentialActionStatus',
    startTime: offeredAt,
    object: {
      [LD_TYPE]: [ 'Order', 'DeliveryJob' ],
      orderedItem: {
        [LD_TYPE]: 'Service',
        name: `Delivery from ${storeName}`,
        areaServed: { [LD_TYPE]: 'Place', name: pickupLocation },
        provider: { [LD_ID]: organisation },
      },
      deliveryAddress: { [LD_TYPE]: 'Place', name: dropoffLocation },
      orderDate: pickupTime,
      expectedDuration: `PT${estimatedDurationMinutes}M`,
    },
    priceSpecification: { [LD_TYPE]: 'MonetaryAmount', value: paymentAmount, currency },
    priority: input.priority,
  };

  return { record, status: 'offered' };
}

/**
 * Update a delivery job status — tracks the lifecycle from acceptance
 * through delivery.
 */
export function updateJobStatus(input: JobStatusUpdateInput): Record<string, unknown> {
  const jobId = requireUri(input.jobId, 'jobId');
  const driver = requireUri(input.driver, 'driver');
  const updatedAt = requireDate(input.updatedAt, 'updatedAt');

  const validStatuses = [ 'accepted', 'picked-up', 'in-transit', 'delivered', 'failed' ];
  if (!validStatuses.includes(input.status)) {
    throw new BadRequestHttpError(`Job status must be one of: ${validStatuses.join(', ')}.`);
  }

  const actionStatus = input.status === 'delivered' ?
    'CompletedActionStatus' :
    input.status === 'failed' ?
      'FailedActionStatus' :
      'ActiveActionStatus';

  const record: Record<string, unknown> = {
    [LD_CONTEXT]: 'https://schema.org/',
    [LD_TYPE]: [ 'Action', 'DeliveryStatusUpdate' ],
    [LD_ID]: `${jobId}#status-${input.status}-${Date.now()}`,
    object: { [LD_ID]: jobId },
    agent: { [LD_ID]: driver },
    actionStatus,
    description: input.status,
    endTime: updatedAt,
  };

  if (input.notes) {
    record.result = requireNonEmpty(input.notes, 'notes');
  }

  return record;
}

/**
 * Dispatch engine — matches available drivers to job offers based on
 * zone, availability, and priority. Returns sorted driver matches.
 */
export interface DriverMatchInput {
  readonly drivers: readonly DriverRegistrationInput[];
  readonly jobZones: readonly string[];
  readonly jobPriority: 'low' | 'normal' | 'high';
}

export interface DriverMatchResult {
  readonly driverId: string;
  readonly person: string;
  readonly score: number;
  readonly reason: string;
}

export function dispatchMatch(input: DriverMatchInput): DriverMatchResult[] {
  if (input.drivers.length === 0) {
    throw new BadRequestHttpError('Dispatch requires at least one driver.');
  }
  if (input.jobZones.length === 0) {
    throw new BadRequestHttpError('Dispatch requires at least one job zone.');
  }

  const results: DriverMatchResult[] = [];

  for (const driver of input.drivers) {
    if (driver.availability !== 'available') {
      continue;
    }

    const matchingZones = driver.zones.filter(z => input.jobZones.includes(z));
    if (matchingZones.length === 0) {
      continue;
    }

    let score = matchingZones.length * 10;
    if (input.jobPriority === 'high') {
      score += 5;
    }

    results.push({
      driverId: driver.id,
      person: driver.person,
      score,
      reason: `Matches ${matchingZones.length} zone(s): ${matchingZones.join(', ')}`,
    });
  }

  return results.sort((a, b) => b.score - a.score);
}
