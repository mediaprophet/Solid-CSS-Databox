import type { DataboxRequestContext } from '../../../../src/databox/context/DataboxRequestContext';
import { buildAuditRecord } from '../../../../src/databox/evidence/AuditEvidence';
import { projectForConsumer } from '../../../../src/databox/evidence/AuditProjection';
import { HashChainedEvidenceLedger } from '../../../../src/databox/evidence/EvidenceLedgerStore';
import { allowInput, fixedClock } from './EvidenceTestSupport';

const SUBJECT = 'https://id.example/subject#me';

const CTX_ACTOR: DataboxRequestContext = { actor: SUBJECT, webId: 'https://id.example/other#me' };
const CTX_WEBID: DataboxRequestContext = { actor: 'https://id.example/agentA#me', webId: SUBJECT };
const CTX_REP: DataboxRequestContext = {
  actor: 'https://id.example/agentA#me',
  webId: 'https://id.example/agentW#me',
  representedEntity: SUBJECT,
};
const CTX_OTHER: DataboxRequestContext = { actor: 'https://id.example/x#me', webId: 'https://id.example/y#me' };

async function seed(): Promise<HashChainedEvidenceLedger> {
  const ledger = new HashChainedEvidenceLedger(fixedClock());
  // Owned via actor; carries a staff identifier and a disputed state.
  await ledger.append({
    tenantId: 't1',
    record: buildAuditRecord(allowInput({ institutionalPrincipal: 'staff-1', recordState: 'disputed' }), CTX_ACTOR),
  });
  // Owned via WebID; a DENIED decision on the subject's box.
  await ledger.append({
    tenantId: 't1',
    record: buildAuditRecord(
      allowInput({ decision: 'deny', reasonCode: 'assurance-insufficient', targetDigest: 'opaque:box-1' }),
      CTX_WEBID,
    ),
  });
  // Owned via represented entity; default (current) state, distinct reason code.
  await ledger.append({ tenantId: 't1', record: buildAuditRecord(allowInput({ reasonCode: 'rep-ok' }), CTX_REP) });
  // NOT owned: the subject appears only as the institutional principal (staff) — must be excluded.
  await ledger.append({
    tenantId: 't1',
    record: buildAuditRecord(allowInput({ institutionalPrincipal: SUBJECT }), CTX_OTHER),
  });
  return ledger;
}

describe('projectForConsumer', (): void => {
  it('keeps only subject-owned events (actor OR webId OR represented), not staff-only.', async(): Promise<void> => {
    const ledger = await seed();
    const view = projectForConsumer(ledger.entries('t1'), SUBJECT);
    expect(view.subject).toBe(SUBJECT);
    // Three owned; the staff-only fourth is excluded.
    expect(view.entries).toHaveLength(3);
  });

  it('minimises each entry: no staff id, actor, issuer or outbox leaks into the view.', async(): Promise<void> => {
    const ledger = await seed();
    const view = projectForConsumer(ledger.entries('t1'), SUBJECT);
    const [ first ] = view.entries;
    expect(Object.keys(first).sort((left, right): number => left < right ? -1 : 1)).toStrictEqual([
      'decision',
      'odrlState',
      'operation',
      'policyVersion',
      'reasonCode',
      'recordedAt',
      'state',
      'targetDigest',
    ]);
    expect(first.state).toBe('disputed');
    // The staff identifier bound in the ledger record never appears in the consumer projection.
    expect(JSON.stringify(view)).not.toContain('staff-1');
  });

  it('retains a denial (without content) and defaults an unset record state to current.', async(): Promise<void> => {
    const ledger = await seed();
    const view = projectForConsumer(ledger.entries('t1'), SUBJECT);
    const denial = view.entries.find((entry): boolean => entry.decision === 'deny');
    expect(denial?.reasonCode).toBe('assurance-insufficient');
    expect(denial?.targetDigest).toBe('opaque:box-1');
    const current = view.entries.find((entry): boolean => entry.reasonCode === 'rep-ok');
    expect(current?.state).toBe('current');
  });

  it('returns an empty view for a subject with no owned events.', async(): Promise<void> => {
    const ledger = await seed();
    expect(projectForConsumer(ledger.entries('t1'), 'https://id.example/nobody#me').entries).toStrictEqual([]);
  });

  it('fails closed on a blank subject.', (): void => {
    expect((): unknown => projectForConsumer([], '')).toThrow(`'subject'`);
  });
});
