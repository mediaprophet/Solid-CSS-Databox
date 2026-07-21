import type { UiModuleDeclaration, ContainerBootConfig } from './types';

export type ModuleRenderFn = (
  container: HTMLElement,
  config: ContainerBootConfig,
  module: UiModuleDeclaration,
) => Promise<void>;

const loadedModules = new Map<string, ModuleRenderFn>();

/**
 * Dynamically load a UI module component bundle from the CMS.
 * The CMS serves component bundles at `/.databox/cms/org-apps/modules/<moduleId>/bundle.js`.
 * Each bundle exports a `render` function conforming to ModuleRenderFn.
 */
export async function loadModule(
  config: ContainerBootConfig,
  module: UiModuleDeclaration,
): Promise<ModuleRenderFn> {
  if (loadedModules.has(module.id)) {
    return loadedModules.get(module.id)!;
  }

  const bundleUrl = `${config.serverUrl}/.databox/cms/org-apps/modules/${module.moduleId}/bundle.js`;

  const response = await fetch(bundleUrl);
  if (!response.ok) {
    throw new Error(`Failed to load module bundle for ${module.id}: HTTP ${response.status}`);
  }

  const code = await response.text();
  const blob = new Blob([code], { type: 'application/javascript' });
  const blobUrl = URL.createObjectURL(blob);
  try {
    const mod = await import(/* @vite-ignore */ blobUrl);
    if (typeof mod.render !== 'function') {
      throw new Error(`Module ${module.id} bundle does not export a render function`);
    }
    const renderFn = mod.render as ModuleRenderFn;
    loadedModules.set(module.id, renderFn);
    return renderFn;
  } finally {
    URL.revokeObjectURL(blobUrl);
  }
}

/**
 * Render all available UI modules into the container.
 * Modules are sorted by defaultSort and rendered into separate views.
 */
export async function renderModules(
  root: HTMLElement,
  config: ContainerBootConfig,
): Promise<void> {
  const sorted = [...config.availableUiModules].sort((a, b) => a.defaultSort - b.defaultSort);

  root.innerHTML = '';

  const nav = document.createElement('nav');
  nav.className = 'databox-nav';
  nav.setAttribute('role', 'tablist');

  const content = document.createElement('main');
  content.className = 'databox-content';
  content.setAttribute('role', 'tabpanel');

  for (const module of sorted) {
    const tab = document.createElement('button');
    tab.className = 'databox-nav-tab';
    tab.setAttribute('role', 'tab');
    tab.setAttribute('aria-selected', 'false');
    tab.textContent = module.label;
    tab.dataset.moduleId = module.id;
    tab.addEventListener('click', () => activateModule(module.id, config, content, nav));
    nav.appendChild(tab);
  }

  root.appendChild(nav);
  root.appendChild(content);

  if (sorted.length > 0) {
    activateModule(sorted[0].id, config, content, nav);
  }
}

async function activateModule(
  moduleId: string,
  config: ContainerBootConfig,
  content: HTMLElement,
  nav: HTMLElement,
): Promise<void> {
  const module = config.availableUiModules.find((m) => m.id === moduleId);
  if (!module) return;

  for (const tab of nav.querySelectorAll<HTMLElement>('.databox-nav-tab')) {
    tab.setAttribute('aria-selected', tab.dataset.moduleId === moduleId ? 'true' : 'false');
  }

  content.innerHTML = '<div class="databox-loading">Loading…</div>';

  try {
    const renderFn = await loadModule(config, module);
    content.innerHTML = '';
    await renderFn(content, config, module);
  } catch (err) {
    content.innerHTML = `<div class="databox-error">Failed to load ${module.label}: ${err instanceof Error ? err.message : String(err)}</div>`;
  }
}
