import { BadRequestHttpError } from '../../../../util/errors/BadRequestHttpError';
import { CMS } from '../../../../util/Vocabularies';
import type { SolidModuleManifest } from '../../SolidModuleManifest';
import type {
  NativePosDeviceDescriptor,
  NativePosDeviceJob,
  NativePosOperatorSession,
} from './NativePosDeviceContract';
import {
  buildOpenCashDrawerJob,
  validateNativePosDeviceDescriptor,
  validateNativePosDeviceJob,
} from './NativePosDeviceContract';
import {
  LD_CONTEXT,
  LD_ID,
  LD_TYPE,
  money,
  requireCurrency,
  requireDate,
  requireNonEmpty,
  requireNonNegativeFinite,
  requireNonNegativeInteger,
  requireOptionalUri,
  requirePositiveInteger,
  requireUri,
  round2,
} from './PosValidation';

const CMS_CONTEXT = 'urn:solid-server:databox:cms#';
const SCHEMA_CONTEXT = 'https://schema.org/';
// The JSON-LD `@vocab` keyword as a constant (the linter forbids `@`-prefixed object-literal keys).
const LD_VOCAB = '@vocab';

const CASH_REGISTER_STATES = [ 'open', 'closed' ] as const;
const CASH_REGISTER_CLOSE_REASONS = [ 'end-of-shift', 'cash-count', 'manager-close', 'emergency-close' ] as const;
const OFFLINE_OPERATIONS = [
  'cart.snapshot',
  'order.create',
  'payment.handoff',
  'receipt.issue',
  'drawer.open',
  'printer.print',
] as const;
const OFFLINE_ENTRY_STATUSES = [ 'queued', 'claimed', 'synced', 'failed', 'conflict' ] as const;
const OFFLINE_REPLAY_POLICIES = [ 'fifo-idempotent', 'operator-review-required' ] as const;
const AUDIT_RECEIPT_KINDS = [
  'register-open',
  'register-close',
  'drawer-open',
  'printer-print',
  'offline-queue-snapshot',
  'offline-replay',
] as const;
const DEVICE_BINDING_KINDS = [ 'cash-drawer', 'receipt-printer', 'customer-display', 'pos-terminal' ] as const;
const SECRET_PATTERN = /password|passwd|pwd|secret|token|credential|certificate|privatekey|-----BEGIN/iu;
const CARD_DATA_PATTERN = /\b(?:\d[ -]*?){13,19}\b|cvv|cvc|cardNumber|pan/iu;

export type CashRegisterState = typeof CASH_REGISTER_STATES[number];
export type CashRegisterCloseReason = typeof CASH_REGISTER_CLOSE_REASONS[number];
export type CashRegisterOfflineOperation = typeof OFFLINE_OPERATIONS[number];
export type CashRegisterOfflineEntryStatus = typeof OFFLINE_ENTRY_STATUSES[number];
export type CashRegisterOfflineReplayPolicy = typeof OFFLINE_REPLAY_POLICIES[number];
export type CashRegisterAuditReceiptKind = typeof AUDIT_RECEIPT_KINDS[number];
export type CashRegisterDeviceBindingKind = typeof DEVICE_BINDING_KINDS[number];

export interface CashRegisterDeviceBinding {
  readonly deviceId: string;
  readonly kind: CashRegisterDeviceBindingKind;
  readonly deviceWebId: string;
  readonly capabilities: readonly string[];
}

export interface CashRegisterPeripheralPorts {
  readonly cashDrawer?: CashDrawerPort;
  readonly receiptPrinter?: ReceiptPrinterPort;
}

export interface CashDrawerPort {
  readonly descriptor: NativePosDeviceDescriptor;
  readonly open: (job: NativePosDeviceJob) => Promise<CashDrawerOpenResult>;
}

export interface ReceiptPrinterPort {
  readonly descriptor: NativePosDeviceDescriptor;
  readonly print: (
    job: NativePosDeviceJob,
    receipt: CashRegisterAuditReceiptDescriptor,
  ) => Promise<ReceiptPrintResult>;
}

