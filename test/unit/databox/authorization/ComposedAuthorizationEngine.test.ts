import { AccessMode } from '../../../../src/authorization/permissions/Permissions';
import { DATABOX_DENIAL_CODES } from '../../../../src/databox/authorization/AuthorizationReasonCodes';
import { evaluateDataboxAuthorization } from '../../../../src/databox/authorization/ComposedAuthorizationEngine';
import type {
  DataboxAuthorizationInput,
  OdrlPreconditionDecision,
} from '../../../../src/databox/authorization/DataboxAuthorizationInput';
import type {
  AssuranceDimensionLevels,
  DataboxRequestContext,
} from '../../../../src/databox/context/DataboxRequestContext';
import type { TenantContext } from '../../../../src/databox/tenant/TenantContext';

const BOX_ROOT = 'https://databox.example/boxes/box-a/';
const AUDIENCE = 'https://databox.example/aud/prog-a';

function dims(level: number): AssuranceDimensionLevels {
  return {
    identityProofing: level,
    authenticatorStrength: level,
    federationTrust: level,
    authenticationFreshness: level,
    stepUpState: level,
    delegationEvidence: level,
  };
}

function tenant(overrides: Partial<TenantContext> = {}): TenantContext {
  return {
    tenantId: 'org-a/prog-a',
    organisation: 'org-a',
    program: 'prog-a',
    boxId: 'box-a',
    boxRoot: BOX_ROOT,
    relationshipId: 'rel-a',
    audience: AUDIENCE,
    ...overrides,
  };
}

function context(overrides: Partial<DataboxRequestContext> = {}): DataboxRequestContext {
  return {
    webId: 'https://vault.example/a#me',
    audience: AUDIENCE,
    assurance: { grade: 'g', dimensions: dims(3) },
    ...overrides,
  };
}

function baseInput(overrides: Partial<DataboxAuthorizationInput> = {}): DataboxAuthorizationInput {
  return {
    tenant: tenant(),
    context: context(),
    relationship: { active: true, credentialRevoked: false },
    requiredAssurance: [{ dimension: 'identityProofing', minLevel: 2 }],
    immutable: { mutatesAcceptedResource: false },
    odrl: { outcome: 'permitted' },
    existenceVisibility: 'visible',
    requestedModes: new Set([ AccessMode.read ]),
    resourcePath: `${BOX_ROOT}records/r1`,
    ...overrides,
  };
}

