import { BadRequestHttpError } from '../../util/errors/BadRequestHttpError';
import type {
  AssuranceDimension,
  DeletionMode,
  InstitutionProfile,
} from './InstitutionProfile';
import {
  APP_ENCRYPTION_MODES,
  ASSURANCE_DIMENSIONS,
  CONFLICT_STRATEGIES,
  DELETION_MODES,
  DEPLOYMENT_MODELS,
  EFFECTIVE_TIME_BEHAVIORS,
  EXISTENCE_VISIBILITIES,
  INSTITUTION_PROFILE_SCHEMA_VERSION,
  SENDER_CONSTRAINTS,
} from './InstitutionProfile';

/**
 * A single validation finding. `path` locates the offending value; `code` is a stable machine code;
 * `message` is a non-leaking human explanation.
 */
export interface ProfileIssue {
  readonly path: string;
  readonly code: string;
  readonly message: string;
}

/**
 * The result of validating an institution profile. `valid` is true only when there are zero errors;
 * warnings (e.g. discouraged path-only tenancy) never invalidate. `profile` is the typed loader value
 * and is present only when `valid` is true.
 */
export interface ProfileValidationResult {
  readonly valid: boolean;
  readonly errors: readonly ProfileIssue[];
  readonly warnings: readonly ProfileIssue[];
  readonly profile?: InstitutionProfile;
}

