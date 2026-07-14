import {
  checkTermSupport,
  isProfileSupported,
  isTermSupported,
} from '../../../../src/databox/odrl/TermSupport';
import {
  DBX_ACTIONS,
  DBX_CONFLICT_STRATEGIES,
  DBX_DUTIES,
  DBX_DUTY_STATES,
  DBX_LEFT_OPERANDS,
  DBX_NAMESPACE,
  DBX_PROFILE_V1,
  DBX_PROFILE_VERSION,
  DBX_RIGHT_OPERANDS,
  DBX_SOURCE_RANKS,
  DBX_UPDATE_EFFECTS,
  DEPRECATED_TERMS,
  ODRL_NAMESPACE,
  REUSED_ODRL_ACTIONS,
  REUSED_ODRL_LEFT_OPERANDS,
  REUSED_ODRL_OPERATORS,
} from '../../../../src/databox/odrl/terms';

// Term-level conformance tests for the Databox ODRL Profile (DBX-07). Every custom term must be
// recognised in its category, every reused ODRL Core term must be accepted, and every unknown or
// deprecated term must FAIL CLOSED with a specific audit reason (ADR-0012/0013/0015).
describe('Databox ODRL Profile terms', (): void => {
  describe('stable IRIs and profile constants', (): void => {
    it('pins the namespace, profile IRI and version.', (): void => {
      expect(DBX_NAMESPACE).toBe('https://w3id.org/solid-databox/ns#');
      expect(ODRL_NAMESPACE).toBe('http://www.w3.org/ns/odrl/2/');
      expect(DBX_PROFILE_V1).toBe('https://w3id.org/solid-databox/odrl-profile/v1');
      expect(DBX_PROFILE_VERSION).toBe('1.0.0');
    });

    it('builds every custom term IRI under the dbx: namespace.', (): void => {
      const groups = [
        DBX_ACTIONS,
        DBX_DUTIES,
        DBX_LEFT_OPERANDS,
        DBX_RIGHT_OPERANDS,
        DBX_DUTY_STATES,
        DBX_CONFLICT_STRATEGIES,
        DBX_SOURCE_RANKS,
        DBX_UPDATE_EFFECTS,
      ];
      for (const group of groups) {
        for (const iri of Object.values(group)) {
          expect(iri.startsWith(DBX_NAMESPACE)).toBe(true);
        }
      }
    });

    it('lists the ADR-0012 duty set including the six typed delivery duties.', (): void => {
      expect(DBX_DUTIES.makeAvailable).toBe(`${DBX_NAMESPACE}makeAvailable`);
      expect(DBX_DUTIES.signalHolder).toBe(`${DBX_NAMESPACE}signalHolder`);
      expect(DBX_DUTIES.deliverToInbox).toBe(`${DBX_NAMESPACE}deliverToInbox`);
      expect(DBX_DUTIES.acknowledge).toBe(`${DBX_NAMESPACE}acknowledge`);
      expect(DBX_DUTIES.issueReceipt).toBe(`${DBX_NAMESPACE}issueReceipt`);
      expect(DBX_DUTIES.stageForReview).toBe(`${DBX_NAMESPACE}stageForReview`);
    });

    it('reuses ODRL Core terms rather than minting dbx: equivalents.', (): void => {
      for (const iri of [ ...REUSED_ODRL_ACTIONS, ...REUSED_ODRL_LEFT_OPERANDS, ...REUSED_ODRL_OPERATORS ]) {
        expect(iri.startsWith(ODRL_NAMESPACE)).toBe(true);
      }
    });
  });

  describe('checkTermSupport — supported terms', (): void => {
    it('accepts every enumerated custom action and duty.', (): void => {
      for (const iri of [ ...Object.values(DBX_ACTIONS), ...Object.values(DBX_DUTIES) ]) {
        expect(checkTermSupport('action', iri)).toEqual({ supported: true, reason: 'supported' });
      }
    });

    it('accepts every duty IRI in the duty category and every duty state.', (): void => {
      for (const iri of Object.values(DBX_DUTIES)) {
        expect(isTermSupported('duty', iri)).toBe(true);
      }
      for (const iri of Object.values(DBX_DUTY_STATES)) {
        expect(isTermSupported('dutyState', iri)).toBe(true);
      }
    });

    it('accepts reused ODRL Core actions, left operands and operators.', (): void => {
      for (const iri of REUSED_ODRL_ACTIONS) {
        expect(isTermSupported('action', iri)).toBe(true);
      }
      for (const iri of REUSED_ODRL_LEFT_OPERANDS) {
        expect(isTermSupported('leftOperand', iri)).toBe(true);
      }
      for (const iri of REUSED_ODRL_OPERATORS) {
        expect(isTermSupported('operator', iri)).toBe(true);
      }
    });

    it('accepts custom left/right operands, conflict strategies, source ranks and update effects.', (): void => {
      expect(isTermSupported('leftOperand', DBX_LEFT_OPERANDS.minimumAssurance)).toBe(true);
      expect(isTermSupported('rightOperand', DBX_RIGHT_OPERANDS.otherProgram)).toBe(true);
      expect(isTermSupported('conflictStrategy', DBX_CONFLICT_STRATEGIES.prohibitOverrides)).toBe(true);
      expect(isTermSupported('sourceRank', DBX_SOURCE_RANKS.mandatoryBaseline)).toBe(true);
      expect(isTermSupported('updateEffect', DBX_UPDATE_EFFECTS.prospective)).toBe(true);
    });
  });

  describe('checkTermSupport — fail closed', (): void => {
    it('rejects the deprecated dbx:notifyHolder alias regardless of category.', (): void => {
      for (const iri of DEPRECATED_TERMS) {
        expect(checkTermSupport('action', iri)).toEqual({ supported: false, reason: 'deprecated-term' });
        expect(checkTermSupport('duty', iri)).toEqual({ supported: false, reason: 'deprecated-term' });
      }
    });

    it('rejects an unknown category.', (): void => {
      expect(checkTermSupport('not-a-category', DBX_DUTIES.issueReceipt))
        .toEqual({ supported: false, reason: 'unknown-category' });
    });

    it('rejects an IRI that is not enumerated in its category.', (): void => {
      expect(checkTermSupport('action', `${DBX_NAMESPACE}madeUpAction`))
        .toEqual({ supported: false, reason: 'unsupported-term' });
      // A permit-overrides conflict strategy is intentionally not supported (ADR-0013).
      expect(checkTermSupport('conflictStrategy', `${ODRL_NAMESPACE}perm`))
        .toEqual({ supported: false, reason: 'unsupported-term' });
    });

    it('does not leak a duty IRI into the wrong category.', (): void => {
      // IssueReceipt is a valid duty/action but not a valid operator.
      expect(isTermSupported('operator', DBX_DUTIES.issueReceipt)).toBe(false);
    });
  });

  describe('isProfileSupported', (): void => {
    it('accepts exactly the pinned profile IRI.', (): void => {
      expect(isProfileSupported(DBX_PROFILE_V1)).toBe(true);
    });

    it('fails closed for any other profile IRI.', (): void => {
      expect(isProfileSupported('https://w3id.org/solid-databox/odrl-profile/v2')).toBe(false);
      expect(isProfileSupported('')).toBe(false);
    });
  });
});
