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
    const reasonCodes = await import('../../../../src/databox/authorization/AuthorizationReasonCodes');
    const engine = await import('../../../../src/databox/authorization/ComposedAuthorizationEngine');
    const permissionReader = await import('../../../../src/databox/authorization/ComposedDataboxPermissionReader');
    const stepUp = await import('../../../../src/databox/authorization/SafeStepUpResponse');

    // Assert on binding identity rather than mere definedness: a `toBeDefined` check on a statically
    // typed namespace import can never fail, so it would only restate what compilation already proved.
    expect(module.ComposedDataboxPermissionReader).toBe(permissionReader.ComposedDataboxPermissionReader);
    expect(module.evaluateDataboxAuthorization).toBe(engine.evaluateDataboxAuthorization);
    expect(module.toSafeAuthorizationError).toBe(stepUp.toSafeAuthorizationError);
    expect(module.DATABOX_DENIAL_CODES).toBe(reasonCodes.DATABOX_DENIAL_CODES);
    expect(module.STEP_UP_ERROR_CODE).toBe(stepUp.STEP_UP_ERROR_CODE);
  });
});
