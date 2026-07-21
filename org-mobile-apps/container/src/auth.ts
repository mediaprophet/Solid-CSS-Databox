import type {
  AppInstallLicence,
  ContainerBootResponse,
  BootError,
} from './types';

const STORAGE_KEY = 'databox:licence';
const SESSION_KEY = 'databox:session';

export interface AuthSession {
  readonly webId: string | null;
  readonly idp: string | null;
  readonly isLoggedIn: boolean;
}

export function getStoredLicence(): AppInstallLicence | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as AppInstallLicence;
  } catch {
    return null;
  }
}

export function storeLicence(licence: AppInstallLicence): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(licence));
}

export function clearLicence(): void {
  localStorage.removeItem(STORAGE_KEY);
}

export function getStoredSession(): AuthSession {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (raw) return JSON.parse(raw) as AuthSession;
  } catch { /* ignore */ }
  return { webId: null, idp: null, isLoggedIn: false };
}

export function storeSession(session: AuthSession): void {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function clearSession(): void {
  sessionStorage.removeItem(SESSION_KEY);
}

export async function fetchBootConfig(
  serverUrl: string,
  licence: AppInstallLicence,
  enabledModules: string[],
): Promise<ContainerBootResponse | BootError> {
  try {
    const response = await fetch(`${serverUrl}/.databox/cms/org-apps/boot`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        profile: { appId: licence.appId },
        enabledModules,
        licence,
        serverUrl,
        bootAt: new Date().toISOString(),
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Boot request failed' }));
      return { error: error.error ?? `HTTP ${response.status}`, recoverable: false };
    }

    return await response.json() as ContainerBootResponse;
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Network error during boot',
      recoverable: true,
    };
  }
}
