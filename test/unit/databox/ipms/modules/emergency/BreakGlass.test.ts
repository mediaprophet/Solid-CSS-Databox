import { evaluateBreakGlass } from '../../../../../../src/databox/ipms/modules/emergency/BreakGlass';

describe('evaluateBreakGlass', (): void => {
  const policy = { resource: 'https://example.org/patient/123', emergencyRoles: [ 'onCallNurse', 'attendingPhysician' ]};

  it('permits access when the emergency is declared and the role is authorized.', (): void => {
    const request = {
      requesterRole: 'onCallNurse',
      declaredEmergency: true,
      requestedAt: '2026-07-19',
      reason: 'Patient is unresponsive and primary clinician is unreachable.',
    };

    const result = evaluateBreakGlass(policy, request);

    expect(result.permitted).toBe(true);
    expect(result.reason).toBe('Permitted: declared emergency by an authorized emergency role.');
    expect(result.audit).toEqual({
      resource: 'https://example.org/patient/123',
      requesterRole: 'onCallNurse',
      declaredEmergency: true,
      requestedAt: '2026-07-19',
      reason: 'Patient is unresponsive and primary clinician is unreachable.',
      permitted: true,
    });
  });

  it('denies access when the emergency is not declared.', (): void => {
    const request = {
      requesterRole: 'onCallNurse',
      declaredEmergency: false,
      requestedAt: '2026-07-19',
      reason: 'Routine check.',
    };

    const result = evaluateBreakGlass(policy, request);

    expect(result.permitted).toBe(false);
    expect(result.reason).toBe('Denied: the request did not declare an emergency.');
    expect(result.audit).toEqual({
      resource: 'https://example.org/patient/123',
      requesterRole: 'onCallNurse',
      declaredEmergency: false,
      requestedAt: '2026-07-19',
      reason: 'Routine check.',
      permitted: false,
    });
  });

  it('denies access when the role is not an authorized emergency role.', (): void => {
    const request = {
      requesterRole: 'receptionist',
      declaredEmergency: true,
      requestedAt: '2026-07-19',
      reason: 'Trying to help out.',
    };

    const result = evaluateBreakGlass(policy, request);

    expect(result.permitted).toBe(false);
    expect(result.reason).toBe(
      'Denied: role \'receptionist\' is not an authorized emergency role for this resource.',
    );
    expect(result.audit).toEqual({
      resource: 'https://example.org/patient/123',
      requesterRole: 'receptionist',
      declaredEmergency: true,
      requestedAt: '2026-07-19',
      reason: 'Trying to help out.',
      permitted: false,
    });
  });

  it('throws a BadRequestHttpError when the reason is empty.', (): void => {
    const request = {
      requesterRole: 'onCallNurse',
      declaredEmergency: true,
      requestedAt: '2026-07-19',
      reason: '   ',
    };

    expect((): void => {
      evaluateBreakGlass(policy, request);
    }).toThrow('A break-glass access request must state a reason.');
  });
});
