import { BadRequestHttpError } from '../../../../util/errors/BadRequestHttpError';
import type { SolidModuleManifest } from '../../SolidModuleManifest';
import {
  LD_CONTEXT,
  LD_ID,
  LD_TYPE,
  requireDate,
  requireNonEmpty,
  requireNonNegativeInteger,
  requireOptionalUri,
  requireUri,
} from './PosValidation';

const SCHEMA_CONTEXT = 'https://schema.org/';
const CMS_CONTEXT = 'urn:solid-server:databox:cms#';
const POS_CONTEXT = 'urn:solid-server:databox:cms:pos#';
// The JSON-LD `@vocab` keyword as a constant (the linter forbids `@`-prefixed object-literal keys).
const LD_VOCAB = '@vocab';

const TABLE_SESSION_STATES = [
  'available',
  'occupied',
  'ordering',
  'served',
  'cleaning',
] as const;

export type TableSessionState = typeof TABLE_SESSION_STATES[number];

export interface TableSessionInput {
  readonly sessionId: string;
  readonly tableId: string;
  readonly tableLabel: string;
  readonly state: TableSessionState;
  readonly shopId: string;
  readonly startedAt: string;
  readonly endedAt?: string;
  readonly assignedStaff?: string;
  readonly customerCount?: number;
  readonly wifiOnboarding?: TableSessionWifiOnboardingInput;
  readonly linkedOrderIds?: readonly string[];
  readonly note?: string;
}

export interface TableSessionCloseInput {
  readonly session: TableSession;
  readonly endedAt: string;
  readonly targetState?: 'available' | 'cleaning';
}

export interface TableSessionWifiOnboardingInput {
  readonly landingUrl: string;
  readonly qrUrl: string;
  readonly appInstallUrl?: string;
  readonly solidVaultConnectUrl?: string;
  readonly networkSsid?: string;
}

export interface TableSession {
  readonly sessionId: string;
  readonly tableId: string;
  readonly tableLabel: string;
  readonly state: TableSessionState;
  readonly shopId: string;
  readonly startedAt: string;
  readonly endedAt?: string;
  readonly assignedStaff?: string;
  readonly customerCount?: number;
  readonly wifiOnboarding?: TableSessionWifiOnboarding;
  readonly linkedOrderIds: readonly string[];
  readonly note?: string;
}

export interface TableSessionWifiOnboarding {
  readonly landingUrl: string;
  readonly qrUrl: string;
  readonly appInstallUrl?: string;
  readonly solidVaultConnectUrl?: string;
  readonly networkSsid?: string;
}

export interface TableSessionResult {
  readonly session: TableSession;
  readonly record: Record<string, unknown>;
}

export const TABLE_SESSION_MODULE_MANIFEST: SolidModuleManifest = {
  id: 'pos.table-sessions',
  name: 'Table Sessions',
  version: '0.1.0',
  description:
    'Portable POS table session lifecycle — Wi-Fi onboarding, customer arrival, QR self-order, ' +
    'and table state transitions persisted as Solid resources.',
  capabilities: [
    'pos:table-session',
    'pos:table-session-lifecycle',
    'pos:wifi-onboarding',
    'cms:portable-core-pos-table-session',
    'cms:css-enhanced-table-session-store',
  ],
  routes: [
    'POST /.databox/cms/pos/tables/sessions',
    'POST /.databox/cms/pos/tables/sessions/close',
    'GET /.databox/cms/pos/tables/sessions',
    'POST /.databox/cms/pos/wifi-onboarding',
    'GET /.databox/cms/pos/wifi-onboarding',
  ],
  adminUi: {
    navLabel: 'Table Sessions',
    path: '/pos/tables',
  },
};

/**
 * Create or update a table session. This validates all fields and produces a normalised
 * {@link TableSession} plus a schema.org JSON-LD record (`@type: FoodEstablishmentReservation`)
 * that round-trips as real RDF and is readable through plain LDP.
 */
export function openTableSession(input: TableSessionInput): TableSessionResult {
  const session = normalizeTableSession(input);
  return { session, record: toTableSessionRecord(session) };
}

/**
 * Close (or transition to cleaning) an existing table session. Validates that the session is
 * in a closable state and that `endedAt` is not before `startedAt`.
 */
export function closeTableSession(input: TableSessionCloseInput): TableSessionResult {
  const source = normalizeTableSession(input.session);
  if (source.state === 'available') {
    throw new BadRequestHttpError('A table session cannot be closed from the available state.');
  }
  if (source.endedAt !== undefined) {
    throw new BadRequestHttpError('A table session that has already ended cannot be closed again.');
  }
  const endedAt = requireDate(input.endedAt, 'table session', 'endedAt');
  if (Date.parse(endedAt) < Date.parse(source.startedAt)) {
    throw new BadRequestHttpError('A table session endedAt must not be before startedAt.');
  }
  const targetState = input.targetState ?? 'available';
  requireOneOf(targetState, [ 'available', 'cleaning' ], 'table session close targetState');
  const session: TableSession = {
    ...source,
    state: targetState,
    endedAt,
  };
  return { session, record: toTableSessionRecord(session) };
}

