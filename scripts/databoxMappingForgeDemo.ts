import { generateKeyPairSync } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { publicJwkFromKeyObject } from '../src/databox/credential/Es256';
import type { BridgeDepositReport } from '../src/databox/bridge/DataboxBridge';
import { MappingForgeHttpApi } from '../src/databox/forge/MappingForgeHttpApi';
import type { ForgeMappingResult, ForgeProgramSummary } from '../src/databox/forge/MappingForge';
import { MappingForge } from '../src/databox/forge/MappingForge';

async function post<T>(baseUrl: string, path: string, body: unknown): Promise<T> {
  const headers = new Headers();
  headers.set('content-type', 'application/json');
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`Forge API ${path} failed (${response.status}): ${await response.text()}`);
  }
  return response.json() as Promise<T>;
}

async function main(): Promise<void> {
  const profile = JSON.parse(readFileSync(
    join(process.cwd(), 'databox/fixtures/loyalty-institution-profile.json'),
    'utf8',
  )) as unknown;
  const forge = new MappingForge();
  const api = await new MappingForgeHttpApi(forge).listen();
  const holder = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const customerId = 'SYNTHETIC-CUSTOMER-042';

  const program = await post<ForgeProgramSummary>(api.url, '/programs', {
    profile,
    programUri: 'https://rewards.megamart.example/program',
    databoxBaseUrl: 'https://databox.megamart.example/boxes/',
  });
  const mapping = await post<ForgeMappingResult>(api.url, '/mappings', {
    profileId: program.profileId,
    sourceSystem: 'sor-pos',
    customerIdNamespace: 'loyalty',
    customerId,
    pairwiseWebId: 'https://consumer-pod.example/profile/card#megamart',
    holderPublicJwk: publicJwkFromKeyObject(holder.publicKey),
  });
  const deposit = await post<BridgeDepositReport>(api.url, '/source-events', {
    profileId: program.profileId,
    sourceSystem: 'sor-pos',
    eventType: 'digital-receipt',
    sourceEventId: 'SYNTHETIC-EVENT-001',
    customerIdNamespace: 'loyalty',
    customerId,
    recordClass: 'rc-receipt',
    legalBasis: 'lb-contract',
    purpose: 'p-account',
    payload: { merchant: 'MegaMart Demo', total: '42.00', currency: 'AUD' },
  });
  const publicOutput = { api: api.url, program, mapping, deposit };
  const serialized = JSON.stringify(publicOutput, undefined, 2);
  if (serialized.includes(customerId)) {
    throw new Error('Privacy invariant failed: the raw customer id escaped the forge control plane.');
  }
  process.stdout.write(`${serialized}\n`);
  await api.close();
}

void main().catch((error: unknown): void => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exitCode = 1;
});
