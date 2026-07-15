import { BadRequestHttpError } from '../../util/errors/BadRequestHttpError';

/**
 * The typed duty state machine (component C12; ADR-0012 §state machine). The six states are PAIRWISE
 * DISTINCT and only two are fulfilling — this is what makes "fulfilled" a checkable claim bound to a state
 * rather than a hidden degrade of an obligation (T-50 duty unfulfilled-but-marked-fulfilled):
 *
 * ```text
 * queued ─▶ attempted ─▶ accepted ─▶ acknowledged        (acknowledged only for dbx:acknowledge duties)
 *   │           └─▶ failed ─▶ attempted  (idempotent retry)
 *   │                   └─▶ remedied     (consequence/remedy applied)
 *   └─▶ superseded                       (cancelled by an authorized policy event)
 * ```
 *
 * `queued` and `attempted` are NOT fulfilled (ADR-0012 rule 1). `acknowledged` is a SEPARATE terminal
 * state reachable only from `accepted` (ADR-0012 §diagram) — the engine additionally restricts it to
 * `dbx:acknowledge` duties.
 */

/** The distinct duty states (ADR-0012). */
export const DUTY_STATES = [
  'queued',
  'attempted',
  'accepted',
  'failed',
  'remedied',
  'acknowledged',
  'superseded',
] as const;

export type DutyState = typeof DUTY_STATES[number];

/** The ONLY fulfilling states (ADR-0012 rule 1): `queued`/`attempted`/`failed` are NOT fulfilled. */
const FULFILLING_STATES: ReadonlySet<DutyState> = new Set<DutyState>([ 'accepted', 'acknowledged' ]);

/** The permitted transitions out of each state; an absent target is illegal (fail closed). */
const TRANSITIONS: Readonly<Record<DutyState, ReadonlySet<DutyState>>> = {
  queued: new Set<DutyState>([ 'attempted', 'superseded' ]),
  attempted: new Set<DutyState>([ 'accepted', 'failed' ]),
  accepted: new Set<DutyState>([ 'acknowledged' ]),
  failed: new Set<DutyState>([ 'attempted', 'remedied' ]),
  remedied: new Set<DutyState>(),
  acknowledged: new Set<DutyState>(),
  superseded: new Set<DutyState>(),
};

/** Whether `state` counts as fulfilled (ONLY `accepted`/`acknowledged`, ADR-0012 rule 1). */
export function isFulfilled(state: DutyState): boolean {
  return FULFILLING_STATES.has(state);
}

/** Whether `from → to` is a permitted transition. */
export function canTransition(from: DutyState, to: DutyState): boolean {
  return TRANSITIONS[from].has(to);
}

/** Assert `from → to` is permitted; throw fail-closed otherwise (no undefined transition, DBX-04 §7). */
export function assertTransition(from: DutyState, to: DutyState): void {
  if (!canTransition(from, to)) {
    throw new BadRequestHttpError(`Illegal duty transition ${from} → ${to} (ADR-0012 state machine).`);
  }
}
