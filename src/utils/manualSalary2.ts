import type {
  Employee,
  ManualSalaryMode,
  ManualSalaryPayment,
} from '../types/payroll';
import {
  parseNumericInput,
  resolveManualSalaryUnitType,
  toEnglishDigits,
  toPersianDigits,
} from './payroll';

export interface ManualSalary2DraftRow {
  employeeId: string;
  amountInput: string;
  mode: ManualSalaryMode;
  unitType: string;
  description: string;
  hazardPay?: number;
  nonCalloutPay?: number;
  terminationDate?: string;
  secondSalaryBonus?: number;
  deduction1?: number;
  commuteAllowance?: number;
}

export interface ManualSalary2RowUpdate {
  employeeId: string;
  amount: number;
  mode: ManualSalaryMode;
  unitType?: string;
  description: string;
  hazardPay?: number;
  nonCalloutPay?: number;
  terminationDate?: string;
  secondSalaryBonus?: number;
  deduction1?: number;
  commuteAllowance?: number;
}

export function getDefaultManualSalary2PaymentDate(periodKey: string): string {
  const [y, m] = periodKey.split('-');
  return `${y}/${m}/25`;
}

export function buildManualSalary2Drafts(
  employees: ReadonlyArray<Employee>,
  manualPayments: ReadonlyArray<ManualSalaryPayment>,
  periodKey: string,
  defaultMode: ManualSalaryMode = 'override'
): Record<string, ManualSalary2DraftRow> {
  const drafts: Record<string, ManualSalary2DraftRow> = {};

  for (const emp of employees) {
    const empPeriodPayments = manualPayments.filter(
      (p) =>
        p.employeeId === emp.id &&
        p.periodKey === periodKey &&
        Number.isFinite(p.amount) &&
        p.amount > 0
    );

    const totalAmount = empPeriodPayments.reduce(
      (sum, p) => sum + Math.round(p.amount),
      0
    );

    const resolvedMode: ManualSalaryMode =
      empPeriodPayments.length > 0
        ? empPeriodPayments.some((p) => p.mode === 'override')
          ? 'override'
          : empPeriodPayments[0].mode
        : defaultMode;

    const latestUnit = empPeriodPayments
      .map((p) => (p.unitType ?? p.workLocation ?? '').trim())
      .find((u) => u.length > 0);

    const descriptions = Array.from(
      new Set(
        empPeriodPayments
          .map((p) => p.description.trim())
          .filter((d) => d.length > 0)
      )
    );

    const sumField = (
      pick: (p: ManualSalaryPayment) => number | undefined
    ): number =>
      empPeriodPayments.reduce(
        (s, p) => s + Math.max(0, Math.round(Number(pick(p)) || 0)),
        0
      );

    const terminationDate = empPeriodPayments
      .map((p) => p.terminationDate?.trim() ?? '')
      .find((d) => d.length > 0);

    drafts[emp.id] = {
      employeeId: emp.id,
      amountInput: totalAmount > 0 ? String(totalAmount) : '',
      mode: resolvedMode,
      unitType: resolveManualSalaryUnitType(emp, latestUnit),
      description: descriptions.join(' / '),
      hazardPay: sumField((p) => p.hazardPay),
      nonCalloutPay: sumField((p) => p.nonCalloutPay),
      terminationDate: terminationDate ?? '',
      secondSalaryBonus: sumField((p) => p.secondSalaryBonus),
      deduction1: sumField((p) => p.deduction1),
      commuteAllowance: sumField((p) => p.commuteAllowance),
    };
  }

  return drafts;
}

export function hasManualSalary2DraftChanged(
  draft: ManualSalary2DraftRow | undefined,
  saved: ManualSalary2DraftRow | undefined
): boolean {
  if (!draft || !saved) return false;
  const draftAmount = parseNumericInput(draft.amountInput);
  const savedAmount = parseNumericInput(saved.amountInput);
  if (draftAmount !== savedAmount) return true;
  if (draftAmount > 0 && draft.mode !== saved.mode) return true;
  if (draftAmount > 0 && draft.unitType.trim() !== saved.unitType.trim()) {
    return true;
  }
  if (draftAmount > 0 && draft.description.trim() !== saved.description.trim()) {
    return true;
  }
  return false;
}

export function upsertManualPaymentsForPeriod(
  existingPayments: ReadonlyArray<ManualSalaryPayment>,
  periodKey: string,
  updates: ReadonlyArray<ManualSalary2RowUpdate>,
  paymentDate = getDefaultManualSalary2PaymentDate(periodKey)
): ManualSalaryPayment[] {
  if (updates.length === 0) {
    return [...existingPayments];
  }

  const updateMap = new Map<string, ManualSalary2RowUpdate>();
  for (const upd of updates) {
    updateMap.set(upd.employeeId, upd);
  }

  const preserved = existingPayments.filter(
    (p) => !(p.periodKey === periodKey && updateMap.has(p.employeeId))
  );

  const stamp = Date.now();
  const createdAt = toPersianDigits(toEnglishDigits(paymentDate));
  const cleanPayDate = toEnglishDigits(paymentDate.trim()) ||
    getDefaultManualSalary2PaymentDate(periodKey);

  const additions: ManualSalaryPayment[] = [];
  let idx = 0;
  for (const upd of updates) {
    const cleanAmount = Math.max(0, Math.round(upd.amount));
    if (cleanAmount <= 0) continue;
    additions.push({
      id: `mpay2-${stamp}-${idx}`,
      employeeId: upd.employeeId,
      periodKey,
      amount: cleanAmount,
      mode: upd.mode,
      paymentDate: cleanPayDate,
      description:
        upd.description.trim() ||
        (upd.mode === 'override'
          ? 'حقوق دستی توافقی (جدول ۲)'
          : 'پرداخت حقوق دستی (جدول ۲)'),
      referenceCode: '',
      unitType: upd.unitType?.trim() || undefined,
      workLocation: upd.unitType?.trim() || undefined,
      hazardPay: upd.hazardPay ? Math.max(0, Math.round(upd.hazardPay)) : undefined,
      nonCalloutPay: upd.nonCalloutPay
        ? Math.max(0, Math.round(upd.nonCalloutPay))
        : undefined,
      terminationDate: upd.terminationDate?.trim() || undefined,
      secondSalaryBonus: upd.secondSalaryBonus
        ? Math.max(0, Math.round(upd.secondSalaryBonus))
        : undefined,
      deduction1: upd.deduction1 ? Math.max(0, Math.round(upd.deduction1)) : undefined,
      commuteAllowance: upd.commuteAllowance
        ? Math.max(0, Math.round(upd.commuteAllowance))
        : undefined,
      createdAt,
    });
    idx += 1;
  }

  return [...preserved, ...additions];
}
