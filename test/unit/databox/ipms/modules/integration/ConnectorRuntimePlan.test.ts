import type {
  ConnectorRuntimeDescriptor,
  PortableConnectorJob,
  PortableConnectorManifest,
} from '../../../../../../src/databox/ipms/modules/integration/ConnectorContract';
import { planConnectorRuntimeJob } from '../../../../../../src/databox/ipms/modules/integration/ConnectorRuntimePlan';

const r2rml = `
@prefix rr: <http://www.w3.org/ns/r2rml#> .
@prefix schema: <https://schema.org/> .

<#TriplesMap>
  rr:logicalTable [ rr:tableName "staff" ];
  rr:subjectMap [ rr:template "https://pods.example/staff/{id}" ];
  rr:predicateObjectMap [
    rr:predicate schema:name ;
    rr:objectMap [ rr:column "display_name" ]
  ] .
`;

const manifest: PortableConnectorManifest = {
  id: 'enterprise.staff.odbc',
  name: 'Staff ODBC Import',
  version: '0.1.0',
  description: 'Maps staff rows into directory resources.',
  source: {
    kind: 'odbc',
    sourceRef: 'urn:databox:source:staff-sql',
  },
  modes: [ 'import-snapshot', 'source-to-pod-sync', 'virtual-federated-query' ],
  mapping: {
    language: 'r2rml',
    contentType: 'text/turtle',
    turtle: r2rml,
    rootIri: 'https://pods.example/.databox/ipms/mappings/staff.ttl#TriplesMap',
  },
  target: {
    podBaseIri: 'https://pods.example/',
    resourceContainer: 'https://pods.example/.databox/ipms/directory/',
    graphIri: 'https://pods.example/.databox/ipms/graphs/staff',
  },
};

const runtime: ConnectorRuntimeDescriptor = {
  connectorId: manifest.id,
  engineId: 'rust-odbc-sidecar',
  implementation: 'rust-sidecar',
  version: '0.1.0',
  secretRefs: [ 'vault://databox/staff-sql' ],
};

const importJob: PortableConnectorJob = {
  id: 'staff-import-2026-07-19',
  connectorId: manifest.id,
  mode: 'import-snapshot',
  createdAt: '2026-07-19T00:00:00.000Z',
};

