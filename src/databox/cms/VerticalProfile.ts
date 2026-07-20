import type { BlankNode, Literal, NamedNode, Quad, Term } from '@rdfjs/types';
import { DataFactory, Parser, Writer } from 'n3';
import { CMS, DC, RDF } from '../../util/Vocabularies';
import type { DataboxModuleRegistry } from './DataboxModuleRegistry';
import type { ModuleConfigStore } from './ModuleConfigStore';

const SCHEMA = 'https://schema.org/';
const XSD = 'http://www.w3.org/2001/XMLSchema#';
const RDF_FIRST = namedNode(`${RDF.namespace}first`);
const RDF_REST = namedNode(`${RDF.namespace}rest`);
const RDF_NIL = namedNode(`${RDF.namespace}nil`);
const RDF_VALUE = namedNode(`${RDF.namespace}value`);

const TERMS = {
  verticalProfile: namedNode(`${CMS.namespace}VerticalProfile`),
  identifier: namedNode(`${SCHEMA}identifier`),
  softwareVersion: namedNode(`${SCHEMA}softwareVersion`),
  useCaseList: namedNode(`${CMS.namespace}useCaseList`),
  moduleList: namedNode(`${CMS.namespace}moduleList`),
  moduleId: namedNode(`${CMS.namespace}moduleId`),
  required: namedNode(`${CMS.namespace}required`),
  enabledByDefault: namedNode(`${CMS.namespace}enabledByDefault`),
  defaultConfig: namedNode(`${CMS.namespace}defaultConfig`),
  contentType: namedNode(`${CMS.namespace}contentType`),
  rationale: namedNode(`${CMS.namespace}rationale`),
};

export interface VerticalProfileDefaultConfig {
  readonly contentType: 'text/turtle';
  readonly turtle: string;
}

export interface VerticalProfileModuleReference {
  readonly moduleId: string;
  readonly required: boolean;
  readonly enabledByDefault: boolean;
  readonly rationale: string;
  readonly defaultConfig?: VerticalProfileDefaultConfig;
}

/**
 * Declarative vertical bundle manifest: a profile composes existing horizontal CMS modules by id.
 *
 * The manifest carries no executable behaviour. Its defaults are ordinary RDF Turtle that can be committed
 * through {@link ModuleConfigStore}; CSS-enhanced runtimes can apply it, and vanilla Solid runtimes can still
 * discover and inspect it as RDF.
 */
export interface VerticalProfileManifest {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly description: string;
  readonly useCases: readonly string[];
  readonly modules: readonly VerticalProfileModuleReference[];
}

export interface VerticalProfileValidationResult {
  readonly profile: VerticalProfileManifest;
  readonly missingModules: readonly string[];
}

export interface VerticalProfileRdfOptions {
  readonly subjectIri?: string;
  readonly baseIri?: string;
}

export const FOOD_RESTAURANT_VERTICAL_PROFILE: VerticalProfileManifest = {
  id: 'food.restaurant',
  name: 'Food / Restaurant',
  version: '0.1.0',
  description: 'Small restaurant bundle for menus, ordering-adjacent commerce, reservations, receipts, and public SEO.',
  useCases: [ 'FOOD' ],
  modules: [
    moduleRef('menu', 'Menus are the public food offer and allergen-facing catalogue surface.'),
    moduleRef('catalogue', 'Catalogue resources hold products, modifiers, variants, and publishable item metadata.', {
      turtle: '<> <https://schema.org/itemListOrder> "menu-section" .',
    }),
    moduleRef('stock', 'Stock keeps menu availability honest for a small operator.'),
    moduleRef('payments', 'Payments handles checkout adapters while keeping payment secrets out of portable works.'),
    moduleRef('receipt', 'Receipts produce RDF-backed proof of purchase and the printable QR payload.', {
      turtle: '<> <urn:solid-server:databox:cms#receiptProfile> "consumer-digital-receipt" .',
    }),
    moduleRef('bookings', 'Bookings supports table reservations, deposits, cancellation and rescheduling.'),
    moduleRef('events', 'Events covers special sittings, tastings, and venue programming.'),
    moduleRef('opening-hours', 'Opening hours provides ordinary schema.org availability for public discovery.', {
      turtle: '<> <https://schema.org/servesCuisine> "local" .',
    }),
    moduleRef('website-seo', 'Website SEO publishes JSON-LD and discovery metadata without requiring CSS routes.'),
  ],
};

