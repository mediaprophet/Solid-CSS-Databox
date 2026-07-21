export type NetworkScope = 'local-only' | 'remote-capable';
export type LicenceScope = 'full' | 'read-only' | 'trial' | 'restricted';

export interface UiModuleDeclaration {
  readonly id: string;
  readonly moduleId: string;
  readonly label: string;
  readonly cmsRoute: string;
  readonly icon: string;
  readonly defaultSort: number;
  readonly requiredPermission?: string;
}

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

export interface ContainerBootConfig {
  readonly appProfile: AppProfileManifest;
  readonly enabledModules: readonly string[];
  readonly licence: AppInstallLicence;
  readonly serverUrl: string;
  readonly bootAt: string;
  readonly availableUiModules: readonly UiModuleDeclaration[];
}

export interface ContainerBootResponse {
  readonly config: ContainerBootConfig;
  readonly record: Record<string, unknown>;
  readonly denied: readonly string[];
}

export interface BootError {
  readonly error: string;
  readonly recoverable: boolean;
}
