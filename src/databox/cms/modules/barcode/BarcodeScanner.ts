import { BadRequestHttpError } from '../../../../util/errors/BadRequestHttpError';

const LD_CONTEXT = '@context';
const LD_TYPE = '@type';
const LD_ID = '@id';

/**
 * GS1 application identifier prefixes.
 * @see https://www.gs1.org/standards/barcodes/application-identifiers
 */
export const GS1_AIS: Record<string, string> = {
  '00': 'SSCC (Serial Shipping Container Code)',
  '01': 'GTIN (Global Trade Item Number)',
  '02': 'GTIN of contained trade items',
  '10': 'Batch or lot number',
  '11': 'Production date (YYMMDD)',
  '13': 'Packaging date (YYMMDD)',
  '15': 'Best before date (YYMMDD)',
  '17': 'Expiration date (YYMMDD)',
  '20': 'Internal product variant',
  '21': 'Serial number',
  '22': 'Consumer product variant',
  '240': 'Additional product identification',
  '241': 'Customer part number',
  '242': 'Made-to-order variation number',
  '243': 'Packager component identifier',
  '250': 'Additional serial number',
  '251': 'Source entity reference',
  '253': 'Global Document Type Identifier (GDTI)',
  '254': 'GLN extension component',
  '255': 'Global Coupon Number (GCN)',
  '30': 'Count of items',
  '310': 'Net weight (kg)',
  '311': 'Length (m)',
  '312': 'Width (m)',
  '313': 'Height (m)',
  '314': 'Area (m²)',
  '315': 'Net volume (l)',
  '316': 'Net volume (m³)',
  '320': 'Net weight (lb)',
  '330': 'Gross weight (kg)',
  '337': 'Kilograms per square metre',
  '390': 'Amount payable (local currency)',
  '391': 'Amount payable (with ISO currency)',
  '392': 'Amount payable for variable measure (local)',
  '393': 'Amount payable for variable measure (with ISO currency)',
  '400': "Customer's purchase order number",
  '401': 'Global Identification Number for Consignment (GINC)',
  '402': 'Global Shipment Identification Number (GSIN)',
  '403': 'Routing code',
  '410': 'Ship to / Deliver to GLN',
  '411': 'Bill to GLN',
  '412': 'Purchased from GLN',
  '413': 'Ship for / Deliver for - Forward to GLN',
  '414': 'Identification of a physical location GLN',
  '415': 'Invoice to GLN',
  '416': 'Production / Service location GLN',
  '420': 'Ship to / Deliver to postal code (single postal authority)',
  '421': 'Ship to / Deliver to postal code (with ISO country)',
  '422': 'Country of origin (ISO 3166)',
  '423': 'Country of initial processing',
  '424': 'Country of processing',
  '425': 'Country of disassembly',
  '426': 'Country covering full process chain',
  '7001': 'NSN (NATO Stock Number)',
  '7002': 'Meat cut identifier',
  '7003': 'Expiry date and time (YYMMDDHHmm)',
  '7004': 'Active potency',
  '7005': 'Catch area',
  '7006': 'First freeze date',
  '7007': 'Harvest date',
  '7008': 'Aquatic species',
  '7009': 'Fishing gear type',
  '7010': 'Method of production',
  '8011': 'Component / part identifier (CPID)',
  '8012': 'Component / part identifier serial',
  '8013': 'Global Model Number (GMN)',
  '8017': 'Global Service Relation Number to identify the relationship between an organisation offering services and the provider of services',
  '8018': 'Global Service Relation Number to identify the relationship between an organisation offering services and the recipient of services',
  '8019': 'Service Relation Instance Number (SRIN)',
  '8020': 'Payment slip reference number',
  '8110': 'Crypto key (EPC)',
  '8111': 'Encoding table index',
  '8112': 'Product change information',
  '8200': 'Extended packaging URL',
  '90': 'Information mutually agreed between trading partners',
  '91': 'Internal company codes',
  '92': 'Internal company codes',
  '93': 'Internal company codes',
  '94': 'Internal company codes',
  '95': 'Internal company codes',
  '96': 'Internal company codes',
  '97': 'Internal company codes',
  '98': 'Internal company codes',
  '99': 'Internal company codes',
};

export interface Gs1ParseResult {
  readonly ai: string;
  readonly aiDescription: string;
  readonly value: string;
}

export interface BarcodeScanResult {
  readonly raw: string;
  readonly symbology: BarcodeSymbology;
  readonly gs1Parsed?: Gs1ParseResult[];
  readonly gtin?: string;
  readonly serialNumber?: string;
  readonly batchLot?: string;
  readonly expiryDate?: string;
  readonly record: Record<string, unknown>;
}

