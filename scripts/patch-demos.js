const fs = require('node:fs');
const path = require('node:path');

const loyaltyProfile = fs.readFileSync(path.join(__dirname, '../databox/fixtures/loyalty-institution-profile.json'), 'utf8');

const filesToPatch = [
  path.join(__dirname, '../templates/root/static/index.html'),
  path.join(__dirname, '../templates/root/intro/base/index.html'),
];

for (const filePath of filesToPatch) {
  let content = fs.readFileSync(filePath, 'utf8');

  if (!content.includes('MegaMart: Loyalty Forge')) {
    content = content.replace(
      `<button class="tab-btn demo-tab" onclick="switchTab('admin')">Seraphim: Admin Panel</button>`,
      `<button class="tab-btn demo-tab" onclick="switchTab('admin')">Seraphim: Admin Panel</button>\n      <button class="tab-btn demo-tab" onclick="switchTab('loyalty')">MegaMart: Loyalty Forge</button>`,
    );
  }

  const loyaltyTabHtml = `
    <!-- Loyalty Tab -->
    <div id="tab-loyalty" class="tab-content reveal">
      <div class="info-card" style="text-align: center; max-width: 800px; margin: 0 auto;">
        <h3>MegaMart Loyalty Forge</h3>
        <p style="max-width: 600px; margin: 0 auto 2.5rem auto;">
          Generate a secure connection string for a new synthetic loyalty customer ("Customer 042"). This will forge a new program relationship and post a digital receipt to their Databox.
        </p>
        
        <button id="btn-provision-loyalty" class="action-btn" onclick="provisionMegaMart()" style="background-color: var(--color-accent);">
          <span>Provision "Customer 042"</span>
          <span class="loading-spinner" id="spinner-provision-loyalty"></span>
        </button>

        <div id="qr-section-loyalty" class="qr-container hidden">
          <div class="demo-banner">DEMO EXAMPLE - SYNTHETIC DATA</div>
          <p style="margin-bottom: 0.75rem; color: var(--text-secondary); font-size: 0.9rem;">
            Scan this QR code with a Solid pod app to pair your WebID with MegaMart Rewards.
          </p>
          <div id="qrcode-loyalty"></div>
          <p style="margin: 1rem 0 0.25rem; font-size: 0.85rem;"><strong>Connection URI:</strong></p>
          <div class="code-block" id="connection-uri-loyalty" style="word-break: break-all; font-size: 0.75rem;"></div>
          <details style="margin-top: 1rem;">
            <summary style="cursor: pointer; color: var(--text-accent); font-weight: 600; font-size: 0.9rem;">Connection Details</summary>
            <div style="margin-top: 0.75rem; font-size: 0.85rem; line-height: 1.7;">
              <p><strong>Pairwise WebID:</strong> <span id="lbl-pair-webid-loyalty" style="color: var(--text-secondary);"></span></p>
              <p><strong>Organisation (Issuer):</strong> <span id="lbl-issuer-loyalty" style="color: var(--text-secondary);"></span></p>
              <p><strong>Programme:</strong> <span id="lbl-programme-loyalty" style="color: var(--text-secondary);"></span></p>
              <p><strong>Databox Root:</strong> <span id="lbl-databox-loyalty" style="color: var(--text-secondary);"></span></p>
              <p><strong>Storage Description:</strong> <span id="lbl-storage-desc-loyalty" style="color: var(--text-secondary);"></span></p>
              <p><strong>Connection ID:</strong> <span id="lbl-conn-id-loyalty" style="color: var(--text-secondary);"></span></p>
            </div>
            <p style="margin-top: 0.75rem; font-size: 0.85rem;"><strong>Securing JWS:</strong></p>
            <div class="code-block" id="jws-string-loyalty" style="max-height: 120px; overflow-y: auto; font-size: 0.7rem;"></div>
          </details>
        </div>
      </div>
    </div>
  `;

  if (!content.includes('id="tab-loyalty"')) {
    content = content.replace(
      `<!-- Admin Tab -->`,
      `${loyaltyTabHtml}\n\n    <!-- Admin Tab -->`,
    );
  }

  const provisionMegaMartFn = `
    const megaMartProfile = ${loyaltyProfile};

    async function provisionMegaMart() {
      const btn = document.getElementById('btn-provision-loyalty');
      const spinner = document.getElementById('spinner-provision-loyalty');
      
      btn.disabled = true;
      spinner.style.display = 'inline-block';
      
      try {
        const program = await apiPost('/programs', {
          profile: megaMartProfile,
          programUri: 'https://rewards.megamart.example/program',
          databoxBaseUrl: 'https://databox.megamart.example/boxes/'
        });

        const mapping = await apiPost('/mappings', {
          profileId: program.profileId,
          sourceSystem: 'sor-pos',
          customerIdNamespace: 'loyalty',
          customerId: 'SYNTHETIC-CUSTOMER-042',
          pairwiseWebId: 'https://consumer-pod.example/profile/card#megamart',
          holderPublicJwk: mockJwk
        });

        const deposit = await apiPost('/source-events', {
          profileId: program.profileId,
          sourceSystem: 'sor-pos',
          eventType: 'digital-receipt',
          sourceEventId: 'SYNTHETIC-EVENT-001' + Date.now(),
          customerIdNamespace: 'loyalty',
          customerId: 'SYNTHETIC-CUSTOMER-042',
          recordClass: 'rc-receipt',
          legalBasis: 'lb-contract',
          purpose: 'p-account',
          payload: { merchant: 'MegaMart Demo', total: '42.00', currency: 'AUD', items: ['Oat Milk', 'Apples'] }
        });

        if (deposit.status !== 'reconciled') {
          throw new Error('Deposit was not reconciled: ' + (deposit.reconciliation?.reason || deposit.status));
        }

        const cred = mapping.credential.credential;
        const conn = cred.credentialSubject.connection;
        const pairwiseWebId = cred.credentialSubject.id;
        const connectionId = mapping.credential.connectionId;

        const connectUri = new URL('solid-databox://connect');
        connectUri.searchParams.set('webid', pairwiseWebId);
        connectUri.searchParams.set('issuer', cred.issuer);
        connectUri.searchParams.set('program', conn.program);
        connectUri.searchParams.set('databox', conn.databox);
        connectUri.searchParams.set('storage', conn.storageDescription);
        connectUri.searchParams.set('connection', connectionId);
        connectUri.searchParams.set('grant', conn.accessGrant);
        const connectionUri = connectUri.toString();

        document.getElementById('qr-section-loyalty').classList.remove('hidden');
        document.getElementById('connection-uri-loyalty').innerText = connectionUri;
        document.getElementById('jws-string-loyalty').innerText = mapping.credential.jws;

        document.getElementById('lbl-pair-webid-loyalty').innerText = pairwiseWebId;
        document.getElementById('lbl-issuer-loyalty').innerText = cred.issuer;
        document.getElementById('lbl-programme-loyalty').innerText = conn.program;
        document.getElementById('lbl-databox-loyalty').innerText = conn.databox;
        document.getElementById('lbl-storage-desc-loyalty').innerText = conn.storageDescription;
        document.getElementById('lbl-conn-id-loyalty').innerText = connectionId;
        
        document.getElementById('qrcode-loyalty').innerHTML = '';
        try {
          new QRCode(document.getElementById("qrcode-loyalty"), {
            text: connectionUri,
            width: 280, height: 280,
            colorDark : "#0f172a", colorLight : "#ffffff",
            correctLevel : QRCode.CorrectLevel.L
          });
        } catch (qrErr) {
          document.getElementById('qrcode-loyalty').innerHTML = '<p style="color: var(--text-secondary); font-size: 0.85rem;">QR code unavailable.</p>';
        }

        btn.querySelector('span:first-child').innerText = 'Provisioned Successfully!';

      } catch (e) {
        alert('Provisioning failed: ' + e.message);
        btn.disabled = false;
        btn.querySelector('span:first-child').innerText = 'Provision "Customer 042"';
      } finally {
        spinner.style.display = 'none';
      }
    }
  `;

  if (!content.includes('function provisionMegaMart()')) {
    content = content.replace(
      `async function provisionCharles() {`,
      `${provisionMegaMartFn}\n\n    async function provisionCharles() {`,
    );
  }

  fs.writeFileSync(filePath, content, 'utf8');
}
console.log('HTML successfully patched.');
