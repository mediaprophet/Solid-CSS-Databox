import { BadRequestHttpError } from '../../../../util/errors/BadRequestHttpError';
import type { CustomerTransactionDisplay } from './Order';

const LD_CONTEXT = '@context';
const LD_TYPE = '@type';
const LD_ID = '@id';

export type CustomerDisplaySlideKind = 'advertising' | 'transaction' | 'app-install' | 'solid-vault-connect';

export interface CustomerDisplaySlide {
  readonly id: string;
  readonly kind: CustomerDisplaySlideKind;
  readonly title: string;
  readonly body?: string;
  readonly imageUrl?: string;
  readonly actionUrl?: string;
  readonly durationMs?: number;
}

export interface CustomerDisplayInput {
  readonly displayId: string;
  readonly generatedAt: string;
  readonly transaction?: CustomerTransactionDisplay;
  readonly shopAppInstallUrl?: string;
  readonly solidVaultConnectUrl?: string;
  readonly customerWifi?: {
    readonly ssid: string;
    readonly orderUrl: string;
  };
  readonly slides?: readonly CustomerDisplaySlide[];
}

export interface CustomerDisplayPayload {
  readonly [LD_CONTEXT]: Record<string, string>;
  readonly type: 'DataboxCustomerDisplayPayload';
  readonly displayId: string;
  readonly generatedAt: string;
  readonly mode: 'portable-display-deck';
  readonly cache: {
    readonly strategy: 'stale-while-revalidate';
    readonly maxAgeSeconds: number;
  };
  readonly transaction?: CustomerTransactionDisplay;
  readonly slides: readonly CustomerDisplaySlide[];
  readonly html: string;
}

export function buildCustomerDisplayPayload(input: CustomerDisplayInput): CustomerDisplayPayload {
  const displayId = requireToken(input.displayId, 'displayId');
  const generatedAt = requireDate(input.generatedAt, 'generatedAt');
  const shopAppInstallUrl = optionalUri(input.shopAppInstallUrl, 'shopAppInstallUrl');
  const solidVaultConnectUrl = optionalUri(input.solidVaultConnectUrl, 'solidVaultConnectUrl');
  const wifi = input.customerWifi === undefined ?
    undefined :
      {
        ssid: requireText(input.customerWifi.ssid, 'customerWifi.ssid'),
        orderUrl: requireUri(input.customerWifi.orderUrl, 'customerWifi.orderUrl'),
      };
  const slides = normalizeSlides(input.slides ?? [], input.transaction, shopAppInstallUrl, solidVaultConnectUrl, wifi);
  return {
    [LD_CONTEXT]: {
      schema: 'https://schema.org/',
      cms: 'urn:solid-server:databox:cms#',
      pos: 'urn:solid-server:databox:cms:pos#',
    },
    type: 'DataboxCustomerDisplayPayload',
    displayId,
    generatedAt,
    mode: 'portable-display-deck',
    cache: {
      strategy: 'stale-while-revalidate',
      maxAgeSeconds: 30,
    },
    ...input.transaction === undefined ? {} : { transaction: input.transaction },
    slides,
    html: renderCustomerDisplayHtml({
      displayId,
      generatedAt,
      transaction: input.transaction,
      slides,
      wifi,
    }),
  };
}

