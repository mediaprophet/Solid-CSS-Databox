import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  DBX_NAMESPACE,
  ODRL_NAMESPACE,
} from '../../../../src/databox/odrl/terms';
import {
  checkTermSupport,
  isProfileSupported,
  isTermSupported,
} from '../../../../src/databox/odrl/TermSupport';
import type { InstitutionProfile } from '../../../../src/databox/profile/InstitutionProfile';
import {
  loadInstitutionProfile,
  validateInstitutionProfile,
} from '../../../../src/databox/profile/InstitutionProfileValidator';
import { BadRequestHttpError } from '../../../../src/util/errors/BadRequestHttpError';

// The fixture data lives under databox/fixtures (resource files, not coverage-gated).
const fixtures = join(__dirname, '..', '..', '..', '..', 'databox', 'fixtures');

function readJson(...segments: string[]): any {
  return JSON.parse(readFileSync(join(fixtures, ...segments), 'utf8'));
}

const profileRaw = readJson('loyalty-institution-profile.json');
const negativeCases = readJson('negative-cases.json');

const recordFixtures = [
  'digital-receipt.json',
  'warranty-record.json',
  'product-recall.json',
  'rewards-statement.json',
  'review-disposition.json',
];
const submissionFixtures = [
  'correction-request.json',
  'warranty-claim.json',
  'dietary-preference.json',
];

// Expand an ODRL/dbx term token (bare, `dbx:` prefixed, or absolute) into an absolute IRI.
function expandTerm(token: string): string {
  if (token.startsWith('http')) {
    return token;
  }
  if (token.startsWith('dbx:')) {
    return `${DBX_NAMESPACE}${token.slice(4)}`;
  }
  return `${ODRL_NAMESPACE}${token}`;
}

// Recursively collect every value found under property `key` (flattening string arrays).
function collect(node: unknown, key: string, out: string[]): void {
  if (Array.isArray(node)) {
    for (const item of node) {
      collect(item, key, out);
    }
  } else if (node !== null && typeof node === 'object') {
    for (const [ prop, value ] of Object.entries(node)) {
      if (prop === key) {
        if (Array.isArray(value)) {
          for (const token of value) {
            if (typeof token === 'string') {
              out.push(token);
            }
          }
        } else if (typeof value === 'string') {
          out.push(value);
        }
      }
      collect(value, key, out);
    }
  }
}

