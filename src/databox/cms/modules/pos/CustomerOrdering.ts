import { BadRequestHttpError } from '../../../../util/errors/BadRequestHttpError';
import type {
  CartLineInput,
  CartRecordResult,
  CartState,
} from './Cart';
import {
  buildCartRecord,
} from './Cart';
import type {
  PosOrderRecordLineInput,
  PosOrderRecordResult,
  PosOrderRecordState,
} from './Order';
import {
  buildOrderRecord,
} from './Order';
import type {
  PosTicketRecordResult,
  PosTicketServiceMode,
  PosTicketState,
} from './Ticket';
import {
  buildTicketStateRecord,
} from './Ticket';
import {
  LD_CONTEXT,
  LD_ID,
  LD_TYPE,
  requireCurrency,
  requireDate,
  requireNonEmpty,
  requireOptionalUri,
  requireUri,
} from './PosValidation';

export type CustomerOrderingChannel = 'waiter' | 'customer-self-order';
export type CustomerVaultConnectionMode = 'anonymous-table-session' | 'solid-vault-linked';

export interface CustomerOrderingLineInput {
  readonly lineId: string;
  readonly product: string;
  readonly name: string;
  readonly quantity: number;
  readonly unitPrice: number;
  readonly sku?: string;
  readonly lineDiscount?: number;
  readonly station?: string;
}

export interface ShopWifiOnboardingInput {
  readonly id: string;
  readonly tableSession: string;
  readonly landingUrl: string;
  readonly qrUrl: string;
  readonly appInstallUrl?: string;
  readonly solidVaultConnectUrl?: string;
  readonly networkSsid?: string;
}

export interface CustomerVaultConnectionInput {
  readonly mode: CustomerVaultConnectionMode;
  readonly connectUrl?: string;
  readonly customerWebId?: string;
  readonly customerStorage?: string;
  readonly disclosedClaims?: readonly string[];
  readonly withheldClaims?: readonly string[];
  readonly consentReceipt?: string;
}

export interface CustomerOrderingFlowInput {
  readonly channel: CustomerOrderingChannel;
  readonly cartId: string;
  readonly orderId: string;
  readonly ticketId: string;
  readonly orderNumber: string;
  readonly ticketNumber: string;
  readonly seller: string;
  readonly currency: string;
  readonly createdAt: string;
  readonly updatedAt?: string;
  readonly lines: readonly CustomerOrderingLineInput[];
  readonly serviceMode: PosTicketServiceMode;
  readonly tableSession?: string;
  readonly tableLabel?: string;
  readonly waiterWebId?: string;
  readonly customer?: CustomerVaultConnectionInput;
  readonly onboarding?: ShopWifiOnboardingInput;
  readonly note?: string;
  readonly requireStaffReview?: boolean;
}

export interface CustomerOrderingResourceDescriptor {
  readonly iri: string;
  readonly role: 'cart' | 'order' | 'ticket' | 'shop-wifi-onboarding' | 'customer-vault-connection';
  readonly contentType: 'application/ld+json';
  readonly record: Record<string, unknown>;
}

export interface CustomerOrderingFlow {
  readonly channel: CustomerOrderingChannel;
  readonly status: 'ready-for-fulfilment' | 'requires-staff-review';
  readonly cart: CartRecordResult;
  readonly order: PosOrderRecordResult;
  readonly ticket: PosTicketRecordResult;
  readonly onboarding?: Record<string, unknown>;
  readonly vaultConnection?: Record<string, unknown>;
  readonly resources: readonly CustomerOrderingResourceDescriptor[];
  readonly intent: Record<string, unknown>;
}

export function buildWaiterOrderingFlow(
  input: Omit<CustomerOrderingFlowInput, 'channel' | 'requireStaffReview'>,
): CustomerOrderingFlow {
  return buildCustomerOrderingFlow({
    ...input,
    channel: 'waiter',
    requireStaffReview: false,
  });
}

export function buildCustomerSelfOrderingFlow(
  input: Omit<CustomerOrderingFlowInput, 'channel'>,
): CustomerOrderingFlow {
  return buildCustomerOrderingFlow({
    ...input,
    channel: 'customer-self-order',
    requireStaffReview: input.requireStaffReview ?? true,
  });
}

