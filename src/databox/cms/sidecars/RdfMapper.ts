/**
 * R2RML/RML mapping engine — applies mapping definitions to ODBC/LDAP query
 * results and produces RDF (Turtle or JSON-LD) output.
 *
 * Supports a simplified subset of R2RML (W3C) and RML (http://rml.io/) mapping
 * definitions, focused on the practical needs of the Databox enterprise connector
 * pipeline:
 *
 * - **Subject IRI template**: `urn:source:{id}` — `{column}` placeholders are
 *   replaced with row values.
 * - **Class/type mapping**: `rr:class schema:Person` — sets the rdf:type.
 * - **Predicate-column mapping**: `schema:name <- name` — maps a source column
 *   to an RDF predicate.
 * - **Constant value mapping**: `schema:status <- "active"` — emits a constant.
 * - **Language tag**: `schema:description <- description@en` — adds a language tag.
 * - **Datatype**: `schema:price <- price^^xsd:decimal` — sets a literal datatype.
 *
 * Mapping definitions are loaded from the pod as Turtle resources and parsed
 * into {@link MappingDefinition} objects.
 */

/** A single field mapping from a source column to an RDF predicate. */
export interface FieldMapping {
  /** RDF predicate URI (e.g. `https://schema.org/name`). */
  predicate: string;
  /** Source column/attribute name to map from. */
  sourceColumn?: string;
  /** Constant value (used when sourceColumn is not set). */
  constantValue?: string;
  /** Language tag for string literals (e.g. `en`). */
  languageTag?: string;
  /** Datatype URI for typed literals (e.g. `http://www.w3.org/2001/XMLSchema#integer`). */
  datatype?: string;
  /** Whether this is a URI reference (true) or a literal (false, default). */
  isUri?: boolean;
}

/** A mapping for one source row to one RDF resource. */
export interface TriplesMap {
  /** Unique identifier for this triples map. */
  id: string;
  /** Subject IRI template with `{column}` placeholders (e.g. `urn:odbc:org:{id}`). */
  subjectTemplate: string;
  /** RDF type(s) to assign (e.g. `https://schema.org/Organization`). */
  classes: string[];
  /** Field mappings. */
  fields: FieldMapping[];
}

/** A complete mapping definition containing one or more triples maps. */
export interface MappingDefinition {
  /** Unique identifier for the mapping. */
  id: string;
  /** Human-readable name. */
  name: string;
  /** Source type: odbc or ldap. */
  sourceType: 'odbc' | 'ldap';
  /** Triples maps. */
  triplesMaps: TriplesMap[];
}

/** A row from any source (ODBC or LDAP). */
export type SourceRow = Record<string, unknown>;

/**
 * Apply a mapping definition to source rows and produce RDF Turtle.
 */
export function applyMappingToTurtle(mapping: MappingDefinition, rows: SourceRow[]): string {
  const triples: string[] = [];

  for (const row of rows) {
    for (const tm of mapping.triplesMaps) {
      const subject = resolveTemplate(tm.subjectTemplate, row);
      if (!subject) {
        continue;
      }

      // Emit rdf:type triples
      for (const cls of tm.classes) {
        triples.push(`<${subject}> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <${cls}> .`);
      }

      // Emit predicate triples
      for (const field of tm.fields) {
        const value = resolveFieldValue(field, row);
        if (value === null || value === undefined) {
          continue;
        }
        triples.push(`<${subject}> <${field.predicate}> ${value} .`);
      }
    }
  }

  return triples.join('\n') + (triples.length > 0 ? '\n' : '');
}

/**
 * Apply a mapping definition to source rows and produce JSON-LD.
 */
export function applyMappingToJsonLd(mapping: MappingDefinition, rows: SourceRow[]): Record<string, unknown>[] {
  const results: Record<string, unknown>[] = [];

  for (const row of rows) {
    for (const tm of mapping.triplesMaps) {
      const subject = resolveTemplate(tm.subjectTemplate, row);
      if (!subject) {
        continue;
      }

      const obj: Record<string, unknown> = {
        '@id': subject,
      };

      if (tm.classes.length > 0) {
        obj['@type'] = tm.classes.length === 1 ? tm.classes[0] : tm.classes;
      }

      for (const field of tm.fields) {
        const rawValue = resolveRawValue(field, row);
        if (rawValue === null || rawValue === undefined) {
          continue;
        }

        if (field.isUri) {
          obj[field.predicate] = { '@id': toStr(rawValue) };
        } else if (field.languageTag) {
          obj[field.predicate] = { '@value': toStr(rawValue), '@language': field.languageTag };
        } else if (field.datatype) {
          obj[field.predicate] = { '@value': toStr(rawValue), '@type': field.datatype };
        } else {
          obj[field.predicate] = rawValue;
        }
      }

      results.push(obj);
    }
  }

  return results;
}