/**
 * Build a standalone Wi-Fi onboarding JSON-LD record (not embedded in an ordering flow).
 * The caller provides an `id` IRI that becomes the document's `@id`; the record is a
 * `schema:EntryPoint` identical to the one produced by the ordering flow's
 * `buildShopWifiOnboardingDescriptor`, but can be persisted independently.
 */
export function buildStandaloneWifiOnboarding(input: {
  readonly id: string;
  readonly tableSession: string;
  readonly landingUrl: string;
  readonly qrUrl: string;
  readonly appInstallUrl?: string;
  readonly solidVaultConnectUrl?: string;
  readonly networkSsid?: string;
}): Record<string, unknown> {
  const id = requireUri(input.id, 'Wi-Fi onboarding', 'id');
  const tableSession = requireUri(input.tableSession, 'Wi-Fi onboarding', 'tableSession');
  const landingUrl = requireUri(input.landingUrl, 'Wi-Fi onboarding', 'landingUrl');
  const qrUrl = requireUri(input.qrUrl, 'Wi-Fi onboarding', 'qrUrl');
  const appInstallUrl = requireOptionalUri(input.appInstallUrl, 'Wi-Fi onboarding', 'appInstallUrl');
  const solidVaultConnectUrl =
    requireOptionalUri(input.solidVaultConnectUrl, 'Wi-Fi onboarding', 'solidVaultConnectUrl');

  return {
    [LD_CONTEXT]: {
      [LD_VOCAB]: SCHEMA_CONTEXT,
      solid: 'http://www.w3.org/ns/solid/terms#',
      cms: CMS_CONTEXT,
      pos: POS_CONTEXT,
    },
    [LD_TYPE]: 'EntryPoint',
    [LD_ID]: id,
    url: landingUrl,
    actionPlatform: 'Web',
    encodingType: 'text/html',
    contentUrl: qrUrl,
    potentialAction: {
      [LD_TYPE]: 'OrderAction',
      target: {
        [LD_TYPE]: 'EntryPoint',
        urlTemplate: landingUrl,
      },
      object: { [LD_ID]: tableSession },
    },
    additionalProperty: [
      propertyValue('tableSession', tableSession),
      propertyValue('qrUrl', qrUrl),
      ...input.networkSsid === undefined ?
          [] :
          [ propertyValue('networkSsid', requireNonEmpty(input.networkSsid, 'Wi-Fi onboarding', 'networkSsid')) ],
      ...appInstallUrl === undefined ?
          [] :
          [ propertyValue('appInstallUrl', appInstallUrl) ],
      ...solidVaultConnectUrl === undefined ?
          [] :
          [ propertyValue('solidVaultConnectUrl', solidVaultConnectUrl) ],
    ],
  };
}

function normalizeTableSession(input: TableSessionInput | TableSession): TableSession {
  const sessionId = requireSafeId(input.sessionId, 'table session sessionId');
  const tableId = requireSafeId(input.tableId, 'table session tableId');
  const tableLabel = requireNonEmpty(input.tableLabel, 'table session', 'tableLabel');
  const state = requireOneOf(input.state, TABLE_SESSION_STATES, 'table session state');
  const shopId = requireUri(input.shopId, 'table session', 'shopId');
  const startedAt = requireDate(input.startedAt, 'table session', 'startedAt');
  const assignedStaff = input.assignedStaff === undefined ?
    undefined :
      requireUri(input.assignedStaff, 'table session', 'assignedStaff');
  const customerCount = input.customerCount === undefined ?
    undefined :
      requireNonNegativeInteger(input.customerCount, 'table session', 'customerCount');
  const linkedOrderIds = (input.linkedOrderIds ?? []).map(
    (orderId): string => requireUri(orderId, 'table session', 'linkedOrderId'),
  );
  const note = input.note === undefined ?
    undefined :
      requireNonEmpty(input.note, 'table session', 'note');

  const wifiOnboarding = normalizeWifiOnboarding(
    'wifiOnboarding' in input ? input.wifiOnboarding : undefined,
  );

  return {
    sessionId,
    tableId,
    tableLabel,
    state,
    shopId,
    startedAt,
    ...input.endedAt === undefined ?
        {} :
        { endedAt: requireDate(input.endedAt, 'table session', 'endedAt') },
    ...assignedStaff === undefined ? {} : { assignedStaff },
    ...customerCount === undefined ? {} : { customerCount },
    ...wifiOnboarding === undefined ? {} : { wifiOnboarding },
    linkedOrderIds,
    ...note === undefined ? {} : { note },
  };
}

