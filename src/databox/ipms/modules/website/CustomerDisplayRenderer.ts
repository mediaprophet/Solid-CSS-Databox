import { BadRequestHttpError } from '../../../../util/errors/BadRequestHttpError';

// JSON-LD keywords as constants so they can be used as computed keys (the linter's naming
// convention forbids `@`-prefixed object-literal property names).
const LD_CONTEXT = '@context';
const LD_TYPE = '@type';
const LD_ID = '@id';
const SCHEMA = 'https://schema.org/';
const SOLID = 'http://www.w3.org/ns/solid/terms#';
const CONTROL_PLANE_PATH = '/.databox/ipms';
const DEFAULT_PUBLIC_PATH = '/customer-display';
const DEFAULT_CSS_PATH = '/customer-display.css';
const DEFAULT_SCRIPT_PATH = '/customer-display.js';
const DEFAULT_JSON_PATH = '/customer-display.json';
const DEFAULT_SERVICE_WORKER_PATH = '/customer-display-sw.js';
const DEFAULT_CACHE_MAX_AGE_SECONDS = 30;
const DEFAULT_ASSET_CACHE_MAX_AGE_SECONDS = 86_400;
const DEFAULT_SLIDE_DURATION_SECONDS = 8;
const MAX_TRANSACTION_LINES = 50;
const MAX_SLIDES = 20;
const MAX_TEXT_LENGTH = 500;
const HEADER_CONTENT_TYPE = 'content-type';
const HEADER_CACHE_CONTROL = 'cache-control';
const HEADER_VARY = 'vary';

export type CustomerDisplayTransactionStatus =
  'building' |
  'pending-payment' |
  'paid' |
  'cancelled' |
  'refunded';

export interface CustomerDisplayBusinessInput {
  readonly id: string;
  readonly name: string;
  readonly url?: string;
}

export interface CustomerDisplayTransactionLineInput {
  readonly name: string;
  readonly quantity: number;
  readonly unitPrice: number;
  readonly sku?: string;
}

export interface CustomerDisplayTransactionInput {
  readonly id: string;
  readonly orderNumber?: string;
  readonly status: CustomerDisplayTransactionStatus;
  readonly currency: string;
  readonly lines: readonly CustomerDisplayTransactionLineInput[];
  readonly subtotal: number;
  readonly tax?: number;
  readonly discount?: number;
  readonly total: number;
  readonly updatedAt?: string;
}

export interface CustomerDisplayLinksInput {
  readonly shopAppInstallUrl: string;
  readonly shopAppDownloadUrl?: string;
  readonly solidVaultConnectUrl: string;
  readonly digitalReceiptUrl?: string;
}

export type CustomerDisplayPlaylistMode = 'portable-web' | 'slidy-compatible' | 'reveal-compatible';

export type CustomerDisplayPlaylistSlideKind =
  'transaction-summary' |
  'app-install' |
  'solid-vault-connect' |
  'loyalty' |
  'receipt-qr' |
  'advertising';

export interface CustomerDisplayLoyaltyInput {
  readonly programName: string;
  readonly memberLabel?: string;
  readonly pointsBalance?: number;
  readonly callToActionUrl?: string;
  readonly privacyNote?: string;
}

export interface CustomerDisplayPlaylistInput {
  readonly id?: string;
  readonly title?: string;
  readonly mode?: CustomerDisplayPlaylistMode;
  readonly includeGeneratedSlides?: boolean;
  readonly loop?: boolean;
}

export interface CustomerDisplaySlideImageInput {
  readonly url: string;
  readonly alt: string;
}

export interface CustomerDisplaySlideActionInput {
  readonly label: string;
  readonly url: string;
}

export interface CustomerDisplaySlideInput {
  readonly id: string;
  readonly kind?: CustomerDisplayPlaylistSlideKind;
  readonly title: string;
  readonly body?: string;
  readonly image?: CustomerDisplaySlideImageInput;
  readonly action?: CustomerDisplaySlideActionInput;
  readonly durationSeconds?: number;
  readonly priority?: number;
  readonly sourceResource?: string;
  readonly validFrom?: string;
  readonly validUntil?: string;
}

export interface CustomerDisplayAssetPathsInput {
  readonly cssPath?: string;
  readonly scriptPath?: string;
  readonly jsonPath?: string;
  readonly serviceWorkerPath?: string;
}

export interface CustomerDisplayInput {
  readonly business: CustomerDisplayBusinessInput;
  readonly transaction: CustomerDisplayTransactionInput;
  readonly links: CustomerDisplayLinksInput;
  readonly loyalty?: CustomerDisplayLoyaltyInput;
  readonly playlist?: CustomerDisplayPlaylistInput;
  readonly slides: readonly CustomerDisplaySlideInput[];
  readonly generatedAt?: string;
  readonly publicPath?: string;
  readonly cacheMaxAgeSeconds?: number;
  readonly assetCacheMaxAgeSeconds?: number;
  readonly assetPaths?: CustomerDisplayAssetPathsInput;
  readonly enableOffline?: boolean;
  readonly defaultSlideDurationSeconds?: number;
}

export type CustomerDisplayHeaders = Readonly<
  Record<typeof HEADER_CONTENT_TYPE | typeof HEADER_CACHE_CONTROL | typeof HEADER_VARY, string>
>;

export interface CustomerDisplayAsset {
  readonly publicPath: string;
  readonly content: string;
  readonly headers: CustomerDisplayHeaders;
}

export interface CustomerDisplayQrPayload {
  readonly kind: 'shop-app-install' | 'shop-app-download' | 'solid-vault-connect' | 'digital-receipt';
  readonly label: string;
  readonly payload: string;
}

export interface CustomerDisplayPlaylistSlide {
  readonly id: string;
  readonly kind: CustomerDisplayPlaylistSlideKind;
  readonly title: string;
  readonly body?: string;
  readonly image?: CustomerDisplaySlideImageInput;
  readonly action?: CustomerDisplaySlideActionInput;
  readonly durationSeconds: number;
  readonly startsAtMs: number;
  readonly sourceResource?: string;
  readonly qrPayloadKind?: CustomerDisplayQrPayload['kind'];
}

export interface CustomerDisplayPlaylist {
  readonly id: string;
  readonly title: string;
  readonly mode: CustomerDisplayPlaylistMode;
  readonly loop: boolean;
  readonly totalDurationSeconds: number;
  readonly slides: readonly CustomerDisplayPlaylistSlide[];
}

