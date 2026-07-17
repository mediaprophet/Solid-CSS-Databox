import * as DataboxExports from '../../../src/databox';
import { NotImplementedContextExtractor } from '../../../src/databox/context/AuthenticatedContextExtractor';
import { DenyAllDataboxPermissionReader } from '../../../src/databox/authorization/DataboxAuthorizer';
import { NotImplementedEvidenceLedger } from '../../../src/databox/evidence/Evidence';
import { NotImplementedCursorFeed } from '../../../src/databox/feed/CursorFeed';
import { NotImplementedOpaqueIdentifierGenerator } from '../../../src/databox/identifiers/OpaqueIdentifierGenerator';
import { DBX_DUTIES, DBX_PROFILE_V1 } from '../../../src/databox/odrl/terms';
import {
  loadInstitutionProfile,
  validateInstitutionProfile,
} from '../../../src/databox/profile/InstitutionProfileValidator';
import { AppendOnlyStore } from '../../../src/databox/storage/AppendOnlyStore';
import { NotImplementedTenantResolver } from '../../../src/databox/tenant/TenantResolver';
import { NotImplementedHttpError } from '../../../src/util/errors/NotImplementedHttpError';

// Every Databox placeholder must FAIL CLOSED: it either refuses (throws) or grants nothing.
// None may silently permit access or fabricate a success (DBX-09 acceptance gate).
describe('Databox fail-closed stubs', (): void => {
  it('the tenant resolver (C5) refuses to resolve a default tenant.', async(): Promise<void> => {
    await expect(new NotImplementedTenantResolver().handle()).rejects.toThrow(NotImplementedHttpError);
  });

  it('the authenticated-context extractor (C3) refuses to fabricate a context.', async(): Promise<void> => {
    await expect(new NotImplementedContextExtractor().handle()).rejects.toThrow(NotImplementedHttpError);
  });

  it('the evidence ledger (C13) refuses to append.', async(): Promise<void> => {
    await expect(new NotImplementedEvidenceLedger().append({
      tenantId: 't',
      kind: 'deposit-accepted',
      committedAt: '2026-07-14T00:00:00Z',
      digest: 'd',
    })).rejects.toThrow(NotImplementedHttpError);
  });

  it('the cursor feed (C15) refuses to return an (empty) page that would mask a gap.', async(): Promise<void> => {
    await expect(new NotImplementedCursorFeed().pull('t')).rejects.toThrow(NotImplementedHttpError);
  });

  it('the opaque identifier generator (C10) refuses to mint a guessable identifier.', (): void => {
    const generator = new NotImplementedOpaqueIdentifierGenerator();
    expect(generator.opaque).toBe(true);
    expect((): unknown => generator.generate('name')).toThrow(NotImplementedHttpError);
    // The reverse (identifier -> pod) resolution also fails closed rather than guessing.
    expect((): unknown => generator.extractPod({ path: 'https://databox.example/boxes/bx_x/' }))
      .toThrow(NotImplementedHttpError);
  });

  it('the package barrel re-exports the scaffolded seams and Wave-B artifacts.', (): void => {
    // Asserting identity, not just definedness: the barrel is a stack of `export *` lines, so a name
    // collision could bind these to a different module's symbol without tsc or a definedness check noticing.
    expect(DataboxExports.AppendOnlyStore).toBe(AppendOnlyStore);
    expect(DataboxExports.NotImplementedOpaqueIdentifierGenerator).toBe(NotImplementedOpaqueIdentifierGenerator);
    expect(DataboxExports.DenyAllDataboxPermissionReader).toBe(DenyAllDataboxPermissionReader);
    // DBX-06 institution profile schema
    expect(DataboxExports.validateInstitutionProfile).toBe(validateInstitutionProfile);
    expect(DataboxExports.loadInstitutionProfile).toBe(loadInstitutionProfile);
    // DBX-07 ODRL vocabulary & profile
    expect(DataboxExports.DBX_PROFILE_V1).toBe(DBX_PROFILE_V1);
    expect(DataboxExports.DBX_DUTIES).toBe(DBX_DUTIES);
  });

  it('the composed authorizer (C4) grants nothing (empty map, narrow-never-broaden).', async(): Promise<void> => {
    const reader = new DenyAllDataboxPermissionReader();
    const result = await reader.handle();
    expect(result.size).toBe(0);
    expect(reader.narrowNeverBroaden).toBe(true);
  });
});
