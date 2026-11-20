import type {
  ComputedPayslip,
  DepartmentSummary,
  Employee,
  EmployeeAllowanceFlags,
  EmploymentType,
  Loan,
  ManualSalaryMode,
  ManualSalaryPayment,
  MonthlyTimesheet,
  PayrollReport,
  PayrollSettings,
  Period,
  SalaryCalculationMode,
  SystemUser,
  TaxBracket,
  UserPermissions,
  UserRole,
} from '../types/payroll';

export const EMPLOYMENT_TYPE_LABELS: Record<EmploymentType, string> = {
  employed: 'رسمی (شاغل)',
  retired: 'بازنشسته',
  'article-28': 'ماده ۲۸',
  'article-38': 'ماده ۳۸',
  'sherkati-soroush': 'شرکتی سروش',
  custom: 'سایر (دستی)',
};

export const SALARY_TIER_LABELS = [
  'تولید سیما',
  'تامین پخش صدا',
  'تامین و پخش سیما',
  'تولید سیما جیم',
  'متمرکز پاداش',
  'تولید سیما دال',
  'خبر',
  'فضای مجازی',
] as const;

export type SalaryTierTuple = [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
];

export const EMPLOYMENT_UNIT_OPTIONS: ReadonlyArray<string> = [
  ...SALARY_TIER_LABELS,
  'سیما',
  'صدا',
  'معاونت',
  'مالی و اداری',
  'فنی و مهندسی',
];

export const ALL_EMPLOYMENT_TYPES: ReadonlyArray<EmploymentType> = [
  'employed',
  'retired',
  'article-28',
  'article-38',
  'sherkati-soroush',
  'custom',
];

export function isOfficialOrRetiredContract(type: EmploymentType | string): boolean {
  return type === 'employed' || type === 'retired';
}

export function splitPersianFullName(fullName: string): {
  firstName: string;
  lastName: string;
} {
  const cleaned = fullName.replace(/\s+/g, ' ').trim();
  if (!cleaned) return { firstName: '', lastName: '' };
  const parts = cleaned.split(' ');
  if (parts.length === 1) {
    return { firstName: parts[0], lastName: parts[0] };
  }
  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(' '),
  };
}

export function resolveManualSalaryUnitType(
  employee: Pick<Employee, 'department'>,
  paymentUnitType?: string
): string {
  const custom = paymentUnitType?.trim();
  if (custom) return custom;
  const dept = employee.department?.trim();
  if (dept) return dept;
  return 'سیما';
}

export const SALARY_CALCULATION_MODE_LABELS: Record<
  SalaryCalculationMode,
  string
> = {
  manual: 'ورود دستی حقوق (توافقی)',
  fixed: 'حقوق ثابت ماهانه',
  'daily-divided': 'تقسیم بر حقوق پایه و کارکرد روزانه',
};

export const SALARY_CALCULATION_MODE_SHORT_LABELS: Record<
  SalaryCalculationMode,
  string
> = {
  manual: 'دستی (توافقی)',
  fixed: 'حقوق ثابت',
  'daily-divided': 'تقسیم پایه / روزانه',
};

export const DEFAULT_ALLOWANCE_FLAGS: EmployeeAllowanceFlags = {
  housing: true,
  food: true,
  marital: true,
  child: true,
  otherFixed: true,
};

export function normalizeAllowanceFlags(
  flags?: Partial<EmployeeAllowanceFlags>
): EmployeeAllowanceFlags {
  return {
    housing: flags?.housing ?? true,
    food: flags?.food ?? true,
    marital: flags?.marital ?? true,
    child: flags?.child ?? true,
    otherFixed: flags?.otherFixed ?? true,
  };
}

export function getEffectiveSalaryMode(emp: Pick<Employee, 'salaryCalculationMode'>): SalaryCalculationMode {
  if (
    emp.salaryCalculationMode === 'manual' ||
    emp.salaryCalculationMode === 'fixed' ||
    emp.salaryCalculationMode === 'daily-divided'
  ) {
    return emp.salaryCalculationMode;
  }
  return 'daily-divided';
}

export const IRANIAN_BANKS: ReadonlyArray<string> = [
  'بانک ملی ایران',
  'بانک ملت',
  'بانک صادرات',
  'بانک تجارت',
  'بانک سپه',
  'بانک رفاه کارگران',
  'بانک کشاورزی',
  'بانک مسکن',
  'بانک سامان',
  'بانک پاسارگاد',
  'بانک پارسیان',
  'پست بانک ایران',
  'بانک آینده',
  'صندوق جام جم',
  'سایر بانک‌ها',
];

const SHEBA_BANK_CODES: Record<string, string> = {
  '011': 'بانک صنعت و معدن',
  '012': 'بانک ملت',
  '013': 'بانک رفاه کارگران',
  '014': 'بانک مسکن',
  '015': 'بانک سپه',
  '016': 'بانک کشاورزی',
  '017': 'بانک ملی ایران',
  '018': 'بانک تجارت',
  '019': 'بانک صادرات',
  '020': 'بانک توسعه صادرات',
  '021': 'پست بانک ایران',
  '053': 'بانک کارآفرین',
  '054': 'بانک پارسیان',
  '055': 'بانک اقتصاد نوین',
  '056': 'بانک سامان',
  '057': 'بانک پاسارگاد',
  '058': 'بانک سرمایه',
  '059': 'بانک سینا',
  '061': 'بانک شهر',
  '062': 'بانک آینده',
  '064': 'بانک گردشگری',
  '066': 'بانک دی',
  '069': 'بانک ایران زمین',
  '070': 'بانک رسالت',
  '078': 'بانک خاورمیانه',
};

export function detectBankFromSheba(accountOrSheba: string): string | null {
  const normalized = toEnglishDigits(accountOrSheba).replace(/\s+/g, '').toUpperCase();
  const match = normalized.match(/^IR\d{2}(\d{3})/);
  if (!match) return null;
  return SHEBA_BANK_CODES[match[1]] ?? null;
}

