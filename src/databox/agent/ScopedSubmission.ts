import { BadRequestHttpError } from '../../util/errors/BadRequestHttpError';

/**
 * Scoped preference/correction submission (data minimisation, T-51; ADR-0013/0017 §submit selected fields
 * only; dbx-04 §7.2). When the consumer submits a preference or a correction it discloses **only the fields
 * it explicitly selected** — never the whole record it holds, never a field the caller did not name. This is
 * the consumer-side counterpart to the deposit minimisation rule: the agent must not over-share on the way
 * out any more than it auto-acts on the way in.
 *
 * {@link buildScopedSubmission} is a pure projection: from a full candidate object and an explicit list of
 * field names, it emits a submission whose `fields` contain **exactly** those names and nothing else. A
 * selected name that is absent from the candidate fails closed (you cannot disclose a field that does not
 * exist — the caller's selection is wrong), and an empty selection fails closed (a submission must disclose
 * at least one field). The result is frozen so a downstream endpoint cannot widen it before transmission.
 */

/** A minimised submission: only the explicitly selected fields, plus the class/correction metadata. */
export interface ScopedSubmission {
  /** The record/submission class this preference or correction is scoped to. */
  readonly recordClass: string;
  /** The opaque id of the record being corrected, when this is a correction (never a global identifier). */
  readonly correctionOf?: string;
  /** The exact selected field names disclosed (in the caller's order, deduplicated). */
  readonly disclosedFields: readonly string[];
  /** The disclosed values — EXACTLY the selected fields, nothing more (T-51 minimisation). */
  readonly fields: Readonly<Record<string, unknown>>;
}

/** Metadata for a scoped submission (never carries record content beyond what is selected). */
export interface ScopedSubmissionMeta {
  readonly recordClass: string;
  readonly correctionOf?: string;
}

/**
 * Deep-clone AND deep-freeze a selected value (L3). Cloning severs the link to the caller's live object so a
 * later mutation of the source cannot alter what was submitted; freezing every level makes the "cannot widen
 * before transmission" guarantee total (a shallow freeze would leave nested objects/arrays mutable).
 */
function deepFreezeClone(value: unknown): unknown {
  if (Array.isArray(value)) {
    return Object.freeze(value.map(deepFreezeClone));
  }
  if (value !== null && typeof value === 'object') {
    const clone: Record<string, unknown> = {};
    for (const [ key, nested ] of Object.entries(value as Record<string, unknown>)) {
      clone[key] = deepFreezeClone(nested);
    }
    return Object.freeze(clone);
  }
  return value;
}

/**
 * Project a full candidate object down to only the selected fields. Fails closed on an empty selection or a
 * selected field that is absent from the candidate, so a submission can never silently omit a required
 * disclosure or over-disclose a field the caller did not name.
 *
 * @param candidate - The full object the consumer holds (only a subset is ever disclosed).
 * @param selectedFields - The explicit field names to disclose (at least one; each must exist in candidate).
 * @param meta - The submission class + optional correction target.
 */
export function buildScopedSubmission(
  candidate: Readonly<Record<string, unknown>>,
  selectedFields: readonly string[],
  meta: ScopedSubmissionMeta,
): ScopedSubmission {
  if (typeof meta.recordClass !== 'string' || meta.recordClass.length === 0) {
    throw new BadRequestHttpError('A scoped submission requires a non-empty recordClass.');
  }
  if (!Array.isArray(selectedFields) || selectedFields.length === 0) {
    throw new BadRequestHttpError('A scoped submission must disclose at least one selected field (T-51).');
  }
  const candidateKeys = new Set(Object.keys(candidate));
  const disclosed: string[] = [];
  const seen = new Set<string>();
  const fields: Record<string, unknown> = {};
  for (const name of selectedFields) {
    if (typeof name !== 'string' || name.length === 0) {
      throw new BadRequestHttpError('A selected field name must be a non-empty string.');
    }
    if (!candidateKeys.has(name)) {
      throw new BadRequestHttpError(`Selected field '${name}' is not present in the candidate; refusing (T-51).`);
    }
    if (!seen.has(name)) {
      seen.add(name);
      disclosed.push(name);
    }
    // Disclose ONLY the selected field's own value — nothing else from the candidate crosses the boundary —
    // and clone+freeze it so a later source mutation cannot leak in and the submission cannot be widened (L3).
    fields[name] = deepFreezeClone(candidate[name]);
  }
  return Object.freeze<ScopedSubmission>({
    recordClass: meta.recordClass,
    ...meta.correctionOf === undefined ? {} : { correctionOf: meta.correctionOf },
    disclosedFields: Object.freeze([ ...disclosed ]),
    fields: Object.freeze(fields),
  });
}
