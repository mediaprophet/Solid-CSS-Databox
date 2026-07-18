import { buildReceipt } from '../../../../../../src/databox/cms/modules/payments/Receipt';

const base = {
  orderId: 'order-1',
  seller: 'Acme Co',
  currency: 'AUD',
  orderDate: '2026-07-19',
};

function record(value: unknown): Record<string, unknown> {
  return value as Record<string, unknown>;
}

describe('buildReceipt', (): void => {
  it('builds a schema.org Order at PaymentComplete with the summed total.', (): void => {
    const receipt = buildReceipt({
      ...base,
      items: [
        { name: 'Widget', quantity: 2, unitPrice: 5 },
        { name: 'Gadget', quantity: 1, unitPrice: 3.5 },
      ],
    });
    expect(receipt['@type']).toBe('Order');
    expect(receipt.orderNumber).toBe('order-1');
    expect(receipt.orderDate).toBe('2026-07-19');
    expect(receipt.paymentStatus).toBe('https://schema.org/PaymentComplete');
    expect(receipt.acceptedOffer as unknown[]).toHaveLength(2);

    const due = record(receipt.totalPaymentDue);
    expect(due['@type']).toBe('PriceSpecification');
    expect(due.price).toBe('13.50');
    expect(due.priceCurrency).toBe('AUD');
    expect(receipt.customer).toBeUndefined();
  });

  it('includes a customer when provided.', (): void => {
    const receipt = buildReceipt({
      ...base,
      customer: 'Alice',
      items: [{ name: 'Widget', quantity: 1, unitPrice: 1 }],
    });
    const customer = record(receipt.customer);
    expect(customer['@type']).toBe('Person');
    expect(customer.name).toBe('Alice');
  });

  it('rejects an empty order id, currency, or item list.', (): void => {
    const item = { name: 'x', quantity: 1, unitPrice: 1 };
    expect((): unknown => buildReceipt({ ...base, orderId: ' ', items: [ item ]})).toThrow('order id');
    expect((): unknown => buildReceipt({ ...base, currency: '', items: [ item ]})).toThrow('currency');
    expect((): unknown => buildReceipt({ ...base, items: []})).toThrow('line item');
  });
});
