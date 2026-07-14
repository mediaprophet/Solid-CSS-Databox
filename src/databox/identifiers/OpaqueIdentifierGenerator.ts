import type { ResourceIdentifier } from '../../http/representation/ResourceIdentifier';
import type { IdentifierGenerator } from '../../pods/generate/IdentifierGenerator';
import { NotImplementedHttpError } from '../../util/errors/NotImplementedHttpError';

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
 * replaced, not the primitive. Concrete implementation is DBX-10.
 */
export interface OpaqueIdentifierGenerator extends IdentifierGenerator {
  /**
   * Marks that this generator ignores its `name` input for the emitted identifier so that no PII
   * from the caller can appear in the opaque box identifier.
   */
  readonly opaque: true;
}

/**
 * Fail-closed placeholder for {@link OpaqueIdentifierGenerator}.
 *
 * Minting a box identifier is a control-plane action with permanent consequences (identifiers are
 * never reassigned, DBX-04 §6). Rather than emit a guessable placeholder identifier, this stub
 * throws {@link NotImplementedHttpError} until DBX-10 supplies the CSPRNG-backed generator.
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
