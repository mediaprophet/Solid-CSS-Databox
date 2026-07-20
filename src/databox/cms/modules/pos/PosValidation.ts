import { BadRequestHttpError } from '../../../../util/errors/BadRequestHttpError';

// JSON-LD keywords as constants so they can be used as computed keys (the linter's naming
// convention forbids `@`-prefixed object-literal property names).
export const LD_CONTEXT = '@context';
export const LD_TYPE = '@type';
export const LD_ID = '@id';

export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function money(value: number): string {
  return round2(value).toFixed(2);
}

export function requireUri(value: string, subject: string, field: string): string {
  try {
    return new URL(value).href;
  } catch {
    throw new BadRequestHttpError(`A ${subject} ${field} must be an absolute URI.`);
  }
}

export function requireOptionalUri(value: string | undefined, subject: string, field: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  return requireUri(value, subject, field);
}

export function requireNonEmpty(value: string, subject: string, field: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new BadRequestHttpError(`A ${subject} ${field} must not be empty.`);
  }
  return trimmed;
}

export function requireCurrency(value: string, subject: string): string {
  const currency = value.trim().toUpperCase();
  if (!/^[A-Z]{3}$/u.test(currency)) {
    throw new BadRequestHttpError(`A ${subject} currency must be a three-letter ISO 4217 code.`);
  }
  return currency;
}

export function requireDate(value: string, subject: string, field: string): string {
  const date = new Date(value);
  if (value.trim().length === 0 || Number.isNaN(date.getTime())) {
    throw new BadRequestHttpError(`A ${subject} ${field} must be a valid date.`);
  }
  return value;
}

export function requirePositiveInteger(value: number, subject: string, field: string): number {
  if (!Number.isFinite(value) || !Number.isInteger(value) || value <= 0) {
    throw new BadRequestHttpError(`A ${subject} ${field} must be a positive integer.`);
  }
  return value;
}

export function requireNonNegativeFinite(value: number, subject: string, field: string): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new BadRequestHttpError(`A ${subject} ${field} must be greater than or equal to 0.`);
  }
  return value;
}

export function requireNonNegativeInteger(value: number, subject: string, field: string): number {
  if (!Number.isFinite(value) || !Number.isInteger(value) || value < 0) {
    throw new BadRequestHttpError(`A ${subject} ${field} must be a non-negative integer.`);
  }
  return value;
}