export function buildCustomerOrderingFlow(input: CustomerOrderingFlowInput): CustomerOrderingFlow {
  const channel = requireChannel(input.channel);
  const cartId = requireUri(input.cartId, 'customer ordering flow', 'cartId');
  const orderId = requireUri(input.orderId, 'customer ordering flow', 'orderId');
  const ticketId = requireUri(input.ticketId, 'customer ordering flow', 'ticketId');
  const seller = requireUri(input.seller, 'customer ordering flow', 'seller');
  const currency = requireCurrency(input.currency, 'customer ordering flow');
  const createdAt = requireDate(input.createdAt, 'customer ordering flow', 'createdAt');
  const updatedAt = input.updatedAt === undefined ?
    createdAt :
      requireDate(input.updatedAt, 'customer ordering flow', 'updatedAt');
  const tableSession = requireOptionalUri(input.tableSession, 'customer ordering flow', 'tableSession');
  const customerWebId = input.customer?.customerWebId === undefined ?
    undefined :
      requireUri(input.customer.customerWebId, 'customer ordering flow', 'customerWebId');
  const reviewRequired = channel === 'customer-self-order' && input.requireStaffReview !== false;
  const status = reviewRequired ? 'requires-staff-review' : 'ready-for-fulfilment';
  const lines = input.lines.map(normalizeFlowLine);
  const note = input.note === undefined ? undefined : requireNonEmpty(input.note, 'customer ordering flow', 'note');

  const cart = buildCartRecord({
    id: cartId,
    state: cartStateFor(status),
    currency,
    updatedAt,
    lines: lines.map(toCartLine),
    ...customerWebId === undefined ? {} : { customer: customerWebId },
  });
  const order = buildOrderRecord({
    id: orderId,
    orderNumber: requireNonEmpty(input.orderNumber, 'customer ordering flow', 'orderNumber'),
    state: orderStateFor(status),
    seller,
    ...customerWebId === undefined ? {} : { customer: customerWebId },
    currency,
    createdAt,
    updatedAt,
    lines: lines.map(toOrderLine),
  });
  const ticket = buildTicketStateRecord({
    id: ticketId,
    order: orderId,
    ticketNumber: requireNonEmpty(input.ticketNumber, 'customer ordering flow', 'ticketNumber'),
    state: ticketStateFor(status),
    serviceMode: input.serviceMode,
    openedAt: createdAt,
    updatedAt,
    lines: lines.map((line): {
      readonly lineId: string;
      readonly name: string;
      readonly quantity: number;
      readonly state: 'queued';
      readonly station?: string;
    } => ({
      lineId: line.lineId,
      name: line.name,
      quantity: line.quantity,
      state: 'queued',
      ...line.station === undefined ? {} : { station: line.station },
    })),
    ...input.tableLabel === undefined ? {} : { label: input.tableLabel },
  });
  const onboarding = input.onboarding === undefined ?
    undefined :
      buildShopWifiOnboardingDescriptor(input.onboarding);
  const vaultConnection = input.customer === undefined ?
    undefined :
      buildCustomerVaultConnectionDescriptor(input.customer);
  const resources = orderingResources({
    cartId,
    orderId,
    ticketId,
    cart: cart.record,
    order: order.record,
    ticket: ticket.record,
    onboarding,
    vaultConnection,
  });

  return {
    channel,
    status,
    cart,
    order,
    ticket,
    ...onboarding === undefined ? {} : { onboarding },
    ...vaultConnection === undefined ? {} : { vaultConnection },
    resources,
    intent: buildOrderingIntent({
      channel,
      status,
      cartId,
      orderId,
      ticketId,
      seller,
      tableSession,
      waiterWebId: input.waiterWebId,
      customerWebId,
      note,
      resources,
    }),
  };
}

export function buildShopWifiOnboardingDescriptor(input: ShopWifiOnboardingInput): Record<string, unknown> {
  const id = requireUri(input.id, 'shop Wi-Fi onboarding', 'id');
  const tableSession = requireUri(input.tableSession, 'shop Wi-Fi onboarding', 'tableSession');
  const landingUrl = requireUri(input.landingUrl, 'shop Wi-Fi onboarding', 'landingUrl');
  const qrUrl = requireUri(input.qrUrl, 'shop Wi-Fi onboarding', 'qrUrl');
  const appInstallUrl = requireOptionalUri(input.appInstallUrl, 'shop Wi-Fi onboarding', 'appInstallUrl');
  const solidVaultConnectUrl =
    requireOptionalUri(input.solidVaultConnectUrl, 'shop Wi-Fi onboarding', 'solidVaultConnectUrl');

  return {
    [LD_CONTEXT]: {
      schema: 'https://schema.org/',
      solid: 'http://www.w3.org/ns/solid/terms#',
      cms: 'urn:solid-server:databox:cms#',
      pos: 'urn:solid-server:databox:cms:pos#',
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
      { [LD_TYPE]: 'PropertyValue', name: 'tableSession', value: tableSession },
      { [LD_TYPE]: 'PropertyValue', name: 'qrUrl', value: qrUrl },
      ...input.networkSsid === undefined ?
          [] :
          [
            {
              [LD_TYPE]: 'PropertyValue',
              name: 'networkSsid',
              value: requireNonEmpty(input.networkSsid, 'shop Wi-Fi onboarding', 'networkSsid'),
            },
          ],
      ...appInstallUrl === undefined ?
          [] :
          [{ [LD_TYPE]: 'PropertyValue', name: 'appInstallUrl', value: appInstallUrl }],
      ...solidVaultConnectUrl === undefined ?
          [] :
          [{ [LD_TYPE]: 'PropertyValue', name: 'solidVaultConnectUrl', value: solidVaultConnectUrl }],
    ],
  };
}