export interface CustomerDisplayRender {
  readonly publicPath: string;
  readonly controlPlanePath: typeof CONTROL_PLANE_PATH;
  readonly requiresControlToken: false;
  readonly html: string;
  readonly jsonLd: Record<string, unknown>;
  readonly playlist: CustomerDisplayPlaylist;
  readonly qrPayloads: readonly CustomerDisplayQrPayload[];
  readonly headers: CustomerDisplayHeaders;
  readonly jsonLdHeaders: CustomerDisplayHeaders;
  readonly assets: {
    readonly css: CustomerDisplayAsset;
    readonly script: CustomerDisplayAsset;
    readonly serviceWorker?: CustomerDisplayAsset;
  };
}

type RequiredTransactionFields = 'id' | 'status' | 'currency' | 'lines' | 'subtotal' | 'total';
type OptionalTransactionFields = 'orderNumber' | 'tax' | 'discount' | 'updatedAt';
type CheckedTransaction = Required<Pick<CustomerDisplayTransactionInput, RequiredTransactionFields>> &
  Pick<CustomerDisplayTransactionInput, OptionalTransactionFields>;
type CheckedLinks = Required<Pick<CustomerDisplayLinksInput, 'shopAppInstallUrl' | 'solidVaultConnectUrl'>> &
  Pick<CustomerDisplayLinksInput, 'shopAppDownloadUrl' | 'digitalReceiptUrl'>;
type CheckedSlide = Required<Pick<CustomerDisplaySlideInput, 'id' | 'kind' | 'title' | 'durationSeconds'>> &
  CustomerDisplaySlideInput;
type CheckedLoyalty = CustomerDisplayLoyaltyInput;
type CheckedPlaylistInput = Required<CustomerDisplayPlaylistInput>;

interface CheckedInput {
  readonly business: Required<CustomerDisplayBusinessInput>;
  readonly transaction: CheckedTransaction;
  readonly links: CheckedLinks;
  readonly loyalty?: CheckedLoyalty;
  readonly playlist: CheckedPlaylistInput;
  readonly slides: readonly CheckedSlide[];
  readonly generatedAt: string;
  readonly publicPath: string;
  readonly cacheMaxAgeSeconds: number;
  readonly assetCacheMaxAgeSeconds: number;
  readonly assetPaths: Required<CustomerDisplayAssetPathsInput>;
  readonly enableOffline: boolean;
  readonly defaultSlideDurationSeconds: number;
}

/**
 * Render a customer-facing POS display payload as semantic HTML, schema.org/solid JSON-LD,
 * QR payload strings, and small static assets. The helper is pure and intentionally emits
 * ordinary web resources only, so a CSS-enhanced route or a standard Solid client can serve
 * the same display without making Oxigraph or the IPMS control plane canonical.
 */
export function renderCustomerDisplay(input: CustomerDisplayInput): CustomerDisplayRender {
  const checked = validateInput(input);
  const qrPayloads = buildQrPayloads(checked.links);
  const playlist = buildPlaylist(checked, qrPayloads);
  const jsonLd = buildJsonLd(checked, playlist, qrPayloads);
  const headers = htmlHeaders(checked.cacheMaxAgeSeconds);
  const jsonLdHeaders = jsonHeaders(checked.cacheMaxAgeSeconds);
  const assets = {
    css: {
      publicPath: checked.assetPaths.cssPath,
      content: renderCss(),
      headers: assetHeaders('text/css; charset=utf-8', checked.assetCacheMaxAgeSeconds),
    },
    script: {
      publicPath: checked.assetPaths.scriptPath,
      content: renderScript(),
      headers: assetHeaders('application/javascript; charset=utf-8', checked.assetCacheMaxAgeSeconds),
    },
    ...checked.enableOffline ?
        {
          serviceWorker: {
            publicPath: checked.assetPaths.serviceWorkerPath,
            content: renderServiceWorker(checked),
            headers: assetHeaders('application/javascript; charset=utf-8', checked.assetCacheMaxAgeSeconds),
          },
        } :
        {},
  };

  return {
    publicPath: checked.publicPath,
    controlPlanePath: CONTROL_PLANE_PATH,
    requiresControlToken: false,
    html: renderHtml(checked, playlist, jsonLd, qrPayloads),
    jsonLd,
    playlist,
    qrPayloads,
    headers,
    jsonLdHeaders,
    assets,
  };
}

function validateInput(input: CustomerDisplayInput): CheckedInput {
  const generatedAt = requireIsoDate(input.generatedAt ?? new Date(0).toISOString(), 'generatedAt');
  const defaultSlideDurationSeconds =
    validateSlideDuration(input.defaultSlideDurationSeconds ?? DEFAULT_SLIDE_DURATION_SECONDS);
  const links = validateLinks(input.links);
  const slides = validateSlides(input.slides, generatedAt, defaultSlideDurationSeconds);
  return {
    business: validateBusiness(input.business),
    transaction: validateTransaction(input.transaction),
    links,
    ...input.loyalty === undefined ? {} : { loyalty: validateLoyalty(input.loyalty) },
    playlist: validatePlaylistInput(input.playlist, input.business.id),
    slides,
    generatedAt,
    publicPath: validatePublicPath(input.publicPath ?? DEFAULT_PUBLIC_PATH, 'customer display path'),
    cacheMaxAgeSeconds: validateCacheMaxAge(input.cacheMaxAgeSeconds ?? DEFAULT_CACHE_MAX_AGE_SECONDS),
    assetCacheMaxAgeSeconds:
      validateCacheMaxAge(input.assetCacheMaxAgeSeconds ?? DEFAULT_ASSET_CACHE_MAX_AGE_SECONDS),
    assetPaths: {
      cssPath: validatePublicPath(input.assetPaths?.cssPath ?? DEFAULT_CSS_PATH, 'customer display CSS path'),
      scriptPath:
        validatePublicPath(input.assetPaths?.scriptPath ?? DEFAULT_SCRIPT_PATH, 'customer display script path'),
      jsonPath: validatePublicPath(input.assetPaths?.jsonPath ?? DEFAULT_JSON_PATH, 'customer display JSON path'),
      serviceWorkerPath: validatePublicPath(
        input.assetPaths?.serviceWorkerPath ?? DEFAULT_SERVICE_WORKER_PATH,
        'customer display service worker path',
      ),
    },
    enableOffline: input.enableOffline ?? true,
    defaultSlideDurationSeconds,
  };
}

