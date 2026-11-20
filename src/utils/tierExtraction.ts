import type {
  Employee,
  ManualSalaryPayment,
} from '../types/payroll';
import {
  SALARY_TIER_LABELS,
  type SalaryTierTuple,
  normalizeCustomTierAmounts,
  resolveManualSalaryUnitType,
  sumCustomTierAmounts,
  sumManualSalaries,
} from './payroll';
import { normalizePersianSearchText } from './employeeFilter';

export interface TierExtractionResult {
  updatedEmployees: Employee[];
  extractedEmployeeCount: number;
  paymentRecordCount: number;
  tierTotals: SalaryTierTuple;
  customTierTotals: Record<string, number>;
}

/**
 * Matches a location/unit label strictly against the 8 standard organizational tiers.
 * Returns null when the unit/معاونت is a separate/custom unit (e.g. "معاونت مالی",
 * "فناوری اطلاعات", "حوزه ریاست") so it can be placed in its own dedicated column.
 */
export function resolveStrictTierIndexFromLocation(
  locationText: string,
  fallbackDescription = ''
): number | null {
  const matchText = (raw: string): number | null => {
    const norm = normalizePersianSearchText(raw);
    if (!norm) return null;

    if (
      norm.includes('تولید سیما جیم') ||
      norm.includes('سیما جیم') ||
      /(^|\s)جیم(\s|$)/.test(norm)
    ) {
      return 3;
    }
    if (
      norm.includes('تولید سیما دال') ||
      norm.includes('سیما دال') ||
      /(^|\s)دال(\s|$)/.test(norm)
    ) {
      return 5;
    }
    if (
      norm.includes('تامین و پخش سیما') ||
      norm.includes('تامین پخش سیما') ||
      (norm.includes('تامین') && norm.includes('سیما'))
    ) {
      return 2;
    }
    if (
      norm.includes('تامین پخش صدا') ||
      norm.includes('تامین و پخش صدا') ||
      (norm.includes('تامین') && norm.includes('صدا')) ||
      /(^|\s)صدا(\s|$)/.test(norm) ||
      norm.includes('رادیو')
    ) {
      return 1;
    }
    if (
      norm.includes('متمرکز پاداش') ||
      norm.includes('پاداش') ||
      norm.includes('متمرکز')
    ) {
      return 4;
    }
    if (norm.includes('خبر') || norm.includes('اخبار')) {
      return 6;
    }
    if (norm.includes('فضای مجازی') || norm.includes('مجازی')) {
      return 7;
    }
    if (norm.includes('تولید سیما') || /(^|\s)سیما(\s|$)/.test(norm)) {
      return 0;
    }

    return null;
  };

  const fromLocation = matchText(locationText);
  if (fromLocation !== null) return fromLocation;

  const fromDesc = matchText(fallbackDescription);
  if (fromDesc !== null) return fromDesc;

  return null;
}

/**
 * Maps a manual salary unitType / workLocation (or fallback description)
 * to its matching index [0..7] in SALARY_TIER_LABELS (falling back to 0 when unrecognized).
 */
export function resolveTierIndexFromLocation(
  locationText: string,
  fallbackDescription = ''
): number {
  return resolveStrictTierIndexFromLocation(locationText, fallbackDescription) ?? 0;
}

/**
 * Collects all distinct custom unit/معاونت labels that do not belong to the 8 standard tiers,
 * from both employees' saved customTierAmounts and period manualPayments.
 */
export function collectCustomTierLabels(
  employees: ReadonlyArray<Employee>,
  manualPayments: ReadonlyArray<ManualSalaryPayment> = [],
  periodKey?: string
): string[] {
  const seen = new Set<string>();
  const labels: string[] = [];

  const addLabel = (raw?: string) => {
    const clean = raw?.replace(/\s+/g, ' ').trim();
    if (!clean) return;
    if (resolveStrictTierIndexFromLocation(clean) !== null) return;
    if (!seen.has(clean)) {
      seen.add(clean);
      labels.push(clean);
    }
  };

  for (const emp of employees) {
    if (emp.customTierAmounts) {
      for (const [label, amount] of Object.entries(emp.customTierAmounts)) {
        if ((Number(amount) || 0) > 0) {
          addLabel(label);
        }
      }
    }
  }

  for (const p of manualPayments) {
    if (periodKey && p.periodKey !== periodKey) continue;
    if (!Number.isFinite(p.amount) || p.amount <= 0) continue;
    const candidate = p.unitType?.trim() || p.workLocation?.trim();
    if (candidate && resolveStrictTierIndexFromLocation(candidate, p.description ?? '') === null) {
      addLabel(candidate);
    }
  }

  return labels;
}

/**
 * Extracts manual salary payments for the given periodKey and distributes each
 * employee's payment amounts:
 * - Matching units/معاونت merge (sum) into their corresponding column among the 8 tiers.
 * - Distinct/separate units/معاونت (not matching the 8 tiers) are stored in `customTierAmounts`
 *   so they render in their own dedicated column rather than folding into تولید سیما.
 */
