import { BadRequestHttpError } from '../../../../util/errors/BadRequestHttpError';
import {
  LD_CONTEXT,
  LD_ID,
  LD_TYPE,
  requireDate,
  requireNonEmpty,
  requirePositiveInteger,
  requireUri,
} from './PosValidation';

const LD_VOCAB = '@vocab';
const SCHEMA = 'https://schema.org/';

export type PosTicketState = 'new' | 'open' | 'held' | 'sentToFulfilment' | 'ready' | 'completed' | 'voided';
export type PosTicketLineState = 'queued' | 'preparing' | 'ready' | 'served' | 'cancelled';
export type PosTicketServiceMode = 'counter' | 'table' | 'takeaway' | 'delivery';

export interface PosTicketLineInput {
  readonly lineId: string;
  readonly name: string;
  readonly quantity: number;
  readonly state: PosTicketLineState;
  readonly station?: string;
}

export interface PosTicketInput {
  readonly id: string;
  readonly order: string;
  readonly ticketNumber: string;
  readonly state: PosTicketState;
  readonly serviceMode: PosTicketServiceMode;
  readonly openedAt: string;
  readonly updatedAt: string;
  readonly lines: readonly PosTicketLineInput[];
  readonly label?: string;
}

export interface PosTicketRecordResult {
  readonly state: PosTicketState;
  readonly openLineCount: number;
  readonly record: Record<string, unknown>;
}

const TICKET_STATES: ReadonlySet<PosTicketState> = new Set([
  'new',
  'open',
  'held',
  'sentToFulfilment',
  'ready',
  'completed',
  'voided',
]);

const LINE_STATES: ReadonlySet<PosTicketLineState> = new Set([ 'queued', 'preparing', 'ready', 'served', 'cancelled' ]);
const SERVICE_MODES: ReadonlySet<PosTicketServiceMode> = new Set([ 'counter', 'table', 'takeaway', 'delivery' ]);

const TICKET_TRANSITIONS: ReadonlyMap<PosTicketState, readonly PosTicketState[]> = new Map([
  [ 'new', [ 'open', 'voided' ]],
  [ 'open', [ 'held', 'sentToFulfilment', 'voided' ]],
  [ 'held', [ 'open', 'voided' ]],
  [ 'sentToFulfilment', [ 'ready', 'voided' ]],
  [ 'ready', [ 'completed', 'voided' ]],
  [ 'completed', []],
  [ 'voided', []],
]);

function requireTicketState(state: PosTicketState): PosTicketState {
  if (!TICKET_STATES.has(state)) {
    throw new BadRequestHttpError('A POS ticket state is not supported.');
  }
  return state;
}

function requireLineState(state: PosTicketLineState): PosTicketLineState {
  if (!LINE_STATES.has(state)) {
    throw new BadRequestHttpError('A POS ticket line state is not supported.');
  }
  return state;
}

function requireServiceMode(serviceMode: PosTicketServiceMode): PosTicketServiceMode {
  if (!SERVICE_MODES.has(serviceMode)) {
    throw new BadRequestHttpError('A POS ticket service mode is not supported.');
  }
  return serviceMode;
}

export function canTransitionTicketState(from: PosTicketState, to: PosTicketState): boolean {
  const checkedFrom = requireTicketState(from);
  const checkedTo = requireTicketState(to);
  return TICKET_TRANSITIONS.get(checkedFrom)?.includes(checkedTo) ?? false;
}

export function transitionTicketState(from: PosTicketState, to: PosTicketState): PosTicketState {
  if (!canTransitionTicketState(from, to)) {
    throw new BadRequestHttpError(`A POS ticket cannot transition from ${from} to ${to}.`);
  }
  return to;
}

export function buildTicketStateRecord(input: PosTicketInput): PosTicketRecordResult {
  const id = requireUri(input.id, 'POS ticket', 'id');
  const order = requireUri(input.order, 'POS ticket', 'order');
  const ticketNumber = requireNonEmpty(input.ticketNumber, 'POS ticket', 'ticketNumber');
  const state = requireTicketState(input.state);
  const serviceMode = requireServiceMode(input.serviceMode);
  const openedAt = requireDate(input.openedAt, 'POS ticket', 'openedAt');
  const updatedAt = requireDate(input.updatedAt, 'POS ticket', 'updatedAt');

  if (input.lines.length === 0) {
    throw new BadRequestHttpError('A POS ticket needs at least one line.');
  }

  const lines = input.lines.map((line): Record<string, unknown> => {
    const lineState = requireLineState(line.state);
    return {
      [LD_TYPE]: 'ListItem',
      identifier: requireNonEmpty(line.lineId, 'POS ticket line', 'lineId'),
      name: requireNonEmpty(line.name, 'POS ticket line', 'name'),
      numberOfItems: requirePositiveInteger(line.quantity, 'POS ticket line', 'quantity'),
      item: {
        [LD_TYPE]: 'Action',
        actionStatus: lineState === 'served' ? 'CompletedActionStatus' : 'ActiveActionStatus',
        name: lineState,
        ...line.station === undefined ?
            {} :
            {
              instrument: requireNonEmpty(line.station, 'POS ticket line', 'station'),
            },
      },
    };
  });
  const openLineCount = input.lines.filter((line): boolean =>
    line.state !== 'served' && line.state !== 'cancelled').length;

  return {
    state,
    openLineCount,
    record: {
      [LD_CONTEXT]: { [LD_VOCAB]: SCHEMA },
      [LD_TYPE]: 'Action',
      [LD_ID]: id,
      name: ticketNumber,
      object: { [LD_ID]: order },
      actionStatus: state === 'completed' ? 'CompletedActionStatus' : 'ActiveActionStatus',
      startTime: openedAt,
      endTime: state === 'completed' || state === 'voided' ? updatedAt : undefined,
      result: {
        [LD_TYPE]: 'ItemList',
        itemListElement: lines,
      },
      additionalProperty: [
        { [LD_TYPE]: 'PropertyValue', name: 'ticketState', value: state },
        { [LD_TYPE]: 'PropertyValue', name: 'serviceMode', value: serviceMode },
        { [LD_TYPE]: 'PropertyValue', name: 'openLineCount', value: openLineCount },
        ...input.label === undefined ?
            [] :
            [
              { [LD_TYPE]: 'PropertyValue', name: 'label', value: requireNonEmpty(input.label, 'POS ticket', 'label') },
            ],
      ],
    },
  };
}
