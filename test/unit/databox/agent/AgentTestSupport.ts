import type { KeyObject } from 'node:crypto';
import { generateKeyPairSync } from 'node:crypto';
import { BitstringStatusList, StatusListManager } from '../../../../src/databox/credential/BitstringStatusList';
import { ConnectionCredentialIssuer } from '../../../../src/databox/credential/ConnectionCredentialIssuer';
import { ConnectionCredentialValidator } from '../../../../src/databox/credential/ConnectionCredentialValidator';
import type { PublicJwk } from '../../../../src/databox/credential/ConnectionCredentialTypes';
import { publicJwkFromKeyObject, sha256Hex, signCompactJws } from '../../../../src/databox/credential/Es256';
import { HolderKeyProofVerifier } from '../../../../src/databox/credential/HolderKeyProof';
import { ProvisionalTokenExchange } from '../../../../src/databox/credential/ProvisionalTokenExchange';
import { RetentionBoundedCursorFeed } from '../../../../src/databox/feed/CursorFeed';
import { digestOfBytes } from '../../../../src/databox/proof/Canonicalization';
import { IssuerTrustStore } from '../../../../src/databox/proof/IssuerTrustStore';
import { PinnedContextSet } from '../../../../src/databox/proof/OfflineVerification';
import {
  DATABOX_RECORD_CREDENTIAL_TYPE,
  DBX_RECORD_CONTEXT,
  PINNED_CANONICALIZATION_ALG,
  RECORD_PROOF_JWS_TYP,
  RecordProofValidator,
  VC_V2_CONTEXT,
  VERIFIABLE_CREDENTIAL_TYPE,
} from '../../../../src/databox/proof/RecordProofValidator';
import { AcceptanceReceiptSigner } from '../../../../src/databox/receipt/AcceptanceReceiptSigner';
import { AcceptanceReceiptVerifier } from '../../../../src/databox/receipt/AcceptanceReceiptVerifier';
import type {
  ConnectionImport,
  ConsumerAgentDependencies,
  RetrievedRecordItem,
  SubmissionAcknowledgement,
} from '../../../../src/databox/agent/AgentTypes';
import type { ScopedSubmission } from '../../../../src/databox/agent/ScopedSubmission';

export const ISSUER = 'https://org.example/id#issuer';
export const KID = 'https://org.example/id#key-1';
export const RECORD_STATUS_CRED = 'https://org.example/status/records';
export const ACCESS_PROFILE = 'https://w3id.org/solid-databox/access/v1';
export const SYNC_PROFILE = 'https://w3id.org/solid-databox/sync/v1';
export const CONFORMS_TO = [ 'https://solidproject.org/TR/protocol' ];

/** The fixed agent clock instant (epoch ms) — all windows are set wide around it. */
export const T = 5_000_000;

interface KeyPair {
  readonly publicKey: KeyObject;
  readonly privateKey: KeyObject;
  readonly publicJwk: PublicJwk;
}

function keyPair(): KeyPair {
  const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  return { publicKey, privateKey, publicJwk: publicJwkFromKeyObject(publicKey) };
}

/** A configurable, offline record-retrieval + submission harness that spies on outbound calls (T-51). */
export class AgentHarness {
  public readonly issuerKeys = keyPair();
  public readonly validator = new ConnectionCredentialValidator(new Map([[ ISSUER, this.issuerKeys.publicKey ]]));
  public readonly recordValidator = new RecordProofValidator();
  public readonly receiptVerifier = new AcceptanceReceiptVerifier();
  public readonly proofVerifier = new HolderKeyProofVerifier();
  public readonly statusManager = new StatusListManager(RECORD_STATUS_CRED);
  public readonly tokenExchange = new ProvisionalTokenExchange({
    validator: this.validator,
    proofVerifier: this.proofVerifier,
    statusManager: this.statusManager,
  });

  public readonly credentialIssuer = new ConnectionCredentialIssuer(ISSUER, this.issuerKeys.privateKey, KID);
  public readonly receiptSigner = new AcceptanceReceiptSigner(ISSUER, this.issuerKeys.privateKey, KID);
  public readonly recordStatusList = new BitstringStatusList();
  public readonly cursorFeed = new RetentionBoundedCursorFeed();

  /** Records to hand back per connection id (set by tests). */
  public readonly recordsByConnection = new Map<string, RetrievedRecordItem[]>();
  /** Outbound-call spies — proof that no link/directive inside a record triggered extra I/O (T-51). */
  public fetchCount = 0;
  public submitCount = 0;
  /** The last submission the endpoint received (to assert only selected fields crossed the boundary). */
  public lastSubmission?: ScopedSubmission;
  private nextStatusIndex = 100;

  /** The trust store used to verify this program's records + receipts (both signed by the org issuer). */
  public trustStore(programId: string): IssuerTrustStore {
    return new IssuerTrustStore(programId, [
      {
        issuer: ISSUER,
        verificationMethod: KID,
        publicKeyJwk: this.issuerKeys.publicJwk,
        status: 'active',
        validFrom: '1970-01-01T00:00:00Z',
      },
    ]);
  }

  /** A pinned-context set over the two record context URLs. */
  public pinnedContexts(): PinnedContextSet {
    return new PinnedContextSet(new Map([
      [ VC_V2_CONTEXT, sha256Hex('{"vc2":"x"}') ],
      [ DBX_RECORD_CONTEXT, sha256Hex('{"dbxRecord":"x"}') ],
    ]));
  }