function validatePlaylistInput(
  input: CustomerDisplayPlaylistInput | undefined,
  fallbackId: string,
): CheckedPlaylistInput {
  const mode = input?.mode ?? 'slidy-compatible';
  if (![ 'portable-web', 'slidy-compatible', 'reveal-compatible' ].includes(mode)) {
    throw new BadRequestHttpError('A customer display playlist mode is not supported.');
  }
  return {
    id: requireAbsoluteUri(
      input?.id ?? `${fallbackId.replace(/[#/]?$/u, '')}/customer-display-playlist`,
      'A customer display playlist id',
    ),
    title: requireText(input?.title ?? 'Customer display playlist', 'A customer display playlist title', 160),
    mode,
    includeGeneratedSlides: input?.includeGeneratedSlides ?? true,
    loop: input?.loop ?? true,
  };
}

function validateBusiness(input: CustomerDisplayBusinessInput): Required<CustomerDisplayBusinessInput> {
  return {
    id: requireAbsoluteUri(input.id, 'A customer display business id'),
    name: requireText(input.name, 'A customer display business name', 120),
    url: requireHttpUri(input.url ?? input.id, 'A customer display business url'),
  };
}

function validateTransaction(input: CustomerDisplayTransactionInput): CheckedInput['transaction'] {
  if (!isTransactionStatus(input.status)) {
    throw new BadRequestHttpError('A customer display transaction status is not supported.');
  }
  if (input.lines.length === 0) {
    throw new BadRequestHttpError('A customer display transaction needs at least one line.');
  }
  if (input.lines.length > MAX_TRANSACTION_LINES) {
    throw new BadRequestHttpError(`A customer display transaction must not exceed ${MAX_TRANSACTION_LINES} lines.`);
  }
  return {
    id: requireAbsoluteUri(input.id, 'A customer display transaction id'),
    ...input.orderNumber === undefined ?
        {} :
        { orderNumber: requireText(input.orderNumber, 'A customer display order number', 120) },
    status: input.status,
    currency: requireCurrency(input.currency, 'A customer display currency'),
    lines: input.lines.map(validateLine),
    subtotal: requireMoney(input.subtotal, 'A customer display subtotal'),
    ...input.tax === undefined ? {} : { tax: requireMoney(input.tax, 'A customer display tax') },
    ...input.discount === undefined ? {} : { discount: requireMoney(input.discount, 'A customer display discount') },
    total: requireMoney(input.total, 'A customer display total'),
    ...input.updatedAt === undefined ?
        {} :
        { updatedAt: requireIsoDate(input.updatedAt, 'transaction updatedAt') },
  };
}

function validateLine(input: CustomerDisplayTransactionLineInput): CustomerDisplayTransactionLineInput {
  return {
    name: requireText(input.name, 'A customer display transaction line name', 160),
    quantity: requirePositiveNumber(input.quantity, 'A customer display transaction line quantity'),
    unitPrice: requireMoney(input.unitPrice, 'A customer display transaction line unit price'),
    ...input.sku === undefined ?
        {} :
        { sku: requireText(input.sku, 'A customer display transaction line sku', 80) },
  };
}

function validateLinks(input: CustomerDisplayLinksInput): CheckedInput['links'] {
  return {
    shopAppInstallUrl: requireHttpUri(input.shopAppInstallUrl, 'A customer display shop app install url'),
    ...input.shopAppDownloadUrl === undefined ?
        {} :
        { shopAppDownloadUrl: requireHttpUri(input.shopAppDownloadUrl, 'A customer display shop app download url') },
    solidVaultConnectUrl: requireHttpUri(input.solidVaultConnectUrl, 'A customer display Solid vault connect url'),
    ...input.digitalReceiptUrl === undefined ?
        {} :
        { digitalReceiptUrl: requireHttpUri(input.digitalReceiptUrl, 'A customer display digital receipt url') },
  };
}

function validateLoyalty(input: CustomerDisplayLoyaltyInput): CheckedLoyalty {
  return {
    programName: requireText(input.programName, 'A customer display loyalty program name', 120),
    ...input.memberLabel === undefined ?
        {} :
        { memberLabel: requireText(input.memberLabel, 'A customer display loyalty member label', 120) },
    ...input.pointsBalance === undefined ?
        {} :
        { pointsBalance: requireNonNegativeInteger(input.pointsBalance, 'A customer display loyalty points balance') },
    ...input.callToActionUrl === undefined ?
        {} :
        { callToActionUrl: requireHttpUri(input.callToActionUrl, 'A customer display loyalty call-to-action url') },
    ...input.privacyNote === undefined ?
        {} :
        { privacyNote: requireText(input.privacyNote, 'A customer display loyalty privacy note', 220) },
  };
}

function validateSlides(
  input: readonly CustomerDisplaySlideInput[],
  generatedAt: string,
  defaultDuration: number,
): CheckedInput['slides'] {
  if (input.length === 0) {
    throw new BadRequestHttpError('A customer display needs at least one advertising slide.');
  }
  if (input.length > MAX_SLIDES) {
    throw new BadRequestHttpError(`A customer display slide deck must not exceed ${MAX_SLIDES} slides.`);
  }
  const instant = Date.parse(generatedAt);
  const slides = input.map((slide): CheckedSlide => {
    const validFrom = slide.validFrom === undefined ? undefined : requireIsoDate(slide.validFrom, 'slide validFrom');
    const validUntil = slide.validUntil === undefined ?
      undefined :
        requireIsoDate(slide.validUntil, 'slide validUntil');
    if (validFrom !== undefined && validUntil !== undefined && Date.parse(validFrom) > Date.parse(validUntil)) {
      throw new BadRequestHttpError('A customer display slide validFrom must not be after validUntil.');
    }
    return {
      id: requireAbsoluteUri(slide.id, 'A customer display slide id'),
      kind: validateSlideKind(slide.kind ?? 'advertising'),
      title: requireText(slide.title, 'A customer display slide title', 120),
      ...slide.body === undefined ? {} : { body: requireText(slide.body, 'A customer display slide body') },
      ...slide.image === undefined ? {} : { image: validateImage(slide.image) },
      ...slide.action === undefined ? {} : { action: validateAction(slide.action) },
      durationSeconds: validateSlideDuration(slide.durationSeconds ?? defaultDuration),
      ...slide.priority === undefined ?
          {} :
          { priority: requireNonNegativeInteger(slide.priority, 'A customer display slide priority') },
      ...slide.sourceResource === undefined ?
          {} :
          { sourceResource: requireAbsoluteUri(slide.sourceResource, 'A customer display slide source resource') },
      ...validFrom === undefined ? {} : { validFrom },
      ...validUntil === undefined ? {} : { validUntil },
    };
  }).filter((slide): boolean =>
    (slide.validFrom === undefined || Date.parse(slide.validFrom) <= instant) &&
    (slide.validUntil === undefined || Date.parse(slide.validUntil) >= instant));

  if (slides.length === 0) {
    throw new BadRequestHttpError('A customer display slide deck has no currently active slides.');
  }
  return slides;
}

