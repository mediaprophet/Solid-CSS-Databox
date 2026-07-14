import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { INSTITUTION_PROFILE_SCHEMA_VERSION } from '../../../../src/databox/profile/InstitutionProfile';
import { INSTITUTION_PROFILE_JSON_SCHEMA } from '../../../../src/databox/profile/InstitutionProfileSchema';
import {
  loadInstitutionProfile,
  validateInstitutionProfile,
} from '../../../../src/databox/profile/InstitutionProfileValidator';
import { BadRequestHttpError } from '../../../../src/util/errors/BadRequestHttpError';

const fixtures = join(__dirname, 'fixtures');
const validRaw = readFileSync(join(fixtures, 'valid-institution-profile.json'), 'utf8');
const invalidRaw = readFileSync(join(fixtures, 'invalid-institution-profile.json'), 'utf8');

// Fresh deep clone per call so mutations never leak between tests.
function valid(): any {
  return JSON.parse(validRaw);
}
function invalid(): any {
  return JSON.parse(invalidRaw);
}
function mutate(fn: (profile: any) => void): any {
  const profile = valid();
  fn(profile);
  return profile;
}
function codesOf(result: any): string[] {
  return result.errors.map((issue: any): string => issue.code);
}
function warnCodesOf(result: any): string[] {
  return result.warnings.map((issue: any): string => issue.code);
}