describe('evaluateDataboxAuthorization (composed conjunction)', (): void => {
  it('allows when every conjunct is satisfied and subtracts nothing.', (): void => {
    const decision = evaluateDataboxAuthorization(baseInput());
    expect(decision.allowed).toBe(true);
    expect(decision.deniedModes).toEqual([]);
    expect(decision.code).toBeUndefined();
  });

  describe('fails closed on any missing policy input', (): void => {
    it('denies when the tenant is absent.', (): void => {
      const decision = evaluateDataboxAuthorization(baseInput({ tenant: undefined }));
      expect(decision.allowed).toBe(false);
      expect(decision.code).toBe(DATABOX_DENIAL_CODES.missingInput);
      expect(decision.deniedModes).toEqual([ AccessMode.read ]);
    });

    it('denies when the context is absent.', (): void => {
      const decision = evaluateDataboxAuthorization(baseInput({ context: undefined }));
      expect(decision.code).toBe(DATABOX_DENIAL_CODES.missingInput);
    });

    it('denies when the relationship snapshot is absent.', (): void => {
      const decision = evaluateDataboxAuthorization(baseInput({ relationship: undefined }));
      expect(decision.code).toBe(DATABOX_DENIAL_CODES.missingInput);
    });

    it('denies when the immutability classification is absent.', (): void => {
      const decision = evaluateDataboxAuthorization(baseInput({ immutable: undefined }));
      expect(decision.code).toBe(DATABOX_DENIAL_CODES.missingInput);
    });

    it('denies when the ODRL decision is absent.', (): void => {
      const decision = evaluateDataboxAuthorization(baseInput({ odrl: undefined }));
      expect(decision.code).toBe(DATABOX_DENIAL_CODES.missingInput);
    });
  });

  // Round-2 hardening (H1/M1/L1): a wrapper must be validated for SHAPE, not mere presence — a
  // half-populated object must NOT pass and be trusted downstream.
  describe('fails closed on MALFORMED policy input (not just absent)', (): void => {
    it('denies a tenant object with no boxRoot string.', (): void => {
      const decision = evaluateDataboxAuthorization(baseInput({
        tenant: {} as unknown as DataboxAuthorizationInput['tenant'],
      }));
      expect(decision.code).toBe(DATABOX_DENIAL_CODES.missingInput);
    });

    it('denies a relationship with a non-boolean active (half-populated).', (): void => {
      const decision = evaluateDataboxAuthorization(baseInput({
        relationship: { credentialRevoked: false } as unknown as DataboxAuthorizationInput['relationship'],
      }));
      expect(decision.code).toBe(DATABOX_DENIAL_CODES.missingInput);
    });

    it('denies a relationship missing credentialRevoked (revoked must not be trusted absent).', (): void => {
      const decision = evaluateDataboxAuthorization(baseInput({
        relationship: { active: true } as unknown as DataboxAuthorizationInput['relationship'],
      }));
      expect(decision.code).toBe(DATABOX_DENIAL_CODES.missingInput);
    });

    it('denies an empty immutable object (mutatesAcceptedResource undefined must not skip append-only).', (): void => {
      const decision = evaluateDataboxAuthorization(baseInput({
        immutable: {} as unknown as DataboxAuthorizationInput['immutable'],
      }));
      expect(decision.code).toBe(DATABOX_DENIAL_CODES.missingInput);
    });

    it('denies an empty ODRL object (missing outcome must not silently permit).', (): void => {
      const decision = evaluateDataboxAuthorization(baseInput({ odrl: {} as unknown as OdrlPreconditionDecision }));
      expect(decision.code).toBe(DATABOX_DENIAL_CODES.missingInput);
    });

    it('denies a non-array requiredAssurance instead of throwing (L1).', (): void => {
      const decision = evaluateDataboxAuthorization(baseInput({
        requiredAssurance: undefined as unknown as DataboxAuthorizationInput['requiredAssurance'],
      }));
      expect(decision.code).toBe(DATABOX_DENIAL_CODES.missingInput);
    });
  });

  describe('tenant binding', (): void => {
    it('denies a target outside the resolved tenant box root.', (): void => {
      const decision = evaluateDataboxAuthorization(baseInput({ resourcePath: 'https://databox.example/boxes/box-b/records/r1' }));
      expect(decision.conjunct).toBe('tenant');
      expect(decision.code).toBe(DATABOX_DENIAL_CODES.tenantMismatch);
    });
  });

  describe('token audience == tenant (DBX-11 hard conjunct)', (): void => {
    it('denies when the context carries no audience.', (): void => {
      const decision = evaluateDataboxAuthorization(baseInput({ context: context({ audience: undefined }) }));
      expect(decision.code).toBe(DATABOX_DENIAL_CODES.tokenAudienceMismatch);
    });

    it('denies when the tenant carries no audience.', (): void => {
      const decision = evaluateDataboxAuthorization(baseInput({ tenant: tenant({ audience: undefined }) }));
      expect(decision.code).toBe(DATABOX_DENIAL_CODES.tokenAudienceMismatch);
    });

    it('denies when the audiences differ.', (): void => {
      const decision = evaluateDataboxAuthorization(baseInput({ context: context({ audience: 'https://evil.example/aud' }) }));
      expect(decision.conjunct).toBe('token-audience');
      expect(decision.code).toBe(DATABOX_DENIAL_CODES.tokenAudienceMismatch);
    });
  });

  describe('relationship + credential status (DBX-13)', (): void => {
    it('denies an inactive relationship.', (): void => {
      const decision = evaluateDataboxAuthorization(baseInput({
        relationship: { active: false, credentialRevoked: false },
      }));
      expect(decision.code).toBe(DATABOX_DENIAL_CODES.relationshipInactive);
    });

    it('denies a revoked credential.', (): void => {
      const decision = evaluateDataboxAuthorization(baseInput({
        relationship: { active: true, credentialRevoked: true },
      }));
      expect(decision.code).toBe(DATABOX_DENIAL_CODES.credentialRevoked);
    });
  });

  describe('assurance (ADR-0010)', (): void => {
    it('denies and issues a step-up naming the failing dimension.', (): void => {
      const decision = evaluateDataboxAuthorization(baseInput({
        requiredAssurance: [{ dimension: 'authenticatorStrength', minLevel: 4 }],
        context: context({ assurance: { grade: 'g', dimensions: dims(1) }}),
      }));
      expect(decision.code).toBe(DATABOX_DENIAL_CODES.assuranceInsufficient);
      expect(decision.stepUp).toEqual({ dimension: 'authenticatorStrength', requiredLevel: 4, currentLevel: 1 });
    });

    it('treats an absent assurance context as level 0 (fail closed).', (): void => {
      const decision = evaluateDataboxAuthorization(baseInput({
        requiredAssurance: [{ dimension: 'identityProofing', minLevel: 1 }],
        context: context({ assurance: undefined }),
      }));
      expect(decision.code).toBe(DATABOX_DENIAL_CODES.assuranceInsufficient);
      expect(decision.stepUp?.currentLevel).toBe(0);
    });

    it('allows when every required dimension meets its minimum.', (): void => {
      const decision = evaluateDataboxAuthorization(baseInput({
        requiredAssurance: [
          { dimension: 'identityProofing', minLevel: 3 },
          { dimension: 'federationTrust', minLevel: 3 },
        ],
      }));
      expect(decision.allowed).toBe(true);
    });
  });

  describe('delegation (T-47)', (): void => {
    it('fails closed on a delegation claim with no validated grant.', (): void => {
      const decision = evaluateDataboxAuthorization(baseInput({
        context: context({ delegation: { onBehalfOf: 'https://vault.example/b#me', grantRef: 'grant-1' }}),
        delegation: undefined,
      }));
      expect(decision.conjunct).toBe('delegation');
      expect(decision.code).toBe(DATABOX_DENIAL_CODES.missingInput);
    });

    it('denies an invalid delegation grant.', (): void => {
      const decision = evaluateDataboxAuthorization(baseInput({
        context: context({ delegation: { onBehalfOf: 'https://vault.example/b#me', grantRef: 'grant-1' }}),
        delegation: { valid: false },
      }));
      expect(decision.code).toBe(DATABOX_DENIAL_CODES.delegationInvalid);
    });

    it('allows a valid delegation grant.', (): void => {
      const decision = evaluateDataboxAuthorization(baseInput({
        context: context({ delegation: { onBehalfOf: 'https://vault.example/b#me', grantRef: 'grant-1' }}),
        delegation: { valid: true },
      }));
      expect(decision.allowed).toBe(true);
    });
  });

  describe('ODRL precondition (ADR-0013)', (): void => {
    it('denies an ODRL prohibition (prohibition beats a broad permission).', (): void => {
      const decision = evaluateDataboxAuthorization(baseInput({ odrl: { outcome: 'prohibited' }}));
      expect(decision.conjunct).toBe('odrl');
      expect(decision.code).toBe(DATABOX_DENIAL_CODES.odrlProhibited);
    });

    it('fails closed on an unsupported/ambiguous ODRL term.', (): void => {
      const decision = evaluateDataboxAuthorization(baseInput({ odrl: { outcome: 'fail-closed' }}));
      expect(decision.code).toBe(DATABOX_DENIAL_CODES.odrlUnsupported);
    });

    it('fails closed (allow-list) on an unrecognised/typo/future ODRL outcome (H1).', (): void => {
      const decision = evaluateDataboxAuthorization(baseInput({
        odrl: { outcome: 'allow' } as unknown as OdrlPreconditionDecision,
      }));
      expect(decision.conjunct).toBe('odrl');
      expect(decision.code).toBe(DATABOX_DENIAL_CODES.odrlUnsupported);
    });
  });

  describe('append-only / immutable operation (ADR-0018)', (): void => {
    it('denies only the mutating modes of a replace/delete on an accepted resource.', (): void => {
      const decision = evaluateDataboxAuthorization(baseInput({
        immutable: { mutatesAcceptedResource: true },
        requestedModes: new Set([ AccessMode.read, AccessMode.write, AccessMode.delete ]),
      }));
      expect(decision.code).toBe(DATABOX_DENIAL_CODES.immutableOperation);
      expect([ ...decision.deniedModes ].sort()).toEqual([ AccessMode.delete, AccessMode.write ].sort());
      expect(decision.deniedModes).not.toContain(AccessMode.read);
    });

    it('does not deny a read of an accepted resource (append-only leaves read intact).', (): void => {
      const decision = evaluateDataboxAuthorization(baseInput({
        immutable: { mutatesAcceptedResource: true },
        requestedModes: new Set([ AccessMode.read ]),
      }));
      expect(decision.allowed).toBe(true);
      expect(decision.deniedModes).toEqual([]);
    });
  });

  describe('deterministic precedence', (): void => {
    it('returns the tenant denial before a later assurance failure.', (): void => {
      const decision = evaluateDataboxAuthorization(baseInput({
        resourcePath: 'https://databox.example/boxes/box-b/records/r1',
        context: context({ assurance: { grade: 'g', dimensions: dims(0) }}),
        requiredAssurance: [{ dimension: 'identityProofing', minLevel: 5 }],
      }));
      expect(decision.conjunct).toBe('tenant');
    });
  });
});