export interface CashDrawerOpenResult {
  readonly jobId: string;
  readonly status: 'completed' | 'failed';
  readonly completedAt: string;
  readonly auditReceiptId?: string;
  readonly error?: string;
}

export interface ReceiptPrintResult {
  readonly jobId: string;
  readonly status: 'completed' | 'failed';
  readonly completedAt: string;
  readonly printedReceiptId?: string;
  readonly error?: string;
}

export interface CashRegisterOpenInput {
  readonly sessionId: string;
  readonly registerId: string;
  readonly registerName: string;
  readonly registerLocation?: string;
  readonly operatorSession: NativePosOperatorSession;
  readonly openedAt: string;
  readonly currency: string;
  readonly openingFloat: number;
  readonly deviceBindings?: readonly CashRegisterDeviceBinding[];
  readonly cashDrawer?: NativePosDeviceDescriptor;
  readonly openDrawerJobId?: string;
  readonly offlineQueue?: CashRegisterOfflineQueueDescriptorInput;
  readonly auditReceipt?: CashRegisterAuditReceiptDescriptorInput;
}

export interface CashRegisterCloseInput {
  readonly session: CashRegisterSession;
  readonly closedAt: string;
  readonly closedBy: string;
  readonly closeReason: CashRegisterCloseReason;
  readonly cashSalesTotal: number;
  readonly cashRefundsTotal?: number;
  readonly paidInTotal?: number;
  readonly paidOutTotal?: number;
  readonly countedCash: number;
  readonly auditReceipt?: CashRegisterAuditReceiptDescriptorInput;
}

export interface CashRegisterSession {
  readonly sessionId: string;
  readonly registerId: string;
  readonly registerName: string;
  readonly registerLocation?: string;
  readonly state: CashRegisterState;
  readonly operatorSession: NativePosOperatorSession;
  readonly openedAt: string;
  readonly closedAt?: string;
  readonly closedBy?: string;
  readonly closeReason?: CashRegisterCloseReason;
  readonly currency: string;
  readonly openingFloat: number;
  readonly cashSalesTotal: number;
  readonly cashRefundsTotal: number;
  readonly paidInTotal: number;
  readonly paidOutTotal: number;
  readonly expectedCash: number;
  readonly countedCash?: number;
  readonly variance?: number;
  readonly deviceBindings: readonly CashRegisterDeviceBinding[];
  readonly offlineQueue?: CashRegisterOfflineQueueDescriptor;
  readonly auditReceipts: readonly CashRegisterAuditReceiptDescriptor[];
}

export interface CashRegisterSessionResult {
  readonly session: CashRegisterSession;
  readonly record: Record<string, unknown>;
  readonly queuedJobs: readonly NativePosDeviceJob[];
}

export interface CashRegisterOfflineQueueDescriptorInput {
  readonly queueId: string;
  readonly storage: 'solid-container' | 'encrypted-local-spool';
  readonly storageLocation: string;
  readonly replayPolicy: CashRegisterOfflineReplayPolicy;
  readonly maxRetentionSeconds: number;
  readonly entries?: readonly CashRegisterOfflineQueueEntryInput[];
}

export interface CashRegisterOfflineQueueDescriptor {
  readonly queueId: string;
  readonly storage: 'solid-container' | 'encrypted-local-spool';
  readonly storageLocation: string;
  readonly replayPolicy: CashRegisterOfflineReplayPolicy;
  readonly maxRetentionSeconds: number;
  readonly pendingCount: number;
  readonly entries: readonly CashRegisterOfflineQueueEntry[];
}

export interface CashRegisterOfflineQueueEntryInput {
  readonly entryId: string;
  readonly operation: CashRegisterOfflineOperation;
  readonly targetResource: string;
  readonly payloadDigest: string;
  readonly idempotencyKey: string;
  readonly createdAt: string;
  readonly status: CashRegisterOfflineEntryStatus;
  readonly retryCount?: number;
  readonly lastError?: string;
}

export interface CashRegisterOfflineQueueEntry extends CashRegisterOfflineQueueEntryInput {
  readonly retryCount: number;
}