export const HEALTH_PRIVACY_CONSENT_VERTICAL_PROFILE: VerticalProfileManifest = {
  id: 'health.privacy-consent',
  name: 'Health / Privacy Consent',
  version: '0.1.0',
  description: 'Health privacy bundle for consent, access, correction, governance, delegation, and emergency access.',
  useCases: [ 'HEALTH' ],
  modules: [
    moduleRef('consent', 'Consent records purpose-limited processing decisions as RDF policy state.', {
      turtle: '<> <urn:solid-server:databox:cms#defaultPurpose> "care-provision" .',
    }),
    moduleRef('access-request', 'Access requests support patient rights over held records.'),
    moduleRef('correction-request', 'Correction requests support amendment workflows without destructive edits.'),
    moduleRef('governance', 'Governance supplies approval gates and auditable resolutions for sensitive handling.', {
      turtle: '<> <urn:solid-server:databox:cms#approvalMode> "dual-control-for-sensitive-data" .',
    }),
    moduleRef('delegation', 'Delegation gives carers and guardians scoped revocable authority.'),
    moduleRef('break-glass', 'Break-glass access is temporary, conditional, and audited for emergencies.'),
    moduleRef('credential-gate', 'Credential gates verify qualifications or care roles with minimal disclosure.'),
  ],
};

export const LIGHTHOUSE_VERTICAL_PROFILES: readonly VerticalProfileManifest[] = [
  FOOD_RESTAURANT_VERTICAL_PROFILE,
  HEALTH_PRIVACY_CONSENT_VERTICAL_PROFILE,
];

export function validateVerticalProfileBundle(
  profile: VerticalProfileManifest,
  registry: DataboxModuleRegistry,
): VerticalProfileValidationResult {
  const checked = validateVerticalProfile(profile);
  return {
    profile: checked,
    missingModules: checked.modules
      .filter((module): boolean => registry.get(module.moduleId) === undefined)
      .map((module): string => module.moduleId),
  };
}

export async function applyVerticalProfileBundle(
  profile: VerticalProfileManifest,
  registry: DataboxModuleRegistry,
  configStore?: ModuleConfigStore,
): Promise<VerticalProfileValidationResult> {
  const validation = validateVerticalProfileBundle(profile, registry);
  if (validation.missingModules.length > 0) {
    throw new Error(`Vertical profile ${validation.profile.id} references missing modules: ${
      validation.missingModules.join(', ')
    }.`);
  }

  for (const module of validation.profile.modules) {
    registry.setEnabled(module.moduleId, module.enabledByDefault);
    if (module.defaultConfig && !configStore) {
      throw new Error(`Vertical profile ${validation.profile.id} needs a ModuleConfigStore to apply RDF defaults.`);
    }
    if (configStore) {
      if (module.defaultConfig) {
        await configStore.save(module.moduleId, module.defaultConfig.turtle);
      }
      await configStore.setEnabled(module.moduleId, module.enabledByDefault);
    }
  }
  return validation;
}

export async function serializeVerticalProfileToTurtle(
  profile: VerticalProfileManifest,
  options: VerticalProfileRdfOptions = {},
): Promise<string> {
  const checked = validateVerticalProfile(profile);
  const subject = namedNode(options.subjectIri ?? defaultProfileSubject(checked.id));
  const quads: Quad[] = [
    rdfQuad(subject, RDF.terms.type, TERMS.verticalProfile),
    rdfQuad(subject, TERMS.identifier, literal(checked.id)),
    rdfQuad(subject, DC.terms.title, literal(checked.name)),
    rdfQuad(subject, TERMS.softwareVersion, literal(checked.version)),
    rdfQuad(subject, DC.terms.description, literal(checked.description)),
  ];

  addStringList(quads, subject, TERMS.useCaseList, checked.useCases);
  addModuleList(quads, subject, checked.modules);
  return serializeTurtle(quads);
}

export function parseVerticalProfileRdf(turtle: string, options: VerticalProfileRdfOptions = {}):
VerticalProfileManifest {
  let quads: Quad[];
  try {
    quads = new Parser({ baseIRI: options.baseIri }).parse(turtle);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`CMS vertical profile RDF could not be parsed: ${message}`);
  }

  const subject = options.subjectIri ? namedNode(options.subjectIri) : findProfileSubject(quads);
  if (!hasQuad(quads, subject, RDF.terms.type, TERMS.verticalProfile)) {
    throw new Error(`CMS vertical profile ${subject.value} must declare rdf:type cms:VerticalProfile.`);
  }

  return validateVerticalProfile({
    id: requiredLiteral(quads, subject, TERMS.identifier, 'id'),
    name: requiredLiteral(quads, subject, DC.terms.title, 'name'),
    version: requiredLiteral(quads, subject, TERMS.softwareVersion, 'version'),
    description: requiredLiteral(quads, subject, DC.terms.description, 'description'),
    useCases: requiredStringList(quads, subject, TERMS.useCaseList, 'useCases'),
    modules: requiredModuleList(quads, subject),
  });
}

