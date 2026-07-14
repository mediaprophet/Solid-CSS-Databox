import { BadRequestHttpError } from '../../util/errors/BadRequestHttpError';
import { sha256Hex } from '../credential/Es256';
import { normalizeSha256 } from './Canonicalization';
import { DBX_RECORD_CONTEXT, VC_V2_CONTEXT } from './RecordProofTypes';

/**
 * Offline verification bundle + pinned-context enforcement (ADR-0020 §5, ADR-0025 S-14, DBX-16).
 *
 * A record MUST be verifiable **without dereferencing mutable or organisation-private URLs**: contexts are
 * pinned by content hash, and any context a record references that is not in the pinned set — or whose
 * carried content does not hash to the pinned value — is rejected. This closes the malicious-context threat
 * (T-21): a verifier never fetches, expands or trusts a remote/unknown JSON-LD context.
 *
 * The concrete pinned hashes are a cryptographer sign-off / compatibility-manifest value (ADR-0020 §Open
 * sub-questions), so they are **injected** into {@link PinnedContextSet} by the deployment rather than
 * hardcoded here; this module fixes only the fail-closed enforcement. {@link PINNED_RECORD_CONTEXT_URLS}
 * is the allowlisted URL set records may reference.
 */

/** The allowlisted JSON-LD context URLs a Databox record/receipt may reference (ADR-0020 §5). */
export const PINNED_RECORD_CONTEXT_URLS: readonly string[] = [ VC_V2_CONTEXT, DBX_RECORD_CONTEXT ];

/** A context document carried in an offline bundle: its URL and its verbatim content. */
export interface CarriedContext {
  readonly url: string;
  readonly content: string;
}

/**
 * A pinned-context set: a map from context URL to its pinned SHA-256 (hex). It answers two questions,
 * both fail-closed: is a referenced context URL pinned at all, and does a carried context's content hash
 * match the pin. A record referencing any un-pinned URL, or carrying a context whose bytes were mutated,
 * is rejected (T-21).
 */
export class PinnedContextSet {
  private readonly pinned: ReadonlyMap<string, string>;

  /**
   * @param pinned - URL → pinned SHA-256 hex. Each hash is normalised (an optional `urn:sha256:` prefix is
   *   accepted); an empty/whitespace hash for any URL is refused (a pin of "nothing" is not a pin).
   */
  public constructor(pinned: ReadonlyMap<string, string>) {
    const normalised = new Map<string, string>();
    for (const [ url, hash ] of pinned) {
      const bare = normalizeSha256(hash);
      if (!/^[0-9a-f]{64}$/u.test(bare)) {
        throw new BadRequestHttpError(`Pinned context '${url}' must have a 64-hex SHA-256 pin.`);
      }
      normalised.set(url, bare);
    }
    this.pinned = normalised;
  }

  /**
   * Assert every referenced context URL is pinned (in the allowlist). A URL that is not pinned — a remote or
   * unknown context — is rejected before anything trusts the document (T-21). The referenced set must be a
   * non-empty array of strings.
   */
  public assertAllowed(contextUrls: readonly string[]): void {
    if (!Array.isArray(contextUrls) || contextUrls.length === 0) {
      throw new BadRequestHttpError('Record @context must be a non-empty array of pinned context URLs.');
    }
    for (const url of contextUrls) {
      if (typeof url !== 'string' || !this.pinned.has(url)) {
        throw new BadRequestHttpError(`Unpinned/remote JSON-LD context is refused: ${String(url)} (T-21).`);
      }
    }
  }

  /**
   * Verify each carried context document hashes to its pinned value. A carried context whose URL is not
   * pinned, or whose recomputed content hash does not match the pin, is rejected (a mutated/substituted
   * context, T-21). Contexts a bundle does not carry are still subject to {@link assertAllowed}.
   */
  public verifyCarried(carried: readonly CarriedContext[]): void {
    for (const context of carried) {
      const expected = this.pinned.get(context.url);
      if (expected === undefined) {
        throw new BadRequestHttpError(`Carried context is not pinned: ${context.url} (T-21).`);
      }
      if (sha256Hex(context.content) !== expected) {
        throw new BadRequestHttpError(`Carried context content does not match its pinned hash: ${context.url}.`);
      }
    }
  }
}