export function getEmploymentTypeLabel(
  type: EmploymentType | string,
  customTitle?: string
): string {
  if (type === 'custom' && customTitle?.trim()) {
    return customTitle.trim();
  }
  return EMPLOYMENT_TYPE_LABELS[type as EmploymentType] ?? 'شاغل';
}

export const JALALI_MONTHS: ReadonlyArray<{ value: number; label: string }> = [
  { value: 1, label: 'فروردین' },
  { value: 2, label: 'اردیبهشت' },
  { value: 3, label: 'خرداد' },
  { value: 4, label: 'تیر' },
  { value: 5, label: 'مرداد' },
  { value: 6, label: 'شهریور' },
  { value: 7, label: 'مهر' },
  { value: 8, label: 'آبان' },
  { value: 9, label: 'آذر' },
  { value: 10, label: 'دی' },
  { value: 11, label: 'بهمن' },
  { value: 12, label: 'اسفند' },
];

export function formatPeriodKey(period: Period): string {
  const m = String(period.month).padStart(2, '0');
  return `${period.year}-${m}`;
}

export function formatPeriodLabel(periodKey: string): string {
  const [yStr, mStr] = periodKey.split('-');
  const mNum = Number(mStr);
  const monthObj = JALALI_MONTHS.find((item) => item.value === mNum);
  const monthName = monthObj ? monthObj.label : mStr;
  return `${monthName} ${toPersianDigits(yStr)}`;
}

export function getJalaliMonthAndYear(periodKey: string): {
  monthName: string;
  persianYear: string;
} {
  const [yStr = '1405', mStr = '01'] = periodKey.split('-');
  const mNum = Number(mStr);
  const monthObj = JALALI_MONTHS.find((item) => item.value === mNum);
  return {
    monthName: monthObj ? monthObj.label : mStr,
    persianYear: toPersianDigits(yStr),
  };
}

export function getPeriodDays(month: number): number {
  if (month >= 1 && month <= 6) return 31;
  if (month >= 7 && month <= 11) return 30;
  return 29;
}

export function getMonthFromPeriodKey(periodKey: string): number {
  const parts = periodKey.split('-');
  const m = Number(parts[1]);
  return Number.isFinite(m) && m >= 1 && m <= 12 ? m : 8;
}

export function createEmptyTimesheet(
  employeeId: string,
  periodKey: string
): MonthlyTimesheet {
  const month = getMonthFromPeriodKey(periodKey);
  return {
    id: `${employeeId}__${periodKey}`,
    employeeId,
    periodKey,
    workingDays: getPeriodDays(month),
    enteredSalary: 0,
    overtimeHours: 0,
    holidayHours: 0,
    dayShiftHours: 0,
    nightShiftHours: 0,
    absentDays: 0,
    missionAllowance: 0,
    bonus: 0,
    otherAllowances: 0,
    advancePayment: 0,
    otherDeductions: 0,
    note: '',
  };
}

export interface SoroushWorkDerivation {
  dailyWage: number;
  salaryRatio: number;
  derivedWorkingDays: number;
  usedEnteredSalary: boolean;
}

/**
 * Computes daily wage (روزانه) from baseMonthlySalary and, when an enteredSalary is
 * provided for شرکتی سروش, divides enteredSalary by the baseMonthlySalary / dailyWage
 * to determine the worked days (مقدار کارکرد).
 */
export function calculateSoroushWorkDerivation(
  baseMonthlySalary: number,
  enteredSalary: number,
  periodDays: number
): SoroushWorkDerivation {
  const safePeriodDays = Math.max(1, periodDays);
  const safeBase = Math.max(0, Number.isFinite(baseMonthlySalary) ? baseMonthlySalary : 0);
  const safeEntered = Math.max(0, Number.isFinite(enteredSalary) ? enteredSalary : 0);

  const dailyWage = safeBase > 0 ? Math.round(safeBase / safePeriodDays) : 0;
  if (safeBase <= 0 || safeEntered <= 0) {
    return {
      dailyWage,
      salaryRatio: 0,
      derivedWorkingDays: 0,
      usedEnteredSalary: false,
    };
  }

  const salaryRatio = safeEntered / safeBase;
  const derivedWorkingDays = Math.round(salaryRatio * safePeriodDays * 100) / 100;
  return {
    dailyWage,
    salaryRatio,
    derivedWorkingDays,
    usedEnteredSalary: true,
  };
}

export function toPersianDigits(input: string | number): string {
  const map: Record<string, string> = {
    '0': '۰',
    '1': '۱',
    '2': '۲',
    '3': '۳',
    '4': '۴',
    '5': '۵',
    '6': '۶',
    '7': '۷',
    '8': '۸',
    '9': '۹',
  };
  return String(input).replace(/[0-9]/g, (d) => map[d] ?? d);
}

export function toEnglishDigits(input: string): string {
  const persianMap: Record<string, string> = {
    '۰': '0',
    '۱': '1',
    '۲': '2',
    '۳': '3',
    '۴': '4',
    '۵': '5',
    '۶': '6',
    '۷': '7',
    '۸': '8',
    '۹': '9',
    '٠': '0',
    '١': '1',
    '٢': '2',
    '٣': '3',
    '٤': '4',
    '٥': '5',
    '٦': '6',
    '٧': '7',
    '٨': '8',
    '٩': '9',
  };
  return input.replace(/[۰-۹٠-٩]/g, (d) => persianMap[d] ?? d);
}

export function formatMoney(amount: number, usePersianDigits = true): string {
  const rounded = Math.round(Number.isFinite(amount) ? amount : 0);
  const absFormatted = Math.abs(rounded).toLocaleString('en-US');
  const signed = rounded < 0 ? `-${absFormatted}` : absFormatted;
  return usePersianDigits ? toPersianDigits(signed) : signed;
}

