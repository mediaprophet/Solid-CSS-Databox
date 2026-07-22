import { BadRequestHttpError } from '../../../../util/errors/BadRequestHttpError';

export interface ReceiptOrg {
  readonly name: string;
  readonly abn?: string;
  readonly address?: string;
  readonly url?: string;
}

export interface ReceiptDocLine {
  readonly name: string;
  readonly quantity: number;
  readonly unitPrice: number;
}

export interface ReceiptDocInput {
  readonly org: ReceiptOrg;
  readonly receiptId: string;
  readonly date: string;
  readonly lines: readonly ReceiptDocLine[];
  readonly currency: string;
  readonly taxPercent?: number;
  readonly digitalReceiptUrl: string;
}

export interface PrintableLine {
  readonly name: string;
  readonly quantity: number;
  readonly amount: string;
}

export interface ReceiptQr {
  readonly payload: string;
  readonly caption: string;
}

export interface ReceiptDocBase {
  readonly org: ReceiptOrg;
  readonly receiptId: string;
  readonly date: string;
  readonly currency: string;
  readonly lines: PrintableLine[];
  readonly subtotal: string;
  readonly tax?: string;
  readonly total: string;
  readonly qr: ReceiptQr;
}

export interface NativeReceiptPrintJobDescriptor {
  readonly '@context': Record<string, string>;
  readonly type: 'DataboxNativeReceiptPrintJob';
  readonly id: string;
  readonly capability: 'native-edge:thermal-receipt-print';
  readonly status: 'unavailable';
  readonly unavailableReason: string;
  readonly target: {
    readonly kind: 'thermal-printer';
    readonly protocol: 'escpos';
  };
  readonly payload: {
    readonly format: 'databox.receipt.v1';
    readonly receiptId: string;
    readonly date: string;
    readonly currency: string;
    readonly lines: readonly PrintableLine[];
    readonly subtotal: string;
    readonly tax?: string;
    readonly total: string;
    readonly qr: ReceiptQr & {
      readonly render: 'native-edge';
    };
  };
  readonly boundary: {
    readonly hardwareIo: 'native-edge-only';
    readonly browserAction: 'generate-descriptor-only';
  };
}

export interface ReceiptDoc extends ReceiptDocBase {
  readonly nativeEdgePrintJob: NativeReceiptPrintJobDescriptor;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function requireUri(value: string, field: string): string {
  try {
    return new URL(value).href;
  } catch {
    throw new BadRequestHttpError(`A receipt ${field} must be an absolute URI.`);
  }
}

export function buildNativeReceiptPrintJob(document: ReceiptDocBase): NativeReceiptPrintJobDescriptor {
  return {
    '@context': {
      schema: 'https://schema.org/',
      cms: 'urn:solid-server:databox:cms#',
      nativeEdge: 'urn:solid-server:databox:native-edge#',
    },
    type: 'DataboxNativeReceiptPrintJob',
    id: `urn:solid-server:databox:native-edge:receipt-print-job:${encodeURIComponent(document.receiptId)}`,
    capability: 'native-edge:thermal-receipt-print',
    status: 'unavailable',
    unavailableReason:
      'No Rust/native-edge printer connector is attached to this CMS control plane.',
    target: {
      kind: 'thermal-printer',
      protocol: 'escpos',
    },
    payload: {
      format: 'databox.receipt.v1',
      receiptId: document.receiptId,
      date: document.date,
      currency: document.currency,
      lines: document.lines,
      subtotal: document.subtotal,
      ...document.tax === undefined ? {} : { tax: document.tax },
      total: document.total,
      qr: {
        ...document.qr,
        render: 'native-edge',
      },
    },
    boundary: {
      hardwareIo: 'native-edge-only',
      browserAction: 'generate-descriptor-only',
    },
  };
}

/**
 * Build a printable receipt document: organisation info, lines, totals, and a QR payload linking
 * to the consumer's digital RDF/VC receipt in the pod (see `databox/solid-cms-plan.md`, section 10.5).
 * QR image rendering and thermal printing are handled by the Rust core; this unit produces the
 * structured document and QR payload string only. Pure and deterministic.
 */
export function buildReceiptDoc(input: ReceiptDocInput): ReceiptDoc {
  if (input.org.name.trim().length === 0) {
    throw new BadRequestHttpError('A receipt needs an organisation name.');
  }
  if (input.receiptId.trim().length === 0) {
    throw new BadRequestHttpError('A receipt needs a receipt id.');
  }
  if (input.lines.length === 0) {
    throw new BadRequestHttpError('A receipt needs at least one line.');
  }
  if (input.currency.trim().length === 0) {
    throw new BadRequestHttpError('A receipt needs a currency.');
  }
  const digitalReceiptUrl = requireUri(input.digitalReceiptUrl, 'digitalReceiptUrl');

  const lines: PrintableLine[] = input.lines.map((line): PrintableLine => ({
    name: line.name,
    quantity: line.quantity,
    amount: (line.quantity * line.unitPrice).toFixed(2),
  }));

  let subtotalNum = 0;
  for (const line of input.lines) {
    subtotalNum += line.quantity * line.unitPrice;
  }
  const subtotal = subtotalNum.toFixed(2);

  const qr: ReceiptQr = {
    payload: digitalReceiptUrl,
    caption: 'Scan for your digital receipt',
  };

  if (input.taxPercent !== undefined) {
    const taxNum = round2(subtotalNum * input.taxPercent / 100);
    const total = round2(subtotalNum + taxNum).toFixed(2);
    const document: ReceiptDocBase = {
      org: input.org,
      receiptId: input.receiptId,
      date: input.date,
      currency: input.currency,
      lines,
      subtotal,
      tax: taxNum.toFixed(2),
      total,
      qr,
    };
    return {
      ...document,
      nativeEdgePrintJob: buildNativeReceiptPrintJob(document),
    };
  }

  const document: ReceiptDocBase = {
    org: input.org,
    receiptId: input.receiptId,
    date: input.date,
    currency: input.currency,
    lines,
    subtotal,
    total: subtotal,
    qr,
  };
  return {
    ...document,
    nativeEdgePrintJob: buildNativeReceiptPrintJob(document),
  };
}
