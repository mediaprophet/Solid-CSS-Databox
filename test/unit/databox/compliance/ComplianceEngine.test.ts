/* eslint-disable max-len, @typescript-eslint/explicit-function-return-type */
import {
  AU_APPLICABILITY_PROFILES,
  AU_CONTROL_MAPPINGS,
  AU_INSTRUMENTS,
  AU_MAPPING_DIGESTS,
  AU_PROVISIONS,
} from '../../../../src/databox/compliance/AustralianComplianceRegistry';
import { ComplianceEngine } from '../../../../src/databox/compliance/ComplianceEngine';
import type { ComplianceEvaluationInput } from '../../../../src/databox/compliance/ComplianceEngine';
import { consumerObligations, createAuditExport, legalChangeImpact } from '../../../../src/databox/compliance/ComplianceViews';

const NOW = '2026-07-15T00:00:00.000Z';

function completeInput(): ComplianceEvaluationInput {
  return {
    facts: {
      jurisdiction: 'AU',
      handlesPersonalInformation: true,
      isAppEntity: true,
      isCdrParticipant: false,
      disclosesOverseas: false,
    },
    controlTests: AU_CONTROL_MAPPINGS.filter(mapping => mapping.profileId === 'au-privacy-app-entity')
      .flatMap(mapping => mapping.controlIds.map(controlId => ({
        controlId,
        outcome: 'satisfied' as const,
        testedAt: NOW,
        testId: `test:${controlId}`,
      }))),
    evidence: AU_CONTROL_MAPPINGS.filter(mapping => mapping.profileId === 'au-privacy-app-entity')
      .flatMap(mapping => mapping.evidence.map(requirement => ({
        requirementId: requirement.id,
        evidenceId: `record:${requirement.id}`,
        type: 'application/ld+json',
        observedAt: NOW,
        verified: true,
      }))),
    attestations: [{
      mappingIds: AU_CONTROL_MAPPINGS.filter(mapping => mapping.profileId === 'au-privacy-app-entity')
        .map(mapping => mapping.id),
      mappingDigests: AU_MAPPING_DIGESTS,
      reviewerId: 'did:web:legal.example:reviewers:1',
      reviewerRole: 'Australian legal reviewer',
      reviewedAt: '2026-07-14T00:00:00.000Z',
      validUntil: '2026-10-15T00:00:00.000Z',
      decision: 'approved',
      instrumentDigests: Object.fromEntries(AU_INSTRUMENTS.map(instrument => [ instrument.id, instrument.corpusSha256 ])),
    }],
    now: NOW,
  };
}