function normalizeWifiOnboarding(
  input: TableSessionWifiOnboardingInput | TableSessionWifiOnboarding | undefined,
): TableSessionWifiOnboarding | undefined {
  if (input === undefined) {
    return undefined;
  }
  const landingUrl = requireUri(input.landingUrl, 'table session Wi-Fi onboarding', 'landingUrl');
  const qrUrl = requireUri(input.qrUrl, 'table session Wi-Fi onboarding', 'qrUrl');
  return {
    landingUrl,
    qrUrl,
    ...input.appInstallUrl === undefined ?
        {} :
        { appInstallUrl: requireUri(input.appInstallUrl, 'table session Wi-Fi onboarding', 'appInstallUrl') },
    ...input.solidVaultConnectUrl === undefined ?
        {} :
        {
          solidVaultConnectUrl: requireUri(
            input.solidVaultConnectUrl,
            'table session Wi-Fi onboarding',
            'solidVaultConnectUrl',
          ),
        },
    ...input.networkSsid === undefined ?
        {} :
        { networkSsid: requireNonEmpty(input.networkSsid, 'table session Wi-Fi onboarding', 'networkSsid') },
  };
}

function toTableSessionRecord(session: TableSession): Record<string, unknown> {
  return {
    [LD_CONTEXT]: {
      [LD_VOCAB]: SCHEMA_CONTEXT,
      cms: CMS_CONTEXT,
      pos: POS_CONTEXT,
    },
    [LD_TYPE]: 'FoodEstablishmentReservation',
    [LD_ID]: tableSessionSubject(session.sessionId),
    identifier: session.sessionId,
    reservationFor: { [LD_ID]: session.shopId },
    reservationStatus: reservationStatus(session.state),
    startDate: session.startedAt,
    ...session.endedAt === undefined ? {} : { endDate: session.endedAt },
    additionalProperty: [
      propertyValue('tableId', session.tableId),
      propertyValue('tableLabel', session.tableLabel),
      propertyValue('state', session.state),
      ...session.assignedStaff === undefined ?
          [] :
          [{ [LD_TYPE]: 'PropertyValue', name: 'assignedStaff', value: session.assignedStaff }],
      ...session.customerCount === undefined ?
          [] :
          [ propertyValue('customerCount', String(session.customerCount)) ],
      ...session.note === undefined ?
          [] :
          [ propertyValue('note', session.note) ],
      ...session.linkedOrderIds.map(
        (orderId): Record<string, unknown> => propertyValue('linkedOrderId', orderId),
      ),
    ],
    ...session.wifiOnboarding === undefined ?
        {} :
        {
          potentialAction: {
            [LD_TYPE]: 'OrderAction',
            target: {
              [LD_TYPE]: 'EntryPoint',
              url: session.wifiOnboarding.landingUrl,
              contentUrl: session.wifiOnboarding.qrUrl,
            },
            additionalProperty: [
              ...session.wifiOnboarding.networkSsid === undefined ?
                  [] :
                  [ propertyValue('networkSsid', session.wifiOnboarding.networkSsid) ],
              ...session.wifiOnboarding.appInstallUrl === undefined ?
                  [] :
                  [ propertyValue('appInstallUrl', session.wifiOnboarding.appInstallUrl) ],
              ...session.wifiOnboarding.solidVaultConnectUrl === undefined ?
                  [] :
                  [ propertyValue('solidVaultConnectUrl', session.wifiOnboarding.solidVaultConnectUrl) ],
            ],
          },
        },
  };
}

function reservationStatus(state: TableSessionState): string {
  switch (state) {
    case 'available': return 'https://schema.org/ReservationConfirmed';
    case 'occupied': return 'https://schema.org/ReservationConfirmed';
    case 'ordering': return 'https://schema.org/ReservationPending';
    case 'served': return 'https://schema.org/ReservationConfirmed';
    case 'cleaning': return 'https://schema.org/ReservationCancelled';
    default:
      throw new Error(`Unknown TableSessionState: ${state as string}`);
  }
}

function tableSessionSubject(sessionId: string): string {
  return `urn:solid-server:databox:cms:pos:table-session:${encodeURIComponent(sessionId)}`;
}

function propertyValue(name: string, value: string): Record<string, unknown> {
  return { [LD_TYPE]: 'PropertyValue', name, value };
}

function requireSafeId(value: string, field: string): string {
  const checked = requireNonEmpty(value, 'table session', field);
  if (!/^[\w.:-]+$/u.test(checked)) {
    throw new BadRequestHttpError(`A table session ${field} must be a safe id.`);
  }
  return checked;
}

function requireOneOf<T extends string>(value: string, allowed: readonly T[], field: string): T {
  if (!(allowed as readonly string[]).includes(value)) {
    throw new BadRequestHttpError(`A ${field} must be one of: ${allowed.join(', ')}.`);
  }
  return value as T;
}
