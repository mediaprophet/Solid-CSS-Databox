import type {
  IAccessControl,
  IAccessControlledResource,
  IAccessControlResource,
  IAccessMode,
  IContext,
  IMatcher,
  IPolicy,
} from '@solid/access-control-policy';
import type { Store } from 'n3';
import type { NamedNode, Term } from '@rdfjs/types';
import { ACP } from '../util/Vocabularies';

/**
 * Returns all objects found using the given subject and predicate, mapped with the given function.
 */
function mapObjects<T>(data: Store, subject: Term, predicate: Term, fn: (data: Store, term: Term) => T): T[] {
  return data.getObjects(subject, predicate, null)
    .map((term): T => fn(data, term));
}

/**
 * Returns the string values of all objects found using the given subject and predicate.
 */
function getObjectValues(data: Store, subject: Term, predicate: NamedNode): string[] {
  return mapObjects(data, subject, predicate, (unused, term): string => term.value);
}

/**
 * Finds the {@link IMatcher} with the given identifier in the given dataset.
 *
 * @param data - Dataset to look in.
 * @param matcher - Identifier of the matcher.
 */
export function getMatcher(data: Store, matcher: Term): IMatcher {
  return {
    iri: matcher.value,
    agent: getObjectValues(data, matcher, ACP.terms.agent),
    client: getObjectValues(data, matcher, ACP.terms.client),
    issuer: getObjectValues(data, matcher, ACP.terms.issuer),
    vc: getObjectValues(data, matcher, ACP.terms.vc),
  };
}

/**
 * Finds the {@link IPolicy} with the given identifier in the given dataset.
 *
 * @param data - Dataset to look in.
 * @param policy - Identifier of the policy.
 */
export function getPolicy(data: Store, policy: Term): IPolicy {
  return {
    iri: policy.value,
    allow: new Set(getObjectValues(data, policy, ACP.terms.allow) as IAccessMode[]),
    deny: new Set(getObjectValues(data, policy, ACP.terms.deny) as IAccessMode[]),
    allOf: mapObjects(data, policy, ACP.terms.allOf, getMatcher),
    anyOf: mapObjects(data, policy, ACP.terms.anyOf, getMatcher),
    noneOf: mapObjects(data, policy, ACP.terms.noneOf, getMatcher),
  };
}

/**
 * Finds the {@link IAccessControl} with the given identifier in the given dataset.
 *
 * @param data - Dataset to look in.
 * @param accessControl - Identifier of the access control.
 */
export function getAccessControl(data: Store, accessControl: Term): IAccessControl {
  const policy = mapObjects(data, accessControl, ACP.terms.apply, getPolicy);
  return {
    iri: accessControl.value,
    policy,
  };
}

/**
 * Finds the {@link IAccessControlResource} with the given identifier in the given dataset.
 *
 * @param data - Dataset to look in.
 * @param acr - Identifier of the access control resource.
 */
export function getAccessControlResource(data: Store, acr: Term): IAccessControlResource {
  const accessControl = data.getObjects(acr, ACP.terms.accessControl, null)
    .map((term): IAccessControl => getAccessControl(data, term));
  const memberAccessControl = data.getObjects(acr, ACP.terms.memberAccessControl, null)
    .map((term): IAccessControl => getAccessControl(data, term));
  return {
    iri: acr.value,
    accessControl,
    memberAccessControl,
  };
}

/**
 * Finds all {@link IAccessControlledResource} in the given dataset.
 *
 * @param data - Dataset to look in.
 */
export function* getAccessControlledResources(data: Store): Iterable<IAccessControlledResource> {
  const acrQuads = data.getQuads(null, ACP.terms.resource, null, null);

  for (const quad of acrQuads) {
    const accessControlResource = getAccessControlResource(data, quad.subject);
    yield {
      iri: quad.object.value,
      accessControlResource,
    };
  }
}

function matchesAgent(matcher: IMatcher, context: IContext): boolean {
  return matcher.agent.some((agent): boolean => {
    if (agent === ACP.PublicAgent) {
      return true;
    }
    if (!context.agent) {
      return false;
    }
    if (agent === context.agent || agent === ACP.AuthenticatedAgent) {
      return true;
    }
    if (agent === ACP.CreatorAgent) {
      return context.creator?.includes(context.agent) ?? false;
    }
    if (agent === ACP.OwnerAgent) {
      return context.owner?.includes(context.agent) ?? false;
    }
    return false;
  });
}

function matches(matcher: IMatcher, context: IContext): boolean {
  const hasAttributes =
    matcher.agent.length + matcher.client.length + matcher.issuer.length + matcher.vc.length > 0;
  if (!hasAttributes) {
    return false;
  }

  const agentMatches = matcher.agent.length === 0 || matchesAgent(matcher, context);
  const clientMatches = matcher.client.length === 0 || matcher.client.some((client): boolean =>
    client === ACP.PublicClient || client === context.client);
  const issuerMatches = matcher.issuer.length === 0 || matcher.issuer.includes(context.issuer ?? '');
  const vcMatches = matcher.vc.length === 0 ||
    context.vc?.some((vc): boolean => matcher.vc.includes(vc)) === true;
  return agentMatches && clientMatches && issuerMatches && vcMatches;
}

function applies(policy: IPolicy, context: IContext): boolean {
  if (policy.allOf.length + policy.anyOf.length === 0) {
    return false;
  }

  return policy.allOf.every((matcher): boolean => matches(matcher, context)) &&
    (policy.anyOf.length === 0 || policy.anyOf.some((matcher): boolean => matches(matcher, context))) &&
    (policy.noneOf.length === 0 || !policy.noneOf.some((matcher): boolean => matches(matcher, context)));
}

/**
 * Evaluates ACP policies without loading the ESM-only ACP implementation from the CommonJS server build.
 */
export function allowAccessModes(policies: Iterable<IPolicy>, context: IContext): Set<IAccessMode> {
  const allowed = new Set<IAccessMode>();
  const denied = new Set<IAccessMode>();

  for (const policy of policies) {
    if (applies(policy, context)) {
      for (const mode of policy.allow) {
        allowed.add(mode);
      }
      for (const mode of policy.deny) {
        denied.add(mode);
      }
    }
  }
  for (const mode of denied) {
    allowed.delete(mode);
  }
  return allowed;
}
