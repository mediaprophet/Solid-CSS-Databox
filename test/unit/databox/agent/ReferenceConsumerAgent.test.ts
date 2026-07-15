import { generateKeyPairSync } from 'node:crypto';
import { ConflictHttpError } from '../../../../src/util/errors/ConflictHttpError';
import { NotFoundHttpError } from '../../../../src/util/errors/NotFoundHttpError';
import type { BitstringStatusList } from '../../../../src/databox/credential/BitstringStatusList';
import { RecordProofValidator } from '../../../../src/databox/proof/RecordProofValidator';
import { RetentionBoundedCursorFeed } from '../../../../src/databox/feed/CursorFeed';
import { AcceptanceReceiptVerifier } from '../../../../src/databox/receipt/AcceptanceReceiptVerifier';
import { ReferenceConsumerAgent } from '../../../../src/databox/agent/ReferenceConsumerAgent';
import type { ConnectionImport } from '../../../../src/databox/agent/AgentTypes';
import { DBX_PROFILE_V1 } from '../../../../src/databox/odrl/terms';
import { AgentHarness } from './AgentTestSupport';

const PROGRAM_A = 'https://org.example/programs/loyalty-a';
const PROGRAM_B = 'https://org.example/programs/health-b';

describe('ReferenceConsumerAgent', (): void => {
  let harness: AgentHarness;
  let agent: ReferenceConsumerAgent;

  beforeEach((): void => {
    harness = new AgentHarness();
    agent = new ReferenceConsumerAgent(harness.deps());
  });

  function importA(relationship = 'urn:uuid:rel-a', tenantId = 'tenant-a'): { id: string; imp: ConnectionImport } {
    const issued = harness.issueConnection({
      program: PROGRAM_A,
      relationship,
      databox: 'https://org.example/boxes/bx_a/',
      tenantId,
    });
    const id = agent.forProgram(PROGRAM_A).importConnection(issued.connectionImport);
    return { id, imp: issued.connectionImport };
  }

  describe('construction + program scoping', (): void => {
    it('defaults the clock to Date.now when no clock is injected.', (): void => {
      const noClock = new ReferenceConsumerAgent({ ...harness.deps(), now: undefined });
      expect(noClock.forProgram(PROGRAM_A).programId).toBe(PROGRAM_A);
    });

    it('rejects an empty program id.', (): void => {
      expect((): unknown => agent.forProgram('')).toThrow('non-empty string');
    });

    it('lists no connections for a program that has imported none.', (): void => {
      expect(agent.forProgram('https://org.example/programs/never').listConnections()).toEqual([]);
    });
  });

  describe('import + authenticate (holder-key proof, no bearer secret)', (): void => {
    it('imports a credential and authenticates via a holder-key proof to a not-wire-format token.', (): void => {
      const { id } = importA();
      const token = agent.forProgram(PROGRAM_A).authenticate(id);
      // Access was bootstrapped by proving control of the holder key — the token is NOT a transmissible bearer.
      expect(token.notWireFormat).toBe(true);
      expect(token.connectionId).toBe(id);
    });

    it('rejects a credential minted for another program (cross-program replay, T-08).', (): void => {
      const issued = harness.issueConnection({
        program: PROGRAM_A,
        relationship: 'urn:uuid:rel-a',
        databox: 'https://org.example/boxes/bx_a/',
        tenantId: 'tenant-a',
      });
      // Program B tries to import program A's credential.
      expect((): unknown => agent.forProgram(PROGRAM_B).importConnection(issued.connectionImport))
        .toThrow('cross-program replay');
    });

    it('cannot authenticate with only the credential bytes — the holder PRIVATE key is required.', (): void => {
      const issued = harness.issueConnection({
        program: PROGRAM_A,
        relationship: 'urn:uuid:rel-a',
        databox: 'https://org.example/boxes/bx_a/',
        tenantId: 'tenant-a',
      });
      // Swap in a DIFFERENT private key: possession of the credential document alone must not authorise.
      const wrong = generateKeyPairSync('ec', { namedCurve: 'P-256' }).privateKey;
      const tampered: ConnectionImport = { ...issued.connectionImport, holderPrivateKey: wrong };
      const id = agent.forProgram(PROGRAM_A).importConnection(tampered);
      expect((): unknown => agent.forProgram(PROGRAM_A).authenticate(id)).toThrow('signature verification failed');
    });

    it('refuses to re-import the same connection id.', (): void => {
      const { imp } = importA();
      expect((): unknown => agent.forProgram(PROGRAM_A).importConnection(imp)).toThrow('already imported');
    });
  });

  describe('retrieve + verify + store (inert)', (): void => {
    it('retrieves, independently verifies (proof + receipt) and stores inert copies.', async(): Promise<void> => {
      const { id } = importA();
      const payload = Buffer.from('{"tier":"gold"}', 'utf8');
      harness.recordsByConnection.set(id, [ harness.recordItem(payload) ]);
      const stored = await agent.forProgram(PROGRAM_A).retrieveAndStore(id);
      expect(stored).toHaveLength(1);
      expect(stored[0].inert.provenance).toBe('authenticated-pull');
      expect(stored[0].recordVerification.cryptographicallyValid).toBe(true);
      expect(stored[0].receiptVerification.cryptographicallyValid).toBe(true);
      expect(agent.forProgram(PROGRAM_A).storedRecords(id)).toHaveLength(1);
    });

    it('returns an empty result when the connection has no records.', async(): Promise<void> => {
      const { id } = importA();
      await expect(agent.forProgram(PROGRAM_A).retrieveAndStore(id)).resolves.toEqual([]);
    });

    it('treats a record with links/directives as INERT: no fetch, no submit (T-51).', async(): Promise<void> => {
      const { id } = importA();
      // A hostile record whose payload tries to drive the agent (a link to follow, a directive to submit).
      const hostile = JSON.stringify({
        tier: 'gold',
        seeAlso: 'https://attacker.example/pull-me',
        directive: 'submit',
        submitTo: 'https://attacker.example/collect',
      });
      harness.recordsByConnection.set(id, [ harness.recordItem(hostile) ]);
      await agent.forProgram(PROGRAM_A).retrieveAndStore(id);
      // Exactly ONE outbound fetch (the one the consumer invoked) and ZERO submissions — the links/directives
      // inside the record caused no additional I/O.
      expect(harness.fetchCount).toBe(1);
      expect(harness.submitCount).toBe(0);
      // The link/directive content is retained verbatim as inert data, never acted upon.
      const [ stored ] = agent.forProgram(PROGRAM_A).storedRecords(id);
      expect(stored.inert.payload.toString()).toContain('attacker.example');
      expect(Object.isFrozen(stored.inert)).toBe(true);
    });

    it('exported records + receipts verify INDEPENDENTLY of the provider (T-46).', async(): Promise<void> => {
      const { id } = importA();
      const payload = '{"tier":"gold"}';
      harness.recordsByConnection.set(id, [ harness.recordItem(payload) ]);
      await agent.forProgram(PROGRAM_A).retrieveAndStore(id);
      const bundle = agent.forProgram(PROGRAM_A).exportEvidence(id);

      // Re-verify with FRESH validators + the consumer's own trust config — no provider endpoint in the loop.
      const recordValidator = new RecordProofValidator();
      const receiptVerifier = new AcceptanceReceiptVerifier();
      const [ entry ] = bundle.records;
      const record = recordValidator.validate(entry.recordJws, {
        trustStore: harness.trustStore(PROGRAM_A),
        pinnedContexts: harness.pinnedContexts(),
        statusListResolver: (cred): BitstringStatusList | undefined =>
          cred === 'https://org.example/status/records' ? harness.recordStatusList : undefined,
        now: 5_000_000,
        acceptedPayload: entry.payload,
      });
      expect(record.cryptographicallyValid).toBe(true);
      const receipt = receiptVerifier.verify(entry.receiptJws, {
        trustStore: harness.trustStore(PROGRAM_A),
        acceptedPayload: entry.payload,
      });
      expect(receipt.cryptographicallyValid).toBe(true);
    });
  });

  describe('cursor recovery (exactly once)', (): void => {
    it('recovers missed events exactly once and advances the cursor.', async(): Promise<void> => {
      const { id } = importA('urn:uuid:rel-a', 'tenant-a');
      harness.cursorFeed.record('tenant-a', { eventId: 'e1', resourceRef: 'r1', activity: 'Create' });
      harness.cursorFeed.record('tenant-a', { eventId: 'e2', resourceRef: 'r2', activity: 'Create' });
      const first = await agent.forProgram(PROGRAM_A).recover(id);
      expect(first.map((e): string => e.eventId)).toEqual([ 'e1', 'e2' ]);
      // A second recovery returns nothing — the cursor advanced and each event was recorded exactly once.
      const second = await agent.forProgram(PROGRAM_A).recover(id);
      expect(second).toEqual([]);
    });

    it('surfaces a recovery gap (cursor below retained floor) rather than masking it.', async(): Promise<void> => {
      // Use a tiny-window feed so an old cursor falls out of retention.
      const feed = new RetentionBoundedCursorFeed(1);
      const localHarness = new AgentHarness();
      const localAgent = new ReferenceConsumerAgent({ ...localHarness.deps(), cursorFeed: feed });
      const issued = localHarness.issueConnection({
        program: PROGRAM_A,
        relationship: 'r',
        databox: 'https://org.example/boxes/bx_a/',
        tenantId: 'tg',
      });
      const id = localAgent.forProgram(PROGRAM_A).importConnection(issued.connectionImport);
      feed.record('tg', { eventId: 'g1', resourceRef: 'r1', activity: 'Create' });
      await localAgent.forProgram(PROGRAM_A).recover(id);
      feed.record('tg', { eventId: 'g2', resourceRef: 'r2', activity: 'Create' });
      feed.record('tg', { eventId: 'g3', resourceRef: 'r3', activity: 'Create' });
      await expect(localAgent.forProgram(PROGRAM_A).recover(id)).rejects.toThrow(ConflictHttpError);
    });
  });

  describe('present ODRL terms', (): void => {
    it('presents applicable terms for an existing connection.', (): void => {
      const { id } = importA();
      const presented = agent.forProgram(PROGRAM_A).presentTerms(id, {
        profile: DBX_PROFILE_V1,
        permission: [{ action: 'http://www.w3.org/ns/odrl/2/read' }],
      });
      expect(presented.fullyUnderstood).toBe(true);
      expect(presented.rules[0].humanReadable).toContain('read this record');
    });

    it('requires the connection to exist (scoped to this program).', (): void => {
      expect((): unknown => agent.forProgram(PROGRAM_A).presentTerms('nope', { profile: DBX_PROFILE_V1 }))
        .toThrow(NotFoundHttpError);
    });
  });

  describe('scoped submission + receipt', (): void => {
    it('submits ONLY the selected fields and verifies the returned acceptance receipt.', async(): Promise<void> => {
      const { id } = importA();
      const result = await agent.forProgram(PROGRAM_A).submitCorrection(
        id,
        { diet: 'vegan', allergy: 'peanut', address: '1 Road' },
        [ 'diet' ],
        { recordClass: 'https://org.example/classes/loyalty', correctionOf: 'urn:uuid:record-1' },
      );
      // Only the selected field crossed the boundary.
      expect(Object.keys(harness.lastSubmission!.fields)).toEqual([ 'diet' ]);
      expect(harness.lastSubmission!.fields).toEqual({ diet: 'vegan' });
      expect(result.receiptVerification.cryptographicallyValid).toBe(true);
      expect(result.receiptVerification.binding.operation).toBe('submission');
      // The verified receipt was retained.
      expect(agent.forProgram(PROGRAM_A).exportEvidence(id).receipts).toHaveLength(1);
    });
  });

  describe('lifecycle: pause / resume / remove / rotate', (): void => {
    it('pausing blocks authentication (and drops the token); resuming restores it.', (): void => {
      const { id } = importA();
      const program = agent.forProgram(PROGRAM_A);
      program.authenticate(id);
      program.pause(id);
      expect((): unknown => program.authenticate(id)).toThrow('paused');
      program.resume(id);
      expect(program.authenticate(id).notWireFormat).toBe(true);
    });

    it('removing a connection makes it unreachable (fail closed).', (): void => {
      const { id } = importA();
      const program = agent.forProgram(PROGRAM_A);
      program.remove(id);
      expect((): unknown => program.storedRecords(id)).toThrow(NotFoundHttpError);
    });

    it('rotates to a fresh credential for the same relationship; the predecessor is removed.', (): void => {
      const { id } = importA('urn:uuid:rel-a');
      const replacement = harness.issueConnection({
        program: PROGRAM_A,
        relationship: 'urn:uuid:rel-a',
        databox: 'https://org.example/boxes/bx_a/',
        tenantId: 't2',
      });
      const program = agent.forProgram(PROGRAM_A);
      const newId = program.rotate(id, replacement.connectionImport);
      expect(newId).not.toBe(id);
      expect(program.listConnections()).toEqual([ newId ]);
      expect((): unknown => program.authenticate(id)).toThrow(NotFoundHttpError);
      expect(program.authenticate(newId).notWireFormat).toBe(true);
    });

    it('preserves retained evidence + recovery cursor across rotation (M1, T-46).', async(): Promise<void> => {
      const { id } = importA('urn:uuid:rel-a', 'tenant-a');
      const program = agent.forProgram(PROGRAM_A);
      // Accumulate evidence + recovery state on the predecessor.
      harness.recordsByConnection.set(id, [ harness.recordItem('{"tier":"gold"}') ]);
      await program.retrieveAndStore(id);
      await program.submitCorrection(id, { diet: 'vegan' }, [ 'diet' ], { recordClass: 'c' });
      harness.cursorFeed.record('tenant-a', { eventId: 'e1', resourceRef: 'r1', activity: 'Create' });
      await program.recover(id);

      const replacement = harness.issueConnection({
        program: PROGRAM_A,
        relationship: 'urn:uuid:rel-a',
        databox: 'https://org.example/boxes/bx_a/',
        tenantId: 'ignored-on-rotation',
      });
      const newId = program.rotate(id, replacement.connectionImport);

      // The pre-rotation record + submission receipt survive on the successor.
      const bundle = program.exportEvidence(newId);
      expect(bundle.records).toHaveLength(1);
      expect(bundle.receipts).toHaveLength(1);
      // The cursor + recovered-event dedup survive: a NEW event recovers, the old one is not replayed.
      harness.cursorFeed.record('tenant-a', { eventId: 'e2', resourceRef: 'r2', activity: 'Create' });
      const recovered = await program.recover(newId);
      expect(recovered.map((e): string => e.eventId)).toEqual([ 'e2' ]);
    });

    it('refuses a rotation to a different relationship and leaves the registry unchanged (T-08).', (): void => {
      const { id } = importA('urn:uuid:rel-a');
      const wrong = harness.issueConnection({
        program: PROGRAM_A,
        relationship: 'urn:uuid:OTHER',
        databox: 'https://org.example/boxes/bx_a/',
        tenantId: 't3',
      });
      const program = agent.forProgram(PROGRAM_A);
      expect((): unknown => program.rotate(id, wrong.connectionImport)).toThrow('same relationship');
      // The predecessor is still the only connection; the rejected successor was rolled back.
      expect(program.listConnections()).toEqual([ id ]);
    });

    it('rejects pausing a non-active / resuming a non-paused connection.', (): void => {
      const { id } = importA();
      const program = agent.forProgram(PROGRAM_A);
      expect((): unknown => program.resume(id)).toThrow('Only a paused');
      program.pause(id);
      expect((): unknown => program.pause(id)).toThrow('Only an active');
    });
  });

  describe('per-program isolation + no cross-program correlation (T-03/T-08)', (): void => {
    it('neither program can see, list or reach the other program\'s connection.', (): void => {
      const a = importA('urn:uuid:rel-a', 'tenant-a');
      const bIssued = harness.issueConnection({
        program: PROGRAM_B,
        relationship: 'urn:uuid:rel-b',
        databox: 'https://org.example/boxes/bx_b/',
        tenantId: 't-b',
      });
      const bId = agent.forProgram(PROGRAM_B).importConnection(bIssued.connectionImport);

      // Each program lists ONLY its own connection.
      expect(agent.forProgram(PROGRAM_A).listConnections()).toEqual([ a.id ]);
      expect(agent.forProgram(PROGRAM_B).listConnections()).toEqual([ bId ]);
      // Program A cannot reach program B's connection id (404 existence-hiding, not 403).
      expect((): unknown => agent.forProgram(PROGRAM_A).storedRecords(bId)).toThrow(NotFoundHttpError);
    });

    it('removing / pausing one program\'s connection leaves another program unaffected.', async(): Promise<void> => {
      const a = importA('urn:uuid:rel-a', 'tenant-a');
      const bIssued = harness.issueConnection({
        program: PROGRAM_B,
        relationship: 'urn:uuid:rel-b',
        databox: 'https://org.example/boxes/bx_b/',
        tenantId: 'tb',
      });
      const bId = agent.forProgram(PROGRAM_B).importConnection(bIssued.connectionImport);
      harness.recordsByConnection.set(bId, [ harness.recordItem('{"ok":true}') ]);

      // Disrupt program A entirely.
      agent.forProgram(PROGRAM_A).pause(a.id);
      agent.forProgram(PROGRAM_A).remove(a.id);

      // Program B is unaffected: it still authenticates, retrieves and keeps its own isolated copies.
      const stored = await agent.forProgram(PROGRAM_B).retrieveAndStore(bId);
      expect(stored).toHaveLength(1);
      expect(agent.forProgram(PROGRAM_B).listConnections()).toEqual([ bId ]);
    });

    it('rejects importing two connections that share a tenantId — no shared recovery stream (M2).', (): void => {
      importA('urn:uuid:rel-a', 'shared-tenant');
      const clash = harness.issueConnection({
        program: PROGRAM_B,
        relationship: 'urn:uuid:rel-b',
        databox: 'https://org.example/boxes/bx_b/',
        tenantId: 'shared-tenant',
      });
      expect((): unknown => agent.forProgram(PROGRAM_B).importConnection(clash.connectionImport))
        .toThrow('already bound to another connection');
    });
  });

  describe('retained-evidence integrity (L1)', (): void => {
    it('hands out payload copies so a caller cannot corrupt the retained evidence.', async(): Promise<void> => {
      const { id } = importA();
      harness.recordsByConnection.set(id, [ harness.recordItem(Buffer.from('{"tier":"gold"}', 'utf8')) ]);
      const program = agent.forProgram(PROGRAM_A);
      await program.retrieveAndStore(id);

      // Mutate the payload handed back by both surfaces.
      (program.storedRecords(id)[0].inert.payload as Buffer).fill(0);
      (program.exportEvidence(id).records[0].payload as Buffer).fill(0);

      // The RETAINED evidence is unchanged (still the exact bytes that match the payload digest).
      expect(program.exportEvidence(id).records[0].payload.toString()).toBe('{"tier":"gold"}');
    });
  });
});
