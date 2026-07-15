import { BadRequestHttpError } from '../../util/errors/BadRequestHttpError';
import type { SsrfSafeEndpointValidator } from './EndpointValidator';
import type { NotificationHint } from './NotificationHint';
import { serializeHint } from './NotificationHint';

/**
 * Outbound notification channel (component C14; ADR-0011 §3/§4). Delivery is a HINT: a `2xx` proves at most
 * that a byte stream was ACCEPTED by the channel — never durable receipt, retrieval or acknowledgement
 * (ADR-0011 review #8). So the result distinguishes "accepted by the channel" from failure and never claims
 * more; the duty (`dbx:signalHolder`) is fulfilled only on channel acceptance (ADR-0012).
 *
 * SSRF is enforced end-to-end (T-38), closing the two review findings that a return-the-IPs validator alone
 * does NOT close:
 * - **H1 (DNS-rebind / TOCTOU):** validation resolves the host and returns the checked public IPs; the
 *   channel PINS them — the transport is handed `pinnedIps` and MUST connect to one of them (Host/SNI = the
 *   original hostname), and MUST report the socket's ACTUAL peer address. The channel re-checks that the peer
 *   is one of the pinned, validated IPs and ABORTS otherwise, so a name that answers public at validate time
 *   and private at connect time cannot reach an internal address.
 * - **M1 (auto-follow redirects):** the channel OWNS redirect handling. The transport MUST be in manual mode
 *   (it returns the 3xx + `Location`, it never auto-follows); the channel bounds the hop count and re-runs
 *   full validation + IP-pinning on EVERY hop. The peer-address pin also catches a transport that wrongly
 *   auto-followed into a blocked range (its reported peer would not be among the pinned IPs).
 */

/** The outcome of a single delivery attempt against one endpoint. */
export interface DeliveryAttemptResult {
  /** True ONLY when the channel returned a 2xx (accepted the byte stream). Not proof of receipt. */
  readonly accepted: boolean;
  /** The HTTP status observed (0 when the transport itself errored). */
  readonly status: number;
  /** A structured, non-content reason token. */
  readonly reason: string;
}

/** A channel that delivers a minimal hint to an already-authorized endpoint. */
export interface OutboundNotificationChannel {
  deliver: (endpoint: string, hint: NotificationHint) => Promise<DeliveryAttemptResult>;
}

/**
 * The request a transport receives. It carries the PINNED validated IP(s): the transport MUST connect to one
 * of `pinnedIps` (never re-resolve `host`), set the TLS SNI / HTTP `Host` to `host`, run in MANUAL redirect
 * mode, and report the socket's actual `peerAddress` in the response.
 */
export interface OutboundRequest {
  /** The absolute target URL for this hop. */
  readonly endpoint: string;
  /** The original hostname (for Host header / TLS SNI). */
  readonly host: string;
  /** The validated public IP(s) the transport MUST connect to (never re-resolve). */
  readonly pinnedIps: readonly string[];
  /** The minimal hint body. */
  readonly body: string;
}

/** The minimal outbound response; abstracts `fetch` so tests never hit the network. */
export interface OutboundResponse {
  /** HTTP status code. */
  readonly status: number;
  /** `Location` header for a 3xx redirect, if any (the channel — not the transport — follows it). */
  readonly location?: string;
  /** The socket's ACTUAL peer IP address (re-checked against the pinned IPs to defeat DNS-rebinding). */
  readonly peerAddress: string;
}

/** An injected transport honouring {@link OutboundRequest}. Injected so delivery is offline-testable. */
export type OutboundFetch = (request: OutboundRequest) => Promise<OutboundResponse>;

/** Options for {@link HttpsNotificationChannel}. */
export interface HttpsChannelOptions {
  /** The SSRF endpoint validator (re-run on every hop; resolves + returns the pinned IPs). */
  readonly validator: SsrfSafeEndpointValidator;
  /** The injected, manual-mode transport. */
  readonly fetch: OutboundFetch;
  /** Maximum redirects to follow (bounded; default 3). Each hop is re-validated and re-pinned. */
  readonly maxRedirects?: number;
}

export class HttpsNotificationChannel implements OutboundNotificationChannel {
  private readonly validator: SsrfSafeEndpointValidator;
  private readonly fetch: OutboundFetch;
  private readonly maxRedirects: number;

  public constructor(options: HttpsChannelOptions) {
    this.validator = options.validator;
    this.fetch = options.fetch;
    this.maxRedirects = options.maxRedirects ?? 3;
  }

  /**
   * Deliver the minimal hint. On every hop: SSRF-validate the target (throws on a blocked scheme/host — a
   * hard, audited refusal), then hand the transport the PINNED validated IPs, then re-check the socket's
   * actual peer against those IPs (aborting a DNS-rebind or a wrongly-auto-followed redirect). Redirects are
   * channel-owned and bounded. A transport error is a (retryable) non-acceptance, never a throw.
   */
  public async deliver(endpoint: string, hint: NotificationHint): Promise<DeliveryAttemptResult> {
    const body = serializeHint(hint);
    let target = endpoint;
    for (let hop = 0; hop <= this.maxRedirects; hop++) {
      // Re-validate + re-resolve EVERY hop; `pinnedIps` are the only addresses the transport may connect to.
      const pinnedIps = await this.validator.validate(target);
      const host = new URL(target).hostname;
      let response: OutboundResponse;
      try {
        response = await this.fetch({ endpoint: target, host, pinnedIps, body });
      } catch {
        return { accepted: false, status: 0, reason: 'channel-transport-error' };
      }
      // H1/M1: the socket's ACTUAL peer MUST be one of the pinned, validated IPs. A DNS-rebind (public at
      // validate, private at connect) or an auto-followed redirect into a blocked range is caught here.
      if (!pinnedIps.includes(response.peerAddress)) {
        throw new BadRequestHttpError(
          'Outbound delivery connected to an unpinned address (SSRF / DNS-rebinding blocked).',
        );
      }
      if (response.status >= 300 && response.status < 400) {
        if (response.location === undefined || response.location === '') {
          return { accepted: false, status: response.status, reason: 'redirect-without-location' };
        }
        target = new URL(response.location, target).toString();
        continue;
      }
      const accepted = response.status >= 200 && response.status < 300;
      return {
        accepted,
        status: response.status,
        reason: accepted ? 'channel-accepted' : 'channel-rejected',
      };
    }
    return { accepted: false, status: 0, reason: 'too-many-redirects' };
  }
}
