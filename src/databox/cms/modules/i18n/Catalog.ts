import { BadRequestHttpError } from '../../../../util/errors/BadRequestHttpError';

/**
 * A flat message catalog: message key to message template.
 */
export type Catalog = Record<string, string>;

/**
 * Input for resolving and interpolating a localized message.
 */
export interface TranslateInput {
  readonly catalogs: Record<string, Catalog>;
  readonly locale: string;
  readonly fallbackLocale: string;
  readonly key: string;
  readonly params?: Record<string, string>;
}

/**
 * Resolves a message template for `key` from `catalogs[locale]`, falling back to
 * `catalogs[fallbackLocale]`, and finally to the raw key when not found in either.
 * Every `{name}` placeholder in the resolved template is replaced with `params[name]`
 * when that parameter is defined; otherwise the placeholder is left as-is.
 */
export function translate(input: TranslateInput): string {
  const { catalogs, locale, fallbackLocale, key, params } = input;
  if (key.trim().length === 0) {
    throw new BadRequestHttpError('key must not be empty');
  }

  const template = catalogs[locale]?.[key] ?? catalogs[fallbackLocale]?.[key] ?? key;

  return template.replaceAll(/\{([^{}]+)\}/gu, (match: string, name: string): string =>
    params?.[name] ?? match);
}
