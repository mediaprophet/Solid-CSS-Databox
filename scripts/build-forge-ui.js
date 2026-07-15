const fs = require('fs');
const path = require('path');

const UI_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Forge Management UI - Solid Databox</title>
  <link rel="stylesheet" href="/.well-known/css/styles/main.css?v=7" type="text/css">
  <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;700&display=swap" rel="stylesheet">
  <style>
    body {
      background-color: var(--color-background);
      color: var(--text-primary);
      margin: 0;
      padding: 0;
      display: flex;
      height: 100vh;
      overflow: hidden;
    }
    .sidebar {
      width: 250px;
      background: rgba(15, 23, 42, 0.6);
      backdrop-filter: blur(20px);
      border-right: 1px solid rgba(255,255,255,0.05);
      padding: 2rem 1rem;
      display: flex;
      flex-direction: column;
      z-index: 10;
    }
    .sidebar h2 {
      color: var(--color-primary);
      margin-bottom: 2rem;
      font-size: 1.5rem;
      text-align: center;
    }
    .nav-btn {
      background: transparent;
      border: none;
      color: var(--text-secondary);
      text-align: left;
      padding: 1rem;
      margin-bottom: 0.5rem;
      font-size: 1.1rem;
      border-radius: 8px;
      cursor: pointer;
      transition: all 0.3s ease;
      font-family: inherit;
    }
    .nav-btn:hover {
      background: rgba(255,255,255,0.05);
      color: var(--text-primary);
    }
    .nav-btn.active {
      background: rgba(212, 175, 55, 0.15);
      color: var(--color-accent);
      border-left: 3px solid var(--color-accent);
    }
    .main-content {
      flex: 1;
      padding: 3rem;
      overflow-y: auto;
      background: radial-gradient(circle at top right, rgba(212, 175, 55, 0.05) 0%, transparent 40%);
    }
    .view-section {
      display: none;
      animation: fadeIn 0.4s ease forwards;
    }
    .view-section.active {
      display: block;
    }
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(10px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .data-table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 1rem;
      background: rgba(15, 23, 42, 0.4);
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 4px 6px rgba(0,0,0,0.3);
    }
    .data-table th, .data-table td {
      padding: 1rem;
      text-align: left;
      border-bottom: 1px solid rgba(255,255,255,0.05);
    }
    .data-table th {
      background: rgba(255,255,255,0.05);
      font-weight: 600;
      color: var(--color-primary);
    }
    .data-table tr:last-child td {
      border-bottom: none;
    }
    .data-table tr:hover {
      background: rgba(255,255,255,0.02);
    }
    .form-group {
      margin-bottom: 1.5rem;
      text-align: left;
    }
    .form-group label {
      display: block;
      margin-bottom: 0.5rem;
      color: var(--text-secondary);
      font-size: 0.9rem;
    }
    .form-group input, .form-group select, .form-group textarea {
      width: 100%;
      padding: 0.8rem;
      background: rgba(0,0,0,0.2);
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 6px;
      color: var(--text-primary);
      font-family: inherit;
    }
    .form-group input:focus, .form-group textarea:focus {
      outline: none;
      border-color: var(--color-accent);
      box-shadow: 0 0 0 2px rgba(212,175,55,0.2);
    }
    .tag {
      background: rgba(212, 175, 55, 0.15);
      color: var(--color-accent);
      padding: 0.2rem 0.6rem;
      border-radius: 20px;
      font-size: 0.8rem;
      font-weight: 600;
    }
  </style>
