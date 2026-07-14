import { DenyAllDataboxPermissionReader } from '../../../../src/databox/authorization/DataboxAuthorizer';

describe('DenyAllDataboxPermissionReader (retained fail-closed stub)', (): void => {
  it('grants nothing (empty map) and declares narrow-never-broaden.', async(): Promise<void> => {
    const reader = new DenyAllDataboxPermissionReader();
    const result = await reader.handle();
    expect(result.size).toBe(0);
    expect(reader.narrowNeverBroaden).toBe(true);
  });

  it('re-exports the DBX-14 composed-authorizer symbols through the barrel path.', async(): Promise<void> => {
    const module = await import('../../../../src/databox/authorization/DataboxAuthorizer');
    expect(module.ComposedDataboxPermissionReader).toBeDefined();
    expect(module.evaluateDataboxAuthorization).toBeDefined();
    expect(module.toSafeAuthorizationError).toBeDefined();
    expect(module.DATABOX_DENIAL_CODES).toBeDefined();
    expect(module.STEP_UP_ERROR_CODE).toBeDefined();
  });
});
