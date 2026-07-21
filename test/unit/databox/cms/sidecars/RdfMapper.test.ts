import { describe, it, expect } from '@jest/globals';
import {
  applyMappingToTurtle,
  applyMappingToJsonLd,
  parseMappingFromTurtle,
  serializeMappingToTurtle,
  type MappingDefinition,
} from '../../../../../src/databox/cms/sidecars/RdfMapper';

const SCHEMA = 'https://schema.org/';

const sampleMapping: MappingDefinition = {
  id: 'OrgMapping',
  name: 'Organization Mapping',
  sourceType: 'odbc',
  triplesMaps: [
    {
      id: 'OrgMap',
      subjectTemplate: 'urn:odbc:org:{id}',
      classes: [ `${SCHEMA}Organization` ],
      fields: [
        { predicate: `${SCHEMA}name`, sourceColumn: 'name' },
        { predicate: `${SCHEMA}identifier`, sourceColumn: 'id' },
        { predicate: `${SCHEMA}status`, constantValue: 'active' },
      ],
    },
  ],
};

const sampleRows = [
  { id: 101, name: 'Acme Corp', status: 'ACTIVE' },
  { id: 102, name: 'Globex Inc', status: 'INACTIVE' },
];

describe('RdfMapper', () => {
  describe('applyMappingToTurtle', () => {
    it('produces valid Turtle with subject IRIs from template', () => {
      const turtle = applyMappingToTurtle(sampleMapping, sampleRows);
      expect(turtle).toContain('<urn:odbc:org:101>');
      expect(turtle).toContain('<urn:odbc:org:102>');
      expect(turtle).toContain(`<${SCHEMA}Organization>`);
      expect(turtle).toContain(`<${SCHEMA}name> "Acme Corp"`);
      expect(turtle).toContain(`<${SCHEMA}status> "active"`);
    });

    it('skips rows where template resolves to empty', () => {
      const mapping: MappingDefinition = {
        id: 'Test',
        name: 'Test',
        sourceType: 'odbc',
        triplesMaps: [
          {
            id: 'TM',
            subjectTemplate: 'urn:test:{missing}',
            classes: [],
            fields: [],
          },
        ],
      };
      const turtle = applyMappingToTurtle(mapping, [ { id: 1 } ]);
      expect(turtle).toBe('');
    });

    it('handles language tags', () => {
      const mapping: MappingDefinition = {
        id: 'Test',
        name: 'Test',
        sourceType: 'odbc',
        triplesMaps: [
          {
            id: 'TM',
            subjectTemplate: 'urn:test:{id}',
            classes: [],
            fields: [
              { predicate: `${SCHEMA}description`, sourceColumn: 'desc', languageTag: 'en' },
            ],
          },
        ],
      };
      const turtle = applyMappingToTurtle(mapping, [ { id: 1, desc: 'Hello' } ]);
      expect(turtle).toContain(`"Hello"@en`);
    });

    it('handles datatypes', () => {
      const mapping: MappingDefinition = {
        id: 'Test',
        name: 'Test',
        sourceType: 'odbc',
        triplesMaps: [
          {
            id: 'TM',
            subjectTemplate: 'urn:test:{id}',
            classes: [],
            fields: [
              { predicate: `${SCHEMA}price`, sourceColumn: 'price', datatype: 'http://www.w3.org/2001/XMLSchema#decimal' },
            ],
          },
        ],
      };
      const turtle = applyMappingToTurtle(mapping, [ { id: 1, price: '9.99' } ]);
      expect(turtle).toContain(`"9.99"^^<http://www.w3.org/2001/XMLSchema#decimal>`);
    });

    it('handles URI references', () => {
      const mapping: MappingDefinition = {
        id: 'Test',
        name: 'Test',
        sourceType: 'odbc',
        triplesMaps: [
          {
            id: 'TM',
            subjectTemplate: 'urn:test:{id}',
            classes: [],
            fields: [
              { predicate: `${SCHEMA}knows`, sourceColumn: 'friendUri', isUri: true },
            ],
          },
        ],
      };
      const turtle = applyMappingToTurtle(mapping, [ { id: 1, friendUri: 'urn:test:2' } ]);
      expect(turtle).toContain(`<${SCHEMA}knows> <urn:test:2>`);
    });

    it('escapes special characters in literals', () => {
      const mapping: MappingDefinition = {
        id: 'Test',
        name: 'Test',
        sourceType: 'odbc',
        triplesMaps: [
          {
            id: 'TM',
            subjectTemplate: 'urn:test:{id}',
            classes: [],
            fields: [
              { predicate: `${SCHEMA}name`, sourceColumn: 'name' },
            ],
          },
        ],
      };
      const turtle = applyMappingToTurtle(mapping, [ { id: 1, name: 'Hello "World"\n' } ]);
      expect(turtle).toContain('\\"World\\"');
      expect(turtle).toContain('\\n');
    });
  });

  describe('applyMappingToJsonLd', () => {
    it('produces JSON-LD with @id and @type', () => {
      const jsonld = applyMappingToJsonLd(sampleMapping, sampleRows);
      expect(jsonld).toHaveLength(2);
      expect(jsonld[0]['@id']).toBe('urn:odbc:org:101');
      expect(jsonld[0]['@type']).toBe(`${SCHEMA}Organization`);
      expect(jsonld[0][`${SCHEMA}name`]).toBe('Acme Corp');
      expect(jsonld[0][`${SCHEMA}status`]).toBe('active');
    });

    it('produces language-tagged values in JSON-LD', () => {
      const mapping: MappingDefinition = {
        id: 'Test',
        name: 'Test',
        sourceType: 'odbc',
        triplesMaps: [
          {
            id: 'TM',
            subjectTemplate: 'urn:test:{id}',
            classes: [],
            fields: [
              { predicate: `${SCHEMA}desc`, sourceColumn: 'd', languageTag: 'fr' },
            ],
          },
        ],
      };
      const jsonld = applyMappingToJsonLd(mapping, [ { id: 1, d: 'Bonjour' } ]);
      expect(jsonld[0][`${SCHEMA}desc`]).toEqual({ '@value': 'Bonjour', '@language': 'fr' });
    });
  });

  describe('serializeMappingToTurtle', () => {
    it('round-trips a mapping definition', () => {
      const turtle = serializeMappingToTurtle(sampleMapping);
      expect(turtle).toContain('dbx:Mapping');
      expect(turtle).toContain('rr:template "urn:odbc:org:{id}"');
      expect(turtle).toContain(`rr:class <${SCHEMA}Organization>`);
      expect(turtle).toContain('rr:column "name"');
    });
  });

  describe('parseMappingFromTurtle', () => {
    it('parses a JSON mapping definition', () => {
      const json = JSON.stringify(sampleMapping);
      const parsed = parseMappingFromTurtle(json);
      expect(parsed.id).toBe('OrgMapping');
      expect(parsed.sourceType).toBe('odbc');
      expect(parsed.triplesMaps).toHaveLength(1);
      expect(parsed.triplesMaps[0].subjectTemplate).toBe('urn:odbc:org:{id}');
    });
  });
});
