import { BadRequestHttpError } from '../../../../util/errors/BadRequestHttpError';

const LD_CONTEXT = '@context';
const LD_TYPE = '@type';
const LD_ID = '@id';

/**
 * Supported accounting package formats.
 */
export type AccountingPackage =
  | 'xero' |
  'myob' |
  'quickbooks' |
  'sage' |
  'csv-generic' |
  'ofx' |
  'qif' |
  'json-ld';

export type AccountingExportType =
  | 'invoices' |
  'payments' |
  'journal-entries' |
  'tax-summary' |
  'chart-of-accounts' |
  'contacts' |
  'items' |
  'full-export';

export type AccountingImportType =
  | 'chart-of-accounts' |
  'contacts' |
  'items' |
  'opening-balances' |
  'journal-entries';

/**
 * Export input — converts CMS data to accounting package format.
 */
export interface AccountingExportInput {
  readonly id: string;
  readonly organisation: string;
  readonly package: AccountingPackage;
  readonly exportType: AccountingExportType;
  readonly periodStart: string;
  readonly periodEnd: string;
  readonly currency: string;
  readonly data: AccountingExportData;
  readonly apiKey?: string;
  readonly tenantId?: string;
}

export interface AccountingExportData {
  readonly invoices?: readonly InvoiceRecord[];
  readonly payments?: readonly PaymentRecord[];
  readonly journalEntries?: readonly JournalEntry[];
  readonly taxLines?: readonly TaxLineRecord[];
  readonly contacts?: readonly ContactRecord[];
  readonly items?: readonly ItemRecord[];
}

export interface InvoiceRecord {
  readonly id: string;
  readonly contactId: string;
  readonly contactName: string;
  readonly issueDate: string;
  readonly dueDate: string;
  readonly lineItems: readonly InvoiceLineItem[];
  readonly status: 'DRAFT' | 'SENT' | 'PAID' | 'OVERDUE' | 'VOIDED';
}

export interface InvoiceLineItem {
  readonly description: string;
  readonly quantity: number;
  readonly unitAmount: number;
  readonly taxRate: number;
  readonly accountCode?: string;
}

export interface PaymentRecord {
  readonly id: string;
  readonly invoiceId?: string;
  readonly contactId: string;
  readonly amount: number;
  readonly date: string;
  readonly method: 'CASH' | 'CARD' | 'BANK_TRANSFER' | 'CHEQUE' | 'ONLINE' | 'OTHER';
  readonly reference?: string;
}

export interface JournalEntry {
  readonly id: string;
  readonly date: string;
  readonly description: string;
  readonly lines: readonly JournalLine[];
}

export interface JournalLine {
  readonly accountCode: string;
  readonly accountName: string;
  readonly debit: number;
  readonly credit: number;
}

export interface TaxLineRecord {
  readonly jurisdictionCode: string;
  readonly taxRate: number;
  readonly taxableAmount: number;
  readonly taxAmount: number;
  readonly category: string;
}

export interface ContactRecord {
  readonly id: string;
  readonly name: string;
  readonly email?: string;
  readonly phone?: string;
  readonly address?: string;
  readonly taxNumber?: string;
  readonly isSupplier: boolean;
  readonly isCustomer: boolean;
}

export interface ItemRecord {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly description?: string;
  readonly unitPrice: number;
  readonly taxRate: number;
  readonly accountCode?: string;
}

export interface AccountingExportResult {
  readonly id: string;
  readonly package: AccountingPackage;
  readonly exportType: AccountingExportType;
  readonly format: string;
  readonly content: string;
  readonly recordCount: number;
  readonly totalAmount: number;
  readonly record: Record<string, unknown>;
}

export interface AccountingImportInput {
  readonly id: string;
  readonly organisation: string;
  readonly package: AccountingPackage;
  readonly importType: AccountingImportType;
  readonly content: string;
  readonly format: string;
}

export interface AccountingImportResult {
  readonly id: string;
  readonly package: AccountingPackage;
  readonly importType: AccountingImportType;
  readonly imported: number;
  readonly skipped: number;
  readonly warnings: string[];
  readonly records: Record<string, unknown>[];
  readonly record: Record<string, unknown>;
}

function requireNonEmpty(value: string, field: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new BadRequestHttpError(`An accounting ${field} must not be empty.`);
  }
  return trimmed;
}

