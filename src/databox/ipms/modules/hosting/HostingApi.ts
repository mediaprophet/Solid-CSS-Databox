import type { IpmsModuleRouter } from '../../IpmsModuleRouter';
import type { HttpHandlerInput } from '../../../../server/HttpHandler';
import { isRecord, readJsonBody, writeJson, writeTurtle } from '../../IpmsHttpUtils';
import type { HostingInput, HostingPlan } from './HostingConfig';
import { generateCloudflaredConfig, planHosting } from './HostingConfig';
import { CloudflareApi } from './CloudflareApi';

export function registerHostingRoutes(router: IpmsModuleRouter<(input: HttpHandlerInput) => Promise<void>>): void {
  router.register('POST', '/hosting/plan', async({ request, response }: HttpHandlerInput): Promise<void> => {
    try {
      const input = await readJsonBody<unknown>(request);
      assertHostingInput(input);
      writeJson(response, 200, planHosting(input), 'application/ld+json');
    } catch (error: unknown) {
      writeJson(response, 400, { error: error instanceof Error ? error.message : 'Invalid hosting plan request.' });
    }
  });

  router.register('POST', '/hosting/apply', async({ request, response }: HttpHandlerInput): Promise<void> => {
    try {
      const body = await readJsonBody<unknown>(request);
      assertApplyInput(body);
      const plan = planHosting(body);
      const cf = new CloudflareApi(body.cloudflareToken);
      const result = await cf.applyPlan(plan, body.apexDomain, body.originPort ?? 3000);
      writeJson(response, 200, { plan, applied: result }, 'application/ld+json');
    } catch (error: unknown) {
      writeJson(response, 400, { error: error instanceof Error ? error.message : 'Failed to apply hosting plan.' });
    }
  });

  router.register('POST', '/hosting/persist', async({ request, response }: HttpHandlerInput): Promise<void> => {
    try {
      const body = await readJsonBody<unknown>(request);
      assertPersistInput(body);
      const plan = planHosting(body);
      const turtle = hostingPlanToTurtle(plan, body);
      writeTurtle(response, 200, turtle);
    } catch (error: unknown) {
      writeJson(response, 400, { error: error instanceof Error ? error.message : 'Failed to persist hosting config.' });
    }
  });

  router.register('POST', '/hosting/bind', async({ request, response }: HttpHandlerInput): Promise<void> => {
    try {
      const body = await readJsonBody<unknown>(request);
      assertBindInput(body);
      const turtle = tenantBindingToTurtle(body);
      writeTurtle(response, 200, turtle);
    } catch (error: unknown) {
      writeJson(response, 400, { error: error instanceof Error ? error.message : 'Failed to bind origin.' });
    }
  });

  router.register('POST', '/hosting/artifacts', async({ request, response }: HttpHandlerInput): Promise<void> => {
    try {
      const body = await readJsonBody<unknown>(request);
      assertHostingInput(body);
      const plan = planHosting(body);
      const config = generateCloudflaredConfig(plan, body.originTarget, body.originPort ?? 3000);
      writeJson(response, 200, { plan, cloudflaredConfig: config }, 'application/ld+json');
    } catch (error: unknown) {
      writeJson(response, 400, { error: error instanceof Error ? error.message : 'Failed to generate artifacts.' });
    }
  });
}

interface HostingApplyInput extends HostingInput {
  readonly cloudflareToken: string;
  readonly originPort?: number;
}

interface HostingPersistInput extends HostingInput {
  readonly zoneId?: string;
  readonly tunnelId?: string;
}

interface HostingBindInput {
  readonly databoxHost: string;
  readonly originTarget: string;
  readonly baseUrl: string;
}

function assertHostingInput(value: unknown): asserts value is HostingInput {
  if (!isRecord(value)) {
    throw new TypeError('A hosting plan request must be a JSON object.');
  }
}

function assertApplyInput(value: unknown): asserts value is HostingApplyInput {
  if (!isRecord(value)) {
    throw new TypeError('Hosting apply request must be a JSON object.');
  }
  if (typeof value.cloudflareToken !== 'string' || value.cloudflareToken.length === 0) {
    throw new TypeError('A Cloudflare API token is required to apply the plan.');
  }
}

function assertPersistInput(value: unknown): asserts value is HostingPersistInput {
  if (!isRecord(value)) {
    throw new TypeError('Hosting persist request must be a JSON object.');
  }
}

function assertBindInput(value: unknown): asserts value is HostingBindInput {
  if (!isRecord(value)) {
    throw new TypeError('Hosting bind request must be a JSON object.');
  }
  if (typeof value.databoxHost !== 'string' || typeof value.baseUrl !== 'string') {
    throw new TypeError('Bind request requires databoxHost and baseUrl.');
  }
}

function hostingPlanToTurtle(plan: HostingPlan, input: HostingPersistInput): string {
  const records = plan.dnsRecords.map((r, i) =>
    `  ipms:dnsRecord <${plan.baseUrl}dns/${i}> .\n` +
    `<${plan.baseUrl}dns/${i}> a ipms:DnsRecord ; ipms:recordType "${r.type}" ; ` +
    `ipms:name "${r.name}" ; ipms:content "${r.content}" ; ` +
    `ipms:proxied ${r.proxied} ; ipms:ttl ${r.ttl} .`).join('\n');

  const wwwHostLine = plan.wwwHost ? `  ipms:wwwHost "${plan.wwwHost}" ;\n` : '';
  const launchCmd = plan.launchCommand.replaceAll('"', '\\"');
  const zoneLine = input.zoneId ? `  ipms:cloudflareZone "${input.zoneId}" ;\n` : '';
  const tunnelLine = input.tunnelId ? `  ipms:cloudflareTunnel "${input.tunnelId}" ;\n` : '';

  return `@prefix ipms: <urn:solid-server:databox:ipms#> .
@prefix dct: <http://purl.org/dc/terms/> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

<${plan.baseUrl}hosting-plan> a ipms:HostingPlan ;
  ipms:databoxHost "${plan.databoxHost}" ;
  ipms:devicesHost "${plan.devicesHost}" ;
  ipms:baseUrl "${plan.baseUrl}" ;
${wwwHostLine}  ipms:launchCommand "${launchCmd}" ;
${zoneLine}${tunnelLine}  dct:created "${new Date().toISOString()}"^^xsd:dateTime ;
${records}
`;
}

function tenantBindingToTurtle(input: HostingBindInput): string {
  return `@prefix ipms: <urn:solid-server:databox:ipms#> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

<${input.baseUrl}tenant-binding> a ipms:TenantBinding ;
  ipms:databoxHost "${input.databoxHost}" ;
  ipms:originTarget "${input.originTarget}" ;
  ipms:baseUrl "${input.baseUrl}" ;
  ipms:boundAt "${new Date().toISOString()}"^^xsd:dateTime .
`;
}