export interface CashRegisterAuditReceiptDescriptorInput {
  readonly receiptId: string;
  readonly kind: CashRegisterAuditReceiptKind;
  readonly issuedAt: string;
  readonly issuerWebId: string;
  readonly subjectResource: string;
  readonly payloadDigest: string;
  readonly relatedJobIds?: readonly string[];
  readonly evidenceResources?: readonly string[];
  readonly printableReceiptUrl?: string;
  readonly digitalReceiptUrl?: string;
}

export interface CashRegisterAuditReceiptDescriptor {
  readonly receiptId: string;
  readonly kind: CashRegisterAuditReceiptKind;
  readonly issuedAt: string;
  readonly issuerWebId: string;
  readonly subjectResource: string;
  readonly payloadDigest: string;
  readonly relatedJobIds: readonly string[];
  readonly evidenceResources: readonly string[];
  readonly printableReceiptUrl?: string;
  readonly digitalReceiptUrl?: string;
}

export const CASH_REGISTER_MODULE_MANIFEST: SolidModuleManifest = {
  id: 'pos.cash-register',
  name: 'Cash Register Sessions',
  version: '0.1.0',
  description:
    'Portable POS register open/close sessions, native-edge device bindings, offline queues, and audit receipts.',
  capabilities: [
    'pos:cash-register-session',
    'pos:cash-register-open',
    'pos:cash-register-close',
    'pos:cash-drawer-job',
    'pos:receipt-printer-job',
    'pos:offline-queue',
    'pos:audit-receipt',
    'cms:portable-core-pos-cash-register',
    'cms:css-enhanced-cash-register-store',
  ],
  routes: [ 'POST /.databox/cms/pos/register/sessions', 'GET /.databox/cms/pos/register/sessions' ],
  configShape: `${CMS.namespace}CashRegisterConfigShape`,
  adminUi: {
    navLabel: 'Cash Registers',
    path: '/pos/registers',
  },
};

export function openCashRegisterSession(input: CashRegisterOpenInput): CashRegisterSessionResult {
  const operatorSession = validateOperatorSession(input.operatorSession, 'cash register operator session');
  const openedAt = requireDate(input.openedAt, 'cash register session', 'openedAt');
  ensureSessionActiveAt(operatorSession, openedAt);

  const deviceBindings = [
    ...validateDeviceBindings(input.deviceBindings ?? []),
    ...input.cashDrawer === undefined ?
        [] :
        [ bindingFromDeviceDescriptor(input.cashDrawer) ],
  ];
  ensureUniqueDeviceBindings(deviceBindings);

  const queuedJobs: NativePosDeviceJob[] = [];
  if (input.cashDrawer !== undefined) {
    queuedJobs.push(buildOpenCashDrawerJob({
      id: input.openDrawerJobId ?? `${requireSafeId(input.sessionId, 'cash register sessionId')}:drawer-open`,
      descriptor: input.cashDrawer,
      requestedBy: operatorSession.webId,
      operatorSession,
      createdAt: openedAt,
      reason: 'cash register open',
      registerId: input.registerId,
    }));
  }

  const auditReceipts: CashRegisterAuditReceiptDescriptor[] = [];
  if (input.auditReceipt !== undefined) {
    auditReceipts.push(validateAuditReceiptDescriptor(input.auditReceipt));
  }
  const session = normalizeSession({
    sessionId: input.sessionId,
    registerId: input.registerId,
    registerName: input.registerName,
    ...input.registerLocation === undefined ? {} : { registerLocation: input.registerLocation },
    state: 'open',
    operatorSession,
    openedAt,
    currency: input.currency,
    openingFloat: input.openingFloat,
    cashSalesTotal: 0,
    cashRefundsTotal: 0,
    paidInTotal: 0,
    paidOutTotal: 0,
    expectedCash: input.openingFloat,
    deviceBindings,
    ...input.offlineQueue === undefined ? {} : { offlineQueue: validateOfflineQueue(input.offlineQueue) },
    auditReceipts,
  });

  return {
    session,
    record: toCashRegisterSessionRecord(session),
    queuedJobs: queuedJobs.map((job): NativePosDeviceJob => validateNativePosDeviceJob(job)),
  };
}