export function parseNumericInput(raw: string): number {
  const cleaned = toEnglishDigits(raw).replace(/[^\d]/g, '');
  if (!cleaned) return 0;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Computes progressive income tax across ordered brackets.
 */
export function calculateProgressiveTax(
  taxableIncome: number,
  brackets: TaxBracket[]
): number {
  if (taxableIncome <= 0 || brackets.length === 0) return 0;

  const sorted = [...brackets].sort((a, b) => a.minMonthly - b.minMonthly);
  let totalTax = 0;

  for (const bracket of sorted) {
    if (taxableIncome <= bracket.minMonthly) continue;
    const upper =
      bracket.maxMonthly !== null && bracket.maxMonthly > bracket.minMonthly
        ? Math.min(taxableIncome, bracket.maxMonthly)
        : taxableIncome;
    const taxableSlice = Math.max(0, upper - bracket.minMonthly);
    totalTax += taxableSlice * (bracket.ratePercent / 100);
  }

  return Math.round(totalTax);
}

export function calculateLoanDeductionForPeriod(
  loans: Loan[],
  employeeId: string,
  periodKey: string
): { deduction: number; remainingAfter: number } {
  const eligible = loans.filter(
    (loan) =>
      loan.employeeId === employeeId &&
      loan.status === 'active' &&
      loan.remainingBalance > 0 &&
      loan.startPeriod <= periodKey
  );

  let deduction = 0;
  let remainingAfter = 0;

  for (const loan of eligible) {
    const installment = Math.min(loan.monthlyInstallment, loan.remainingBalance);
    deduction += installment;
    remainingAfter += Math.max(0, loan.remainingBalance - installment);
  }

  return {
    deduction: Math.round(deduction),
    remainingAfter: Math.round(remainingAfter),
  };
}

export function calculateEmployeePayslip(
  employee: Employee,
  timesheetInput: MonthlyTimesheet | undefined,
  loans: Loan[],
  settings: PayrollSettings,
  periodKey: string,
  manualPayments: ManualSalaryPayment[] = []
): ComputedPayslip {
  const month = getMonthFromPeriodKey(periodKey);
  const periodDays = getPeriodDays(month);
  const timesheet = timesheetInput ?? createEmptyTimesheet(employee.id, periodKey);

  const periodManualPayments = manualPayments.filter(
    (p) =>
      p.employeeId === employee.id &&
      p.periodKey === periodKey &&
      Number.isFinite(p.amount) &&
      p.amount > 0
  );

  const manualOverrideAmount = Math.round(
    periodManualPayments
      .filter((p) => p.mode === 'override')
      .reduce((sum, p) => sum + p.amount, 0)
  );
  const manualAdditionalPay = Math.round(
    periodManualPayments
      .filter((p) => p.mode === 'additional')
      .reduce((sum, p) => sum + p.amount, 0)
  );
  const salaryMode = getEffectiveSalaryMode(employee);
  const allowanceFlags = normalizeAllowanceFlags(employee.allowanceFlags);
  const isManualOverride = manualOverrideAmount > 0 || salaryMode === 'manual';

  const isDailyDivided = salaryMode === 'daily-divided';
  const isSoroush = employee.employmentType === 'sherkati-soroush';
  const usesEnteredSalaryDivision =
    isDailyDivided &&
    Boolean(timesheet.enteredSalary && timesheet.enteredSalary > 0);

  const soroushEnteredSalary =
    (isSoroush || isDailyDivided) &&
    timesheet.enteredSalary &&
    timesheet.enteredSalary > 0
      ? Math.round(timesheet.enteredSalary)
      : 0;
  const soroushInfo = calculateSoroushWorkDerivation(
    employee.baseMonthlySalary,
    soroushEnteredSalary,
    periodDays
  );

  const seniorityAllowance = Math.max(
    0,
    Math.round(Number(employee.seniorityAllowance) || 0)
  );
  const wageBaseWithSeniority = employee.baseMonthlySalary + seniorityAllowance;

  const dailyWage =
    periodDays > 0 && wageBaseWithSeniority > 0
      ? Math.round(wageBaseWithSeniority / periodDays)
      : 0;

  const effectiveDays =
    salaryMode === 'fixed'
      ? periodDays
      : usesEnteredSalaryDivision && soroushInfo.usedEnteredSalary
        ? Math.max(
            0,
            Math.round(
              (soroushInfo.derivedWorkingDays - timesheet.absentDays) * 100
            ) / 100
          )
        : Math.min(
            periodDays,
            Math.max(0, timesheet.workingDays - timesheet.absentDays)
          );

  if (isManualOverride) {
    const manualBase =
      manualOverrideAmount > 0
        ? manualOverrideAmount
        : timesheet.enteredSalary && timesheet.enteredSalary > 0
          ? Math.round(timesheet.enteredSalary)
          : Math.round(employee.baseMonthlySalary);
    const totalOverrideWithExtra = manualBase + manualAdditionalPay;
    return {
      employee,
      timesheet,
      periodKey,
      periodDays,
      effectiveDays,
      dailyWage,
      soroushEnteredSalary,
      baseSalaryEarned: manualBase,
      seniorityEarned: 0,
      housingEarned: 0,
      foodEarned: 0,
      maritalEarned: 0,
      childEarned: 0,
      specialFixedAllowanceEarned: 0,
      overtimePay: 0,
      holidayPay: 0,
      dayShiftPay: 0,
      nightShiftPay: 0,
      missionAllowance: 0,
      bonus: 0,
      otherAllowances: 0,
      grossSalary: totalOverrideWithExtra,
      insurableSalary: 0,
      employeeInsurance: 0,
      employerInsurance: 0,
      taxableIncome: 0,
      incomeTax: 0,
      loanDeduction: 0,
      advancePayment: 0,
      otherDeductions: 0,
      totalDeductions: 0,
      manualAdditionalPay,
      manualOverrideAmount: manualBase,
      isManualOverride: true,
      netPayable: totalOverrideWithExtra,
      totalEmployerCost: totalOverrideWithExtra,
      activeLoansRemainingAfter: 0,
    };
  }

  const dayRatio =
    salaryMode === 'fixed' ? 1 : periodDays > 0 ? effectiveDays / periodDays : 0;

  const baseSalaryEarned =
    salaryMode === 'fixed'
      ? Math.round(employee.baseMonthlySalary)
      : usesEnteredSalaryDivision && soroushInfo.usedEnteredSalary
        ? Math.max(
            0,
            Math.round(
              soroushEnteredSalary -
                timesheet.absentDays * (employee.baseMonthlySalary / periodDays)
            )
          )
        : Math.round(employee.baseMonthlySalary * dayRatio);

  const isSpecialAllowanceContract =
    employee.employmentType === 'article-28' ||
    employee.employmentType === 'sherkati-soroush';
  const specialAllowances = settings.specialContractAllowances;

  const housingEarned = !allowanceFlags.housing
    ? 0
    : isSpecialAllowanceContract && specialAllowances
      ? Math.round(specialAllowances.housingAllowance * dayRatio)
      : Math.round(settings.housingAllowance * dayRatio);

  const foodEarned = !allowanceFlags.food
    ? 0
    : isSpecialAllowanceContract && specialAllowances
      ? Math.round(specialAllowances.foodAllowance * dayRatio)
      : Math.round(settings.foodAllowance * dayRatio);

  const maritalEarned = !allowanceFlags.marital
    ? 0
    : isSpecialAllowanceContract && specialAllowances
      ? employee.maritalStatus === 'married' ||
        specialAllowances.alwaysIncludeMaritalAndChild
        ? Math.round(specialAllowances.maritalAllowance * dayRatio)
        : 0
      : employee.maritalStatus === 'married'
        ? Math.round(settings.maritalAllowance * dayRatio)
        : 0;

  const childEarned = !allowanceFlags.child
    ? 0
    : isSpecialAllowanceContract && specialAllowances
      ? employee.childrenCount > 0
        ? Math.round(
            specialAllowances.childAllowance * employee.childrenCount * dayRatio
          )
        : specialAllowances.alwaysIncludeMaritalAndChild
          ? Math.round(specialAllowances.childAllowance * dayRatio)
          : 0
      : employee.childrenCount > 0
        ? Math.round(
            settings.childAllowancePerChild * employee.childrenCount * dayRatio
          )
        : 0;

  const specialFixedAllowanceEarned = !allowanceFlags.otherFixed
    ? 0
    : isSpecialAllowanceContract && specialAllowances
      ? Math.round(specialAllowances.otherFixedAllowance * dayRatio)
      : 0;

  const seniorityEarned =
    salaryMode === 'fixed'
      ? seniorityAllowance
      : Math.round(seniorityAllowance * dayRatio);

  const hourlyRate =
    settings.standardMonthlyHours > 0
      ? wageBaseWithSeniority / settings.standardMonthlyHours
      : 0;

  const overtimePay = Math.round(
    Math.max(0, timesheet.overtimeHours) * hourlyRate * settings.overtimeMultiplier
  );
  const holidayPay = Math.round(
    Math.max(0, timesheet.holidayHours) * hourlyRate * settings.holidayMultiplier
  );
  const dayShiftPay = Math.round(
    Math.max(0, timesheet.dayShiftHours ?? 0) *
      hourlyRate *
      Math.max(0, settings.dayShiftMultiplier ?? 0.15)
  );
  const nightShiftPay = Math.round(
    Math.max(0, timesheet.nightShiftHours) * hourlyRate * settings.nightShiftMultiplier
  );

  const missionAllowance = Math.max(0, Math.round(timesheet.missionAllowance));
  const bonus = Math.max(0, Math.round(timesheet.bonus));
  const otherAllowances = Math.max(0, Math.round(timesheet.otherAllowances));

  const grossSalary =
    baseSalaryEarned +
    seniorityEarned +
    housingEarned +
    foodEarned +
    maritalEarned +
    childEarned +
    specialFixedAllowanceEarned +
    overtimePay +
    holidayPay +
    dayShiftPay +
    nightShiftPay +
    missionAllowance +
    bonus +
    otherAllowances +
    manualAdditionalPay;

  // Insurable pay excludes child/marital/mission/manual-payout in many Iranian standards or applies ceiling;
  // here we include wage + seniority + housing + food + overtime/shift + bonus + fixed allowance
  // capped by employee insuranceBaseCap and/or global insuranceSalaryCeiling if > 0.
  const rawInsurable =
    baseSalaryEarned +
    seniorityEarned +
    housingEarned +
    foodEarned +
    specialFixedAllowanceEarned +
    overtimePay +
    holidayPay +
    dayShiftPay +
    nightShiftPay +
    bonus +
    otherAllowances;

  const isInsuranceExempt = employee.employmentType === 'retired';
  const empCap = Math.max(0, Math.round(Number(employee.insuranceBaseCap) || 0));
  const globalCap = Math.max(0, Math.round(Number(settings.insuranceSalaryCeiling) || 0));
  const effectiveInsuranceCap =
    empCap > 0 && globalCap > 0
      ? Math.min(empCap, globalCap)
      : empCap > 0
        ? empCap
        : globalCap;

  const insurableSalary = isInsuranceExempt
    ? 0
    : effectiveInsuranceCap > 0
      ? Math.min(rawInsurable, effectiveInsuranceCap)
      : rawInsurable;

  const employeeInsurance = isInsuranceExempt
    ? 0
    : Math.round(
        insurableSalary * (Math.max(0, settings.employeeInsuranceRate) / 100)
      );
  const employerInsurance = isInsuranceExempt
    ? 0
    : Math.round(
        insurableSalary * (Math.max(0, settings.employerInsuranceRate) / 100)
      );

  // Under Iranian tax practice, employee insurance & tax-exempt items reduce taxable base;
  // additional manual payments are applied directly to net payable without distorting statutory tax.
  const taxableIncome = Math.max(
    0,
    grossSalary -
      manualAdditionalPay -
      childEarned -
      missionAllowance -
      employeeInsurance
  );

  const incomeTax = calculateProgressiveTax(taxableIncome, settings.taxBrackets);

  const { deduction: loanDeduction, remainingAfter: activeLoansRemainingAfter } =
    calculateLoanDeductionForPeriod(loans, employee.id, periodKey);

  const advancePayment = Math.max(0, Math.round(timesheet.advancePayment));
  const otherDeductions = Math.max(0, Math.round(timesheet.otherDeductions));

  const totalDeductions =
    employeeInsurance + incomeTax + loanDeduction + advancePayment + otherDeductions;

  const netPayable = grossSalary - totalDeductions;
  const totalEmployerCost = grossSalary + employerInsurance;

  return {
    employee,
    timesheet,
    periodKey,
    periodDays,
    effectiveDays,
    dailyWage,
    soroushEnteredSalary,
    baseSalaryEarned,
    seniorityEarned,
    housingEarned,
    foodEarned,
    maritalEarned,
    childEarned,
    specialFixedAllowanceEarned,
    overtimePay,
    holidayPay,
    dayShiftPay,
    nightShiftPay,
    missionAllowance,
    bonus,
    otherAllowances,
    grossSalary,
    insurableSalary,
    employeeInsurance,
    employerInsurance,
    taxableIncome,
    incomeTax,
    loanDeduction,
    advancePayment,
    otherDeductions,
    totalDeductions,
    manualAdditionalPay,
    manualOverrideAmount,
    isManualOverride: false,
    netPayable,
    totalEmployerCost,
    activeLoansRemainingAfter,
  };
}

export function calculatePayrollReport(
  employees: Employee[],
  timesheets: MonthlyTimesheet[],
  loans: Loan[],
  settings: PayrollSettings,
  periodKey: string,
  includeInactive = false,
  manualPayments: ManualSalaryPayment[] = []
): PayrollReport {
  const targetEmployees = includeInactive
    ? employees
    : employees.filter((e) => e.isActive);

  const timesheetMap = new Map<string, MonthlyTimesheet>();
  for (const ts of timesheets) {
    if (ts.periodKey === periodKey) {
      timesheetMap.set(ts.employeeId, ts);
    }
  }

  const payslips = targetEmployees.map((emp) =>
    calculateEmployeePayslip(
      emp,
      timesheetMap.get(emp.id),
      loans,
      settings,
      periodKey,
      manualPayments
    )
  );

  const totals = payslips.reduce(
    (acc, p) => {
      acc.employeeCount += 1;
      acc.grossTotal += p.grossSalary;
      acc.employeeInsuranceTotal += p.employeeInsurance;
      acc.employerInsuranceTotal += p.employerInsurance;
      acc.taxTotal += p.incomeTax;
      acc.loanDeductionTotal += p.loanDeduction;
      acc.advanceAndOtherDeductionsTotal += p.advancePayment + p.otherDeductions;
      acc.totalDeductions += p.totalDeductions;
      acc.netPayableTotal += p.netPayable;
      acc.totalEmployerCost += p.totalEmployerCost;
      return acc;
    },
    {
      employeeCount: 0,
      grossTotal: 0,
      employeeInsuranceTotal: 0,
      employerInsuranceTotal: 0,
      taxTotal: 0,
      loanDeductionTotal: 0,
      advanceAndOtherDeductionsTotal: 0,
      totalDeductions: 0,
      netPayableTotal: 0,
      totalEmployerCost: 0,
    }
  );

  const deptMap = new Map<string, DepartmentSummary>();
  for (const p of payslips) {
    const deptName = p.employee.department.trim() || 'عمومی';
    const existing = deptMap.get(deptName) ?? {
      department: deptName,
      employeeCount: 0,
      grossTotal: 0,
      netTotal: 0,
      employerInsuranceTotal: 0,
      totalCost: 0,
    };
    existing.employeeCount += 1;
    existing.grossTotal += p.grossSalary;
    existing.netTotal += p.netPayable;
    existing.employerInsuranceTotal += p.employerInsurance;
    existing.totalCost += p.totalEmployerCost;
    deptMap.set(deptName, existing);
  }

  const departmentBreakdown = Array.from(deptMap.values()).sort(
    (a, b) => b.totalCost - a.totalCost
  );

  return {
    periodKey,
    payslips,
    totals,
    departmentBreakdown,
  };
}

export function generatePayrollCsv(
  report: PayrollReport,
  settings: PayrollSettings
): string {
  const headers = [
    'کد پرسنلی',
    'نام و نام خانوادگی',
    'دپارتمان',
    'سمت',
    'محل خدمت',
    'شماره موبایل',
    'تلفن محل کار',
    'نوع قرارداد',
    'نوع بانک',
    'شماره حساب / شبا',
    'کارکرد موثر (روز)',
    `حقوق پایه (${settings.currency})`,
    `مزایای قانونی (${settings.currency})`,
    `اضافه‌کاری و شیفت (${settings.currency})`,
    `پاداش و ماموریت (${settings.currency})`,
    `جمع ناخالص (${settings.currency})`,
    `بیمه کارگر (${settings.currency})`,
    `مالیات حقوق (${settings.currency})`,
    `قسط وام (${settings.currency})`,
    `مساعده و سایر کسورات (${settings.currency})`,
    `خالص پرداختی (${settings.currency})`,
    `بیمه کارفرما (${settings.currency})`,
  ];

  const escapeCsv = (val: string | number): string => {
    const s = String(val);
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };

  const rows = report.payslips.map((p) => {
    const statutory =
      p.housingEarned + p.foodEarned + p.maritalEarned + p.childEarned;
    const shifts = p.overtimePay + p.holidayPay + p.nightShiftPay;
    const extras = p.bonus + p.missionAllowance + p.otherAllowances;
    const miscDeductions = p.advancePayment + p.otherDeductions;

    return [
      p.employee.personnelCode,
      p.employee.fullName,
      p.employee.department,
      p.employee.jobTitle,
      p.employee.workLocation,
      p.employee.mobileNumber,
      p.employee.workPhone,
      getEmploymentTypeLabel(
        p.employee.employmentType,
        p.employee.customContractTitle
      ),
      p.employee.bankName,
      p.employee.bankAccount,
      p.effectiveDays,
      p.baseSalaryEarned,
      statutory,
      shifts,
      extras,
      p.grossSalary,
      p.employeeInsurance,
      p.incomeTax,
      p.loanDeduction,
      miscDeductions,
      p.netPayable,
      p.employerInsurance,
    ]
      .map(escapeCsv)
      .join(',');
  });

  return '\uFEFF' + [headers.map(escapeCsv).join(','), ...rows].join('\n');
}

export interface ValidationErrors {
  [field: string]: string;
}

export function validateEmployeeInput(
  input: Omit<Employee, 'id'>,
  existingEmployees: Employee[],
  editingId?: string
): ValidationErrors {
  const errors: ValidationErrors = {};

  if (!input.fullName.trim()) {
    errors.fullName = 'نام و نام خانوادگی الزامی است.';
  }
  if (!input.personnelCode.trim()) {
    errors.personnelCode = 'کد پرسنلی الزامی است.';
  } else {
    const duplicate = existingEmployees.find(
      (e) =>
        e.personnelCode.trim() === input.personnelCode.trim() && e.id !== editingId
    );
    if (duplicate) {
      errors.personnelCode = 'این کد پرسنلی قبلاً ثبت شده است.';
    }
  }

  const normalizedNationalId = toEnglishDigits(input.nationalId.trim());
  if (!/^\d{10}$/.test(normalizedNationalId)) {
    errors.nationalId = 'کد ملی باید دقیقاً ۱۰ رقم باشد.';
  }

  if (!input.department.trim()) {
    errors.department = 'نام دپارتمان یا واحد الزامی است.';
  }
  if (!input.jobTitle.trim()) {
    errors.jobTitle = 'عنوان شغلی الزامی است.';
  }
  if (!Number.isFinite(input.baseMonthlySalary) || input.baseMonthlySalary <= 0) {
    errors.baseMonthlySalary = 'حقوق پایه باید عددی بزرگتر از صفر باشد.';
  }
  if (!Number.isFinite(input.childrenCount) || input.childrenCount < 0) {
    errors.childrenCount = 'تعداد فرزندان نمی‌تواند منفی باشد.';
  }

  return errors;
}

export function validateLoanInput(input: {
  employeeId: string;
  title: string;
  totalAmount: number;
  monthlyInstallment: number;
  remainingBalance: number;
}): ValidationErrors {
  const errors: ValidationErrors = {};

  if (!input.employeeId) {
    errors.employeeId = 'انتخاب کارمند الزامی است.';
  }
  if (!input.title.trim()) {
    errors.title = 'عنوان وام الزامی است.';
  }
  if (!Number.isFinite(input.totalAmount) || input.totalAmount <= 0) {
    errors.totalAmount = 'مبلغ کل وام باید بزرگتر از صفر باشد.';
  }
  if (!Number.isFinite(input.monthlyInstallment) || input.monthlyInstallment <= 0) {
    errors.monthlyInstallment = 'مبلغ قسط ماهانه باید بزرگتر از صفر باشد.';
  } else if (input.monthlyInstallment > input.totalAmount) {
    errors.monthlyInstallment = 'قسط ماهانه نمی‌تواند از مبلغ کل وام بیشتر باشد.';
  }
  if (!Number.isFinite(input.remainingBalance) || input.remainingBalance < 0) {
    errors.remainingBalance = 'مانده وام نامعتبر است.';
  } else if (input.remainingBalance > input.totalAmount) {
    errors.remainingBalance = 'مانده وام نمی‌تواند از مبلغ کل بیشتر باشد.';
  }

  return errors;
}

export const USER_ROLE_LABELS: Record<UserRole, string> = {
  admin: 'مدیر سیستم (دسترسی کامل)',
  viewer: 'کاربر عادی (دسترسی سفارشی)',
};

export const DEFAULT_ADMIN_PERMISSIONS: UserPermissions = {
  manageEmployees: true,
  enterTimesheets: true,
  manageLoans: true,
  manageSettings: true,
  enterManualSalary: true,
  enterManualSalary2: true,
  enterSalaryTiers: true,
  manageBackup: true,
  viewReports: true,
};

export const DEFAULT_VIEWER_PERMISSIONS: UserPermissions = {
  manageEmployees: false,
  enterTimesheets: true,
  manageLoans: false,
  manageSettings: false,
  enterManualSalary: true,
  enterManualSalary2: true,
  enterSalaryTiers: true,
  manageBackup: false,
  viewReports: true,
};

export const EMPTY_USER_PERMISSIONS: UserPermissions = {
  manageEmployees: false,
  enterTimesheets: false,
  manageLoans: false,
  manageSettings: false,
  enterManualSalary: false,
  enterManualSalary2: false,
  enterSalaryTiers: false,
  manageBackup: false,
  viewReports: false,
};

export const USER_PERMISSION_ITEMS: ReadonlyArray<{
  key: keyof UserPermissions;
  label: string;
  description: string;
}> = [
  {
    key: 'manageEmployees',
    label: 'مدیریت مشخصات کارمندان',
    description: 'ثبت کارمند جدید، ویرایش پرونده پرسنلی و تغییر وضعیت فعال/غیرفعال',
  },
  {
    key: 'enterTimesheets',
    label: 'ثبت کارکرد و متغیرهای ماهانه',
    description: 'ورود روزهای کارکرد، اضافه‌کاری، نوبت‌کاری، کسورات و ورود اکسل صفحه ۲',
  },
  {
    key: 'enterManualSalary2',
    label: 'پرداخت حقوق دستی ۲ (صفحه ۴)',
    description: 'مشاهده و ویرایش جدول نام و حقوق کارمندان و ورود/خروجی اکسل در ردیف ۴',
  },
  {
    key: 'enterSalaryTiers',
    label: 'ورود و خروجی اکسل ۸ ردیف حقوق (صفحه ۵)',
    description: 'ویرایش مبالغ ردیف‌های سازمانی، ورود اکسل و ثبت نهایی در ردیف ۵',
  },
  {
    key: 'manageLoans',
    label: 'مدیریت وام و اقساط',
    description: 'ثبت وام جدید، ویرایش، پرداخت وام، کسر قسط، توقف یا حذف وام کارمندان',
  },
  {
    key: 'manageSettings',
    label: 'تنظیمات حقوق، بیمه و مالیات',
    description: 'ویرایش نرخ‌های قانونی، پله‌های مالیاتی و الگوهای گزارش پارامتریک',
  },
  {
    key: 'manageBackup',
    label: 'بکاپ‌گیری و استفاده از بکاپ',
    description: 'دریافت فایل پشتیبان و بازیابی اطلاعات از فایل بکاپ در نوار پایین کنار مدیر سیستم',
  },
  {
    key: 'viewReports',
    label: 'مشاهده و خروجی گزارش‌ها',
    description: 'مشاهده لیست حقوق، تحلیل ۸ ردیف، گزارش پارامتریک و دریافت اکسل/فیش',
  },
];

export function getEffectiveUserPermissions(
  user: SystemUser | null | undefined
): UserPermissions {
  if (!user || !user.isActive) {
    return { ...EMPTY_USER_PERMISSIONS };
  }
  if (user.role === 'admin') {
    return { ...DEFAULT_ADMIN_PERMISSIONS };
  }
  return {
    ...DEFAULT_VIEWER_PERMISSIONS,
    ...(user.permissions ?? {}),
  };
}

export function isAdminUser(user: SystemUser | null | undefined): boolean {
  return Boolean(user && user.isActive && user.role === 'admin');
}

export function canManageEmployees(user: SystemUser | null | undefined): boolean {
  return getEffectiveUserPermissions(user).manageEmployees;
}

export function canEnterTimesheets(user: SystemUser | null | undefined): boolean {
  return getEffectiveUserPermissions(user).enterTimesheets;
}

export function canManageLoans(user: SystemUser | null | undefined): boolean {
  return getEffectiveUserPermissions(user).manageLoans;
}

export function canManageSettings(user: SystemUser | null | undefined): boolean {
  return getEffectiveUserPermissions(user).manageSettings;
}

export function canEnterManualSalary(user: SystemUser | null | undefined): boolean {
  return getEffectiveUserPermissions(user).enterManualSalary;
}

export function canEnterManualSalary2(user: SystemUser | null | undefined): boolean {
  return getEffectiveUserPermissions(user).enterManualSalary2;
}

export function canEnterSalaryTiers(user: SystemUser | null | undefined): boolean {
  return getEffectiveUserPermissions(user).enterSalaryTiers;
}

export function canManageBackup(user: SystemUser | null | undefined): boolean {
  return getEffectiveUserPermissions(user).manageBackup;
}

export function canEnterSalaries(user: SystemUser | null | undefined): boolean {
  const perms = getEffectiveUserPermissions(user);
  return (
    perms.enterTimesheets ||
    perms.enterManualSalary ||
    perms.enterManualSalary2 ||
    perms.enterSalaryTiers
  );
}

export function canViewReports(user: SystemUser | null | undefined): boolean {
  return getEffectiveUserPermissions(user).viewReports;
}

export function authenticateUser(
  users: SystemUser[],
  username: string,
  password: string
): { user: SystemUser | null; error?: string } {
  const normalizedUsername = toEnglishDigits(username.trim()).toLowerCase();
  if (!normalizedUsername || !password) {
    return { user: null, error: 'نام کاربری و رمز عبور را وارد کنید.' };
  }
  const found = users.find(
    (u) => u.username.trim().toLowerCase() === normalizedUsername
  );
  if (!found || found.password !== password) {
    return { user: null, error: 'نام کاربری یا رمز عبور نادرست است.' };
  }
  if (!found.isActive) {
    return { user: null, error: 'این حساب کاربری توسط ادمین غیرفعال شده است.' };
  }
  return { user: found };
}

export function validateSystemUserInput(
  input: Omit<SystemUser, 'id' | 'createdAt'>,
  existingUsers: SystemUser[],
  editingId?: string
): ValidationErrors {
  const errors: ValidationErrors = {};
  const normalizedUsername = toEnglishDigits(input.username.trim()).toLowerCase();

  if (!input.fullName.trim()) {
    errors.fullName = 'نام و نام خانوادگی کاربر الزامی است.';
  }
  if (!normalizedUsername) {
    errors.username = 'نام کاربری الزامی است.';
  } else if (!/^[a-z0-9._-]{3,32}$/.test(normalizedUsername)) {
    errors.username =
      'نام کاربری باید ۳ تا ۳۲ کاراکتر انگلیسی، عدد یا . _ - باشد.';
  } else {
    const dup = existingUsers.find(
      (u) =>
        u.username.trim().toLowerCase() === normalizedUsername &&
        u.id !== editingId
    );
    if (dup) {
      errors.username = 'این نام کاربری قبلاً تعریف شده است.';
    }
  }

  if (!input.password || input.password.length < 4) {
    errors.password = 'رمز عبور باید حداقل ۴ کاراکتر باشد.';
  }

  return errors;
}

export function applyManualSalaryUpdates(
  employees: Employee[],
  salaryDrafts: Record<string, string | number>
): Employee[] {
  return employees.map((emp) => {
    if (!(emp.id in salaryDrafts)) return emp;
    const raw = salaryDrafts[emp.id];
    const parsed =
      typeof raw === 'number' ? Math.round(raw) : parseNumericInput(raw);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return emp;
    }
    return {
      ...emp,
      baseMonthlySalary: parsed,
      manualSalaries: [parsed, 0, 0, 0, 0, 0, 0, 0],
    };
  });
}


