import { BasicRepresentation } from '../../../../src/http/representation/BasicRepresentation';
import type { Representation } from '../../../../src/http/representation/Representation';
import type { ResourceIdentifier } from '../../../../src/http/representation/ResourceIdentifier';
import {
  applyVerticalProfileBundle,
  FOOD_RESTAURANT_VERTICAL_PROFILE,
  HEALTH_PRIVACY_CONSENT_VERTICAL_PROFILE,
  LIGHTHOUSE_VERTICAL_PROFILES,
  parseVerticalProfileRdf,
  serializeVerticalProfileToTurtle,
  validateVerticalProfileBundle,
} from '../../../../src/databox/cms/VerticalProfile';
import { InMemoryDataboxModuleRegistry } from '../../../../src/databox/cms/DataboxModuleRegistry';
import { ModuleConfigStore } from '../../../../src/databox/cms/ModuleConfigStore';
import type { SolidModuleManifest } from '../../../../src/databox/cms/SolidModuleManifest';
import type { ResourceStore } from '../../../../src/storage/ResourceStore';
import { readableToString } from '../../../../src/util/StreamUtil';

function moduleManifest(id: string): SolidModuleManifest {
  return {
    id,
    name: id,
    version: '0.1.0',
    description: `${id} horizontal CMS module.`,
    capabilities: [ `cms:${id}` ],
    routes: [],
  };
}

function registerModules(registry: InMemoryDataboxModuleRegistry, ids: readonly string[]): void {
  for (const id of ids) {
    registry.register(moduleManifest(id));
  }
}

function createConfigStore(data = new Map<string, string>()): {
  readonly data: Map<string, string>;
  readonly store: ModuleConfigStore;
} {
  const resourceStore = {
    hasResource: async(id: ResourceIdentifier): Promise<boolean> => data.has(id.path),
    getRepresentation: async(id: ResourceIdentifier): Promise<Representation> =>
      new BasicRepresentation(data.get(id.path) ?? '', 'text/turtle'),
    setRepresentation: async(id: ResourceIdentifier, representation: Representation): Promise<void> => {
      data.set(id.path, await readableToString(representation.data));
    },
  } as unknown as ResourceStore;
  return {
    data,
    store: new ModuleConfigStore(resourceStore, 'https://databox.example/'),
  };
}