describe('The synthetic loyalty-program fixtures (DBX-08)', (): void => {
  describe('the InstitutionProfile instance', (): void => {
    it('validates against the DBX-06 schema with no errors or warnings.', (): void => {
      const result = validateInstitutionProfile(profileRaw);
      expect(result.errors).toEqual([]);
      expect(result.warnings).toEqual([]);
      expect(result.valid).toBe(true);
    });

    it('loads through loadInstitutionProfile into a typed, synthetic profile.', (): void => {
      const profile: InstitutionProfile = loadInstitutionProfile(profileRaw);
      expect(profile.synthetic).toBe(true);
      expect(profile.profileId).toBe('prog-megamart-rewards-loyalty');
      // ADR-0015: a synthetic fixture must never assert a legal-compliance claim.
      expect(profile.compiledPolicy.legalComplianceClaimed).toBe(false);
    });

    it('models both low- and high-assurance record classes for every loyalty concept.', (): void => {
      const profile = loadInstitutionProfile(profileRaw);
      const ids = profile.recordClasses.map((rc): string => rc.id);
      expect(ids).toEqual(expect.arrayContaining([
        'rc-receipt',
        'rc-warranty',
        'rc-product-info',
        'rc-recall',
        'rc-rewards',
        'rc-disposition',
      ]));
      const submissionIds = profile.submissionClasses.map((sc): string => sc.id);
      expect(submissionIds).toEqual(
        expect.arrayContaining([ 'sc-correction', 'sc-warranty-claim', 'sc-dietary-pref' ]),
      );
      // A low-assurance class (public-safety recall) and a high-assurance class (disposition) both exist.
      const recall = profile.recordClasses.find((rc): boolean => rc.id === 'rc-recall')!;
      const disposition = profile.recordClasses.find((rc): boolean => rc.id === 'rc-disposition')!;
      expect(recall.minimumAssurance.length).toBeLessThan(disposition.minimumAssurance.length);
      expect(disposition.existenceVisibility).toBe('suppressed');
    });
  });

  describe('the deposited record fixtures', (): void => {
    const profile = loadInstitutionProfile(profileRaw);
    const recordClassIds = new Set(profile.recordClasses.map((rc): string => rc.id));

    it.each(recordFixtures)('%s is synthetic, program-bound and resolves to a declared record class.', (file): void => {
      const record = readJson('records', file);
      expect(record.syntheticFixture).toBe(true);
      expect(record.program).toBe(profile.profileId);
      expect(recordClassIds.has(record.recordClass)).toBe(true);
      // Opaque, PII-free identifiers (invariant 2): synthetic relationship/box tokens only.
      expect(record.relationshipId).toMatch(/^rel_syn_/u);
      expect(record.box).toMatch(/^bx_syn_/u);
      expect(record.resource).toContain(record.box);
      // Exchange binding (ADR-0019): the receipt binds the profile's compiled-policy digest.
      expect(record.acceptanceReceipt.policyDigest).toBe(profile.compiledPolicy.compiledPolicyDigest);
    });
  });

  describe('the consumer submission fixtures', (): void => {
    const profile = loadInstitutionProfile(profileRaw);
    const submissionClassIds = new Set(profile.submissionClasses.map((sc): string => sc.id));
    const purposeIds = new Set(profile.declaredPurposes.map((p): string => p.id));

    it.each(submissionFixtures)('%s resolves to a declared submission class + purpose.', (file): void => {
      const submission = readJson('submissions', file);
      expect(submission.syntheticFixture).toBe(true);
      expect(submission.program).toBe(profile.profileId);
      expect(submissionClassIds.has(submission.submissionClass)).toBe(true);
      expect(purposeIds.has(submission.purpose)).toBe(true);
      expect(submission.target).toContain('/submissions/');
    });
  });

  describe('the ODRL policy agreements (reusing the DBX-07 dbx: profile)', (): void => {
    const positives = [ 'records-agreement.jsonld', 'submission-agreement.jsonld' ];

    it.each(positives)('%s references the supported profile and only supported terms.', (file): void => {
      const agreement = readJson('policies', file);
      expect(agreement.syntheticFixture).toBe(true);
      expect(isProfileSupported(agreement.profile)).toBe(true);

      const actions: string[] = [];
      collect(agreement, 'action', actions);
      expect(actions.length).toBeGreaterThan(0);
      for (const action of actions) {
        expect(isTermSupported('action', expandTerm(action))).toBe(true);
      }

      const leftOperands: string[] = [];
      collect(agreement, 'leftOperand', leftOperands);
      for (const operand of leftOperands) {
        expect(isTermSupported('leftOperand', expandTerm(operand))).toBe(true);
      }

      const rightOperands: string[] = [];
      collect(agreement, 'rightOperand', rightOperands);
      for (const operand of rightOperands.filter((value): boolean => value.startsWith('dbx:'))) {
        expect(isTermSupported('rightOperand', expandTerm(operand))).toBe(true);
      }

      const conflicts: string[] = [];
      collect(agreement, 'conflict', conflicts);
      for (const conflict of conflicts) {
        expect(isTermSupported('conflictStrategy', expandTerm(conflict))).toBe(true);
      }
    });

    it('rejects the deprecated dbx:notifyHolder alias (fail closed).', (): void => {
      const agreement = readJson('policies', 'invalid-deprecated-notifyholder.jsonld');
      const actions: string[] = [];
      collect(agreement, 'action', actions);
      const decisions = actions.map((action): string => checkTermSupport('action', expandTerm(action)).reason);
      expect(decisions).toContain('deprecated-term');
      expect(actions.every((action): boolean => isTermSupported('action', expandTerm(action)))).toBe(false);
    });

    it('rejects an unknown dbx: action (fail closed).', (): void => {
      const agreement = readJson('policies', 'invalid-unknown-action.jsonld');
      const actions: string[] = [];
      collect(agreement, 'action', actions);
      const decisions = actions.map((action): string => checkTermSupport('action', expandTerm(action)).reason);
      expect(decisions).toContain('unsupported-term');
    });
  });

  describe('the tenant-isolation exchange fixtures (HD-16)', (): void => {
    const profile = loadInstitutionProfile(profileRaw);

    it('exposes an opaque committed-event feed page bound to this synthetic tenant only.', (): void => {
      const page = readJson('exchange', 'committed-events.json');
      expect(page.syntheticFixture).toBe(true);
      expect(page.program).toBe(profile.profileId);
      for (const event of page.events) {
        expect(event.tenantId).toBe(page.tenantId);
        expect(event.resourceRef).toMatch(/^res_syn_/u);
      }
    });

    it('marks a cross-program deposit as fail-closed: foreign origin/audience differ from this program.', (): void => {
      const rejected = readJson('exchange', 'cross-program-deposit-rejected.json');
      expect(rejected.expectedOutcome).toBe('REJECTED');
      const home = new URL(profile.tenancy.origin).host;
      expect(new URL(rejected.foreignOrigin).host).not.toBe(home);
      expect(new URL(rejected.attemptedAudience).host).not.toBe(home);
      expect(rejected.foreignProgram).not.toBe(profile.profileId);
    });
  });

  describe('the expected NEGATIVE profile cases', (): void => {
    const negatives: [string, string][] = negativeCases.cases
      .map((c: any): [string, string] => [ c.file, c.expectedCode ]);

    it.each(negatives)(
      '%s fails closed with code %s and loadInstitutionProfile throws.',
      (file: string, expectedCode: string): void => {
        const raw = readJson('negative', file);
        const result = validateInstitutionProfile(raw);
        expect(result.valid).toBe(false);
        expect(result.errors.map((issue): string => issue.code)).toContain(expectedCode);
        expect((): unknown => loadInstitutionProfile(raw)).toThrow(BadRequestHttpError);
      },
    );
  });
});
