import { hintFromOutbox } from '../../../../src/databox/notification/NotificationHint';
import type {
  OutboundFetch,
  OutboundRequest,
  OutboundResponse,
} from '../../../../src/databox/notification/OutboundNotificationChannel';
import { HttpsNotificationChannel } from '../../../../src/databox/notification/OutboundNotificationChannel';
import { outbox, publicValidator } from './NotificationTestSupport';

const HINT = hintFromOutbox(outbox(1));

function channel(fetch: OutboundFetch, maxRedirects?: number): HttpsNotificationChannel {
  return new HttpsNotificationChannel({
    validator: publicValidator(),
    fetch,
    ...maxRedirects === undefined ? {} : { maxRedirects },
  });
}

/** A manual-mode transport double that connects to the FIRST pinned IP and reports it as the peer. */
function pinnedTransport(
  respond: (request: OutboundRequest) => Omit<OutboundResponse, 'peerAddress'>,
): OutboundFetch {
  return async(request: OutboundRequest): Promise<OutboundResponse> =>
    ({ ...respond(request), peerAddress: request.pinnedIps[0] });
}

describe('HttpsNotificationChannel', (): void => {
  it('pins the validated IP and hands it to the transport with the minimal hint.', async(): Promise<void> => {
    let seenRequest: OutboundRequest | undefined;
    const fetch = pinnedTransport((request): Omit<OutboundResponse, 'peerAddress'> => {
      seenRequest = request;
      return { status: 200 };
    });
    const result = await channel(fetch).deliver('https://consumer.example/hook', HINT);
    expect(result).toStrictEqual({ accepted: true, status: 200, reason: 'channel-accepted' });
    // The channel resolved + pinned the public IP and passed it to the transport with the original host.
    expect(seenRequest?.pinnedIps).toStrictEqual([ '93.184.216.34' ]);
    expect(seenRequest?.host).toBe('consumer.example');
    expect(seenRequest?.body).toBe('{"eventId":"evt-1","classification":"Create"}');
  });

  it('H1: aborts when the socket peer is NOT the pinned IP (DNS-rebind).', async(): Promise<void> => {
    // Validate answers public (93.184.216.34); the transport "rebinds" and connects to the metadata IP.
    const result = channel(async(): Promise<OutboundResponse> => ({ status: 200, peerAddress: '169.254.169.254' }))
      .deliver('https://consumer.example/hook', HINT);
    await expect(result).rejects.toThrow('SSRF');
  });

  it('does NOT accept on a 4xx/5xx (channel rejected).', async(): Promise<void> => {
    const result = await channel(pinnedTransport((): Omit<OutboundResponse, 'peerAddress'> => ({ status: 503 })))
      .deliver('https://consumer.example/hook', HINT);
    expect(result).toStrictEqual({ accepted: false, status: 503, reason: 'channel-rejected' });
  });

  it('reports a transport error as a non-acceptance (retryable), never throwing.', async(): Promise<void> => {
    const result = await channel(async(): Promise<OutboundResponse> => {
      throw new Error('ECONNREFUSED');
    }).deliver('https://consumer.example/hook', HINT);
    expect(result).toStrictEqual({ accepted: false, status: 0, reason: 'channel-transport-error' });
  });

  it('M1: channel-owned manual redirect re-validates + re-pins EVERY hop.', async(): Promise<void> => {
    const seen: string[] = [];
    const fetch = pinnedTransport((request): Omit<OutboundResponse, 'peerAddress'> => {
      seen.push(request.endpoint);
      return request.endpoint.includes('alt.example') ?
          { status: 200 } :
          { status: 307, location: 'https://alt.example/hook' };
    });
    const result = await channel(fetch).deliver('https://consumer.example/hook', HINT);
    expect(result.accepted).toBe(true);
    // Both hops went through validate() + the transport (each re-pinned to that hop's validated IP).
    expect(seen).toStrictEqual([ 'https://consumer.example/hook', 'https://alt.example/hook' ]);
  });

  it('M1: refuses a redirect into a blocked range (re-validation throws).', async(): Promise<void> => {
    const fetch = pinnedTransport((): Omit<OutboundResponse, 'peerAddress'> =>
      ({ status: 302, location: 'https://169.254.169.254/latest/' }));
    await expect(channel(fetch).deliver('https://consumer.example/hook', HINT)).rejects.toThrow('SSRF');
  });

  it('treats a redirect without a Location as a non-acceptance.', async(): Promise<void> => {
    const result = await channel(pinnedTransport((): Omit<OutboundResponse, 'peerAddress'> => ({ status: 301 })))
      .deliver('https://consumer.example/hook', HINT);
    expect(result).toStrictEqual({ accepted: false, status: 301, reason: 'redirect-without-location' });
  });

  it('bounds redirects: too many hops is a non-acceptance.', async(): Promise<void> => {
    const fetch = pinnedTransport((): Omit<OutboundResponse, 'peerAddress'> =>
      ({ status: 307, location: 'https://consumer.example/loop' }));
    const result = await channel(fetch, 2).deliver('https://consumer.example/hook', HINT);
    expect(result).toStrictEqual({ accepted: false, status: 0, reason: 'too-many-redirects' });
  });

  it('validates the initial endpoint and refuses a blocked one before any fetch.', async(): Promise<void> => {
    const fetch = jest.fn(pinnedTransport((): Omit<OutboundResponse, 'peerAddress'> => ({ status: 200 })));
    await expect(channel(fetch).deliver('https://127.0.0.1/hook', HINT)).rejects.toThrow('SSRF');
    expect(fetch).not.toHaveBeenCalled();
  });
});
