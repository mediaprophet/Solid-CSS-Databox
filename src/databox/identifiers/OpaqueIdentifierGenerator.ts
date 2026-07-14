import { randomBytes } from 'node:crypto';
import type { ResourceIdentifier } from '../../http/representation/ResourceIdentifier';
import type { IdentifierGenerator } from '../../pods/generate/IdentifierGenerator';
import { BadRequestHttpError } from '../../util/errors/BadRequestHttpError';
import { InternalServerError } from '../../util/errors/InternalServerError';
import { NotImplementedHttpError } from '../../util/errors/NotImplementedHttpError';
import { ensureTrailingSlash } from '../../util/PathUtil';

/**
 * Opaque box-identifier generator seam (component C10, DBX-04 §6; ADR-0004; DBX-10/HAK-06).
 *
 * CSS pod identifiers are slug/name-derived and therefore PII-bearing and predictable
 * ({@link SubdomainIdentifierGenerator}/{@link SuffixIdentifierGenerator}, DBX-01 §5). The Databox
 * needs opaque, PII-free, cryptographically random box identifiers that are *never reassigned*
 * (DBX-04 §6 authoritative-state matrix). This narrows the CSS {@link IdentifierGenerator} contract:
 * the input `name` MUST NOT influence the emitted identifier (no PII leakage), and a protected
 * map (C11) is authoritative for name↔identifier resolution.
 *
 * The primitive already exists in-tree (`randomUUID`, `randomBytes`, DBX-01 §5); the generator is
 * replaced, not the primitive. The concrete implementation is {@link RandomOpaqueIdentifierGenerator}
 * (DBX-10); {@link NotImplementedOpaqueIdentifierGenerator} remains the fail-closed default until it is
 * wired into a control-plane preset.
 */
export interface OpaqueIdentifierGenerator extends IdentifierGenerator {
  /**
   * Marks that this generator ignores its `name` input for the emitted identifier so that no PII
   * from the caller can appear in the opaque box identifier.
   */
  readonly opaque: true;
}

/**
 * The minimum entropy for an opaque box identifier: 16 bytes = 128 bits of CSPRNG output
 * (ADR-0002 §3.2; architecture.md "Resource layout"). Anything weaker is rejected at construction
 * (fail closed — provisioning fails rather than emitting a guessable identifier, ADR-0002 §failure).
 */
export const MIN_OPAQUE_ID_BYTES = 16;

/**
 * Real opaque box-identifier generator (component C10, DBX-10) replacing the fail-closed C10 stub.
 *
 * Every identifier is `>= 128` bits of {@link randomBytes} CSPRNG output rendered as lowercase hex and
 * appended to a fixed base. Consequences that matter for the threat model:
 *
 * - **T-06 (enumeration):** identifiers are drawn from a `>= 2^128` space with no sequence or timestamp
 *   component, so an attacker cannot guess or increment their way to another box (opaque ≠ secret; access
 *   still requires authorization, invariant 3 — but the identifier itself leaks nothing and cannot be
 *   walked).
 * - **Invariant 2 (no PII in URLs/logs):** {@link generate} takes no argument at all — the CSS
 *   `IdentifierGenerator.generate(name)` contract is satisfied by parameter contravariance, and the caller's
 *   `name`/customer reference is *structurally incapable* of influencing the emitted identifier.
 * - **Never reassigned (ADR-0002 §3.2):** the generator only mints; it never derives an identifier from
 *   input, so it cannot reproduce a previously issued value. The protected map (C11) owns lifecycle.
 */
export class RandomOpaqueIdentifierGenerator implements OpaqueIdentifierGenerator {
  public readonly opaque = true as const;
  private readonly base: string;
  private readonly byteLength: number;

  /**
   * @param base - The container the boxes live under (e.g. `https://databox.example/boxes/`). A trailing
   *   slash is ensured.
   * @param byteLength - Bytes of CSPRNG entropy per identifier; defaults to (and may never be below)
   *   {@link MIN_OPAQUE_ID_BYTES} (128 bits). A weaker request fails closed.
   */
  public constructor(base: string, byteLength: number = MIN_OPAQUE_ID_BYTES) {
    if (!Number.isInteger(byteLength) || byteLength < MIN_OPAQUE_ID_BYTES) {
      throw new InternalServerError(
        `Opaque identifiers require >= ${MIN_OPAQUE_ID_BYTES} bytes (128 bits) of entropy; refusing ${byteLength}.`,
      );
    }
    this.base = ensureTrailingSlash(base);
    this.byteLength = byteLength;
  }

  /**
   * Mints a fresh opaque box identifier. Deliberately takes **no** parameter: it satisfies the
   * {@link IdentifierGenerator.generate} `(name) => ResourceIdentifier` contract by contravariance while
   * making it impossible for any caller-supplied `name` (a customer reference, email, loyalty number) to
   * reach the emitted identifier (invariant 2 / ADR-0004).
   */
  public generate(): ResourceIdentifier {
    const id = randomBytes(this.byteLength).toString('hex');
    return { path: ensureTrailingSlash(new URL(id, this.base).href) };
  }

  /**
   * Resolves the box root an identifier belongs to. Mirrors {@link SuffixIdentifierGenerator.extractPod}:
   * an identifier outside this generator's base, or one with no box segment, is rejected rather than
   * guessed (fail closed).
   */
  public extractPod(identifier: ResourceIdentifier): ResourceIdentifier {
    const { path } = identifier;
    if (!path.startsWith(this.base)) {
      throw new BadRequestHttpError(`Invalid opaque identifier ${path}`);
    }
    // The first slash after the base URL closes the opaque box segment.
    const idx = path.indexOf('/', this.base.length + 1);
    if (idx < 0) {
      throw new BadRequestHttpError(`Invalid opaque identifier ${path}`);
    }
    return { path: path.slice(0, idx + 1) };
  }
}

/**
 * Fail-closed placeholder for {@link OpaqueIdentifierGenerator}.
 *
 * Minting a box identifier is a control-plane action with permanent consequences (identifiers are
 * never reassigned, DBX-04 §6). Rather than emit a guessable placeholder identifier, this stub
 * throws {@link NotImplementedHttpError}. {@link RandomOpaqueIdentifierGenerator} (DBX-10) is the real
 * generator; this stub stays as the default a preset must consciously replace.
 */
/* eslint-disable unused-imports/no-unused-vars */
export class NotImplementedOpaqueIdentifierGenerator implements OpaqueIdentifierGenerator {
  public readonly opaque = true as const;

  public generate(name: string): ResourceIdentifier {
    throw new NotImplementedHttpError('Opaque box-identifier generator (C10) is not implemented (DBX-10).');
  }

  public extractPod(identifier: ResourceIdentifier): ResourceIdentifier {
    throw new NotImplementedHttpError('Opaque box-identifier generator (C10) is not implemented (DBX-10).');
  }
}
