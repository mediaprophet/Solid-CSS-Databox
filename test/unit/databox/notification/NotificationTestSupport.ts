import type { DataboxRequestContext } from '../../../../src/databox/context/DataboxRequestContext';
import type { OutboxRecord, PolicyEvaluation } from '../../../../src/databox/evidence/AuditEvidence';
import type { HostResolver } from '../../../../src/databox/notification/EndpointValidator';
import { SsrfSafeEndpointValidator } from '../../../../src/databox/notification/EndpointValidator';

/** A minimal verified context (the actor is bound from here, never from headers). */
export const CONTEXT: DataboxRequestContext = { webId: 'https://id.example/alice#me' };

/** A valid policy-evaluation fixture (carries the required digest). */
export const POLICY: PolicyEvaluation = {
  odrlPolicy: 'https://policy.example/signal',
  policyVersion: 'signal@2026-07-01',
  policyDigest: `urn:sha256:${'d'.repeat(64)}`,
  odrlRule: 'https://w3id.org/solid-databox/ns#signalHolder',
};

/** Build a committed outbox record fixture. */
export function outbox(n: number, tenantId = 't1'): OutboxRecord {
  return { eventId: `evt-${n}`, tenantId, resourceRef: `opaque:res-${n}`, activity: 'Create' };
}

/** A resolver that maps hosts to fixed IPs; never touches the network. */
export function resolverOf(map: Record<string, readonly string[]>): HostResolver {
  return async(host: string): Promise<readonly string[]> => map[host] ?? [];
}

/** The hosts {@link publicValidator} treats as public by default. */
const DEFAULT_PUBLIC_HOSTS: Record<string, readonly string[]> = {
  'consumer.example': [ '93.184.216.34' ],
  'alt.example': [ '93.184.216.35' ],
};

/** A validator that treats a fixed set of hosts as public and everything else as unresolved. */
export function publicValidator(map?: Record<string, readonly string[]>): SsrfSafeEndpointValidator {
  return new SsrfSafeEndpointValidator({ resolver: resolverOf(map ?? DEFAULT_PUBLIC_HOSTS) });
}

/** A deterministic monotonic ISO clock. */
export function fixedClock(): () => string {
  let tick = 0;
  return (): string => {
    tick += 1;
    return `2026-07-15T10:00:0${tick}.000Z`;
  };
}

/** A sleep spy that records requested delays without waiting. */
export function recordingSleep(): { sleep: (ms: number) => Promise<void>; waits: number[] } {
  const waits: number[] = [];
  return {
    waits,
    sleep: async(ms: number): Promise<void> => {
      waits.push(ms);
    },
  };
}