export function buildCustomerVaultConnectionDescriptor(input: CustomerVaultConnectionInput): Record<string, unknown> {
  const customerWebId = requireOptionalUri(input.customerWebId, 'customer vault connection', 'customerWebId');
  const customerStorage = requireOptionalUri(input.customerStorage, 'customer vault connection', 'customerStorage');
  const connectUrl = requireOptionalUri(input.connectUrl, 'customer vault connection', 'connectUrl');
  const consentReceipt = requireOptionalUri(input.consentReceipt, 'customer vault connection', 'consentReceipt');
  const disclosedClaims = (input.disclosedClaims ?? []).map((claim): string =>
    requireNonEmpty(claim, 'customer vault connection', 'disclosedClaims'));
  const withheldClaims = (input.withheldClaims ?? [
    'legal identity',
    'raw medical details',
    'full customer pod',
  ]).map((claim): string => requireNonEmpty(claim, 'customer vault connection', 'withheldClaims'));

  if (input.mode === 'solid-vault-linked' && customerWebId === undefined) {
    throw new BadRequestHttpError('A linked customer Solid vault connection requires a customerWebId.');
  }

  return {
    [LD_CONTEXT]: {
      schema: 'https://schema.org/',
      solid: 'http://www.w3.org/ns/solid/terms#',
      odrl: 'http://www.w3.org/ns/odrl/2/',
      dpv: 'https://w3id.org/dpv#',
      cms: 'urn:solid-server:databox:cms#',
      pos: 'urn:solid-server:databox:cms:pos#',
    },
    [LD_TYPE]: 'AuthorizeAction',
    actionStatus: input.mode === 'solid-vault-linked' ? 'CompletedActionStatus' : 'PotentialActionStatus',
    name: input.mode,
    ...customerWebId === undefined ? {} : { agent: { [LD_ID]: customerWebId }},
    ...customerStorage === undefined ? {} : { object: { [LD_ID]: customerStorage }},
    ...connectUrl === undefined ?
        {} :
        {
          target: {
            [LD_TYPE]: 'EntryPoint',
            urlTemplate: connectUrl,
          },
        },
    ...consentReceipt === undefined ? {} : { result: { [LD_ID]: consentReceipt }},
    additionalProperty: [
      { [LD_TYPE]: 'PropertyValue', name: 'connectionMode', value: input.mode },
      ...disclosedClaims.map((claim): Record<string, unknown> => ({
        [LD_TYPE]: 'PropertyValue',
        name: 'disclosedClaim',
        value: claim,
      })),
      ...withheldClaims.map((claim): Record<string, unknown> => ({
        [LD_TYPE]: 'PropertyValue',
        name: 'withheldClaim',
        value: claim,
      })),
    ],
  };
}

interface NormalizedFlowLine extends CustomerOrderingLineInput {
  readonly product: string;
  readonly quantity: number;
  readonly unitPrice: number;
  readonly lineDiscount: number;
}

function normalizeFlowLine(line: CustomerOrderingLineInput): NormalizedFlowLine {
  return {
    lineId: requireNonEmpty(line.lineId, 'customer ordering line', 'lineId'),
    product: requireUri(line.product, 'customer ordering line', 'product'),
    name: requireNonEmpty(line.name, 'customer ordering line', 'name'),
    quantity: line.quantity,
    unitPrice: line.unitPrice,
    ...line.sku === undefined ? {} : { sku: requireNonEmpty(line.sku, 'customer ordering line', 'sku') },
    lineDiscount: line.lineDiscount ?? 0,
    ...line.station === undefined ?
        {} :
        { station: requireNonEmpty(line.station, 'customer ordering line', 'station') },
  };
}

function toCartLine(line: NormalizedFlowLine): CartLineInput {
  return {
    lineId: line.lineId,
    product: line.product,
    name: line.name,
    quantity: line.quantity,
    unitPrice: line.unitPrice,
    ...line.sku === undefined ? {} : { sku: line.sku },
    lineDiscount: line.lineDiscount,
  };
}

