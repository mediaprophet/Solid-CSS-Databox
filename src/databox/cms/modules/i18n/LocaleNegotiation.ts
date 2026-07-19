import { BadRequestHttpError } from '../../../../util/errors/BadRequestHttpError';

interface LanguageEntry {
  tag: string;
  q: number;
}

/**
 * Parses a single `Accept-Language` entry (e.g. `en-US` or `fr;q=0.6`) into a language entry.
 * Returns undefined for blank entries.
 *
 * @param part - A single comma-separated segment of the `Accept-Language` header.
 *
 * @returns The parsed entry, or undefined if the segment was blank.
 */
function parseEntry(part: string): LanguageEntry | undefined {
  const trimmed = part.trim();
  if (trimmed.length === 0) {
    return undefined;
  }
  const segments = trimmed.split(';');
  const tag = segments[0].trim();
  const qSegment = segments[1];
  const q = qSegment === undefined ? 1 : Number.parseFloat(qSegment.trim().slice(2));
  return { tag, q };
}

/**
 * Parses an `Accept-Language` header value into a list of language entries,
 * sorted by descending quality value (stable). Blank entries are ignored.
 *
 * @param acceptLanguage - The raw `Accept-Language` header value.
 *
 * @returns The parsed, sorted language entries.
 */
function parseAcceptLanguage(acceptLanguage: string): LanguageEntry[] {
  const parts = acceptLanguage.split(',');
  const entries: LanguageEntry[] = [];
  for (const part of parts) {
    const entry = parseEntry(part);
    if (entry !== undefined) {
      entries.push(entry);
    }
  }
  // `Array#sort` is a stable sort, so entries with equal quality values keep their relative order.
  return entries.sort((left, right): number => right.q - left.q);
}

/**
 * Extracts the primary subtag (before the first `-`) of a language tag.
 *
 * @param tag - The language tag.
 *
 * @returns The primary subtag.
 */
function primarySubtag(tag: string): string {
  const index = tag.indexOf('-');
  return index === -1 ? tag : tag.slice(0, index);
}

/**
 * Finds the first available locale matching the given preferred tag.
 * An exact case-insensitive match is always preferred over a primary-subtag match,
 * regardless of the order of the available locales.
 *
 * @param tag - The preferred language tag.
 * @param available - The list of available locales.
 *
 * @returns The matching locale, or undefined if none matches.
 */
function findMatch(tag: string, available: readonly string[]): string | undefined {
  const lowerTag = tag.toLowerCase();
  for (const locale of available) {
    if (locale.toLowerCase() === lowerTag) {
      return locale;
    }
  }
  const primaryTag = primarySubtag(lowerTag);
  for (const locale of available) {
    if (primarySubtag(locale.toLowerCase()) === primaryTag) {
      return locale;
    }
  }
  return undefined;
}

/**
 * Negotiates the best matching locale for an incoming `Accept-Language` header value.
 *
 * @param acceptLanguage - The raw `Accept-Language` header value.
 * @param available - The list of locales supported by the server.
 * @param defaultLocale - The locale to fall back to when nothing matches.
 *
 * @returns The negotiated locale.
 */
export function negotiateLocale(acceptLanguage: string, available: readonly string[], defaultLocale: string): string {
  if (available.length === 0) {
    throw new BadRequestHttpError('No available locales were provided for negotiation.');
  }
  const entries = parseAcceptLanguage(acceptLanguage);
  for (const entry of entries) {
    const match = findMatch(entry.tag, available);
    if (match !== undefined) {
      return match;
    }
  }
  return defaultLocale;
}
