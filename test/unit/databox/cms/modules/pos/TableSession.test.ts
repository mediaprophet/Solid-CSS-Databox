import {
  buildStandaloneWifiOnboarding,
  closeTableSession,
  openTableSession,
} from '../../../../../../src/databox/cms/modules/pos/TableSession';
import type {
  TableSessionCloseInput,
  TableSessionInput,
} from '../../../../../../src/databox/cms/modules/pos/TableSession';

function sessionInput(overrides: Partial<TableSessionInput> = {}): TableSessionInput {
  return {
    sessionId: 'ts-1',
    tableId: 'table-5',
    tableLabel: 'Table 5 (window)',
    state: 'occupied',
    shopId: 'http://localhost:3000/profile/card#org',
    startedAt: '2026-07-19T11:00:00.000Z',
    ...overrides,
  };
}

describe('TableSession contract', (): void => {
  describe('openTableSession', (): void => {
    it('builds a valid table session with a JSON-LD record.', (): void => {
      const result = openTableSession(sessionInput());
      expect(result.session.sessionId).toBe('ts-1');
      expect(result.session.tableId).toBe('table-5');
      expect(result.session.tableLabel).toBe('Table 5 (window)');
      expect(result.session.state).toBe('occupied');
      expect(result.session.linkedOrderIds).toEqual([]);
      expect(result.record['@type']).toBe('FoodEstablishmentReservation');
      expect(result.record['@id']).toContain('ts-1');
      expect(result.record.identifier).toBe('ts-1');
      expect(result.record.startDate).toBe('2026-07-19T11:00:00.000Z');
    });

    it('accepts optional fields: assignedStaff, customerCount, note.', (): void => {
      const result = openTableSession(sessionInput({
        assignedStaff: 'https://staff.example/profile/card#me',
        customerCount: 3,
        note: 'Birthday celebration',
      }));
      expect(result.session.assignedStaff).toBe('https://staff.example/profile/card#me');
      expect(result.session.customerCount).toBe(3);
      expect(result.session.note).toBe('Birthday celebration');
    });

    it('accepts linked order IDs.', (): void => {
      const result = openTableSession(sessionInput({
        linkedOrderIds: [
          'http://localhost:3000/pos/orders/o-1',
          'http://localhost:3000/pos/orders/o-2',
        ],
      }));
      expect(result.session.linkedOrderIds).toHaveLength(2);
    });

    it('embeds Wi-Fi onboarding in the session record.', (): void => {
      const result = openTableSession(sessionInput({
        wifiOnboarding: {
          landingUrl: 'http://localhost:3000/wifi/landing',
          qrUrl: 'http://localhost:3000/wifi/qr',
          networkSsid: 'CornerCafe-Guest',
        },
      }));
      expect(result.session.wifiOnboarding).toBeDefined();
      expect(result.session.wifiOnboarding!.landingUrl).toBe('http://localhost:3000/wifi/landing');
      expect(result.session.wifiOnboarding!.networkSsid).toBe('CornerCafe-Guest');
      expect(result.record.potentialAction).toBeDefined();
    });

    it('rejects an invalid state.', (): void => {
      expect((): void => {
        openTableSession(sessionInput({ state: 'invalid' as any }));
      }).toThrow('must be one of');
    });

    it('rejects an unsafe sessionId.', (): void => {
      expect((): void => {
        openTableSession(sessionInput({ sessionId: 'bad id!' }));
      }).toThrow('safe id');
    });

    it('rejects a non-URI shopId.', (): void => {
      expect((): void => {
        openTableSession(sessionInput({ shopId: 'not-a-uri' }));
      }).toThrow('absolute URI');
    });

    it('rejects an empty tableLabel.', (): void => {
      expect((): void => {
        openTableSession(sessionInput({ tableLabel: '  ' }));
      }).toThrow('must not be empty');
    });
  });

  describe('closeTableSession', (): void => {
    it('closes an occupied session to available.', (): void => {
      const open = openTableSession(sessionInput({ state: 'occupied' }));
      const closeInput: TableSessionCloseInput = {
        session: open.session,
        endedAt: '2026-07-19T12:00:00.000Z',
      };
      const result = closeTableSession(closeInput);
      expect(result.session.state).toBe('available');
      expect(result.session.endedAt).toBe('2026-07-19T12:00:00.000Z');
    });

    it('closes to cleaning when requested.', (): void => {
      const open = openTableSession(sessionInput({ state: 'served' }));
      const result = closeTableSession({
        session: open.session,
        endedAt: '2026-07-19T12:00:00.000Z',
        targetState: 'cleaning',
      });
      expect(result.session.state).toBe('cleaning');
    });

    it('rejects closing a session from available state.', (): void => {
      const open = openTableSession(sessionInput({ state: 'available' }));
      expect((): void => {
        closeTableSession({ session: open.session, endedAt: '2026-07-19T12:00:00.000Z' });
      }).toThrow('cannot be closed from the available state');
    });

    it('rejects endedAt before startedAt.', (): void => {
      const open = openTableSession(sessionInput({ state: 'occupied' }));
      expect((): void => {
        closeTableSession({ session: open.session, endedAt: '2026-07-19T10:00:00.000Z' });
      }).toThrow('endedAt must not be before startedAt');
    });

    it('rejects closing an already-ended session.', (): void => {
      const open = openTableSession(sessionInput({ state: 'occupied' }));
      const closed = closeTableSession({
        session: open.session,
        endedAt: '2026-07-19T12:00:00.000Z',
        targetState: 'cleaning',
      });
      expect((): void => {
        closeTableSession({ session: closed.session, endedAt: '2026-07-19T13:00:00.000Z' });
      }).toThrow('already ended');
    });
  });

  describe('buildStandaloneWifiOnboarding', (): void => {
    it('builds a standalone Wi-Fi onboarding JSON-LD record.', (): void => {
      const record = buildStandaloneWifiOnboarding({
        id: 'http://localhost:3000/wifi/onboarding-1',
        tableSession: 'http://localhost:3000/pos/tables/table-5/sessions/ts-1',
        landingUrl: 'http://localhost:3000/wifi/landing',
        qrUrl: 'http://localhost:3000/wifi/qr',
        networkSsid: 'CornerCafe-Guest',
      });
      expect(record['@type']).toBe('EntryPoint');
      expect(record['@id']).toBe('http://localhost:3000/wifi/onboarding-1');
      expect(record.url).toBe('http://localhost:3000/wifi/landing');
      expect(record.contentUrl).toBe('http://localhost:3000/wifi/qr');
      const props = record.additionalProperty as Record<string, unknown>[];
      const ssidProp = props.find((p): boolean => p.name === 'networkSsid');
      expect(ssidProp).toBeDefined();
      expect(ssidProp!.value).toBe('CornerCafe-Guest');
    });

    it('rejects a non-URI id.', (): void => {
      expect((): void => {
        buildStandaloneWifiOnboarding({
          id: 'not-a-uri',
          tableSession: 'http://localhost:3000/pos/tables/table-5/sessions/ts-1',
          landingUrl: 'http://localhost:3000/wifi/landing',
          qrUrl: 'http://localhost:3000/wifi/qr',
        });
      }).toThrow('absolute URI');
    });
  });
});
