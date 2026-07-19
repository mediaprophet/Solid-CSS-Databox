import { negotiateLocale } from '../../../../../../src/databox/cms/modules/i18n/LocaleNegotiation';
import { BadRequestHttpError } from '../../../../../../src/util/errors/BadRequestHttpError';

describe('negotiateLocale', (): void => {
  it('returns the exact case-insensitive match for a preferred tag.', (): void => {
    expect(negotiateLocale('EN', [ 'en', 'fr' ], 'fr')).toBe('en');
  });

  it('matches on the primary subtag when no exact match is available.', (): void => {
    expect(negotiateLocale('en-US', [ 'en', 'fr' ], 'fr')).toBe('en');
  });

  it('prefers an exact match over an earlier primary-subtag candidate.', (): void => {
    expect(negotiateLocale('en-US', [ 'en-GB', 'en-US' ], 'fr')).toBe('en-US');
  });

  it('picks the tag with the higher quality value.', (): void => {
    expect(negotiateLocale('en;q=0.5,fr;q=0.9', [ 'en', 'fr' ], 'en')).toBe('fr');
  });

  it('treats a tag without an explicit quality value as q=1.', (): void => {
    expect(negotiateLocale('fr;q=0.5,en', [ 'en', 'fr' ], 'fr')).toBe('en');
  });

  it('ignores blank entries in the Accept-Language header.', (): void => {
    expect(negotiateLocale('en, ,,fr;q=0.5', [ 'fr' ], 'fr')).toBe('fr');
  });

  it('returns the default locale when nothing matches.', (): void => {
    expect(negotiateLocale('de', [ 'en', 'fr' ], 'en')).toBe('en');
  });

  it('returns the default locale for an empty Accept-Language header.', (): void => {
    expect(negotiateLocale('', [ 'en', 'fr' ], 'fr')).toBe('fr');
  });

  it('throws a BadRequestHttpError when there are no available locales.', (): void => {
    expect((): string => negotiateLocale('en', [], 'en')).toThrow(BadRequestHttpError);
  });
});
