import test from 'node:test';
import assert from 'node:assert/strict';
import { INITIAL_SEED_STATE } from '../data/seedData';
import { SALARY_TIER_LABELS, sumManualSalaries } from './payroll';
import {
  buildAnnualTierParametricTable,
  calculateAnnualTierBreakdown,
  distributeSalaryAcrossTiers,
} from './tierAnalytics';

test('distributeSalaryAcrossTiers preserves exact integer sum across 8 tiers', () => {
  const tiers: [number, number, number, number, number, number, number, number] = [
    10_000_000, 5_000_000, 2_000_000, 0, 1_000_000, 0, 1_000_000, 1_000_000,
  ];
  const distributed = distributeSalaryAcrossTiers(17_333_333, tiers);
  assert.equal(distributed.length, 8);
  assert.equal(sumManualSalaries(distributed), 17_333_333);
  assert.equal(distributed[3], 0);
  assert.equal(distributed[5], 0);
});

test('calculateAnnualTierBreakdown aggregates recorded vs projected 12 months and builds table', () => {
  const recordedOnly = calculateAnnualTierBreakdown({
    year: 1405,
    activePeriodKey: '1405-08',
    employees: INITIAL_SEED_STATE.employees,
    timesheets: INITIAL_SEED_STATE.timesheets,
    loans: INITIAL_SEED_STATE.loans,
    settings: INITIAL_SEED_STATE.settings,
    manualPayments: INITIAL_SEED_STATE.manualPayments,
    includeProjectedMonths: false,
  });

  assert.equal(recordedOnly.months.length, 12);
  assert.equal(recordedOnly.recordedMonthCount, 1);
  const aban = recordedOnly.months.find((m) => m.periodKey === '1405-08');
  assert.ok(aban && aban.hasRecordedData && aban.grandTotal > 0);
  const farvardin = recordedOnly.months.find((m) => m.periodKey === '1405-01');
  assert.ok(farvardin && !farvardin.hasRecordedData && farvardin.grandTotal === 0);

  const projected = calculateAnnualTierBreakdown({
    year: 1405,
    activePeriodKey: '1405-08',
    employees: INITIAL_SEED_STATE.employees,
    timesheets: INITIAL_SEED_STATE.timesheets,
    loans: INITIAL_SEED_STATE.loans,
    settings: INITIAL_SEED_STATE.settings,
    manualPayments: INITIAL_SEED_STATE.manualPayments,
    includeProjectedMonths: true,
  });

  assert.ok(projected.annualGrandTotal > recordedOnly.annualGrandTotal);
  const table = buildAnnualTierParametricTable(projected);
  assert.equal(table.columns.length, 1 + SALARY_TIER_LABELS.length + 1);
  assert.equal(table.rows.length, 12);
  assert.ok(table.totalsRow);
});
