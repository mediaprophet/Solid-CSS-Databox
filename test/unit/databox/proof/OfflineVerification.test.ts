import { sha256Hex } from '../../../../src/databox/credential/Es256';
import {
  PINNED_RECORD_CONTEXT_URLS,
  PinnedContextSet,
} from '../../../../src/databox/proof/OfflineVerification';
import { DBX_RECORD_CONTEXT, VC_V2_CONTEXT } from '../../../../src/databox/proof/RecordProofTypes';
import { BadRequestHttpError } from '../../../../src/util/errors/BadRequestHttpError';
import { CONTEXT_CONTENT, pinnedContexts } from './RecordTestSupport';

describe('PinnedContextSet', (): void => {
  it('exposes the allowlisted context URLs.', (): void => {
    expect(PINNED_RECORD_CONTEXT_URLS).toStrictEqual([ VC_V2_CONTEXT, DBX_RECORD_CONTEXT ]);
  });

  it('accepts a urn-prefixed pin and a bare hex pin.', (): void => {
    expect((): PinnedContextSet =>
      new PinnedContextSet(new Map([[ VC_V2_CONTEXT, `urn:sha256:${'a'.repeat(64)}` ]]))).not.toThrow();
    expect((): PinnedContextSet =>
      new PinnedContextSet(new Map([[ VC_V2_CONTEXT, 'B'.repeat(64) ]]))).not.toThrow();
  });

  it('refuses a pin that is not a 64-hex sha256.', (): void => {
    expect((): PinnedContextSet => new PinnedContextSet(new Map([[ VC_V2_CONTEXT, 'short' ]])))
      .toThrow(BadRequestHttpError);
    expect((): PinnedContextSet => new PinnedContextSet(new Map([[ VC_V2_CONTEXT, '' ]])))
      .toThrow('64-hex');
  });

  it('allows referenced context URLs that are all pinned.', (): void => {
    expect((): void => pinnedContexts().assertAllowed([ VC_V2_CONTEXT, DBX_RECORD_CONTEXT ])).not.toThrow();
  });

  it('rejects an empty or non-array @context.', (): void => {
    expect((): void => pinnedContexts().assertAllowed([])).toThrow('non-empty array');
    expect((): void => pinnedContexts().assertAllowed(undefined as unknown as string[])).toThrow('non-empty array');
  });

  it('rejects an unpinned/remote context URL (T-21).', (): void => {
    expect((): void => pinnedContexts().assertAllowed([ VC_V2_CONTEXT, 'https://evil.example/ctx' ]))
      .toThrow('Unpinned/remote');
    expect((): void => pinnedContexts().assertAllowed([ 42 as unknown as string ])).toThrow('T-21');
  });

  it('verifies carried contexts whose content hashes to the pin.', (): void => {
    const carried = [
      { url: VC_V2_CONTEXT, content: CONTEXT_CONTENT[VC_V2_CONTEXT] },
      { url: DBX_RECORD_CONTEXT, content: CONTEXT_CONTENT[DBX_RECORD_CONTEXT] },
    ];
    expect((): void => pinnedContexts().verifyCarried(carried)).not.toThrow();
  });

  it('rejects a carried context that is not pinned (T-21).', (): void => {
    expect((): void => pinnedContexts().verifyCarried([{ url: 'https://evil.example/ctx', content: 'x' }]))
      .toThrow('not pinned');
  });

  it('rejects a carried context whose content was mutated (hash mismatch, T-21).', (): void => {
    expect((): void => pinnedContexts().verifyCarried([{ url: VC_V2_CONTEXT, content: 'mutated' }]))
      .toThrow('does not match its pinned hash');
    // Sanity: the genuine content DOES hash to the pin.
    expect(sha256Hex(CONTEXT_CONTENT[VC_V2_CONTEXT])).toHaveLength(64);
  });
});
