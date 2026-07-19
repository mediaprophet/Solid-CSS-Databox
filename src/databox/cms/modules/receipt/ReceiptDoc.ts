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

export interface ReceiptDoc {
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

/**
 * Build a printable receipt document — organisation info, lines, totals, and a QR payload linking
 * to the consumer's digital RDF/VC receipt in the pod (see `databox/solid-cms-plan.md`, §10.5).
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
    return {
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
  }

  return {
    org: input.org,
    receiptId: input.receiptId,
    date: input.date,
    currency: input.currency,
    lines,
    subtotal,
    total: subtotal,
    qr,
  };
}