function validateSlideKind(kind: CustomerDisplayPlaylistSlideKind): CustomerDisplayPlaylistSlideKind {
  const kinds: readonly CustomerDisplayPlaylistSlideKind[] = [
    'transaction-summary',
    'app-install',
    'solid-vault-connect',
    'loyalty',
    'receipt-qr',
    'advertising',
  ];
  if (!kinds.includes(kind)) {
    throw new BadRequestHttpError('A customer display slide kind is not supported.');
  }
  return kind;
}

function validateImage(input: CustomerDisplaySlideImageInput): CustomerDisplaySlideImageInput {
  return {
    url: requireHttpUri(input.url, 'A customer display slide image url'),
    alt: requireText(input.alt, 'A customer display slide image alt text', 160),
  };
}

function validateAction(input: CustomerDisplaySlideActionInput): CustomerDisplaySlideActionInput {
  return {
    label: requireText(input.label, 'A customer display slide action label', 80),
    url: requireHttpUri(input.url, 'A customer display slide action url'),
  };
}

function buildQrPayloads(input: CheckedInput['links']): CustomerDisplayQrPayload[] {
  return [
    {
      kind: 'shop-app-install',
      label: 'Install shop app',
      payload: input.shopAppInstallUrl,
    },
    ...input.shopAppDownloadUrl === undefined ?
        [] :
        [
          {
            kind: 'shop-app-download' as const,
            label: 'Download shop app',
            payload: input.shopAppDownloadUrl,
          },
        ],
    {
      kind: 'solid-vault-connect',
      label: 'Connect Solid vault',
      payload: input.solidVaultConnectUrl,
    },
    ...input.digitalReceiptUrl === undefined ?
        [] :
        [
          {
            kind: 'digital-receipt' as const,
            label: 'Open digital receipt',
            payload: input.digitalReceiptUrl,
          },
        ],
  ];
}

function buildPlaylist(
  checked: CheckedInput,
  qrPayloads: readonly CustomerDisplayQrPayload[],
): CustomerDisplayPlaylist {
  const generated = checked.playlist.includeGeneratedSlides ?
      generatedPlaylistSlides(checked, qrPayloads) :
      [];
  const advertisingSlides = [ ...checked.slides ]
    .sort((left, right): number => (left.priority ?? 0) - (right.priority ?? 0))
    .map((slide): Omit<CustomerDisplayPlaylistSlide, 'startsAtMs'> => ({
      id: slide.id,
      kind: slide.kind,
      title: slide.title,
      ...slide.body === undefined ? {} : { body: slide.body },
      ...slide.image === undefined ? {} : { image: slide.image },
      ...slide.action === undefined ? {} : { action: slide.action },
      durationSeconds: slide.durationSeconds,
      ...slide.sourceResource === undefined ? {} : { sourceResource: slide.sourceResource },
    }));
  const slides = withSchedule([ ...generated, ...advertisingSlides ]);
  if (slides.length > MAX_SLIDES + 5) {
    throw new BadRequestHttpError(`A customer display playlist must not exceed ${MAX_SLIDES + 5} slides.`);
  }
  return {
    id: checked.playlist.id,
    title: checked.playlist.title,
    mode: checked.playlist.mode,
    loop: checked.playlist.loop,
    totalDurationSeconds: slides.reduce((sum, slide): number => sum + slide.durationSeconds, 0),
    slides,
  };
}

function generatedPlaylistSlides(
  checked: CheckedInput,
  qrPayloads: readonly CustomerDisplayQrPayload[],
): Omit<CustomerDisplayPlaylistSlide, 'startsAtMs'>[] {
  const appInstall = qrPayloads.find((payload): boolean => payload.kind === 'shop-app-install');
  const vaultConnect = qrPayloads.find((payload): boolean => payload.kind === 'solid-vault-connect');
  const receipt = qrPayloads.find((payload): boolean => payload.kind === 'digital-receipt');
  return [
    {
      id: `${checked.playlist.id}#transaction-summary`,
      kind: 'transaction-summary',
      title: checked.transaction.orderNumber === undefined ?
        'Current order' :
        `Order ${checked.transaction.orderNumber}`,
      body: `${checked.transaction.currency} ${money(checked.transaction.total)} - ${
        statusLabel(checked.transaction.status)
      }`,
      durationSeconds: 7,
      sourceResource: checked.transaction.id,
    },
    ...appInstall === undefined ?
        [] :
        [
          {
            id: `${checked.playlist.id}#shop-app-install`,
            kind: 'app-install' as const,
            title: 'Install the shop app',
            body: 'Use the shop app for ordering, receipts, offers, and pickup updates.',
            action: {
              label: appInstall.label,
              url: appInstall.payload,
            },
            durationSeconds: 8,
            qrPayloadKind: appInstall.kind,
          },
        ],
    ...vaultConnect === undefined ?
        [] :
        [
          {
            id: `${checked.playlist.id}#solid-vault-connect`,
            kind: 'solid-vault-connect' as const,
            title: 'Connect your Solid vault',
            body: 'Share only what is needed for loyalty, preferences, dietary filters, and receipts.',
            action: {
              label: vaultConnect.label,
              url: vaultConnect.payload,
            },
            durationSeconds: 8,
            qrPayloadKind: vaultConnect.kind,
          },
        ],
    ...checked.loyalty === undefined ?
        [] :
        [
          {
            id: `${checked.playlist.id}#loyalty`,
            kind: 'loyalty' as const,
            title: checked.loyalty.memberLabel === undefined ?
              checked.loyalty.programName :
              `${checked.loyalty.programName} for ${checked.loyalty.memberLabel}`,
            body: loyaltyBody(checked.loyalty),
            ...checked.loyalty.callToActionUrl === undefined ?
                {} :
                {
                  action: {
                    label: 'Open loyalty',
                    url: checked.loyalty.callToActionUrl,
                  },
                },
            durationSeconds: 7,
          },
        ],
    ...receipt === undefined ?
        [] :
        [
          {
            id: `${checked.playlist.id}#receipt-qr`,
            kind: 'receipt-qr' as const,
            title: 'Take your receipt with you',
            body: 'Open the digital RDF receipt from your pod or connect a Solid vault for future receipts.',
            action: {
              label: receipt.label,
              url: receipt.payload,
            },
            durationSeconds: 7,
            qrPayloadKind: receipt.kind,
          },
        ],
  ];
}

