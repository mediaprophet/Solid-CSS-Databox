import { contrastRatio, meetsWcag } from '../../../../../../src/databox/cms/modules/a11y/Contrast';

describe('contrastRatio', (): void => {
  it('returns 21 for black on white.', (): void => {
    expect(contrastRatio('#000000', '#ffffff')).toBe(21);
  });

  it('returns 21 for white on black regardless of argument order.', (): void => {
    expect(contrastRatio('#ffffff', '#000000')).toBe(21);
  });

  it('returns 1 for identical colours.', (): void => {
    expect(contrastRatio('#336699', '#336699')).toBe(1);
  });

  it('accepts hex strings without a leading hash.', (): void => {
    expect(contrastRatio('000000', 'ffffff')).toBe(21);
  });

  it('throws a BadRequestHttpError for an invalid first hex colour.', (): void => {
    expect((): number => contrastRatio('nothex', '#ffffff')).toThrow('Invalid hex colour: nothex');
  });

  it('throws a BadRequestHttpError for an invalid second hex colour.', (): void => {
    expect((): number => contrastRatio('#ffffff', '#zzzzzz')).toThrow('Invalid hex colour: #zzzzzz');
  });
});

describe('meetsWcag', (): void => {
  it('returns true for AA large text exactly at the 3:1 boundary.', (): void => {
    expect(meetsWcag('#959595', '#ffffff', 'AA', true)).toBe(true);
  });

  it('returns false for AA large text just below the 3:1 boundary.', (): void => {
    expect(meetsWcag('#969696', '#ffffff', 'AA', true)).toBe(false);
  });

  it('returns true for AA normal text exactly at the 4.5:1 boundary.', (): void => {
    expect(meetsWcag('#006efe', '#ffffff', 'AA', false)).toBe(true);
  });

  it('returns false for AA normal text just below the 4.5:1 boundary.', (): void => {
    expect(meetsWcag('#006ffe', '#ffffff', 'AA', false)).toBe(false);
  });

  it('returns true for AAA large text exactly at the 4.5:1 boundary.', (): void => {
    expect(meetsWcag('#006efe', '#ffffff', 'AAA', true)).toBe(true);
  });

  it('returns false for AAA large text just below the 4.5:1 boundary.', (): void => {
    expect(meetsWcag('#006ffe', '#ffffff', 'AAA', true)).toBe(false);
  });

  it('returns true for AAA normal text exactly at the 7:1 boundary.', (): void => {
    expect(meetsWcag('#595959', '#ffffff', 'AAA', false)).toBe(true);
  });

  it('returns false for AAA normal text just below the 7:1 boundary.', (): void => {
    expect(meetsWcag('#5a5a5a', '#ffffff', 'AAA', false)).toBe(false);
  });
});