describe('ConnectorRuntimePlan', (): void => {
  it('plans a one-time import as a sidecar command with secret references, not inline credentials.', (): void => {
    const plan = planConnectorRuntimeJob(manifest, importJob, runtime, {
      workingDirectory: 'C:\\ProgramData\\Databox\\connectors',
    });

    expect(plan).toMatchObject({
      kind: 'connector-runtime-job-plan',
      action: 'run-import-snapshot',
      writeDisposition: 'write-solid-rdf',
      targetPod: 'https://pods.example/',
      targetContainer: 'https://pods.example/.databox/ipms/directory/',
      targetGraph: 'https://pods.example/.databox/ipms/graphs/staff',
      conflict: {
        policy: 'append-only',
        bidirectionalSync: false,
      },
      sync: {
        direction: 'none',
        liveSyncImplementation: 'not-applicable',
        status: 'contract-only-no-driver-dependency',
      },
      command: {
        executable: 'databox-connector-sidecar',
        env: [
          {
            name: 'DATABOX_CONNECTOR_SECRET_0',
            valueFrom: 'vault://databox/staff-sql',
          },
        ],
        workingDirectory: 'C:\\ProgramData\\Databox\\connectors',
      },
    });
    expect(plan.command.args).toContain('--mapping-language');
    expect(plan.command.args).toContain('r2rml');
    expect(JSON.stringify(plan)).not.toContain('Password=');
  });

  it('plans live sync as one-way source-to-pod with cursor and provenance placeholders.', (): void => {
    const plan = planConnectorRuntimeJob(manifest, {
      ...importJob,
      id: 'staff-sync',
      mode: 'source-to-pod-sync',
      conflictPolicy: 'source-wins',
      cursorResource: 'https://pods.example/.databox/ipms/connectors/staff/cursor.ttl',
    }, runtime);

    expect(plan.sync).toEqual({
      direction: 'source-to-pod',
      cursorResource: 'https://pods.example/.databox/ipms/connectors/staff/cursor.ttl',
      liveSyncImplementation: 'planned-sidecar-loop',
      status: 'contract-only-no-driver-dependency',
    });
    expect(plan.conflict.notes.join(' ')).toContain('one-way from source to pod');
    expect(plan.provenance).toMatchObject({
      required: true,
      sourceRef: 'urn:databox:source:staff-sql',
      mappingLanguage: 'r2rml',
      mappingRootIri: 'https://pods.example/.databox/ipms/mappings/staff.ttl#TriplesMap',
      jobId: 'staff-sync',
    });
    expect(plan.provenance.evidenceFields).toContain('source-record-digest');
  });

  it('plans virtual federated query as read-only RDF with no pod copy promise.', (): void => {
    const plan = planConnectorRuntimeJob(manifest, {
      ...importJob,
      id: 'staff-virtual-query',
      mode: 'virtual-federated-query',
    }, runtime);

    expect(plan.action).toBe('serve-virtual-federated-query');
    expect(plan.writeDisposition).toBe('read-only-virtual-rdf');
    expect(plan.conflict.policy).toBe('reject-on-conflict');
    expect(plan.conflict.notes.join(' ')).toContain('does not copy source records');
  });

  it('keeps LDAP data import separate from auth federation.', (): void => {
    const ldapManifest: PortableConnectorManifest = {
      ...manifest,
      id: 'enterprise.staff.ldap',
      source: {
        kind: 'ldap',
        sourceRef: 'urn:databox:source:staff-ldap',
      },
      mapping: {
        language: 'rml',
        contentType: 'text/turtle',
        turtle: `
@prefix rml: <http://semweb.mmlab.be/ns/rml#> .

<#TriplesMap>
  rml:logicalSource [ rml:source <urn:databox:source:staff-ldap> ] .
`,
      },
    };
    const plan = planConnectorRuntimeJob(ldapManifest, {
      ...importJob,
      connectorId: 'enterprise.staff.ldap',
    }, {
      connectorId: 'enterprise.staff.ldap',
      engineId: 'rust-ldap-sidecar',
      implementation: 'rust-sidecar',
      secretRefs: [ 'vault://databox/staff-ldap-bind' ],
    });

    expect(plan.authBoundary).toEqual({
      boundary: 'not-auth-federation',
      sourceRole: 'directory-data-source',
      authFederationBridge: 'separate-oidc-or-saml-component',
      notes: [
        'LDAP/AD connector jobs import directory facts through the mapper.',
        'Login federation is not performed by the mapper or connector runtime job.',
      ],
    });
  });

  it('rejects LDAP connector manifests that try to claim auth federation behavior.', (): void => {
    expect((): unknown => planConnectorRuntimeJob({
      ...manifest,
      id: 'enterprise.staff.ldap',
      source: {
        kind: 'ldap',
        sourceRef: 'urn:databox:source:staff-ldap',
      },
      capabilities: [ 'oidc-auth-federation' ],
    }, {
      ...importJob,
      connectorId: 'enterprise.staff.ldap',
    }, {
      connectorId: 'enterprise.staff.ldap',
      engineId: 'rust-ldap-sidecar',
      implementation: 'rust-sidecar',
      secretRefs: [ 'vault://databox/staff-ldap-bind' ],
    })).toThrow('auth federation is a separate OIDC/SAML bridge');
  });

  it('rejects runtime descriptors that do not belong to the manifest.', (): void => {
    expect((): unknown => planConnectorRuntimeJob(manifest, importJob, {
      ...runtime,
      connectorId: 'other.connector',
    })).toThrow('not enterprise.staff.odbc');
  });
});
