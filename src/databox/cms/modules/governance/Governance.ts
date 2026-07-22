import { BadRequestHttpError } from '../../../../util/errors/BadRequestHttpError';

const LD_CONTEXT = '@context';
const LD_TYPE = '@type';
const LD_ID = '@id';

export interface RoleBindingInput {
  readonly id: string;
  readonly agent: string;
  readonly role: string;
  readonly scope: string;
  readonly grantedBy: string;
  readonly grantedAt: string;
}

export interface OdrlPolicyInput {
  readonly id: string;
  readonly assigner: string;
  readonly assignee: string;
  readonly action: string;
  readonly target: string;
  readonly constraints?: readonly OdrlConstraint[];
}

export interface OdrlConstraint {
  readonly leftOperand: string;
  readonly operator: string;
  readonly rightOperand: string;
}

export interface ApprovalGateInput {
  readonly id: string;
  readonly requestor: string;
  readonly action: string;
  readonly target: string;
  readonly approverRole: string;
  readonly status: 'pending' | 'approved' | 'rejected';
  readonly decidedBy?: string;
  readonly decidedAt?: string;
  readonly reason?: string;
}

function requireUri(value: string, field: string): string {
  try {
    return new URL(value).href;
  } catch {
    throw new BadRequestHttpError(`A governance ${field} must be an absolute URI.`);
  }
}

function requireNonEmpty(value: string, field: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new BadRequestHttpError(`A governance ${field} must not be empty.`);
  }
  return trimmed;
}

/**
 * Bind a role to an agent within a scope — the foundational governance primitive.
 * Produces a schema.org JSON-LD record that can be stored as a Solid resource and
 * queried by authorization middleware.
 */
export function bindRole(input: RoleBindingInput): Record<string, unknown> {
  const id = requireUri(input.id, 'id');
  const agent = requireUri(input.agent, 'agent');
  const role = requireUri(input.role, 'role');
  const scope = requireUri(input.scope, 'scope');
  const grantedBy = requireUri(input.grantedBy, 'grantedBy');
  const grantedAt = requireNonEmpty(input.grantedAt, 'grantedAt');

  return {
    [LD_CONTEXT]: 'https://schema.org/',
    [LD_TYPE]: 'Role',
    [LD_ID]: id,
    agent: { [LD_ID]: agent },
    roleName: role,
    scope: { [LD_ID]: scope },
    grantedBy: { [LD_ID]: grantedBy },
    startTime: grantedAt,
  };
}

/**
 * Build an ODRL 2.2 policy that encodes a permission or prohibition.
 *
 * @see https://www.w3.org/TR/odrl-model/
 */
export function buildOdrlPolicy(input: OdrlPolicyInput): Record<string, unknown> {
  const id = requireUri(input.id, 'id');
  const assigner = requireUri(input.assigner, 'assigner');
  const assignee = requireUri(input.assignee, 'assignee');
  const action = requireNonEmpty(input.action, 'action');
  const target = requireUri(input.target, 'target');

  const rule: Record<string, unknown> = {
    action,
    target: { [LD_ID]: target },
    assignee: { [LD_ID]: assignee },
  };

  if (input.constraints && input.constraints.length > 0) {
    rule.constraint = input.constraints.map(c => ({
      leftOperand: c.leftOperand,
      operator: c.operator,
      rightOperand: c.rightOperand,
    }));
  }

  return {
    [LD_CONTEXT]: 'http://www.w3.org/ns/odrl.jsonld',
    [LD_ID]: id,
    [LD_TYPE]: 'Policy',
    permission: [ rule ],
    assigner: { [LD_ID]: assigner },
  };
}

/**
 * Record an approval-gate decision — a governance checkpoint that requires
 * a specific role to approve an action before it can proceed.
 */
export function recordApprovalGate(input: ApprovalGateInput): Record<string, unknown> {
  const id = requireUri(input.id, 'id');
  const requestor = requireUri(input.requestor, 'requestor');
  const action = requireNonEmpty(input.action, 'action');
  const target = requireUri(input.target, 'target');
  const approverRole = requireUri(input.approverRole, 'approverRole');

  const record: Record<string, unknown> = {
    [LD_CONTEXT]: 'https://schema.org/',
    [LD_TYPE]: 'Action',
    [LD_ID]: id,
    agent: { [LD_ID]: requestor },
    actionStatus: input.status === 'approved' ?
      'CompletedActionStatus' :
      input.status === 'rejected' ?
        'FailedActionStatus' :
        'PotentialActionStatus',
    object: { [LD_ID]: target },
    description: action,
    instrument: { [LD_ID]: approverRole },
  };

  if (input.decidedBy) {
    record.participant = { [LD_ID]: requireUri(input.decidedBy, 'decidedBy') };
  }
  if (input.decidedAt) {
    record.endTime = requireNonEmpty(input.decidedAt, 'decidedAt');
  }
  if (input.reason) {
    record.result = input.reason;
  }

  return record;
}
