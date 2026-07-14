import { ForbiddenHttpError } from '../../util/errors/ForbiddenHttpError';
import type { HttpError } from '../../util/errors/HttpError';
import { NotFoundHttpError } from '../../util/errors/NotFoundHttpError';
import { UnauthorizedHttpError } from '../../util/errors/UnauthorizedHttpError';
import type { ExistenceVisibility } from '../profile/InstitutionProfile';
import { DATABOX_DENIAL_CODES } from './AuthorizationReasonCodes';
import type { DataboxAuthorizationDecision, StepUpChallenge } from './AuthorizationReasonCodes';

/**
 * Maps a composed Databox denial ({@link ./ComposedAuthorizationEngine}) to a SAFE HTTP surface (DBX-14;
 * DBX-04 §7.3). Two rules protect the actor and the resource:
 *
 *  - **Existence-hiding (404-not-403; T-07, invariant 3, ADR-0023).** A `403`/step-up is returned ONLY
 *    when the actor may still observe the resource AFTER narrowing — i.e. the POST-narrow composed Read is
 *    granted — AND the class existence visibility is `visible`. Otherwise EVERY denial collapses to the
 *    identical `404 Not Found` a non-existent resource returns. This closes the round-2 M2 finding: an
 *    assurance denial that narrows Read→false, or a `suppressed` record class, must NEVER surface a `403`
 *    that confirms the resource exists.
 *  - **Safe step-up (IF-20, ADR-0009).** When a `403` is warranted, an assurance-gap `403` carries a
 *    step-up challenge naming ONLY the missing assurance dimension — a fact about the actor's
 *    authentication, never the resource — so surfacing it leaks nothing beyond what composed Read already
 *    disclosed.
 */

/** The stable error code a step-up `403` carries so the pipeline can render a re-auth challenge (IF-20). */
export const STEP_UP_ERROR_CODE = 'databox:step-up-required';

/** Facts about the composed decision and the request needed to choose a non-leaking status. */
export interface SafeResponseContext {
  /**
   * Whether the POST-narrow (composed) result grants Read — the actor may STILL observe the resource after
   * the Databox layer narrowed it. MUST be the composed Read, not the pre-narrow WAC one (M2).
   */
  readonly composedReadObservable: boolean;
  /** The record/submission-class existence visibility (ADR-0023); `suppressed` always hides behind 404. */
  readonly existenceVisibility: ExistenceVisibility;
  /** Whether the request presented any credentials (drives 401 vs 403 when existence is already visible). */
  readonly authenticated: boolean;
}

/** Compose the actor-only, non-leaking step-up message (no resource facts). */
function stepUpMessage(challenge: StepUpChallenge): string {
  return `Step-up authentication required: assurance dimension '${challenge.dimension}' must reach ` +
    `level ${challenge.requiredLevel} (currently ${challenge.currentLevel}).`;
}

/**
 * Turn a *denied* {@link DataboxAuthorizationDecision} into the safe {@link HttpError} to throw. MUST be
 * called only for a denial; an allowed decision has no error surface.
 *
 * @param decision - The composed denial decision.
 * @param context - Upstream Read observability and request authentication state.
 *
 * @returns A {@link NotFoundHttpError} (existence hidden), a {@link ForbiddenHttpError} (optionally with a
 *   step-up challenge), or an {@link UnauthorizedHttpError}.
 */
export function toSafeAuthorizationError(
  decision: DataboxAuthorizationDecision,
  context: SafeResponseContext,
): HttpError {
  // Existence-hiding takes precedence (M2): a `suppressed` class, OR an actor without POST-narrow Read,
  // learns nothing — the identical 404 a missing box returns. This is what stops an assurance-narrowed
  // Read (composedReadObservable === false) from leaking existence via a 403 step-up.
  if (context.existenceVisibility !== 'visible' || !context.composedReadObservable) {
    return new NotFoundHttpError();
  }
  // The actor may still observe the resource. An assurance gap becomes a 403 + safe step-up challenge.
  if (decision.code === DATABOX_DENIAL_CODES.assuranceInsufficient && decision.stepUp) {
    return new ForbiddenHttpError(stepUpMessage(decision.stepUp), { errorCode: STEP_UP_ERROR_CODE });
  }
  // Existence is already visible, but the request is anonymous: invite valid credentials (Solid §2.1).
  if (!context.authenticated) {
    return new UnauthorizedHttpError();
  }
  // Authenticated, existence already visible, no step-up path: a plain 403.
  return new ForbiddenHttpError();
}
