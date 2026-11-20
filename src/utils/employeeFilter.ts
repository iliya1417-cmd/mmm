import type { Employee, EmploymentType } from '../types/payroll';
import { toEnglishDigits } from './payroll';

export interface EmployeeFilterOptions {
  searchQuery?: string;
  departmentFilter?: string;
  contractFilter?: string;
  selectedDepartments?: ReadonlyArray<string>;
  selectedContracts?: ReadonlyArray<EmploymentType>;
  statusFilter?: 'all' | 'active' | 'inactive';
}

/**
 * Normalizes Persian/Arabic text for resilient matching:
 * - Converts Persian & Arabic digits to ASCII 0-9
 * - Unifies Arabic Yeh/Kaf/Ta-Marbuta/Alef forms to standard Persian letters
 * - Strips diacritics & tatweel
 * - Replaces ZWNJ and common separators with spaces and collapses whitespace
 */
export function normalizePersianSearchText(value: string): string {
  if (!value) return '';
  return toEnglishDigits(value)
    .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
    .replace(/[يى]/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/ة/g, 'ه')
    .replace(/[أإآ]/g, 'ا')
    .replace(/[\u200c\u200f\-_/،,]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * Checks whether an employee matches a text filter query by
 * first name, last name (within fullName), or personnel code.
 */
export function matchesEmployeeNameOrCode(
  emp: Pick<Employee, 'fullName' | 'personnelCode'>,
  rawQuery: string
): boolean {
  const normalizedQuery = normalizePersianSearchText(rawQuery);
  if (!normalizedQuery) return true;

  const tokens = normalizedQuery.split(' ').filter(Boolean);
  if (tokens.length === 0) return true;

  const normalizedName = normalizePersianSearchText(emp.fullName);
  const compactName = normalizedName.replace(/\s+/g, '');
  const normalizedCode = normalizePersianSearchText(emp.personnelCode);
  const compactCode = normalizedCode.replace(/\s+/g, '');

  return tokens.every(
    (token) =>
      normalizedName.includes(token) ||
      compactName.includes(token) ||
      normalizedCode.includes(token) ||
      compactCode.includes(token)
  );
}

export function filterEmployees(
  employees: ReadonlyArray<Employee>,
  options: EmployeeFilterOptions
): Employee[] {
  const {
    searchQuery = '',
    departmentFilter = 'all',
    contractFilter = 'all',
    selectedDepartments,
    selectedContracts,
    statusFilter = 'all',
  } = options;

  return employees.filter((emp) => {
    if (selectedDepartments !== undefined) {
      const empDept = emp.department.trim() || 'نامشخص';
      if (
        selectedDepartments.length === 0 ||
        !selectedDepartments.includes(empDept)
      ) {
        return false;
      }
    } else if (
      departmentFilter !== 'all' &&
      emp.department !== departmentFilter
    ) {
      return false;
    }

    if (selectedContracts !== undefined) {
      if (
        selectedContracts.length === 0 ||
        !selectedContracts.includes(emp.employmentType)
      ) {
        return false;
      }
    } else if (
      contractFilter !== 'all' &&
      emp.employmentType !== contractFilter
    ) {
      return false;
    }

    if (statusFilter === 'active' && !emp.isActive) return false;
    if (statusFilter === 'inactive' && emp.isActive) return false;

    return matchesEmployeeNameOrCode(emp, searchQuery);
  });
}