export type BarcodeSymbology =
  | 'EAN-13'
  | 'EAN-8'
  | 'UPC-A'
  | 'UPC-E'
  | 'CODE-128'
  | 'CODE-39'
  | 'QR'
  | 'DATA-MATRIX'
  | 'GS1-DATAMATRIX'
  | 'GS1-128'
  | 'PDF417'
  | 'AZTEC'
  | 'UNKNOWN';

export interface BarcodeScanInput {
  readonly raw: string;
  readonly symbology?: BarcodeSymbology;
  readonly organisation?: string;
  readonly scannedAt?: string;
}

function requireNonEmpty(value: string, field: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new BadRequestHttpError(`A barcode scan ${field} must not be empty.`);
  }
  return trimmed;
}

function detectSymbology(raw: string): BarcodeSymbology {
  if (/^\d{8}$/.test(raw)) return 'EAN-8';
  if (/^\d{12}$/.test(raw)) return 'UPC-A';
  if (/^\d{13}$/.test(raw)) return 'EAN-13';
  if (/^\d{6}$/.test(raw)) return 'UPC-E';
  if (raw.startsWith('(') && /\(\d+\)/.test(raw)) return 'GS1-128';
  if (raw.startsWith(']d2')) return 'GS1-DATAMATRIX';
  if (raw.startsWith(']Q')) return 'QR';
  if (raw.startsWith(']d1')) return 'DATA-MATRIX';
  if (/^[A-Z0-9\-.$/+% ]+$/.test(raw) && raw.length <= 43) return 'CODE-39';
  return 'UNKNOWN';
}

/**
 * Parse GS1 AI-prefixed data from a barcode string.
 * Supports both parenthesized format `(01)12345678901231(10)BATCH001`
 * and FNC1-delimited format.
 */
export function parseGs1Data(raw: string): Gs1ParseResult[] {
  const results: Gs1ParseResult[] = [];

  // Parenthesized format: (AI)value(AI)value...
  const parenRegex = /\((\d{2,4})\)([^()]+)/g;
  let match: RegExpExecArray | null;
  let found = false;

  while ((match = parenRegex.exec(raw)) !== null) {
    found = true;
    const ai = match[1];
    const value = match[2].trim();
    const description = GS1_AIS[ai] ?? `GS1 AI ${ai}`;
    results.push({ ai, aiDescription: description, value });
  }

  if (!found && raw.startsWith(']d2')) {
    // GS1 DataMatrix with FNC1 — try to parse AIs from the raw data
    const data = raw.slice(3);
    return parseGs1FixedLength(data);
  }

  return results;
}

function parseGs1FixedLength(data: string): Gs1ParseResult[] {
  const results: Gs1ParseResult[] = [];
  let pos = 0;

  while (pos < data.length) {
    const remaining = data.slice(pos);
    let ai = '';
    let value = '';

    // Try 2-digit AI first
    const ai2 = remaining.slice(0, 2);
    if (GS1_AIS[ai2]) {
      ai = ai2;
      // Fixed-length AIs
      const fixedLengths: Record<string, number> = {
        '00': 18, '01': 14, '02': 14, '03': 14,
        '11': 6, '13': 6, '15': 6, '17': 6,
        '20': 2, '30': 8,
      };
      if (fixedLengths[ai]) {
        value = remaining.slice(2, 2 + fixedLengths[ai]);
        pos += 2 + fixedLengths[ai];
      } else {
        // Variable-length — read until FNC1 (0x1d) or end
        const fnc1Index = remaining.indexOf('\x1d', 2);
        if (fnc1Index >= 0) {
          value = remaining.slice(2, fnc1Index);
          pos += fnc1Index + 1;
        } else {
          value = remaining.slice(2);
          pos = data.length;
        }
      }
      results.push({ ai, aiDescription: GS1_AIS[ai], value });
    } else {
      // Try 3-digit AI
      const ai3 = remaining.slice(0, 3);
      if (GS1_AIS[ai3]) {
        ai = ai3;
        const fnc1Index = remaining.indexOf('\x1d', 3);
        if (fnc1Index >= 0) {
          value = remaining.slice(3, fnc1Index);
          pos += fnc1Index + 1;
        } else {
          value = remaining.slice(3);
          pos = data.length;
        }
        results.push({ ai, aiDescription: GS1_AIS[ai], value });
      } else {
        // Try 4-digit AI
        const ai4 = remaining.slice(0, 4);
        if (GS1_AIS[ai4]) {
          ai = ai4;
          const fixedLengths4: Record<string, number> = {
            '3100': 6, '3101': 6, '3102': 6, '3103': 6, '3104': 6, '3105': 6,
            '3110': 6, '3111': 6, '3112': 6, '3113': 6,
            '3200': 6, '3201': 6, '3202': 6, '3203': 6,
            '3300': 6, '3301': 6, '3302': 6, '3303': 6,
            '3900': 15, '3901': 15, '3902': 15, '3903': 15,
            '3910': 18, '3911': 18, '3912': 18, '3913': 18,
            '3920': 15, '3921': 15, '3922': 15, '3923': 15,
            '3930': 18, '3931': 18, '3932': 18, '3933': 18,
          };
          if (fixedLengths4[ai]) {
            value = remaining.slice(4, 4 + fixedLengths4[ai]);
            pos += 4 + fixedLengths4[ai];
          } else {
            const fnc1Index = remaining.indexOf('\x1d', 4);
            if (fnc1Index >= 0) {
              value = remaining.slice(4, fnc1Index);
              pos += fnc1Index + 1;
            } else {
              value = remaining.slice(4);
              pos = data.length;
            }
          }
          results.push({ ai, aiDescription: GS1_AIS[ai], value });
        } else {
          break;
        }
      }
    }
  }

  return results;
}