export function closeCashRegisterSession(input: CashRegisterCloseInput): CashRegisterSessionResult {
  const source = normalizeSession(input.session);
  if (source.state !== 'open') {
    throw new BadRequestHttpError('A cash register session can only be closed from the open state.');
  }
  const closedAt = requireDate(input.closedAt, 'cash register session', 'closedAt');
  if (Date.parse(closedAt) < Date.parse(source.openedAt)) {
    throw new BadRequestHttpError('A cash register session closedAt must not be before openedAt.');
  }
  const closedBy = requireHttpsUri(input.closedBy, 'cash register session closedBy');
  const cashSalesTotal = requireNonNegativeFinite(input.cashSalesTotal, 'cash register session', 'cashSalesTotal');
  const cashRefundsTotal = requireNonNegativeFinite(
    input.cashRefundsTotal ?? 0,
    'cash register session',
    'cashRefundsTotal',
  );
  const paidInTotal = requireNonNegativeFinite(input.paidInTotal ?? 0, 'cash register session', 'paidInTotal');
  const paidOutTotal = requireNonNegativeFinite(input.paidOutTotal ?? 0, 'cash register session', 'paidOutTotal');
  const countedCash = requireNonNegativeFinite(input.countedCash, 'cash register session', 'countedCash');
  const expectedCash = round2(source.openingFloat + cashSalesTotal - cashRefundsTotal + paidInTotal - paidOutTotal);
  const variance = round2(countedCash - expectedCash);
  const auditReceipts = [
    ...source.auditReceipts,
    ...input.auditReceipt === undefined ?
        [] :
        [ validateAuditReceiptDescriptor(input.auditReceipt) ],
  ];

  const session = normalizeSession({
    ...source,
    state: 'closed',
    closedAt,
    closedBy,
    closeReason: requireOneOf(input.closeReason, CASH_REGISTER_CLOSE_REASONS, 'cash register closeReason'),
    cashSalesTotal: round2(cashSalesTotal),
    cashRefundsTotal: round2(cashRefundsTotal),
    paidInTotal: round2(paidInTotal),
    paidOutTotal: round2(paidOutTotal),
    expectedCash,
    countedCash: round2(countedCash),
    variance,
    auditReceipts,
  });
  return {
    session,
    record: toCashRegisterSessionRecord(session),
    queuedJobs: [],
  };
}

export function validateOfflineQueue(
  queue: CashRegisterOfflineQueueDescriptorInput | CashRegisterOfflineQueueDescriptor,
): CashRegisterOfflineQueueDescriptor {
  const entries = (queue.entries ?? []).map(validateOfflineQueueEntry);
  return {
    queueId: requireUri(queue.queueId, 'cash register offline queue', 'queueId'),
    storage: requireOneOf(
      queue.storage,
      [ 'solid-container', 'encrypted-local-spool' ],
      'cash register offline queue storage',
    ),
    storageLocation: validateStorageLocation(queue.storage, queue.storageLocation),
    replayPolicy: requireOneOf(
      queue.replayPolicy,
      OFFLINE_REPLAY_POLICIES,
      'cash register offline queue replayPolicy',
    ),
    maxRetentionSeconds: requirePositiveInteger(
      queue.maxRetentionSeconds,
      'cash register offline queue',
      'maxRetentionSeconds',
    ),
    pendingCount: entries.filter((entry): boolean =>
      entry.status === 'queued' || entry.status === 'claimed' || entry.status === 'failed').length,
    entries,
  };
}