/**
 * Resolve a subject IRI template by replacing `{column}` placeholders with row values.
 */
function resolveTemplate(template: string, row: SourceRow): string | null {
  return template.replaceAll(/\{(\w+)\}/gu, (match, key: string): string => {
    const value = row[key];
    if (value === null || value === undefined) {
      return '';
    }
    return encodeURIComponent(toStr(value));
  }) || null;
}

/**
 * Resolve the raw value for a field (before formatting as RDF).
 */
function resolveRawValue(field: FieldMapping, row: SourceRow): unknown {
  if (field.constantValue !== undefined) {
    return field.constantValue;
  }
  if (field.sourceColumn) {
    return row[field.sourceColumn];
  }
  return undefined;
}

/**
 * Resolve a field value and format it as an RDF term (for Turtle).
 */
function resolveFieldValue(field: FieldMapping, row: SourceRow): string | null {
  const raw = resolveRawValue(field, row);
  if (raw === null || raw === undefined) {
    return null;
  }

  const str = toStr(raw);

  if (field.isUri) {
    return `<${str}>`;
  }

  if (field.languageTag) {
    return `"${escapeTurtle(str)}"@${field.languageTag}`;
  }

  if (field.datatype) {
    return `"${escapeTurtle(str)}"^^<${field.datatype}>`;
  }

  return `"${escapeTurtle(str)}"`;
}

function toStr(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value);
  }
  return JSON.stringify(value);
}

function escapeTurtle(str: string): string {
  return str
    .replaceAll('\\', '\\\\')
    .replaceAll('"', '\\"')
    .replaceAll('\n', '\\n')
    .replaceAll('\r', '\\r')
    .replaceAll('\t', '\\t');
}

/**
 * Parse a simplified R2RML/Turtle mapping definition into a {@link MappingDefinition}.
 *
 * The expected Turtle format uses a custom vocabulary:
 * ```
 * @prefix rr: <http://www.w3.org/ns/r2rml#> .
 * @prefix dbx: <urn:solid-server:databox:mapping#> .
 *
 * <#MyMapping> a dbx:Mapping ;
 *   dbx:sourceType "odbc" ;
 *   dbx:name "My Mapping" ;
 *   dbx:triplesMap <#OrgMap> .
 *
 * <#OrgMap> a dbx:TriplesMap ;
 *   rr:subjectMap [ rr:template "urn:odbc:org:{id}" ; rr:class schema:Organization ] ;
 *   rr:predicateObjectMap [
 *     rr:predicate schema:name ;
 *     rr:objectMap [ rr:column "name" ]
 *   ] .
 * ```
 */
