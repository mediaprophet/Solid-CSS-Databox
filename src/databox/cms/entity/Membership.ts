import { BadRequestHttpError } from '../../../util/errors/BadRequestHttpError';
import { ORG } from '../../../util/Vocabularies';

const LD_CONTEXT = '@context';
const LD_ID = '@id';
const LD_TYPE = '@type';

export interface MembershipInput {
  /** URI of the membership itself (the reified relationship). */
  readonly membershipId: string;
  /** URI of the organisation. */
  readonly organisation: string;
  /** The member's WebID — a `foaf:Agent`, referenced not decomposed. */
  readonly member: string;
  /** The role borne in this membership (a URI or a controlled label). */
  readonly role: string;
}

function requireUri(value: string, field: string): string {
  try {
    return new URL(value).href;
  } catch {
    throw new BadRequestHttpError(`Membership ${field} must be an absolute URI.`);
  }
}

/**
 * Build a reified membership as W3C Org-Ontology JSON-LD (see `databox/solid-cms-plan.md`, §5.0 / §3).
 *
 * It links an agent — by **WebID**, *referenced* and never decomposed — to an organisation, bearing a
 * role. The relationship is the thing that can be classified and reasoned over; the person stays a
 * referenced `foaf:Agent`. Pure and deterministic.
 */
export function buildMembership(input: MembershipInput): Record<string, unknown> {
  const membershipId = requireUri(input.membershipId, 'id');
  const organisation = requireUri(input.organisation, 'organisation');
  const member = requireUri(input.member, 'member');
  if (input.role.trim().length === 0) {
    throw new BadRequestHttpError('Membership role must not be empty.');
  }
  return {
    [LD_CONTEXT]: ORG.namespace,
    [LD_ID]: membershipId,
    [LD_TYPE]: 'Membership',
    member: { [LD_ID]: member },
    organization: { [LD_ID]: organisation },
    role: input.role,
  };
}
