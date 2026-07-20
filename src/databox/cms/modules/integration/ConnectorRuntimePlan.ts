import {
  type ConnectorMode,
  type ConnectorRuntimeDescriptor,
  type PortableConnectorJob,
  type PortableConnectorManifest,
  validateConnectorRuntimeDescriptor,
  validatePortableConnectorJob,
  validatePortableConnectorManifest,
} from './ConnectorContract';

export type ConnectorRuntimeAction =
  'run-import-snapshot' |
  'run-source-to-pod-sync' |
  'serve-virtual-federated-query';

export type ConnectorWriteDisposition = 'write-solid-rdf' | 'read-only-virtual-rdf';
export type ConnectorSyncDirection = 'source-to-pod' | 'none';
export type ConnectorAuthFederationBoundary = 'not-auth-federation';

export interface ConnectorSecretEnvironmentBinding {
  readonly name: string;
  readonly valueFrom: string;
}

export interface ConnectorSidecarCommandDescriptor {
  readonly executable: string;
  readonly args: readonly string[];
  readonly env: readonly ConnectorSecretEnvironmentBinding[];
  readonly workingDirectory?: string;
}

export interface ConnectorRuntimeProvenancePlan {
  readonly required: true;
  readonly sourceRef: string;
  readonly mappingLanguage: PortableConnectorManifest['mapping']['language'];
  readonly mappingRootIri?: string;
  readonly jobId: string;
  readonly evidenceFields: readonly string[];
}

export interface ConnectorRuntimeConflictPlan {
  readonly policy: NonNullable<PortableConnectorJob['conflictPolicy']>;
  readonly bidirectionalSync: false;
  readonly notes: readonly string[];
}

export interface ConnectorRuntimeSyncPlan {
  readonly direction: ConnectorSyncDirection;
  readonly cursorResource?: string;
  readonly liveSyncImplementation: 'planned-sidecar-loop' | 'not-applicable';
  readonly status: 'contract-only-no-driver-dependency';
}

export interface ConnectorRuntimeAuthBoundaryPlan {
  readonly boundary: ConnectorAuthFederationBoundary;
  readonly sourceRole: 'relational-data-source' | 'directory-data-source';
  readonly authFederationBridge: 'separate-oidc-or-saml-component';
  readonly notes: readonly string[];
}

export interface ConnectorRuntimeJobPlan {
  readonly kind: 'connector-runtime-job-plan';
  readonly connectorId: string;
  readonly jobId: string;
  readonly mode: ConnectorMode;
  readonly action: ConnectorRuntimeAction;
  readonly engineId: string;
  readonly implementation: ConnectorRuntimeDescriptor['implementation'];
  readonly writeDisposition: ConnectorWriteDisposition;
  readonly targetPod: string;
  readonly targetContainer?: string;
  readonly targetGraph?: string;
  readonly command: ConnectorSidecarCommandDescriptor;
  readonly provenance: ConnectorRuntimeProvenancePlan;
  readonly conflict: ConnectorRuntimeConflictPlan;
  readonly sync: ConnectorRuntimeSyncPlan;
  readonly authBoundary: ConnectorRuntimeAuthBoundaryPlan;
}

export interface ConnectorRuntimePlanOptions {
  readonly executable?: string;
  readonly workingDirectory?: string;
}

export function planConnectorRuntimeJob(
  manifest: PortableConnectorManifest,
  job: PortableConnectorJob,
  runtime: ConnectorRuntimeDescriptor,
  options: ConnectorRuntimePlanOptions = {},
): ConnectorRuntimeJobPlan {
  const checkedManifest = validatePortableConnectorManifest(manifest);
  const checkedJob = validatePortableConnectorJob(job, checkedManifest);
  const checkedRuntime = validateRuntimeForManifest(runtime, checkedManifest);
  rejectAuthFederationConflation(checkedManifest);

  const action = actionForMode(checkedJob.mode);
  const executable = options.executable ?? defaultExecutableFor(checkedRuntime.implementation);
  const env = checkedRuntime.secretRefs.map((secretRef, index): ConnectorSecretEnvironmentBinding => ({
    name: `DATABOX_CONNECTOR_SECRET_${index}`,
    valueFrom: secretRef,
  }));
  return {
    kind: 'connector-runtime-job-plan',
    connectorId: checkedManifest.id,
    jobId: checkedJob.id,
    mode: checkedJob.mode,
    action,
    engineId: checkedRuntime.engineId,
    implementation: checkedRuntime.implementation,
    writeDisposition: checkedJob.mode === 'virtual-federated-query' ? 'read-only-virtual-rdf' : 'write-solid-rdf',
    targetPod: checkedManifest.target.podBaseIri,
    ...checkedManifest.target.resourceContainer === undefined ?
        {} :
        { targetContainer: checkedManifest.target.resourceContainer },
    ...checkedManifest.target.graphIri === undefined ? {} : { targetGraph: checkedManifest.target.graphIri },
    command: {
      executable,
      args: commandArgsFor(checkedManifest, checkedJob),
      env,
      ...options.workingDirectory === undefined ? {} : { workingDirectory: options.workingDirectory },
    },
    provenance: {
      required: true,
      sourceRef: checkedManifest.source.sourceRef,
      mappingLanguage: checkedManifest.mapping.language,
      ...checkedManifest.mapping.rootIri === undefined ? {} : { mappingRootIri: checkedManifest.mapping.rootIri },
      jobId: checkedJob.id,
      evidenceFields: [
        'source-ref',
        'source-record-digest',
        'mapping-work-digest',
        'connector-engine-id',
        'job-id',
        'target-resource-iri',
        'executed-at',
      ],
    },
    conflict: {
      policy: checkedJob.conflictPolicy ?? defaultConflictPolicyFor(checkedJob.mode),
      bidirectionalSync: false,
      notes: conflictNotesFor(checkedJob.mode),
    },
    sync: syncPlanFor(checkedJob),
    authBoundary: authBoundaryFor(checkedManifest),
  };
}

