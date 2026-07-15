/* eslint-disable max-len, @typescript-eslint/explicit-function-return-type, unicorn/no-nested-ternary */
import type {
  ApplicabilityProfile,
  InstrumentRecord,
  ObligationControlMapping,
  ProvisionReference,
} from './ComplianceTypes';
import { complianceMappingDigest } from './ComplianceDigest';

const concept = 'https://ns.webcivics.net/concept/';

export const AU_INSTRUMENTS: readonly InstrumentRecord[] = [
  {
    id: 'privacy-act-1988-c2026c00227',
    registerId: 'C2026C00227',
    title: 'Privacy Act 1988',
    jurisdiction: 'AU',
    officialSource: 'https://www.legislation.gov.au/C2026C00227',
    corpusSource: 'https://ns.webcivics.net/institutions/au-fed-legislation/C2026C00227.n3',
    sourcePdfSha256: '443e895f1e1536763af78e4553d469b0857a84553ca0c011ed796a623f954e38',
    corpusSha256: '25dc392bc958e04ce001416f6615139de85ec0c2e0d794c6b1321e0a84fd7465',
    corpusCurationStatus: 'proposed',
    capturedAt: '2026-07-15',
  },
  {
    id: 'cdr-rules-f2025c00572',
    registerId: 'F2025C00572',
    title: 'Competition and Consumer (Consumer Data Right) Rules 2020',
    jurisdiction: 'AU',
    officialSource: 'https://www.legislation.gov.au/F2025C00572',
    corpusSource: 'https://ns.webcivics.net/institutions/au-fed-legislation/F2025C00572.n3',
    sourcePdfSha256: '41c43134efa21c780f61d5484d6fe700f8aaa5656887a0fa32896ab02fa83e8c',
    corpusSha256: 'c8abfd0bd3fe9597976cd9f86b58eb1b8d721b68ca15565e16698c36362841be',
    corpusCurationStatus: 'proposed',
    capturedAt: '2026-07-15',
  },
];

export const AU_PROVISIONS: readonly ProvisionReference[] = [
  provision('app-1', 'privacy-act-1988-c2026c00227', 'Schedule 1, APP 1', 'Open and transparent management of personal information', 'entries-found-privacy-act-1988-sch-1-sec-1'),
  provision('app-5', 'privacy-act-1988-c2026c00227', 'Schedule 1, APP 5', 'Notification of collection', 'entries-found-privacy-act-1988-sch-1-sec-5'),
  provision('app-6', 'privacy-act-1988-c2026c00227', 'Schedule 1, APP 6', 'Use or disclosure', 'entries-found-privacy-act-1988-sch-1-sec-6'),
  provision('app-8', 'privacy-act-1988-c2026c00227', 'Schedule 1, APP 8', 'Cross-border disclosure', 'entries-found-privacy-act-1988-sch-1-sec-8'),
  provision('app-10', 'privacy-act-1988-c2026c00227', 'Schedule 1, APP 10', 'Quality of personal information', 'entries-found-privacy-act-1988-sch-1-sec-10'),
  provision('app-11', 'privacy-act-1988-c2026c00227', 'Schedule 1, APP 11', 'Security of personal information', 'entries-found-privacy-act-1988-sch-1-sec-11'),
  provision('app-12', 'privacy-act-1988-c2026c00227', 'Schedule 1, APP 12', 'Access to personal information', 'entries-found-privacy-act-1988-sch-1-sec-12'),
  provision('app-13', 'privacy-act-1988-c2026c00227', 'Schedule 1, APP 13', 'Correction of personal information', 'entries-found-privacy-act-1988-sch-1-sec-13'),
  provision('ndb-assess-30-days', 'privacy-act-1988-c2026c00227', 's 26WH(2)', 'Complete suspected eligible data breach assessment within 30 days', 'entries-found-privacy-act-1988-sch-2-sec-26wh-ss-2'),
  provision('ndb-statement', 'privacy-act-1988-c2026c00227', 's 26WK(2)', 'Prepare statement and give copy to Commissioner', 'entries-found-privacy-act-1988-sch-2-sec-26wk-ss-2'),
  provision('ndb-notify', 'privacy-act-1988-c2026c00227', 's 26WL', 'Notify eligible data breach', 'entries-found-privacy-act-1988-sch-2-sec-26wl'),
  provision('cdr-correction-10-days', 'cdr-rules-f2025c00572', 'Schedule 4, rule 7.22', 'Acknowledge and correct CDR data within 10 business days', 'made-under-the-competition-and-consumer-act-2010-sch-4-sec-7-22'),
  provision('cdr-dashboard-accredited-person', 'cdr-rules-f2025c00572', 'rule 1.14', 'Accredited person must provide a consumer dashboard', 'made-under-the-competition-and-consumer-act-2010-sec-1-14'),
  provision('cdr-dashboard-data-holder', 'cdr-rules-f2025c00572', 'rule 1.15', 'Data holder must provide a consumer dashboard', 'made-under-the-competition-and-consumer-act-2010-sec-1-15'),
];

