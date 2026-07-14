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
 * The versioned, declarative JSON Schema (draft-07) for the institution/program profile (DBX-06).
 *
 * This is the machine-readable, tool-consumable statement of the profile shape. It is intentionally
 * `additionalProperties: false` everywhere to document the fail-closed stance (unknown fields are
 * rejected). It mirrors the enums the runtime {@link validateInstitutionProfile} enforces (imported
 * here so the schema and validator cannot drift); the runtime validator additionally enforces the
 * cross-field invariants a structural schema cannot express (assurance satisfiability, program-bound
 * audience, dangling policy references, destructive retention, Blocked-feature rejection).
 *
 * `$id` carries the schema version so a consumer can pin it.
 */
export const INSTITUTION_PROFILE_JSON_SCHEMA = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  $id: `urn:solid-server:databox:profile:${INSTITUTION_PROFILE_SCHEMA_VERSION}`,
  title: 'Databox institution/program profile',
  type: 'object',
  additionalProperties: false,
  required: [
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
  ],
  definitions: {
    accountableParty: {
      type: 'object',
      additionalProperties: false,
      required: [ 'id', 'legalName', 'jurisdiction' ],
      properties: {
        id: { type: 'string', minLength: 1 },
        legalName: { type: 'string', minLength: 1 },
        jurisdiction: { type: 'string', minLength: 1 },
        contact: { type: 'string', minLength: 1 },
      },
    },
    assuranceRequirement: {
      type: 'object',
      additionalProperties: false,
      required: [ 'dimension', 'minLevel' ],
      properties: {
        dimension: { type: 'string', enum: [ ...ASSURANCE_DIMENSIONS ]},
        minLevel: { type: 'integer', minimum: 0 },
      },
    },
  },
  properties: {
    schemaVersion: { const: INSTITUTION_PROFILE_SCHEMA_VERSION },
    profileId: { type: 'string', minLength: 1 },
    profileVersion: { type: 'string', minLength: 1 },
    synthetic: { type: 'boolean' },
    effectiveInterval: {
      type: 'object',
      additionalProperties: false,
      required: [ 'effectiveFrom' ],
      properties: {
        effectiveFrom: { type: 'string', minLength: 1 },
        effectiveUntil: { type: 'string', minLength: 1 },
      },
    },
    program: {
      type: 'object',
      additionalProperties: false,
      required: [ 'principal', 'accountableParty' ],
      properties: {
        principal: { $ref: '#/definitions/accountableParty' },
        accountableParty: { $ref: '#/definitions/accountableParty' },
      },
    },
    processors: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: [ 'id', 'legalName', 'jurisdiction', 'purposes', 'readsPayload' ],
        properties: {
          id: { type: 'string', minLength: 1 },
          legalName: { type: 'string', minLength: 1 },
          jurisdiction: { type: 'string', minLength: 1 },
          purposes: { type: 'array', items: { type: 'string', minLength: 1 }},
          readsPayload: { type: 'boolean' },
        },
      },
    },
    tenancy: {
      type: 'object',
      additionalProperties: false,
      required: [ 'deploymentModel', 'origin', 'tokenAudience' ],
      properties: {
        deploymentModel: { type: 'string', enum: [ ...DEPLOYMENT_MODELS ]},
        origin: { type: 'string', format: 'uri' },
        tokenAudience: { type: 'string', format: 'uri' },
      },
    },
    crypto: {
      type: 'object',
      additionalProperties: false,
      required: [ 'signingSuite', 'signingKeyRef', 'atRestEncryption', 'applicationLevelEncryption' ],
      properties: {
        signingSuite: { type: 'string', minLength: 1 },
        signingKeyRef: { type: 'string', minLength: 1 },
        atRestEncryption: {
          type: 'object',
          additionalProperties: false,
          required: [ 'required', 'perTenantKeys' ],
          properties: {
            required: { type: 'boolean' },
            perTenantKeys: { type: 'boolean' },
          },
        },
        applicationLevelEncryption: { type: 'string', enum: [ ...APP_ENCRYPTION_MODES ]},
      },
    },
    identityProviders: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: [ 'id', 'issuer', 'protocol', 'claimContract' ],
        properties: {
          id: { type: 'string', minLength: 1 },
          issuer: { type: 'string', format: 'uri' },
          protocol: { type: 'string', minLength: 1 },
          accreditation: { type: 'string', minLength: 1 },
          claimContract: { type: 'array', items: { type: 'string', minLength: 1 }},
        },
      },
    },
    assuranceMappings: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: [ 'issuer', 'dimension', 'claim', 'level' ],
        properties: {
          issuer: { type: 'string', minLength: 1 },
          dimension: { type: 'string', enum: [ ...ASSURANCE_DIMENSIONS ]},
          claim: { type: 'string', minLength: 1 },
          level: { type: 'integer', minimum: 0 },
        },
      },
    },
    tokenBroker: {
      type: 'object',
      additionalProperties: false,
      required: [ 'adopted' ],
      properties: {
        adopted: { type: 'boolean' },
        brokerOrigin: { type: 'string', format: 'uri' },
        tokenExchange: { type: 'string', minLength: 1 },
        senderConstraint: { type: 'string', enum: [ ...SENDER_CONSTRAINTS ]},
      },
    },
    offlineGrantPolicy: {
      type: 'object',
      additionalProperties: false,
      required: [ 'allowOffline' ],
      properties: {
        allowOffline: { type: 'boolean' },
        maxOfflineMinutes: { type: 'integer', minimum: 1 },
      },
    },
    recordClasses: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'id',
          'label',
          'minimumAssurance',
          'policyTemplate',
          'legalBasis',
          'purposes',
          'existenceVisibility',
        ],
        properties: {
          id: { type: 'string', minLength: 1 },
          label: { type: 'string', minLength: 1 },
          minimumAssurance: { type: 'array', items: { $ref: '#/definitions/assuranceRequirement' }},
          policyTemplate: { type: 'string', minLength: 1 },
          legalBasis: { type: 'string', minLength: 1 },
          purposes: { type: 'array', items: { type: 'string', minLength: 1 }},
          existenceVisibility: { type: 'string', enum: [ ...EXISTENCE_VISIBILITIES ]},
        },
      },
    },
    submissionClasses: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: [ 'id', 'label', 'minimumAssurance', 'policyTemplate', 'purposes' ],
        properties: {
          id: { type: 'string', minLength: 1 },
          label: { type: 'string', minLength: 1 },
          minimumAssurance: { type: 'array', items: { $ref: '#/definitions/assuranceRequirement' }},
          policyTemplate: { type: 'string', minLength: 1 },
          purposes: { type: 'array', items: { type: 'string', minLength: 1 }},
        },
      },
    },
    policies: {
      type: 'object',
      additionalProperties: false,
      required: [ 'templates', 'conflictStrategy', 'effectiveTimeBehavior' ],
      properties: {
        templates: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: [ 'id', 'version', 'odrlProfile' ],
            properties: {
              id: { type: 'string', minLength: 1 },
              version: { type: 'string', minLength: 1 },
              odrlProfile: { type: 'string', minLength: 1 },
            },
          },
        },
        conflictStrategy: { type: 'string', enum: [ ...CONFLICT_STRATEGIES ]},
        effectiveTimeBehavior: { type: 'string', enum: [ ...EFFECTIVE_TIME_BEHAVIORS ]},
        retroactiveAuthorized: { type: 'boolean' },
      },
    },
    compiledPolicy: {
      type: 'object',
      additionalProperties: false,
      required: [
        'compiledPolicyDigest',
        'corpusManifestDigest',
        'attestationId',
        'evaluatorVersion',
        'profileDigest',
        'attestationStatus',
      ],
      properties: {
        compiledPolicyDigest: { type: 'string', minLength: 1 },
        corpusManifestDigest: { type: 'string', minLength: 1 },
        attestationId: { type: 'string', minLength: 1 },
        evaluatorVersion: { type: 'string', minLength: 1 },
        profileDigest: { type: 'string', minLength: 1 },
        attestationStatus: { type: 'string', enum: [ 'proposed', 'attested' ]},
        legalComplianceClaimed: { type: 'boolean' },
      },
    },
    legislativeCorpus: {
      type: 'object',
      additionalProperties: false,
      required: [ 'manifestDigest', 'entries' ],
      properties: {
        manifestDigest: { type: 'string', minLength: 1 },
        entries: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: [ 'sourceUri', 'jurisdiction', 'expressionVersion', 'retrievedAt', 'mediaType', 'contentDigest' ],
            properties: {
              sourceUri: { type: 'string', format: 'uri' },
              jurisdiction: { type: 'string', minLength: 1 },
              expressionVersion: { type: 'string', minLength: 1 },
              retrievedAt: { type: 'string', minLength: 1 },
              mediaType: { type: 'string', minLength: 1 },
              contentDigest: { type: 'string', minLength: 1 },
            },
          },
        },
      },
    },
    legalBases: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: [ 'id', 'description' ],
        properties: {
          id: { type: 'string', minLength: 1 },
          description: { type: 'string', minLength: 1 },
        },
      },
    },
    declaredPurposes: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: [ 'id', 'description' ],
        properties: {
          id: { type: 'string', minLength: 1 },
          description: { type: 'string', minLength: 1 },
        },
      },
    },
    retention: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: [ 'recordClass', 'retentionDays', 'deletionMode', 'tombstoneOnExpiry' ],
        properties: {
          recordClass: { type: 'string', minLength: 1 },
          retentionDays: { type: 'integer', minimum: 1 },
          deletionMode: { type: 'string', enum: [ ...DELETION_MODES ]},
          tombstoneOnExpiry: { type: 'boolean' },
        },
      },
    },
    systemsOfRecord: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: [ 'id', 'label', 'recordClasses' ],
        properties: {
          id: { type: 'string', minLength: 1 },
          label: { type: 'string', minLength: 1 },
          recordClasses: { type: 'array', items: { type: 'string', minLength: 1 }},
        },
      },
    },
    notifications: {
      type: 'object',
      additionalProperties: false,
      required: [ 'notificationFormat', 'receiptFormat' ],
      properties: {
        notificationFormat: { type: 'string', minLength: 1 },
        receiptFormat: { type: 'string', minLength: 1 },
      },
    },
    redress: {
      type: 'object',
      additionalProperties: false,
      required: [ 'stepUpSupported', 'appealRoutes', 'existenceVisibilityDefault' ],
      properties: {
        stepUpSupported: { type: 'boolean' },
        existenceVisibilityDefault: { type: 'string', enum: [ ...EXISTENCE_VISIBILITIES ]},
        correctionResponseDays: { type: 'integer', minimum: 1 },
        appealRoutes: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: [ 'id', 'responsibleBody', 'filingMethod' ],
            properties: {
              id: { type: 'string', minLength: 1 },
              responsibleBody: { type: 'string', minLength: 1 },
              filingMethod: { type: 'string', minLength: 1 },
            },
          },
        },
      },
    },
  },
} as const;