function toOrderLine(line: NormalizedFlowLine): PosOrderRecordLineInput {
  return {
    lineId: line.lineId,
    product: line.product,
    name: line.name,
    quantity: line.quantity,
    unitPrice: line.unitPrice,
    ...line.sku === undefined ? {} : { sku: line.sku },
    lineDiscount: line.lineDiscount,
  };
}

function cartStateFor(status: CustomerOrderingFlow['status']): CartState {
  return status === 'requires-staff-review' ? 'held' : 'submitted';
}

function orderStateFor(status: CustomerOrderingFlow['status']): PosOrderRecordState {
  return status === 'requires-staff-review' ? 'held' : 'open';
}

function ticketStateFor(status: CustomerOrderingFlow['status']): PosTicketState {
  return status === 'requires-staff-review' ? 'held' : 'sentToFulfilment';
}

function requireChannel(channel: CustomerOrderingChannel): CustomerOrderingChannel {
  if (channel !== 'waiter' && channel !== 'customer-self-order') {
    throw new BadRequestHttpError('A customer ordering flow channel must be waiter or customer-self-order.');
  }
  return channel;
}

function orderingResources(input: {
  readonly cartId: string;
  readonly orderId: string;
  readonly ticketId: string;
  readonly cart: Record<string, unknown>;
  readonly order: Record<string, unknown>;
  readonly ticket: Record<string, unknown>;
  readonly onboarding?: Record<string, unknown>;
  readonly vaultConnection?: Record<string, unknown>;
}): readonly CustomerOrderingResourceDescriptor[] {
  return [
    { iri: input.cartId, role: 'cart', contentType: 'application/ld+json', record: input.cart },
    { iri: input.orderId, role: 'order', contentType: 'application/ld+json', record: input.order },
    { iri: input.ticketId, role: 'ticket', contentType: 'application/ld+json', record: input.ticket },
    ...input.onboarding === undefined ?
        [] :
        [{
          iri: String(input.onboarding[LD_ID]),
          role: 'shop-wifi-onboarding' as const,
          contentType: 'application/ld+json' as const,
          record: input.onboarding,
        }],
    ...input.vaultConnection === undefined ?
        [] :
        [{
          iri: `${input.orderId}#customer-vault-connection`,
          role: 'customer-vault-connection' as const,
          contentType: 'application/ld+json' as const,
          record: input.vaultConnection,
        }],
  ];
}

function buildOrderingIntent(input: {
  readonly channel: CustomerOrderingChannel;
  readonly status: CustomerOrderingFlow['status'];
  readonly cartId: string;
  readonly orderId: string;
  readonly ticketId: string;
  readonly seller: string;
  readonly tableSession?: string;
  readonly waiterWebId?: string;
  readonly customerWebId?: string;
  readonly note?: string;
  readonly resources: readonly CustomerOrderingResourceDescriptor[];
}): Record<string, unknown> {
  return {
    [LD_CONTEXT]: {
      schema: 'https://schema.org/',
      solid: 'http://www.w3.org/ns/solid/terms#',
      odrl: 'http://www.w3.org/ns/odrl/2/',
      cms: 'urn:solid-server:databox:cms#',
      pos: 'urn:solid-server:databox:cms:pos#',
    },
    [LD_TYPE]: 'Action',
    name: 'POS ordering lifecycle commit',
    actionStatus: input.status === 'ready-for-fulfilment' ? 'PotentialActionStatus' : 'ActiveActionStatus',
    object: [
      { [LD_ID]: input.cartId, [LD_TYPE]: 'ItemList' },
      { [LD_ID]: input.orderId, [LD_TYPE]: 'Order' },
      { [LD_ID]: input.ticketId, [LD_TYPE]: 'Action' },
    ],
    participant: [
      { [LD_TYPE]: 'Organization', [LD_ID]: input.seller },
      ...input.waiterWebId === undefined ? [] : [{ [LD_TYPE]: 'Person', [LD_ID]: input.waiterWebId }],
      ...input.customerWebId === undefined ? [] : [{ [LD_TYPE]: 'Person', [LD_ID]: input.customerWebId }],
    ],
    additionalProperty: [
      { [LD_TYPE]: 'PropertyValue', name: 'channel', value: input.channel },
      { [LD_TYPE]: 'PropertyValue', name: 'status', value: input.status },
      ...input.tableSession === undefined ?
          [] :
          [{ [LD_TYPE]: 'PropertyValue', name: 'tableSession', value: input.tableSession }],
      ...input.note === undefined ?
          [] :
          [{ [LD_TYPE]: 'PropertyValue', name: 'staffNote', value: input.note }],
      ...input.resources.map((resource): Record<string, unknown> => ({
        [LD_TYPE]: 'PropertyValue',
        name: resource.role,
        value: resource.iri,
      })),
    ],
  };
}
