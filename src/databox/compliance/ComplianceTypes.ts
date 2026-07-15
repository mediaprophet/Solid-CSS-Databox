/** A legal mapping is never executable as an asserted compliance claim before review. */
export type LegalReviewStatus = 'proposed' | 'in-review' | 'attested' | 'rejected' | 'superseded';

export type ApplicabilityOutcome = 'applicable' | 'not-applicable' | 'indeterminate';
export type ControlOutcome = 'satisfied' | 'not-satisfied' | 'indeterminate' | 'not-applicable';

export interface InstrumentRecord {
  readonly id: string;
  readonly registerId: string;
  readonly title: string;
  readonly jurisdiction: 'AU';
  readonly officialSource: string;
  readonly corpusSource: string;
  readonly sourcePdfSha256: string;
  readonly corpusSha256: string;
  readonly corpusCurationStatus: 'proposed';
  readonly capturedAt: string;
}

export interface ProvisionReference {
  readonly id: string;
  readonly instrumentId: string;
  readonly citation: string;
  readonly label: string;
  readonly corpusConcept: string;
}

export interface OrganizationFacts {
  readonly jurisdiction: string;
  readonly handlesPersonalInformation?: boolean;
  readonly isAppEntity?: boolean;
  readonly isCdrParticipant?: boolean;
  readonly disclosesOverseas?: boolean;
  readonly operatesConsumerDashboard?: boolean;
}

export interface ApplicabilityProfile {
  readonly id: string;
  readonly title: string;
  readonly instrumentIds: readonly string[];
  readonly predicate: (facts: OrganizationFacts) => ApplicabilityOutcome;
  readonly unresolvedFacts: (facts: OrganizationFacts) => readonly string[];
}

export interface Deadline {
  readonly amount: number;
  readonly unit: 'calendar-days' | 'business-days';
  readonly startsOn: string;
  readonly qualification?: string;
}

export interface EvidenceRequirement {
  readonly id: string;
  readonly description: string;
  readonly acceptedTypes: readonly string[];
}

export interface ObligationControlMapping {
  readonly id: string;
  readonly profileId: string;
  readonly provisionIds: readonly string[];
  readonly title: string;
  readonly consumerStatement: string;
  readonly trigger: string;
  readonly exceptions: readonly string[];
  readonly remedy: string;
  readonly deadline?: Deadline;
  readonly controlIds: readonly string[];
  readonly evidence: readonly EvidenceRequirement[];
  readonly reviewStatus: LegalReviewStatus;
}

export interface EvidenceRecord {
  readonly requirementId: string;
  readonly evidenceId: string;
  readonly type: string;
  readonly observedAt: string;
  readonly validUntil?: string;
  readonly verified: boolean;
}

export interface ControlTestResult {
  readonly controlId: string;
  readonly outcome: Exclude<ControlOutcome, 'not-applicable'>;
  readonly testedAt: string;
  readonly testId: string;
}

export interface LegalAttestation {
  readonly mappingIds: readonly string[];
  readonly mappingDigests: Readonly<Record<string, string>>;
  readonly reviewerId: string;
  readonly reviewerRole: string;
  readonly reviewedAt: string;
  readonly validUntil: string;
  readonly instrumentDigests: Readonly<Record<string, string>>;
  readonly decision: 'approved' | 'rejected';
}

export interface MappingAssessment {
  readonly mappingId: string;
  readonly outcome: ControlOutcome;
  readonly reasons: readonly string[];
}

export interface ComplianceAssessment {
  readonly generatedAt: string;
  readonly evaluationErrors: readonly string[];
  readonly profileOutcomes: Readonly<Record<string, ApplicabilityOutcome>>;
  readonly unresolvedFacts: readonly string[];
  readonly mappings: readonly MappingAssessment[];
  readonly legalClaimPermitted: boolean;
}

export interface PublicationGateResult {
  readonly allowed: boolean;
  readonly blockers: readonly string[];
  readonly assessment: ComplianceAssessment;
}
