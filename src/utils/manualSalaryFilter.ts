import type {
  Employee,
  EmploymentType,
  ManualSalaryMode,
} from '../types/payroll';
import { ALL_EMPLOYMENT_TYPES } from './payroll';

export interface MultiSelectManualSalaryFilters {
  selectedDepartments: ReadonlyArray<string>;
  selectedContracts: ReadonlyArray<EmploymentType>;
  selectedModes: ReadonlyArray<ManualSalaryMode>;
}

export const ALL_MANUAL_SALARY_MODES: ReadonlyArray<ManualSalaryMode> = [
  'override',
  'additional',
];

export function extractEmployeeDepartments(
  employees: ReadonlyArray<Pick<Employee, 'department'>>
): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const emp of employees) {
    const dept = emp.department.trim() || 'نامشخص';
    if (!seen.has(dept)) {
      seen.add(dept);
      result.push(dept);
    }
  }
  return result;
}

export function createDefaultMultiSelectFilters(
  employees: ReadonlyArray<Pick<Employee, 'department'>>
): MultiSelectManualSalaryFilters {
  return {
    selectedDepartments: extractEmployeeDepartments(employees),
    selectedContracts: [...ALL_EMPLOYMENT_TYPES],
    selectedModes: [...ALL_MANUAL_SALARY_MODES],
  };
}

export function toggleMultiSelectItem<T extends string>(
  current: ReadonlyArray<T>,
  item: T
): T[] {
  if (current.includes(item)) {
    return current.filter((v) => v !== item);
  }
  return [...current, item];
}

export function toggleMultiSelectAll<T extends string>(
  current: ReadonlyArray<T>,
  allItems: ReadonlyArray<T>
): T[] {
  const allSelected =
    allItems.length > 0 && allItems.every((item) => current.includes(item));
  return allSelected ? [] : [...allItems];
}

/**
 * Evaluates whether a manual salary row/employee should be displayed & exported.
 * Strict rule: if any filter category has 0 selected options (or the row's value
 * is not checked), the row is NOT shown and NOT exported.
 */
export function matchesMultiSelectManualSalaryFilters(
  employee: Pick<Employee, 'department' | 'employmentType'> | undefined,
  mode: ManualSalaryMode,
  filters: MultiSelectManualSalaryFilters
): boolean {
  if (
    filters.selectedDepartments.length === 0 ||
    filters.selectedContracts.length === 0 ||
    filters.selectedModes.length === 0
  ) {
    return false;
  }

  if (!filters.selectedModes.includes(mode)) {
    return false;
  }

  if (!employee) {
    return false;
  }

  const dept = employee.department.trim() || 'نامشخص';
  if (!filters.selectedDepartments.includes(dept)) {
    return false;
  }

  if (!filters.selectedContracts.includes(employee.employmentType)) {
    return false;
  }

  return true;
}