export function validateOfflineQueueEntry(entry: CashRegisterOfflineQueueEntryInput): CashRegisterOfflineQueueEntry {
  assertNoSensitiveInlineText(entry.idempotencyKey, 'cash register offline queue idempotencyKey');
  if (entry.lastError !== undefined) {
    assertNoSensitiveInlineText(entry.lastError, 'cash register offline queue lastError');
  }
  return {
    entryId: requireSafeId(entry.entryId, 'cash register offline queue entryId'),
    operation: requireOneOf(entry.operation, OFFLINE_OPERATIONS, 'cash register offline queue operation'),
    targetResource: requireUri(entry.targetResource, 'cash register offline queue entry', 'targetResource'),
    payloadDigest: requireSha256Urn(entry.payloadDigest, 'cash register offline queue payloadDigest'),
    idempotencyKey: requireNonEmpty(entry.idempotencyKey, 'cash register offline queue', 'idempotencyKey'),
    createdAt: requireDate(entry.createdAt, 'cash register offline queue entry', 'createdAt'),
    status: requireOneOf(entry.status, OFFLINE_ENTRY_STATUSES, 'cash register offline queue entry status'),
    retryCount: requireNonNegativeInteger(
      entry.retryCount ?? 0,
      'cash register offline queue entry',
      'retryCount',
    ),
    ...entry.lastError === undefined ?
        {} :
        { lastError: requireNonEmpty(entry.lastError, 'cash register offline queue entry', 'lastError') },
  };
}

export function validateAuditReceiptDescriptor(
  receipt: CashRegisterAuditReceiptDescriptorInput,
): CashRegisterAuditReceiptDescriptor {
  const relatedJobIds = uniqueStrings(
    (receipt.relatedJobIds ?? []).map((jobId): string => requireSafeId(jobId, 'cash register audit receipt jobId')),
    'cash register audit receipt relatedJobIds',
  );
  const evidenceResources = uniqueStrings(
    (receipt.evidenceResources ?? []).map((resource): string =>
      requireUri(resource, 'cash register audit receipt', 'evidenceResource')),
    'cash register audit receipt evidenceResources',
  );
  return {
    receiptId: requireUri(receipt.receiptId, 'cash register audit receipt', 'receiptId'),
    kind: requireOneOf(receipt.kind, AUDIT_RECEIPT_KINDS, 'cash register audit receipt kind'),
    issuedAt: requireDate(receipt.issuedAt, 'cash register audit receipt', 'issuedAt'),
    issuerWebId: requireHttpsUri(receipt.issuerWebId, 'cash register audit receipt issuerWebId'),
    subjectResource: requireUri(receipt.subjectResource, 'cash register audit receipt', 'subjectResource'),
    payloadDigest: requireSha256Urn(receipt.payloadDigest, 'cash register audit receipt payloadDigest'),
    relatedJobIds,
    evidenceResources,
    ...receipt.printableReceiptUrl === undefined ?
        {} :
        {
          printableReceiptUrl: requireOptionalUri(
            receipt.printableReceiptUrl,
            'cash register audit receipt',
            'printableReceiptUrl',
          ),
        },
    ...receipt.digitalReceiptUrl === undefined ?
        {} :
        {
          digitalReceiptUrl: requireOptionalUri(
            receipt.digitalReceiptUrl,
            'cash register audit receipt',
            'digitalReceiptUrl',
          ),
        },
  };
}

export function bindingFromDeviceDescriptor(descriptor: NativePosDeviceDescriptor): CashRegisterDeviceBinding {
  const checked = validateNativePosDeviceDescriptor(descriptor);
  return {
    deviceId: checked.id,
    kind: checked.kind,
    deviceWebId: checked.deviceWebId,
    capabilities: checked.capabilities,
  };
}