/**
 * Validate a GTIN-13 check digit.
 */
export function validateGtinCheckDigit(gtin: string): boolean {
  if (!/^\d{8}|\d{12}|\d{13}|\d{14}$/.test(gtin)) return false;
  const digits = gtin.split('').map(Number);
  const checkDigit = digits.pop()!;
  // GS1 check digit: weight positions from right, alternating 3 and 1
  // The rightmost digit (before check) gets weight 3, next gets 1, etc.
  const reversed = digits.reverse();
  let sum = 0;
  for (let i = 0; i < reversed.length; i++) {
    sum += reversed[i] * (i % 2 === 0 ? 3 : 1);
  }
  const calculated = (10 - (sum % 10)) % 10;
  return calculated === checkDigit;
}

/**
 * Process a barcode/QR scan, detecting symbology and parsing GS1 data if present.
 */
export function processBarcodeScan(input: BarcodeScanInput): BarcodeScanResult {
  const raw = requireNonEmpty(input.raw, 'raw');
  const symbology = input.symbology ?? detectSymbology(raw);

  const record: Record<string, unknown> = {
    [LD_CONTEXT]: [ 'https://schema.org/' ],
    [LD_TYPE]: 'BarcodeScan',
    rawValue: raw,
    symbology,
  };

  let gs1Parsed: Gs1ParseResult[] | undefined;
  let gtin: string | undefined;
  let serialNumber: string | undefined;
  let batchLot: string | undefined;
  let expiryDate: string | undefined;

  if (symbology === 'GS1-128' || symbology === 'GS1-DATAMATRIX' || raw.includes('(')) {
    gs1Parsed = parseGs1Data(raw);
    if (gs1Parsed.length > 0) {
      record.gs1Data = gs1Parsed;

      for (const item of gs1Parsed) {
        if (item.ai === '01' || item.ai === '02') {
          gtin = item.value;
          record.gtin = gtin;
        }
        if (item.ai === '21') {
          serialNumber = item.value;
          record.serialNumber = serialNumber;
        }
        if (item.ai === '10') {
          batchLot = item.value;
          record.batchLot = batchLot;
        }
        if (item.ai === '17') {
          expiryDate = item.value;
          record.expiryDate = expiryDate;
        }
      }
    }
  }

  if (gtin) {
    record.checkDigitValid = validateGtinCheckDigit(gtin);
  }

  if (input.organisation) {
    record.organisation = input.organisation;
  }

  if (input.scannedAt) {
    record.scannedAt = input.scannedAt;
  } else {
    record.scannedAt = new Date().toISOString();
  }

  return {
    raw,
    symbology,
    gs1Parsed,
    gtin,
    serialNumber,
    batchLot,
    expiryDate,
    record,
  };
}

/**
 * Look up a product by GTIN in the catalogue.
 * Returns a schema.org Product reference if found.
 */
export interface ProductLookupResult {
  readonly gtin: string;
  readonly found: boolean;
  readonly productId?: string;
  readonly productName?: string;
  readonly record: Record<string, unknown>;
}

export function lookupProductByGtin(
  gtin: string,
  catalogue: ReadonlyArray<{ productId: string; gtin?: string; name: string }>,
): ProductLookupResult {
  const trimmed = requireNonEmpty(gtin, 'gtin');
  const match = catalogue.find((p) => p.gtin === trimmed);

  if (!match) {
    return {
      gtin: trimmed,
      found: false,
      record: {
        [LD_CONTEXT]: [ 'https://schema.org/' ],
        [LD_TYPE]: 'ProductLookup',
        gtin: trimmed,
        found: false,
      },
    };
  }

  return {
    gtin: trimmed,
    found: true,
    productId: match.productId,
    productName: match.name,
    record: {
      [LD_CONTEXT]: [ 'https://schema.org/' ],
      [LD_TYPE]: 'Product',
      [LD_ID]: match.productId,
      gtin: trimmed,
      name: match.name,
    },
  };
}