export const AU_APPLICABILITY_PROFILES: readonly ApplicabilityProfile[] = [
  {
    id: 'au-privacy-app-entity',
    title: 'Australian Privacy Act APP entity',
    instrumentIds: [ 'privacy-act-1988-c2026c00227' ],
    predicate: facts => facts.jurisdiction === 'AU' ?
      facts.isAppEntity === undefined || facts.handlesPersonalInformation === undefined ?
        'indeterminate' :
        facts.isAppEntity && facts.handlesPersonalInformation ? 'applicable' : 'not-applicable' :
      'not-applicable',
    unresolvedFacts: facts => [
      ...facts.isAppEntity === undefined ? [ 'isAppEntity' ] : [],
      ...facts.handlesPersonalInformation === undefined ? [ 'handlesPersonalInformation' ] : [],
    ],
  },
  {
    id: 'au-cdr-participant',
    title: 'Australian Consumer Data Right participant',
    instrumentIds: [ 'cdr-rules-f2025c00572' ],
    predicate: facts => facts.jurisdiction === 'AU' ?
      facts.isCdrParticipant === undefined ? 'indeterminate' : facts.isCdrParticipant ? 'applicable' : 'not-applicable' :
      'not-applicable',
    unresolvedFacts: facts => facts.isCdrParticipant === undefined ? [ 'isCdrParticipant' ] : [],
  },
  {
    id: 'au-privacy-overseas-disclosure',
    title: 'Australian Privacy Act overseas disclosure',
    instrumentIds: [ 'privacy-act-1988-c2026c00227' ],
    predicate: facts => facts.jurisdiction === 'AU' && facts.isAppEntity && facts.handlesPersonalInformation ?
      facts.disclosesOverseas === undefined ? 'indeterminate' : facts.disclosesOverseas ? 'applicable' : 'not-applicable' :
      'not-applicable',
    unresolvedFacts: facts => facts.disclosesOverseas === undefined ? [ 'disclosesOverseas' ] : [],
  },
  {
    id: 'au-cdr-dashboard-provider',
    title: 'Australian CDR consumer dashboard provider',
    instrumentIds: [ 'cdr-rules-f2025c00572' ],
    predicate: facts => facts.jurisdiction === 'AU' && facts.isCdrParticipant ?
      facts.operatesConsumerDashboard === undefined ?
        'indeterminate' :
        facts.operatesConsumerDashboard ? 'applicable' : 'not-applicable' :
      'not-applicable',
    unresolvedFacts: facts => facts.operatesConsumerDashboard === undefined ? [ 'operatesConsumerDashboard' ] : [],
  },
];

function standardEvidence(id: string, description: string) {
  return {
    id,
    description,
    acceptedTypes: [ 'application/ld+json', 'application/json', 'text/turtle' ],
  };
}

