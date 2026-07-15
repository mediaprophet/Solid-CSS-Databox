import { BadRequestHttpError } from '../../util/errors/BadRequestHttpError';
import type { AdmissionResult } from './BundleAdmission';
import type { CompiledPolicyBundle, EffectiveInterval } from './PolicyBundle';
import { isBundleSubstituted } from './PolicyBundle';

/**
 * The immutable policy registry (component C12; ADR-0014 §Governing-version selection, §History is never
 * rewritten; §6 authoritative-state matrix — C12 owns the ODRL policy version). It holds ONLY bundles that
 * passed {@link ./BundleAdmission} (an unattested/substituted bundle never reaches it), keeps every
 * registered version (append-only; supersession is by effective-time linkage, never in-place edit), and
 * selects the governing version deterministically for an (asset class, time).
 *
 * Selection fails closed (ADR-0014 §Failure behavior): a version that cannot be UNIQUELY selected
 * (overlapping intervals, no matching interval, or a malformed interval) yields a fail-closed reason for
 * the audit ledger — never a "reasonable guess".
 */

/** Why a governing-version resolution resolved (audit reason code). */
export type ResolutionReason =
  | 'resolved' |
  'malformed-time' |
  'malformed-interval' |
  'no-governing-version' |
  'ambiguous-version';

/** The result of {@link PolicyRegistry.resolve}; `bundle` is present only when `ok` is true. */
export type GoverningResolution =
  | { readonly ok: true; readonly reason: 'resolved'; readonly bundle: CompiledPolicyBundle } |
  { readonly ok: false; readonly reason: Exclude<ResolutionReason, 'resolved'> };

/** Parse an ISO-8601 instant to epoch ms, or `undefined` if unparseable. */
function parseInstant(value: string): number | undefined {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? undefined : parsed;
}

/** The `[from, until)` epoch-ms bounds of an interval, or `undefined` if either bound is malformed. */
function intervalBounds(interval: EffectiveInterval): { readonly from: number; readonly until: number } | undefined {
  const from = parseInstant(interval.effectiveFrom);
  if (from === undefined) {
    return undefined;
  }
  if (interval.effectiveUntil === undefined) {
    return { from, until: Number.POSITIVE_INFINITY };
  }
  const until = parseInstant(interval.effectiveUntil);
  if (until === undefined || until <= from) {
    return undefined;
  }
  return { from, until };
}

export class PolicyRegistry {
  /** Append-only list of admitted versions; retained for later verification (ADR-0014). */
  private readonly bundles: CompiledPolicyBundle[] = [];

  /**
   * Register an ALREADY-ADMITTED bundle. Fails closed if the admission result was not admitted, is missing
   * its bundle, or the bundle no longer matches its bound digest (a defence-in-depth re-check that a
   * substituted bundle cannot be registered even if admission were bypassed, T-25).
   */
  public register(admission: AdmissionResult): CompiledPolicyBundle {
    if (!admission.admitted || admission.bundle === undefined) {
      throw new BadRequestHttpError('Refusing to register a bundle that was not admitted (fail closed).');
    }
    if (isBundleSubstituted(admission.bundle)) {
      throw new BadRequestHttpError('Refusing to register a substituted bundle (digest mismatch, T-25).');
    }
    this.bundles.push(admission.bundle);
    return admission.bundle;
  }

  /** All registered versions governing a class, as a defensive copy (history is never rewritten). */
  public versionsFor(assetClass: string): readonly CompiledPolicyBundle[] {
    return this.bundles.filter((bundle): boolean => bundle.affectedAssetClasses.includes(assetClass));
  }

  /**
   * Deterministically select the version governing `assetClass` at `atTime`. Fails closed when the time or
   * a candidate interval is malformed, when no interval contains the time, or when more than one does
   * (overlapping intervals are an ambiguous selection, never silently disambiguated).
   */
  public resolve(assetClass: string, atTime: string): GoverningResolution {
    const at = parseInstant(atTime);
    if (at === undefined) {
      return { ok: false, reason: 'malformed-time' };
    }
    const candidates = this.versionsFor(assetClass);
    const matches: CompiledPolicyBundle[] = [];
    for (const bundle of candidates) {
      const bounds = intervalBounds(bundle.effectiveInterval);
      if (bounds === undefined) {
        return { ok: false, reason: 'malformed-interval' };
      }
      if (at >= bounds.from && at < bounds.until) {
        matches.push(bundle);
      }
    }
    if (matches.length === 0) {
      return { ok: false, reason: 'no-governing-version' };
    }
    if (matches.length > 1) {
      return { ok: false, reason: 'ambiguous-version' };
    }
    return { ok: true, reason: 'resolved', bundle: matches[0] };
  }
}
