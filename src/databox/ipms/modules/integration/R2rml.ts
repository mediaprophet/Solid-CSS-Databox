import { BadRequestHttpError } from '../../../../util/errors/BadRequestHttpError';

export interface ColumnMapping {
  readonly column: string;
  readonly predicate: string;
}

export interface RowMapping {
  /** Subject IRI template with `{column}` placeholders, e.g. `https://acme.example/person/{id}`. */
  readonly subjectTemplate: string;
  readonly columns: readonly ColumnMapping[];
}

export type Row = Record<string, string>;

export interface Triple {
  readonly subject: string;
  readonly predicate: string;
  readonly object: string;
}

const PLACEHOLDER = /\{([^{}]+)\}/gu;

function fillTemplate(template: string, row: Row): string {
  return template.replaceAll(PLACEHOLDER, (match: string, column: string): string => {
    const value = row[column];
    if (value === undefined) {
      throw new BadRequestHttpError(`Row is missing template column "${column}".`);
    }
    return encodeURIComponent(value);
  });
}

/**
 * Map one relational row to RDF triples, R2RML-style (see `databox/solid-ipms-plan.md`, §1.5): a subject
 * IRI template with `{column}` placeholders plus a column→predicate list. Pure and deterministic — the
 * declarative mapping is the portable "work"; this is the thin evaluator over it. Columns absent from the
 * row are skipped; a template placeholder absent from the row is an error.
 */
export function mapRow(mapping: RowMapping, row: Row): Triple[] {
  if (mapping.subjectTemplate.length === 0) {
    throw new BadRequestHttpError('A row mapping needs a subject template.');
  }
  const subject = fillTemplate(mapping.subjectTemplate, row);
  const triples: Triple[] = [];
  for (const { column, predicate } of mapping.columns) {
    const object = row[column];
    if (object !== undefined) {
      triples.push({ subject, predicate, object });
    }
  }
  return triples;
}