export const AU_CONTROL_MAPPINGS: readonly ObligationControlMapping[] = [
  mapping('privacy-governance', 'au-privacy-app-entity', [ 'app-1' ], 'Privacy governance and notice', 'The organization must explain how it manages personal information.', [ 'CTRL-PRIVACY-POLICY', 'CTRL-CONSUMER-INFORMATION' ]),
  mapping('collection-notice', 'au-privacy-app-entity', [ 'app-5' ], 'Collection notice', 'The organization must provide required information when collecting personal information.', [ 'CTRL-COLLECTION-NOTICE' ]),
  mapping('purpose-limitation', 'au-privacy-app-entity', [ 'app-6' ], 'Purpose-limited use and disclosure', 'The organization must constrain use and disclosure to an authorized purpose or exception.', [ 'CTRL-POLICY-EVALUATION', 'CTRL-DUTY-ENGINE' ]),
  mapping('cross-border-disclosure', 'au-privacy-overseas-disclosure', [ 'app-8' ], 'Cross-border disclosure', 'Before disclosing personal information overseas, the organization must assess and govern the disclosure and applicable exceptions.', [ 'CTRL-OVERSEAS-DISCLOSURE', 'CTRL-OVERSEAS-ACCOUNTABILITY' ]),
  mapping('data-quality-security', 'au-privacy-app-entity', [ 'app-10', 'app-11' ], 'Data quality and security', 'The organization must maintain data quality and protect personal information.', [ 'CTRL-QUALITY-CHECK', 'CTRL-SECURITY-CONTROLS' ]),
  mapping('access-correction', 'au-privacy-app-entity', [ 'app-12', 'app-13' ], 'Access and correction workflow', 'An individual must have a usable route to request access to and correction of personal information.', [ 'CTRL-ACCESS-REQUEST', 'CTRL-CORRECTION-WORKFLOW', 'CTRL-REVIEW-REMEDY' ]),
  {
    ...mapping('eligible-breach-response', 'au-privacy-app-entity', [ 'ndb-assess-30-days', 'ndb-statement', 'ndb-notify' ], 'Eligible data breach response', 'The organization must assess suspected eligible data breaches and, when required, notify.', [ 'CTRL-BREACH-TRIAGE', 'CTRL-BREACH-ASSESSMENT', 'CTRL-BREACH-NOTIFICATION' ]),
    deadline: { amount: 30, unit: 'calendar-days', startsOn: 'awareness of reasonable grounds to suspect an eligible data breach', qualification: 'Assessment deadline; notification triggers and exceptions require separate evaluation.' },
    exceptions: [ 'Remedial action, secrecy provisions, Commissioner declarations and other statutory exceptions require review.' ],
  },
  {
    ...mapping('cdr-correction', 'au-cdr-participant', [ 'cdr-correction-10-days' ], 'CDR correction request', 'A CDR consumer must be able to request correction and receive the required response.', [ 'CTRL-CDR-CORRECTION', 'CTRL-CDR-ACKNOWLEDGEMENT' ]),
    deadline: { amount: 10, unit: 'business-days', startsOn: 'receipt of a qualifying CDR correction request' },
  },
  mapping('cdr-consumer-dashboard', 'au-cdr-dashboard-provider', [ 'cdr-dashboard-accredited-person', 'cdr-dashboard-data-holder' ], 'CDR consumer dashboard', 'A qualifying CDR consumer must be provided the applicable dashboard showing relevant authorizations and disclosures.', [ 'CTRL-CDR-DASHBOARD' ]),
];

/** Digests that legal attestations must pin to the exact mapping content reviewed. */
export const AU_MAPPING_DIGESTS: Readonly<Record<string, string>> = Object.fromEntries(
  AU_CONTROL_MAPPINGS.map(mappingEntry => [ mappingEntry.id, complianceMappingDigest(mappingEntry) ]),
);

function provision(id: string, instrumentId: string, citation: string, label: string, slug: string): ProvisionReference {
  return { id, instrumentId, citation, label, corpusConcept: `${concept}${slug}` };
}

function mapping(id: string, profileId: string, provisionIds: readonly string[], title: string, consumerStatement: string, controlIds: readonly string[]): ObligationControlMapping {
  return {
    id,
    profileId,
    provisionIds,
    title,
    consumerStatement,
    controlIds,
    trigger: 'When the applicability profile and provision-specific conditions are satisfied.',
    exceptions: [ 'Any statutory exception must be recorded and human-reviewed before relying on it.' ],
    remedy: 'Escalate to the governed review queue; preserve evidence and provide complaint/redress information.',
    evidence: controlIds.map(controlId => standardEvidence(`evidence:${controlId}`, `Verified execution evidence for ${controlId}.`)),
    reviewStatus: 'proposed',
  };
}
