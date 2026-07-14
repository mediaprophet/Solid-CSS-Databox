import { createHmac, randomBytes } from 'node:crypto';
import { BadRequestHttpError } from '../../util/errors/BadRequestHttpError';
import type { GatewayAcceptance, NamespacedEventKey } from './GatewayTypes';

/**
 * Namespaced deposit idempotency (component C7; ADR-0016 HD-12 / DBX-04 §7.1; DBX-03 T-24). The
 * idempotency key is a function of the namespaced source-event tuple
 * `organisation/program/source-system/event-type/source-event-id` — **stable across retries, NOT minted
 * per attempt**. A duplicate of the same tuple MUST return the ORIGINAL logical outcome, never a second
 * record.
 *
 * The external representation is a **per-program keyed HMAC** of the tuple (ADR-0016 §Decision: "the
 * external representation MAY be a tenant-keyed HMAC of the tuple where exposing it would reveal internal
 * system information") — mirroring the {@link ../provisioning/DataboxProvisioner} relationship-idempotency
 * pattern exactly: a per-program secret, the program mixed into the message, so the same source-event id
 * in two programs yields unrelated keys (cross-tenant collision structurally impossible) and the key never
 * leaks the internal event/volume structure even if the store is read.
 */

/** Injectable seam for the per-program HMAC secret; defaulted to a 256-bit CSPRNG secret. */
export interface IdempotencyOptions {
  /** Mints a per-program idempotency-HMAC secret (default: 256-bit `randomBytes`). */
  readonly secretFactory?: () => Buffer;
}

const SECRET_BYTES = 32;

/** The result of remembering a first outcome or detecting a duplicate replay. */
export interface IdempotencyResult {
  /** True when the key was already present — the returned {@link acceptance} is the ORIGINAL outcome. */
  readonly duplicate: boolean;
  /** The stored acceptance (the original on a duplicate, the just-stored one on first sight). */
  readonly acceptance: GatewayAcceptance;
}

/**
 * The namespaced idempotency registry. Computes the protected key and stores the first acceptance per
 * key; a second call with the same tuple returns the original acceptance (T-24 idempotent replay). The
 * in-memory map is the reference store; a durable store swaps in behind the same surface (mirrors the
 * provisioning registry rationale).
 */
export class IdempotencyRegistry {
  private readonly secretFactory: () => Buffer;
  private readonly secrets = new Map<string, Buffer>();
  private readonly accepted = new Map<string, GatewayAcceptance>();

  public constructor(options: IdempotencyOptions = {}) {
    this.secretFactory = options.secretFactory ?? ((): Buffer => randomBytes(SECRET_BYTES));
  }

  /**
   * Validate the namespaced tuple is complete and derive the protected key (a per-program keyed HMAC).
   * Every field MUST be a non-empty string (fail closed — an incomplete tuple cannot be deduplicated and
   * MUST NOT be minted per attempt).
   */
  public keyFor(event: NamespacedEventKey): string {
    const parts: (keyof NamespacedEventKey)[] =
      [ 'organisation', 'program', 'sourceSystem', 'eventType', 'sourceEventId' ];
    for (const part of parts) {
      const value = event[part];
      if (typeof value !== 'string' || value.length === 0) {
        throw new BadRequestHttpError(`Idempotency tuple field '${part}' must be a non-empty string (fail closed).`);
      }
    }
    const secret = this.programSecret(event.organisation, event.program);
    const tuple = [ event.organisation, event.program, event.sourceSystem, event.eventType, event.sourceEventId ]
      .map((part): string => encodeURIComponent(part))
      .join('/');
    return createHmac('sha256', secret).update(tuple).digest('hex');
  }

  /** Look up the original acceptance for a protected key, or `undefined` if this key is unseen. */
  public lookup(key: string): GatewayAcceptance | undefined {
    return this.accepted.get(key);
  }

  /**
   * Remember the first acceptance for a key. On a duplicate the ORIGINAL acceptance is returned unchanged
   * (never overwritten — T-24), and `duplicate` is `true`; on first sight the input is stored and returned.
   */
  public remember(key: string, acceptance: GatewayAcceptance): IdempotencyResult {
    const existing = this.accepted.get(key);
    if (existing) {
      return { duplicate: true, acceptance: existing };
    }
    this.accepted.set(key, acceptance);
    return { duplicate: false, acceptance };
  }

  private programSecret(organisation: string, program: string): Buffer {
    const programKey = `${encodeURIComponent(organisation)}/${encodeURIComponent(program)}`;
    let secret = this.secrets.get(programKey);
    if (!secret) {
      secret = this.secretFactory();
      this.secrets.set(programKey, secret);
    }
    return secret;
  }
}
