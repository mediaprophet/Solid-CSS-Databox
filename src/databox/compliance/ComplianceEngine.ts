import {
  AU_APPLICABILITY_PROFILES,
  AU_CONTROL_MAPPINGS,
  AU_INSTRUMENTS,
  AU_MAPPING_DIGESTS,
} from './AustralianComplianceRegistry';
import type {
  ComplianceAssessment,
  ControlTestResult,
  EvidenceRecord,
  LegalAttestation,
  MappingAssessment,
  ObligationControlMapping,
  OrganizationFacts,
  PublicationGateResult,
} from './ComplianceTypes';

export interface ComplianceEvaluationInput {
  readonly facts: OrganizationFacts;
  readonly controlTests: readonly ControlTestResult[];
  readonly evidence: readonly EvidenceRecord[];
  readonly attestations: readonly LegalAttestation[];
  readonly now: string;
}

/** Deterministic compliance-control assessment. This is decision support, not legal advice. */
export class ComplianceEngine {
  public evaluate(input: ComplianceEvaluationInput): ComplianceAssessment {
    const now = parseInstant(input.now);
    const evaluationErrors = now === undefined ? [ 'Evaluation time must be a valid ISO-8601 instant.' ] : [];
    const profileOutcomes: Record<string, 'applicable' | 'not-applicable' | 'indeterminate'> = {};
    const unresolved = new Set<string>();

    for (const profile of AU_APPLICABILITY_PROFILES) {
      const outcome = profile.predicate(input.facts);
      profileOutcomes[profile.id] = outcome;
      if (outcome === 'indeterminate') {
        for (const fact of profile.unresolvedFacts(input.facts)) {
          unresolved.add(fact);
        }
      }
    }

    const mappings = AU_CONTROL_MAPPINGS.map((mapping): MappingAssessment =>
      this.assessMapping(mapping, profileOutcomes[mapping.profileId], input, now));

    return {
      generatedAt: input.now,
      evaluationErrors,
      profileOutcomes,
      unresolvedFacts: [ ...unresolved ].sort(),
      mappings,
      legalClaimPermitted: evaluationErrors.length === 0 &&
        this.hasCurrentAttestation(input, now) &&
        mappings.every((mapping): boolean =>
          mapping.outcome === 'satisfied' || mapping.outcome === 'not-applicable'),
    };
  }

  public publicationGate(input: ComplianceEvaluationInput): PublicationGateResult {
    const assessment = this.evaluate(input);
    const blockers = [ ...assessment.evaluationErrors ];
    if (assessment.unresolvedFacts.length > 0) {
      blockers.push(`Unresolved applicability facts: ${assessment.unresolvedFacts.join(', ')}.`);
    }
    for (const entry of assessment.mappings.filter((entry): boolean =>
      entry.outcome === 'not-satisfied' || entry.outcome === 'indeterminate')) {
      blockers.push(`Mapping ${entry.mappingId} is ${entry.outcome}.`);
    }
    if (!this.hasCurrentAttestation(input, parseInstant(input.now))) {
      blockers.push('No current human legal-review attestation covers the applicable mappings and pinned digests.');
    }
    return { allowed: blockers.length === 0 && assessment.legalClaimPermitted, blockers, assessment };
  }

