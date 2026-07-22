/* eslint-disable max-len */
import {
  AU_APPLICABILITY_PROFILES,
  AU_CONTROL_MAPPINGS,
  AU_INSTRUMENTS,
  AU_MAPPING_DIGESTS,
  AU_PROVISIONS,
} from './AustralianComplianceRegistry';
import { sha256Canonical } from './ComplianceDigest';
import type { ComplianceAssessment, LegalAttestation, OrganizationFacts } from './ComplianceTypes';

export interface ConsumerObligationView {
  readonly id: string;
  readonly title: string;
  readonly whatTheOrganizationMustProvide: string;
  readonly source: { readonly citation: string; readonly officialSource: string; readonly corpusConcept: string };
  readonly deadline?: string;
  readonly remedy: string;
  readonly legalReviewStatus: 'proposed';
}

export function consumerObligations(facts: OrganizationFacts): readonly ConsumerObligationView[] {
  return AU_CONTROL_MAPPINGS.filter(mapping =>
    AU_APPLICABILITY_PROFILES.find(profile => profile.id === mapping.profileId)?.predicate(facts) === 'applicable')
    .flatMap(mapping => mapping.provisionIds.map((id): ConsumerObligationView => {
      const provision = AU_PROVISIONS.find(candidate => candidate.id === id);
      const instrument = provision && AU_INSTRUMENTS.find(candidate => candidate.id === provision.instrumentId);
      if (!provision || !instrument) {
        throw new Error(`Compliance registry integrity failure for provision '${id}'.`);
      }
      return {
        id: `${mapping.id}:${provision.id}`,
        title: mapping.title,
        whatTheOrganizationMustProvide: mapping.consumerStatement,
        source: { citation: provision.citation, officialSource: instrument.officialSource, corpusConcept: provision.corpusConcept },
        ...mapping.deadline === undefined ? {} : { deadline: `${mapping.deadline.amount} ${mapping.deadline.unit} from ${mapping.deadline.startsOn}` },
        remedy: mapping.remedy,
        legalReviewStatus: 'proposed',
      };
    }));
}

export interface ComplianceAuditExport {
  readonly type: 'DataboxComplianceAuditExport';
  readonly version: 1;
  readonly assessment: ComplianceAssessment;
  readonly attestations: readonly LegalAttestation[];
  readonly instruments: typeof AU_INSTRUMENTS;
  readonly mappingDigests: typeof AU_MAPPING_DIGESTS;
  readonly digest: string;
}

export function createAuditExport(assessment: ComplianceAssessment, attestations: readonly LegalAttestation[]): ComplianceAuditExport {
  const body = {
    type: 'DataboxComplianceAuditExport' as const,
    version: 1 as const,
    assessment,
    attestations,
    instruments: AU_INSTRUMENTS,
    mappingDigests: AU_MAPPING_DIGESTS,
  };
  return { ...body, digest: sha256Canonical(body) };
}

/** Reports mappings affected by changed corpus hashes; it does not infer changed legal meaning. */
export function legalChangeImpact(previousDigests: Readonly<Record<string, string>>): readonly {
  instrumentId: string;
  mappingIds: readonly string[];
  reason: string;
}[] {
  return AU_INSTRUMENTS.filter(instrument => previousDigests[instrument.id] !== instrument.corpusSha256)
    .map(instrument => ({
      instrumentId: instrument.id,
      mappingIds: AU_CONTROL_MAPPINGS.filter(mapping => mapping.provisionIds.some(id =>
        AU_PROVISIONS.find(provision => provision.id === id)?.instrumentId === instrument.id)).map(mapping => mapping.id),
      reason: previousDigests[instrument.id] === undefined ? 'new-instrument' : 'corpus-digest-changed',
    }));
}