function validateRuntimeForManifest(
  runtime: ConnectorRuntimeDescriptor,
  manifest: PortableConnectorManifest,
): ConnectorRuntimeDescriptor {
  const checked = validateConnectorRuntimeDescriptor(runtime);
  if (checked.connectorId !== manifest.id) {
    throw new Error(`Connector runtime ${checked.engineId} is for ${checked.connectorId}, not ${manifest.id}.`);
  }
  if (checked.secretRefs.length === 0 && checked.implementation !== 'managed-adapter') {
    throw new Error('connector runtime needs at least one secretRef for sidecar connection material.');
  }
  return checked;
}

function rejectAuthFederationConflation(manifest: PortableConnectorManifest): void {
  if (manifest.source.kind !== 'ldap') {
    return;
  }
  if (manifest.capabilities?.some((capability): boolean => /auth|federation|saml|oidc/iu.test(capability))) {
    throw new Error(
      'LDAP connector manifests describe directory data import; auth federation is a separate OIDC/SAML bridge.',
    );
  }
}

function defaultExecutableFor(implementation: ConnectorRuntimeDescriptor['implementation']): string {
  switch (implementation) {
    case 'rust-sidecar':
      return 'databox-connector-sidecar';
    case 'native-binary':
      return 'databox-connector';
    case 'container':
      return 'databox-connector-container';
    case 'managed-adapter':
      return 'databox-managed-connector';
    default:
      throw new Error(`Unsupported connector runtime implementation: ${String(implementation)}`);
  }
}

function actionForMode(mode: ConnectorMode): ConnectorRuntimeAction {
  if (mode === 'import-snapshot') {
    return 'run-import-snapshot';
  }
  if (mode === 'source-to-pod-sync') {
    return 'run-source-to-pod-sync';
  }
  return 'serve-virtual-federated-query';
}

function commandArgsFor(manifest: PortableConnectorManifest, job: PortableConnectorJob): string[] {
  const args = [
    actionForMode(job.mode),
    '--connector-id',
    manifest.id,
    '--job-id',
    job.id,
    '--source-kind',
    manifest.source.kind,
    '--source-ref',
    manifest.source.sourceRef,
    '--mapping-language',
    manifest.mapping.language,
    '--target-pod',
    manifest.target.podBaseIri,
    '--conflict-policy',
    job.conflictPolicy ?? defaultConflictPolicyFor(job.mode),
  ];
  if (manifest.target.resourceContainer) {
    args.push('--target-container', manifest.target.resourceContainer);
  }
  if (manifest.target.graphIri) {
    args.push('--target-graph', manifest.target.graphIri);
  }
  if (job.cursorResource) {
    args.push('--cursor-resource', job.cursorResource);
  }
  if (job.dryRun) {
    args.push('--dry-run');
  }
  return args;
}

function defaultConflictPolicyFor(mode: ConnectorMode): NonNullable<PortableConnectorJob['conflictPolicy']> {
  if (mode === 'import-snapshot') {
    return 'append-only';
  }
  if (mode === 'source-to-pod-sync') {
    return 'source-wins';
  }
  return 'reject-on-conflict';
}

function conflictNotesFor(mode: ConnectorMode): string[] {
  if (mode === 'source-to-pod-sync') {
    return [
      'Live sync is one-way from source to pod by default.',
      'Bidirectional writes require a later explicit conflict protocol.',
    ];
  }
  if (mode === 'virtual-federated-query') {
    return [
      'Virtual query mode does not copy source records into the pod.',
      'The source remains a live runtime dependency.',
    ];
  }
  return [
    'Snapshot import writes mapped RDF once and records provenance for each output resource.',
  ];
}

function syncPlanFor(job: PortableConnectorJob): ConnectorRuntimeSyncPlan {
  if (job.mode !== 'source-to-pod-sync') {
    return {
      direction: 'none',
      liveSyncImplementation: 'not-applicable',
      status: 'contract-only-no-driver-dependency',
    };
  }
  return {
    direction: 'source-to-pod',
    ...job.cursorResource === undefined ? {} : { cursorResource: job.cursorResource },
    liveSyncImplementation: 'planned-sidecar-loop',
    status: 'contract-only-no-driver-dependency',
  };
}

function authBoundaryFor(manifest: PortableConnectorManifest): ConnectorRuntimeAuthBoundaryPlan {
  if (manifest.source.kind === 'ldap') {
    return {
      boundary: 'not-auth-federation',
      sourceRole: 'directory-data-source',
      authFederationBridge: 'separate-oidc-or-saml-component',
      notes: [
        'LDAP/AD connector jobs import directory facts through the mapper.',
        'Login federation is not performed by the mapper or connector runtime job.',
      ],
    };
  }
  return {
    boundary: 'not-auth-federation',
    sourceRole: 'relational-data-source',
    authFederationBridge: 'separate-oidc-or-saml-component',
    notes: [
      'ODBC connector jobs import relational facts through the mapper.',
      'Authentication remains outside this connector runtime plan.',
    ],
  };
}