export function normalizeCustomTierAmounts(
  raw?: Record<string, number>
): Record<string, number> {
  if (!raw || typeof raw !== 'object') return {};
  const cleaned: Record<string, number> = {};
  for (const [k, v] of Object.entries(raw)) {
    const label = k.replace(/\s+/g, ' ').trim();
    const num = Math.max(0, Math.round(Number(v) || 0));
    if (label && num > 0) {
      cleaned[label] = (cleaned[label] ?? 0) + num;
    }
  }
  return cleaned;
}

export function sumCustomTierAmounts(raw?: Record<string, number>): number {
  if (!raw || typeof raw !== 'object') return 0;
  return Object.values(raw).reduce(
    (sum, n) => sum + Math.max(0, Math.round(Number(n) || 0)),
    0
  );
}

export function applyLoanPayment(
  loan: Loan,
  paymentAmount: number
): { updatedLoan: Loan; appliedAmount: number } {
  const safeCurrent = Math.max(0, Math.round(Number(loan.remainingBalance) || 0));
  const requested = Math.max(0, Math.round(Number(paymentAmount) || 0));
  if (safeCurrent <= 0 || requested <= 0 || loan.status === 'settled') {
    return { updatedLoan: loan, appliedAmount: 0 };
  }
  const appliedAmount = Math.min(safeCurrent, requested);
  const nextBalance = safeCurrent - appliedAmount;
  return {
    appliedAmount,
    updatedLoan: {
      ...loan,
      remainingBalance: nextBalance,
      status: nextBalance === 0 ? 'settled' : loan.status,
    },
  };
}

