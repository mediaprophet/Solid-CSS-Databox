import { buildReceiptDoc } from '../../../../../../src/databox/cms/modules/receipt/ReceiptDoc';

describe('buildReceiptDoc', (): void => {
  const org = { name: 'Acme Pty Ltd', abn: '12 345 678 901', address: '1 Example St', url: 'https://example.org/' };

  it('builds a receipt with tax.', (): void => {
    const result = buildReceiptDoc({
      org,
      receiptId: 'R-1',
      date: '2026-07-19',
      lines: [
        { name: 'Widget', quantity: 2, unitPrice: 5 },
        { name: 'Gadget', quantity: 1, unitPrice: 9.99 },
      ],
      currency: 'AUD',
      taxPercent: 10,
      digitalReceiptUrl: 'https://pod.example.org/receipts/r-1',
    });

    expect(result.org).toBe(org);
    expect(result.receiptId).toBe('R-1');
    expect(result.date).toBe('2026-07-19');
    expect(result.currency).toBe('AUD');
    expect(result.lines).toStrictEqual([
      { name: 'Widget', quantity: 2, amount: '10.00' },
      { name: 'Gadget', quantity: 1, amount: '9.99' },
    ]);
    expect(result.subtotal).toBe('19.99');
    expect(result.tax).toBe('2.00');
    expect(result.total).toBe('21.99');
    expect(result.qr).toStrictEqual({
      payload: 'https://pod.example.org/receipts/r-1',
      caption: 'Scan for your digital receipt',
    });
    expect(result.nativeEdgePrintJob).toMatchObject({
      type: 'DataboxNativeReceiptPrintJob',
      capability: 'native-edge:thermal-receipt-print',
      status: 'unavailable',
      unavailableReason: 'No Rust/native-edge printer connector is attached to this CMS control plane.',
      target: {
        kind: 'thermal-printer',
        protocol: 'escpos',
      },
      payload: {
        format: 'databox.receipt.v1',
        receiptId: 'R-1',
        total: '21.99',
        qr: {
          payload: 'https://pod.example.org/receipts/r-1',
          render: 'native-edge',
        },
      },
      boundary: {
        hardwareIo: 'native-edge-only',
        browserAction: 'generate-descriptor-only',
      },
    });
  });

  it('builds a receipt without tax.', (): void => {
    const result = buildReceiptDoc({
      org,
      receiptId: 'R-2',
      date: '2026-07-19',
      lines: [{ name: 'Widget', quantity: 3, unitPrice: 4 }],
      currency: 'AUD',
      digitalReceiptUrl: 'https://pod.example.org/receipts/r-2',
    });

    expect(result.lines).toStrictEqual([{ name: 'Widget', quantity: 3, amount: '12.00' }]);
    expect(result.subtotal).toBe('12.00');
    expect(result.tax).toBeUndefined();
    expect(result.total).toBe('12.00');
    expect(result.qr.payload).toBe('https://pod.example.org/receipts/r-2');
  });

  it('rejects an empty organisation name.', (): void => {
    expect((): unknown => buildReceiptDoc({
      org: { name: '  ' },
      receiptId: 'R-3',
      date: '2026-07-19',
      lines: [{ name: 'Widget', quantity: 1, unitPrice: 1 }],
      currency: 'AUD',
      digitalReceiptUrl: 'https://pod.example.org/receipts/r-3',
    })).toThrow('needs an organisation name');
  });

  it('rejects an empty receipt id.', (): void => {
    expect((): unknown => buildReceiptDoc({
      org,
      receiptId: '  ',
      date: '2026-07-19',
      lines: [{ name: 'Widget', quantity: 1, unitPrice: 1 }],
      currency: 'AUD',
      digitalReceiptUrl: 'https://pod.example.org/receipts/r-4',
    })).toThrow('needs a receipt id');
  });

  it('rejects an empty lines array.', (): void => {
    expect((): unknown => buildReceiptDoc({
      org,
      receiptId: 'R-5',
      date: '2026-07-19',
      lines: [],
      currency: 'AUD',
      digitalReceiptUrl: 'https://pod.example.org/receipts/r-5',
    })).toThrow('at least one line');
  });

  it('rejects an empty currency.', (): void => {
    expect((): unknown => buildReceiptDoc({
      org,
      receiptId: 'R-6',
      date: '2026-07-19',
      lines: [{ name: 'Widget', quantity: 1, unitPrice: 1 }],
      currency: '  ',
      digitalReceiptUrl: 'https://pod.example.org/receipts/r-6',
    })).toThrow('needs a currency');
  });

  it('rejects a non-URI digitalReceiptUrl.', (): void => {
    expect((): unknown => buildReceiptDoc({
      org,
      receiptId: 'R-7',
      date: '2026-07-19',
      lines: [{ name: 'Widget', quantity: 1, unitPrice: 1 }],
      currency: 'AUD',
      digitalReceiptUrl: 'not-a-uri',
    })).toThrow('digitalReceiptUrl must be an absolute URI');
  });
});
