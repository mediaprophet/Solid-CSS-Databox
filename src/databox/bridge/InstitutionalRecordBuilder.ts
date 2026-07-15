import type { KeyObject } from 'node:crypto';
import { createHash } from 'node:crypto';
import { APPLICATION_LD_JSON } from '../../util/ContentTypes';
import { ensureTrailingSlash } from '../../util/PathUtil';
import { CONNECTION_CREDENTIAL_ALG } from '../credential/ConnectionCredentialTypes';
import { sha256Hex, signCompactJws } from '../credential/Es256';
import type { PolicyRefClaim } from '../gateway/GatewayTypes';
import type { RelationshipRecord } from '../provisioning/ProvisioningTypes';
import type {
  InstitutionalRecord,
  ProgramServiceIdentity,
  SignedInstitutionalRecord,
  SourceEvent,
} from './BridgeTypes';

/**
 * Transform a synthetic source event into a **signed institutional record** ready for deposit (component
 * C21; ADR-0016 "institutional records are signed", ADR-0017 §Deposits). It reuses the DBX-08 fixture record
 * shape and the hardened {@link ../credential/Es256} signing primitive (no new raw crypto), and holds two
 * invariants:
 *
 * - **No raw customerID (invariant 2).** The record is addressed by the OPAQUE relationship/box from the
 *   resolved {@link RelationshipRecord}; the resource id is an opaque hash of the relationship + source-event
 *   id. The raw `customerId` never enters the envelope, the resource URI or the signature.
 * - **The signature binds the exact bytes.** The body is the exact `JSON.stringify` of the envelope; the
 *   ES256 JWS binds `urn:sha256:<digest-of-those-bytes>`, so the gateway's signature check authenticates
 *   THIS payload and nothing else. The gateway digests the same bytes unchanged.
 */
export class InstitutionalRecordBuilder {
  private readonly identity: ProgramServiceIdentity;
  private readonly signingKey: KeyObject;
  private readonly clock: () => string;

  /** The `identity` is the bridge's service identity; `signingKey` is its ES256 (P-256) private key. */
  public constructor(
    identity: ProgramServiceIdentity,
    signingKey: KeyObject,
    options: { readonly clock?: () => string } = {},
  ) {
    this.identity = identity;
    this.signingKey = signingKey;
    this.clock = options.clock ?? ((): string => new Date().toISOString());
  }

  /** Build and sign the institutional record for one source event addressed to a resolved relationship. */
  public build(
    event: SourceEvent,
    relationship: RelationshipRecord,
    policyRef: PolicyRefClaim,
  ): SignedInstitutionalRecord {
    const container = `${ensureTrailingSlash(relationship.boxRoot)}records/${encodeURIComponent(event.recordClass)}/`;
    // The resource id is an opaque hash of the OPAQUE relationship + source-event id — never the customerId.
    const recordId = `rec-${createHash('sha256')
      .update(`${relationship.relationshipId}:${event.sourceEventId}`).digest('hex').slice(0, 32)}`;
    const resource = `${container}${recordId}`;

    const record: InstitutionalRecord = {
      syntheticFixture: true,
      recordClass: event.recordClass,
      program: relationship.program,
      sourceSystem: relationship.sourceSystem,
      relationshipId: relationship.relationshipId,
      box: relationship.boxId,
      resource,
      policyRef,
      provenance: {
        programPrincipal: this.identity.programPrincipal,
        softwareActor: this.identity.serviceIdentity,
        signedAt: this.clock(),
      },
      supersedes: event.supersedes?.resource ?? null,
      payload: event.payload,
    };

    const body = Buffer.from(JSON.stringify(record), 'utf8');
    const payloadDigest = sha256Hex(body);
    // Sign the canonical payload digest (ADR-0016). alg is pinned to ES256; the gateway rejects any alg-swap.
    const jws = signCompactJws(
      { alg: CONNECTION_CREDENTIAL_ALG, typ: 'JWS' },
      { payloadDigest: `urn:sha256:${payloadDigest}` },
      this.signingKey,
    );

    return {
      record,
      body,
      mediaType: APPLICATION_LD_JSON,
      payloadDigest,
      signature: { issuer: this.identity.issuer, jws },
      target: container,
    };
  }
}
