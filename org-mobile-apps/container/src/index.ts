import { getStoredLicence, getStoredSession, fetchBootConfig, storeSession, clearSession } from './auth';
import { renderModules } from './loader';
import type { BootError } from './types';

const BOOT_CONTAINER_ID = 'databox-app';

interface BootParams {
  readonly serverUrl: string;
  readonly enabledModules: string[];
}

function getBootParams(): BootParams {
  const params = new URLSearchParams(window.location.search);
  const serverUrl = params.get('server') ?? window.location.origin;
  const modules = params.get('modules')?.split(',').filter(Boolean) ?? [];
  return { serverUrl, enabledModules: modules };
}

function renderError(root: HTMLElement, error: BootError): void {
  root.innerHTML = `
    <div class="databox-error-screen">
      <h1>Unable to start app</h1>
      <p>${error.error}</p>
      ${error.recoverable ? '<button onclick="window.location.reload()">Retry</button>' : ''}
    </div>
  `;
}

function renderUnlicensed(root: HTMLElement): void {
  root.innerHTML = `
    <div class="databox-error-screen">
      <h1>No app licence found</h1>
      <p>This device does not have a valid app install licence. Please contact your organisation administrator to issue a licence.</p>
    </div>
  `;
}

async function boot(): Promise<void> {
  const root = document.getElementById(BOOT_CONTAINER_ID);
  if (!root) {
    console.error(`Container element #${BOOT_CONTAINER_ID} not found`);
    return;
  }

  root.innerHTML = '<div class="databox-booting">Starting…</div>';

  const licence = getStoredLicence();
  if (!licence) {
    renderUnlicensed(root);
    return;
  }

  const session = getStoredSession();
  if (!session.isLoggedIn) {
    root.innerHTML = `
      <div class="databox-login">
        <h1>${licence.appId}</h1>
        <p>Sign in to your Solid pod to continue.</p>
        <button id="databox-login-btn">Sign in</button>
      </div>
    `;
    const loginBtn = document.getElementById('databox-login-btn');
    loginBtn?.addEventListener('click', () => {
      storeSession({ webId: null, idp: null, isLoggedIn: true });
      window.location.reload();
    });
    return;
  }

  const { serverUrl, enabledModules } = getBootParams();
  const result = await fetchBootConfig(serverUrl, licence, enabledModules);

  if ('error' in result) {
    renderError(root, result);
    return;
  }

  const { config, denied } = result;

  if (config.availableUiModules.length === 0) {
    root.innerHTML = `
      <div class="databox-error-screen">
        <h1>No modules available</h1>
        <p>Your organisation does not have the required modules enabled for this app.</p>
        ${denied.length > 0 ? `<details><summary>Details</summary><ul>${denied.map((d) => `<li>${d}</li>`).join('')}</ul></details>` : ''}
      </div>
    `;
    return;
  }

  document.title = config.appProfile.name;

  await renderModules(root, config);
}

boot().catch((err) => {
  console.error('Container boot failed:', err);
  const root = document.getElementById(BOOT_CONTAINER_ID);
  if (root) {
    renderError(root, {
      error: err instanceof Error ? err.message : 'Unknown boot error',
      recoverable: true,
    });
  }
});
