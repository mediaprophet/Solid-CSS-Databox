import type { MenuInput } from '../../../../../../src/databox/ipms/modules/menu/Menu';
import { buildMenu, MENU_MODULE_MANIFEST } from '../../../../../../src/databox/ipms/modules/menu/Menu';

const base: MenuInput = {
  id: 'https://example.org/menus/1',
  name: 'Lunch Menu',
  currency: 'AUD',
  sections: [
    {
      name: 'Mains',
      items: [
        { name: 'Burger', price: 12.5 },
        { name: 'Salad', price: 9 },
      ],
    },
    {
      name: 'Drinks',
      items: [
        { name: 'Soda', price: 3 },
      ],
    },
  ],
};

function record(value: unknown): Record<string, unknown> {
  return value as Record<string, unknown>;
}

describe('buildMenu', (): void => {
  it('advertises a IPMS module manifest with portable and CSS-enhanced capabilities.', (): void => {
    expect(MENU_MODULE_MANIFEST).toMatchObject({
      id: 'menu',
      name: 'Menu',
      capabilities: expect.arrayContaining([
        'ipms:portable-core-schema-org-menu',
        'ipms:standard-solid-menu-rdf',
        'ipms:css-enhanced-menu-build-route',
      ]),
      routes: [ 'POST /.databox/ipms/menu/build' ],
    });
  });

  it('builds a schema.org Menu JSON-LD document with multiple sections.', (): void => {
    const menu = buildMenu(base);
    expect(menu['@context']).toBe('https://schema.org/');
    expect(menu['@type']).toBe('Menu');
    expect(menu['@id']).toBe('https://example.org/menus/1');
    expect(menu.name).toBe('Lunch Menu');

    const sections = menu.hasMenuSection as Record<string, unknown>[];
    expect(sections).toHaveLength(2);

    const mains = record(sections[0]);
    expect(mains['@type']).toBe('MenuSection');
    expect(mains.name).toBe('Mains');

    const mainsItems = mains.hasMenuItem as Record<string, unknown>[];
    expect(mainsItems).toHaveLength(2);

    const burger = record(mainsItems[0]);
    expect(burger['@type']).toBe('MenuItem');
    expect(burger.name).toBe('Burger');

    const burgerOffer = record(burger.offers);
    expect(burgerOffer['@type']).toBe('Offer');
    expect(burgerOffer.price).toBe('12.50');
    expect(burgerOffer.priceCurrency).toBe('AUD');

    const salad = record(mainsItems[1]);
    const saladOffer = record(salad.offers);
    expect(saladOffer.price).toBe('9.00');

    const drinks = record(sections[1]);
    expect(drinks.name).toBe('Drinks');
    const drinksItems = drinks.hasMenuItem as Record<string, unknown>[];
    expect(drinksItems).toHaveLength(1);
  });

  it('rejects a non-URI id.', (): void => {
    expect((): unknown => buildMenu({ ...base, id: 'not-a-uri' })).toThrow('id must be an absolute URI');
  });

  it('rejects an empty name.', (): void => {
    expect((): unknown => buildMenu({ ...base, name: '  ' })).toThrow('needs a name');
  });

  it('rejects an empty currency.', (): void => {
    expect((): unknown => buildMenu({ ...base, currency: '  ' })).toThrow('needs a currency');
  });

  it('rejects empty sections.', (): void => {
    expect((): unknown => buildMenu({ ...base, sections: []})).toThrow('needs at least one section');
  });

  it('rejects a section with no items.', (): void => {
    const sections = [
      { name: 'Mains', items: []},
    ];
    expect((): unknown => buildMenu({ ...base, sections })).toThrow('needs at least one item');
  });
});
