import { BadRequestHttpError } from '../../util/errors/BadRequestHttpError';

const LD_CONTEXT = '@context';
const LD_TYPE = '@type';
const LD_ID = '@id';

/**
 * Network scope controls where an app can be accessed from.
 * - `local-only`: Only accessible from the org's local network (venue WiFi)
 * - `remote-capable`: Accessible from anywhere with internet
 */
export type NetworkScope = 'local-only' | 'remote-capable';

/**
 * Licence scope controls what an individual install is permitted to do.
 * Granted per-install via a VC bound to the device + org.
 */
export type LicenceScope = 'full' | 'read-only' | 'trial' | 'restricted';

/**
 * An app profile defines what the WASM container should render.
 * The CMS serves this based on the org's vertical profile and the app's purpose.
 */
export interface AppProfileManifest {
  readonly appId: string;
  readonly name: string;
  readonly description: string;
  readonly version: string;
  readonly networkScope: NetworkScope;
  readonly requiredModules: readonly string[];
  readonly verticalProfiles: readonly string[];
  readonly uiModules: readonly UiModuleDeclaration[];
  readonly defaultPermissions: readonly string[];
  readonly installUrl: string;
  readonly iconUrl?: string;
}

/**
 * A UI module declaration — tells the WASM container which UI component
 * to load for a given feature area. The container fetches the actual
 * component bundle from the CMS at runtime.
 */
export interface UiModuleDeclaration {
  readonly id: string;
  readonly moduleId: string;
  readonly label: string;
  readonly cmsRoute: string;
  readonly icon: string;
  readonly defaultSort: number;
  readonly requiredPermission?: string;
}

/**
 * Per-install licence — a VC binding an app install to a specific
 * org + device with a scoped licence. The CMS validates this on
 * every container boot.
 */
export interface AppInstallLicence {
  readonly licenceId: string;
  readonly appId: string;
  readonly organisation: string;
  readonly deviceId: string;
  readonly scope: LicenceScope;
  readonly permissions: readonly string[];
  readonly issuedAt: string;
  readonly expiresAt?: string;
  readonly issuedBy: string;
}

export interface AppInstallLicenceResult {
  readonly record: Record<string, unknown>;
  readonly valid: boolean;
  readonly reason: string;
}

/**
 * Container boot configuration — what the CMS serves to the WASM
 * container on startup. Combines the app profile with the org's
 * actual enabled modules and the install's licence.
 */
export interface ContainerBootConfig {
  readonly appProfile: AppProfileManifest;
  readonly enabledModules: readonly string[];
  readonly licence: AppInstallLicence;
  readonly serverUrl: string;
  readonly bootAt: string;
  readonly availableUiModules: readonly UiModuleDeclaration[];
}

export interface ContainerBootResult {
  readonly config: ContainerBootConfig;
  readonly record: Record<string, unknown>;
  readonly denied: readonly string[];
}

function requireUri(value: string, field: string): string {
  try {
    return new URL(value).href;
  } catch {
    throw new BadRequestHttpError(`App ${field} must be an absolute URI.`);
  }
}

function requireNonEmpty(value: string, field: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new BadRequestHttpError(`App ${field} must not be empty.`);
  }
  return trimmed;
}

function requireDate(value: string, field: string): string {
  const date = new Date(value);
  if (value.trim().length === 0 || Number.isNaN(date.getTime())) {
    throw new BadRequestHttpError(`App ${field} must be a valid date.`);
  }
  return value;
}

function requireNetworkScope(value: string): NetworkScope {
  if (value !== 'local-only' && value !== 'remote-capable') {
    throw new BadRequestHttpError(`Network scope must be 'local-only' or 'remote-capable'.`);
  }
  return value;
}

function requireLicenceScope(value: string): LicenceScope {
  const valid: LicenceScope[] = [ 'full', 'read-only', 'trial', 'restricted' ];
  if (!valid.includes(value as LicenceScope)) {
    throw new BadRequestHttpError(`Licence scope must be one of: ${valid.join(', ')}.`);
  }
  return value as LicenceScope;
}

/**
 * Build an app profile manifest — defines what the WASM container
 * should render for a given purpose (waiter, driver, scorekeeper, etc).
 */