function moduleRef(
  moduleId: string,
  rationale: string,
  defaultConfig?: { readonly turtle: string },
): VerticalProfileModuleReference {
  return {
    moduleId,
    required: true,
    enabledByDefault: true,
    rationale,
    ...defaultConfig === undefined ?
        {} :
        {
          defaultConfig: {
            contentType: 'text/turtle',
            turtle: defaultConfig.turtle,
          },
        },
  };
}

function validateVerticalProfile(profile: VerticalProfileManifest): VerticalProfileManifest {
  const modules = requireArray(profile.modules, 'CMS vertical profile modules')
    .map((module, index): VerticalProfileModuleReference => validateModuleReference(module, index));
  const seen = new Set<string>();
  for (const module of modules) {
    if (seen.has(module.moduleId)) {
      throw new Error(`CMS vertical profile module ${module.moduleId} must be referenced only once.`);
    }
    seen.add(module.moduleId);
  }
  return {
    id: requireProfileId(profile.id, 'CMS vertical profile id'),
    name: requireString(profile.name, 'CMS vertical profile name'),
    version: requireString(profile.version, 'CMS vertical profile version'),
    description: requireString(profile.description, 'CMS vertical profile description'),
    useCases: requireStringArray(profile.useCases, 'CMS vertical profile useCases'),
    modules,
  };
}

function validateModuleReference(value: unknown, index: number): VerticalProfileModuleReference {
  const module = requireRecord(value, `CMS vertical profile module ${index}`);
  let defaultConfig: VerticalProfileDefaultConfig | undefined;
  if (module.defaultConfig !== undefined) {
    defaultConfig = validateDefaultConfig(module.defaultConfig, index);
  }
  return {
    moduleId: requireProfileId(module.moduleId, `CMS vertical profile module ${index} moduleId`),
    required: requireBoolean(module.required, `CMS vertical profile module ${index} required`),
    enabledByDefault: requireBoolean(
      module.enabledByDefault,
      `CMS vertical profile module ${index} enabledByDefault`,
    ),
    rationale: requireString(module.rationale, `CMS vertical profile module ${index} rationale`),
    ...defaultConfig === undefined ? {} : { defaultConfig },
  };
}

function validateDefaultConfig(value: unknown, index: number): VerticalProfileDefaultConfig {
  const config = requireRecord(value, `CMS vertical profile module ${index} defaultConfig`);
  return {
    contentType: requireExact(
      config.contentType,
      'text/turtle',
      `CMS vertical profile module ${index} defaultConfig contentType`,
    ),
    turtle: requireString(config.turtle, `CMS vertical profile module ${index} defaultConfig turtle`),
  };
}

function addStringList(
  quads: Quad[],
  subject: NamedNode,
  predicate: NamedNode,
  values: readonly string[],
): void {
  if (values.length === 0) {
    quads.push(rdfQuad(subject, predicate, RDF_NIL));
    return;
  }

  const head = blankNode();
  quads.push(rdfQuad(subject, predicate, head));
  let current: BlankNode = head;
  for (const [ index, value ] of values.entries()) {
    quads.push(rdfQuad(current, RDF_FIRST, literal(value)));
    if (index === values.length - 1) {
      quads.push(rdfQuad(current, RDF_REST, RDF_NIL));
    } else {
      const next = blankNode();
      quads.push(rdfQuad(current, RDF_REST, next));
      current = next;
    }
  }
}

function addModuleList(
  quads: Quad[],
  subject: NamedNode,
  modules: readonly VerticalProfileModuleReference[],
): void {
  const nodes = modules.map((module): BlankNode => {
    const node = blankNode();
    quads.push(
      rdfQuad(node, TERMS.moduleId, literal(module.moduleId)),
      rdfQuad(node, TERMS.required, booleanLiteral(module.required)),
      rdfQuad(node, TERMS.enabledByDefault, booleanLiteral(module.enabledByDefault)),
      rdfQuad(node, TERMS.rationale, literal(module.rationale)),
    );
    if (module.defaultConfig) {
      const config = blankNode();
      quads.push(
        rdfQuad(node, TERMS.defaultConfig, config),
        rdfQuad(config, TERMS.contentType, literal(module.defaultConfig.contentType)),
        rdfQuad(config, RDF_VALUE, literal(module.defaultConfig.turtle)),
      );
    }
    return node;
  });
  addTermList(quads, subject, TERMS.moduleList, nodes);
}

