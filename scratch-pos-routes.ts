    this.router.register('POST', '/pos/orders', async({ request, response }): Promise<void> => {
      try {
        if (!this.orderStore) {
          throw new Error('Persisting POS orders requires a PosOrderStore.');
        }
        const input = await readJsonBody<unknown>(request);
        const flow = buildOrderingFlowFromRequest(input);
        const persisted = await this.orderStore.persistFlow(flow);
        writeJson(response, 201, {
          channel: flow.channel,
          status: flow.status,
          persisted,
          cart: flow.cart.record,
          order: flow.order.record,
          ticket: flow.ticket.record,
          intent: flow.intent,
        }, 'application/ld+json');
      } catch (error: unknown) {
        writeJson(response, errorStatusCode(error), {
          error: error instanceof Error ? error.message : 'Invalid POS order request.',
        });
      }
    });
    this.router.register('GET', '/pos/orders', async({ request, response }): Promise<void> => {
      try {
        if (!this.orderStore) {
          throw new Error('Reading POS orders requires a PosOrderStore.');
        }
        const iri = new URL(request.url ?? '/', 'http://localhost').searchParams.get('iri');
        if (iri === null || iri.length === 0) {
          throw new Error('A POS order read requires an ?iri= query parameter.');
        }
        const record = await this.orderStore.load(iri);
        if (record === undefined) {
          writeJson(response, 404, { error: 'pos-resource-not-found' });
          return;
        }
        writeJson(response, 200, JSON.parse(record), 'application/ld+json');
      } catch (error: unknown) {
        writeJson(response, errorStatusCode(error), {
          error: error instanceof Error ? error.message : 'Invalid POS order read request.',
        });
      }
    });
    this.router.register('POST', '/pos/register/sessions', async({ request, response }): Promise<void> => {
      try {
        if (!this.cashRegisterStore) {
          throw new Error('Persisting cash register sessions requires a CashRegisterStore.');
        }
        const result = openCashRegisterSession(await readJsonBody<CashRegisterOpenInput>(request));
        const persisted = await this.cashRegisterStore.persistSession(result);
        writeJson(response, 201, { persisted, session: result.record }, 'application/ld+json');
      } catch (error: unknown) {
        writeJson(response, errorStatusCode(error), {
          error: error instanceof Error ? error.message : 'Invalid cash register open request.',
        });
      }
    });
    this.router.register('POST', '/pos/register/sessions/close', async({ request, response }): Promise<void> => {
      try {
        if (!this.cashRegisterStore) {
          throw new Error('Persisting cash register sessions requires a CashRegisterStore.');
        }
        const result = closeCashRegisterSession(await readJsonBody<CashRegisterCloseInput>(request));
        const persisted = await this.cashRegisterStore.persistSession(result);
        writeJson(response, 200, { persisted, session: result.record }, 'application/ld+json');
      } catch (error: unknown) {
        writeJson(response, errorStatusCode(error), {
          error: error instanceof Error ? error.message : 'Invalid cash register close request.',
        });
      }
    });
    this.router.register('GET', '/pos/register/sessions', async({ request, response }): Promise<void> => {
      await readPersistedResource(response, this.cashRegisterStore, request.url, 'CashRegisterStore');
    });
    this.router.register('POST', '/pos/display', async({ request, response }): Promise<void> => {
      try {
        if (!this.customerDisplayStore) {
          throw new Error('Persisting customer displays requires a CustomerDisplayStore.');
        }
        const body = await readJsonBody<{ displayIri?: unknown; input?: unknown }>(request);
        if (typeof body.displayIri !== 'string') {
          throw new TypeError('A customer display request needs a displayIri string.');
        }
        if (!isRecord(body.input)) {
          throw new Error('A customer display request needs an input object.');
        }
        const render = renderCustomerDisplay(body.input as unknown as CustomerDisplayInput);
        const persisted = await this.customerDisplayStore.persistPlaylist(body.displayIri, render);
        writeJson(response, 201, { persisted, playlist: render.playlist }, 'application/ld+json');
      } catch (error: unknown) {
        writeJson(response, errorStatusCode(error), {
          error: error instanceof Error ? error.message : 'Invalid customer display request.',
        });
      }
    });
    this.router.register('GET', '/pos/display', async({ request, response }): Promise<void> => {
      await readPersistedResource(response, this.customerDisplayStore, request.url, 'CustomerDisplayStore');
    });
    this.router.register('POST', '/pos/display/state', async({ request, response }): Promise<void> => {
      try {
        if (!this.customerDisplayStore) {
          throw new Error('Persisting display state requires a CustomerDisplayStore.');
        }
        const body = await readJsonBody<{ displayIri?: unknown; state?: unknown }>(request);
        if (typeof body.displayIri !== 'string') {
          throw new TypeError('A display state request needs a displayIri string.');
        }
        if (!isRecord(body.state)) {
          throw new Error('A display state request needs a state object.');
        }
        const persisted = await this.customerDisplayStore.persistState(
          body.displayIri,
          body.state as unknown as CustomerDisplayStateInput,
        );
        writeJson(response, 201, { persisted, state: body.state }, 'application/ld+json');
      } catch (error: unknown) {
        writeJson(response, errorStatusCode(error), {
          error: error instanceof Error ? error.message : 'Invalid display state request.',
        });
      }
    });
    this.router.register('POST', '/pos/tables/sessions', async({ request, response }): Promise<void> => {
      try {
        if (!this.tableSessionStore) {
          throw new Error('Persisting table sessions requires a TableSessionStore.');
        }
        const result = openTableSession(await readJsonBody<TableSessionInput>(request));
        const persisted = await this.tableSessionStore.persistSession(result);
        writeJson(response, 201, { persisted, session: result.record }, 'application/ld+json');
      } catch (error: unknown) {
        writeJson(response, errorStatusCode(error), {
          error: error instanceof Error ? error.message : 'Invalid table session request.',
        });
      }
    });
    this.router.register('POST', '/pos/tables/sessions/close', async({ request, response }): Promise<void> => {
      try {
        if (!this.tableSessionStore) {
          throw new Error('Persisting table sessions requires a TableSessionStore.');
        }
        const result = closeTableSession(await readJsonBody<TableSessionCloseInput>(request));
        const persisted = await this.tableSessionStore.persistSession(result);
        writeJson(response, 200, { persisted, session: result.record }, 'application/ld+json');
      } catch (error: unknown) {
        writeJson(response, errorStatusCode(error), {
          error: error instanceof Error ? error.message : 'Invalid table session close request.',
        });
      }
    });
    this.router.register('GET', '/pos/tables/sessions', async({ request, response }): Promise<void> => {
      await readPersistedResource(response, this.tableSessionStore, request.url, 'TableSessionStore');
    });
    this.router.register('POST', '/pos/wifi-onboarding', async({ request, response }): Promise<void> => {
      try {
        if (!this.tableSessionStore) {
          throw new Error('Persisting Wi-Fi onboarding requires a TableSessionStore.');
        }
        const body = await readJsonBody<Record<string, unknown>>(request);
        const record = buildStandaloneWifiOnboarding(body as Parameters<typeof buildStandaloneWifiOnboarding>[0]);
        const iri = String(record['@id']);
        const persisted = await this.tableSessionStore.persistRecord(iri, record);
        writeJson(response, 201, { persisted, record }, 'application/ld+json');
      } catch (error: unknown) {
        writeJson(response, errorStatusCode(error), {
          error: error instanceof Error ? error.message : 'Invalid Wi-Fi onboarding request.',
        });
      }
    });
    this.router.register('GET', '/pos/wifi-onboarding', async({ request, response }): Promise<void> => {
      await readPersistedResource(response, this.tableSessionStore, request.url, 'TableSessionStore');
    });