describe('An InstitutionProfileValidator', (): void => {
  describe('accepting the canonical VALID profile', (): void => {
    it('validates the complete valid synthetic profile with no errors or warnings.', (): void => {
      const result = validateInstitutionProfile(valid());
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.warnings).toHaveLength(0);
      expect(result.profile).toBeDefined();
    });

    it('loads the valid profile into a typed value.', (): void => {
      const profile = loadInstitutionProfile(valid());
      expect(profile.profileId).toBe('prog-woolworths-loyalty');
      expect(profile.schemaVersion).toBe(INSTITUTION_PROFILE_SCHEMA_VERSION);
    });

    it('accepts an authorized-retroactive policy when retroactiveAuthorized is true.', (): void => {
      const result = validateInstitutionProfile(mutate((profile): void => {
        profile.policies.effectiveTimeBehavior = 'authorized-retroactive';
        profile.policies.retroactiveAuthorized = true;
      }));
      expect(result.valid).toBe(true);
    });

    it('accepts at-rest encryption switched off entirely (no per-tenant-key requirement).', (): void => {
      const result = validateInstitutionProfile(mutate((profile): void => {
        profile.crypto.atRestEncryption = { required: false, perTenantKeys: false };
      }));
      expect(result.valid).toBe(true);
    });

    it('accepts a compiled policy that omits the optional legalComplianceClaimed flag.', (): void => {
      const result = validateInstitutionProfile(mutate((profile): void => {
        delete profile.compiledPolicy.legalComplianceClaimed;
      }));
      expect(result.valid).toBe(true);
    });

    it('accepts a profile with no effectiveUntil.', (): void => {
      const result = validateInstitutionProfile(mutate((profile): void => {
        delete profile.effectiveInterval.effectiveUntil;
      }));
      expect(result.valid).toBe(true);
    });

    it('accepts a broker that is not adopted, with or without a broker origin.', (): void => {
      const withOrigin = validateInstitutionProfile(mutate((profile): void => {
        profile.tokenBroker = { adopted: false, brokerOrigin: 'https://broker.example/' };
      }));
      const withoutOrigin = validateInstitutionProfile(mutate((profile): void => {
        profile.tokenBroker = { adopted: false };
      }));
      expect(withOrigin.valid).toBe(true);
      expect(withoutOrigin.valid).toBe(true);
    });

    it('accepts an offline-grant policy that disallows offline use, with or without a lifetime.', (): void => {
      const withLifetime = validateInstitutionProfile(mutate((profile): void => {
        profile.offlineGrantPolicy = { allowOffline: false, maxOfflineMinutes: 30 };
      }));
      const withoutLifetime = validateInstitutionProfile(mutate((profile): void => {
        profile.offlineGrantPolicy = { allowOffline: false };
      }));
      expect(withLifetime.valid).toBe(true);
      expect(withoutLifetime.valid).toBe(true);
    });
  });

  describe('rejecting the canonical INVALID profile (batched fail-closed)', (): void => {
    it('reports every seeded security violation at once.', (): void => {
      const result = validateInstitutionProfile(invalid());
      expect(result.valid).toBe(false);
      const codes = codesOf(result);
      expect(codes).toContain('unknown-field');
      expect(codes).toContain('invalid-interval');
      expect(codes).toContain('audience-not-program-bound');
      expect(codes).toContain('shared-platform-key');
      expect(codes).toContain('blocked-provider-blind');
      expect(codes).toContain('not-https');
      expect(codes).toContain('not-int');
      expect(codes).toContain('unsatisfiable-assurance');
      expect(codes).toContain('dangling-ref');
      expect(codes).toContain('unauthorized-retroactive');
      expect(codes).toContain('unattested-policy');
      expect(codes).toContain('blocked-compliance-claim');
      expect(codes).toContain('corpus-digest-mismatch');
      expect(codes).toContain('destructive-retention');
    });

    it('warns that path-only tenancy is discouraged without failing on that alone.', (): void => {
      const result = validateInstitutionProfile(invalid());
      expect(warnCodesOf(result)).toContain('discouraged-topology');
    });

    it('throws a BadRequestHttpError when loading an invalid profile (fail closed).', (): void => {
      expect((): unknown => loadInstitutionProfile(invalid())).toThrow(BadRequestHttpError);
    });
  });

  describe('rejecting a non-object root', (): void => {
    it('rejects a null input.', (): void => {
      const result = validateInstitutionProfile(null);
      expect(result.valid).toBe(false);
      expect(codesOf(result)).toContain('not-object');
    });

    it('rejects a string input.', (): void => {
      const result = validateInstitutionProfile('nope');
      expect(codesOf(result)).toContain('not-object');
    });

    it('rejects an array input.', (): void => {
      const result = validateInstitutionProfile([]);
      expect(codesOf(result)).toContain('not-object');
    });
  });

  describe('validating primitive fields', (): void => {
    it('rejects an unknown schema version but accepts an empty one as a plain string error.', (): void => {
      const wrong = validateInstitutionProfile(mutate((profile): void => {
        profile.schemaVersion = 'other/9.9.9';
      }));
      const empty = validateInstitutionProfile(mutate((profile): void => {
        profile.schemaVersion = '';
      }));
      expect(codesOf(wrong)).toContain('unknown-schema-version');
      expect(codesOf(empty)).toContain('not-string');
      expect(codesOf(empty)).not.toContain('unknown-schema-version');
    });

    it('rejects a non-string field.', (): void => {
      const result = validateInstitutionProfile(mutate((profile): void => {
        profile.profileId = 123;
      }));
      expect(codesOf(result)).toContain('not-string');
    });

    it('rejects a non-boolean field.', (): void => {
      const result = validateInstitutionProfile(mutate((profile): void => {
        profile.synthetic = 'yes';
      }));
      expect(codesOf(result)).toContain('not-boolean');
    });

    it('rejects a non-array field.', (): void => {
      const result = validateInstitutionProfile(mutate((profile): void => {
        profile.processors = 'not-an-array';
      }));
      expect(codesOf(result)).toContain('not-array');
    });

    it('rejects a non-object field.', (): void => {
      const result = validateInstitutionProfile(mutate((profile): void => {
        profile.program = 'not-an-object';
      }));
      expect(codesOf(result)).toContain('not-object');
    });

    it('rejects integers that are absent, fractional, or below the minimum.', (): void => {
      const absent = validateInstitutionProfile(mutate((profile): void => {
        profile.retention[0].retentionDays = 'x';
      }));
      const fractional = validateInstitutionProfile(mutate((profile): void => {
        profile.retention[0].retentionDays = 1.5;
      }));
      const belowMin = validateInstitutionProfile(mutate((profile): void => {
        profile.retention[0].retentionDays = 0;
      }));
      expect(codesOf(absent)).toContain('not-int');
      expect(codesOf(fractional)).toContain('not-int');
      expect(codesOf(belowMin)).toContain('not-int');
    });

    it('rejects an enum given a non-string and given an unknown string.', (): void => {
      const nonString = validateInstitutionProfile(mutate((profile): void => {
        profile.tenancy.deploymentModel = 5;
      }));
      const unknown = validateInstitutionProfile(mutate((profile): void => {
        profile.tenancy.deploymentModel = 'weird';
      }));
      expect(codesOf(nonString)).toContain('not-in-enum');
      expect(codesOf(unknown)).toContain('not-in-enum');
    });

    it('rejects unknown fields at the top level (fail closed).', (): void => {
      const result = validateInstitutionProfile(mutate((profile): void => {
        profile.somethingExtra = true;
      }));
      expect(codesOf(result)).toContain('unknown-field');
    });
  });

  describe('validating tenancy origin and audience', (): void => {
    it('rejects an origin that is not a parseable URL.', (): void => {
      const result = validateInstitutionProfile(mutate((profile): void => {
        profile.tenancy.origin = 'not a url';
      }));
      expect(codesOf(result)).toContain('not-https');
    });

    it('rejects an http origin.', (): void => {
      const result = validateInstitutionProfile(mutate((profile): void => {
        profile.tenancy.origin = 'http://databox.woolworths.example/';
      }));
      expect(codesOf(result)).toContain('not-https');
    });

    it('rejects an http audience while the origin stays valid.', (): void => {
      const result = validateInstitutionProfile(mutate((profile): void => {
        profile.tenancy.tokenAudience = 'http://databox.woolworths.example/';
      }));
      expect(codesOf(result)).toContain('not-https');
      expect(codesOf(result)).not.toContain('audience-not-program-bound');
    });

    it('rejects an audience whose host is not the program origin host.', (): void => {
      const result = validateInstitutionProfile(mutate((profile): void => {
        profile.tenancy.tokenAudience = 'https://elsewhere.example/';
      }));
      expect(codesOf(result)).toContain('audience-not-program-bound');
    });
  });

  describe('validating cryptography and encryption boundaries', (): void => {
    it('rejects at-rest encryption required without per-tenant keys.', (): void => {
      const result = validateInstitutionProfile(mutate((profile): void => {
        profile.crypto.atRestEncryption = { required: true, perTenantKeys: false };
      }));
      expect(codesOf(result)).toContain('shared-platform-key');
    });

    it('rejects the Blocked provider-blind encryption mode.', (): void => {
      const result = validateInstitutionProfile(mutate((profile): void => {
        profile.crypto.applicationLevelEncryption = 'required-provider-blind';
      }));
      expect(codesOf(result)).toContain('blocked-provider-blind');
    });
  });

  describe('validating identity providers and assurance', (): void => {
    it('rejects an empty issuer URL as a string error, not an https error.', (): void => {
      const result = validateInstitutionProfile(mutate((profile): void => {
        profile.identityProviders[0].issuer = '';
      }));
      expect(codesOf(result)).toContain('not-string');
      expect(codesOf(result)).not.toContain('not-https');
    });

    it('rejects an http issuer URL.', (): void => {
      const result = validateInstitutionProfile(mutate((profile): void => {
        profile.identityProviders[0].issuer = 'http://idp.example/';
      }));
      expect(codesOf(result)).toContain('not-https');
    });

    it('rejects an assurance mapping on an unknown dimension.', (): void => {
      const result = validateInstitutionProfile(mutate((profile): void => {
        profile.assuranceMappings[0].dimension = 'bogusDimension';
      }));
      expect(result.valid).toBe(false);
      expect(codesOf(result)).toContain('not-in-enum');
    });

    it('rejects a record class requiring more assurance than any mapping provides.', (): void => {
      const result = validateInstitutionProfile(mutate((profile): void => {
        profile.recordClasses[0].minimumAssurance = [{ dimension: 'identityProofing', minLevel: 9 }];
      }));
      expect(codesOf(result)).toContain('unsatisfiable-assurance');
    });

    it('skips satisfiability when a requirement dimension is itself invalid.', (): void => {
      const result = validateInstitutionProfile(mutate((profile): void => {
        profile.recordClasses[0].minimumAssurance = [{ dimension: 'bogus', minLevel: 9 }];
      }));
      expect(codesOf(result)).toContain('not-in-enum');
      expect(codesOf(result)).not.toContain('unsatisfiable-assurance');
    });
  });

  describe('validating references and identifier collection', (): void => {
    it('rejects dangling policy/legal-basis/purpose references.', (): void => {
      const result = validateInstitutionProfile(mutate((profile): void => {
        profile.recordClasses[0].policyTemplate = 'pt-nope';
        profile.recordClasses[0].legalBasis = 'lb-nope';
        profile.recordClasses[0].purposes = [ 'p-nope' ];
      }));
      const codes = codesOf(result);
      expect(codes).toContain('dangling-ref');
    });

    it('treats an empty reference string as a string error rather than a dangling ref.', (): void => {
      const result = validateInstitutionProfile(mutate((profile): void => {
        profile.recordClasses[0].purposes = [ '' ];
      }));
      expect(codesOf(result)).toContain('not-string');
    });

    it('ignores malformed entries when collecting identifiers.', (): void => {
      const result = validateInstitutionProfile(mutate((profile): void => {
        profile.declaredPurposes = [
          { id: 'p-account', description: 'kept' },
          { id: '' },
          {},
          'string-entry',
        ];
      }));
      expect(result.valid).toBe(false);
    });
  });

  describe('validating policy, corpus and effective-time rules', (): void => {
    it('rejects a profile that declares no policy templates.', (): void => {
      const result = validateInstitutionProfile(mutate((profile): void => {
        profile.policies.templates = [];
      }));
      expect(codesOf(result)).toContain('no-policy-templates');
    });

    it('rejects authorized-retroactive effective-time without explicit authorization.', (): void => {
      const result = validateInstitutionProfile(mutate((profile): void => {
        profile.policies.effectiveTimeBehavior = 'authorized-retroactive';
      }));
      expect(codesOf(result)).toContain('unauthorized-retroactive');
    });

    it('rejects a proposed (un-attested) compiled policy bundle.', (): void => {
      const result = validateInstitutionProfile(mutate((profile): void => {
        profile.compiledPolicy.attestationStatus = 'proposed';
      }));
      expect(codesOf(result)).toContain('unattested-policy');
    });

    it('rejects a legal-compliance release claim (Blocked gate).', (): void => {
      const result = validateInstitutionProfile(mutate((profile): void => {
        profile.compiledPolicy.legalComplianceClaimed = true;
      }));
      expect(codesOf(result)).toContain('blocked-compliance-claim');
    });

    it('rejects a corpus digest that does not match the compiled-policy binding.', (): void => {
      const result = validateInstitutionProfile(mutate((profile): void => {
        profile.compiledPolicy.corpusManifestDigest = 'sha256-different';
      }));
      expect(codesOf(result)).toContain('corpus-digest-mismatch');
    });

    it('does not compare digests when either side is an empty string.', (): void => {
      const emptyBound = validateInstitutionProfile(mutate((profile): void => {
        profile.compiledPolicy.corpusManifestDigest = '';
      }));
      const emptyManifest = validateInstitutionProfile(mutate((profile): void => {
        profile.legislativeCorpus.manifestDigest = '';
      }));
      expect(codesOf(emptyBound)).not.toContain('corpus-digest-mismatch');
      expect(codesOf(emptyManifest)).not.toContain('corpus-digest-mismatch');
    });
  });

  describe('validating retention', (): void => {
    it('rejects a hard-delete deletion mode on an accepted record class.', (): void => {
      const result = validateInstitutionProfile(mutate((profile): void => {
        profile.retention[0].deletionMode = 'hard-delete';
      }));
      expect(codesOf(result)).toContain('destructive-retention');
    });

    it('rejects a retention rule referencing an unknown record class.', (): void => {
      const result = validateInstitutionProfile(mutate((profile): void => {
        profile.retention[0].recordClass = 'rc-nope';
      }));
      const codes = codesOf(result);
      expect(codes).toContain('dangling-ref');
      expect(codes).toContain('uncovered-record-class');
    });

    it('rejects a record class that has no retention rule at all.', (): void => {
      const result = validateInstitutionProfile(mutate((profile): void => {
        profile.retention = profile.retention.filter((rule: any): boolean => rule.recordClass !== 'rc-warranty');
      }));
      expect(codesOf(result)).toContain('uncovered-record-class');
    });

    it('treats an empty record-class reference as a string error and leaves the class uncovered.', (): void => {
      const result = validateInstitutionProfile(mutate((profile): void => {
        profile.retention[0].recordClass = '';
      }));
      const codes = codesOf(result);
      expect(codes).toContain('not-string');
      expect(codes).toContain('uncovered-record-class');
    });
  });

  describe('validating the token broker, offline grant and effective interval', (): void => {
    it('rejects an adopted broker with an http broker origin.', (): void => {
      const result = validateInstitutionProfile(mutate((profile): void => {
        profile.tokenBroker.brokerOrigin = 'http://broker.example/';
      }));
      expect(codesOf(result)).toContain('not-https');
    });

    it('rejects an offline lifetime that is not a positive integer.', (): void => {
      const result = validateInstitutionProfile(mutate((profile): void => {
        profile.offlineGrantPolicy.maxOfflineMinutes = 0;
      }));
      expect(codesOf(result)).toContain('not-int');
    });

    it('rejects an effective interval whose end is not after its start.', (): void => {
      const result = validateInstitutionProfile(mutate((profile): void => {
        profile.effectiveInterval.effectiveUntil = '2020-01-01T00:00:00Z';
      }));
      expect(codesOf(result)).toContain('invalid-interval');
    });

    it('does not compare the interval when either bound is an empty string.', (): void => {
      const emptyFrom = validateInstitutionProfile(mutate((profile): void => {
        profile.effectiveInterval.effectiveFrom = '';
      }));
      const emptyUntil = validateInstitutionProfile(mutate((profile): void => {
        profile.effectiveInterval.effectiveUntil = '';
      }));
      expect(codesOf(emptyFrom)).not.toContain('invalid-interval');
      expect(codesOf(emptyUntil)).not.toContain('invalid-interval');
    });
  });

  describe('exposing the declarative schema', (): void => {
    it('publishes a versioned JSON schema that is fail-closed on unknown fields.', (): void => {
      expect(INSTITUTION_PROFILE_JSON_SCHEMA.$id).toContain(INSTITUTION_PROFILE_SCHEMA_VERSION);
      expect(INSTITUTION_PROFILE_JSON_SCHEMA.additionalProperties).toBe(false);
      expect(INSTITUTION_PROFILE_JSON_SCHEMA.properties.schemaVersion.const).toBe(INSTITUTION_PROFILE_SCHEMA_VERSION);
    });
  });
});
