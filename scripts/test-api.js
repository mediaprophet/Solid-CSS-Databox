/* eslint-disable no-console, no-sync -- CLI script: console output is intended; sync fs is appropriate here. */
const fs = require('node:fs');

async function main() {
  const profile = JSON.parse(fs.readFileSync('databox/fixtures/welfare/seraphim-institution-profile.json', 'utf8'));

  const jwk = {
    kty: 'EC',
    crv: 'P-256',
    x: 'u_kE8wG_K8e0yGk3yv5_N5vXy3h_P0wY5fJ-M7Y_X70',
    y: 'R6E-yX1X-uG9T8M6_P4_N6X8T0_vJ8mX_5hM0_T6_O4',
  };

  async function apiPost(path, body) {
    const res = await fetch(`http://localhost:3000/.databox/forge${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer 12345678901234567890123456789012',
      },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    if (!res.ok) {
      if (text.includes('already registered')) {
        return { profileId: profile.profileId };
      }
      throw new Error(`API ${res.status}: ${text}`);
    }
    return JSON.parse(text);
  }

  try {
    console.log('Registering program...');
    const program = await apiPost('/programs', {
      profile,
      programUri: 'http://localhost:3000/program',
      databoxBaseUrl: 'http://localhost:3000/boxes/',
    });
    console.log('Program registered:', program.profileId);

    console.log('Forging mapping...');
    const mapping = await apiPost('/mappings', {
      profileId: program.profileId,
      sourceSystem: 'seraphim-intake',
      customerIdNamespace: 'welfare',
      customerId: 'CHARLES-JAMES-ID-001',
      pairwiseWebId: 'https://v-8a7b6c5d.example/profile/card#seraphim',
      holderPublicJwk: jwk,
    });
    console.log('Mapping keys:', Object.keys(mapping));
    console.log('mapping.credential keys:', Object.keys(mapping.credential));
    if (mapping.credential.credential) {
      console.log('mapping.credential.credential keys:', Object.keys(mapping.credential.credential));
    }

    console.log('Depositing source event...');
    const deposit = await apiPost('/source-events', {
      profileId: program.profileId,
      sourceSystem: 'seraphim-intake',
      eventType: 'welfare-checkin',
      sourceEventId: `SYNTHETIC-CHECKIN-001${Date.now()}`,
      customerIdNamespace: 'welfare',
      customerId: 'CHARLES-JAMES-ID-001',
      recordClass: 'rc-case-note',
      legalBasis: 'lb-consent',
      purpose: 'p-service-delivery',
      payload: { notes: 'Initial', status: 'active' },
    });

    console.log('Deposit status:', deposit.status);
    console.log('Deposit keys:', Object.keys(deposit));
    if (deposit.reconciliation) {
      console.log('Deposit reconciliation:', deposit.reconciliation);
    }
    if (deposit.receipt) {
      console.log('Deposit receipt keys:', Object.keys(deposit.receipt));
    }
  } catch (err) {
    console.error(err.message);
  }
}

main().catch(console.error);
