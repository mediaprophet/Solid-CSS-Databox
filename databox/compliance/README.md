# Compliance decision-support framework

This directory and `src/databox/compliance/` implement a fail-closed compliance
decision-support layer for the Databox extension. It does not declare that an
organization or deployment complies with law.

The initial Australian registry pins the Privacy Act 1988 compilation
`C2026C00227` and the Consumer Data Right Rules compilation `F2025C00572` to
both Federal Register URLs and SHA-256 digests from the local Web Civics corpus.
Every obligation mapping is `proposed` until an appropriately qualified human
reviews applicability, citations, exceptions, deadlines, controls and evidence.

## Workflow

1. Record organization facts. Missing facts produce `indeterminate`, never an
   assumption of applicability or non-applicability.
2. Run executable control tests and collect typed, verified evidence records.
3. Review proposed provision-to-control mappings and statutory exceptions.
4. Issue a time-bounded attestation pinning every applicable mapping's canonical
   SHA-256 digest and every applicable instrument corpus digest. Reviewer identity
   and role must be retained.
5. Call `ComplianceEngine.publicationGate`. A legal-compliance publication is
   blocked by unresolved applicability, failed/unknown controls, missing or
   expired evidence, unacceptable evidence media types, future or malformed
   timestamps, stale mapping or corpus digests, or absent/expired human attestation.
6. Publish the consumer obligation view and deterministic audit export alongside
   the release. Technical releases that make no legal claim remain a separate gate.

`legalChangeImpact` detects corpus digest changes and lists mappings needing
review. It does not infer whether the law's meaning changed.

The RDF vocabulary and executable SHACL shapes use
`https://dev.linkeddata.au/def/solid-databox-compliance#`. Web Civics concept
URLs remain source-corpus identifiers and are not the Databox vocabulary root.

## Source and copyright boundary

The Federal Register source instruments retain their own legal status, source
terms and copyright position. The Web Civics RDF/N3 corpus is derived technical
work and is linked separately. Community Solid Server code remains governed by
its repository licence. Do not describe the software licence as licensing the
underlying legislation.
