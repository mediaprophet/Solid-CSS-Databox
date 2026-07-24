import {
  buildOrderRecord,
  canTransitionOrderState,
  transitionOrderState,
} from '../../../../../../src/databox/ipms/modules/pos/Order';

function record(value: unknown): Record<string, unknown> {
  return value as Record<string, unknown>;
}

const lines = [
  {
    lineId: 'line-1',
    product: 'https://example.org/products/coffee',
    name: 'Coffee',
    quantity: 2,
    unitPrice: 4.5,
  },
];

describe('POS order state transitions', (): void => {
  it('allows declared order state transitions.', (): void => {
    expect(canTransitionOrderState('draft', 'open')).toBe(true);
    expect(transitionOrderState('paymentPending', 'paid')).toBe('paid');
  });

  it('rejects invalid order state transitions.', (): void => {
    expect(canTransitionOrderState('paid', 'open')).toBe(false);
    expect((): unknown => transitionOrderState('receiptIssued', 'open'))
      .toThrow('cannot transition from receiptIssued to open');
  });
});

describe('buildOrderRecord', (): void => {
  it('builds a schema.org order with payment and receipt handoff descriptors.', (): void => {
    const result = buildOrderRecord({
      id: 'https://example.org/orders/1',
      orderNumber: 'O-1',
      state: 'paid',
      seller: 'https://example.org/org',
      customer: 'https://example.org/people/alice',
      currency: 'aud',
      createdAt: '2026-07-19T11:00:00.000Z',
      updatedAt: '2026-07-19T11:05:00.000Z',
      lines,
      taxTotal: 0.9,
      promotions: [
        {
          promotion: 'https://example.org/promotions/lunch',
          name: 'Lunch special',
          amount: 1,
        },
      ],
      paymentHandoff: {
        payment: 'https://example.org/payments/1',
        provider: 'Hosted Fields',
        status: 'captured',
        amount: 8.9,
        currency: 'AUD',
        receipt: 'https://example.org/receipts/1',
        digitalReceiptUrl: 'https://pod.example.org/receipts/1',
      },
    });

    expect(result.subtotal).toBe(9);
    expect(result.lineDiscountTotal).toBe(0);
    expect(result.promotionTotal).toBe(1);
    expect(result.taxTotal).toBe(0.9);
    expect(result.total).toBe(8.9);
    expect(result.record['@type']).toBe('Order');
    expect(result.record.orderStatus).toBe('https://schema.org/OrderDelivered');
    expect(result.record.paymentStatus).toBe('https://schema.org/PaymentComplete');

    const due = record(result.record.totalPaymentDue);
    expect(due.price).toBe('8.90');

    const action = record(result.record.potentialAction);
    expect(action['@type']).toBe('PayAction');
    expect(action['@id']).toBe('https://example.org/payments/1');
    expect(action.instrument).toBe('Hosted Fields');
    const actionResult = record(action.result);
    expect(actionResult.status).toBe('captured');
    expect(actionResult.digitalReceiptUrl).toBe('https://pod.example.org/receipts/1');
  });

  it('rejects invalid order metadata and totals.', (): void => {
    const base = {
      id: 'https://example.org/orders/1',
      orderNumber: 'O-1',
      state: 'open' as const,
      seller: 'https://example.org/org',
      currency: 'AUD',
      createdAt: '2026-07-19T11:00:00.000Z',
      lines,
    };

    expect((): unknown => buildOrderRecord({ ...base, seller: 'not-a-uri' }))
      .toThrow('seller must be an absolute URI');
    expect((): unknown => buildOrderRecord({ ...base, orderNumber: '  ' }))
      .toThrow('orderNumber must not be empty');
    expect((): unknown => buildOrderRecord({
      ...base,
      promotions: [{ promotion: 'https://example.org/promotions/1', name: 'Too much', amount: 10 }],
    })).toThrow('promotion total must not exceed');
    expect((): unknown => buildOrderRecord({
      ...base,
      paymentHandoff: {
        payment: 'not-a-uri',
        provider: 'Hosted Fields',
        status: 'captured',
        amount: 9,
        currency: 'AUD',
      },
    })).toThrow('payment must be an absolute URI');
  });
});
