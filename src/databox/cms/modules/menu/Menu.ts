import { BadRequestHttpError } from '../../../../util/errors/BadRequestHttpError';
import { CMS } from '../../../../util/Vocabularies';
import type { SolidModuleManifest } from '../../SolidModuleManifest';

// JSON-LD keywords as constants so they can be used as computed keys (the linter's naming
// convention forbids `@`-prefixed object-literal property names).
const LD_CONTEXT = '@context';
const LD_TYPE = '@type';
const LD_ID = '@id';

export const MENU_MODULE_MANIFEST: SolidModuleManifest = {
  id: 'menu',
  name: 'Menu',
  version: '0.1.0',
  description: 'Portable schema.org menu resources for public food-offer publishing and Solid RDF discovery.',
  capabilities: [
    'cms:menu',
    'cms:portable-core-schema-org-menu',
    'cms:standard-solid-menu-rdf',
    'cms:css-enhanced-menu-build-route',
  ],
  routes: [ 'POST /.databox/cms/menu/build' ],
  configShape: `${CMS.namespace}MenuConfigShape`,
};

export interface MenuItem {
  readonly name: string;
  readonly price: number;
}

export interface MenuSection {
  readonly name: string;
  readonly items: readonly MenuItem[];
}

export interface MenuInput {
  readonly id: string;
  readonly name: string;
  readonly currency: string;
  readonly sections: readonly MenuSection[];
}

function requireUri(value: string, field: string): string {
  try {
    return new URL(value).href;
  } catch {
    throw new BadRequestHttpError(`A menu ${field} must be an absolute URI.`);
  }
}

/**
 * Build a menu as a schema.org `Menu` JSON-LD document (food vertical, see
 * `databox/solid-cms-plan.md`, §12.3). Pure and deterministic.
 */
export function buildMenu(input: MenuInput): Record<string, unknown> {
  const id = requireUri(input.id, 'id');
  if (input.name.trim().length === 0) {
    throw new BadRequestHttpError('A menu needs a name.');
  }
  if (input.currency.trim().length === 0) {
    throw new BadRequestHttpError('A menu needs a currency.');
  }
  if (input.sections.length === 0) {
    throw new BadRequestHttpError('A menu needs at least one section.');
  }
  for (const section of input.sections) {
    if (section.items.length === 0) {
      throw new BadRequestHttpError('A menu section needs at least one item.');
    }
  }

  const hasMenuSection = input.sections.map((section): Record<string, unknown> => ({
    [LD_TYPE]: 'MenuSection',
    name: section.name,
    hasMenuItem: section.items.map((item): Record<string, unknown> => ({
      [LD_TYPE]: 'MenuItem',
      name: item.name,
      offers: {
        [LD_TYPE]: 'Offer',
        price: item.price.toFixed(2),
        priceCurrency: input.currency,
      },
    })),
  }));

  return {
    [LD_CONTEXT]: 'https://schema.org/',
    [LD_TYPE]: 'Menu',
    [LD_ID]: id,
    name: input.name,
    hasMenuSection,
  };
}
