import { BadRequestHttpError } from '../../../../util/errors/BadRequestHttpError';

const LD_CONTEXT = '@context';
const LD_TYPE = '@type';
const LD_ID = '@id';

export type PrintJobStatus =
  'intake' | 'prepress' | 'proofing' | 'printing' |
  'finishing' | 'ready' | 'delivered' | 'cancelled';

export interface PrintServiceInput {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly category: string;
  readonly basePrice: number;
  readonly currency: string;
  readonly unitType: string;
  readonly minQuantity?: number;
  readonly turnaroundHours?: number;
}

export interface PrintServiceResult {
  readonly record: Record<string, unknown>;
}

export interface PrintJobInput {
  readonly id: string;
  readonly customer: string;
  readonly organisation: string;
  readonly serviceId: string;
  readonly quantity: number;
  readonly specifications: readonly string[];
  readonly artworkUrl?: string;
  readonly notes?: string;
  readonly priority: 'standard' | 'rush';
  readonly intakeAt: string;
  readonly deliveryDeadline?: string;
}

export interface PrintJobResult {
  readonly record: Record<string, unknown>;
  readonly status: PrintJobStatus;
  readonly estimatedCost: number;
}

export interface PrintJobStatusUpdateInput {
  readonly jobId: string;
  readonly updatedBy: string;
  readonly status: PrintJobStatus;
  readonly updatedAt: string;
  readonly notes?: string;
}

export interface InterOrgPrintJobInput {
  readonly id: string;
  readonly customerOrg: string;
  readonly printShopOrg: string;
  readonly serviceId: string;
  readonly quantity: number;
  readonly specifications: readonly string[];
  readonly artworkUrl: string;
  readonly licencePolicy?: string;
  readonly deliveryAddress: string;
  readonly intakeAt: string;
  readonly deadline: string;
  readonly budget: number;
  readonly currency: string;
}

export interface InterOrgPrintJobResult {
  readonly record: Record<string, unknown>;
  readonly status: 'submitted';
  readonly licenceEnforced: boolean;
}

function requireUri(value: string, field: string): string {
  try {
    return new URL(value).href;
  } catch {
    throw new BadRequestHttpError(`A print ${field} must be an absolute URI.`);
  }
}

function requireNonEmpty(value: string, field: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new BadRequestHttpError(`A print ${field} must not be empty.`);
  }
  return trimmed;
}

function requireDate(value: string, field: string): string {
  const date = new Date(value);
  if (value.trim().length === 0 || Number.isNaN(date.getTime())) {
    throw new BadRequestHttpError(`A print ${field} must be a valid date.`);
  }
  return value;
}

function requirePositiveNumber(value: number, field: string): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new BadRequestHttpError(`A print ${field} must be a positive number.`);
  }
  return value;
}

function requirePrintStatus(value: string): PrintJobStatus {
  const valid: PrintJobStatus[] = [
    'intake',
    'prepress',
    'proofing',
    'printing',
    'finishing',
    'ready',
    'delivered',
    'cancelled',
  ];
  if (!valid.includes(value as PrintJobStatus)) {
    throw new BadRequestHttpError(`Print job status must be one of: ${valid.join(', ')}.`);
  }
  return value as PrintJobStatus;
}

/**
 * Create a print service catalogue entry.
 */
export function createPrintService(input: PrintServiceInput): PrintServiceResult {
  const id = requireUri(input.id, 'id');
  const name = requireNonEmpty(input.name, 'name');
  const description = requireNonEmpty(input.description, 'description');
  const category = requireNonEmpty(input.category, 'category');
  const basePrice = requirePositiveNumber(input.basePrice, 'basePrice');
  const currency = requireNonEmpty(input.currency, 'currency');
  const unitType = requireNonEmpty(input.unitType, 'unitType');

  const record: Record<string, unknown> = {
    [LD_CONTEXT]: 'https://schema.org/',
    [LD_TYPE]: [ 'Service', 'Product' ],
    [LD_ID]: id,
    name,
    description,
    category,
    offers: { [LD_TYPE]: 'Offer', price: basePrice, priceCurrency: currency },
    unitText: unitType,
  };

  if (input.minQuantity) {
    record.inventoryLevel = input.minQuantity;
  }
  if (input.turnaroundHours) {
    record.estimatedDuration = `PT${input.turnaroundHours}H`;
  }

  return { record };
}

/**
 * Create a print job — intake from a customer for a specific print service.
 */