function withSchedule(
  slides: readonly Omit<CustomerDisplayPlaylistSlide, 'startsAtMs'>[],
): CustomerDisplayPlaylistSlide[] {
  let startsAtMs = 0;
  return slides.map((slide): CustomerDisplayPlaylistSlide => {
    const scheduled = { ...slide, startsAtMs };
    startsAtMs += slide.durationSeconds * 1_000;
    return scheduled;
  });
}

function loyaltyBody(input: CheckedLoyalty): string {
  const points = input.pointsBalance === undefined ? undefined : `${input.pointsBalance} points`;
  return [ points, input.privacyNote ?? 'Loyalty can work from portable Solid profile state.' ]
    .filter((part): part is string => part !== undefined)
    .join(' - ');
}

function buildJsonLd(
  checked: CheckedInput,
  playlist: CustomerDisplayPlaylist,
  qrPayloads: readonly CustomerDisplayQrPayload[],
): Record<string, unknown> {
  return {
    [LD_CONTEXT]: {
      schema: SCHEMA,
      solid: SOLID,
      id: LD_ID,
      type: LD_TYPE,
    },
    [LD_TYPE]: 'schema:WebPage',
    [LD_ID]: checked.business.url,
    name: `${checked.business.name} customer display`,
    dateModified: checked.generatedAt,
    mainEntity: buildOrderJsonLd(checked.transaction),
    provider: {
      [LD_TYPE]: 'schema:LocalBusiness',
      [LD_ID]: checked.business.id,
      'schema:name': checked.business.name,
      'schema:url': checked.business.url,
    },
    potentialAction: buildActionsJsonLd(checked.links, qrPayloads),
    hasPart: [
      buildSlideDeckJsonLd(playlist),
      buildOfflineHintJsonLd(checked),
    ],
  };
}

function buildOrderJsonLd(transaction: CheckedInput['transaction']): Record<string, unknown> {
  return {
    [LD_TYPE]: 'schema:Order',
    [LD_ID]: transaction.id,
    'schema:orderStatus': `https://schema.org/${orderStatus(transaction.status)}`,
    ...transaction.orderNumber === undefined ? {} : { 'schema:orderNumber': transaction.orderNumber },
    ...transaction.updatedAt === undefined ? {} : { 'schema:orderDate': transaction.updatedAt },
    'schema:acceptedOffer': transaction.lines.map((line): Record<string, unknown> => ({
      [LD_TYPE]: 'schema:Offer',
      'schema:itemOffered': {
        [LD_TYPE]: 'schema:Product',
        'schema:name': line.name,
        ...line.sku === undefined ? {} : { 'schema:sku': line.sku },
      },
      'schema:price': money(line.unitPrice),
      'schema:priceCurrency': transaction.currency,
      'schema:eligibleQuantity': {
        [LD_TYPE]: 'schema:QuantitativeValue',
        'schema:value': line.quantity,
      },
    })),
    'schema:priceSpecification': [
      priceSpecification('Subtotal', transaction.subtotal, transaction.currency),
      ...transaction.discount === undefined ?
          [] :
          [ priceSpecification('Discount', transaction.discount, transaction.currency) ],
      ...transaction.tax === undefined ? [] : [ priceSpecification('Tax', transaction.tax, transaction.currency) ],
      priceSpecification('Total', transaction.total, transaction.currency),
    ],
    'schema:totalPaymentDue': priceSpecification('Total', transaction.total, transaction.currency),
  };
}

function buildActionsJsonLd(
  links: CheckedInput['links'],
  qrPayloads: readonly CustomerDisplayQrPayload[],
): Record<string, unknown>[] {
  return [
    actionJsonLd('schema:InstallAction', links.shopAppInstallUrl, qrPayloads[0]),
    ...links.shopAppDownloadUrl === undefined ?
        [] :
        [ actionJsonLd('schema:DownloadAction', links.shopAppDownloadUrl, qrPayloads[1]) ],
    actionJsonLd(
      'schema:AuthorizeAction',
      links.solidVaultConnectUrl,
      qrPayloads.find((payload): boolean => payload.kind === 'solid-vault-connect') ??
      lastQrPayload(qrPayloads),
    ),
    ...links.digitalReceiptUrl === undefined ?
        [] :
        [
          actionJsonLd(
            'schema:ViewAction',
            links.digitalReceiptUrl,
            qrPayloads.find((payload): boolean => payload.kind === 'digital-receipt') ??
            lastQrPayload(qrPayloads),
          ),
        ],
  ];
}

function actionJsonLd(type: string, url: string, qr: CustomerDisplayQrPayload): Record<string, unknown> {
  return {
    [LD_TYPE]: type,
    target: {
      [LD_TYPE]: 'schema:EntryPoint',
      'schema:urlTemplate': url,
    },
    'schema:identifier': qr.kind,
    'schema:name': qr.label,
    'schema:additionalProperty': {
      [LD_TYPE]: 'schema:PropertyValue',
      'schema:name': 'qrPayload',
      'schema:value': qr.payload,
    },
  };
}

function lastQrPayload(qrPayloads: readonly CustomerDisplayQrPayload[]): CustomerDisplayQrPayload {
  const payload = qrPayloads.at(-1);
  if (payload === undefined) {
    throw new BadRequestHttpError('A customer display needs at least one QR payload.');
  }
  return payload;
}

function buildSlideDeckJsonLd(playlist: CustomerDisplayPlaylist): Record<string, unknown> {
  return {
    [LD_TYPE]: 'schema:PresentationDigitalDocument',
    [LD_ID]: playlist.id,
    'schema:name': playlist.title,
    'schema:creativeWorkStatus': playlist.mode,
    'schema:timeRequired': `PT${playlist.totalDurationSeconds}S`,
    'schema:hasPart': playlist.slides.map((slide, index): Record<string, unknown> => ({
      [LD_TYPE]: 'schema:CreativeWork',
      [LD_ID]: slide.id,
      'schema:position': index + 1,
      'schema:genre': slide.kind,
      'schema:headline': slide.title,
      ...slide.body === undefined ? {} : { 'schema:text': slide.body },
      ...slide.image === undefined ?
          {} :
          {
            'schema:image': {
              [LD_TYPE]: 'schema:ImageObject',
              'schema:url': slide.image.url,
              'schema:caption': slide.image.alt,
            },
          },
      ...slide.action === undefined ?
          {} :
          {
            'schema:potentialAction': {
              [LD_TYPE]: 'schema:ViewAction',
              'schema:name': slide.action.label,
              target: {
                [LD_TYPE]: 'schema:EntryPoint',
                'schema:urlTemplate': slide.action.url,
              },
            },
          },
      'schema:timeRequired': `PT${slide.durationSeconds}S`,
      'schema:startTime': `${slide.startsAtMs}ms`,
      ...slide.sourceResource === undefined ?
          {} :
          { 'schema:isBasedOn': { [LD_ID]: slide.sourceResource }},
      ...slide.qrPayloadKind === undefined ?
          {} :
          {
            'schema:additionalProperty': {
              [LD_TYPE]: 'schema:PropertyValue',
              'schema:name': 'qrPayloadKind',
              'schema:value': slide.qrPayloadKind,
            },
          },
    })),
  };
}

