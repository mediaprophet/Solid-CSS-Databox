import { buildVariants } from '../../../../../../src/databox/ipms/modules/catalogue/Variants';

describe('buildVariants', (): void => {
  it('produces the cartesian product of options as SKUs.', (): void => {
    const variants = buildVariants({
      productId: 'shirt',
      options: [
        { name: 'size', values: [ 'S', 'M' ]},
        { name: 'colour', values: [ 'Red', 'Blue' ]},
      ],
    });
    expect(variants.map((variant): string => variant.sku)).toEqual([
      'shirt-S-Red',
      'shirt-S-Blue',
      'shirt-M-Red',
      'shirt-M-Blue',
    ]);
    expect(variants[0].options).toEqual({ size: 'S', colour: 'Red' });
  });

  it('handles a single option.', (): void => {
    const variants = buildVariants({ productId: 'cap', options: [{ name: 'size', values: [ 'S', 'L' ]}]});
    expect(variants.map((variant): string => variant.sku)).toEqual([ 'cap-S', 'cap-L' ]);
  });

  it('rejects an empty product id or option list.', (): void => {
    expect((): unknown => buildVariants({ productId: ' ', options: [{ name: 's', values: [ 'S' ]}]}))
      .toThrow('product id');
    expect((): unknown => buildVariants({ productId: 'x', options: []})).toThrow('at least one option');
  });

  it('rejects an option with no name or no values.', (): void => {
    expect((): unknown => buildVariants({ productId: 'x', options: [{ name: '', values: [ 'S' ]}]}))
      .toThrow('name and at least one value');
    expect((): unknown => buildVariants({ productId: 'x', options: [{ name: 's', values: []}]}))
      .toThrow('name and at least one value');
  });
});
