import type { Employee } from '../types/payroll';
import { EMPLOYMENT_UNIT_OPTIONS, SALARY_TIER_LABELS } from './payroll';

export const CUSTOM_UNIT_SENTINEL = '__custom__';

export interface WorkLocationSelectGroups {
  tierOptions: ReadonlyArray<string>;
  otherOptions: ReadonlyArray<string>;
  allKnownOptions: ReadonlyArray<string>;
  isCustomValue: boolean;
}

/**
 * Builds structured select groups for Manual Salary work location / organizational unit
 * pickers so all 8 organizational rows from «پرداخت حقوق ۸ ردیف» (تولید سیما، تامین پخش صدا،
 * تامین و پخش سیما، تولید سیما جیم، متمرکز پاداش، تولید سیما دال، خبر، فضای مجازی) are always
 * immediately selectable alongside general organizational units and the employee's own unit.
 */
export function buildWorkLocationSelectGroups(
  employee?: Pick<Employee, 'department' | 'workLocation'> | null,
  currentValue?: string
): WorkLocationSelectGroups {
  const tierOptions: ReadonlyArray<string> = [...SALARY_TIER_LABELS];
  const tierSet = new Set<string>(tierOptions);

  const otherSet = new Set<string>();
  for (const unit of EMPLOYMENT_UNIT_OPTIONS) {
    if (!tierSet.has(unit)) {
      otherSet.add(unit);
    }
  }

  const empDept = employee?.department?.trim();
  if (empDept && !tierSet.has(empDept)) {
    otherSet.add(empDept);
  }

  const empLoc = employee?.workLocation?.trim();
  if (empLoc && !tierSet.has(empLoc)) {
    otherSet.add(empLoc);
  }

  const otherOptions = Array.from(otherSet);
  const allKnownOptions = [...tierOptions, ...otherOptions];
  const normalizedCurrent = currentValue?.trim() ?? '';
  const isCustomValue =
    normalizedCurrent !== '' && !allKnownOptions.includes(normalizedCurrent);

  return {
    tierOptions,
    otherOptions,
    allKnownOptions,
    isCustomValue,
  };
}
