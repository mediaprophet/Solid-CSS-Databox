import type { DataboxRequestContext } from '../context/DataboxRequestContext';
import type { AssuranceDimension } from '../profile/InstitutionProfile';
import type { ReviewerAssuranceRequirement } from './ReviewTypes';

/**
 * The reviewer assurance gate (component C17; ADR-0010 per-dimension assurance, ADR-0023 §Correction is a
 * governed exchange; T-45 fail closed). A reviewer/governed process may only claim or dispose a case if the
 * assurance derived from its VERIFIED context meets the required per-dimension minimum.
 *
 * It fails closed by construction:
 * - Assurance is read ONLY from {@link DataboxRequestContext.assurance} (a verified, signed claim) — never
 *   from a caller-supplied number, so an under-assured reviewer cannot assert a grade it does not hold.
 * - An ABSENT assurance context, or ANY required dimension the context does not meet, denies (a missing
 *   dimension is treated at its lowest value `0`, the ADR-0010 fail-closed default).
 */

/** The reason an assurance check failed (structured; never leaks a protected fact). */
export interface AssuranceGateResult {
  /** Whether the reviewer meets every required dimension minimum. */
  readonly met: boolean;
  /** When unmet, the first dimension that fell short (for a non-leaking audit reason); else undefined. */
  readonly shortfallDimension?: AssuranceDimension;
}

/**
 * Evaluate a reviewer's verified assurance against a required per-dimension minimum. Returns `met:false`
 * (fail closed) when the context carries no verified assurance, or when any required dimension is below its
 * minimum; the first failing dimension is named so a denial can be audited without leaking the payload.
 */
export function evaluateAssurance(
  context: DataboxRequestContext,
  requirement: ReviewerAssuranceRequirement,
): AssuranceGateResult {
  const dimensions = context.assurance?.dimensions;
  if (dimensions === undefined) {
    // No verified assurance at all → fail closed (never treat an unknown as sufficient).
    const first = Object.keys(requirement)[0] as AssuranceDimension | undefined;
    return first === undefined ? { met: true } : { met: false, shortfallDimension: first };
  }
  for (const [ dimension, minimum ] of Object.entries(requirement) as [ AssuranceDimension, number ][]) {
    // A dimension not present in the verified levels defaults to 0 (ADR-0010 fail-closed default).
    const level = dimensions[dimension] ?? 0;
    if (level < minimum) {
      return { met: false, shortfallDimension: dimension };
    }
  }
  return { met: true };
}

/** Convenience predicate: whether the reviewer's verified assurance meets the requirement (fail closed). */
export function meetsAssurance(context: DataboxRequestContext, requirement: ReviewerAssuranceRequirement): boolean {
  return evaluateAssurance(context, requirement).met;
}
