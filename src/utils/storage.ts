import { INITIAL_SEED_STATE } from '../data/seedData';
import type { AppState } from '../types/payroll';
import {
  DEFAULT_ADMIN_PERMISSIONS,
  DEFAULT_VIEWER_PERMISSIONS,
  detectBankFromSheba,
  getEffectiveSalaryMode,
  normalizeAllowanceFlags,
  normalizeCustomTierAmounts,
  normalizeManualSalaries,
} from './payroll';

const STORAGE_KEY = 'persian_payroll_ledger_v1';
const SEED_3MALE_MIGRATION_FLAG = 'persian_payroll_seed_3male_v1';

const VALID_EMPLOYMENT_TYPES = new Set([
  'employed',
  'retired',
  'article-28',
  'article-38',
  'sherkati-soroush',
  'custom',
]);

export function migrateParsedAppState(parsed: Partial<AppState>): AppState | null {
  if (
    !parsed ||
    !Array.isArray(parsed.employees) ||
    !Array.isArray(parsed.timesheets) ||
    !Array.isArray(parsed.loans) ||
    !parsed.settings ||
    !parsed.selectedPeriod
  ) {
    return null;
  }

  const migratedEmployees = parsed.employees.map((emp) => {
    const customTierAmounts = normalizeCustomTierAmounts(emp.customTierAmounts);
    return {
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
      customContractTitle: emp.customContractTitle ?? '',
      salaryCalculationMode: getEffectiveSalaryMode(emp),
      allowanceFlags: normalizeAllowanceFlags(emp.allowanceFlags),
      seniorityAllowance: Math.max(0, Math.round(Number(emp.seniorityAllowance) || 0)),
      insuranceBaseCap: Math.max(0, Math.round(Number(emp.insuranceBaseCap) || 0)),
      customTierAmounts,
      manualSalaries: normalizeManualSalaries(
        emp.manualSalaries,
        emp.baseMonthlySalary,
        customTierAmounts
      ),
    };
  });

  const hasUsers = Array.isArray(parsed.users) && parsed.users.length > 0;
  const rawUsers = hasUsers ? parsed.users! : INITIAL_SEED_STATE.users;
  const migratedUsers = rawUsers.map((u) => ({
    ...u,
    permissions:
      u.role === 'admin'
        ? { ...DEFAULT_ADMIN_PERMISSIONS }
        : { ...DEFAULT_VIEWER_PERMISSIONS, ...(u.permissions ?? {}) },
  }));

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
      dayShiftMultiplier:
        parsed.settings.dayShiftMultiplier ??
        INITIAL_SEED_STATE.settings.dayShiftMultiplier,
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
}

export function isLegacySeedDataset(state: Pick<AppState, 'employees'>): boolean {
  const legacyNames = new Set(['مریم کاظمی', 'زهرا ناصری', 'سارا احمدی']);
  return state.employees.some(
    (emp) =>
      emp.id === 'emp-4' ||
      emp.id === 'emp-7' ||
      legacyNames.has(emp.fullName.trim())
  );
}

export function loadAppState(): AppState {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      window.localStorage.setItem(SEED_3MALE_MIGRATION_FLAG, '1');
      return INITIAL_SEED_STATE;
    }
    const parsed = JSON.parse(raw) as Partial<AppState>;
    const migrated = migrateParsedAppState(parsed);
    if (!migrated) {
      window.localStorage.setItem(SEED_3MALE_MIGRATION_FLAG, '1');
      return INITIAL_SEED_STATE;
    }

    const alreadyMigrated =
      window.localStorage.getItem(SEED_3MALE_MIGRATION_FLAG) === '1';
    if (!alreadyMigrated) {
      window.localStorage.setItem(SEED_3MALE_MIGRATION_FLAG, '1');
      if (isLegacySeedDataset(migrated)) {
        const refreshed: AppState = {
          ...INITIAL_SEED_STATE,
          settings: migrated.settings,
          users: migrated.users,
          currentUserId: migrated.currentUserId,
          parametricTemplates: migrated.parametricTemplates,
        };
        saveAppState(refreshed);
        return refreshed;
      }
    }

    return migrated;
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

export function exportAppStateToJson(state: AppState): string {
  return JSON.stringify(state, null, 2);
}

export function parseAppStateFromJson(raw: string): {
  state: AppState | null;
  error?: string;
} {
  try {
    const parsed = JSON.parse(raw) as Partial<AppState>;
    const migrated = migrateParsedAppState(parsed);
    if (!migrated) {
      return { state: null, error: 'ساختار فایل بکاپ معتبر نیست.' };
    }
    return { state: migrated };
  } catch {
    return { state: null, error: 'خطا در خواندن فایل JSON بکاپ.' };
  }
}

export function resetAppStateToSeed(): AppState {
  saveAppState(INITIAL_SEED_STATE);
  return INITIAL_SEED_STATE;
}
