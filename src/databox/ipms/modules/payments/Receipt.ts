import { BadRequestHttpError } from '../../../../util/errors/BadRequestHttpError';

// JSON-LD keywords as constants so they can be used as computed keys (the linter's naming
// convention forbids `@`-prefixed object-literal property names).
const LD_CONTEXT = '@context';
const LD_TYPE = '@type';

export interface ReceiptLineItem {
  readonly name: string;
  readonly quantity: number;
  readonly unitPrice: number;
}

export interface ReceiptInput {
  readonly orderId: string;
  readonly seller: string;
  readonly currency: string;
  /** ISO date supplied by the caller (this function is pure — it never reads the clock). */
  readonly orderDate: string;
  readonly items: readonly ReceiptLineItem[];
  readonly customer?: string;
}

function money(value: number): string {
  return value.toFixed(2);
}

/**
 * Build a receipt as schema.org JSON-LD — an `Order` at `PaymentComplete` — from a completed order
 * (see `databox/solid-ipms-plan.md`, §10.5 / §3). Pure and deterministic (the order date is supplied by
 * the caller). JSON-LD is RDF, so the receipt is a portable, verifiable resource that lives in the pod.
 */
export function buildReceipt(input: ReceiptInput): Record<string, unknown> {
  if (input.orderId.trim().length === 0) {
    throw new BadRequestHttpError('A receipt needs an order id.');
  }
  if (input.currency.trim().length === 0) {
    throw new BadRequestHttpError('A receipt needs a currency.');
  }
  if (input.items.length === 0) {
    throw new BadRequestHttpError('A receipt needs at least one line item.');
  }

  const total = input.items.reduce((sum, item): number => sum + (item.quantity * item.unitPrice), 0);
  const acceptedOffer = input.items.map((item): Record<string, unknown> => ({
    [LD_TYPE]: 'Offer',
    itemOffered: { [LD_TYPE]: 'Product', name: item.name },
    price: money(item.unitPrice),
    priceCurrency: input.currency,
    eligibleQuantity: { [LD_TYPE]: 'QuantitativeValue', value: item.quantity },
  }));

  const receipt: Record<string, unknown> = {
    [LD_CONTEXT]: 'https://schema.org/',
    [LD_TYPE]: 'Order',
    orderNumber: input.orderId,
    orderDate: input.orderDate,
    paymentStatus: 'https://schema.org/PaymentComplete',
    seller: { [LD_TYPE]: 'Organization', name: input.seller },
    acceptedOffer,
    priceCurrency: input.currency,
    totalPaymentDue: { [LD_TYPE]: 'PriceSpecification', price: money(total), priceCurrency: input.currency },
  };
  if (input.customer !== undefined) {
    receipt.customer = { [LD_TYPE]: 'Person', name: input.customer };
  }
  return receipt;
}
