import { createHash } from 'node:crypto';
import type { ObligationControlMapping } from './ComplianceTypes';

/** Serializes JSON-compatible data with stable object-key ordering. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(',')}]`;
  }
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value).sort(([ left ], [ right ]): number => left.localeCompare(right));
    return `{${entries.map(([ key, entry ]): string =>
      `${JSON.stringify(key)}:${canonicalJson(entry)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function sha256Canonical(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value)).digest('hex');
}

/** Pins all executable and explanatory fields in a legal-to-control mapping. */
export function complianceMappingDigest(mapping: ObligationControlMapping): string {
  return sha256Canonical(mapping);
}
