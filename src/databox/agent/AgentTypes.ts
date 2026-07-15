import type { KeyObject } from 'node:crypto';
import type { ProofChallenge, ProvisionalShortLivedToken } from '../credential/ConnectionCredentialTypes';
import type { ConnectionCredentialValidator } from '../credential/ConnectionCredentialValidator';
import type { ChallengeOptions } from '../credential/HolderKeyProof';
import type { ExchangeRequest } from '../credential/ProvisionalTokenExchange';
import type { CursorFeed } from '../feed/CursorFeed';
import type { PinnedContextSet } from '../proof/OfflineVerification';
import type { IssuerTrustStore } from '../proof/IssuerTrustStore';
import type { RecordProofValidator, StatusListResolver } from '../proof/RecordProofValidator';
import type { AcceptanceReceiptVerifier } from '../receipt/AcceptanceReceiptVerifier';
import type { ScopedSubmission } from './ScopedSubmission';

/**
 * Shared types + the injected-collaborator interfaces for the reference consumer agent (ADR-0026; component
 * C20; dbx-04 IF-01/IF-02/IF-09). Everything the agent talks to the outside world through is an INJECTED
 * interface built on ordinary Solid discovery / OIDC / HTTP resource operations — never a private SDK-only
 * transport. Injecting them keeps every unit test fully offline (no real network) and makes the isolation
 * and inert-data properties checkable with spies.
 */

/**
 * The holder-proof challenge source (IF-01 step 1). The consumer asks the addressed realm for a fresh,
 * single-use, audience-bound challenge before signing it with its holder key. The real
 * {@link HolderKeyProofVerifier} satisfies this shape.
 */
export interface HolderProofChallengeSource {
  issueChallenge: (audience: string, options?: ChallengeOptions) => ProofChallenge;
}

/**
 * The credential → short-lived-token exchange endpoint (IF-01 step 2). The real
 * {@link ProvisionalTokenExchange} satisfies this shape. Given the credential + a fresh holder proof it
 * returns a short-lived, audience-bound token (or throws, fail-closed).
 */
export interface TokenExchangeEndpoint {
  exchange: (request: ExchangeRequest) => ProvisionalShortLivedToken;
}

/** One retrieved item from the record endpoint: the secured record + its acceptance receipt + exact bytes. */
export interface RetrievedRecordItem {
  readonly recordJws: string;
  readonly receiptJws: string;
  readonly payload: Buffer | string;
}

/**
 * The LDP record-retrieval endpoint (IF-02). Given a short-lived token it returns the connection's records as
 * secured artefacts the agent then INDEPENDENTLY verifies — the endpoint is never trusted to have checked
 * anything. Ordinary authenticated Solid GETs back this in production.
 */
export interface RecordRetrievalEndpoint {
  fetchRecords: (token: ProvisionalShortLivedToken) => Promise<readonly RetrievedRecordItem[]>;
}

/** The endpoint's acknowledgement of a submission: the signed acceptance receipt + the accepted bytes. */
export interface SubmissionAcknowledgement {
  readonly receiptJws: string;
  readonly payload: Buffer | string;
}

/**
 * The LDP submission endpoint (IF-02). It takes a short-lived token + the SCOPED submission (selected fields
 * only) and returns a signed acceptance receipt the agent then verifies. An ordinary authenticated Solid
 * POST/PUT backs this in production.
 */
export interface SubmissionEndpoint {
  submit: (token: ProvisionalShortLivedToken, submission: ScopedSubmission) => Promise<SubmissionAcknowledgement>;
}

/**
 * The consumer's per-connection verification configuration, supplied on import. It is the trust the CONSUMER
 * holds for that one program — isolated per connection, never shared — so verifying program A's records can
 * never draw on program B's trust set (T-03).
 */
export interface ConnectionVerificationConfig {
  /** Trusted issuer keys + history for verifying this connection's RECORDS (ADR-0020). */
  readonly recordTrustStore: IssuerTrustStore;
  /** Pinned JSON-LD contexts for record verification (unpinned/remote fail closed, T-21). */
  readonly pinnedContexts: PinnedContextSet;
  /** Resolves the published status list for record revocation checks (fail closed if unreachable). */
  readonly statusListResolver: StatusListResolver;
  /** Trusted issuer keys + history for verifying this connection's RECEIPTS (offline, ADR-0019). */
  readonly receiptTrustStore: IssuerTrustStore;
}

/**
 * A connection import (ADR-0007/0026). The consumer imports the connection credential (a compact JWS with NO
 * embedded bearer secret) together with the holder PRIVATE key IT controls and the tenant + verification
 * config. Standards-based access is then bootstrapped purely by proving control of the holder key.
 */
export interface ConnectionImport {
  /** The `application/vc+jwt` connection credential (compact JWS) issued to the consumer's key. */
  readonly credentialJws: string;
  /** The holder private key the CONSUMER controls (never held by the organisation — ADR-0026). */
  readonly holderPrivateKey: KeyObject;
  /** The opaque tenant identifier the cursor feed is scoped to for this connection. */
  readonly tenantId: string;
  /** The per-connection verification trust configuration. */
  readonly verification: ConnectionVerificationConfig;
}

/** The injected collaborators the {@link ReferenceConsumerAgent} runs on. */
export interface ConsumerAgentDependencies {
  /** Validates + parses an imported connection credential (trusted issuer keys, T-08/T-18). */
  readonly credentialValidator: ConnectionCredentialValidator;
  /** Verifies retrieved records (proof + status + valid-vs-true, ADR-0020). */
  readonly recordValidator: RecordProofValidator;
  /** Verifies retrieved + returned receipts offline (ADR-0019). */
  readonly receiptVerifier: AcceptanceReceiptVerifier;
  /** Issues holder-proof challenges (IF-01 step 1). */
  readonly challengeSource: HolderProofChallengeSource;
  /** Exchanges credential + proof for a short-lived token (IF-01 step 2). */
  readonly tokenExchange: TokenExchangeEndpoint;
  /** Retrieves records (IF-02). */
  readonly recordEndpoint: RecordRetrievalEndpoint;
  /** Submits scoped preferences/corrections (IF-02). */
  readonly submissionEndpoint: SubmissionEndpoint;
  /** The cursor feed for missed-event recovery (IF-09). */
  readonly cursorFeed: CursorFeed;
  /** Injectable clock (epoch ms); defaults to `Date.now`. */
  readonly now?: () => number;
}
