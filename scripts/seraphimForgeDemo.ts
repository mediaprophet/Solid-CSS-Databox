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
  headers.set('authorization', 'Bearer 12345678901234567890123456789012');
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
    join(process.cwd(), 'databox/fixtures/welfare/seraphim-institution-profile.json'),
    'utf8',
  )) as unknown;
  const apiUrl = 'http://localhost:3000/.databox/forge';
  const holder = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const customerId = 'CHARLES-JAMES-ID-001';

  const program = await post<ForgeProgramSummary>(apiUrl, '/programs', {
    profile,
    programUri: 'http://localhost:3000/program',
    databoxBaseUrl: 'http://localhost:3000/boxes/',
  });
  const mapping = await post<ForgeMappingResult>(apiUrl, '/mappings', {
    profileId: program.profileId,
    sourceSystem: 'seraphim-intake',
    customerIdNamespace: 'welfare',
    customerId,
    pairwiseWebId: 'https://v-8a7b6c5d.example/profile/card#seraphim',
    holderPublicJwk: publicJwkFromKeyObject(holder.publicKey),
  });
  const deposit = await post<BridgeDepositReport>(apiUrl, '/source-events', {
    profileId: program.profileId,
    sourceSystem: 'seraphim-intake',
    eventType: 'welfare-checkin',
    sourceEventId: 'SYNTHETIC-CHECKIN-001',
    customerIdNamespace: 'welfare',
    customerId,
    recordClass: 'rc-case-note',
    legalBasis: 'lb-consent',
    purpose: 'p-service-delivery',
    payload: { notes: 'Initial intake completed. Immediate stability goals set.', status: 'active' },
  });
  const publicOutput = { api: apiUrl, program, mapping, deposit };
  const serialized = JSON.stringify(publicOutput, undefined, 2);
  if (serialized.includes(customerId)) {
    throw new Error('Privacy invariant failed: the raw customer id escaped the forge control plane.');
  }
  process.stdout.write(`${serialized}\n`);
}

void main().catch((error: unknown): void => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exitCode = 1;
});
