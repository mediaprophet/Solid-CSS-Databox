import { BadRequestHttpError } from '../../../../util/errors/BadRequestHttpError';

export interface BreakGlassPolicy {
  readonly resource: string;
  readonly emergencyRoles: readonly string[];
}

export interface BreakGlassRequest {
  readonly requesterRole: string;
  readonly declaredEmergency: boolean;
  readonly requestedAt: string;
  readonly reason: string;
}

export interface BreakGlassDecision {
  readonly permitted: boolean;
  readonly reason: string;
  readonly audit: Record<string, unknown>;
}

export function evaluateBreakGlass(policy: BreakGlassPolicy, request: BreakGlassRequest): BreakGlassDecision {
  if (request.reason.trim().length === 0) {
    throw new BadRequestHttpError('A break-glass access request must state a reason.');
  }

  let permitted = false;
  let reason: string;
  if (request.declaredEmergency && policy.emergencyRoles.includes(request.requesterRole)) {
    permitted = true;
    reason = 'Permitted: declared emergency by an authorized emergency role.';
  } else if (request.declaredEmergency) {
    reason = `Denied: role '${request.requesterRole}' is not an authorized emergency role for this resource.`;
  } else {
    reason = 'Denied: the request did not declare an emergency.';
  }

  const audit = {
    resource: policy.resource,
    requesterRole: request.requesterRole,
    declaredEmergency: request.declaredEmergency,
    requestedAt: request.requestedAt,
    reason: request.reason,
    permitted,
  };

  return { permitted, reason, audit };
}