export function createPrintJob(input: PrintJobInput): PrintJobResult {
  const id = requireUri(input.id, 'id');
  const customer = requireUri(input.customer, 'customer');
  const organisation = requireUri(input.organisation, 'organisation');
  const serviceId = requireUri(input.serviceId, 'serviceId');
  const quantity = requirePositiveNumber(input.quantity, 'quantity');
  const intakeAt = requireDate(input.intakeAt, 'intakeAt');

  if (input.specifications.length === 0) {
    throw new BadRequestHttpError('A print job must include at least one specification.');
  }

  const estimatedCost = quantity * 10;
  // Base estimate; real pricing from service catalogue

  const record: Record<string, unknown> = {
    [LD_CONTEXT]: 'https://schema.org/',
    [LD_TYPE]: [ 'Order', 'PrintJob' ],
    [LD_ID]: id,
    customer: { [LD_ID]: customer },
    seller: { [LD_ID]: organisation },
    orderedItem: {
      [LD_TYPE]: 'OrderItem',
      orderItemNumber: 1,
      orderedItem: { [LD_ID]: serviceId },
      orderQuantity: quantity,
    },
    orderStatus: 'OrderProcessing',
    orderDate: intakeAt,
    priority: input.priority,
    specifications: input.specifications,
    price: { [LD_TYPE]: 'MonetaryAmount', value: estimatedCost, currency: 'AUD' },
    printStatus: 'intake',
  };

  if (input.artworkUrl) {
    record.artwork = requireUri(input.artworkUrl, 'artworkUrl');
  }
  if (input.notes) {
    record.description = requireNonEmpty(input.notes, 'notes');
  }
  if (input.deliveryDeadline) {
    record.deliveryDate = requireDate(input.deliveryDeadline, 'deliveryDeadline');
  }

  return { record, status: 'intake', estimatedCost };
}

/**
 * Update a print job status — tracks the job through the pipeline.
 */
export function updatePrintJobStatus(input: PrintJobStatusUpdateInput): Record<string, unknown> {
  const jobId = requireUri(input.jobId, 'jobId');
  const updatedBy = requireUri(input.updatedBy, 'updatedBy');
  const status = requirePrintStatus(input.status);
  const updatedAt = requireDate(input.updatedAt, 'updatedAt');

  const orderStatus =
    status === 'delivered' ?
      'OrderDelivered' :
      status === 'cancelled' ? 'OrderCancelled' : 'OrderProcessing';

  const record: Record<string, unknown> = {
    [LD_CONTEXT]: 'https://schema.org/',
    [LD_TYPE]: [ 'Action', 'PrintStatusUpdate' ],
    [LD_ID]: `${jobId}#status-${status}-${Date.now()}`,
    object: { [LD_ID]: jobId },
    agent: { [LD_ID]: updatedBy },
    actionStatus: status === 'delivered' || status === 'cancelled' ? 'CompletedActionStatus' : 'ActiveActionStatus',
    description: status,
    endTime: updatedAt,
    orderStatus,
  };

  if (input.notes) {
    record.result = requireNonEmpty(input.notes, 'notes');
  }

  return record;
}

/**
 * Create an inter-organisation print job — B2B workflow where a customer
 * org submits a print job to a print shop via LDN, with ODRL licence
 * governing asset handling after fulfilment.
 */
export function createInterOrgPrintJob(input: InterOrgPrintJobInput): InterOrgPrintJobResult {
  const id = requireUri(input.id, 'id');
  const customerOrg = requireUri(input.customerOrg, 'customerOrg');
  const printShopOrg = requireUri(input.printShopOrg, 'printShopOrg');
  const serviceId = requireUri(input.serviceId, 'serviceId');
  const quantity = requirePositiveNumber(input.quantity, 'quantity');
  const artworkUrl = requireUri(input.artworkUrl, 'artworkUrl');
  const deliveryAddress = requireNonEmpty(input.deliveryAddress, 'deliveryAddress');
  const intakeAt = requireDate(input.intakeAt, 'intakeAt');
  const deadline = requireDate(input.deadline, 'deadline');
  const budget = requirePositiveNumber(input.budget, 'budget');
  const currency = requireNonEmpty(input.currency, 'currency');

  if (input.specifications.length === 0) {
    throw new BadRequestHttpError('An inter-org print job must include specifications.');
  }

  const licenceEnforced = input.licencePolicy !== undefined;

  const record: Record<string, unknown> = {
    [LD_CONTEXT]: [ 'https://schema.org/', 'http://www.w3.org/ns/odrl.jsonld' ],
    [LD_TYPE]: [ 'Order', 'InterOrgPrintJob' ],
    [LD_ID]: id,
    customer: { [LD_ID]: customerOrg },
    seller: { [LD_ID]: printShopOrg },
    orderedItem: {
      [LD_TYPE]: 'OrderItem',
      orderedItem: { [LD_ID]: serviceId },
      orderQuantity: quantity,
    },
    artwork: { [LD_ID]: artworkUrl },
    specifications: input.specifications,
    orderDate: intakeAt,
    deliveryDate: deadline,
    deliveryAddress: { [LD_TYPE]: 'Place', name: deliveryAddress },
    price: { [LD_TYPE]: 'MonetaryAmount', value: budget, currency },
    orderStatus: 'OrderProcessing',
    b2bFlow: true,
  };

  if (input.licencePolicy) {
    record.policy = { [LD_ID]: requireUri(input.licencePolicy, 'licencePolicy') };
    record.assetDeletionPolicy = 'Delete artwork after fulfilment per ODRL policy.';
  }

  return { record, status: 'submitted', licenceEnforced };
}
