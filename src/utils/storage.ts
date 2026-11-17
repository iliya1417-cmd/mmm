import { INITIAL_SEED_STATE } from '../data/seedData';
import type { AppState } from '../types/payroll';
import { detectBankFromSheba, normalizeManualSalaries } from './payroll';

const STORAGE_KEY = 'persian_payroll_ledger_v1';

const VALID_EMPLOYMENT_TYPES = new Set([
  'employed',
  'retired',
  'article-28',
  'article-38',
  'sherkati-soroush',
]);

export function loadAppState(): AppState {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return INITIAL_SEED_STATE;
    const parsed = JSON.parse(raw) as Partial<AppState>;

    if (
      !Array.isArray(parsed.employees) ||
      !Array.isArray(parsed.timesheets) ||
      !Array.isArray(parsed.loans) ||
      !parsed.settings ||
      !parsed.selectedPeriod
    ) {
      return INITIAL_SEED_STATE;
    }

    const migratedEmployees = parsed.employees.map((emp) => ({
      ...emp,
      workLocation: emp.workLocation?.trim() || 'ستاد مرکزی',
      mobileNumber: emp.mobileNumber ?? '',
      workPhone: emp.workPhone ?? '',
      bankName:
        emp.bankName?.trim() ||
        detectBankFromSheba(emp.bankAccount || '') ||
        'بانک ملی ایران',
      employmentType: VALID_EMPLOYMENT_TYPES.has(emp.employmentType)
        ? emp.employmentType
        : ('employed' as const),
      manualSalaries: normalizeManualSalaries(
        emp.manualSalaries,
        emp.baseMonthlySalary
      ),
    }));

    const hasUsers = Array.isArray(parsed.users) && parsed.users.length > 0;
    const migratedUsers = hasUsers ? parsed.users! : INITIAL_SEED_STATE.users;
    let migratedCurrentUserId: string | null;
    if (parsed.currentUserId === undefined) {
      migratedCurrentUserId = migratedUsers[0]?.id ?? 'user-admin';
    } else if (parsed.currentUserId === null) {
      migratedCurrentUserId = null;
    } else {
      const exists = migratedUsers.some(
        (u) => u.id === parsed.currentUserId && u.isActive
      );
      migratedCurrentUserId = exists ? parsed.currentUserId : null;
    }

    return {
      employees: migratedEmployees,
      timesheets: parsed.timesheets,
      loans: parsed.loans,
      manualPayments: Array.isArray(parsed.manualPayments)
        ? parsed.manualPayments
        : [],
      settings: {
        ...INITIAL_SEED_STATE.settings,
        ...parsed.settings,
        taxBrackets:
          Array.isArray(parsed.settings.taxBrackets) &&
          parsed.settings.taxBrackets.length > 0
            ? parsed.settings.taxBrackets
            : INITIAL_SEED_STATE.settings.taxBrackets,
        specialContractAllowances: {
          ...INITIAL_SEED_STATE.settings.specialContractAllowances!,
          ...(parsed.settings.specialContractAllowances ?? {}),
        },
      },
      selectedPeriod: parsed.selectedPeriod,
      users: migratedUsers,
      currentUserId: migratedCurrentUserId,
      parametricTemplates: Array.isArray(parsed.parametricTemplates)
        ? parsed.parametricTemplates
        : [],
    };
  } catch {
    return INITIAL_SEED_STATE;
  }
}

export function saveAppState(state: AppState): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage quota errors cleanly
  }
}

export function resetAppStateToSeed(): AppState {
  saveAppState(INITIAL_SEED_STATE);
  return INITIAL_SEED_STATE;
}