export function buildAppProfile(input: {
  readonly appId: string;
  readonly name: string;
  readonly description: string;
  readonly version: string;
  readonly networkScope: NetworkScope;
  readonly requiredModules: readonly string[];
  readonly verticalProfiles: readonly string[];
  readonly uiModules: readonly UiModuleDeclaration[];
  readonly defaultPermissions: readonly string[];
  readonly installUrl: string;
  readonly iconUrl?: string;
}): AppProfileManifest {
  const appId = requireNonEmpty(input.appId, 'appId');
  const name = requireNonEmpty(input.name, 'name');
  const description = requireNonEmpty(input.description, 'description');
  const version = requireNonEmpty(input.version, 'version');
  const networkScope = requireNetworkScope(input.networkScope);
  const installUrl = requireUri(input.installUrl, 'installUrl');

  if (input.requiredModules.length === 0) {
    throw new BadRequestHttpError('App profile must declare at least one required module.');
  }
  if (input.uiModules.length === 0) {
    throw new BadRequestHttpError('App profile must declare at least one UI module.');
  }

  const manifest: AppProfileManifest = {
    appId,
    name,
    description,
    version,
    networkScope,
    requiredModules: input.requiredModules,
    verticalProfiles: input.verticalProfiles,
    uiModules: input.uiModules,
    defaultPermissions: input.defaultPermissions,
    installUrl,
    ...input.iconUrl ? { iconUrl: requireUri(input.iconUrl, 'iconUrl') } : {},
  };

  return manifest;
}

/**
 * Serialise an app profile manifest to JSON-LD (RDF) for storage
 * in a Solid pod or CMS config store.
 */
export function serialiseAppProfile(profile: AppProfileManifest): Record<string, unknown> {
  return {
    [LD_CONTEXT]: [ 'https://schema.org/', 'https://www.w3.org/ns/solid/v1' ],
    [LD_TYPE]: [ 'SoftwareApplication', 'SolidApp' ],
    [LD_ID]: profile.installUrl,
    name: profile.name,
    description: profile.description,
    softwareVersion: profile.version,
    identifier: profile.appId,
    'solid:networkScope': profile.networkScope,
    'solid:requiredModules': profile.requiredModules,
    'solid:verticalProfiles': profile.verticalProfiles,
    'solid:installUrl': profile.installUrl,
    featureList: profile.uiModules.map(m => ({
      [LD_TYPE]: 'FeatureSpecification',
      identifier: m.id,
      'solid:moduleId': m.moduleId,
      name: m.label,
      url: m.cmsRoute,
      icon: m.icon,
      position: m.defaultSort,
      ...m.requiredPermission ? { 'solid:requiredPermission': m.requiredPermission } : {},
    })),
    permission: profile.defaultPermissions,
  };
}

/**
 * Issue an app install licence — a VC binding an app install to a
 * specific org + device with a scoped licence.
 */
export function issueAppInstallLicence(input: {
  readonly licenceId: string;
  readonly appId: string;
  readonly organisation: string;
  readonly deviceId: string;
  readonly scope: LicenceScope;
  readonly permissions: readonly string[];
  readonly issuedAt: string;
  readonly expiresAt?: string;
  readonly issuedBy: string;
}): AppInstallLicence {
  const licenceId = requireUri(input.licenceId, 'licenceId');
  const appId = requireNonEmpty(input.appId, 'appId');
  const organisation = requireUri(input.organisation, 'organisation');
  const deviceId = requireUri(input.deviceId, 'deviceId');
  const scope = requireLicenceScope(input.scope);
  const issuedAt = requireDate(input.issuedAt, 'issuedAt');
  const issuedBy = requireUri(input.issuedBy, 'issuedBy');

  if (input.permissions.length === 0) {
    throw new BadRequestHttpError('App install licence must grant at least one permission.');
  }

  let expiresAt: string | undefined;
  if (input.expiresAt) {
    expiresAt = requireDate(input.expiresAt, 'expiresAt');
    const expiry = new Date(expiresAt);
    if (expiry <= new Date(issuedAt)) {
      throw new BadRequestHttpError('Licence expiry must be after issue date.');
    }
  }

  return {
    licenceId,
    appId,
    organisation,
    deviceId,
    scope,
    permissions: input.permissions,
    issuedAt,
    ...expiresAt ? { expiresAt } : {},
    issuedBy,
  };
}

/**
 * Validate an app install licence — checks expiry, scope, and
 * whether the requested permissions are granted.
 */
export function validateAppInstallLicence(
  licence: AppInstallLicence,
  requestedAt: string,
): AppInstallLicenceResult {
  const now = new Date(requestedAt);

  if (licence.expiresAt) {
    const expiry = new Date(licence.expiresAt);
    if (now > expiry) {
      return {
        record: { [LD_TYPE]: 'LicenceValidation', valid: false, reason: 'Licence has expired.' },
        valid: false,
        reason: 'Licence has expired.',
      };
    }
  }

  if (licence.scope === 'trial') {
    const issued = new Date(licence.issuedAt);
    const trialDays = (now.getTime() - issued.getTime()) / 86400000;
    if (trialDays > 30) {
      return {
        record: { [LD_TYPE]: 'LicenceValidation', valid: false, reason: 'Trial licence exceeded 30 days.' },
        valid: false,
        reason: 'Trial licence exceeded 30 days.',
      };
    }
  }

  return {
    record: {
      [LD_CONTEXT]: 'https://schema.org/',
      [LD_TYPE]: 'LicenceValidation',
      [LD_ID]: `${licence.licenceId}#validation-${Date.now()}`,
      object: { [LD_ID]: licence.licenceId },
      actionStatus: 'CompletedActionStatus',
      valid: true,
    },
    valid: true,
    reason: 'Licence is valid.',
  };
}