export function normalizeManualSalaries(
  items?: ReadonlyArray<number>,
  fallbackBaseSalary = 0,
  customTierAmounts?: Record<string, number>
): SalaryTierTuple {
  const out: SalaryTierTuple = [0, 0, 0, 0, 0, 0, 0, 0];
  if (Array.isArray(items) && items.length > 0) {
    let hasPositive = false;
    for (let i = 0; i < SALARY_TIER_LABELS.length; i += 1) {
      const val = Math.max(0, Math.round(Number(items[i]) || 0));
      out[i] = val;
      if (val > 0) hasPositive = true;
    }
    if (hasPositive) return out;
  }
  if (sumCustomTierAmounts(customTierAmounts) > 0) {
    return out;
  }
  out[0] = Math.max(0, Math.round(fallbackBaseSalary || 0));
  return out;
}

export function sumManualSalaries(items: ReadonlyArray<number>): number {
  return items.reduce((sum, n) => sum + Math.max(0, Math.round(Number(n) || 0)), 0);
}

export function applyMultiTierManualSalaryUpdates(
  employees: Employee[],
  salaryDrafts: Record<string, ReadonlyArray<string | number>>,
  customTierDrafts?: Record<string, Record<string, string | number>>
): Employee[] {
  return employees.map((emp) => {
    const hasTierDraft = emp.id in salaryDrafts;
    const hasCustomDraft = Boolean(customTierDrafts && emp.id in customTierDrafts);
    if (!hasTierDraft && !hasCustomDraft) return emp;

    const parsedTiers: SalaryTierTuple = hasTierDraft
      ? (() => {
          const rawList = salaryDrafts[emp.id];
          const nextTiers: SalaryTierTuple = [0, 0, 0, 0, 0, 0, 0, 0];
          for (let i = 0; i < SALARY_TIER_LABELS.length; i += 1) {
            const raw = rawList[i] ?? 0;
            const val =
              typeof raw === 'number'
                ? Math.max(0, Math.round(raw))
                : parseNumericInput(raw);
            nextTiers[i] = Number.isFinite(val) && val > 0 ? val : 0;
          }
          return nextTiers;
        })()
      : normalizeManualSalaries(
          emp.manualSalaries,
          emp.baseMonthlySalary,
          emp.customTierAmounts
        );

    let nextCustom = normalizeCustomTierAmounts(emp.customTierAmounts);
    if (hasCustomDraft && customTierDrafts) {
      const parsedCustom: Record<string, number> = {};
      const rawMap = customTierDrafts[emp.id] ?? {};
      for (const [label, raw] of Object.entries(rawMap)) {
        const cleanLabel = label.replace(/\s+/g, ' ').trim();
        if (!cleanLabel) continue;
        const val =
          typeof raw === 'number'
            ? Math.max(0, Math.round(raw))
            : parseNumericInput(raw);
        if (Number.isFinite(val) && val > 0) {
          parsedCustom[cleanLabel] = val;
        }
      }
      nextCustom = parsedCustom;
    }

    const total = sumManualSalaries(parsedTiers) + sumCustomTierAmounts(nextCustom);
    if (total <= 0) {
      return emp;
    }
    return {
      ...emp,
      baseMonthlySalary: total,
      manualSalaries: parsedTiers,
      customTierAmounts: nextCustom,
    };
  });
}

export const MANUAL_SALARY_MODE_LABELS: Record<ManualSalaryMode, string> = {
  additional: 'پرداخت مجزا (اضافه بر فیش ماه)',
  override: 'حقوق دستی توافقی (جایگزین کل فیش ماه)',
};

export function validateManualSalaryPaymentInput(input: {
  employeeId: string;
  amount: number;
  paymentDate: string;
}): ValidationErrors {
  const errors: ValidationErrors = {};
  if (!input.employeeId.trim()) {
    errors.employeeId = 'انتخاب کارمند الزامی است.';
  }
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    errors.amount = 'مبلغ حقوق دستی باید عددی بزرگتر از صفر باشد.';
  }
  if (!input.paymentDate.trim()) {
    errors.paymentDate = 'تاریخ پرداخت را وارد کنید.';
  }
  return errors;
}