function normalizeSlides(
  slides: readonly CustomerDisplaySlide[],
  transaction: CustomerTransactionDisplay | undefined,
  shopAppInstallUrl: string | undefined,
  solidVaultConnectUrl: string | undefined,
  wifi: { readonly ssid: string; readonly orderUrl: string } | undefined,
): readonly CustomerDisplaySlide[] {
  const generated: CustomerDisplaySlide[] = [];
  if (transaction) {
    generated.push({
      id: 'transaction',
      kind: 'transaction',
      title: `Order ${transaction.orderId}`,
      body: `${transaction.currency} ${transaction.total.toFixed(2)}`,
      durationMs: 8000,
    });
  }
  if (shopAppInstallUrl) {
    generated.push({
      id: 'shop-app-install',
      kind: 'app-install',
      title: 'Install the shop app',
      body: wifi ?
        `Use ${wifi.ssid} or scan at the counter.` :
        'Scan at the counter for receipts, offers, and self-order.',
      actionUrl: shopAppInstallUrl,
      durationMs: 9000,
    });
  }
  if (solidVaultConnectUrl) {
    generated.push({
      id: 'solid-vault-connect',
      kind: 'solid-vault-connect',
      title: 'Connect your Solid vault',
      body: 'Share only the details needed for loyalty, dietary preferences, and digital receipts.',
      actionUrl: solidVaultConnectUrl,
      durationMs: 9000,
    });
  }
  if (wifi) {
    generated.push({
      id: 'customer-self-order',
      kind: 'advertising',
      title: 'Order from your table',
      body: `Connect to ${wifi.ssid} and open ${wifi.orderUrl}`,
      actionUrl: wifi.orderUrl,
      durationMs: 10000,
    });
  }
  return [
    ...generated,
    ...slides.map((slide): CustomerDisplaySlide => ({
      id: requireToken(slide.id, 'slide id'),
      kind: requireKind(slide.kind),
      title: requireText(slide.title, 'slide title'),
      ...slide.body === undefined ? {} : { body: requireText(slide.body, 'slide body') },
      ...slide.imageUrl === undefined ? {} : { imageUrl: requireUri(slide.imageUrl, 'slide imageUrl') },
      ...slide.actionUrl === undefined ? {} : { actionUrl: requireUri(slide.actionUrl, 'slide actionUrl') },
      ...slide.durationMs === undefined ? {} : { durationMs: requireDuration(slide.durationMs) },
    })),
  ];
}