function buildOfflineHintJsonLd(checked: CheckedInput): Record<string, unknown> {
  return {
    [LD_TYPE]: 'schema:SoftwareApplication',
    'schema:name': 'Customer display offline shell',
    'schema:applicationCategory': 'PointOfSaleApplication',
    'schema:isAccessibleForFree': true,
    'schema:softwareRequirements': checked.enableOffline ? 'Service worker cache available' : 'Online display only',
    'schema:hasPart': [
      checked.publicPath,
      checked.assetPaths.cssPath,
      checked.assetPaths.scriptPath,
      checked.assetPaths.jsonPath,
    ],
  };
}

function renderHtml(
  checked: CheckedInput,
  playlist: CustomerDisplayPlaylist,
  jsonLd: Record<string, unknown>,
  qrPayloads: readonly CustomerDisplayQrPayload[],
): string {
  return [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${escapeHtml(checked.business.name)} Customer Display</title>`,
    `<link rel="stylesheet" href="${escapeHtml(checked.assetPaths.cssPath)}">`,
    `<link rel="alternate" type="application/ld+json" href="${escapeHtml(checked.assetPaths.jsonPath)}">`,
    `<script type="application/ld+json">${escapeJsonForScript(jsonLd)}</script>`,
    '</head>',
    '<body>',
    `<main class="customer-display" data-generated-at="${escapeHtml(checked.generatedAt)}">`,
    renderTransactionHtml(checked),
    renderQrHtml(qrPayloads),
    renderSlidesHtml(playlist),
    '</main>',
    `<script src="${escapeHtml(checked.assetPaths.scriptPath)}" defer></script>`,
    ...checked.enableOffline ?
        [ `<script>if('serviceWorker'in navigator){navigator.serviceWorker.register('${
          escapeJsString(checked.assetPaths.serviceWorkerPath)
        }');}</script>` ] :
        [],
    '</body>',
    '</html>',
  ].join('');
}

function renderTransactionHtml(checked: CheckedInput): string {
  const transaction = checked.transaction;
  const rows = transaction.lines.map((line): string => `<li><span>${escapeHtml(line.name)}</span><data value="${
    money(line.quantity * line.unitPrice)
  }">${escapeHtml(transaction.currency)} ${money(line.quantity * line.unitPrice)}</data></li>`).join('');
  return [
    '<section class="customer-display-transaction" aria-live="polite">',
    `<p class="customer-display-business">${escapeHtml(checked.business.name)}</p>`,
    `<h1>${escapeHtml(transaction.orderNumber ?? 'Current order')}</h1>`,
    `<p class="customer-display-status">${escapeHtml(statusLabel(transaction.status))}</p>`,
    `<ul class="customer-display-lines">${rows}</ul>`,
    '<dl class="customer-display-totals">',
    `<div><dt>Subtotal</dt><dd>${escapeHtml(transaction.currency)} ${money(transaction.subtotal)}</dd></div>`,
    ...transaction.discount === undefined ?
        [] :
        [ `<div><dt>Discount</dt><dd>${escapeHtml(transaction.currency)} ${money(transaction.discount)}</dd></div>` ],
    ...transaction.tax === undefined ?
        [] :
        [ `<div><dt>Tax</dt><dd>${escapeHtml(transaction.currency)} ${money(transaction.tax)}</dd></div>` ],
    `<div class="customer-display-total"><dt>Total</dt><dd>${escapeHtml(transaction.currency)} ${
      money(transaction.total)
    }</dd></div>`,
    '</dl>',
    '</section>',
  ].join('');
}

function renderQrHtml(qrPayloads: readonly CustomerDisplayQrPayload[]): string {
  const items = qrPayloads.map((payload): string => [
    '<li>',
    `<a href="${escapeHtml(payload.payload)}">${escapeHtml(payload.label)}</a>`,
    `<code data-qr-kind="${escapeHtml(payload.kind)}">${escapeHtml(payload.payload)}</code>`,
    '</li>',
  ].join('')).join('');
  return [
    '<section class="customer-display-links" aria-label="Customer links and QR payloads">',
    '<h2>Connect</h2>',
    `<ul>${items}</ul>`,
    '</section>',
  ].join('');
}

function renderSlidesHtml(playlist: CustomerDisplayPlaylist): string {
  const slides = playlist.slides.map((slide, index): string => [
    `<article class="customer-display-slide customer-display-slide-${escapeHtml(slide.kind)}"`,
    ` data-display-slide data-display-kind="${escapeHtml(slide.kind)}" data-start-ms="${slide.startsAtMs}"`,
    ` data-duration-ms="${slide.durationSeconds * 1_000}" aria-label="Slide ${index + 1} of ${
      playlist.slides.length
    }">`,
    ...slide.image === undefined ?
        [] :
        [
          `<img src="${escapeHtml(slide.image.url)}" alt="${escapeHtml(slide.image.alt)}" loading="${
            index === 0 ? 'eager' : 'lazy'
          }">`,
        ],
    `<h2>${escapeHtml(slide.title)}</h2>`,
    ...slide.body === undefined ? [] : [ `<p>${escapeHtml(slide.body)}</p>` ],
    ...slide.qrPayloadKind === undefined ?
        [] :
        [ `<p class="customer-display-qr-hint">QR: ${escapeHtml(slide.qrPayloadKind)}</p>` ],
    ...slide.action === undefined ?
        [] :
        [ `<a class="customer-display-cta" href="${escapeHtml(slide.action.url)}">${
          escapeHtml(slide.action.label)
        }</a>` ],
    '</article>',
  ].join('')).join('');

  return [
    `<section class="customer-display-deck" data-display-deck data-playlist-mode="${escapeHtml(playlist.mode)}"`,
    ` data-playlist-loop="${playlist.loop}" data-total-duration-ms="${playlist.totalDurationSeconds * 1_000}"`,
    ' role="region" aria-roledescription="carousel" aria-label="Customer display playlist">',
    '<button class="customer-display-pause" type="button" data-display-pause aria-pressed="false">Pause</button>',
    slides,
    '</section>',
  ].join('');
}

function renderCss(): string {
  return [
    ':root{color-scheme:light dark;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;}',
    'body{margin:0;background:#101820;color:#f7f9fb;}',
    '.customer-display{min-height:100vh;display:grid;',
    'grid-template-columns:minmax(22rem,2fr) minmax(18rem,1fr);gap:1rem;padding:1rem;box-sizing:border-box;}',
    '.customer-display-transaction,.customer-display-links,.customer-display-deck{',
    'background:#f7f9fb;color:#101820;border-radius:8px;padding:1rem;}',
    '.customer-display-business,.customer-display-status{',
    'margin:0;color:#52616b;font-weight:700;text-transform:uppercase;}',
    '.customer-display-transaction h1{margin:.25rem 0 1rem;font-size:clamp(2rem,6vh,4rem);}',
    '.customer-display-lines{list-style:none;margin:0;padding:0;display:grid;gap:.5rem;}',
    '.customer-display-lines li,.customer-display-totals div{display:flex;justify-content:space-between;gap:1rem;}',
    '.customer-display-totals{margin:1rem 0 0;display:grid;gap:.35rem;}',
    '.customer-display-total{font-size:clamp(1.6rem,4vh,3rem);font-weight:800;',
    'border-top:2px solid #d4dde5;padding-top:.5rem;}',
    '.customer-display-links ul{list-style:none;margin:0;padding:0;display:grid;gap:.75rem;}',
    '.customer-display-links code{display:block;overflow-wrap:anywhere;font-size:.8rem;color:#52616b;}',
    '.customer-display-deck{position:relative;overflow:hidden;grid-row:span 2;}',
    '.customer-display-slide{min-height:16rem;display:grid;align-content:end;gap:.75rem;}',
    '.customer-display-slide img{width:100%;max-height:45vh;object-fit:cover;border-radius:6px;}',
    '.customer-display-slide h2{margin:0;font-size:clamp(1.8rem,5vh,3.5rem);}',
    '.customer-display-slide p{font-size:clamp(1rem,2.5vh,1.5rem);}',
    '.customer-display-cta{font-weight:800;color:#005fcc;}',
    '.customer-display-qr-hint{font-size:.9rem;font-weight:700;text-transform:uppercase;color:#52616b;}',
    '.customer-display-pause{position:absolute;top:.75rem;right:.75rem;z-index:1;}',
    '[data-display-deck][data-enhanced="true"] [data-display-slide][hidden]{display:none;}',
    '@media (max-width: 760px){.customer-display{grid-template-columns:1fr;}.customer-display-deck{grid-row:auto;}}',
    '@media (prefers-reduced-motion: reduce){.customer-display-slide{transition:none;}}',
  ].join('\n');
}

function renderScript(): string {
  return [
    '(() => {',
    '  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;',
    '  for (const deck of document.querySelectorAll("[data-display-deck]")) {',
    '    const slides = [...deck.querySelectorAll("[data-display-slide]")];',
    '    if (slides.length === 0) continue;',
    '    deck.dataset.enhanced = "true";',
    '    const loop = deck.dataset.playlistLoop !== "false";',
    '    const pause = deck.querySelector("[data-display-pause]");',
    '    let index = 0;',
    '    let timer;',
    '    let paused = reduceMotion;',
    '    const show = (next) => {',
    '      index = (next + slides.length) % slides.length;',
    '      slides.forEach((slide, pos) => { slide.hidden = pos !== index; });',
    '    };',
    '    const schedule = () => {',
    '      window.clearTimeout(timer);',
    '      if (paused || slides.length < 2) return;',
    '      const duration = Number(slides[index].dataset.durationMs || "8000");',
    '      timer = window.setTimeout(() => {',
    '        if (!loop && index === slides.length - 1) return;',
    '        show(index + 1);',
    '        schedule();',
    '      }, duration);',
    '    };',
    '    pause?.addEventListener("click", () => {',
    '      paused = !paused;',
    '      pause.setAttribute("aria-pressed", String(paused));',
    '      pause.textContent = paused ? "Play" : "Pause";',
    '      schedule();',
    '    });',
    '    deck.addEventListener("keydown", (event) => {',
    '      if (event.key === "ArrowRight") { show(index + 1); schedule(); }',
    '      if (event.key === "ArrowLeft") { show(index - 1); schedule(); }',
    '    });',
    '    show(0);',
    '    schedule();',
    '  }',
    '  const displayIri = window.location.href.split("#")[0].split("?")[0];',
    '  const stateIri = displayIri.endsWith("/") ? displayIri + "state" : displayIri + "/state";',
    '  async function connectNotifications(topic) {',
    '    try {',
    '      const res = await fetch(topic, { method: "HEAD" });',
    '      const updatesVia = res.headers.get("updates-via");',
    '      if (updatesVia) {',
    '        const ws = new WebSocket(updatesVia, ["solid-0.1"]);',
    '        ws.onopen = () => ws.send("sub " + topic);',
    '        ws.onmessage = (msg) => { if (msg.data && msg.data.startsWith("pub ")) window.location.reload(); };',
    '        return;',
    '      }',
    '      const subUrl = new URL("/.notifications/WebSocketChannel2023/", window.location.origin).href;',
    '      const subRes = await fetch(subUrl, {',
    '        method: "POST",',
    '        headers: { "content-type": "application/ld+json" },',
    '        body: JSON.stringify({',
    '          "@context": ["https://www.w3.org/ns/solid/notification/v1"],',
    '          type: "http://www.w3.org/ns/solid/notifications#WebSocketChannel2023",',
    '          topic: topic',
    '        })',
    '      });',
    '      if (subRes.ok) {',
    '        const body = await subRes.json();',
    '        const ws = new WebSocket(body.receiveFrom);',
    '        ws.onmessage = () => window.location.reload();',
    '      }',
    '    } catch (e) { console.error("Notification connect failed:", e); }',
    '  }',
    '  connectNotifications(displayIri);',
    '  connectNotifications(stateIri);',
    '})();',
  ].join('\n');
}

function renderServiceWorker(checked: CheckedInput): string {
  const cacheName = `databox-customer-display-${hash([
    checked.publicPath,
    checked.assetPaths.cssPath,
    checked.assetPaths.scriptPath,
    checked.assetPaths.jsonPath,
  ].join('|'))}`;
  const paths = [
    checked.publicPath,
    checked.assetPaths.cssPath,
    checked.assetPaths.scriptPath,
    checked.assetPaths.jsonPath,
  ];
  return [
    `const CACHE_NAME = ${JSON.stringify(cacheName)};`,
    `const DISPLAY_PATHS = ${JSON.stringify(paths)};`,
    'self.addEventListener("install", (event) => {',
    '  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(DISPLAY_PATHS)).catch(() => undefined));',
    '});',
    'self.addEventListener("fetch", (event) => {',
    '  const url = new URL(event.request.url);',
    '  if (!DISPLAY_PATHS.includes(url.pathname)) return;',
    '  event.respondWith(fetch(event.request).then((response) => {',
    '    const copy = response.clone();',
    '    caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));',
    '    return response;',
    '  }).catch(() => caches.match(event.request)));',
    '});',
  ].join('\n');
}

function htmlHeaders(maxAge: number): CustomerDisplayHeaders {
  return {
    [HEADER_CONTENT_TYPE]: 'text/html; charset=utf-8',
    [HEADER_CACHE_CONTROL]: `private, max-age=${maxAge}, stale-while-revalidate=300`,
    [HEADER_VARY]: 'accept',
  };
}

function jsonHeaders(maxAge: number): CustomerDisplayHeaders {
  return {
    [HEADER_CONTENT_TYPE]: 'application/ld+json; charset=utf-8',
    [HEADER_CACHE_CONTROL]: `private, max-age=${maxAge}, stale-while-revalidate=300`,
    [HEADER_VARY]: 'accept',
  };
}

function assetHeaders(contentType: string, maxAge: number): CustomerDisplayHeaders {
  return {
    [HEADER_CONTENT_TYPE]: contentType,
    [HEADER_CACHE_CONTROL]: `public, max-age=${maxAge}, stale-while-revalidate=86400`,
    [HEADER_VARY]: 'accept',
  };
}

function isTransactionStatus(value: string): value is CustomerDisplayTransactionStatus {
  return [ 'building', 'pending-payment', 'paid', 'cancelled', 'refunded' ].includes(value);
}

function orderStatus(status: CustomerDisplayTransactionStatus): string {
  const statuses: Record<CustomerDisplayTransactionStatus, string> = {
    building: 'OrderProcessing',
    'pending-payment': 'OrderPaymentDue',
    paid: 'OrderDelivered',
    cancelled: 'OrderCancelled',
    refunded: 'OrderReturned',
  };
  return statuses[status];
}

function statusLabel(status: CustomerDisplayTransactionStatus): string {
  const labels: Record<CustomerDisplayTransactionStatus, string> = {
    building: 'Building order',
    'pending-payment': 'Payment due',
    paid: 'Paid',
    cancelled: 'Cancelled',
    refunded: 'Refunded',
  };
  return labels[status];
}

function priceSpecification(name: string, price: number, currency: string): Record<string, unknown> {
  return {
    [LD_TYPE]: 'schema:PriceSpecification',
    'schema:name': name,
    'schema:price': money(price),
    'schema:priceCurrency': currency,
  };
}

function validatePublicPath(value: string, label: string): string {
  const checked = requireText(value, `A ${label}`, 200);
  if (!checked.startsWith('/')) {
    throw new BadRequestHttpError(`A ${label} must start with /.`);
  }
  if (checked === CONTROL_PLANE_PATH || checked.startsWith(`${CONTROL_PLANE_PATH}/`)) {
    throw new BadRequestHttpError(`A ${label} must not be under the protected IPMS control plane.`);
  }
  return checked;
}

function validateCacheMaxAge(value: number): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new BadRequestHttpError('A customer display cache max-age must be a non-negative integer.');
  }
  return value;
}

