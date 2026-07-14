import { BadRequestHttpError } from '../../util/errors/BadRequestHttpError';
import { sha256Hex } from '../credential/Es256';

/**
 * Deterministic JSON canonicalization + exact-payload digesting for record proofs (ADR-0020 §3, DBX-16).
 *
 * The accepted-payload digest is the load-bearing binding: every record/receipt binds the digest of the
 * **exact accepted bytes**, and any verifier MUST be able to recompute it identically. Two properties are
 * deliberate:
 *
 * - **Deterministic, versioned.** {@link canonicalize} is an RFC 8785-style JSON Canonicalization Scheme
 *   (JCS): object members sorted by UTF-16 code unit, minimal separators, no insignificant whitespace, and a
 *   restricted **portably-deterministic domain** — numbers must be finite decimals below 1e21 magnitude
 *   (exponential forms rejected), `-0` is normalised to `0`, and strings must be Unicode NFC (M2). Values
 *   outside that domain fail closed rather than risk a `recordDigest` a different implementation reproduces
 *   differently. It is pinned as {@link PINNED_CANONICALIZATION_ALG}; a record declaring a different
 *   identifier is unreproducible and rejected by the validator.
 * - **Never mutates the input.** Canonicalization reads the value and returns a new string; the caller's
 *   object is never re-serialised in place, so the accepted bytes and their digest are preserved exactly
 *   (ADR-0018 immutability, ADR-0020 §3).
 */

/** The pinned canonicalization identifier, re-exported for callers digesting record content. */
export { PINNED_CANONICALIZATION_ALG } from './RecordProofTypes';

function serializeNumber(value: number): string {
  if (!Number.isFinite(value)) {
    throw new BadRequestHttpError('Cannot canonicalize a non-finite number (NaN/Infinity).');
  }
  // Normalise negative zero to `0` so `-0` and `0` cannot yield two different digests (M2, RFC 8785 §3.2.2.3).
  if (Object.is(value, -0)) {
    return '0';
  }
  // Restrict to the portably-deterministic DECIMAL domain: ECMAScript switches to exponential notation for a
  // magnitude >= 1e21 (or a very small subnormal), and that exponential form is not reproduced identically by
  // every JSON/JCS implementation. Reject it (fail closed) rather than emit an unportable `recordDigest` (M2).
  const rendered = String(value);
  if (/e/iu.test(rendered)) {
    throw new BadRequestHttpError(
      'Cannot canonicalize a number outside the portable decimal domain (|value| >= 1e21 or subnormal).',
    );
  }
  return rendered;
}

function serializeString(value: string): string {
  // Unicode-equivalent-but-distinct byte sequences must not produce different digests. Require NFC (fail
  // closed on a non-NFC string) so the canonical form is one deterministic normalisation (M2).
  if (value.normalize('NFC') !== value) {
    throw new BadRequestHttpError('Cannot canonicalize a string that is not Unicode NFC-normalised.');
  }
  return JSON.stringify(value);
}

function serialize(value: unknown): string {
  if (value === null) {
    return 'null';
  }
  const kind = typeof value;
  if (kind === 'boolean') {
    return JSON.stringify(value);
  }
  if (kind === 'string') {
    return serializeString(value as string);
  }
  if (kind === 'number') {
    return serializeNumber(value as number);
  }
  if (Array.isArray(value)) {
    // Iterate with for-of (its iterator yields `undefined` for holes, unlike `.map` which skips them) so a
    // hole/undefined element serialises to `null` exactly as JSON does, preserving array length + order.
    const items: string[] = [];
    for (const item of value as unknown[]) {
      items.push(item === undefined ? 'null' : serialize(item));
    }
    return `[${items.join(',')}]`;
  }
  if (kind === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      // `undefined`-valued members are omitted (JSON semantics); everything else is emitted in sorted order.
      // Object keys are unique, so the comparator never sees equal keys.
      .filter(([ , nested ]): boolean => nested !== undefined)
      .sort(([ a ], [ b ]): number => a < b ? -1 : 1)
      .map(([ key, nested ]): string => `${JSON.stringify(key)}:${serialize(nested)}`);
    return `{${entries.join(',')}}`;
  }
  // `undefined`, `function`, `symbol`, `bigint` have no JSON form — fail closed rather than silently drop.
  throw new BadRequestHttpError(`Cannot canonicalize a value of type '${kind}'.`);
}

/**
 * Canonicalize a JSON value to its pinned deterministic string form ({@link PINNED_CANONICALIZATION_ALG}).
 * The input is never mutated. A value containing a non-serialisable member fails closed.
 */
export function canonicalize(value: unknown): string {
  return serialize(value);
}

/** Strip an optional `urn:sha256:` prefix and lowercase, yielding bare hex for comparison. */
export function normalizeSha256(digest: string): string {
  return digest.replace(/^urn:sha256:/u, '').toLowerCase();
}

/**
 * The `urn:sha256:<hex>` digest of the exact bytes, WITHOUT canonicalization — used to bind/verify the
 * accepted payload exactly as received (never re-serialised). Altered bytes yield a different digest and
 * therefore fail the record's bound `payloadDigest`.
 */
export function digestOfBytes(bytes: Buffer | string): string {
  return `urn:sha256:${sha256Hex(bytes)}`;
}

/**
 * The `urn:sha256:<hex>` digest of the CANONICAL form of a JSON value — the reproducible record digest
 * (DBX-18 binds this into the receipt). Deterministic for any verifier under the pinned canonicalization.
 */
export function canonicalDigest(value: unknown): string {
  return `urn:sha256:${sha256Hex(canonicalize(value))}`;
}
