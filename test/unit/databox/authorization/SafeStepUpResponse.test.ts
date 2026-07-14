import { DATABOX_DENIAL_CODES } from '../../../../src/databox/authorization/AuthorizationReasonCodes';
import type { DataboxAuthorizationDecision } from '../../../../src/databox/authorization/AuthorizationReasonCodes';
import { STEP_UP_ERROR_CODE, toSafeAuthorizationError } from '../../../../src/databox/authorization/SafeStepUpResponse';
import { ForbiddenHttpError } from '../../../../src/util/errors/ForbiddenHttpError';
import { NotFoundHttpError } from '../../../../src/util/errors/NotFoundHttpError';
import { UnauthorizedHttpError } from '../../../../src/util/errors/UnauthorizedHttpError';

const assuranceDenial: DataboxAuthorizationDecision = {
  allowed: false,
  conjunct: 'assurance',
  code: DATABOX_DENIAL_CODES.assuranceInsufficient,
  reason: 'assurance below minimum',
  deniedModes: [],
  stepUp: { dimension: 'authenticatorStrength', requiredLevel: 3, currentLevel: 1 },
};

const tenantDenial: DataboxAuthorizationDecision = {
  allowed: false,
  conjunct: 'tenant',
  code: DATABOX_DENIAL_CODES.tenantMismatch,
  reason: 'outside tenant',
  deniedModes: [],
};

describe('toSafeAuthorizationError (non-leaking denial surface)', (): void => {
  it('returns 404 (existence hidden) whenever the composed Read is not observable.', (): void => {
    const error = toSafeAuthorizationError(assuranceDenial, {
      composedReadObservable: false,
      existenceVisibility: 'visible',
      authenticated: true,
    });
    expect(NotFoundHttpError.isInstance(error)).toBe(true);
  });

  it('returns 404 for a non-assurance denial without composed Read too.', (): void => {
    const error = toSafeAuthorizationError(tenantDenial, {
      composedReadObservable: false,
      existenceVisibility: 'visible',
      authenticated: false,
    });
    expect(NotFoundHttpError.isInstance(error)).toBe(true);
  });

  it('returns 404 for a SUPPRESSED record class even when a step-up would otherwise apply (M2).', (): void => {
    const error = toSafeAuthorizationError(assuranceDenial, {
      composedReadObservable: true,
      existenceVisibility: 'suppressed',
      authenticated: true,
    });
    expect(NotFoundHttpError.isInstance(error)).toBe(true);
  });

  it('returns 403 + a safe step-up challenge when composed Read is still observable and visible.', (): void => {
    const error = toSafeAuthorizationError(assuranceDenial, {
      composedReadObservable: true,
      existenceVisibility: 'visible',
      authenticated: true,
    });
    expect(ForbiddenHttpError.isInstance(error)).toBe(true);
    expect(error.errorCode).toBe(STEP_UP_ERROR_CODE);
    expect(error.message).toContain('authenticatorStrength');
    expect(error.message).toContain('level 3');
    // The message names only the actor's assurance dimension, never a resource fact.
    expect(error.message).not.toContain('r1');
  });

  it('returns 401 for an anonymous non-assurance denial where existence is already visible.', (): void => {
    const error = toSafeAuthorizationError(tenantDenial, {
      composedReadObservable: true,
      existenceVisibility: 'visible',
      authenticated: false,
    });
    expect(UnauthorizedHttpError.isInstance(error)).toBe(true);
  });

  it('returns a plain 403 for an authenticated non-assurance denial with visible existence.', (): void => {
    const error = toSafeAuthorizationError(tenantDenial, {
      composedReadObservable: true,
      existenceVisibility: 'visible',
      authenticated: true,
    });
    expect(ForbiddenHttpError.isInstance(error)).toBe(true);
    expect(error.errorCode).not.toBe(STEP_UP_ERROR_CODE);
  });

  it('returns a plain 403 for an assurance code lacking a step-up challenge (visible existence).', (): void => {
    const decision: DataboxAuthorizationDecision = { ...assuranceDenial, stepUp: undefined };
    const error = toSafeAuthorizationError(decision, {
      composedReadObservable: true,
      existenceVisibility: 'visible',
      authenticated: true,
    });
    expect(ForbiddenHttpError.isInstance(error)).toBe(true);
    expect(error.errorCode).not.toBe(STEP_UP_ERROR_CODE);
  });
});