function validateSlideDuration(value: number): number {
  if (!Number.isInteger(value) || value < 3 || value > 120) {
    throw new BadRequestHttpError('A customer display slide duration must be an integer between 3 and 120 seconds.');
  }
  return value;
}

function requireAbsoluteUri(value: unknown, field: string): string {
  const checked = requireText(value, field, 300);
  if (!URL.canParse(checked)) {
    throw new BadRequestHttpError(`${field} must be an absolute URI.`);
  }
  return new URL(checked).href;
}

function requireHttpUri(value: unknown, field: string): string {
  const checked = requireAbsoluteUri(value, field);
  const url = new URL(checked);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new BadRequestHttpError(`${field} must be an HTTP(S) URI.`);
  }
  return url.href;
}

function requireText(value: unknown, field: string, maxLength = MAX_TEXT_LENGTH): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new BadRequestHttpError(`${field} must be a non-empty string.`);
  }
  const checked = value.trim();
  if (checked.length > maxLength) {
    throw new BadRequestHttpError(`${field} must be ${maxLength} characters or fewer.`);
  }
  return checked;
}

function requireMoney(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new BadRequestHttpError(`${field} must be a non-negative number.`);
  }
  return Math.round(value * 100) / 100;
}

function requirePositiveNumber(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new BadRequestHttpError(`${field} must be greater than 0.`);
  }
  return value;
}

