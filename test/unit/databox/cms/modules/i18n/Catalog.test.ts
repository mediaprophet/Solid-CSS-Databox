import type { Catalog, TranslateInput } from '../../../../../../src/databox/cms/modules/i18n/Catalog';
import { translate } from '../../../../../../src/databox/cms/modules/i18n/Catalog';

describe('translate', (): void => {
  const catalogs: Record<string, Catalog> = {
    en: {
      greeting: 'Hello, {name}!',
      onlyEn: 'Only in English',
    },
    fr: {
      greeting: 'Bonjour, {name}!',
    },
  };

  it('resolves the message from the requested locale when present.', (): void => {
    const input: TranslateInput = {
      catalogs,
      locale: 'fr',
      fallbackLocale: 'en',
      key: 'greeting',
      params: { name: 'Marie' },
    };
    expect(translate(input)).toBe('Bonjour, Marie!');
  });

  it('falls back to the fallback locale when the key is missing in the requested locale.', (): void => {
    const input: TranslateInput = {
      catalogs,
      locale: 'fr',
      fallbackLocale: 'en',
      key: 'onlyEn',
    };
    expect(translate(input)).toBe('Only in English');
  });

  it('returns the raw key when it is missing from every catalog.', (): void => {
    const input: TranslateInput = {
      catalogs,
      locale: 'fr',
      fallbackLocale: 'en',
      key: 'nowhere',
    };
    expect(translate(input)).toBe('nowhere');
  });

  it('replaces a placeholder with the provided param.', (): void => {
    const input: TranslateInput = {
      catalogs,
      locale: 'en',
      fallbackLocale: 'en',
      key: 'greeting',
      params: { name: 'Alice' },
    };
    expect(translate(input)).toBe('Hello, Alice!');
  });

  it('leaves a placeholder literal when its param is missing.', (): void => {
    const input: TranslateInput = {
      catalogs,
      locale: 'en',
      fallbackLocale: 'en',
      key: 'greeting',
    };
    expect(translate(input)).toBe('Hello, {name}!');
  });

  it('throws a BadRequestHttpError when the key is empty.', (): void => {
    const input: TranslateInput = {
      catalogs,
      locale: 'en',
      fallbackLocale: 'en',
      key: '   ',
    };
    expect((): void => {
      translate(input);
    }).toThrow('key must not be empty');
  });
});