  /** Build a {@link ConnectionImport} + its connection id for a program/relationship/tenant/databox. */
  public issueConnection(options: {
    program: string;
    relationship: string;
    databox: string;
    tenantId: string;
  }): { connectionImport: ConnectionImport; connectionId: string; holder: KeyPair } {
    const holder = keyPair();
    const statusIndex = this.nextStatusIndex;
    this.nextStatusIndex += 1;
    const issued = this.credentialIssuer.issue({
      pairwiseWebId: 'https://consumer.example/id#me',
      holderPublicJwk: holder.publicJwk,
      program: options.program,
      databox: options.databox,
      storageDescription: `${options.databox}description`,
      accessGrant: { id: 'grant-1', bytes: 'grant-bytes' },
      accessProfile: ACCESS_PROFILE,
      conformsTo: CONFORMS_TO,
      syncProfile: SYNC_PROFILE,
      relationship: options.relationship,
      statusListIndex: statusIndex,
      statusListCredential: 'https://org.example/status/connections',
      now: 1_000_000,
      validForMs: 100_000_000,
    });
    const connectionImport: ConnectionImport = {
      credentialJws: issued.jws,
      holderPrivateKey: holder.privateKey,
      tenantId: options.tenantId,
      verification: {
        recordTrustStore: this.trustStore(options.program),
        pinnedContexts: this.pinnedContexts(),
        statusListResolver: (cred): BitstringStatusList | undefined =>
          cred === RECORD_STATUS_CRED ? this.recordStatusList : undefined,
        receiptTrustStore: this.trustStore(options.program),
      },
    };
    return { connectionImport, connectionId: issued.connectionId, holder };
  }

  /** Sign a record credential over `payload` (bytes/string) — verifiable by {@link recordValidator}. */
  public signRecord(payload: Buffer | string, index = 5): string {
    const body = {
      '@context': [ VC_V2_CONTEXT, DBX_RECORD_CONTEXT ],
      id: `urn:uuid:record-${index}`,
      type: [ VERIFIABLE_CREDENTIAL_TYPE, DATABOX_RECORD_CREDENTIAL_TYPE ],
      issuer: ISSUER,
      validFrom: new Date(T).toISOString(),
      validUntil: new Date(T + 1_000_000).toISOString(),
      credentialSubject: {
        record: {
          payloadDigest: digestOfBytes(payload),
          canonicalization: PINNED_CANONICALIZATION_ALG,
          recordClass: 'https://org.example/classes/loyalty',
          author: 'https://org.example/parties/org',
          method: 'institutional-record',
          verificationStatus: 'verified',
        },
      },
      credentialStatus: {
        id: `${RECORD_STATUS_CRED}#${index}`,
        type: 'BitstringStatusListEntry',
        statusPurpose: 'revocation',
        statusListIndex: index,
        statusListCredential: RECORD_STATUS_CRED,
      },
    };
    const header = { alg: 'ES256', typ: RECORD_PROOF_JWS_TYP, cty: 'vc', kid: KID };
    return signCompactJws(header, body, this.issuerKeys.privateKey);
  }

  /** Sign an acceptance receipt over `payload` for an operation. */
  public signReceipt(payload: Buffer | string, operation: 'deposit' | 'submission', transaction = 'txn-1'): string {
    const payloadDigest = digestOfBytes(payload);
    const committedAt = new Date(T).toISOString();
    return this.receiptSigner.issue({
      transaction,
      acceptedResource: 'https://org.example/boxes/bx/records/1',
      payloadDigest,
      sender: 'https://org.example/id#issuer',
      addressedRelationship: 'urn:uuid:rel',
      operation,
      profileVersion: '1.0.0',
      profileDigest: 'sha256:profile',
      policyDigest: `urn:sha256:${'a'.repeat(64)}`,
      odrlPolicy: 'https://org.example/policy/1',
      activatedDuties: [ 'https://w3id.org/solid-databox/ns#issueReceipt' ],
      durableCommit: { eventId: 'commit-1', committedAt, payloadDigest, confirmed: true },
    }).receipt.jws;
  }

  /** Build a retrievable record item (record + receipt) over `payload`. */
  public recordItem(payload: Buffer | string, index = 5): RetrievedRecordItem {
    return { recordJws: this.signRecord(payload, index), receiptJws: this.signReceipt(payload, 'deposit'), payload };
  }

  /** The injected dependency bundle with the fixed clock and spying endpoints. */
  public deps(): ConsumerAgentDependencies {
    return {
      credentialValidator: this.validator,
      recordValidator: this.recordValidator,
      receiptVerifier: this.receiptVerifier,
      challengeSource: this.proofVerifier,
      tokenExchange: this.tokenExchange,
      recordEndpoint: {
        fetchRecords: async(token): Promise<readonly RetrievedRecordItem[]> => {
          this.fetchCount += 1;
          return this.recordsByConnection.get(token.connectionId) ?? [];
        },
      },
      submissionEndpoint: {
        submit: async(_token, submission): Promise<SubmissionAcknowledgement> => {
          this.submitCount += 1;
          this.lastSubmission = submission;
          const payload = JSON.stringify(submission.fields);
          return { receiptJws: this.signReceipt(payload, 'submission'), payload };
        },
      },
      cursorFeed: this.cursorFeed,
      now: (): number => T,
    };
  }
}