export function toCashRegisterSessionRecord(session: CashRegisterSession): Record<string, unknown> {
  const checked = normalizeSession(session);
  return {
    [LD_CONTEXT]: {
      [LD_VOCAB]: SCHEMA_CONTEXT,
      schema: SCHEMA_CONTEXT,
      cms: CMS_CONTEXT,
    },
    [LD_TYPE]: 'SaleEvent',
    [LD_ID]: sessionSubject(checked.sessionId),
    identifier: checked.sessionId,
    name: checked.registerName,
    eventStatus: checked.state === 'closed' ?
      'https://schema.org/EventCompleted' :
      'https://schema.org/EventScheduled',
    startDate: checked.openedAt,
    ...checked.closedAt === undefined ? {} : { endDate: checked.closedAt },
    location: checked.registerLocation ?? checked.registerId,
    organizer: { [LD_ID]: checked.operatorSession.webId },
    additionalProperty: [
      propertyValue('registerId', checked.registerId),
      propertyValue('state', checked.state),
      propertyValue('currency', checked.currency),
      propertyValue('openingFloat', money(checked.openingFloat)),
      propertyValue('cashSalesTotal', money(checked.cashSalesTotal)),
      propertyValue('cashRefundsTotal', money(checked.cashRefundsTotal)),
      propertyValue('paidInTotal', money(checked.paidInTotal)),
      propertyValue('paidOutTotal', money(checked.paidOutTotal)),
      propertyValue('expectedCash', money(checked.expectedCash)),
      ...checked.countedCash === undefined ? [] : [ propertyValue('countedCash', money(checked.countedCash)) ],
      ...checked.variance === undefined ? [] : [ propertyValue('variance', money(checked.variance)) ],
      ...checked.closeReason === undefined ? [] : [ propertyValue('closeReason', checked.closeReason) ],
    ],
    instrument: checked.deviceBindings.map((binding): Record<string, unknown> => ({
      [LD_TYPE]: 'Thing',
      identifier: binding.deviceId,
      name: binding.kind,
      sameAs: binding.deviceWebId,
      additionalProperty: binding.capabilities.map((capability): Record<string, unknown> =>
        propertyValue('capability', capability)),
    })),
    ...checked.offlineQueue === undefined ? {} : { workPerformed: offlineQueueRecord(checked.offlineQueue) },
    ...checked.auditReceipts.length === 0 ?
        {} :
        { subjectOf: checked.auditReceipts.map(auditReceiptRecord) },
  };
}

function normalizeSession(session: CashRegisterSession): CashRegisterSession {
  const openingFloat = round2(requireNonNegativeFinite(
    session.openingFloat,
    'cash register session',
    'openingFloat',
  ));
  const cashSalesTotal = round2(requireNonNegativeFinite(
    session.cashSalesTotal,
    'cash register session',
    'cashSalesTotal',
  ));
  const cashRefundsTotal = round2(requireNonNegativeFinite(
    session.cashRefundsTotal,
    'cash register session',
    'cashRefundsTotal',
  ));
  const paidInTotal = round2(requireNonNegativeFinite(session.paidInTotal, 'cash register session', 'paidInTotal'));
  const paidOutTotal = round2(requireNonNegativeFinite(session.paidOutTotal, 'cash register session', 'paidOutTotal'));
  const expectedCash = round2(requireNonNegativeFinite(session.expectedCash, 'cash register session', 'expectedCash'));
  return {
    sessionId: requireSafeId(session.sessionId, 'cash register sessionId'),
    registerId: requireSafeId(session.registerId, 'cash register registerId'),
    registerName: requireNonEmpty(session.registerName, 'cash register', 'registerName'),
    ...session.registerLocation === undefined ?
        {} :
        { registerLocation: requireNonEmpty(session.registerLocation, 'cash register', 'registerLocation') },
    state: requireOneOf(session.state, CASH_REGISTER_STATES, 'cash register state'),
    operatorSession: validateOperatorSession(session.operatorSession, 'cash register operator session'),
    openedAt: requireDate(session.openedAt, 'cash register session', 'openedAt'),
    ...session.closedAt === undefined ?
        {} :
        { closedAt: requireDate(session.closedAt, 'cash register session', 'closedAt') },
    ...session.closedBy === undefined ?
        {} :
        { closedBy: requireHttpsUri(session.closedBy, 'cash register session closedBy') },
    ...session.closeReason === undefined ?
        {} :
        { closeReason: requireOneOf(session.closeReason, CASH_REGISTER_CLOSE_REASONS, 'cash register closeReason') },
    currency: requireCurrency(session.currency, 'cash register session'),
    openingFloat,
    cashSalesTotal,
    cashRefundsTotal,
    paidInTotal,
    paidOutTotal,
    expectedCash,
    ...session.countedCash === undefined ?
        {} :
        { countedCash: round2(requireNonNegativeFinite(session.countedCash, 'cash register session', 'countedCash')) },
    ...session.variance === undefined ?
        {} :
        { variance: round2(requireFinite(session.variance, 'cash register session variance')) },
    deviceBindings: validateDeviceBindings(session.deviceBindings),
    ...session.offlineQueue === undefined ? {} : { offlineQueue: validateOfflineQueue(session.offlineQueue) },
    auditReceipts: session.auditReceipts.map(validateAuditReceiptDescriptor),
  };
}