function renderCustomerDisplayHtml(
  input: Pick<CustomerDisplayInput, 'transaction'> & {
    readonly displayId: string;
    readonly generatedAt: string;
    readonly slides: readonly CustomerDisplaySlide[];
    readonly wifi?: { readonly ssid: string; readonly orderUrl: string };
  },
): string {
  const slides = input.slides.map((slide, index): string => `
    <section class="dbx-slide" data-slide="${index}" data-kind="${escapeHtml(slide.kind)}"
      data-duration-ms="${slide.durationMs ?? 10000}">
      ${slide.imageUrl === undefined ?
        '' :
        `<img src="${escapeHtml(slide.imageUrl)}" alt="" loading="lazy">`}
      <h2>${escapeHtml(slide.title)}</h2>
      ${slide.body === undefined ? '' : `<p>${escapeHtml(slide.body)}</p>`}
      ${slide.actionUrl === undefined ?
        '' :
        `<a href="${escapeHtml(slide.actionUrl)}">${escapeHtml(slide.actionUrl)}</a>`}
    </section>`).join('');
  const transaction = input.transaction === undefined ?
    '' :
    `
    <aside class="dbx-transaction" aria-live="polite">
      <h1>${escapeHtml(input.transaction.currency)} ${input.transaction.total.toFixed(2)}</h1>
      <p>${escapeHtml(input.transaction.status)} · ${escapeHtml(input.transaction.paymentStatus)}</p>
    </aside>`;
  const wifi = input.wifi === undefined ?
    '' :
    `
    <footer>
      <span>${escapeHtml(input.wifi.ssid)}</span>
      <a href="${escapeHtml(input.wifi.orderUrl)}">${escapeHtml(input.wifi.orderUrl)}</a>
    </footer>`;
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="databox-display-id" content="${escapeHtml(input.displayId)}">
  <meta name="generated-at" content="${escapeHtml(input.generatedAt)}">
  <style>
    body{margin:0;background:#08111f;color:#f8fafc;font-family:system-ui,sans-serif}
    main{min-height:100vh;display:grid;grid-template-rows:1fr auto}
    .dbx-deck{display:grid;overflow:hidden}
    .dbx-slide{grid-area:1/1;display:grid;align-content:center;justify-items:center;padding:6vw;text-align:center}
    .dbx-slide:not(:first-child){display:none}
    .dbx-slide h2{font-size:clamp(2rem,5vw,5rem);margin:.2em 0}
    .dbx-slide p,.dbx-slide a{font-size:clamp(1rem,2.4vw,2rem);max-width:48rem;color:#dbeafe}
    .dbx-slide img{max-width:min(70vw,56rem);max-height:45vh;object-fit:contain}
    .dbx-transaction,footer{display:flex;gap:2rem;align-items:center;justify-content:space-between;
      padding:1rem 2rem;background:#0f172acc}
    .dbx-transaction h1{margin:0;font-size:clamp(1.8rem,4vw,4rem)}
    footer a{color:#93c5fd}
  </style>
</head>
<body>
  <main data-deck="slidy-reveal-inspired" data-portable="true">
    <div class="dbx-deck">${slides}</div>
    ${transaction}
    ${wifi}
  </main>
</body>
</html>`;
}

function requireKind(kind: CustomerDisplaySlideKind): CustomerDisplaySlideKind {
  if (!([ 'advertising', 'transaction', 'app-install', 'solid-vault-connect' ] as readonly string[]).includes(kind)) {
    throw new BadRequestHttpError('A customer display slide kind is invalid.');
  }
  return kind;
}

function requireUri(value: string, field: string): string {
  try {
    return new URL(value).href;
  } catch {
    throw new BadRequestHttpError(`A customer display ${field} must be an absolute URI.`);
  }
}

function optionalUri(value: string | undefined, field: string): string | undefined {
  return value === undefined ? undefined : requireUri(value, field);
}

function requireDate(value: string, field: string): string {
  const parsed = new Date(value);
  if (value.trim().length === 0 || Number.isNaN(parsed.getTime())) {
    throw new BadRequestHttpError(`A customer display ${field} must be a valid date.`);
  }
  return value;
}

function requireToken(value: string, field: string): string {
  const trimmed = value.trim();
  if (!/^[\w.:-]+$/u.test(trimmed)) {
    throw new BadRequestHttpError(`A customer display ${field} must be a non-empty safe token.`);
  }
  return trimmed;
}

function requireText(value: string, field: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new BadRequestHttpError(`A customer display ${field} must not be empty.`);
  }
  return trimmed;
}

function requireDuration(value: number): number {
  if (!Number.isInteger(value) || value < 1000 || value > 120_000) {
    throw new BadRequestHttpError('A customer display slide duration must be between 1000 and 120000 ms.');
  }
  return value;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll('\'', '&#39;');
}

export type CustomerDisplayOrderState =
  'draft' |
  'open' |
  'held' |
  'paymentPending' |
  'paid' |
  'receiptIssued' |
  'fulfilled' |
  'voided';

export interface CustomerDisplayCartLineInput {
  readonly lineId: string;
  readonly product: string;
  readonly sku?: string;
  readonly name: string;
  readonly quantity: number;
  readonly unitPrice: number;
}

export interface CustomerDisplayLinkInput {
  readonly role: string;
  readonly label: string;
  readonly url: string;
}

export interface CustomerDisplayAdvertisingSlideInput {
  readonly id: string;
  readonly kind: 'image' | 'html' | 'loyalty' | 'receiptQr';
  readonly title: string;
  readonly durationSeconds: number;
  readonly mediaUrl?: string;
  readonly targetUrl?: string;
  readonly priority?: number;
  readonly body?: string;
  readonly sourceResource?: string;
}

export interface CustomerDisplayModelInput {
  readonly id: string;
  readonly order: string;
  readonly currency: string;
  readonly updatedAt: string;
  readonly orderState: string;
  readonly lines: readonly CustomerDisplayCartLineInput[];
  readonly taxTotal?: number;
  readonly discountTotal?: number;
  readonly appInstallLink: CustomerDisplayLinkInput;
  readonly solidVaultConnectLink: CustomerDisplayLinkInput;
  readonly receiptUrl?: string;
  readonly loyaltyProgramName?: string;
  readonly loyaltyMemberLabel?: string;
  readonly customerWifi?: {
    readonly ssid: string;
    readonly orderUrl: string;
  };
  readonly slides?: readonly CustomerDisplayAdvertisingSlideInput[];
}

export interface CustomerDisplayModelResult {
  readonly subtotal: number;
  readonly discountTotal: number;
  readonly taxTotal: number;
  readonly total: number;
  readonly playlist: {
    readonly id: string;
    readonly mode: 'slidy-compatible';
    readonly totalDurationSeconds: number;
    readonly slides: readonly Record<string, unknown>[];
  };
  readonly record: Record<string, unknown>;
}

export function buildCustomerDisplayModel(input: CustomerDisplayModelInput): CustomerDisplayModelResult {
  const id = requireModelUri(input.id, 'id');
  const order = requireModelUri(input.order, 'order');
  const currency = requireModelCurrency(input.currency);
  const updatedAt = requireDate(input.updatedAt, 'updatedAt');
  const orderState = requireDisplayOrderState(input.orderState);
  const lines = input.lines.map(validateModelLine);
  if (lines.length === 0) {
    throw new BadRequestHttpError('A customer display needs at least one line.');
  }
  const subtotal = round2(lines.reduce((sum, line): number => sum + (line.quantity * line.unitPrice), 0));
  const discountTotal = round2(requireModelNonNegative(input.discountTotal ?? 0, 'discountTotal'));
  if (discountTotal > subtotal) {
    throw new BadRequestHttpError('A customer display discountTotal must not exceed the subtotal.');
  }
  const taxTotal = round2(requireModelNonNegative(input.taxTotal ?? 0, 'taxTotal'));
  const total = round2(subtotal - discountTotal + taxTotal);
  const appInstallLink = validateDisplayLink(input.appInstallLink, 'appInstall');
  const solidVaultConnectLink = validateDisplayLink(input.solidVaultConnectLink, 'solidVaultConnect');
  const receiptUrl = input.receiptUrl === undefined ? undefined : requireModelUri(input.receiptUrl, 'receiptUrl');
  const loyaltyProgramName = input.loyaltyProgramName === undefined ?
    undefined :
      requireModelText(input.loyaltyProgramName, 'loyaltyProgramName');
  const loyaltyMemberLabel = input.loyaltyMemberLabel === undefined ?
    undefined :
      requireModelText(input.loyaltyMemberLabel, 'loyaltyMemberLabel');
  const customerWifi = input.customerWifi === undefined ?
    undefined :
      {
        ssid: requireModelText(input.customerWifi.ssid, 'customerWifi.ssid'),
        orderUrl: requireModelUri(input.customerWifi.orderUrl, 'customerWifi.orderUrl'),
      };
  const slides = (input.slides ?? []).map(validateAdvertisingSlide);
  const playlist = buildDisplayPlaylist({
    displayId: id,
    order,
    currency,
    orderState,
    total,
    appInstallLink,
    solidVaultConnectLink,
    receiptUrl,
    loyaltyProgramName,
    loyaltyMemberLabel,
    customerWifi,
    slides,
  });

  return {
    subtotal,
    discountTotal,
    taxTotal,
    total,
    playlist,
    record: {
      [LD_CONTEXT]: 'https://schema.org/',
      [LD_TYPE]: 'ItemList',
      [LD_ID]: id,
      about: {
        [LD_TYPE]: 'Order',
        [LD_ID]: order,
        orderStatus: orderState,
      },
      dateModified: updatedAt,
      numberOfItems: lines.reduce((sum, line): number => sum + line.quantity, 0),
      itemListElement: lines.map((line, index): Record<string, unknown> => ({
        [LD_TYPE]: 'ListItem',
        position: index + 1,
        identifier: line.lineId,
        item: {
          [LD_TYPE]: 'Offer',
          itemOffered: {
            [LD_TYPE]: 'Product',
            [LD_ID]: line.product,
            name: line.name,
            ...line.sku === undefined ? {} : { sku: line.sku },
          },
          eligibleQuantity: { [LD_TYPE]: 'QuantitativeValue', value: line.quantity },
          price: modelMoney(line.unitPrice),
          priceCurrency: currency,
        },
      })),
      potentialAction: [
        actionForLink(appInstallLink, 'InstallAction'),
        actionForLink(solidVaultConnectLink, 'AuthorizeAction'),
        ...receiptUrl === undefined ?
            [] :
            [
              {
                [LD_TYPE]: 'ViewAction',
                name: 'Open digital receipt',
                url: receiptUrl,
              },
            ],
      ],
      hasPart: [ playlistRecord(playlist) ],
      additionalProperty: [
        { [LD_TYPE]: 'PropertyValue', name: 'subtotal', value: modelMoney(subtotal) },
        { [LD_TYPE]: 'PropertyValue', name: 'discountTotal', value: modelMoney(discountTotal) },
        { [LD_TYPE]: 'PropertyValue', name: 'taxTotal', value: modelMoney(taxTotal) },
        { [LD_TYPE]: 'PropertyValue', name: 'total', value: modelMoney(total) },
      ],
    },
  };
}

function buildDisplayPlaylist(input: {
  readonly displayId: string;
  readonly order: string;
  readonly currency: string;
  readonly orderState: CustomerDisplayOrderState;
  readonly total: number;
  readonly appInstallLink: CustomerDisplayLinkInput;
  readonly solidVaultConnectLink: CustomerDisplayLinkInput;
  readonly receiptUrl?: string;
  readonly loyaltyProgramName?: string;
  readonly loyaltyMemberLabel?: string;
  readonly customerWifi?: { readonly ssid: string; readonly orderUrl: string };
  readonly slides: readonly CustomerDisplayAdvertisingSlideInput[];
}): CustomerDisplayModelResult['playlist'] {
  const rawSlides: Record<string, unknown>[] = [
    playlistSlide({
      id: `${input.displayId}#transaction-summary`,
      kind: 'transaction-summary',
      title: `Order ${input.orderState}`,
      body: `${input.currency} ${modelMoney(input.total)}`,
      durationSeconds: 7,
      sourceResource: input.order,
      position: 1,
    }),
    playlistSlide({
      id: `${input.displayId}#app-install`,
      kind: 'app-install',
      title: input.appInstallLink.label,
      body: input.customerWifi === undefined ?
        'Install the shop app for self-ordering, offers, and portable receipts.' :
        `Connect to ${input.customerWifi.ssid} for self-ordering and portable receipts.`,
      targetUrl: input.appInstallLink.url,
      durationSeconds: 8,
      position: 2,
      qrPayloadKind: 'shop-app-install',
    }),
    playlistSlide({
      id: `${input.displayId}#solid-vault-connect`,
      kind: 'solid-vault-connect',
      title: input.solidVaultConnectLink.label,
      body: 'Connect a Solid vault to keep receipts and share preferences without surrendering the profile.',
      targetUrl: input.solidVaultConnectLink.url,
      durationSeconds: 8,
      position: 3,
      qrPayloadKind: 'solid-vault-connect',
    }),
    ...input.loyaltyProgramName === undefined ?
        [] :
        [
          playlistSlide({
            id: `${input.displayId}#loyalty`,
            kind: 'loyalty',
            title: input.loyaltyProgramName,
            body: input.loyaltyMemberLabel === undefined ?
              'Loyalty is represented as portable customer-facing Solid state.' :
              `Signed in as ${input.loyaltyMemberLabel}`,
            durationSeconds: 7,
            position: 4,
          }),
        ],
    ...input.receiptUrl === undefined ?
        [] :
        [
          playlistSlide({
            id: `${input.displayId}#receipt-qr`,
            kind: 'receipt-qr',
            title: 'Digital receipt',
            body: 'Open the RDF receipt or save future receipts to a Solid vault.',
            targetUrl: input.receiptUrl,
            durationSeconds: 7,
            position: 5,
            qrPayloadKind: 'digital-receipt',
          }),
        ],
    ...input.customerWifi === undefined ?
        [] :
        [
          playlistSlide({
            id: `${input.displayId}#customer-self-order`,
            kind: 'advertising',
            title: 'Order from your table',
            body: `Connect to ${input.customerWifi.ssid}.`,
            targetUrl: input.customerWifi.orderUrl,
            durationSeconds: 8,
            position: 6,
          }),
        ],
    ...[ ...input.slides ]
      .sort((left, right): number => (left.priority ?? 100) - (right.priority ?? 100))
      .map((slide, index): Record<string, unknown> => playlistSlide({
        id: slide.id,
        kind: displaySlideKind(slide.kind),
        title: slide.title,
        body: slide.body,
        durationSeconds: slide.durationSeconds,
        mediaUrl: slide.mediaUrl,
        targetUrl: slide.targetUrl,
        sourceResource: slide.sourceResource,
        position: 10 + index,
      })),
  ];
  let elapsedSeconds = 0;
  const scheduledSlides = rawSlides.map((slide): Record<string, unknown> => {
    const duration = Number(slide.durationSeconds);
    const scheduled = {
      ...slide,
      startsAt: `PT${elapsedSeconds}S`,
      timeRequired: `PT${duration}S`,
    };
    elapsedSeconds += duration;
    return scheduled;
  });
  return {
    id: `${input.displayId}#playlist`,
    mode: 'slidy-compatible',
    totalDurationSeconds: elapsedSeconds,
    slides: scheduledSlides,
  };
}

function playlistRecord(playlist: CustomerDisplayModelResult['playlist']): Record<string, unknown> {
  return {
    [LD_TYPE]: 'PresentationDigitalDocument',
    [LD_ID]: playlist.id,
    name: 'Customer display playlist',
    creativeWorkStatus: playlist.mode,
    timeRequired: `PT${playlist.totalDurationSeconds}S`,
    hasPart: playlist.slides,
  };
}

function playlistSlide(input: {
  readonly id: string;
  readonly kind: string;
  readonly title: string;
  readonly durationSeconds: number;
  readonly position: number;
  readonly body?: string;
  readonly mediaUrl?: string;
  readonly targetUrl?: string;
  readonly sourceResource?: string;
  readonly qrPayloadKind?: string;
}): Record<string, unknown> {
  return {
    [LD_TYPE]: 'CreativeWork',
    [LD_ID]: input.id,
    name: input.title,
    genre: input.kind,
    durationSeconds: input.durationSeconds,
    position: input.position,
    ...input.body === undefined ? {} : { text: input.body },
    ...input.mediaUrl === undefined ? {} : { contentUrl: input.mediaUrl },
    ...input.targetUrl === undefined ? {} : { url: input.targetUrl },
    ...input.sourceResource === undefined ? {} : { isBasedOn: { [LD_ID]: input.sourceResource }},
    ...input.qrPayloadKind === undefined ?
        {} :
        {
          additionalProperty: {
            [LD_TYPE]: 'PropertyValue',
            name: 'qrPayloadKind',
            value: input.qrPayloadKind,
          },
        },
  };
}

function displaySlideKind(kind: CustomerDisplayAdvertisingSlideInput['kind']): string {
  const kinds: Record<CustomerDisplayAdvertisingSlideInput['kind'], string> = {
    image: 'advertising',
    html: 'advertising',
    loyalty: 'loyalty',
    receiptQr: 'receipt-qr',
  };
  return kinds[kind];
}

function validateModelLine(line: CustomerDisplayCartLineInput): CustomerDisplayCartLineInput {
  return {
    lineId: requireModelText(line.lineId, 'lineId'),
    product: requireModelUri(line.product, 'line product'),
    ...line.sku === undefined ? {} : { sku: requireModelText(line.sku, 'line sku') },
    name: requireModelText(line.name, 'line name'),
    quantity: requireModelPositive(line.quantity, 'line quantity'),
    unitPrice: requireModelNonNegative(line.unitPrice, 'line unitPrice'),
  };
}

function validateDisplayLink(input: CustomerDisplayLinkInput, role: CustomerDisplayLinkInput['role']):
CustomerDisplayLinkInput {
  if (input.role !== role) {
    throw new BadRequestHttpError(`A customer display link must have role ${role}.`);
  }
  return {
    role,
    label: requireModelText(input.label, 'link label'),
    url: requireModelUri(input.url, 'link url'),
  };
}

function requireDisplayOrderState(state: string): CustomerDisplayOrderState {
  const states: readonly string[] = [
    'draft',
    'open',
    'held',
    'paymentPending',
    'paid',
    'receiptIssued',
    'fulfilled',
    'voided',
  ];
  if (!states.includes(state)) {
    throw new BadRequestHttpError('A customer display orderState is invalid.');
  }
  return state as CustomerDisplayOrderState;
}

function validateAdvertisingSlide(input: CustomerDisplayAdvertisingSlideInput): CustomerDisplayAdvertisingSlideInput {
  const kind = input.kind;
  if (kind !== 'image' && kind !== 'html' && kind !== 'loyalty' && kind !== 'receiptQr') {
    throw new BadRequestHttpError('A customer display slide kind is invalid.');
  }
  if (kind === 'image' && input.mediaUrl === undefined) {
    throw new BadRequestHttpError('A customer display image slide needs a mediaUrl.');
  }
  return {
    id: requireModelText(input.id, 'slide id'),
    kind,
    title: requireModelText(input.title, 'slide title'),
    durationSeconds: requireModelDuration(input.durationSeconds),
    ...input.mediaUrl === undefined ? {} : { mediaUrl: requireModelUri(input.mediaUrl, 'slide mediaUrl') },
    ...input.targetUrl === undefined ? {} : { targetUrl: requireModelUri(input.targetUrl, 'slide targetUrl') },
    ...input.priority === undefined ? {} : { priority: requireModelNonNegative(input.priority, 'slide priority') },
    ...input.body === undefined ? {} : { body: requireModelText(input.body, 'slide body') },
    ...input.sourceResource === undefined ?
        {} :
        { sourceResource: requireModelUri(input.sourceResource, 'slide sourceResource') },
  };
}

function actionForLink(input: CustomerDisplayLinkInput, type: string): Record<string, unknown> {
  return {
    [LD_TYPE]: type,
    name: input.label,
    url: input.url,
  };
}

function requireModelUri(value: string, field: string): string {
  try {
    return new URL(value).href;
  } catch {
    throw new BadRequestHttpError(`A customer display ${field} must be an absolute URI.`);
  }
}

function requireModelCurrency(value: string): string {
  const currency = value.trim().toUpperCase();
  if (!/^[A-Z]{3}$/u.test(currency)) {
    throw new BadRequestHttpError('A customer display currency must be a three-letter ISO 4217 code.');
  }
  return currency;
}

function requireModelText(value: string, field: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new BadRequestHttpError(`A customer display ${field} must not be empty.`);
  }
  return trimmed;
}

function requireModelPositive(value: number, field: string): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new BadRequestHttpError(`A customer display ${field} must be greater than 0.`);
  }
  return value;
}

function requireModelNonNegative(value: number, field: string): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new BadRequestHttpError(`A customer display ${field} must not be negative.`);
  }
  return value;
}

function requireModelDuration(value: number): number {
  if (!Number.isInteger(value) || value < 3 || value > 120) {
    throw new BadRequestHttpError('A customer display slide durationSeconds must be between 3 and 120.');
  }
  return value;
}

function modelMoney(value: number): string {
  return round2(value).toFixed(2);
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