describe('ComplianceEngine', (): void => {
  it('has unique, referentially complete registry entries.', (): void => {
    expect(new Set(AU_PROVISIONS.map(provision => provision.id)).size).toBe(AU_PROVISIONS.length);
    expect(new Set(AU_CONTROL_MAPPINGS.map(mapping => mapping.id)).size).toBe(AU_CONTROL_MAPPINGS.length);
    for (const mapping of AU_CONTROL_MAPPINGS) {
      expect(AU_APPLICABILITY_PROFILES.some(profile => profile.id === mapping.profileId)).toBe(true);
      expect(mapping.provisionIds.every(id => AU_PROVISIONS.some(provision => provision.id === id))).toBe(true);
    }
    expect(AU_PROVISIONS.every(provision =>
      AU_CONTROL_MAPPINGS.some(mapping => mapping.provisionIds.includes(provision.id)))).toBe(true);
  });

  it('fails closed when organization applicability facts are unresolved.', (): void => {
    const result = new ComplianceEngine().publicationGate({
      facts: { jurisdiction: 'AU' },
      controlTests: [],
      evidence: [],
      attestations: [],
      now: NOW,
    });
    expect(result.allowed).toBe(false);
    expect(result.assessment.unresolvedFacts).toEqual(expect.arrayContaining([ 'isAppEntity', 'isCdrParticipant' ]));
  });

  it('fails closed when nested organization applicability facts are unresolved.', (): void => {
    const result = new ComplianceEngine().publicationGate({
      facts: {
        jurisdiction: 'AU',
        isAppEntity: true,
        handlesPersonalInformation: true,
        isCdrParticipant: true,
      },
      controlTests: [],
      evidence: [],
      attestations: [],
      now: NOW,
    });
    expect(result.allowed).toBe(false);
    expect(result.assessment.unresolvedFacts).toEqual(expect.arrayContaining([ 'disclosesOverseas', 'operatesConsumerDashboard' ]));
  });

  it('resolves applicability correctly for non-AU jurisdictions and false flags.', (): void => {
    const engine = new ComplianceEngine();
    
    // Jurisdiction not AU -> not-applicable
    let result = engine.evaluate({
      facts: { jurisdiction: 'US' },
      controlTests: [],
      evidence: [],
      attestations: [],
      now: NOW,
    });
    expect(result.mappings.every(m => m.outcome === 'not-applicable')).toBe(true);

    // AU but false flags
    result = engine.evaluate({
      facts: {
        jurisdiction: 'AU',
        isAppEntity: false,
        handlesPersonalInformation: false,
        isCdrParticipant: false,
      },
      controlTests: [],
      evidence: [],
      attestations: [],
      now: NOW,
    });
    expect(result.mappings.every(m => m.outcome === 'not-applicable')).toBe(true);

    // True flags (applicable)
    result = engine.evaluate({
      facts: {
        jurisdiction: 'AU',
        isAppEntity: true,
        handlesPersonalInformation: true,
        isCdrParticipant: true,
        disclosesOverseas: true,
        operatesConsumerDashboard: true,
      },
      controlTests: [],
      evidence: [],
      attestations: [],
      now: NOW,
    });
    // With true flags and no controls provided, everything should be indeterminate.
    expect(result.mappings.every(m => m.outcome === 'indeterminate')).toBe(true);

    // True participant, but false dashboard
    result = engine.evaluate({
      facts: {
        jurisdiction: 'AU',
        isCdrParticipant: true,
        operatesConsumerDashboard: false,
      },
      controlTests: [],
      evidence: [],
      attestations: [],
      now: NOW,
    });
    // Dashboard should be not-applicable
    expect(result.mappings.some(m => m.mappingId === 'cdr-consumer-dashboard' && m.outcome === 'not-applicable')).toBe(true);
  });

  it('covers all unresolvedFacts branches directly.', (): void => {
    const emptyFacts = {};
    const fullFacts = {
      isAppEntity: true,
      handlesPersonalInformation: true,
      isCdrParticipant: true,
      disclosesOverseas: true,
      operatesConsumerDashboard: true,
    };
    
    for (const profile of AU_APPLICABILITY_PROFILES) {
      if (profile.unresolvedFacts) {
        // Trigger the undefined branches
        expect(profile.unresolvedFacts(emptyFacts).length).toBeGreaterThan(0);
        // Trigger the defined (empty array) branches
        expect(profile.unresolvedFacts(fullFacts).length).toBe(0);
      }
    }
  });

  it('blocks publication when controls or evidence are missing.', (): void => {
    const input = completeInput();
    const result = new ComplianceEngine().publicationGate({ ...input, controlTests: [], evidence: []});
    expect(result.allowed).toBe(false);
    expect(result.blockers).toContain('Mapping privacy-governance is indeterminate.');
  });

  it('allows an attested release only when all applicable controls and evidence pass.', (): void => {
    const result = new ComplianceEngine().publicationGate(completeInput());
    expect(result.allowed).toBe(true);
    expect(result.assessment.legalClaimPermitted).toBe(true);
  });

  it('invalidates an attestation if its pinned corpus digest is stale.', (): void => {
    const input = completeInput();
    const stale = { ...input.attestations[0], instrumentDigests: { 'privacy-act-1988-c2026c00227': 'stale' }};
    const result = new ComplianceEngine().publicationGate({ ...input, attestations: [ stale ]});
    expect(result.allowed).toBe(false);
    expect(result.blockers.at(-1)).toContain('human legal-review attestation');
  });

  it('invalidates an attestation if reviewed mapping content is not pinned.', (): void => {
    const input = completeInput();
    const stale = { ...input.attestations[0], mappingDigests: { ...AU_MAPPING_DIGESTS, 'privacy-governance': 'stale' }};
    const result = new ComplianceEngine().publicationGate({ ...input, attestations: [ stale ]});
    expect(result.allowed).toBe(false);
  });

  it('requires verified evidence with an accepted media type and a current timestamp.', (): void => {
    const input = completeInput();
    const wrongType = { ...input.evidence[0], type: 'text/plain' };
    const future = { ...input.evidence[1], observedAt: '2027-01-01T00:00:00.000Z' };
    const result = new ComplianceEngine().publicationGate({
      ...input,
      evidence: [ wrongType, future, ...input.evidence.slice(2) ],
    });
    expect(result.allowed).toBe(false);
    expect(result.assessment.mappings[0].outcome).toBe('indeterminate');
  });

  it('uses the latest valid control result instead of an earlier conflicting result.', (): void => {
    const input = completeInput();
    const controlId = input.controlTests[0].controlId;
    const earlierFailure = {
      controlId,
      outcome: 'not-satisfied' as const,
      testedAt: '2026-07-13T00:00:00.000Z',
      testId: 'earlier-failure',
    };
    const result = new ComplianceEngine().publicationGate({
      ...input,
      controlTests: [ earlierFailure, ...input.controlTests ],
    });
    expect(result.allowed).toBe(true);
  });

  it('fails closed when equally recent control results conflict.', (): void => {
    const input = completeInput();
    const conflict = {
      ...input.controlTests[0],
      outcome: 'not-satisfied' as const,
      testId: 'same-time-conflict',
    };
    const result = new ComplianceEngine().publicationGate({
      ...input,
      controlTests: [ conflict, ...input.controlTests ],
    });
    expect(result.allowed).toBe(false);
    expect(result.assessment.mappings[0].outcome).toBe('indeterminate');
  });

  it('fails closed for malformed evaluation timestamps.', (): void => {
    const input = completeInput();
    const result = new ComplianceEngine().publicationGate({ ...input, now: 'not-a-date' });
    expect(result.allowed).toBe(false);
    expect(result.assessment.evaluationErrors).toContain('Evaluation time must be a valid ISO-8601 instant.');
  });

  it('provides consumer obligations, deterministic audit exports, and digest-based change impact.', (): void => {
    const input = completeInput();
    const assessment = new ComplianceEngine().evaluate(input);
    const view = consumerObligations(input.facts);
    expect(view.some(entry => entry.id.startsWith('access-correction:'))).toBe(true);
    expect(new Set(view.map(entry => entry.id)).size).toBe(view.length);
    expect(view.every(entry => entry.source.officialSource.startsWith('https://www.legislation.gov.au/'))).toBe(true);
    expect(createAuditExport(assessment, input.attestations).digest)
      .toBe(createAuditExport(assessment, input.attestations).digest);
    expect(legalChangeImpact({})).toEqual(expect.arrayContaining([
      expect.objectContaining({ instrumentId: 'privacy-act-1988-c2026c00227' }),
    ]));
  });
});