function validateDeviceBindings(bindings: readonly CashRegisterDeviceBinding[]): CashRegisterDeviceBinding[] {
  return bindings.map((binding): CashRegisterDeviceBinding => {
    const kind = requireOneOf(binding.kind, DEVICE_BINDING_KINDS, 'cash register device binding kind');
    const capabilities = uniqueStrings(
      binding.capabilities.map((capability): string =>
        requireNonEmpty(capability, 'cash register device binding', 'capability')),
      'cash register device binding capabilities',
    );
    ensureCapabilitiesFitKind(kind, capabilities);
    return {
      deviceId: requireSafeId(binding.deviceId, 'cash register device binding deviceId'),
      kind,
      deviceWebId: requireHttpsUri(binding.deviceWebId, 'cash register device binding deviceWebId'),
      capabilities,
    };
  });
}

function ensureCapabilitiesFitKind(kind: CashRegisterDeviceBindingKind, capabilities: readonly string[]): void {
  const requiredPrefix = kind === 'pos-terminal' ? 'pos-terminal.' : `${kind}.`;
  for (const capability of capabilities) {
    if (!capability.startsWith(requiredPrefix)) {
      throw new BadRequestHttpError(`A ${kind} binding cannot advertise ${capability}.`);
    }
  }
}

function ensureUniqueDeviceBindings(bindings: readonly CashRegisterDeviceBinding[]): void {
  uniqueStrings(bindings.map((binding): string => binding.deviceId), 'cash register device binding deviceId');
  uniqueStrings(bindings.map((binding): string => binding.deviceWebId), 'cash register device binding deviceWebId');
}

function validateOperatorSession(session: NativePosOperatorSession, subject: string): NativePosOperatorSession {
  return {
    sessionId: requireSafeId(session.sessionId, `${subject} sessionId`),
    webId: requireHttpsUri(session.webId, `${subject} WebID`),
    roleIri: requireUri(session.roleIri, subject, 'roleIri'),
    startedAt: requireDate(session.startedAt, subject, 'startedAt'),
    ...session.expiresAt === undefined ? {} : { expiresAt: requireDate(session.expiresAt, subject, 'expiresAt') },
  };
}

function ensureSessionActiveAt(session: NativePosOperatorSession, timestamp: string): void {
  if (Date.parse(session.startedAt) > Date.parse(timestamp)) {
    throw new BadRequestHttpError('A cash register operator session must start before the register opens.');
  }
  if (session.expiresAt !== undefined && Date.parse(session.expiresAt) <= Date.parse(timestamp)) {
    throw new BadRequestHttpError('A cash register operator session must be active when the register opens.');
  }
}

function validateStorageLocation(
  storage: CashRegisterOfflineQueueDescriptor['storage'],
  value: string,
): string {
  if (storage === 'solid-container') {
    return requireUri(value, 'cash register offline queue', 'storageLocation');
  }
  const checked = requireNonEmpty(value, 'cash register offline queue', 'storageLocation');
  assertNoSensitiveInlineText(checked, 'cash register offline queue storageLocation');
  return checked;
}

