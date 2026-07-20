import {
  buildCustomerSelfOrderingFlow,
  buildShopWifiOnboardingDescriptor,
  buildWaiterOrderingFlow,
} from '../../../../../../src/databox/cms/modules/pos/CustomerOrdering';

function record(value: unknown): Record<string, unknown> {
  return value as Record<string, unknown>;
}

function records(value: unknown): Record<string, unknown>[] {
  return value as Record<string, unknown>[];
}

const line = {
  lineId: 'line-1',
  product: 'https://shop.example/catalogue/flat-white.ttl#item',
  sku: 'FLAT-WHITE',
  name: 'Flat white',
  quantity: 2,
  unitPrice: 4.8,
  station: 'bar',
};

const base = {
  cartId: 'https://shop.example/pos/carts/c-1',
  orderId: 'https://shop.example/pos/orders/o-1',
  ticketId: 'https://shop.example/pos/tickets/t-1',
  orderNumber: 'O-1',
  ticketNumber: 'T-1',
  seller: 'https://shop.example/profile/card#org',
  currency: 'aud',
  createdAt: '2026-07-19T11:00:00.000Z',
  updatedAt: '2026-07-19T11:01:00.000Z',
  lines: [ line ],
  serviceMode: 'table' as const,
  tableSession: 'https://shop.example/pos/table-sessions/t4',
  tableLabel: 'Table 4',
};

describe('buildWaiterOrderingFlow', (): void => {
  it('commits a waiter-created order through canonical cart, order, and ticket resources.', (): void => {
    const flow = buildWaiterOrderingFlow({
      ...base,
      waiterWebId: 'https://staff.example/alice#me',
      note: 'Oat milk confirmed.',
    });

    expect(flow.channel).toBe('waiter');
    expect(flow.status).toBe('ready-for-fulfilment');
    expect(flow.resources.map((resource): string => resource.role)).toEqual([ 'cart', 'order', 'ticket' ]);
    expect(flow.resources.every((resource): boolean => resource.contentType === 'application/ld+json')).toBe(true);

    const cart = flow.cart.record;
    expect(cart['@type']).toBe('ItemList');
    expect(cart['@id']).toBe(base.cartId);
    expect(cart.numberOfItems).toBe(2);

    const order = flow.order.record;
    expect(order['@type']).toBe('Order');
    expect(order.id).toBe(base.orderId);
    expect(order.orderStatus).toBe('https://schema.org/OrderProcessing');
    expect(order.totalPaymentDue).toMatchObject({ price: '9.60', priceCurrency: 'AUD' });

    const ticket = flow.ticket.record;
    expect(ticket['@type']).toBe('Action');
    expect(record(ticket.object)['@id']).toBe(base.orderId);

    const participants = records(flow.intent.participant);
    expect(participants).toContainEqual({ '@type': 'Person', '@id': 'https://staff.example/alice#me' });
    expect(records(flow.intent.additionalProperty)).toEqual(expect.arrayContaining([
      { '@type': 'PropertyValue', name: 'cart', value: base.cartId },
      { '@type': 'PropertyValue', name: 'order', value: base.orderId },
      { '@type': 'PropertyValue', name: 'ticket', value: base.ticketId },
    ]));
  });
});

describe('buildCustomerSelfOrderingFlow', (): void => {
  it('holds anonymous self-orders for staff review without requiring a customer vault.', (): void => {
    const flow = buildCustomerSelfOrderingFlow({
      ...base,
      onboarding: {
        id: 'https://shop.example/pos/table-sessions/t4#onboarding',
        tableSession: base.tableSession,
        landingUrl: 'https://shop.example/order/t4',
        qrUrl: 'https://shop.example/qr/t4.png',
        appInstallUrl: 'https://shop.example/app',
        solidVaultConnectUrl: 'https://shop.example/connect-solid',
        networkSsid: 'Shop Guest',
      },
      customer: {
        mode: 'anonymous-table-session',
        connectUrl: 'https://shop.example/connect-solid',
        disclosedClaims: [ 'dietary constraint labels' ],
      },
    });

    expect(flow.channel).toBe('customer-self-order');
    expect(flow.status).toBe('requires-staff-review');
    expect(flow.resources.map((resource): string => resource.role)).toEqual([
      'cart',
      'order',
      'ticket',
      'shop-wifi-onboarding',
      'customer-vault-connection',
    ]);
    expect(flow.order.record.customer).toBeUndefined();

    const cartProperties = records(flow.cart.record.additionalProperty);
    expect(cartProperties).toContainEqual({ '@type': 'PropertyValue', name: 'cartState', value: 'held' });

    const orderProperties = records(flow.order.record.additionalProperty);
    expect(orderProperties).toContainEqual({ '@type': 'PropertyValue', name: 'state', value: 'held' });

    const onboarding = flow.onboarding ?? {};
    expect(onboarding['@type']).toBe('EntryPoint');
    expect(onboarding.contentUrl).toBe('https://shop.example/qr/t4.png');
    expect(records(onboarding.additionalProperty)).toContainEqual({
      '@type': 'PropertyValue',
      name: 'networkSsid',
      value: 'Shop Guest',
    });

    const vaultConnection = flow.vaultConnection ?? {};
    expect(vaultConnection['@type']).toBe('AuthorizeAction');
    expect(vaultConnection.actionStatus).toBe('PotentialActionStatus');
    expect(records(vaultConnection.additionalProperty)).toEqual(expect.arrayContaining([
      { '@type': 'PropertyValue', name: 'disclosedClaim', value: 'dietary constraint labels' },
      { '@type': 'PropertyValue', name: 'withheldClaim', value: 'legal identity' },
    ]));
  });

  it('links an optional customer Solid vault when a WebID is supplied.', (): void => {
    const flow = buildCustomerSelfOrderingFlow({
      ...base,
      requireStaffReview: false,
      customer: {
        mode: 'solid-vault-linked',
        customerWebId: 'https://customer.example/profile/card#me',
        customerStorage: 'https://customer.example/pod/',
        consentReceipt: 'https://shop.example/receipts/consent-1',
        disclosedClaims: [ 'receipt inbox', 'dietary constraint labels' ],
      },
    });

    expect(flow.status).toBe('ready-for-fulfilment');
    expect(record(flow.order.record.customer)['@id']).toBe('https://customer.example/profile/card#me');
    expect(record(flow.vaultConnection?.agent)['@id']).toBe('https://customer.example/profile/card#me');
    expect(record(flow.vaultConnection?.object)['@id']).toBe('https://customer.example/pod/');
    expect(record(flow.vaultConnection?.result)['@id']).toBe('https://shop.example/receipts/consent-1');
  });

  it('requires a WebID for linked Solid vault mode.', (): void => {
    expect((): unknown => buildCustomerSelfOrderingFlow({
      ...base,
      customer: { mode: 'solid-vault-linked' },
    })).toThrow('requires a customerWebId');
  });
});

describe('buildShopWifiOnboardingDescriptor', (): void => {
  it('rejects invalid onboarding links.', (): void => {
    expect((): unknown => buildShopWifiOnboardingDescriptor({
      id: 'https://shop.example/pos/table-sessions/t4#onboarding',
      tableSession: base.tableSession,
      landingUrl: 'not-a-url',
      qrUrl: 'https://shop.example/qr/t4.png',
    })).toThrow('landingUrl must be an absolute URI');
  });
});