function addTermList(
  quads: Quad[],
  subject: NamedNode,
  predicate: NamedNode,
  values: readonly Quad['object'][],
): void {
  if (values.length === 0) {
    quads.push(rdfQuad(subject, predicate, RDF_NIL));
    return;
  }
  const head = blankNode();
  quads.push(rdfQuad(subject, predicate, head));
  let current: BlankNode = head;
  for (const [ index, value ] of values.entries()) {
    quads.push(rdfQuad(current, RDF_FIRST, value));
    if (index === values.length - 1) {
      quads.push(rdfQuad(current, RDF_REST, RDF_NIL));
    } else {
      const next = blankNode();
      quads.push(rdfQuad(current, RDF_REST, next));
      current = next;
    }
  }
}

function requiredModuleList(quads: readonly Quad[], subject: NamedNode): VerticalProfileModuleReference[] {
  const values = objects(quads, subject, TERMS.moduleList);
  if (values.length === 0) {
    throw new Error('CMS vertical profile modules list is required.');
  }
  if (values.length > 1) {
    throw new Error('CMS vertical profile modules list must have exactly one value.');
  }
  return parseTermList(quads, values[0], 'modules')
    .map((node, index): VerticalProfileModuleReference => parseModuleReference(quads, node, index));
}

function parseModuleReference(quads: readonly Quad[], node: Term, index: number): VerticalProfileModuleReference {
  const defaultConfig = parseDefaultConfig(quads, node, index);
  return {
    moduleId: requiredLiteral(quads, node, TERMS.moduleId, `module ${index} moduleId`),
    required: requiredBooleanLiteral(quads, node, TERMS.required, `module ${index} required`),
    enabledByDefault: requiredBooleanLiteral(
      quads,
      node,
      TERMS.enabledByDefault,
      `module ${index} enabledByDefault`,
    ),
    rationale: requiredLiteral(quads, node, TERMS.rationale, `module ${index} rationale`),
    ...defaultConfig === undefined ? {} : { defaultConfig },
  };
}

function parseDefaultConfig(
  quads: readonly Quad[],
  node: Term,
  index: number,
): VerticalProfileDefaultConfig | undefined {
  const configs = objects(quads, node, TERMS.defaultConfig);
  if (configs.length === 0) {
    return;
  }
  if (configs.length > 1) {
    throw new Error(`CMS vertical profile module ${index} defaultConfig must have exactly one value.`);
  }
  return {
    contentType: requireExact(
      requiredLiteral(quads, configs[0], TERMS.contentType, `module ${index} defaultConfig contentType`),
      'text/turtle',
      `CMS vertical profile module ${index} defaultConfig contentType`,
    ),
    turtle: requiredLiteral(quads, configs[0], RDF_VALUE, `module ${index} defaultConfig turtle`),
  };
}

function requiredStringList(quads: readonly Quad[], subject: NamedNode, predicate: NamedNode, field: string): string[] {
  const values = objects(quads, subject, predicate);
  if (values.length === 0) {
    throw new Error(`CMS vertical profile ${field} list is required.`);
  }
  if (values.length > 1) {
    throw new Error(`CMS vertical profile ${field} list must have exactly one value.`);
  }
  return parseTermList(quads, values[0], field).map((value): string => {
    if (value.termType !== 'Literal') {
      throw new Error(`CMS vertical profile ${field} list entries must be literals.`);
    }
    return requireString(value.value, `CMS vertical profile ${field} list entry`);
  });
}

function parseTermList(quads: readonly Quad[], head: Term, field: string): Term[] {
  const values: Term[] = [];
  const seen = new Set<string>();
  let current = head;
  while (!termEquals(current, RDF_NIL)) {
    const key = termKey(current);
    if (seen.has(key)) {
      throw new Error(`CMS vertical profile ${field} list must not contain a cycle.`);
    }
    seen.add(key);
    const first = objects(quads, current, RDF_FIRST);
    const rest = objects(quads, current, RDF_REST);
    if (first.length !== 1 || rest.length !== 1) {
      throw new Error(`CMS vertical profile ${field} list must be a well-formed RDF list.`);
    }
    values.push(first[0]);
    current = rest[0];
  }
  return values;
}