function requireUri(value: string, field: string): string {
  try {
    return new URL(value).href;
  } catch {
    throw new BadRequestHttpError(`An accounting ${field} must be an absolute URI.`);
  }
}

function requireDate(value: string, field: string): string {
  const date = new Date(value);
  if (value.trim().length === 0 || Number.isNaN(date.getTime())) {
    throw new BadRequestHttpError(`An accounting ${field} must be a valid date.`);
  }
  return value;
}

function requireCurrency(value: string): string {
  const currency = value.trim().toUpperCase();
  if (!/^[A-Z]{3}$/u.test(currency)) {
    throw new BadRequestHttpError('Accounting currency must be a three-letter ISO 4217 code.');
  }
  return currency;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Export CMS data to an accounting package format.
 */
export function exportToAccounting(input: AccountingExportInput): AccountingExportResult {
  const id = requireUri(input.id, 'id');
  const organisation = requireUri(input.organisation, 'organisation');
  const pkg = input.package;
  requireNonEmpty(pkg, 'package');
  const periodStart = requireDate(input.periodStart, 'periodStart');
  const periodEnd = requireDate(input.periodEnd, 'periodEnd');
  const currency = requireCurrency(input.currency);

  let content: string;
  let recordCount = 0;
  let totalAmount = 0;

  switch (pkg) {
    case 'xero':
      ({ content, recordCount, totalAmount } = exportXero(input));
      break;
    case 'myob':
      ({ content, recordCount, totalAmount } = exportMyob(input));
      break;
    case 'quickbooks':
      ({ content, recordCount, totalAmount } = exportQuickBooks(input));
      break;
    case 'sage':
      ({ content, recordCount, totalAmount } = exportXero(input));
      break;
    case 'csv-generic':
      ({ content, recordCount, totalAmount } = exportCsv(input));
      break;
    case 'json-ld':
      ({ content, recordCount, totalAmount } = exportJsonLd(input));
      break;
    case 'ofx':
      ({ content, recordCount, totalAmount } = exportOfx(input));
      break;
    case 'qif':
      ({ content, recordCount, totalAmount } = exportQif(input));
      break;
    default:
      throw new BadRequestHttpError(`Unsupported accounting package: ${pkg as string}`);
  }

  const record: Record<string, unknown> = {
    [LD_CONTEXT]: [ 'https://schema.org/' ],
    [LD_TYPE]: 'DataExport',
    [LD_ID]: id,
    provider: { [LD_ID]: organisation },
    accountingPackage: pkg,
    exportType: input.exportType,
    periodStart,
    periodEnd,
    currency,
    recordCount,
    totalAmount: round2(totalAmount),
    encodingFormat: getFormatMimeType(pkg),
  };

  return {
    id,
    package: pkg,
    exportType: input.exportType,
    format: getFormatMimeType(pkg),
    content,
    recordCount,
    totalAmount: round2(totalAmount),
    record,
  };
}

/**
 * Import data from an accounting package into CMS format.
 */
export function importFromAccounting(input: AccountingImportInput): AccountingImportResult {
  const id = requireNonEmpty(input.id, 'id');
  const pkg = input.package;
  requireNonEmpty(pkg, 'package');
  requireNonEmpty(input.content, 'content');

  const records: Record<string, unknown>[] = [];
  const warnings: string[] = [];
  let imported = 0;
  let skipped = 0;

  if (pkg === 'csv-generic' || input.format === 'text/csv') {
    const lines = input.content.split('\n').filter((l): boolean => l.trim().length > 0);
    if (lines.length < 2) {
      return {
        id,
        package: pkg,
        importType: input.importType,
        imported: 0,
        skipped: 0,
        warnings: [ 'No data rows found in CSV.' ],
        records: [],
        record: {
          [LD_CONTEXT]: [ 'https://schema.org/' ],
          [LD_TYPE]: 'DataFeed',
          [LD_ID]: id,
          imported: 0,
        },
      };
    }

    const headers = parseCsvLine(lines[0]);
    for (let i = 1; i < lines.length; i++) {
      const values = parseCsvLine(lines[i]);
      if (values.length !== headers.length) {
        warnings.push(`Row ${i}: column count mismatch (${values.length} vs ${headers.length}), skipping.`);
        skipped += 1;
        continue;
      }
      const obj: Record<string, unknown> = {};
      for (const [ j, header ] of headers.entries()) {
        obj[header] = values[j];
      }
      records.push(obj);
      imported += 1;
    }
  } else if (pkg === 'json-ld' || input.format === 'application/ld+json' || input.format === 'application/json') {
    const parsed: unknown = JSON.parse(input.content);
    const items: unknown[] = Array.isArray(parsed) ?
      parsed :
        (parsed as Record<string, unknown[]>).resources ??
        (parsed as Record<string, unknown[]>).contacts ??
        (parsed as Record<string, unknown[]>).items ??
        [ parsed ];
    for (const item of items) {
      if (typeof item === 'object' && item !== null) {
        records.push(item as Record<string, unknown>);
        imported += 1;
      } else {
        skipped += 1;
      }
    }
  } else if (pkg === 'qif') {
    // QIF format: !Type:Bank, D date, T amount, P payee, M memo, ^ end
    const blocks = input.content.split(/^\^/mu).filter((b): boolean => b.trim().length > 0);
    for (const block of blocks) {
      const txn: Record<string, unknown> = {};
      for (const line of block.split('\n')) {
        const trimmed = line.trim();
        if (trimmed.length === 0) {
          continue;
        }
        const code = trimmed[0];
        const value = trimmed.slice(1);
        if (code === 'D') {
          txn.date = value;
        }
        if (code === 'T') {
          txn.amount = value;
        }
        if (code === 'P') {
          txn.payee = value;
        }
        if (code === 'M') {
          txn.memo = value;
        }
        if (code === 'N') {
          txn.reference = value;
        }
      }
      if (Object.keys(txn).length > 0) {
        records.push(txn);
        imported += 1;
      } else {
        skipped += 1;
      }
    }
  } else if (pkg === 'ofx') {
    // OFX format: parse <STMTTRN> blocks
    const txnRegex = /<STMTTRN>(.*?)<\/STMTTRN>/gsu;
    let match = txnRegex.exec(input.content);
    while (match !== null) {
      const block = match[1];
      const txn: Record<string, unknown> = {};
      const dtposted = /<DTPOSTED>([^<]*)/u.exec(block);
      const trnamt = /<TRNAMT>([^<]*)/u.exec(block);
      const name = /<NAME>([^<]*)/u.exec(block);
      const memo = /<MEMO>([^<]*)/u.exec(block);
      const fitid = /<FITID>([^<]*)/u.exec(block);
      if (dtposted) {
        txn.date = dtposted[1].trim();
      }
      if (trnamt) {
        txn.amount = trnamt[1].trim();
      }
      if (name) {
        txn.payee = name[1].trim();
      }
      if (memo) {
        txn.memo = memo[1].trim();
      }
      if (fitid) {
        txn.reference = fitid[1].trim();
      }
      records.push(txn);
      imported += 1;
      match = txnRegex.exec(input.content);
    }
  } else {
    warnings.push(`Import from ${pkg} format is not yet supported. Use CSV, JSON-LD, QIF, or OFX.`);
  }

  return {
    id,
    package: pkg,
    importType: input.importType,
    imported,
    skipped,
    warnings,
    records,
    record: {
      [LD_CONTEXT]: [ 'https://schema.org/' ],
      [LD_TYPE]: 'DataFeed',
      [LD_ID]: id,
      accountingPackage: pkg,
      importType: input.importType,
      imported,
      skipped,
    },
  };
}

// --- Format-specific exporters ---

function exportXero(input: AccountingExportInput): { content: string; recordCount: number; totalAmount: number } {
  const lines: string[] = [];
  let count = 0;
  let total = 0;

  if (input.exportType === 'invoices' && input.data.invoices) {
    lines.push(
      'InvoiceNumber,ContactName,IssueDate,DueDate,Status,' +
      'LineDescription,Quantity,UnitAmount,TaxRate,AccountCode',
    );
    for (const inv of input.data.invoices) {
      for (const line of inv.lineItems) {
        lines.push([
          inv.id,
          inv.contactName,
          inv.issueDate,
          inv.dueDate,
          inv.status,
          line.description,
          line.quantity,
          line.unitAmount,
          line.taxRate,
          line.accountCode ?? '',
        ].join(','));
        total += line.quantity * line.unitAmount;
        count += 1;
      }
    }
  } else if (input.exportType === 'payments' && input.data.payments) {
    lines.push('PaymentID,InvoiceID,ContactID,Amount,Date,Method,Reference');
    for (const pmt of input.data.payments) {
      lines.push([
        pmt.id,
        pmt.invoiceId ?? '',
        pmt.contactId,
        pmt.amount,
        pmt.date,
        pmt.method,
        pmt.reference ?? '',
      ].join(','));
      total += pmt.amount;
      count += 1;
    }
  } else if (input.exportType === 'journal-entries' && input.data.journalEntries) {
    lines.push('JournalID,Date,Description,AccountCode,AccountName,Debit,Credit');
    for (const je of input.data.journalEntries) {
      for (const line of je.lines) {
        lines.push([
          je.id,
          je.date,
          je.description,
          line.accountCode,
          line.accountName,
          line.debit,
          line.credit,
        ].join(','));
        count += 1;
      }
    }
  } else if (input.exportType === 'tax-summary' && input.data.taxLines) {
    lines.push('JurisdictionCode,TaxRate,TaxableAmount,TaxAmount,Category');
    for (const tl of input.data.taxLines) {
      lines.push([ tl.jurisdictionCode, tl.taxRate, tl.taxableAmount, tl.taxAmount, tl.category ].join(','));
      total += tl.taxAmount;
      count += 1;
    }
  } else if (input.exportType === 'contacts' && input.data.contacts) {
    lines.push('ContactID,Name,Email,Phone,Address,TaxNumber,IsSupplier,IsCustomer');
    for (const c of input.data.contacts) {
      lines.push([
        c.id,
        c.name,
        c.email ?? '',
        c.phone ?? '',
        c.address ?? '',
        c.taxNumber ?? '',
        c.isSupplier,
        c.isCustomer,
      ].join(','));
      count += 1;
    }
  } else if (input.exportType === 'items' && input.data.items) {
    lines.push('ItemID,Code,Name,Description,UnitPrice,TaxRate,AccountCode');
    for (const item of input.data.items) {
      lines.push([
        item.id,
        item.code,
        item.name,
        item.description ?? '',
        item.unitPrice,
        item.taxRate,
        item.accountCode ?? '',
      ].join(','));
      count += 1;
    }
  } else if (input.exportType === 'full-export') {
    return exportJsonLd(input);
  } else {
    throw new BadRequestHttpError(`No data provided for export type "${input.exportType}".`);
  }

  return { content: lines.join('\n'), recordCount: count, totalAmount: total };
}

function exportMyob(input: AccountingExportInput): { content: string; recordCount: number; totalAmount: number } {
  // MYOB uses similar CSV but with AU-specific headers
  return exportXero(input);
}

function exportQuickBooks(input: AccountingExportInput): { content: string; recordCount: number; totalAmount: number } {
  // QuickBooks IIF format
  const lines: string[] = [];
  let count = 0;
  let total = 0;

  if (input.exportType === 'invoices' && input.data.invoices) {
    lines.push('!TRNS\tTRNSTYPE\tDATE\tACCNT\tNAME\tAMOUNT\tDOCNUM');
    lines.push('!SPL\tSPLTYPE\tDATE\tACCNT\tNAME\tAMOUNT\tDOCNUM');
    for (const inv of input.data.invoices) {
      const invTotal = inv.lineItems.reduce(
        (sum: number, l): number => sum + l.quantity * l.unitAmount * (1 + l.taxRate),
        0,
      );
      lines.push(
        `TRNS\tINVOICE\t${inv.issueDate}\tAccounts Receivable\t` +
        `${inv.contactName}\t${round2(invTotal)}\t${inv.id}`,
      );
      for (const line of inv.lineItems) {
        lines.push(
          `SPL\tINVOICE\t${inv.issueDate}\tSales\t` +
          `${inv.contactName}\t${round2(-line.quantity * line.unitAmount)}\t${inv.id}`,
        );
        total += line.quantity * line.unitAmount;
        count += 1;
      }
      lines.push('ENDTRNS');
    }
  } else {
    return exportXero(input);
  }

  return { content: lines.join('\n'), recordCount: count, totalAmount: total };
}

function exportCsv(input: AccountingExportInput): { content: string; recordCount: number; totalAmount: number } {
  return exportXero(input);
}

function exportJsonLd(input: AccountingExportInput): { content: string; recordCount: number; totalAmount: number } {
  const data: Record<string, unknown> = {
    '@context': [ 'https://schema.org/' ],
    '@type': 'DataExport',
    '@id': input.id,
    accountingPackage: input.package,
    exportType: input.exportType,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    currency: input.currency,
  };

  let count = 0;
  let total = 0;

  if (input.data.invoices) {
    data.invoices = input.data.invoices;
    count += input.data.invoices.length;
    total += input.data.invoices.reduce(
      (s: number, inv): number =>
        s + inv.lineItems.reduce((ls: number, l): number => ls + l.quantity * l.unitAmount, 0),
      0,
    );
  }
  if (input.data.payments) {
    data.payments = input.data.payments;
    count += input.data.payments.length;
    total += input.data.payments.reduce((s: number, p): number => s + p.amount, 0);
  }
  if (input.data.journalEntries) {
    data.journalEntries = input.data.journalEntries;
    count += input.data.journalEntries.length;
  }
  if (input.data.taxLines) {
    data.taxLines = input.data.taxLines;
    count += input.data.taxLines.length;
    total += input.data.taxLines.reduce((s: number, t): number => s + t.taxAmount, 0);
  }
  if (input.data.contacts) {
    data.contacts = input.data.contacts;
    count += input.data.contacts.length;
  }
  if (input.data.items) {
    data.items = input.data.items;
    count += input.data.items.length;
  }

  return { content: JSON.stringify(data, null, 2), recordCount: count, totalAmount: total };
}

function exportOfx(input: AccountingExportInput): { content: string; recordCount: number; totalAmount: number } {
  const lines: string[] = [
    'OFXHEADER:100',
    'DATA:OFXSGML',
    'VERSION:102',
    'SECURITY:NONE',
    'ENCODING:USASCII',
    'CHARSET:1252',
    'COMPRESSION:NONE',
    'OLDFILEUID:NONE',
    'NEWFILEUID:NONE',
    '',
    '<OFX>',
    '<BANKMSGSRSV1>',
    '<STMTTRNRS>',
    `<CURDEF>${input.currency}`,
    '<BANKTRANLIST>',
  ];

  let count = 0;
  let total = 0;

  if (input.data.payments) {
    for (const pmt of input.data.payments) {
      lines.push('<STMTTRN>');
      lines.push(`<DTPOSTED>${pmt.date.replaceAll('-', '')}000000`);
      lines.push(`<TRNAMT>${pmt.amount}`);
      lines.push(`<FITID>${pmt.id}`);
      lines.push(`<NAME>${pmt.reference ?? pmt.contactId}`);
      lines.push('</STMTTRN>');
      total += pmt.amount;
      count += 1;
    }
  }

  lines.push('</BANKTRANLIST>');
  lines.push('</STMTTRNRS>');
  lines.push('</BANKMSGSRSV1>');
  lines.push('</OFX>');

  return { content: lines.join('\n'), recordCount: count, totalAmount: total };
}

function exportQif(input: AccountingExportInput): { content: string; recordCount: number; totalAmount: number } {
  const lines: string[] = [ '!Type:Bank' ];
  let count = 0;
  let total = 0;

  if (input.data.payments) {
    for (const pmt of input.data.payments) {
      lines.push(`D${pmt.date}`);
      lines.push(`T${pmt.amount}`);
      lines.push(`P${pmt.reference ?? pmt.contactId}`);
      lines.push(`N${pmt.id}`);
      lines.push('^');
      total += pmt.amount;
      count += 1;
    }
  }

  return { content: lines.join('\n'), recordCount: count, totalAmount: total };
}

function getFormatMimeType(pkg: AccountingPackage): string {
  switch (pkg) {
    case 'xero':
    case 'myob':
    case 'sage':
    case 'csv-generic':
      return 'text/csv';
    case 'quickbooks':
      return 'application/vnd.intuit-iif';
    case 'json-ld':
      return 'application/ld+json';
    case 'ofx':
      return 'application/x-ofx';
    case 'qif':
      return 'application/vnd.qif';
    default:
      return 'application/octet-stream';
  }
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}
