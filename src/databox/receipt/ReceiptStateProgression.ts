import { BadRequestHttpError } from '../../util/errors/BadRequestHttpError';
import type { ReceiptState } from './ReceiptTypes';
import { RECEIPT_STATES, receiptStateOrdinal } from './ReceiptTypes';

/**
 * The append-only receipt-state progression (ADR-0019 §Receipt states; ADR-0011/0012 duty states). A receipt
 * is not a single fact: it moves through a **monotonic** sequence of distinct states —
 * accepted → notified → retrieved → acknowledged → reviewed → disposed — and **each transition is a recorded
 * evidence event, NOT an overwrite** of the last. `accepted` (durable commit, what the signed receipt
 * attests) is always first; `disposed` is terminal (nothing follows it, because it is the highest ordinal and
 * the progression is strictly forward).
 *
 * This is the deterministic progression *mechanism* — an ordered, append-only log. It does not itself persist
 * to the external ledger; DBX-19 binds these transitions into the WORM/hash-chained evidence store, and
 * DBX-21 drives the notification/duty-derived transitions.
 */

/** A single recorded state transition — an append-only evidence event, never mutated in place. */
export interface ReceiptStateEvent {
  /** The state entered at this transition. */
  readonly state: ReceiptState;
  /** ISO-8601 instant the transition was recorded. */
  readonly at: string;
  /** Opaque evidence reference for the transition (e.g. the C13 event id), when available. */
  readonly evidence?: string;
}

/**
 * An ordered, append-only journal of receipt-state transitions. The first appended state MUST be `accepted`
 * (a progression cannot start mid-way), and every subsequent state MUST have a **strictly greater** ordinal
 * than the last — so a state is never repeated, never regressed, and never overwritten (fail closed on any
 * violation). Reads return a defensive copy so a caller cannot mutate recorded history.
 */
export class ReceiptStateJournal {
  private readonly events: ReceiptStateEvent[] = [];

  /**
   * Append a transition into `state`. Fails closed if it is not a known state, if the first transition is not
   * `accepted`, or if it does not strictly advance beyond the current state (no repeat, no regression — a
   * transition is evidence, not an overwrite).
   */
  public append(state: ReceiptState, at: string, evidence?: string): ReceiptStateEvent {
    if (!(RECEIPT_STATES as readonly string[]).includes(state)) {
      throw new BadRequestHttpError(`Unknown receipt state '${state}'.`);
    }
    if (typeof at !== 'string' || Number.isNaN(Date.parse(at))) {
      throw new BadRequestHttpError('Receipt-state transition requires a parseable ISO-8601 instant.');
    }
    const current = this.currentState();
    if (current === undefined) {
      if (state !== 'accepted') {
        throw new BadRequestHttpError('A receipt-state progression MUST begin with the accepted state.');
      }
    } else if (receiptStateOrdinal(state) <= receiptStateOrdinal(current)) {
      throw new BadRequestHttpError(
        `Receipt state cannot regress or repeat: '${current}' → '${state}' is not a forward transition.`,
      );
    }
    const event: ReceiptStateEvent = { state, at, ...evidence === undefined ? {} : { evidence }};
    this.events.push(event);
    return event;
  }

  /** The most recently entered state, or `undefined` if nothing has been appended. */
  public currentState(): ReceiptState | undefined {
    return this.events.length === 0 ? undefined : this.events.at(-1)!.state;
  }

  /** A defensive copy of the append-only transition history (callers cannot mutate recorded evidence). */
  public history(): readonly ReceiptStateEvent[] {
    return [ ...this.events ];
  }
}