export function extractTiersFromManualPayments(
  employees: ReadonlyArray<Employee>,
  manualPayments: ReadonlyArray<ManualSalaryPayment>,
  periodKey: string
): TierExtractionResult {
  const periodPayments = manualPayments.filter(
    (p) =>
      p.periodKey === periodKey &&
      Number.isFinite(p.amount) &&
      p.amount > 0
  );

  const employeeMap = new Map<string, Employee>();
  for (const emp of employees) {
    employeeMap.set(emp.id, emp);
  }

  const aggregatedByEmployee = new Map<string, SalaryTierTuple>();
  const aggregatedCustomByEmployee = new Map<string, Record<string, number>>();
  let paymentRecordCount = 0;

  for (const payment of periodPayments) {
    const emp = employeeMap.get(payment.employeeId);
    if (!emp) continue;

    const safeAmount = Math.max(0, Math.round(payment.amount));
    if (safeAmount <= 0) continue;

    const locationCandidate =
      payment.unitType?.trim() ||
      payment.workLocation?.trim() ||
      resolveManualSalaryUnitType(emp);
    const strictTierIdx = resolveStrictTierIndexFromLocation(
      locationCandidate,
      payment.description ?? ''
    );

    const currentTiers =
      aggregatedByEmployee.get(emp.id) ??
      ([0, 0, 0, 0, 0, 0, 0, 0] as SalaryTierTuple);
    const currentCustom = aggregatedCustomByEmployee.get(emp.id) ?? {};

    if (strictTierIdx !== null) {
      currentTiers[strictTierIdx] += safeAmount;
    } else {
      const unitLabel = locationCandidate.replace(/\s+/g, ' ').trim() || 'سایر واحدها';
      currentCustom[unitLabel] = (currentCustom[unitLabel] ?? 0) + safeAmount;
    }

    aggregatedByEmployee.set(emp.id, currentTiers);
    aggregatedCustomByEmployee.set(emp.id, currentCustom);
    paymentRecordCount += 1;
  }

  const tierTotals: SalaryTierTuple = [0, 0, 0, 0, 0, 0, 0, 0];
  const customTierTotals: Record<string, number> = {};

  const updatedEmployees = employees.map((emp) => {
    const extractedTiers = aggregatedByEmployee.get(emp.id);
    const extractedCustomRaw = aggregatedCustomByEmployee.get(emp.id);
    if (!extractedTiers && !extractedCustomRaw) return emp;

    const finalTiers: SalaryTierTuple =
      extractedTiers ?? ([0, 0, 0, 0, 0, 0, 0, 0] as SalaryTierTuple);
    const finalCustom = normalizeCustomTierAmounts(extractedCustomRaw);
    const extractedSum =
      sumManualSalaries(finalTiers) + sumCustomTierAmounts(finalCustom);
    if (extractedSum <= 0) return emp;

    for (let i = 0; i < SALARY_TIER_LABELS.length; i += 1) {
      tierTotals[i] += finalTiers[i];
    }
    for (const [label, amt] of Object.entries(finalCustom)) {
      customTierTotals[label] = (customTierTotals[label] ?? 0) + amt;
    }

    return {
      ...emp,
      baseMonthlySalary: extractedSum,
      manualSalaries: finalTiers,
      customTierAmounts: finalCustom,
    };
  });

  return {
    updatedEmployees,
    extractedEmployeeCount: aggregatedByEmployee.size,
    paymentRecordCount,
    tierTotals,
    customTierTotals,
  };
}

/**
 * Keeps the 8-tier + custom-unit salary matrix in sync with manualPayments as the live database:
 * - Employees with positive payments in periodKey get their tiers, customTierAmounts & baseMonthlySalary computed from those payments.
 * - Any employee in clearedEmployeeIds whose payments in periodKey were all deleted/zeroed gets their tiers & customTierAmounts reset to 0.
 */
export function syncEmployeesTiersFromManualPayments(
  employees: ReadonlyArray<Employee>,
  manualPayments: ReadonlyArray<ManualSalaryPayment>,
  periodKey: string,
  clearedEmployeeIds: ReadonlyArray<string> = []
): Employee[] {
  const { updatedEmployees } = extractTiersFromManualPayments(
    employees,
    manualPayments,
    periodKey
  );

  if (clearedEmployeeIds.length === 0) {
    return updatedEmployees;
  }

  const clearedSet = new Set(clearedEmployeeIds);
  const activePaymentEmployees = new Set(
    manualPayments
      .filter(
        (p) =>
          p.periodKey === periodKey &&
          Number.isFinite(p.amount) &&
          p.amount > 0
      )
      .map((p) => p.employeeId)
  );

  return updatedEmployees.map((emp) => {
    if (!clearedSet.has(emp.id) || activePaymentEmployees.has(emp.id)) {
      return emp;
    }
    return {
      ...emp,
      baseMonthlySalary: 0,
      manualSalaries: [0, 0, 0, 0, 0, 0, 0, 0],
      customTierAmounts: {},
    };
  });
}