export function parseMappingFromTurtle(turtle: string): MappingDefinition {
  // Simple parser for the subset we support
  // This is a pragmatic parser — not a full R2RML parser
  const id = extractId(turtle, 'Mapping') ?? `mapping-${Date.now()}`;
  const name = extractLiteral(turtle, 'name') ?? 'Unnamed Mapping';
  const sourceType = (extractLiteral(turtle, 'sourceType') as 'odbc' | 'ldap') ?? 'odbc';

  // Extract triples maps (simplified — looks for TriplesMap subjects)
  const triplesMaps: TriplesMap[] = [];
  const tmPattern = /<([^>]+)>\s+a\s[^;>]*TriplesMap[">]?/gu;
  let match = tmPattern.exec(turtle);
  while (match !== null) {
    const tmId = match[1];
    const subjectTemplate = extractTemplateForSubject(turtle, tmId) ?? `urn:temp:${tmId}`;
    const classes = extractClassesForSubject(turtle, tmId);
    const fields = extractFieldsForSubject(turtle, tmId);

    triplesMaps.push({
      id: tmId,
      subjectTemplate,
      classes,
      fields,
    });
    match = tmPattern.exec(turtle);
  }

  // If no triples maps found via R2RML, try a simpler JSON-like format
  if (triplesMaps.length === 0) {
    try {
      const json = JSON.parse(turtle) as MappingDefinition;
      if (json.triplesMaps && Array.isArray(json.triplesMaps)) {
        return json;
      }
    } catch {
      // Not JSON either — create a default map
    }
  }

  return { id, name, sourceType, triplesMaps };
}

function extractId(turtle: string, type: string): string | undefined {
  const re = new RegExp(`<([^>]+)>\\s+a\\s+[^;]*${type}`, 'u');
  const match = re.exec(turtle);
  return match?.[1];
}

function extractLiteral(turtle: string, predicate: string): string | undefined {
  const re = new RegExp(`${predicate}\\s+"([^"]*)"`, 'u');
  const match = re.exec(turtle);
  return match?.[1];
}

function extractTemplateForSubject(turtle: string, subjectId: string): string | undefined {
  const re = new RegExp(`<${escapeRegex(subjectId)}>[\\s\\S]*?rr:template\\s+"([^"]*)"`, 'u');
  const match = re.exec(turtle);
  return match?.[1];
}

function extractClassesForSubject(turtle: string, subjectId: string): string[] {
  const classes: string[] = [];
  const re = new RegExp(`<${escapeRegex(subjectId)}>[\\s\\S]*?rr:class\\s+<([^>]+)>`, 'gu');
  let match = re.exec(turtle);
  while (match !== null) {
    classes.push(match[1]);
    match = re.exec(turtle);
  }
  return classes;
}

function extractFieldsForSubject(turtle: string, subjectId: string): FieldMapping[] {
  void subjectId;
  const fields: FieldMapping[] = [];
  // Match rr:predicateObjectMap blocks
  const blockRe = /rr:predicateObjectMap\s+\[\s*rr:predicate\s+<([^>]+)>\s*;\s*rr:objectMap\s+\[([^\]]*)\]/gu;
  let match = blockRe.exec(turtle);
  while (match !== null) {
    const predicate = match[1];
    const objectMap = match[2];

    const columnMatch = /rr:column\s+"([^"]*)"/u.exec(objectMap);
    const constantMatch = /rr:constant\s+"([^"]*)"/u.exec(objectMap);
    const langMatch = /rr:language\s+"([^"]*)"/u.exec(objectMap);
    const datatypeMatch = /rr:datatype\s+<([^>]+)>/u.exec(objectMap);
    const uriMatch = /rr:termType\s+rr:IRI/u.exec(objectMap);

    fields.push({
      predicate,
      sourceColumn: columnMatch?.[1],
      constantValue: constantMatch?.[1],
      languageTag: langMatch?.[1],
      datatype: datatypeMatch?.[1],
      isUri: Boolean(uriMatch),
    });
    match = blockRe.exec(turtle);
  }
  return fields;
}

function escapeRegex(str: string): string {
  return str.replaceAll(/[$()*+.?[\\\]^{|}]/gu, '\\$&');
}

/**
 * Serialize a {@link MappingDefinition} to Turtle for storage in a pod.
 */
export function serializeMappingToTurtle(mapping: MappingDefinition): string {
  const lines: string[] = [
    '@prefix rr: <http://www.w3.org/ns/r2rml#> .',
    '@prefix dbx: <urn:solid-server:databox:mapping#> .',
    '@prefix schema: <https://schema.org/> .',
    '',
  ];

  const tmIds = mapping.triplesMaps.map((tm): string => tm.id);
  lines.push(`<#${mapping.id}> a dbx:Mapping ;`);
  lines.push(`  dbx:name "${escapeTurtle(mapping.name)}" ;`);
  lines.push(`  dbx:sourceType "${mapping.sourceType}" ;`);
  lines.push(`  dbx:triplesMap ${tmIds.map((id): string => `<#${id}>`).join(', ')} .`);
  lines.push('');

  for (const tm of mapping.triplesMaps) {
    lines.push(`<#${tm.id}> a dbx:TriplesMap ;`);
    lines.push(
      `  rr:subjectMap [ rr:template "${tm.subjectTemplate}"${
        tm.classes.length > 0 ?
          ` ; rr:class ${tm.classes.map((c): string => `<${c}>`).join(', ')}` :
          ''
      } ] ;`,
    );

    if (tm.fields.length > 0) {
      const fieldLines = tm.fields.map((f): string => {
        const parts = [ `rr:predicate <${f.predicate}>` ];
        const objParts: string[] = [];
        if (f.sourceColumn) {
          objParts.push(`rr:column "${f.sourceColumn}"`);
        }
        if (f.constantValue !== undefined) {
          objParts.push(`rr:constant "${f.constantValue}"`);
        }
        if (f.languageTag) {
          objParts.push(`rr:language "${f.languageTag}"`);
        }
        if (f.datatype) {
          objParts.push(`rr:datatype <${f.datatype}>`);
        }
        if (f.isUri) {
          objParts.push(`rr:termType rr:IRI`);
        }
        return `  rr:predicateObjectMap [ ${parts[0]} ; rr:objectMap [ ${objParts.join(' ; ')} ] ]`;
      });
      lines.push(`${fieldLines.join(' ;\n')} .`);
    } else if (lines.length > 0) {
      const lastLine = lines.at(-1);
      if (lastLine !== undefined) {
        lines[lines.length - 1] = lastLine.replace(' ;', ' .');
      }
    }
    lines.push('');
  }

  return lines.join('\n');
}