</head>
<body>

  <div class="sidebar">
    <h2>Forge Management</h2>
    <button class="nav-btn active" onclick="switchView('programs')">Programs</button>
    <button class="nav-btn" onclick="switchView('mappings')">Mappings Simulator</button>
    <button class="nav-btn" onclick="switchView('events')">Event Dispatcher</button>
    <div style="margin-top: auto; padding: 1rem; text-align: center;">
      <a href="/" style="color: var(--text-secondary); text-decoration: none; font-size: 0.9rem;">&larr; Back to Home</a>
    </div>
  </div>

  <div class="main-content">
    
    <!-- Programs View -->
    <div id="view-programs" class="view-section active">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2rem;">
        <h1 style="margin: 0;">Registered Programs</h1>
        <button class="action-btn" onclick="loadPrograms()" style="padding: 0.5rem 1rem; font-size: 0.9rem;">Refresh</button>
      </div>
      <p style="color: var(--text-secondary);">Manage organizations currently provisioned through the Databox Forge.</p>
      
      <table class="data-table" id="programs-table">
        <thead>
          <tr>
            <th>Organization</th>
            <th>Program URI</th>
            <th>Databox Route</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody id="programs-tbody">
          <tr><td colspan="4" style="text-align: center;">Loading...</td></tr>
        </tbody>
      </table>
    </div>

    <!-- Mappings View -->
    <div id="view-mappings" class="view-section">
      <h1 style="margin-bottom: 0.5rem;">Provisioning Simulator</h1>
      <p style="color: var(--text-secondary); margin-bottom: 2rem;">Manually provision a customer relationship mapping via the Forge API.</p>
      
      <div class="info-card" style="max-width: 600px;">
        <div class="form-group">
          <label>Profile ID (Program)</label>
          <input type="text" id="map-profileId" placeholder="urn:uuid:...">
        </div>
        <div class="form-group">
          <label>Customer ID Namespace</label>
          <input type="text" id="map-namespace" value="internal-crm">
        </div>
        <div class="form-group">
          <label>Synthetic Customer ID</label>
          <input type="text" id="map-customerId" value="CUST-12345">
        </div>
        <div class="form-group">
          <label>Consumer Pairwise WebID</label>
          <input type="text" id="map-webId" value="https://consumer-pod.example/profile/card#test">
        </div>
        <button class="action-btn" onclick="submitMapping()" id="btn-submit-mapping">Provision Mapping</button>
      </div>

      <div id="mapping-result" style="margin-top: 2rem; display: none;">
        <h3>Connection Output</h3>
        <p><strong>Connection URI:</strong></p>
        <div class="code-block" id="mapping-uri" style="word-break: break-all;"></div>
        <p><strong>Securing JWS:</strong></p>
        <div class="code-block" id="mapping-jws" style="word-break: break-all; max-height: 150px; overflow-y: auto;"></div>
      </div>
    </div>

    <!-- Events View -->
    <div id="view-events" class="view-section">
      <h1 style="margin-bottom: 0.5rem;">Event Dispatcher</h1>
      <p style="color: var(--text-secondary); margin-bottom: 2rem;">Inject institutional source-events into a Databox stream.</p>
      
      <div class="info-card" style="max-width: 800px;">
        <div style="display: flex; gap: 1rem;">
          <div class="form-group" style="flex: 1;">
            <label>Profile ID (Program)</label>
            <input type="text" id="ev-profileId" placeholder="urn:uuid:...">
          </div>
          <div class="form-group" style="flex: 1;">
            <label>Customer ID</label>
            <input type="text" id="ev-customerId" value="CUST-12345">
          </div>
        </div>
        <div style="display: flex; gap: 1rem;">
          <div class="form-group" style="flex: 1;">
            <label>Event Type</label>
            <input type="text" id="ev-type" value="system-update">
          </div>
          <div class="form-group" style="flex: 1;">
            <label>Record Class</label>
            <input type="text" id="ev-class" value="rc-note">
          </div>
        </div>
        <div class="form-group">
          <label>Payload (JSON)</label>
          <textarea id="ev-payload" rows="5">{"message": "Hello from Forge Management UI", "timestamp": "2026-07-16T00:00:00Z"}</textarea>
        </div>
        <button class="action-btn" onclick="submitEvent()" id="btn-submit-event">Dispatch Event</button>
      </div>

      <div id="event-result" style="margin-top: 2rem; display: none;">
        <h3>Dispatch Receipt</h3>
        <p><strong>Reconciliation Status:</strong> <span id="ev-status" class="tag"></span></p>
        <div class="code-block" id="ev-jws" style="word-break: break-all; max-height: 200px; overflow-y: auto; margin-top: 1rem;"></div>
      </div>
    </div>

  </div>

  <script>
    // Navigation
    function switchView(viewId) {
      document.querySelectorAll('.view-section').forEach(el => el.classList.remove('active'));
      document.querySelectorAll('.nav-btn').forEach(el => el.classList.remove('active'));
      
      document.getElementById('view-' + viewId).classList.add('active');
      event.currentTarget.classList.add('active');

      if(viewId === 'programs') loadPrograms();
    }

    // Mock JWK for demo simulator
    const mockJwk = {
      crv: 'Ed25519',
      x: 'e1ZfJ-H6sM7Wp1x-Z1D9M9u3tW6tHwB2gJ5yM-rC_hM',
      kty: 'OKP'
    };

    // API Helpers
    const token = '12345678901234567890123456789012';
    
    async function apiFetch(path, options = {}) {
      const headers = new Headers(options.headers || {});
      headers.set('Authorization', 'Bearer ' + token);
      
      const res = await fetch(path, { ...options, headers });
      const text = await res.text();
      let data;
      try { data = JSON.parse(text); } catch(e) { data = { error: text }; }
      if (!res.ok) throw new Error(data.error || \`HTTP \${res.status}\`);
      return data;
    }

    // Programs logic
    async function loadPrograms() {
      const tbody = document.getElementById('programs-tbody');
      tbody.innerHTML = '<tr><td colspan="4" style="text-align: center;">Loading...</td></tr>';
      try {
        const data = await apiFetch('/.databox/forge/programs');
        if(!data.programs || data.programs.length === 0) {
          tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: var(--text-secondary);">No programs registered. Use the landing page interactive demos to provision one.</td></tr>';
          return;
        }

        tbody.innerHTML = '';
        data.programs.forEach(p => {
          const tr = document.createElement('tr');
          const pName = p.profile.name || p.profile['schema:name'] || 'Unknown Org';
          tr.innerHTML = \`
            <td><strong>\${pName}</strong><br><small style="color: var(--text-secondary);">\${p.profileId}</small></td>
            <td><a href="\${p.programUri}" target="_blank" style="color: var(--color-accent); text-decoration: none;">\${p.programUri}</a></td>
            <td><code>\${p.databoxBaseUrl}</code></td>
            <td><span class="tag">Active</span></td>
          \`;
          tr.style.cursor = 'pointer';
          tr.onclick = () => {
            document.getElementById('map-profileId').value = p.profileId;
            document.getElementById('ev-profileId').value = p.profileId;
            alert('Selected profile ' + pName + ' for simulation.');
          };
          tbody.appendChild(tr);
        });

        // Auto fill if empty
        if(data.programs.length > 0 && !document.getElementById('map-profileId').value) {
          document.getElementById('map-profileId').value = data.programs[0].profileId;
          document.getElementById('ev-profileId').value = data.programs[0].profileId;
        }

      } catch (e) {
        tbody.innerHTML = \`<tr><td colspan="4" style="text-align: center; color: #dc2626;">Error: \${e.message}</td></tr>\`;
      }
    }

    // Mappings logic
    async function submitMapping() {
      const btn = document.getElementById('btn-submit-mapping');
      btn.innerText = 'Provisioning...';
      btn.disabled = true;
      try {
        const payload = {
          profileId: document.getElementById('map-profileId').value,
          sourceSystem: 'management-ui',
          customerIdNamespace: document.getElementById('map-namespace').value,
          customerId: document.getElementById('map-customerId').value,
          pairwiseWebId: document.getElementById('map-webId').value,
          holderPublicJwk: mockJwk
        };

        const headers = new Headers();
        headers.set('Authorization', 'Bearer ' + token);
        headers.set('Content-Type', 'application/json');

        const res = await fetch('/.databox/forge/mappings', {
          method: 'POST',
          headers,
          body: JSON.stringify(payload)
        });
        
        const data = await res.json();
        if(!res.ok) throw new Error(data.error || 'Unknown error');

        const cred = data.credential.credential;
        const conn = cred.credentialSubject.connection;
        
        const connectUri = new URL('solid-databox://connect');
        connectUri.searchParams.set('webid', cred.credentialSubject.id);
        connectUri.searchParams.set('issuer', cred.issuer);
        connectUri.searchParams.set('program', conn.program);
        connectUri.searchParams.set('databox', conn.databox);
        connectUri.searchParams.set('storage', conn.storageDescription);
        connectUri.searchParams.set('connection', data.credential.connectionId);
        connectUri.searchParams.set('grant', conn.accessGrant);

        document.getElementById('mapping-result').style.display = 'block';
        document.getElementById('mapping-uri').innerText = connectUri.toString();
        document.getElementById('mapping-jws').innerText = data.credential.jws;

      } catch (e) {
        alert('Mapping Failed: ' + e.message);
      } finally {
        btn.innerText = 'Provision Mapping';
        btn.disabled = false;
      }
    }

    // Event logic
    async function submitEvent() {
      const btn = document.getElementById('btn-submit-event');
      btn.innerText = 'Dispatching...';
      btn.disabled = true;
      try {
        let parsedPayload;
        try {
          parsedPayload = JSON.parse(document.getElementById('ev-payload').value);
        } catch(e) {
          throw new Error("Payload must be valid JSON");
        }

        const payload = {
          profileId: document.getElementById('ev-profileId').value,
          sourceSystem: 'management-ui',
          eventType: document.getElementById('ev-type').value,
          sourceEventId: 'MANUAL-' + Date.now(),
          customerIdNamespace: document.getElementById('map-namespace').value || 'internal-crm',
          customerId: document.getElementById('ev-customerId').value,
          recordClass: document.getElementById('ev-class').value,
          legalBasis: 'lb-consent',
          purpose: 'p-service',
          payload: parsedPayload
        };

        const headers = new Headers();
        headers.set('Authorization', 'Bearer ' + token);
        headers.set('Content-Type', 'application/json');

        const res = await fetch('/.databox/forge/source-events', {
          method: 'POST',
          headers,
          body: JSON.stringify(payload)
        });
        
        const data = await res.json();
        if(!res.ok) throw new Error(data.error || 'Unknown error');

        document.getElementById('event-result').style.display = 'block';
        document.getElementById('ev-status').innerText = data.status || 'unknown';
        document.getElementById('ev-jws').innerText = data.receipt ? data.receipt.jws : 'No receipt returned';

      } catch (e) {
        alert('Dispatch Failed: ' + e.message);
      } finally {
        btn.innerText = 'Dispatch Event';
        btn.disabled = false;
      }
    }

    // Init
    window.addEventListener('DOMContentLoaded', () => {
      loadPrograms();
    });
  </script>
</body>
</html>
`;

// We will write this file to the 3 locations that CSS uses for initialization
const targets = [
  path.join(__dirname, '../templates/root/static/forge'),
  path.join(__dirname, '../templates/root/intro/base/forge'),
  path.join(__dirname, '../templates/root/prefilled/base/forge')
];

for (const dir of targets) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.html'), UI_HTML, 'utf8');
}
console.log('Forge UI built to all static locations.');