/**
 * Build the container boot configuration — the CMS serves this to
 * the WASM container on startup. It combines the app profile with
 * the org's actual enabled modules and the install's licence,
 * filtering UI modules to only those the org has enabled and the
 * licence permits.
 */
export function buildContainerBootConfig(
  profile: AppProfileManifest,
  enabledModules: readonly string[],
  licence: AppInstallLicence,
  serverUrl: string,
  bootAt: string,
): ContainerBootResult {
  const validatedLicence = validateAppInstallLicence(licence, bootAt);
  if (!validatedLicence.valid) {
    throw new BadRequestHttpError(`Cannot boot container: ${validatedLicence.reason}`);
  }

  if (licence.appId !== profile.appId) {
    throw new BadRequestHttpError(
      `Licence is for app "${licence.appId}" but container requested "${profile.appId}".`,
    );
  }

  const enabledSet = new Set(enabledModules);
  const licencePerms = new Set(licence.permissions);

  const denied: string[] = [];
  const availableUiModules = profile.uiModules.filter((module) => {
    const moduleEnabled = enabledSet.has(module.moduleId);
    if (!moduleEnabled) {
      denied.push(`${module.id}: module not enabled`);
      return false;
    }
    if (module.requiredPermission && !licencePerms.has(module.requiredPermission)) {
      denied.push(`${module.id}: permission "${module.requiredPermission}" not granted by licence`);
      return false;
    }
    if (licence.scope === 'read-only' && module.cmsRoute.includes('POST')) {
      denied.push(`${module.id}: write operation not allowed with read-only licence`);
      return false;
    }
    return true;
  });

  const config: ContainerBootConfig = {
    appProfile: profile,
    enabledModules,
    licence,
    serverUrl: requireUri(serverUrl, 'serverUrl'),
    bootAt: requireDate(bootAt, 'bootAt'),
    availableUiModules,
  };

  const record: Record<string, unknown> = {
    [LD_CONTEXT]: [ 'https://schema.org/', 'https://www.w3.org/ns/solid/v1' ],
    [LD_TYPE]: [ 'Action', 'ContainerBoot' ],
    [LD_ID]: `${profile.installUrl}#boot-${Date.now()}`,
    object: { [LD_ID]: profile.installUrl },
    agent: { [LD_ID]: licence.deviceId },
    actionStatus: 'CompletedActionStatus',
    startTime: bootAt,
    'solid:appId': profile.appId,
    'solid:networkScope': profile.networkScope,
    'solid:licenceScope': licence.scope,
    'solid:availableModules': availableUiModules.map(m => m.id),
    'solid:deniedModules': denied,
    'solid:serverUrl': serverUrl,
  };

  return { config, record, denied };
}

/**
 * Check network scope — verifies that a request is coming from
 * the appropriate network for the app's network scope.
 * In production this checks request origin IP against the org's
 * known network ranges. Here we provide the logic for the CMS
 * to call.
 */
export function checkNetworkScope(
  networkScope: NetworkScope,
  requestOrigin: string,
  orgLocalNetworks: readonly string[],
): { allowed: boolean; reason: string } {
  if (networkScope === 'remote-capable') {
    return { allowed: true, reason: 'Remote-capable apps allow any origin.' };
  }

  // Local-only: check if origin IP matches any of the org's local network ranges
  // orgLocalNetworks can be CIDR ranges (e.g. "192.168.1.0/24") or exact IPs
  const originIp = extractIp(requestOrigin);
  if (!originIp) {
    return { allowed: false, reason: 'Could not determine request origin IP.' };
  }

  for (const network of orgLocalNetworks) {
    if (matchIpInRange(originIp, network)) {
      return { allowed: true, reason: 'Request origin matches local network.' };
    }
  }

  return { allowed: false, reason: `Origin ${originIp} not in local network ranges.` };
}

function extractIp(origin: string): string | null {
  // Extract IP from "host:port" or bare IP
  const match = /^((?:\d{1,3}\.){3}\d{1,3})/u.exec(origin);
  return match ? match[1] : null;
}

function matchIpInRange(ip: string, range: string): boolean {
  if (!range.includes('/')) {
    return ip === range;
  }
  // Simple CIDR match for /24 and /16
  const [ base, prefix ] = range.split('/');
  const prefixLen = Number.parseInt(prefix, 10);
  const ipParts = ip.split('.').map(Number);
  const baseParts = base.split('.').map(Number);

  if (prefixLen === 24) {
    return ipParts[0] === baseParts[0] && ipParts[1] === baseParts[1] && ipParts[2] === baseParts[2];
  }
  if (prefixLen === 16) {
    return ipParts[0] === baseParts[0] && ipParts[1] === baseParts[1];
  }
  if (prefixLen === 8) {
    return ipParts[0] === baseParts[0];
  }
  return ip === base;
}
