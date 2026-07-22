import {
  assignShift,
  generatePayslip,
  onboardEmployee,
  submitExpenseClaim,
  trackCompliance,
} from '../../../../src/databox/cms/modules/hr/Hr';

describe('HR module', () => {
  describe('onboardEmployee', () => {
    const baseInput = {
      id: 'https://databox.example.org/hr/onboarding/001',
      person: 'https://databox.example.org/members/alice',
      organisation: 'https://databox.example.org/org/restaurant',
      role: 'https://databox.example.org/roles/chef',
      employmentType: 'employee' as const,
      startDate: '2025-07-01T09:00:00Z',
    };

    it('onboards an employee', () => {
      const result = onboardEmployee(baseInput);
      expect(result.record['@type']).toContain('OnboardEvent');
      expect(result.status).toBe('onboarded');
      expect(result.employmentType).toBe('employee');
    });

    it('rejects invalid employment type', () => {
      expect(() => onboardEmployee({ ...baseInput, employmentType: 'intern' as any }))
        .toThrow('Employment type must be one of');
    });

    it('supports all employment types', () => {
      for (const type of [ 'employee', 'contractor', 'casual', 'volunteer' ] as const) {
        const result = onboardEmployee({ ...baseInput, employmentType: type });
        expect(result.employmentType).toBe(type);
      }
    });

    it('includes contract and pod URLs when provided', () => {
      const result = onboardEmployee({
        ...baseInput,
        contractUrl: 'https://databox.example.org/contracts/001',
        podUrl: 'https://databox.example.org/pods/alice',
      });
      expect((result.record.target as Record<string, unknown>)['@id']).toContain('contracts/001');
      expect(result.record['solid:pod']).toContain('pods/alice');
    });
  });

  describe('assignShift', () => {
    const baseInput = {
      id: 'https://databox.example.org/shifts/s001',
      person: 'https://databox.example.org/members/alice',
      organisation: 'https://databox.example.org/org/restaurant',
      startTime: '2025-07-01T09:00:00Z',
      endTime: '2025-07-01T17:00:00Z',
      role: 'https://databox.example.org/roles/chef',
    };

    it('assigns a shift with correct duration', () => {
      const result = assignShift(baseInput);
      expect(result.record['@type']).toContain('Shift');
      expect(result.durationMinutes).toBe(480);
    });

    it('subtracts break time from duration', () => {
      const result = assignShift({ ...baseInput, breakMinutes: 30 });
      expect(result.durationMinutes).toBe(450);
    });

    it('rejects endTime before startTime', () => {
      expect(() => assignShift({
        ...baseInput,
        startTime: '2025-07-01T17:00:00Z',
        endTime: '2025-07-01T09:00:00Z',
      })).toThrow('endTime must be after startTime');
    });
  });

  describe('trackCompliance', () => {
    it('tracks a valid credential', () => {
      const future = new Date();
      future.setDate(future.getDate() + 365);
      const result = trackCompliance({
        id: 'https://databox.example.org/compliance/001',
        person: 'https://databox.example.org/members/alice',
        credentialType: 'Food Safety Certificate',
        issuedAt: '2025-01-01T00:00:00Z',
        expiresAt: future.toISOString(),
        issuer: 'https://databox.example.org/org/food-safety-authority',
        status: 'valid',
      });
      expect(result.needsRenewal).toBe(false);
      expect(result.daysToExpiry).toBeGreaterThan(300);
    });

    it('flags credentials expiring within 30 days', () => {
      const soon = new Date();
      soon.setDate(soon.getDate() + 15);
      const result = trackCompliance({
        id: 'https://databox.example.org/compliance/002',
        person: 'https://databox.example.org/members/bob',
        credentialType: 'RSA Certificate',
        issuedAt: '2024-01-01T00:00:00Z',
        expiresAt: soon.toISOString(),
        issuer: 'https://databox.example.org/org/liquor-authority',
        status: 'expiring',
      });
      expect(result.needsRenewal).toBe(true);
      expect(result.daysToExpiry).toBeLessThanOrEqual(15);
    });
  });

  describe('generatePayslip', () => {
    it('generates a payslip with correct totals', () => {
      const result = generatePayslip({
        id: 'https://databox.example.org/payslips/001',
        person: 'https://databox.example.org/members/alice',
        organisation: 'https://databox.example.org/org/restaurant',
        payPeriodStart: '2025-07-01',
        payPeriodEnd: '2025-07-14',
        grossAmount: 2000,
        netAmount: 1500,
        currency: 'AUD',
        deductions: [
          { label: 'Tax', amount: 350 },
          { label: 'Super', amount: 150 },
        ],
        payDate: '2025-07-20',
      });
      expect(result.record['@type']).toContain('Payslip');
      expect(result.totalDeductions).toBe(500);
    });

    it('rejects net exceeding gross', () => {
      expect(() => generatePayslip({
        id: 'https://databox.example.org/payslips/002',
        person: 'https://databox.example.org/members/alice',
        organisation: 'https://databox.example.org/org/restaurant',
        payPeriodStart: '2025-07-01',
        payPeriodEnd: '2025-07-14',
        grossAmount: 1000,
        netAmount: 1200,
        currency: 'AUD',
        deductions: [],
        payDate: '2025-07-20',
      })).toThrow('Net amount cannot exceed gross');
    });

    it('rejects deductions not matching difference', () => {
      expect(() => generatePayslip({
        id: 'https://databox.example.org/payslips/003',
        person: 'https://databox.example.org/members/alice',
        organisation: 'https://databox.example.org/org/restaurant',
        payPeriodStart: '2025-07-01',
        payPeriodEnd: '2025-07-14',
        grossAmount: 2000,
        netAmount: 1500,
        currency: 'AUD',
        deductions: [{ label: 'Tax', amount: 100 }],
        payDate: '2025-07-20',
      })).toThrow('does not match');
    });
  });

  describe('submitExpenseClaim', () => {
    it('submits an expense claim', () => {
      const result = submitExpenseClaim({
        id: 'https://databox.example.org/expenses/001',
        person: 'https://databox.example.org/members/alice',
        organisation: 'https://databox.example.org/org/restaurant',
        amount: 75.5,
        currency: 'AUD',
        category: 'Travel',
        description: 'Taxi to supplier',
        incurredAt: '2025-07-15',
        receiptUrl: 'https://databox.example.org/receipts/001',
      });
      expect(result.record['@type']).toContain('ExpenseClaim');
      expect(result.status).toBe('pending');
    });
  });
});
