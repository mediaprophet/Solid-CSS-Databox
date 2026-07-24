import { BadRequestHttpError } from '../../../../util/errors/BadRequestHttpError';

/** Operator input for a databox hosting plan. */
export interface HostingInput {
  /** The organisation apex domain, e.g. `acme.org`. */
  readonly apexDomain: string;
  /** The databox subdomain label (default `databox`). */
  readonly databoxLabel?: string;
  /** Whether to also emit a record for the public `www` site. */
  readonly wwwEnabled?: boolean;
  /** The origin the DNS records point at: an IPv4, IPv6 or hostname. */
  readonly originTarget: string;
  /** Whether the databox/www records go through the Cloudflare proxy (default `true`). */
  readonly proxied?: boolean;
  /** The origin port the databox listens on (default `3000`). */
  readonly originPort?: number;
}

export type DnsRecordType = 'A' | 'AAAA' | 'CNAME';

export interface DnsRecord {
  readonly type: DnsRecordType;
  readonly name: string;
  readonly content: string;
  readonly proxied: boolean;
  /** Cloudflare TTL; `1` means "automatic". */
  readonly ttl: number;
}

export interface HostingPlan {
  readonly databoxHost: string;
  readonly wwwHost?: string;
  readonly devicesHost: string;
  readonly baseUrl: string;
  readonly dnsRecords: DnsRecord[];
  readonly launchCommand: string;
}

const IPV4 = /^\d{1,3}(?:\.\d{1,3}){3}$/u;

function recordType(originTarget: string): DnsRecordType {
  if (IPV4.test(originTarget)) {
    return 'A';
  }
  return originTarget.includes(':') ? 'AAAA' : 'CNAME';
}

/**
 * Derive the hosting plan — routes, Cloudflare DNS records and launch command — for a databox from a
 * domain and origin (see `databox/solid-ipms-plan.md`, §6). Pure and deterministic.
 *
 * The `devices` host is always emitted **non-proxied**: client-cert mTLS (§10.2/§1.3) needs the origin to
 * see the certificate, and a proxied host terminates TLS at the edge and breaks it. The `databox` (private
 * data plane) and optional `www` (public site) hosts follow the caller's proxy choice.
 */
export function planHosting(input: HostingInput): HostingPlan {
  const apex = input.apexDomain.trim();
  const origin = input.originTarget.trim();
  if (apex.length === 0 || !apex.includes('.')) {
    throw new BadRequestHttpError('A hosting plan needs an apex domain such as "acme.org".');
  }
  if (origin.length === 0) {
    throw new BadRequestHttpError('A hosting plan needs an origin target (IP or hostname).');
  }

  const label = input.databoxLabel ?? 'databox';
  const proxied = input.proxied ?? true;
  const type = recordType(origin);

  const databoxHost = `${label}.${apex}`;
  const devicesHost = `devices.${apex}`;
  const wwwHost = input.wwwEnabled === true ? `www.${apex}` : undefined;
  const baseUrl = `https://${databoxHost}/`;

  const dnsRecords: DnsRecord[] = [
    { type, name: databoxHost, content: origin, proxied, ttl: 1 },
    { type, name: devicesHost, content: origin, proxied: false, ttl: 1 },
  ];
  if (wwwHost !== undefined) {
    dnsRecords.push({ type, name: wwwHost, content: origin, proxied, ttl: 1 });
  }

  return {
    databoxHost,
    wwwHost,
    devicesHost,
    baseUrl,
    dnsRecords,
    launchCommand: `npm run start:ipms -- --baseUrl ${baseUrl} --ipmsControlToken <32+ byte token>`,
  };
}

/**
 * Generate a `cloudflared` tunnel configuration YAML for the guided-artifacts fallback path.
 * Used when the operator does not provide a Cloudflare API token and must configure manually.
 */
export function generateCloudflaredConfig(plan: HostingPlan, originTarget: string, originPort = 3000): string {
  const rules: string[] = [
    `  - hostname: ${plan.databoxHost}`,
    `    service: http://${originTarget}:${originPort}`,
  ];
  if (plan.wwwHost) {
    rules.push(
      `  - hostname: ${plan.wwwHost}`,
      `    service: http://${originTarget}:${originPort}`,
    );
  }
  rules.push(
    `  - hostname: ${plan.devicesHost}`,
    `    service: http://${originTarget}:${originPort}`,
  );
  rules.push(`  - service: http_status:404`);

  return `tunnel: <tunnel-id>
credentials-file: /root/.cloudflared/<tunnel-id>.json

ingress:
${rules.join('\n')}
`;
}
