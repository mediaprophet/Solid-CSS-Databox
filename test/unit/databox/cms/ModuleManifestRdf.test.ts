import {
  moduleManifestResourceUrl,
  parseDiscoveredModuleManifests,
  parseModuleManifestIndexRdf,
  serializeDiscoveredModuleManifestToTurtle,
  serializeModuleManifestIndexToTurtle,
} from '../../../../src/databox/cms/ModuleManifestDiscovery';
import { parseModuleManifestRdf, serializeModuleManifestToTurtle } from '../../../../src/databox/cms/ModuleManifestRdf';
import type { SolidModuleManifest } from '../../../../src/databox/cms/SolidModuleManifest';

const manifest: SolidModuleManifest = {
  id: 'receipt',
  name: 'Receipt',
  version: '0.1.0',
  description: 'Portable RDF and printable receipt documents.',
  capabilities: [ 'cms:receipt', 'schema:Order' ],
  routes: [ 'POST /.databox/cms/receipt/build' ],
  configShape: 'https://example.org/shapes/receipt-module',
  adminUi: {
    navLabel: 'Receipts',
    path: '/receipts',
  },
};

describe('CMS module manifest RDF', (): void => {
  it('round-trips a full SolidModuleManifest as portable Turtle.', async(): Promise<void> => {
    const turtle = await serializeModuleManifestToTurtle(manifest, {
      subjectIri: 'https://databox.example/.well-known/databox-cms#receipt',
    });

    expect(turtle).toContain('@prefix cms:');
    expect(parseModuleManifestRdf(turtle)).toEqual(manifest);
  });

  it('preserves empty route lists for portable-core modules.', async(): Promise<void> => {
    const portableCore: SolidModuleManifest = {
      ...manifest,
      id: 'catalogue',
      name: 'Catalogue',
      routes: [],
      adminUi: undefined,
      configShape: undefined,
    };

    const turtle = await serializeModuleManifestToTurtle(portableCore);

    expect(parseModuleManifestRdf(turtle)).toEqual(portableCore);
  });

  it('can parse a chosen manifest subject from a larger discovered graph.', async(): Promise<void> => {
    const turtle = `${await serializeModuleManifestToTurtle(manifest, {
      subjectIri: 'https://databox.example/modules/receipt',
    })}

      <https://databox.example/modules/not-a-module> <https://schema.org/name> "Ignored" .
    `;

    expect(parseModuleManifestRdf(turtle, { subjectIri: 'https://databox.example/modules/receipt' })).toEqual(manifest);
  });

  it('rejects RDF with no module subject.', (): void => {
    expect((): void => {
      parseModuleManifestRdf('<#thing> <https://schema.org/name> "Not a module" .', {
        baseIri: 'https://databox.example/modules',
      });
    }).toThrow('CMS module manifest RDF must contain one rdf:type cms:Module subject.');
  });

  it('rejects RDF missing a required literal field.', (): void => {
    const turtle = `
      @prefix cms: <urn:solid-server:databox:cms#>.
      @prefix dcterms: <http://purl.org/dc/terms/>.
      @prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>.
      @prefix schema: <https://schema.org/>.

      <https://databox.example/modules/receipt>
        a cms:Module;
        dcterms:title "Receipt";
        schema:softwareVersion "0.1.0";
        dcterms:description "Portable receipt module.";
        cms:capabilityList ("cms:receipt");
        cms:routeList ("POST /.databox/cms/receipt/build").
    `;

    expect((): void => {
      parseModuleManifestRdf(turtle);
    })
      .toThrow('CMS module manifest id is required.');
  });

  it('rejects manifests without an explicit required RDF list.', (): void => {
    const turtle = `
      @prefix cms: <urn:solid-server:databox:cms#>.
      @prefix dcterms: <http://purl.org/dc/terms/>.
      @prefix schema: <https://schema.org/>.

      <https://databox.example/modules/receipt>
        a cms:Module;
        schema:identifier "receipt";
        dcterms:title "Receipt";
        schema:softwareVersion "0.1.0";
        dcterms:description "Portable receipt module.";
        cms:capabilityList ("cms:receipt").
    `;

    expect((): void => {
      parseModuleManifestRdf(turtle);
    })
      .toThrow('CMS module manifest routes list is required.');
  });

  it('rejects malformed RDF lists with useful field context.', (): void => {
    const turtle = `
      @prefix cms: <urn:solid-server:databox:cms#>.
      @prefix dcterms: <http://purl.org/dc/terms/>.
      @prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>.
      @prefix schema: <https://schema.org/>.

      <https://databox.example/modules/receipt>
        a cms:Module;
        schema:identifier "receipt";
        dcterms:title "Receipt";
        schema:softwareVersion "0.1.0";
        dcterms:description "Portable receipt module.";
        cms:capabilityList [
          rdf:first <https://example.org/not-a-literal>;
          rdf:rest rdf:nil
        ];
        cms:routeList ("POST /.databox/cms/receipt/build").
    `;

    expect((): void => {
      parseModuleManifestRdf(turtle);
    })
      .toThrow('CMS module manifest capabilities list entries must be literals.');
  });

  it('rejects bad config shape IRIs before serializing.', async(): Promise<void> => {
    await expect(serializeModuleManifestToTurtle({
      ...manifest,
      configShape: 'not relative in a portable manifest',
    })).rejects.toThrow('CMS module manifest configShape must be an absolute IRI.');
  });

  it('rejects incomplete admin UI RDF.', (): void => {
    const turtle = `
      @prefix cms: <urn:solid-server:databox:cms#>.
      @prefix dcterms: <http://purl.org/dc/terms/>.
      @prefix schema: <https://schema.org/>.

      <https://databox.example/modules/receipt>
        a cms:Module;
        schema:identifier "receipt";
        dcterms:title "Receipt";
        schema:softwareVersion "0.1.0";
        dcterms:description "Portable receipt module.";
        cms:capabilityList ("cms:receipt");
        cms:routeList ("POST /.databox/cms/receipt/build");
        cms:adminUi [
          cms:adminNavLabel "Receipts"
        ].
    `;

    expect((): void => {
      parseModuleManifestRdf(turtle);
    })
      .toThrow('CMS module manifest adminUi path is required.');
  });

  it('publishes and parses a .well-known LDP discovery index plus per-module Turtle resources.', async():
  Promise<void> => {
    const portableCore: SolidModuleManifest = {
      id: 'catalogue',
      name: 'Catalogue',
      version: '0.1.0',
      description: 'Portable catalogue definitions.',
      capabilities: [ 'cms:catalogue' ],
      routes: [],
    };
    const options = { baseUrl: 'https://databox.example/' };
    const indexTurtle = await serializeModuleManifestIndexToTurtle([ manifest, portableCore ], options);
    const parsedIndex = parseModuleManifestIndexRdf(indexTurtle, 'https://databox.example/.well-known/databox-cms');

    expect(indexTurtle).toContain('@prefix ldp:');
    expect(parsedIndex).toEqual({
      indexIri: 'https://databox.example/.well-known/databox-cms',
      manifestUrls: [
        'https://databox.example/.well-known/databox-cms/modules/receipt.ttl',
        'https://databox.example/.well-known/databox-cms/modules/catalogue.ttl',
      ],
    });

    const resources = await Promise.all([ manifest, portableCore ].map(async(module): Promise<{
      url: string;
      turtle: string;
    }> => ({
      url: moduleManifestResourceUrl(module.id, options),
      turtle: await serializeDiscoveredModuleManifestToTurtle(module, options),
    })));

    expect(parseDiscoveredModuleManifests(indexTurtle, resources)).toEqual([ manifest, portableCore ]);
  });

  it('rejects a discovery index that is not an ordinary LDP container.', (): void => {
    expect((): void => {
      parseModuleManifestIndexRdf(
        '<#thing> <https://schema.org/name> "Not an index" .',
        'https://databox.example/.well-known/databox-cms',
      );
    }).toThrow('CMS module manifest discovery index must declare an LDP container subject.');
  });

  it('rejects missing per-module resources during discovery.', async(): Promise<void> => {
    const indexTurtle = await serializeModuleManifestIndexToTurtle([ manifest ], {
      baseUrl: 'https://databox.example/',
    });

    expect((): void => {
      parseDiscoveredModuleManifests(indexTurtle, []);
    }).toThrow('CMS module manifest resource https://databox.example/.well-known/databox-cms/modules/receipt.ttl is missing.');
  });

  it('rejects malformed per-module Turtle during discovery.', async(): Promise<void> => {
    const options = { baseUrl: 'https://databox.example/' };
    const url = moduleManifestResourceUrl(manifest.id, options);
    const indexTurtle = await serializeModuleManifestIndexToTurtle([ manifest ], options);

    expect((): void => {
      parseDiscoveredModuleManifests(indexTurtle, [{
        url,
        turtle: `
          @prefix cms: <urn:solid-server:databox:cms#>.
          @prefix dcterms: <http://purl.org/dc/terms/>.
          @prefix schema: <https://schema.org/>.

          <${url}>
            a cms:Module;
            dcterms:title "Receipt";
            schema:softwareVersion "0.1.0";
            dcterms:description "Portable receipt module.";
            cms:capabilityList ("cms:receipt");
            cms:routeList ().
        `,
      }]);
    }).toThrow('CMS module manifest id is required.');
  });
});