function auditReceiptRecord(receipt: CashRegisterAuditReceiptDescriptor): Record<string, unknown> {
  return {
    [LD_TYPE]: 'DigitalDocument',
    [LD_ID]: receipt.receiptId,
    identifier: receipt.receiptId,
    additionalType: `${CMS_CONTEXT}${receipt.kind}`,
    dateCreated: receipt.issuedAt,
    creator: { [LD_ID]: receipt.issuerWebId },
    about: { [LD_ID]: receipt.subjectResource },
    encodingFormat: 'application/ld+json',
    sha256: receipt.payloadDigest,
    ...receipt.printableReceiptUrl === undefined ? {} : { url: receipt.printableReceiptUrl },
    ...receipt.digitalReceiptUrl === undefined ? {} : { sameAs: receipt.digitalReceiptUrl },
    additionalProperty: [
      ...receipt.relatedJobIds.map((jobId): Record<string, unknown> => propertyValue('relatedJobId', jobId)),
      ...receipt.evidenceResources.map((resource): Record<string, unknown> => propertyValue('evidence', resource)),
    ],
  };
}

function offlineQueueRecord(queue: CashRegisterOfflineQueueDescriptor): Record<string, unknown> {
  return {
    [LD_TYPE]: 'Action',
    [LD_ID]: queue.queueId,
    name: 'POS offline queue',
    actionStatus: queue.pendingCount > 0 ?
      'https://schema.org/ActiveActionStatus' :
      'https://schema.org/CompletedActionStatus',
    target: queue.storageLocation,
    additionalProperty: [
      propertyValue('storage', queue.storage),
      propertyValue('replayPolicy', queue.replayPolicy),
      propertyValue('maxRetentionSeconds', String(queue.maxRetentionSeconds)),
      propertyValue('pendingCount', String(queue.pendingCount)),
      ...queue.entries.map((entry): Record<string, unknown> => ({
        [LD_TYPE]: 'PropertyValue',
        name: entry.operation,
        value: entry.payloadDigest,
        identifier: entry.entryId,
        additionalProperty: [
          propertyValue('targetResource', entry.targetResource),
          propertyValue('idempotencyKey', entry.idempotencyKey),
          propertyValue('status', entry.status),
          propertyValue('retryCount', String(entry.retryCount)),
        ],
      })),
    ],
  };
}

function propertyValue(name: string, value: string): Record<string, unknown> {
  return { [LD_TYPE]: 'PropertyValue', name, value };
}

function sessionSubject(sessionId: string): string {
  return `urn:solid-server:databox:cms:pos:cash-register-session:${encodeURIComponent(sessionId)}`;
}

function requireHttpsUri(value: string, field: string): string {
  const uri = requireUri(value, field, 'value');
  if (new URL(uri).protocol !== 'https:') {
    throw new BadRequestHttpError(`A ${field} must be an HTTPS URI.`);
  }
  return uri;
}

function requireSafeId(value: string, field: string): string {
  const checked = requireNonEmpty(value, 'cash register', field);
  if (!/^[\w.:-]+$/u.test(checked)) {
    throw new BadRequestHttpError(`A cash register ${field} must be a safe id.`);
  }
  return checked;
}

function requireOneOf<T extends string>(value: string, allowed: readonly T[], field: string): T {
  if (!(allowed as readonly string[]).includes(value)) {
    throw new BadRequestHttpError(`A ${field} must be one of: ${allowed.join(', ')}.`);
  }
  return value as T;
}

function requireFinite(value: number, field: string): number {
  if (!Number.isFinite(value)) {
    throw new BadRequestHttpError(`A ${field} must be finite.`);
  }
  return value;
}

function requireSha256Urn(value: string, field: string): string {
  const checked = requireNonEmpty(value, 'cash register', field);
  if (!/^urn:sha256:[a-f0-9]{64}$/u.test(checked)) {
    throw new BadRequestHttpError(`A ${field} must be a lowercase urn:sha256 digest.`);
  }
  return checked;
}

function uniqueStrings(values: readonly string[], field: string): string[] {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) {
      throw new BadRequestHttpError(`A ${field} must not contain duplicates.`);
    }
    seen.add(value);
  }
  return [ ...values ];
}

function assertNoSensitiveInlineText(value: string, field: string): void {
  if (SECRET_PATTERN.test(value) || CARD_DATA_PATTERN.test(value)) {
    throw new BadRequestHttpError(`A ${field} must not inline secrets, credentials, or card data.`);
  }
}
