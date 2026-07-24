/**
 * The admin-shell surface a IPMS module contributes when enabled.
 */
export interface SolidModuleAdminUi {
  /** Label shown in the admin sidebar when the module is enabled. */
  readonly navLabel: string;
  /** Admin-panel path the nav entry links to. */
  readonly path: string;
}

/**
 * A self-describing manifest for a IPMS module — the WordPress-plugin-header analogue
 * (see `databox/solid-ipms-plan.md`, §5.1). It is kept purely declarative so it can live
 * as an RDF resource: it carries no behaviour, only the module's identity, the
 * capabilities it provides, the control-plane sub-routes it mounts, an optional config
 * shape (SHACL / W3C `ui#`) and where it surfaces in the admin shell.
 */
export interface SolidModuleManifest {
  /** Stable module identifier, unique within a {@link DataboxModuleRegistry}. */
  readonly id: string;
  /** Human-readable module name. */
  readonly name: string;
  /** Semantic version of the module. */
  readonly version: string;
  /** One-line description. */
  readonly description: string;
  /** Capability identifiers this module provides. */
  readonly capabilities: readonly string[];
  /** Control-plane sub-routes (relative to the IPMS base) this module mounts. */
  readonly routes: readonly string[];
  /** Optional URI of the config shape (SHACL or W3C `ui#`) describing this module's settings. */
  readonly configShape?: string;
  /** Optional admin-shell surface shown while the module is enabled. */
  readonly adminUi?: SolidModuleAdminUi;
}