function requireNonNegativeInteger(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new BadRequestHttpError(`${field} must be a non-negative integer.`);
  }
  return value;
}

function requireCurrency(value: unknown, field: string): string {
  const checked = requireText(value, field, 3).toUpperCase();
  if (!/^[A-Z]{3}$/u.test(checked)) {
    throw new BadRequestHttpError(`${field} must be an ISO 4217 currency code.`);
  }
  return checked;
}

function requireIsoDate(value: unknown, field: string): string {
  const checked = requireText(value, `A customer display ${field}`, 80);
  if (Number.isNaN(Date.parse(checked))) {
    throw new BadRequestHttpError(`A customer display ${field} must be an ISO date/time.`);
  }
  return checked;
}

function money(value: number): string {
  return value.toFixed(2);
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll('\'', '&#39;');
}

function escapeJsonForScript(value: Record<string, unknown>): string {
  return JSON.stringify(value).replaceAll('<', '\\u003C');
}

function escapeJsString(value: string): string {
  return value.replaceAll('\\', '\\\\').replaceAll('\'', '\\\'').replaceAll('<', '\\x3C');
}

function hash(value: string): string {
  let result = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.codePointAt(index) ?? 0;
    result = Math.imul(result, 16_777_619);
  }
  return (result >>> 0).toString(16);
}
