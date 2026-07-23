import {
  buildTicketStateRecord,
  canTransitionTicketState,
  transitionTicketState,
} from '../../../../../../src/databox/cms/modules/pos/Ticket';

function record(value: unknown): Record<string, unknown> {
  return value as Record<string, unknown>;
}

describe('POS ticket state transitions', (): void => {
  it('allows declared ticket state transitions.', (): void => {
    expect(canTransitionTicketState('open', 'sentToFulfilment')).toBe(true);
    expect(transitionTicketState('ready', 'completed')).toBe('completed');
  });

  it('rejects invalid ticket state transitions.', (): void => {
    expect(canTransitionTicketState('completed', 'open')).toBe(false);
    expect((): unknown => transitionTicketState('voided', 'open'))
      .toThrow('cannot transition from voided to open');
  });
});

describe('buildTicketStateRecord', (): void => {
  it('builds a POS ticket state descriptor with line states.', (): void => {
    const result = buildTicketStateRecord({
      id: 'https://example.org/pos/tickets/1',
      order: 'https://example.org/orders/1',
      ticketNumber: 'T-1',
      state: 'sentToFulfilment',
      serviceMode: 'table',
      openedAt: '2026-07-19T11:00:00.000Z',
      updatedAt: '2026-07-19T11:03:00.000Z',
      label: 'Table 4',
      lines: [
        { lineId: 'line-1', name: 'Coffee', quantity: 2, state: 'preparing', station: 'bar' },
        { lineId: 'line-2', name: 'Muffin', quantity: 1, state: 'served' },
      ],
    });

    expect(result.state).toBe('sentToFulfilment');
    expect(result.openLineCount).toBe(1);
    expect(result.record['@context']).toEqual({ '@vocab': 'https://schema.org/' });
    expect(result.record['@type']).toBe('Action');

    const object = record(result.record.object);
    expect(object['@id']).toBe('https://example.org/orders/1');

    const list = record(result.record.result);
    const elements = list.itemListElement as Record<string, unknown>[];
    expect(elements).toHaveLength(2);
    const firstAction = record(elements[0].item);
    expect(firstAction.name).toBe('preparing');
    expect(firstAction.instrument).toBe('bar');
  });

  it('rejects invalid ticket metadata.', (): void => {
    const base = {
      id: 'https://example.org/pos/tickets/1',
      order: 'https://example.org/orders/1',
      ticketNumber: 'T-1',
      state: 'open' as const,
      serviceMode: 'counter' as const,
      openedAt: '2026-07-19T11:00:00.000Z',
      updatedAt: '2026-07-19T11:03:00.000Z',
      lines: [{ lineId: 'line-1', name: 'Coffee', quantity: 1, state: 'queued' as const }],
    };

    expect((): unknown => buildTicketStateRecord({ ...base, id: 'not-a-uri' }))
      .toThrow('id must be an absolute URI');
    expect((): unknown => buildTicketStateRecord({ ...base, ticketNumber: '  ' }))
      .toThrow('ticketNumber must not be empty');
    expect((): unknown => buildTicketStateRecord({ ...base, lines: []}))
      .toThrow('at least one line');
    expect((): unknown => buildTicketStateRecord({
      ...base,
      lines: [{ ...base.lines[0], quantity: 0 }],
    })).toThrow('quantity must be a positive integer');
  });
});