describe('CMS vertical profiles', (): void => {
  it('round-trips a declarative vertical profile bundle as portable Turtle.', async(): Promise<void> => {
    const turtle = await serializeVerticalProfileToTurtle(FOOD_RESTAURANT_VERTICAL_PROFILE, {
      subjectIri: 'https://databox.example/.well-known/databox-cms/vertical-profiles/food.restaurant.ttl#profile',
    });

    expect(turtle).toContain('cms:VerticalProfile');
    expect(turtle).toContain('cms:moduleList');
    expect(parseVerticalProfileRdf(turtle)).toEqual(FOOD_RESTAURANT_VERTICAL_PROFILE);
  });

  it('validates missing horizontal modules before a bundle can be applied.', (): void => {
    const registry = new InMemoryDataboxModuleRegistry();
    registerModules(registry, [ 'menu', 'catalogue' ]);

    const result = validateVerticalProfileBundle(FOOD_RESTAURANT_VERTICAL_PROFILE, registry);

    expect(result.missingModules).toEqual([
      'stock',
      'payments',
      'receipt',
      'bookings',
      'events',
      'opening-hours',
      'website-seo',
      'mcp-server',
      'barcode',
      'eftpos',
      'backups',
      'accounting',
    ]);
    expect(result.missingModules).toEqual(expect.arrayContaining(['barcode', 'eftpos', 'backups', 'accounting']));
  });

  it('applies enabled defaults and RDF config through the module config store.', async(): Promise<void> => {
    const registry = new InMemoryDataboxModuleRegistry();
    registerModules(registry, FOOD_RESTAURANT_VERTICAL_PROFILE.modules.map((module): string => module.moduleId));
    const { data, store } = createConfigStore();

    await applyVerticalProfileBundle(FOOD_RESTAURANT_VERTICAL_PROFILE, registry, store);

    expect(registry.listEnabled().map((manifest): string => manifest.id)).toEqual([
      'menu',
      'catalogue',
      'stock',
      'payments',
      'receipt',
      'bookings',
      'events',
      'opening-hours',
      'website-seo',
      'mcp-server',
      'barcode',
      'eftpos',
      'backups',
      'accounting',
    ]);
    expect(registry.listEnabled().map((manifest): string => manifest.id))
      .toEqual(expect.arrayContaining(['barcode', 'eftpos', 'backups', 'accounting']));
    expect(data.get('https://databox.example/.databox/cms/modules/catalogue'))
      .toContain('https://schema.org/itemListOrder');
    expect(data.get('https://databox.example/.databox/cms/modules/receipt'))
      .toContain('consumer-digital-receipt');
    await expect(store.isEnabled('opening-hours')).resolves.toBe(true);
  });

  it('fails closed if RDF defaults would be lost without a config store.', async(): Promise<void> => {
    const registry = new InMemoryDataboxModuleRegistry();
    registerModules(registry, HEALTH_PRIVACY_CONSENT_VERTICAL_PROFILE.modules.map((module): string => module.moduleId));

    await expect(applyVerticalProfileBundle(HEALTH_PRIVACY_CONSENT_VERTICAL_PROFILE, registry))
      .rejects.toThrow('needs a ModuleConfigStore to apply RDF defaults.');
  });

  it('ships meaningful lighthouse bundles from the CMS plan.', (): void => {
    expect(LIGHTHOUSE_VERTICAL_PROFILES.map((profile): string => profile.id)).toEqual([
      'food.restaurant',
      'food.allergy-safety',
      'health.privacy-consent',
      'auto.portable-records',
      'member.governance',
      'sport.club-base',
      'sport.league-team',
      'sport.facility-court',
      'sport.compliance-safety',
      'glam.base',
      'glam.gallery-museum',
      'glam.library',
      'glam.archive',
      'glam.historical-society',
      'home-services.base',
      'home-services.maintenance',
      'home-services.domestic',
      'wellness.practitioner',
      'wellness.venue',
      'wellness.clinic',
      'print.shop',
      'hr.workforce',
      'food.take-away',
      'sports.venue',
      'trades.service',
      'charity.nonprofit',
    ]);
    expect(LIGHTHOUSE_VERTICAL_PROFILES.length).toBeGreaterThanOrEqual(26);
    expect(FOOD_RESTAURANT_VERTICAL_PROFILE.modules.map((module): string => module.moduleId))
      .toEqual(expect.arrayContaining([ 'menu', 'catalogue', 'payments', 'receipt', 'bookings', 'events' ]));
    expect(HEALTH_PRIVACY_CONSENT_VERTICAL_PROFILE.modules.map((module): string => module.moduleId))
      .toEqual(expect.arrayContaining([
        'consent',
        'access-request',
        'correction-request',
        'governance',
        'delegation',
        'break-glass',
        'credential-gate',
        'backups',
      ]));
  });

  it('rejects malformed RDF profile resources.', (): void => {
    expect((): void => {
      parseVerticalProfileRdf(`
        @prefix cms: <urn:solid-server:databox:cms#>.
        @prefix dcterms: <http://purl.org/dc/terms/>.
        @prefix schema: <https://schema.org/>.

        <https://databox.example/profiles/food>
          a cms:VerticalProfile;
          schema:identifier "food.restaurant";
          dcterms:title "Food / Restaurant";
          schema:softwareVersion "0.1.0";
          dcterms:description "Restaurant profile.";
          cms:useCaseList ("FOOD").
      `);
    }).toThrow('CMS vertical profile modules list is required.');
  });
});