function findProfileSubject(quads: readonly Quad[]): NamedNode {
  const subjects = quads
    .filter((candidate): boolean => termEquals(candidate.predicate, RDF.terms.type) &&
      termEquals(candidate.object, TERMS.verticalProfile))
    .map((candidate): Term => candidate.subject);
  const unique = uniqueTerms(subjects);
  if (unique.length === 0) {
    throw new Error('CMS vertical profile RDF must contain one rdf:type cms:VerticalProfile subject.');
  }
  if (unique.length > 1) {
    throw new Error('CMS vertical profile RDF must contain exactly one rdf:type cms:VerticalProfile subject.');
  }
  if (unique[0].termType !== 'NamedNode') {
    throw new Error('CMS vertical profile subject must be a named node.');
  }
  return unique[0];
}

function requiredLiteral(quads: readonly Quad[], subject: Term, predicate: NamedNode, field: string): string {
  const values = objects(quads, subject, predicate);
  if (values.length === 0) {
    throw new Error(`CMS vertical profile ${field} is required.`);
  }
  if (values.length > 1) {
    throw new Error(`CMS vertical profile ${field} must have exactly one value.`);
  }
  if (values[0].termType !== 'Literal') {
    throw new Error(`CMS vertical profile ${field} must be a literal.`);
  }
  return values[0].value;
}

function requiredBooleanLiteral(quads: readonly Quad[], subject: Term, predicate: NamedNode, field: string): boolean {
  const value = requiredLiteral(quads, subject, predicate, field);
  if (value !== 'true' && value !== 'false') {
    throw new Error(`CMS vertical profile ${field} must be a boolean literal.`);
  }
  return value === 'true';
}

function hasQuad(quads: readonly Quad[], subject: Term, predicate: NamedNode, object: Term): boolean {
  return quads.some((candidate): boolean => termEquals(candidate.subject, subject) &&
    termEquals(candidate.predicate, predicate) &&
    termEquals(candidate.object, object));
}

function objects(quads: readonly Quad[], subject: Term, predicate: NamedNode): Term[] {
  return quads
    .filter((candidate): boolean =>
      termEquals(candidate.subject, subject) && termEquals(candidate.predicate, predicate))
    .map((candidate): Term => candidate.object);
}

function uniqueTerms(terms: Term[]): Term[] {
  const seen = new Set<string>();
  return terms.filter((term): boolean => {
    const key = termKey(term);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function termEquals(left: Term, right: Term): boolean {
  return left.termType === right.termType && left.value === right.value;
}

function termKey(term: Term): string {
  return `${term.termType}:${term.value}`;
}

function requireRecord(value: unknown, field: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${field} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function requireArray(value: unknown, field: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new TypeError(`${field} must be an array.`);
  }
  return value;
}

function requireStringArray(value: unknown, field: string): string[] {
  return requireArray(value, field).map((entry, index): string => requireString(entry, `${field}[${index}]`));
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${field} must be a non-empty string.`);
  }
  return value;
}

function requireProfileId(value: unknown, field: string): string {
  const id = requireString(value, field);
  if (!/^[\w.:-]+$/u.test(id)) {
    throw new Error(`${field} must be a safe id.`);
  }
  return id;
}

function requireBoolean(value: unknown, field: string): boolean {
  if (typeof value !== 'boolean') {
    throw new TypeError(`${field} must be a boolean.`);
  }
  return value;
}

function requireExact<T extends string>(value: unknown, expected: T, field: string): T {
  if (value !== expected) {
    throw new Error(`${field} must be ${expected}.`);
  }
  return expected;
}

function defaultProfileSubject(id: string): string {
  return `urn:solid-server:databox:cms:vertical-profile:${encodeURIComponent(id)}`;
}

function blankNode(): BlankNode {
  return DataFactory.blankNode();
}

function literal(value: string): Literal {
  return DataFactory.literal(value);
}

function booleanLiteral(value: boolean): Literal {
  return DataFactory.literal(value ? 'true' : 'false', namedNode(`${XSD}boolean`));
}

function namedNode(value: string): NamedNode {
  return DataFactory.namedNode(value);
}

function rdfQuad(subject: Quad['subject'], predicate: Quad['predicate'], object: Quad['object']): Quad {
  return DataFactory.quad(subject, predicate, object);
}

async function serializeTurtle(quads: Quad[]): Promise<string> {
  const writer = new Writer({
    prefixes: {
      cms: namedNode(CMS.namespace),
      dcterms: namedNode(DC.namespace),
      rdf: namedNode(RDF.namespace),
      schema: namedNode(SCHEMA),
      xsd: namedNode(XSD),
    },
  });
  writer.addQuads(quads);
  return new Promise((resolve, reject): void => {
    writer.end((error, result): void => {
      if (error) {
        reject(error);
      } else {
        resolve(typeof result === 'string' ? result : '');
      }
    });
  });
}
