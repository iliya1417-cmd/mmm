import type {
  Employee,
  Loan,
  ManualSalaryPayment,
  MonthlyTimesheet,
  PayrollSettings,
} from '../types/payroll';
import {
  JALALI_MONTHS,
  SALARY_TIER_LABELS,
  type SalaryTierTuple,
  calculatePayrollReport,
  normalizeManualSalaries,
  sumManualSalaries,
} from './payroll';
import type { ParametricTableData } from './parametricReport';

export interface MonthlyTierBreakdownRow {
  month: number;
  monthLabel: string;
  periodKey: string;
  hasRecordedData: boolean;
  tierTotals: SalaryTierTuple;
  grandTotal: number;
}

export interface TierSummaryItem {
  tierIndex: number;
  label: string;
  annualTotal: number;
  sharePercent: number;
}

export interface AnnualTierBreakdownReport {
  year: number;
  months: MonthlyTierBreakdownRow[];
  annualTierTotals: SalaryTierTuple;
  annualGrandTotal: number;
  tierSummary: TierSummaryItem[];
  recordedMonthCount: number;
}

/**
 * Distributes an employee's computed earned base salary across their 8 configured salary tiers
 * (تولید سیما ... فضای مجازی) in exact integer تومان/ریال preserving the total.
 */
export function distributeSalaryAcrossTiers(
  earnedBaseAmount: number,
  tiers: SalaryTierTuple
): SalaryTierTuple {
  const out: SalaryTierTuple = [0, 0, 0, 0, 0, 0, 0, 0];
  const target = Math.max(0, Math.round(earnedBaseAmount));
  if (target <= 0) return out;

  const tierSum = sumManualSalaries(tiers);
  if (tierSum <= 0) {
    out[0] = target;
    return out;
  }

  let assigned = 0;
  let largestIdx = 0;
  for (let i = 0; i < SALARY_TIER_LABELS.length; i += 1) {
    if (tiers[i] > tiers[largestIdx]) largestIdx = i;
    if (tiers[i] <= 0) continue;
    const share = Math.round((target * tiers[i]) / tierSum);
    out[i] = share;
    assigned += share;
  }

  const diff = target - assigned;
  if (diff !== 0) {
    out[largestIdx] = Math.max(0, out[largestIdx] + diff);
  }
  return out;
}

/**
 * Computes organizational 8-tier salary totals across all 12 Jalali months of a given year,
 * extracting values directly from existing payslip calculations.
 *
 * When `includeProjectedMonths` is true, months without explicit timesheets/manual payments
 * are projected using active employees' standard monthly payslip. Otherwise only months with
 * recorded timesheets, manual payments, or matching `activePeriodKey` are tallied.
 */
export function calculateAnnualTierBreakdown(params: {
  year: number;
  activePeriodKey: string;
  employees: ReadonlyArray<Employee>;
  timesheets: ReadonlyArray<MonthlyTimesheet>;
  loans: ReadonlyArray<Loan>;
  settings: PayrollSettings;
  manualPayments?: ReadonlyArray<ManualSalaryPayment>;
  includeInactive?: boolean;
  includeProjectedMonths?: boolean;
}): AnnualTierBreakdownReport {
  const {
    year,
    activePeriodKey,
    employees,
    timesheets,
    loans,
    settings,
    manualPayments = [],
    includeInactive = false,
    includeProjectedMonths = false,
  } = params;

  const empList = [...employees];
  const tsList = [...timesheets];
  const loanList = [...loans];
  const manualList = [...manualPayments];

  const monthsWithData = new Set<string>([activePeriodKey]);
  for (const ts of tsList) monthsWithData.add(ts.periodKey);
  for (const mp of manualList) monthsWithData.add(mp.periodKey);

  const months: MonthlyTierBreakdownRow[] = [];
  const annualTierTotals: SalaryTierTuple = [0, 0, 0, 0, 0, 0, 0, 0];
  let recordedMonthCount = 0;

  for (const mObj of JALALI_MONTHS) {
    const periodKey = `${year}-${String(mObj.value).padStart(2, '0')}`;
    const hasRecordedData = monthsWithData.has(periodKey);
    const tierTotals: SalaryTierTuple = [0, 0, 0, 0, 0, 0, 0, 0];

    if (hasRecordedData || includeProjectedMonths) {
      if (hasRecordedData) recordedMonthCount += 1;
      const report = calculatePayrollReport(
        empList,
        tsList,
        loanList,
        settings,
        periodKey,
        includeInactive,
        manualList
      );

      for (const slip of report.payslips) {
        const tiers = normalizeManualSalaries(
          slip.employee.manualSalaries,
          slip.employee.baseMonthlySalary
        );
        const distributed = distributeSalaryAcrossTiers(
          slip.baseSalaryEarned,
          tiers
        );
        for (let i = 0; i < SALARY_TIER_LABELS.length; i += 1) {
          tierTotals[i] += distributed[i];
          annualTierTotals[i] += distributed[i];
        }
      }
    }

    months.push({
      month: mObj.value,
      monthLabel: mObj.label,
      periodKey,
      hasRecordedData,
      tierTotals,
      grandTotal: sumManualSalaries(tierTotals),
    });
  }

  const annualGrandTotal = sumManualSalaries(annualTierTotals);
  const tierSummary: TierSummaryItem[] = SALARY_TIER_LABELS.map((label, idx) => ({
    tierIndex: idx,
    label,
    annualTotal: annualTierTotals[idx],
    sharePercent:
      annualGrandTotal > 0
        ? Math.round((annualTierTotals[idx] / annualGrandTotal) * 1000) / 10
        : 0,
  }));

  return {
    year,
    months,
    annualTierTotals,
    annualGrandTotal,
    tierSummary,
    recordedMonthCount,
  };
}

export function buildAnnualTierParametricTable(
  report: AnnualTierBreakdownReport
): ParametricTableData {
  const columns: ParametricTableData['columns'] = [
    { key: 'monthLabel', header: 'ماه', format: 'text', summable: false },
    ...SALARY_TIER_LABELS.map((label, idx) => ({
      key: `tier_${idx}`,
      header: label,
      format: 'money' as const,
      summable: true,
    })),
    { key: 'grandTotal', header: 'جمع ماه', format: 'money', summable: true },
  ];

  const rows = report.months.map((m) => ({
    employeeId: m.periodKey,
    cells: [m.monthLabel, ...m.tierTotals, m.grandTotal],
  }));

  const totalsRow: Array<string | number> = [
    `جمع کل سال ${report.year}`,
    ...report.annualTierTotals,
    report.annualGrandTotal,
  ];

  return {
    columns,
    rows,
    totalsRow,
  };
}