// The allowed top-level keys. Any other key is rejected (fail closed on unknown security-critical fields).
const TOP_LEVEL_KEYS = [
  'schemaVersion',
  'profileId',
  'profileVersion',
  'effectiveInterval',
  'synthetic',
  'program',
  'processors',
  'tenancy',
  'crypto',
  'identityProviders',
  'assuranceMappings',
  'tokenBroker',
  'offlineGrantPolicy',
  'recordClasses',
  'submissionClasses',
  'policies',
  'compiledPolicy',
  'legislativeCorpus',
  'legalBases',
  'declaredPurposes',
  'retention',
  'systemsOfRecord',
  'notifications',
  'redress',
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Accumulates errors/warnings and offers fail-closed extractors that return a safe default (and record
 * an error) instead of throwing, so call sites do not each need a guard branch.
 */
class Context {
  public readonly errors: ProfileIssue[] = [];
  public readonly warnings: ProfileIssue[] = [];

  public error(path: string, code: string, message: string): void {
    this.errors.push({ path, code, message });
  }

  public warn(path: string, code: string, message: string): void {
    this.warnings.push({ path, code, message });
  }

  public record(value: unknown, path: string): Record<string, unknown> {
    if (isRecord(value)) {
      return value;
    }
    this.error(path, 'not-object', `${path} must be an object.`);
    return {};
  }

  public string(value: unknown, path: string): string {
    if (typeof value === 'string' && value.length > 0) {
      return value;
    }
    this.error(path, 'not-string', `${path} must be a non-empty string.`);
    return '';
  }

  public boolean(value: unknown, path: string): boolean {
    if (typeof value === 'boolean') {
      return value;
    }
    this.error(path, 'not-boolean', `${path} must be a boolean.`);
    return false;
  }

  public array(value: unknown, path: string): unknown[] {
    if (Array.isArray(value)) {
      return value;
    }
    this.error(path, 'not-array', `${path} must be an array.`);
    return [];
  }

  public int(value: unknown, min: number, path: string): number {
    if (typeof value === 'number' && Number.isInteger(value) && value >= min) {
      return value;
    }
    this.error(path, 'not-int', `${path} must be an integer >= ${min}.`);
    return min;
  }

  public enom<T extends string>(value: unknown, allowed: readonly T[], path: string): T | undefined {
    if (typeof value === 'string' && (allowed as readonly string[]).includes(value)) {
      return value as T;
    }
    this.error(path, 'not-in-enum', `${path} must be one of: ${allowed.join(', ')}.`);
    return undefined;
  }

  public unknownKeys(rec: Record<string, unknown>, allowed: readonly string[], path: string): void {
    for (const key of Object.keys(rec)) {
      if (!allowed.includes(key)) {
        this.error(`${path}.${key}`, 'unknown-field', `Unknown field '${key}' is rejected (fail closed).`);
      }
    }
  }

  public httpsUrl(value: unknown, path: string): void {
    const url = this.string(value, path);
    if (url.length > 0 && !isHttpsUrl(url)) {
      this.error(path, 'not-https', `${path} must be an https URL.`);
    }
  }

  /** Validate that each string in `refs` resolves against `known`; reports empty/dangling references. */
  public refs(refs: unknown[], known: Set<string>, path: string): void {
    for (const [ index, raw ] of refs.entries()) {
      const ref = this.string(raw, `${path}[${index}]`);
      if (ref.length > 0 && !known.has(ref)) {
        this.error(`${path}[${index}]`, 'dangling-ref', `${path}[${index}] '${ref}' does not resolve.`);
      }
    }
  }
}

/** Collect the `id` of each object in `list`; malformed entries contribute no id. */
function collectIds(list: unknown[]): Set<string> {
  const ids = new Set<string>();
  for (const entry of list) {
    if (isRecord(entry) && typeof entry.id === 'string' && entry.id.length > 0) {
      ids.add(entry.id);
    }
  }
  return ids;
}

function validateAccountableParty(ctx: Context, value: unknown, path: string): void {
  const rec = ctx.record(value, path);
  ctx.unknownKeys(rec, [ 'id', 'legalName', 'jurisdiction', 'contact' ], path);
  ctx.string(rec.id, `${path}.id`);
  ctx.string(rec.legalName, `${path}.legalName`);
  ctx.string(rec.jurisdiction, `${path}.jurisdiction`);
  if (rec.contact !== undefined) {
    ctx.string(rec.contact, `${path}.contact`);
  }
}

function availableAssurance(ctx: Context, mappings: unknown[], issuerIds: Set<string>): Map<string, number> {
  const available = new Map<string, number>();
  for (const [ index, raw ] of mappings.entries()) {
    const path = `assuranceMappings[${index}]`;
    const rec = ctx.record(raw, path);
    ctx.unknownKeys(rec, [ 'issuer', 'dimension', 'claim', 'level' ], path);
    ctx.refs([ rec.issuer ], issuerIds, `${path}.issuer`);
    ctx.string(rec.claim, `${path}.claim`);
    const level = ctx.int(rec.level, 0, `${path}.level`);
    const dimension = ctx.enom<AssuranceDimension>(rec.dimension, ASSURANCE_DIMENSIONS, `${path}.dimension`);
    if (dimension !== undefined) {
      const current = available.get(dimension) ?? 0;
      available.set(dimension, Math.max(current, level));
    }
  }
  return available;
}

function validateAssuranceReqs(ctx: Context, value: unknown, path: string, available: Map<string, number>): void {
  const reqs = ctx.array(value, path);
  for (const [ index, raw ] of reqs.entries()) {
    const reqPath = `${path}[${index}]`;
    const rec = ctx.record(raw, reqPath);
    ctx.unknownKeys(rec, [ 'dimension', 'minLevel' ], reqPath);
    const minLevel = ctx.int(rec.minLevel, 0, `${reqPath}.minLevel`);
    const dimension = ctx.enom<AssuranceDimension>(rec.dimension, ASSURANCE_DIMENSIONS, `${reqPath}.dimension`);
    if (dimension !== undefined) {
      const avail = available.get(dimension) ?? 0;
      if (minLevel > avail) {
        ctx.error(
          `${reqPath}.minLevel`,
          'unsatisfiable-assurance',
          `${reqPath} requires ${dimension} level ${minLevel} but no mapping provides above ${avail}.`,
        );
      }
    }
  }
}

function validateTenancy(ctx: Context, value: unknown): void {
  const rec = ctx.record(value, 'tenancy');
  ctx.unknownKeys(rec, [ 'deploymentModel', 'origin', 'tokenAudience' ], 'tenancy');
  const model = ctx.enom(rec.deploymentModel, DEPLOYMENT_MODELS, 'tenancy.deploymentModel');
  if (model === 'path-only') {
    ctx.warn(
      'tenancy.deploymentModel',
      'discouraged-topology',
      'Path-only tenancy is discouraged: a single origin cannot program-bind audiences/cookies/CORS.',
    );
  }
  const origin = ctx.string(rec.origin, 'tenancy.origin');
  const audience = ctx.string(rec.tokenAudience, 'tenancy.tokenAudience');
  const originOk = origin.length > 0 && isHttpsUrl(origin);
  const audienceOk = audience.length > 0 && isHttpsUrl(audience);
  if (!originOk) {
    ctx.error('tenancy.origin', 'not-https', 'tenancy.origin must be an https URL.');
  }
  if (!audienceOk) {
    ctx.error('tenancy.tokenAudience', 'not-https', 'tenancy.tokenAudience must be an https URL.');
  }
  if (originOk && audienceOk && new URL(origin).host !== new URL(audience).host) {
    ctx.error(
      'tenancy.tokenAudience',
      'audience-not-program-bound',
      'tenancy.tokenAudience host must equal the program origin host (ADR-0002 program binding).',
    );
  }
}

function validateCrypto(ctx: Context, value: unknown): void {
  const rec = ctx.record(value, 'crypto');
  ctx.unknownKeys(
    rec,
    [ 'signingSuite', 'signingKeyRef', 'atRestEncryption', 'applicationLevelEncryption' ],
    'crypto',
  );
  ctx.string(rec.signingSuite, 'crypto.signingSuite');
  ctx.string(rec.signingKeyRef, 'crypto.signingKeyRef');
  const atRest = ctx.record(rec.atRestEncryption, 'crypto.atRestEncryption');
  ctx.unknownKeys(atRest, [ 'required', 'perTenantKeys' ], 'crypto.atRestEncryption');
  const required = ctx.boolean(atRest.required, 'crypto.atRestEncryption.required');
  const perTenantKeys = ctx.boolean(atRest.perTenantKeys, 'crypto.atRestEncryption.perTenantKeys');
  if (required && !perTenantKeys) {
    ctx.error(
      'crypto.atRestEncryption.perTenantKeys',
      'shared-platform-key',
      'At-rest encryption requires independent per-tenant keys (ADR-0021 §2, no platform-wide key).',
    );
  }
  const appEnc = ctx.enom(rec.applicationLevelEncryption, APP_ENCRYPTION_MODES, 'crypto.applicationLevelEncryption');
  if (appEnc === 'required-provider-blind') {
    ctx.error(
      'crypto.applicationLevelEncryption',
      'blocked-provider-blind',
      'The provider-blind profile is Blocked (ADR-0021 §residual) and is not admitted.',
    );
  }
}

function validateIdentityProviders(ctx: Context, value: unknown): void {
  const list = ctx.array(value, 'identityProviders');
  for (const [ index, raw ] of list.entries()) {
    const path = `identityProviders[${index}]`;
    const rec = ctx.record(raw, path);
    ctx.unknownKeys(rec, [ 'id', 'issuer', 'protocol', 'accreditation', 'claimContract' ], path);
    ctx.string(rec.id, `${path}.id`);
    ctx.httpsUrl(rec.issuer, `${path}.issuer`);
    ctx.string(rec.protocol, `${path}.protocol`);
    if (rec.accreditation !== undefined) {
      ctx.string(rec.accreditation, `${path}.accreditation`);
    }
    const claims = ctx.array(rec.claimContract, `${path}.claimContract`);
    for (const [ claimIndex, claim ] of claims.entries()) {
      ctx.string(claim, `${path}.claimContract[${claimIndex}]`);
    }
  }
}

function validateRecordClasses(
  ctx: Context,
  value: unknown,
  available: Map<string, number>,
  templateIds: Set<string>,
  legalBasisIds: Set<string>,
  purposeIds: Set<string>,
): void {
  const list = ctx.array(value, 'recordClasses');
  for (const [ index, raw ] of list.entries()) {
    const path = `recordClasses[${index}]`;
    const rec = ctx.record(raw, path);
    ctx.unknownKeys(
      rec,
      [ 'id', 'label', 'minimumAssurance', 'policyTemplate', 'legalBasis', 'purposes', 'existenceVisibility' ],
      path,
    );
    ctx.string(rec.id, `${path}.id`);
    ctx.string(rec.label, `${path}.label`);
    validateAssuranceReqs(ctx, rec.minimumAssurance, `${path}.minimumAssurance`, available);
    ctx.refs([ rec.policyTemplate ], templateIds, `${path}.policyTemplate`);
    ctx.refs([ rec.legalBasis ], legalBasisIds, `${path}.legalBasis`);
    ctx.refs(ctx.array(rec.purposes, `${path}.purposes`), purposeIds, `${path}.purposes`);
    ctx.enom(rec.existenceVisibility, EXISTENCE_VISIBILITIES, `${path}.existenceVisibility`);
  }
}

function validateSubmissionClasses(
  ctx: Context,
  value: unknown,
  available: Map<string, number>,
  templateIds: Set<string>,
  purposeIds: Set<string>,
): void {
  const list = ctx.array(value, 'submissionClasses');
  for (const [ index, raw ] of list.entries()) {
    const path = `submissionClasses[${index}]`;
    const rec = ctx.record(raw, path);
    ctx.unknownKeys(rec, [ 'id', 'label', 'minimumAssurance', 'policyTemplate', 'purposes' ], path);
    ctx.string(rec.id, `${path}.id`);
    ctx.string(rec.label, `${path}.label`);
    validateAssuranceReqs(ctx, rec.minimumAssurance, `${path}.minimumAssurance`, available);
    ctx.refs([ rec.policyTemplate ], templateIds, `${path}.policyTemplate`);
    ctx.refs(ctx.array(rec.purposes, `${path}.purposes`), purposeIds, `${path}.purposes`);
  }
}

function validatePolicies(ctx: Context, value: unknown, templateIds: Set<string>): void {
  const rec = ctx.record(value, 'policies');
  ctx.unknownKeys(
    rec,
    [ 'templates', 'conflictStrategy', 'effectiveTimeBehavior', 'retroactiveAuthorized' ],
    'policies',
  );
  const templates = ctx.array(rec.templates, 'policies.templates');
  for (const [ index, raw ] of templates.entries()) {
    const path = `policies.templates[${index}]`;
    const template = ctx.record(raw, path);
    ctx.unknownKeys(template, [ 'id', 'version', 'odrlProfile' ], path);
    ctx.string(template.id, `${path}.id`);
    ctx.string(template.version, `${path}.version`);
    ctx.string(template.odrlProfile, `${path}.odrlProfile`);
  }
  if (templateIds.size === 0) {
    ctx.error('policies.templates', 'no-policy-templates', 'At least one policy template must be declared.');
  }
  ctx.enom(rec.conflictStrategy, CONFLICT_STRATEGIES, 'policies.conflictStrategy');
  const behavior = ctx.enom(rec.effectiveTimeBehavior, EFFECTIVE_TIME_BEHAVIORS, 'policies.effectiveTimeBehavior');
  if (rec.retroactiveAuthorized !== undefined) {
    ctx.boolean(rec.retroactiveAuthorized, 'policies.retroactiveAuthorized');
  }
  if (behavior === 'authorized-retroactive' && rec.retroactiveAuthorized !== true) {
    ctx.error(
      'policies.retroactiveAuthorized',
      'unauthorized-retroactive',
      'authorized-retroactive effective-time requires retroactiveAuthorized: true (ADR-0014).',
    );
  }
}

function validateCompiledPolicy(ctx: Context, value: unknown, corpusManifestDigest: string): void {
  const rec = ctx.record(value, 'compiledPolicy');
  ctx.unknownKeys(
    rec,
    [
      'compiledPolicyDigest',
      'corpusManifestDigest',
      'attestationId',
      'evaluatorVersion',
      'profileDigest',
      'attestationStatus',
      'legalComplianceClaimed',
    ],
    'compiledPolicy',
  );
  ctx.string(rec.compiledPolicyDigest, 'compiledPolicy.compiledPolicyDigest');
  const boundDigest = ctx.string(rec.corpusManifestDigest, 'compiledPolicy.corpusManifestDigest');
  ctx.string(rec.attestationId, 'compiledPolicy.attestationId');
  ctx.string(rec.evaluatorVersion, 'compiledPolicy.evaluatorVersion');
  ctx.string(rec.profileDigest, 'compiledPolicy.profileDigest');
  const status = ctx.enom(rec.attestationStatus, [ 'proposed', 'attested' ], 'compiledPolicy.attestationStatus');
  if (status === 'proposed') {
    ctx.error(
      'compiledPolicy.attestationStatus',
      'unattested-policy',
      'A proposed (un-attested) compiled policy bundle is not admitted (ADR-0015, fail closed).',
    );
  }
  if (rec.legalComplianceClaimed !== undefined) {
    const claimed = ctx.boolean(rec.legalComplianceClaimed, 'compiledPolicy.legalComplianceClaimed');
    if (claimed) {
      ctx.error(
        'compiledPolicy.legalComplianceClaimed',
        'blocked-compliance-claim',
        'A legal-compliance release claim is Blocked until the ADR-0015 corpus + attestation gate clears.',
      );
    }
  }
  if (boundDigest.length > 0 && corpusManifestDigest.length > 0 && boundDigest !== corpusManifestDigest) {
    ctx.error(
      'compiledPolicy.corpusManifestDigest',
      'corpus-digest-mismatch',
      'compiledPolicy.corpusManifestDigest must equal legislativeCorpus.manifestDigest (ADR-0014/0015).',
    );
  }
}

function validateLegislativeCorpus(ctx: Context, value: unknown): string {
  const rec = ctx.record(value, 'legislativeCorpus');
  ctx.unknownKeys(rec, [ 'manifestDigest', 'entries' ], 'legislativeCorpus');
  const manifestDigest = ctx.string(rec.manifestDigest, 'legislativeCorpus.manifestDigest');
  const entries = ctx.array(rec.entries, 'legislativeCorpus.entries');
  for (const [ index, raw ] of entries.entries()) {
    const path = `legislativeCorpus.entries[${index}]`;
    const entry = ctx.record(raw, path);
    ctx.unknownKeys(
      entry,
      [ 'sourceUri', 'jurisdiction', 'expressionVersion', 'retrievedAt', 'mediaType', 'contentDigest' ],
      path,
    );
    ctx.httpsUrl(entry.sourceUri, `${path}.sourceUri`);
    ctx.string(entry.jurisdiction, `${path}.jurisdiction`);
    ctx.string(entry.expressionVersion, `${path}.expressionVersion`);
    ctx.string(entry.retrievedAt, `${path}.retrievedAt`);
    ctx.string(entry.mediaType, `${path}.mediaType`);
    ctx.string(entry.contentDigest, `${path}.contentDigest`);
  }
  return manifestDigest;
}

function validateRetention(ctx: Context, value: unknown, recordClassIds: Set<string>): void {
  const list = ctx.array(value, 'retention');
  const covered = new Set<string>();
  for (const [ index, raw ] of list.entries()) {
    const path = `retention[${index}]`;
    const rec = ctx.record(raw, path);
    ctx.unknownKeys(rec, [ 'recordClass', 'retentionDays', 'deletionMode', 'tombstoneOnExpiry' ], path);
    const recordClass = ctx.string(rec.recordClass, `${path}.recordClass`);
    if (recordClass.length > 0) {
      covered.add(recordClass);
      if (!recordClassIds.has(recordClass)) {
        ctx.error(
          `${path}.recordClass`,
          'dangling-ref',
          `${path}.recordClass '${recordClass}' does not resolve.`,
        );
      }
    }
    ctx.int(rec.retentionDays, 1, `${path}.retentionDays`);
    ctx.boolean(rec.tombstoneOnExpiry, `${path}.tombstoneOnExpiry`);
    const mode = ctx.enom<DeletionMode>(rec.deletionMode, DELETION_MODES, `${path}.deletionMode`);
    if (mode === 'hard-delete') {
      ctx.error(
        `${path}.deletionMode`,
        'destructive-retention',
        'hard-delete of an accepted record is forbidden (ADR-0018 append-only; use tombstone/supersede).',
      );
    }
  }
  for (const recordClass of recordClassIds) {
    if (!covered.has(recordClass)) {
      ctx.error(
        'retention',
        'uncovered-record-class',
        `Record class '${recordClass}' has no retention rule (every class must resolve retention).`,
      );
    }
  }
}

function validateTokenBroker(ctx: Context, value: unknown): void {
  const rec = ctx.record(value, 'tokenBroker');
  ctx.unknownKeys(rec, [ 'adopted', 'brokerOrigin', 'tokenExchange', 'senderConstraint' ], 'tokenBroker');
  const adopted = ctx.boolean(rec.adopted, 'tokenBroker.adopted');
  if (rec.tokenExchange !== undefined) {
    ctx.string(rec.tokenExchange, 'tokenBroker.tokenExchange');
  }
  if (rec.senderConstraint !== undefined) {
    ctx.enom(rec.senderConstraint, SENDER_CONSTRAINTS, 'tokenBroker.senderConstraint');
  }
  if (adopted) {
    ctx.httpsUrl(rec.brokerOrigin, 'tokenBroker.brokerOrigin');
  } else if (rec.brokerOrigin !== undefined) {
    ctx.string(rec.brokerOrigin, 'tokenBroker.brokerOrigin');
  }
}

function validateOfflineGrant(ctx: Context, value: unknown): void {
  const rec = ctx.record(value, 'offlineGrantPolicy');
  ctx.unknownKeys(rec, [ 'allowOffline', 'maxOfflineMinutes' ], 'offlineGrantPolicy');
  const allowOffline = ctx.boolean(rec.allowOffline, 'offlineGrantPolicy.allowOffline');
  if (allowOffline) {
    ctx.int(rec.maxOfflineMinutes, 1, 'offlineGrantPolicy.maxOfflineMinutes');
  } else if (rec.maxOfflineMinutes !== undefined) {
    ctx.int(rec.maxOfflineMinutes, 1, 'offlineGrantPolicy.maxOfflineMinutes');
  }
}

function validateRedress(ctx: Context, value: unknown): void {
  const rec = ctx.record(value, 'redress');
  ctx.unknownKeys(
    rec,
    [ 'stepUpSupported', 'appealRoutes', 'existenceVisibilityDefault', 'correctionResponseDays' ],
    'redress',
  );
  ctx.boolean(rec.stepUpSupported, 'redress.stepUpSupported');
  ctx.enom(rec.existenceVisibilityDefault, EXISTENCE_VISIBILITIES, 'redress.existenceVisibilityDefault');
  if (rec.correctionResponseDays !== undefined) {
    ctx.int(rec.correctionResponseDays, 1, 'redress.correctionResponseDays');
  }
  const routes = ctx.array(rec.appealRoutes, 'redress.appealRoutes');
  for (const [ index, raw ] of routes.entries()) {
    const path = `redress.appealRoutes[${index}]`;
    const route = ctx.record(raw, path);
    ctx.unknownKeys(route, [ 'id', 'responsibleBody', 'filingMethod' ], path);
    ctx.string(route.id, `${path}.id`);
    ctx.string(route.responsibleBody, `${path}.responsibleBody`);
    ctx.string(route.filingMethod, `${path}.filingMethod`);
  }
}

function validateProcessors(ctx: Context, value: unknown, purposeIds: Set<string>): void {
  const list = ctx.array(value, 'processors');
  for (const [ index, raw ] of list.entries()) {
    const path = `processors[${index}]`;
    const rec = ctx.record(raw, path);
    ctx.unknownKeys(rec, [ 'id', 'legalName', 'jurisdiction', 'purposes', 'readsPayload' ], path);
    ctx.string(rec.id, `${path}.id`);
    ctx.string(rec.legalName, `${path}.legalName`);
    ctx.string(rec.jurisdiction, `${path}.jurisdiction`);
    ctx.boolean(rec.readsPayload, `${path}.readsPayload`);
    ctx.refs(ctx.array(rec.purposes, `${path}.purposes`), purposeIds, `${path}.purposes`);
  }
}

function validateSystemsOfRecord(ctx: Context, value: unknown, recordClassIds: Set<string>): void {
  const list = ctx.array(value, 'systemsOfRecord');
  for (const [ index, raw ] of list.entries()) {
    const path = `systemsOfRecord[${index}]`;
    const rec = ctx.record(raw, path);
    ctx.unknownKeys(rec, [ 'id', 'label', 'recordClasses' ], path);
    ctx.string(rec.id, `${path}.id`);
    ctx.string(rec.label, `${path}.label`);
    ctx.refs(ctx.array(rec.recordClasses, `${path}.recordClasses`), recordClassIds, `${path}.recordClasses`);
  }
}

function validateSimpleIdList(ctx: Context, value: unknown, path: string, keys: readonly string[]): void {
  const list = ctx.array(value, path);
  for (const [ index, raw ] of list.entries()) {
    const itemPath = `${path}[${index}]`;
    const rec = ctx.record(raw, itemPath);
    ctx.unknownKeys(rec, keys, itemPath);
    for (const key of keys) {
      ctx.string(rec[key], `${itemPath}.${key}`);
    }
  }
}

function validateEffectiveInterval(ctx: Context, value: unknown): void {
  const rec = ctx.record(value, 'effectiveInterval');
  ctx.unknownKeys(rec, [ 'effectiveFrom', 'effectiveUntil' ], 'effectiveInterval');
  const from = ctx.string(rec.effectiveFrom, 'effectiveInterval.effectiveFrom');
  if (rec.effectiveUntil !== undefined) {
    const until = ctx.string(rec.effectiveUntil, 'effectiveInterval.effectiveUntil');
    if (from.length > 0 && until.length > 0 && until <= from) {
      ctx.error(
        'effectiveInterval.effectiveUntil',
        'invalid-interval',
        'effectiveUntil must be strictly after effectiveFrom (ADR-0014).',
      );
    }
  }
}

/**
 * Validate an untrusted value against the versioned institution/program profile schema (DBX-06).
 *
 * The validator supplies program-specific facts to the runtime without weakening any invariant: it
 * rejects unsatisfiable assurance, a token audience not bound to the program origin, dangling/forged
 * policy references, destructive retention, and any Blocked feature (provider-blind encryption, a
 * legal-compliance claim, an un-attested policy bundle). Unknown fields are rejected (fail closed).
 * On success it returns the typed {@link InstitutionProfile}; on failure the collected issues.
 */
export function validateInstitutionProfile(input: unknown): ProfileValidationResult {
  const ctx = new Context();
  const root = ctx.record(input, '$');
  ctx.unknownKeys(root, TOP_LEVEL_KEYS, '$');

  const schemaVersion = ctx.string(root.schemaVersion, 'schemaVersion');
  if (schemaVersion.length > 0 && schemaVersion !== INSTITUTION_PROFILE_SCHEMA_VERSION) {
    ctx.error(
      'schemaVersion',
      'unknown-schema-version',
      `Unknown schema version '${schemaVersion}'; expected '${INSTITUTION_PROFILE_SCHEMA_VERSION}'.`,
    );
  }
  ctx.string(root.profileId, 'profileId');
  ctx.string(root.profileVersion, 'profileVersion');
  ctx.boolean(root.synthetic, 'synthetic');
  validateEffectiveInterval(ctx, root.effectiveInterval);

  const program = ctx.record(root.program, 'program');
  ctx.unknownKeys(program, [ 'principal', 'accountableParty' ], 'program');
  validateAccountableParty(ctx, program.principal, 'program.principal');
  validateAccountableParty(ctx, program.accountableParty, 'program.accountableParty');

  // Reference id sets, collected up front so cross-references can be resolved.
  const purposeIds = collectIds(ctx.array(root.declaredPurposes, 'declaredPurposes'));
  const legalBasisIds = collectIds(ctx.array(root.legalBases, 'legalBases'));
  const templateIds = collectIds(ctx.array(ctx.record(root.policies, 'policies').templates, 'policies.templates'));
  const recordClassIds = collectIds(ctx.array(root.recordClasses, 'recordClasses'));
  const issuerIds = collectIds(ctx.array(root.identityProviders, 'identityProviders'));

  validateSimpleIdList(ctx, root.declaredPurposes, 'declaredPurposes', [ 'id', 'description' ]);
  validateSimpleIdList(ctx, root.legalBases, 'legalBases', [ 'id', 'description' ]);
  validateProcessors(ctx, root.processors, purposeIds);
  validateTenancy(ctx, root.tenancy);
  validateCrypto(ctx, root.crypto);
  validateIdentityProviders(ctx, root.identityProviders);

  const available = availableAssurance(ctx, ctx.array(root.assuranceMappings, 'assuranceMappings'), issuerIds);
  validateRecordClasses(ctx, root.recordClasses, available, templateIds, legalBasisIds, purposeIds);
  validateSubmissionClasses(ctx, root.submissionClasses, available, templateIds, purposeIds);
  validatePolicies(ctx, root.policies, templateIds);

  const manifestDigest = validateLegislativeCorpus(ctx, root.legislativeCorpus);
  validateCompiledPolicy(ctx, root.compiledPolicy, manifestDigest);
  validateRetention(ctx, root.retention, recordClassIds);
  validateSystemsOfRecord(ctx, root.systemsOfRecord, recordClassIds);
  validateTokenBroker(ctx, root.tokenBroker);
  validateOfflineGrant(ctx, root.offlineGrantPolicy);
  validateRedress(ctx, root.redress);

  const notifications = ctx.record(root.notifications, 'notifications');
  ctx.unknownKeys(notifications, [ 'notificationFormat', 'receiptFormat' ], 'notifications');
  ctx.string(notifications.notificationFormat, 'notifications.notificationFormat');
  ctx.string(notifications.receiptFormat, 'notifications.receiptFormat');

  if (ctx.errors.length > 0) {
    return { valid: false, errors: ctx.errors, warnings: ctx.warnings };
  }
  return { valid: true, errors: ctx.errors, warnings: ctx.warnings, profile: input as InstitutionProfile };
}

/**
 * Validate and load a profile, throwing a {@link BadRequestHttpError} (with the collected issues in its
 * `errorCode`/metadata message) when invalid. Use this at the control-plane provisioning boundary where
 * an invalid profile must fail closed rather than be partially applied.
 */
export function loadInstitutionProfile(input: unknown): InstitutionProfile {
  const result = validateInstitutionProfile(input);
  if (!result.valid) {
    const summary = result.errors.map((issue): string => `${issue.path}: ${issue.code}`).join('; ');
    throw new BadRequestHttpError(`Invalid institution profile (fail closed): ${summary}`);
  }
  return result.profile!;
}
