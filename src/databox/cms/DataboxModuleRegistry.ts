import { BadRequestHttpError } from '../../util/errors/BadRequestHttpError';
import { InternalServerError } from '../../util/errors/InternalServerError';
import { NotFoundHttpError } from '../../util/errors/NotFoundHttpError';
import type { SolidModuleManifest } from './SolidModuleManifest';

/**
 * The authoritative registry of installed CMS modules and their enabled state
 * (see `databox/solid-cms-plan.md`, §5.1).
 *
 * A module is *installed* by registering its manifest and *activated* by enabling it —
 * the WordPress "install" vs "activate" split. Registration is once-only and fails
 * closed, so an installed module's contract cannot be silently replaced. Enabled state
 * is the mechanism behind the "page that can be enabled": only enabled modules surface
 * in the admin shell and mount their routes.
 */
export interface DataboxModuleRegistry {
  /** Register a module manifest. Fails closed on an empty id or a duplicate registration. */
  register: (manifest: SolidModuleManifest) => void;
  /** The manifest for an id, or `undefined` if none is registered. */
  get: (id: string) => SolidModuleManifest | undefined;
  /** Every registered manifest, in registration order. */
  list: () => SolidModuleManifest[];
  /** Enable or disable a registered module. Fails closed for an unknown id. */
  setEnabled: (id: string, enabled: boolean) => void;
  /** Whether a registered module is enabled (modules are disabled until enabled). */
  isEnabled: (id: string) => boolean;
  /** Every enabled manifest, in registration order. */
  listEnabled: () => SolidModuleManifest[];
}

/**
 * In-memory reference implementation of {@link DataboxModuleRegistry}. Installed manifests
 * and their enabled flags are process-local configuration; a production deployment swaps
 * in a durable, WAC-protected store (module state committed as Solid resources) behind the
 * same interface without changing this contract.
 */
export class InMemoryDataboxModuleRegistry implements DataboxModuleRegistry {
  private readonly modules = new Map<string, SolidModuleManifest>();
  private readonly enabled = new Set<string>();

  public register(manifest: SolidModuleManifest): void {
    if (manifest.id.length === 0) {
      throw new BadRequestHttpError('A module manifest must have a non-empty id.');
    }
    if (this.modules.has(manifest.id)) {
      // Modules register once; re-registration could silently replace a module's contract.
      throw new InternalServerError(`Module ${manifest.id} is already registered.`);
    }
    this.modules.set(manifest.id, manifest);
  }

  public get(id: string): SolidModuleManifest | undefined {
    return this.modules.get(id);
  }

  public list(): SolidModuleManifest[] {
    return [ ...this.modules.values() ];
  }

  public setEnabled(id: string, enabled: boolean): void {
    if (!this.modules.has(id)) {
      throw new NotFoundHttpError(`Cannot change enabled state of unknown module ${id}.`);
    }
    if (enabled) {
      this.enabled.add(id);
    } else {
      this.enabled.delete(id);
    }
  }

  public isEnabled(id: string): boolean {
    return this.enabled.has(id);
  }

  public listEnabled(): SolidModuleManifest[] {
    return this.list().filter((manifest): boolean => this.enabled.has(manifest.id));
  }
}
