/// <reference lib="webworker" />

import type { ContainerBootConfig, NetworkScope } from './types';

const ctx = self as unknown as ServiceWorkerGlobalScope;

const CACHE_NAME = 'databox-org-app-v1';
const NETWORK_SCOPE_CHECK_URL = '/.databox/cms/org-apps/network-scope/check';

interface ScopeCheckResult {
  readonly allowed: boolean;
  readonly reason: string;
}

async function checkNetworkScope(
  scope: NetworkScope,
  serverUrl: string,
): Promise<ScopeCheckResult> {
  if (scope === 'remote-capable') {
    return { allowed: true, reason: 'Remote-capable' };
  }

  try {
    const response = await fetch(`${serverUrl}${NETWORK_SCOPE_CHECK_URL}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        networkScope: scope,
        requestOrigin: ctx.location.hostname,
        orgLocalNetworks: [],
      }),
    });
    if (response.ok) {
      return await response.json() as ScopeCheckResult;
    }
  } catch { /* fall through to block */ }

  return { allowed: false, reason: 'Network scope check failed' };
}

ctx.addEventListener('install', (event: ExtendableEvent) => {
  event.waitUntil(ctx.skipWaiting());
});

ctx.addEventListener('activate', (event: ExtendableEvent) => {
  event.waitUntil(ctx.clients.claim());
});

ctx.addEventListener('fetch', (event: FetchEvent) => {
  const request = event.request;

  if (request.method !== 'GET') {
    return;
  }

  const url = new URL(request.url);

  if (url.origin === ctx.location.origin) {
    event.respondWith(
      caches.match(request).then((cached): Promise<Response> => {
        const fetchPromise = fetch(request).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        }).catch((): Response => cached ?? new Response('', { status: 504 }));
        return cached ? Promise.resolve(cached) : fetchPromise;
      }),
    );
  }
});
