import type {
  ConnectorRuntimeDescriptor,
  PortableConnectorJob,
  PortableConnectorManifest,
} from '../../../../../../src/databox/cms/modules/integration/ConnectorContract';
import {
  parseConnectorJobRdf,
  parseConnectorManifestRdf,
  serializeConnectorJobToTurtle,
  serializeConnectorManifestToTurtle,
  toConnectorRuntimeWorkDescriptor,
  validateConnectorRuntimeDescriptor,
  validatePortableConnectorJob,
  validatePortableConnectorManifest,
} from '../../../../../../src/databox/cms/modules/integration/ConnectorContract';

const mappingTurtle = `
@prefix rr: <http://www.w3.org/ns/r2rml#> .
@prefix schema: <https://schema.org/> .

<#TriplesMap>
  rr:logicalTable [ rr:tableName "people" ];
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
  description: 'Maps the legacy staff database into directory relationship resources.',
  source: {
    kind: 'odbc',
    sourceRef: 'urn:databox:source:hr-db',
    label: 'HR database',
  },
  modes: [ 'import-snapshot', 'source-to-pod-sync', 'virtual-federated-query' ],
  mapping: {
    language: 'r2rml',
    contentType: 'text/turtle',
    turtle: mappingTurtle,
  },
  target: {
    podBaseIri: 'https://pods.example/',
    resourceContainer: 'https://pods.example/.databox/cms/directory/',
  },
};

const job: PortableConnectorJob = {
  id: 'staff-import-2026-07-19',
  connectorId: 'enterprise.staff.odbc',
  mode: 'import-snapshot',
  createdAt: '2026-07-19T00:00:00.000Z',
  conflictPolicy: 'append-only',
  dryRun: true,
};

describe('Connector contract', (): void => {
  it('validates the portable manifest modes and R2RML mapping work.', (): void => {
    expect(validatePortableConnectorManifest(manifest)).toEqual(manifest);
  });

  it('also accepts LDAP imports expressed as RML mapping works.', (): void => {
    expect(validatePortableConnectorManifest({
      ...manifest,
      id: 'enterprise.staff.ldap',
      source: {
        kind: 'ldap',
        sourceRef: 'urn:databox:source:staff-directory',
      },
      modes: [ 'import-snapshot', 'source-to-pod-sync' ],
      mapping: {
        language: 'rml',
        contentType: 'text/turtle',
        turtle: `
@prefix rml: <http://semweb.mmlab.be/ns/rml#> .

<#TriplesMap>
  rml:logicalSource [ rml:source <urn:databox:source:staff-directory> ] .
`,
      },
    }).source.kind).toBe('ldap');
  });

  it('round-trips connector manifests and jobs as ordinary Turtle descriptors.', async(): Promise<void> => {
    const manifestTurtle = await serializeConnectorManifestToTurtle(manifest, {
      subjectIri: 'https://pods.example/.well-known/databox-cms/connectors/staff.ttl#connector',
    });
    const jobTurtle = await serializeConnectorJobToTurtle(job, {
      subjectIri: 'https://pods.example/.well-known/databox-cms/connector-jobs/staff.ttl#job',
    });

    expect(manifestTurtle).toContain('cms:ConnectorManifest');
    expect(manifestTurtle).toContain('http://www.w3.org/ns/r2rml#');
    expect(parseConnectorManifestRdf(manifestTurtle, {
      subjectIri: 'https://pods.example/.well-known/databox-cms/connectors/staff.ttl#connector',
    })).toEqual(manifest);
    expect(parseConnectorJobRdf(jobTurtle, {
      subjectIri: 'https://pods.example/.well-known/databox-cms/connector-jobs/staff.ttl#job',
    })).toEqual(job);
  });

  it('rejects connector jobs that ask for a mode the manifest does not support.', (): void => {
    expect((): unknown => validatePortableConnectorJob({
      ...job,
      mode: 'virtual-federated-query',
    }, {
      ...manifest,
      modes: [ 'import-snapshot' ],
    })).toThrow('unsupported mode virtual-federated-query');
  });

  it('rejects inline secrets and connection strings from portable works.', (): void => {
    expect((): unknown => validatePortableConnectorManifest({
      ...manifest,
      connectionString: 'Driver=Postgres;Password=open-sesame',
    } as unknown as PortableConnectorManifest)).toThrow('connectionString');

    expect((): unknown => validatePortableConnectorManifest({
      ...manifest,
      mapping: {
        ...manifest.mapping,
        turtle: `${mappingTurtle}\n<#Source> <urn:x> "Password=open-sesame" .`,
      },
    })).toThrow('must not contain inline secrets or connection strings');
  });

  it('keeps runtime engines replaceable and non-portable.', (): void => {
    const rustSidecar: ConnectorRuntimeDescriptor = {
      connectorId: manifest.id,
      engineId: 'rust-odbc-sidecar',
      implementation: 'rust-sidecar',
      version: '0.1.0',
      secretRefs: [ 'vault://databox/hr-db' ],
      runtimeHints: {
        concurrency: '4',
      },
    };
    const managedAdapter: ConnectorRuntimeDescriptor = {
      connectorId: manifest.id,
      engineId: 'managed-enterprise-adapter',
      implementation: 'managed-adapter',
      secretRefs: [ 'solid-secret://connector/hr-db' ],
    };

    expect(validatePortableConnectorManifest(manifest).mapping.turtle).toContain('rr:logicalTable');
    expect(toConnectorRuntimeWorkDescriptor(rustSidecar)).toEqual({
      kind: 'connector-runtime-descriptor',
      connectorId: manifest.id,
      portability: 'non-portable',
      engineId: 'rust-odbc-sidecar',
      implementation: 'rust-sidecar',
      secretRefCount: 1,
      runtimeHintKeys: [ 'concurrency' ],
    });
    expect(toConnectorRuntimeWorkDescriptor(managedAdapter)).toMatchObject({
      portability: 'non-portable',
      engineId: 'managed-enterprise-adapter',
      implementation: 'managed-adapter',
      secretRefCount: 1,
    });
  });

  it('allows secret references in runtime descriptors but rejects inline runtime secrets.', (): void => {
    expect(validateConnectorRuntimeDescriptor({
      connectorId: manifest.id,
      engineId: 'rust-ldap-sidecar',
      implementation: 'rust-sidecar',
      secretRefs: [ 'vault://databox/ldap-bind' ],
    }).secretRefs).toEqual([ 'vault://databox/ldap-bind' ]);

    expect((): unknown => validateConnectorRuntimeDescriptor({
      connectorId: manifest.id,
      engineId: 'rust-ldap-sidecar',
      implementation: 'rust-sidecar',
      secretRefs: [],
      runtimeHints: {
        password: 'open-sesame',
      },
    })).toThrow('must not inline secrets');
  });
});