  private assessMapping(
    mapping: ObligationControlMapping,
    applicability: 'applicable' | 'not-applicable' | 'indeterminate' | undefined,
    input: ComplianceEvaluationInput,
    now: number | undefined,
  ): MappingAssessment {
    if (applicability === 'not-applicable') {
      return {
        mappingId: mapping.id,
        outcome: 'not-applicable',
        reasons: [ 'Applicability profile is not applicable.' ],
      };
    }
    if (applicability !== 'applicable') {
      return { mappingId: mapping.id, outcome: 'indeterminate', reasons: [ 'Applicability is unresolved.' ]};
    }
    if (now === undefined) {
      return { mappingId: mapping.id, outcome: 'indeterminate', reasons: [ 'Evaluation time is invalid.' ]};
    }

    const reasons: string[] = [];
    let failed = false;
    for (const controlId of mapping.controlIds) {
      const result = latestControlResult(input.controlTests, controlId, now);
      if (result === undefined) {
        reasons.push(`No current executable test result for control ${controlId}.`);
      } else if (result.outcome === 'not-satisfied') {
        failed = true;
        reasons.push(`Control ${controlId} failed.`);
      } else if (result.outcome === 'indeterminate') {
        reasons.push(`Control ${controlId} is indeterminate.`);
      }
    }

    for (const requirement of mapping.evidence) {
      const validEvidence = input.evidence.some((record): boolean =>
        record.requirementId === requirement.id &&
        requirement.acceptedTypes.includes(record.type) &&
        record.verified &&
        isCurrentEvidence(record, now));
      if (!validEvidence) {
        reasons.push(`Missing current, verified evidence with an accepted type: ${requirement.id}.`);
      }
    }

    let outcome: MappingAssessment['outcome'] = 'satisfied';
    if (failed) {
      outcome = 'not-satisfied';
    } else if (reasons.length > 0) {
      outcome = 'indeterminate';
    }
    return {
      mappingId: mapping.id,
      outcome,
      reasons,
    };
  }

  private hasCurrentAttestation(input: ComplianceEvaluationInput, now: number | undefined): boolean {
    if (now === undefined) {
      return false;
    }
    const applicableMappings = AU_CONTROL_MAPPINGS.filter((mapping): boolean =>
      AU_APPLICABILITY_PROFILES.find((profile): boolean => profile.id === mapping.profileId)?.predicate(input.facts) ===
      'applicable');
    if (applicableMappings.length === 0) {
      return false;
    }
    const applicableInstrumentIds = new Set(AU_APPLICABILITY_PROFILES.filter((profile): boolean =>
      applicableMappings.some((mapping): boolean => mapping.profileId === profile.id))
      .flatMap((profile): readonly string[] => profile.instrumentIds));

    return input.attestations.some((attestation): boolean => {
      const reviewedAt = parseInstant(attestation.reviewedAt);
      const validUntil = parseInstant(attestation.validUntil);
      return attestation.decision === 'approved' &&
        attestation.reviewerId.trim().length > 0 &&
        attestation.reviewerRole.trim().length > 0 &&
        reviewedAt !== undefined && reviewedAt <= now &&
        validUntil !== undefined && validUntil > now &&
        applicableMappings.every((mapping): boolean =>
          attestation.mappingIds.includes(mapping.id) &&
          attestation.mappingDigests[mapping.id] === AU_MAPPING_DIGESTS[mapping.id]) &&
          AU_INSTRUMENTS.filter((instrument): boolean => applicableInstrumentIds.has(instrument.id))
            .every((instrument): boolean =>
              attestation.instrumentDigests[instrument.id] === instrument.corpusSha256);
    });
  }
}

function latestControlResult(
  results: readonly ControlTestResult[],
  controlId: string,
  now: number,
): ControlTestResult | undefined {
  const candidates = results.filter((result): boolean => result.controlId === controlId)
    .map((result): { result: ControlTestResult; instant: number | undefined } => ({
      result,
      instant: parseInstant(result.testedAt),
    }))
    .filter((entry): entry is { result: ControlTestResult; instant: number } =>
      entry.instant !== undefined && entry.instant <= now)
    .sort((left, right): number =>
      right.instant - left.instant || left.result.testId.localeCompare(right.result.testId));
  const latest = candidates[0];
  if (latest === undefined) {
    return undefined;
  }
  const latestOutcomes = new Set(candidates.filter((entry): boolean => entry.instant === latest.instant)
    .map((entry): ControlTestResult['outcome'] => entry.result.outcome));
  return latestOutcomes.size === 1 ? latest.result : undefined;
}

function isCurrentEvidence(record: EvidenceRecord, now: number): boolean {
  const observedAt = parseInstant(record.observedAt);
  const validUntil = record.validUntil === undefined ? undefined : parseInstant(record.validUntil);
  return observedAt !== undefined && observedAt <= now &&
    (record.validUntil === undefined || (validUntil !== undefined && validUntil > now));
}

function parseInstant(value: string): number | undefined {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && value.includes('T') ? parsed : undefined;
}
