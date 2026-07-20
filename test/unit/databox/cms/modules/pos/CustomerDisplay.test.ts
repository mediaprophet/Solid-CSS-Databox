import { buildCustomerDisplayModel } from '../../../../../../src/databox/cms/modules/pos/CustomerDisplay';

function record(value: unknown): Record<string, unknown> {
  return value as Record<string, unknown>;
}

const lines = [
  {
    lineId: 'line-1',
    product: 'https://example.org/products/coffee',
    sku: 'COFFEE',
    name: 'Coffee',
    quantity: 2,
    unitPrice: 4.5,
  },
];

describe('buildCustomerDisplayModel', (): void => {
  it('builds a transaction summary with app, vault, receipt, and advertising descriptors.', (): void => {
    const result = buildCustomerDisplayModel({
      id: 'https://example.org/displays/register-1/current',
      order: 'https://example.org/orders/1',
      currency: 'aud',
      updatedAt: '2026-07-19T11:00:00.000Z',
      orderState: 'paymentPending',
      lines,
      taxTotal: 0.8,
      discountTotal: 1,
      appInstallLink: {
        role: 'appInstall',
        label: 'Install shop app',
        url: 'https://example.org/app',
      },
      solidVaultConnectLink: {
        role: 'solidVaultConnect',
        label: 'Connect Solid vault',
        url: 'https://databox.example.org/connect',
      },
      receiptUrl: 'https://pod.example.org/receipts/1',
      loyaltyProgramName: 'Corner Club',
      loyaltyMemberLabel: 'Riley',
      customerWifi: {
        ssid: 'CornerCafeGuest',
        orderUrl: 'https://example.org/order/table/1',
      },
      slides: [
        {
          id: 'slide-1',
          kind: 'image',
          title: 'Lunch special',
          durationSeconds: 8,
          mediaUrl: 'https://example.org/media/lunch.jpg',
          targetUrl: 'https://example.org/menu',
          priority: 2,
          sourceResource: 'https://example.org/promotions/lunch',
        },
        {
          id: 'slide-2',
          kind: 'html',
          title: 'Member reminder',
          durationSeconds: 5,
          body: 'Ask about reusable cups.',
        },
      ],
    });

    expect(result.subtotal).toBe(9);
    expect(result.discountTotal).toBe(1);
    expect(result.taxTotal).toBe(0.8);
    expect(result.total).toBe(8.8);
    expect(result.record['@context']).toBe('https://schema.org/');
    expect(result.record['@type']).toBe('ItemList');
    expect(result.record['@id']).toBe('https://example.org/displays/register-1/current');

    const about = record(result.record.about);
    expect(about['@id']).toBe('https://example.org/orders/1');

    const links = result.record.potentialAction as Record<string, unknown>[];
    expect(links).toHaveLength(3);
    expect(links[0].name).toBe('Install shop app');
    expect(links[0].url).toBe('https://example.org/app');
    expect(links[1].name).toBe('Connect Solid vault');
    expect(links[1].url).toBe('https://databox.example.org/connect');
    expect(links[2].url).toBe('https://pod.example.org/receipts/1');

    expect(result.playlist).toMatchObject({
      id: 'https://example.org/displays/register-1/current#playlist',
      mode: 'slidy-compatible',
      totalDurationSeconds: 58,
    });
    expect(result.playlist.slides.map((slide): unknown => slide.genre)).toStrictEqual([
      'transaction-summary',
      'app-install',
      'solid-vault-connect',
      'loyalty',
      'receipt-qr',
      'advertising',
      'advertising',
      'advertising',
    ]);
    expect(result.playlist.slides[0].startsAt).toBe('PT0S');
    expect(result.playlist.slides[5].url).toBe('https://example.org/order/table/1');
    expect(record(result.playlist.slides[6].isBasedOn)['@id']).toBe('https://example.org/promotions/lunch');
    expect(result.playlist.slides[7].text).toBe('Ask about reusable cups.');

    const parts = result.record.hasPart as Record<string, unknown>[];
    expect(parts).toHaveLength(1);
    expect(parts[0]['@type']).toBe('PresentationDigitalDocument');
    expect((parts[0].hasPart as Record<string, unknown>[])[4].genre).toBe('receipt-qr');
  });

  it('rejects invalid links and slide descriptors.', (): void => {
    const base = {
      id: 'https://example.org/displays/register-1/current',
      order: 'https://example.org/orders/1',
      currency: 'AUD',
      updatedAt: '2026-07-19T11:00:00.000Z',
      orderState: 'paymentPending',
      lines,
      appInstallLink: {
        role: 'appInstall' as const,
        label: 'Install shop app',
        url: 'https://example.org/app',
      },
      solidVaultConnectLink: {
        role: 'solidVaultConnect' as const,
        label: 'Connect Solid vault',
        url: 'https://databox.example.org/connect',
      },
    };

    expect((): unknown => buildCustomerDisplayModel({
      ...base,
      appInstallLink: { ...base.appInstallLink, role: 'help' },
    })).toThrow('must have role appInstall');
    expect((): unknown => buildCustomerDisplayModel({
      ...base,
      solidVaultConnectLink: { ...base.solidVaultConnectLink, url: 'not-a-uri' },
    })).toThrow('url must be an absolute URI');
    expect((): unknown => buildCustomerDisplayModel({
      ...base,
      slides: [{ id: 'slide-1', kind: 'image', title: 'Missing media', durationSeconds: 5 }],
    })).toThrow('needs a mediaUrl');
    expect((): unknown => buildCustomerDisplayModel({
      ...base,
      discountTotal: 99,
    })).toThrow('discountTotal must not exceed');
  });
});
