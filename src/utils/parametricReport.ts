import type {
  ComputedPayslip,
  ParametricColumnConfig,
  ParametricFieldId,
  ParametricReportFilters,
  ParametricSortDirection,
} from '../types/payroll';
import {
  SALARY_CALCULATION_MODE_SHORT_LABELS,
  SALARY_TIER_LABELS,
  getEffectiveSalaryMode,
  getEmploymentTypeLabel,
  normalizeManualSalaries,
  parseNumericInput,
  toEnglishDigits,
} from './payroll';

export type ParametricCategory =
  | 'identity'
  | 'bank'
  | 'attendance'
  | 'earnings'
  | 'deductions';

export type ParametricCellFormat = 'text' | 'code' | 'money' | 'number';

export interface ParametricFieldDefinition {
  id: ParametricFieldId;
  label: string;
  category: ParametricCategory;
  format: ParametricCellFormat;
  summable: boolean;
  getValue: (slip: ComputedPayslip) => string | number;
}

export const PARAMETRIC_CATEGORY_LABELS: Record<ParametricCategory, string> = {
  identity: 'مشخصات پرسنلی و قرارداد',
  bank: 'اطلاعات بانکی و تماس',
  attendance: 'کارکرد و حقوق‌های پایه/دستی',
  earnings: 'حقوق و مزایای محاسبه‌شده',
  deductions: 'کسورات، تعهدات و خالص پرداختی',
};

export const PARAMETRIC_FIELDS: ReadonlyArray<ParametricFieldDefinition> = [
  {
    id: 'personnelCode',
    label: 'کد پرسنلی',
    category: 'identity',
    format: 'code',
    summable: false,
    getValue: (s) => toEnglishDigits(s.employee.personnelCode.trim()),
  },
  {
    id: 'fullName',
    label: 'نام و نام خانوادگی',
    category: 'identity',
    format: 'text',
    summable: false,
    getValue: (s) => s.employee.fullName,
  },
  {
    id: 'nationalId',
    label: 'کد ملی',
    category: 'identity',
    format: 'code',
    summable: false,
    getValue: (s) => toEnglishDigits(s.employee.nationalId.trim()),
  },
  {
    id: 'department',
    label: 'دپارتمان / واحد',
    category: 'identity',
    format: 'text',
    summable: false,
    getValue: (s) => s.employee.department,
  },
  {
    id: 'jobTitle',
    label: 'سمت شغلی',
    category: 'identity',
    format: 'text',
    summable: false,
    getValue: (s) => s.employee.jobTitle,
  },
  {
    id: 'workLocation',
    label: 'محل خدمت',
    category: 'identity',
    format: 'text',
    summable: false,
    getValue: (s) => s.employee.workLocation,
  },
  {
    id: 'employmentType',
    label: 'نوع قرارداد',
    category: 'identity',
    format: 'text',
    summable: false,
    getValue: (s) =>
      getEmploymentTypeLabel(
        s.employee.employmentType,
        s.employee.customContractTitle
      ),
  },
  {
    id: 'salaryCalculationMode',
    label: 'روش محاسبه حقوق',
    category: 'identity',
    format: 'text',
    summable: false,
    getValue: (s) =>
      SALARY_CALCULATION_MODE_SHORT_LABELS[getEffectiveSalaryMode(s.employee)],
  },
  {
    id: 'maritalStatus',
    label: 'وضعیت تاهل',
    category: 'identity',
    format: 'text',
    summable: false,
    getValue: (s) => (s.employee.maritalStatus === 'married' ? 'متاهل' : 'مجرد'),
  },
  {
    id: 'childrenCount',
    label: 'تعداد فرزندان',
    category: 'identity',
    format: 'number',
    summable: true,
    getValue: (s) => s.employee.childrenCount,
  },
  {
    id: 'hireDate',
    label: 'تاریخ استخدام',
    category: 'identity',
    format: 'code',
    summable: false,
    getValue: (s) => s.employee.hireDate,
  },
  {
    id: 'isActive',
    label: 'وضعیت فعالیت',
    category: 'identity',
    format: 'text',
    summable: false,
    getValue: (s) => (s.employee.isActive ? 'فعال' : 'غیرفعال'),
  },

  // Bank & Contact
  {
    id: 'bankName',
    label: 'نام بانک',
    category: 'bank',
    format: 'text',
    summable: false,
    getValue: (s) => s.employee.bankName,
  },
  {
    id: 'bankAccount',
    label: 'شماره حساب / شبا',
    category: 'bank',
    format: 'code',
    summable: false,
    getValue: (s) => toEnglishDigits(s.employee.bankAccount.trim()),
  },
  {
    id: 'mobileNumber',
    label: 'شماره موبایل',
    category: 'bank',
    format: 'code',
    summable: false,
    getValue: (s) => toEnglishDigits(s.employee.mobileNumber.trim()),
  },
  {
    id: 'workPhone',
    label: 'تلفن محل کار',
    category: 'bank',
    format: 'code',
    summable: false,
    getValue: (s) => toEnglishDigits(s.employee.workPhone.trim()),
  },

  // Attendance & Base/Manual Tiers
  {
    id: 'effectiveDays',
    label: 'کارکرد موثر (روز)',
    category: 'attendance',
    format: 'number',
    summable: true,
    getValue: (s) => s.effectiveDays,
  },
  {
    id: 'absentDays',
    label: 'روز غیبت',
    category: 'attendance',
    format: 'number',
    summable: true,
    getValue: (s) => s.timesheet.absentDays,
  },
  {
    id: 'dailyWage',
    label: 'نرخ روزانه',
    category: 'attendance',
    format: 'money',
    summable: false,
    getValue: (s) => Math.round(s.dailyWage),
  },
  {
    id: 'soroushEnteredSalary',
    label: 'حقوق واردشده سروش',
    category: 'attendance',
    format: 'money',
    summable: true,
    getValue: (s) => Math.round(s.soroushEnteredSalary),
  },
  {
    id: 'overtimeHours',
    label: 'ساعت اضافه‌کاری',
    category: 'attendance',
    format: 'number',
    summable: true,
    getValue: (s) => s.timesheet.overtimeHours,
  },
  {
    id: 'holidayHours',
    label: 'ساعت تعطیل‌کاری',
    category: 'attendance',
    format: 'number',
    summable: true,
    getValue: (s) => s.timesheet.holidayHours,
  },
  {
    id: 'nightShiftHours',
    label: 'ساعت شب‌کاری',
    category: 'attendance',
    format: 'number',
    summable: true,
    getValue: (s) => s.timesheet.nightShiftHours,
  },
  {
    id: 'baseMonthlySalary',
    label: 'حقوق پایه قرارداد',
    category: 'attendance',
    format: 'money',
    summable: true,
    getValue: (s) => Math.round(s.employee.baseMonthlySalary),
  },
  {
    id: 'seniorityAllowance',
    label: 'پایه سنوات قرارداد',
    category: 'attendance',
    format: 'money',
    summable: true,
    getValue: (s) => Math.round(s.employee.seniorityAllowance ?? 0),
  },
  {
    id: 'insuranceBaseCap',
    label: 'سقف حقوق پایه بیمه فرد',
    category: 'attendance',
    format: 'money',
    summable: false,
    getValue: (s) => Math.round(s.employee.insuranceBaseCap ?? 0),
  },
  {
    id: 'manualSalary1',
    label: SALARY_TIER_LABELS[0],
    category: 'attendance',
    format: 'money',
    summable: true,
    getValue: (s) =>
      normalizeManualSalaries(
        s.employee.manualSalaries,
        s.employee.baseMonthlySalary
      )[0],
  },
  {
    id: 'manualSalary2',
    label: SALARY_TIER_LABELS[1],
    category: 'attendance',
    format: 'money',
    summable: true,
    getValue: (s) =>
      normalizeManualSalaries(
        s.employee.manualSalaries,
        s.employee.baseMonthlySalary
      )[1],
  },
  {
    id: 'manualSalary3',
    label: SALARY_TIER_LABELS[2],
    category: 'attendance',
    format: 'money',
    summable: true,
    getValue: (s) =>
      normalizeManualSalaries(
        s.employee.manualSalaries,
        s.employee.baseMonthlySalary
      )[2],
  },
  {
    id: 'manualSalary4',
    label: SALARY_TIER_LABELS[3],
    category: 'attendance',
    format: 'money',
    summable: true,
    getValue: (s) =>
      normalizeManualSalaries(
        s.employee.manualSalaries,
        s.employee.baseMonthlySalary
      )[3],
  },
  {
    id: 'manualSalary5',
    label: SALARY_TIER_LABELS[4],
    category: 'attendance',
    format: 'money',
    summable: true,
    getValue: (s) =>
      normalizeManualSalaries(
        s.employee.manualSalaries,
        s.employee.baseMonthlySalary
      )[4],
  },
  {
    id: 'manualSalary6',
    label: SALARY_TIER_LABELS[5],
    category: 'attendance',
    format: 'money',
    summable: true,
    getValue: (s) =>
      normalizeManualSalaries(
        s.employee.manualSalaries,
        s.employee.baseMonthlySalary
      )[5],
  },
  {
    id: 'manualSalary7',
    label: SALARY_TIER_LABELS[6],
    category: 'attendance',
    format: 'money',
    summable: true,
    getValue: (s) =>
      normalizeManualSalaries(
        s.employee.manualSalaries,
        s.employee.baseMonthlySalary
      )[6],
  },
  {
    id: 'manualSalary8',
    label: SALARY_TIER_LABELS[7],
    category: 'attendance',
    format: 'money',
    summable: true,
    getValue: (s) =>
      normalizeManualSalaries(
        s.employee.manualSalaries,
        s.employee.baseMonthlySalary
      )[7],
  },

  // Earnings
  {
    id: 'baseSalaryEarned',
    label: 'حقوق پایه کارکرد',
    category: 'earnings',
    format: 'money',
    summable: true,
    getValue: (s) => Math.round(s.baseSalaryEarned),
  },
  {
    id: 'seniorityEarned',
    label: 'سنوات کارکرد',
    category: 'earnings',
    format: 'money',
    summable: true,
    getValue: (s) => Math.round(s.seniorityEarned),
  },
  {
    id: 'housingEarned',
    label: 'حق مسکن',
    category: 'earnings',
    format: 'money',
    summable: true,
    getValue: (s) => Math.round(s.housingEarned),
  },
  {
    id: 'foodEarned',
    label: 'بن خواربار',
    category: 'earnings',
    format: 'money',
    summable: true,
    getValue: (s) => Math.round(s.foodEarned),
  },
  {
    id: 'maritalEarned',
    label: 'حق عائله‌مندی / تاهل',
    category: 'earnings',
    format: 'money',
    summable: true,
    getValue: (s) => Math.round(s.maritalEarned),
  },
  {
    id: 'childEarned',
    label: 'حق اولاد',
    category: 'earnings',
    format: 'money',
    summable: true,
    getValue: (s) => Math.round(s.childEarned),
  },
  {
    id: 'specialFixedAllowanceEarned',
    label: 'سایر مزایای ثابت (ماده ۲۸ / سروش)',
    category: 'earnings',
    format: 'money',
    summable: true,
    getValue: (s) => Math.round(s.specialFixedAllowanceEarned),
  },
  {
    id: 'overtimePay',
    label: 'مبلغ اضافه‌کاری',
    category: 'earnings',
    format: 'money',
    summable: true,
    getValue: (s) => Math.round(s.overtimePay),
  },
  {
    id: 'holidayPay',
    label: 'مبلغ تعطیل‌کاری',
    category: 'earnings',
    format: 'money',
    summable: true,
    getValue: (s) => Math.round(s.holidayPay),
  },
  {
    id: 'dayShiftPay',
    label: 'مبلغ نوبت‌کاری روز',
    category: 'earnings',
    format: 'money',
    summable: true,
    getValue: (s) => Math.round(s.dayShiftPay),
  },
  {
    id: 'nightShiftPay',
    label: 'مبلغ شب‌کاری',
    category: 'earnings',
    format: 'money',
    summable: true,
    getValue: (s) => Math.round(s.nightShiftPay),
  },
  {
    id: 'missionAllowance',
    label: 'حق ماموریت',
    category: 'earnings',
    format: 'money',
    summable: true,
    getValue: (s) => Math.round(s.missionAllowance),
  },
  {
    id: 'bonus',
    label: 'پاداش',
    category: 'earnings',
    format: 'money',
    summable: true,
    getValue: (s) => Math.round(s.bonus),
  },
  {
    id: 'otherAllowances',
    label: 'سایر مزایا',
    category: 'earnings',
    format: 'money',
    summable: true,
    getValue: (s) => Math.round(s.otherAllowances),
  },
  {
    id: 'manualAdditionalPay',
    label: 'پرداختی دستی مجزا',
    category: 'earnings',
    format: 'money',
    summable: true,
    getValue: (s) => Math.round(s.manualAdditionalPay),
  },
  {
    id: 'grossSalary',
    label: 'جمع ناخالص',
    category: 'earnings',
    format: 'money',
    summable: true,
    getValue: (s) => Math.round(s.grossSalary),
  },

  // Deductions & Net
  {
    id: 'employeeInsurance',
    label: 'بیمه کارمند',
    category: 'deductions',
    format: 'money',
    summable: true,
    getValue: (s) => Math.round(s.employeeInsurance),
  },
  {
    id: 'incomeTax',
    label: 'مالیات حقوق',
    category: 'deductions',
    format: 'money',
    summable: true,
    getValue: (s) => Math.round(s.incomeTax),
  },
  {
    id: 'loanDeduction',
    label: 'قسط وام',
    category: 'deductions',
    format: 'money',
    summable: true,
    getValue: (s) => Math.round(s.loanDeduction),
  },
  {
    id: 'activeLoansRemainingAfter',
    label: 'مانده وام',
    category: 'deductions',
    format: 'money',
    summable: true,
    getValue: (s) => Math.round(s.activeLoansRemainingAfter),
  },
  {
    id: 'advancePayment',
    label: 'مساعده',
    category: 'deductions',
    format: 'money',
    summable: true,
    getValue: (s) => Math.round(s.advancePayment),
  },
  {
    id: 'otherDeductions',
    label: 'سایر کسورات',
    category: 'deductions',
    format: 'money',
    summable: true,
    getValue: (s) => Math.round(s.otherDeductions),
  },
  {
    id: 'totalDeductions',
    label: 'جمع کل کسورات',
    category: 'deductions',
    format: 'money',
    summable: true,
    getValue: (s) => Math.round(s.totalDeductions),
  },
  {
    id: 'netPayable',
    label: 'خالص قابل پرداخت',
    category: 'deductions',
    format: 'money',
    summable: true,
    getValue: (s) => Math.round(s.netPayable),
  },
  {
    id: 'employerInsurance',
    label: 'بیمه کارفرما',
    category: 'deductions',
    format: 'money',
    summable: true,
    getValue: (s) => Math.round(s.employerInsurance),
  },
  {
    id: 'totalEmployerCost',
    label: 'بهای تمام‌شده کارفرما',
    category: 'deductions',
    format: 'money',
    summable: true,
    getValue: (s) => Math.round(s.totalEmployerCost),
  },
];

export const PARAMETRIC_FIELD_MAP: Record<
  ParametricFieldId,
  ParametricFieldDefinition
> = PARAMETRIC_FIELDS.reduce(
  (acc, field) => {
    acc[field.id] = field;
    return acc;
  },
  {} as Record<ParametricFieldId, ParametricFieldDefinition>
);

export interface ParametricPreset {
  id: string;
  label: string;
  columns: ParametricColumnConfig[];
  sortBy: ParametricFieldId;
  sortDirection: ParametricSortDirection;
}

export const PARAMETRIC_PRESETS: ReadonlyArray<ParametricPreset> = [
  {
    id: 'bank-payment',
    label: 'لیست پرداخت بانکی',
    columns: [
      { fieldId: 'personnelCode' },
      { fieldId: 'fullName' },
      { fieldId: 'nationalId' },
      { fieldId: 'bankName' },
      { fieldId: 'bankAccount' },
      { fieldId: 'netPayable' },
    ],
    sortBy: 'personnelCode',
    sortDirection: 'asc',
  },
  {
    id: 'payroll-summary',
    label: 'خلاصه حقوق و کسورات',
    columns: [
      { fieldId: 'personnelCode' },
      { fieldId: 'fullName' },
      { fieldId: 'employmentType' },
      { fieldId: 'effectiveDays' },
      { fieldId: 'baseSalaryEarned' },
      { fieldId: 'grossSalary' },
      { fieldId: 'employeeInsurance' },
      { fieldId: 'incomeTax' },
      { fieldId: 'loanDeduction' },
      { fieldId: 'netPayable' },
    ],
    sortBy: 'personnelCode',
    sortDirection: 'asc',
  },
  {
    id: 'soroush-article28',
    label: 'گزارش سروش و ماده ۲۸',
    columns: [
      { fieldId: 'personnelCode' },
      { fieldId: 'fullName' },
      { fieldId: 'employmentType' },
      { fieldId: 'dailyWage' },
      { fieldId: 'soroushEnteredSalary' },
      { fieldId: 'effectiveDays' },
      { fieldId: 'housingEarned' },
      { fieldId: 'foodEarned' },
      { fieldId: 'maritalEarned' },
      { fieldId: 'childEarned' },
      { fieldId: 'specialFixedAllowanceEarned' },
      { fieldId: 'netPayable' },
    ],
    sortBy: 'personnelCode',
    sortDirection: 'asc',
  },
  {
    id: 'full-personnel',
    label: 'فهرست جامع پرسنلی',
    columns: [
      { fieldId: 'personnelCode' },
      { fieldId: 'fullName' },
      { fieldId: 'nationalId' },
      { fieldId: 'department' },
      { fieldId: 'workLocation' },
      { fieldId: 'employmentType' },
      { fieldId: 'mobileNumber' },
      { fieldId: 'bankName' },
      { fieldId: 'bankAccount' },
      { fieldId: 'baseMonthlySalary' },
      { fieldId: 'grossSalary' },
      { fieldId: 'totalDeductions' },
      { fieldId: 'netPayable' },
    ],
    sortBy: 'personnelCode',
    sortDirection: 'asc',
  },
];

export const DEFAULT_PARAMETRIC_FILTERS: ParametricReportFilters = {
  searchQuery: '',
  department: 'all',
  employmentType: 'all',
  bankName: 'all',
  includeInactive: false,
  minNetPayable: '',
  maxNetPayable: '',
};

export function filterParametricPayslips(
  payslips: ReadonlyArray<ComputedPayslip>,
  filters: ParametricReportFilters
): ComputedPayslip[] {
  const qRaw = filters.searchQuery.trim().toLowerCase();
  const qNorm = toEnglishDigits(qRaw);
  const minNet = filters.minNetPayable.trim()
    ? parseNumericInput(filters.minNetPayable)
    : null;
  const maxNet = filters.maxNetPayable.trim()
    ? parseNumericInput(filters.maxNetPayable)
    : null;

  return payslips.filter((slip) => {
    const emp = slip.employee;
    if (!filters.includeInactive && !emp.isActive) return false;
    if (filters.selectedDepartments !== undefined) {
      const deptName = emp.department.trim() || 'نامشخص';
      if (
        filters.selectedDepartments.length === 0 ||
        !filters.selectedDepartments.includes(deptName)
      ) {
        return false;
      }
    } else if (
      filters.department !== 'all' &&
      emp.department !== filters.department
    ) {
      return false;
    }

    if (filters.selectedContracts !== undefined) {
      if (
        filters.selectedContracts.length === 0 ||
        !filters.selectedContracts.includes(emp.employmentType)
      ) {
        return false;
      }
    } else if (
      filters.employmentType !== 'all' &&
      emp.employmentType !== filters.employmentType
    ) {
      return false;
    }
    if (filters.bankName !== 'all' && emp.bankName !== filters.bankName) {
      return false;
    }
    if (minNet !== null && slip.netPayable < minNet) return false;
    if (maxNet !== null && slip.netPayable > maxNet) return false;

    if (qRaw) {
      const nameMatch = emp.fullName.toLowerCase().includes(qRaw);
      const deptMatch = emp.department.toLowerCase().includes(qRaw);
      const locationMatch = emp.workLocation.toLowerCase().includes(qRaw);
      const codeMatch = toEnglishDigits(emp.personnelCode)
        .toLowerCase()
        .includes(qNorm);
      const nationalMatch = toEnglishDigits(emp.nationalId).includes(qNorm);
      const bankAccMatch = toEnglishDigits(emp.bankAccount)
        .toLowerCase()
        .includes(qNorm);
      if (
        !nameMatch &&
        !deptMatch &&
        !locationMatch &&
        !codeMatch &&
        !nationalMatch &&
        !bankAccMatch
      ) {
        return false;
      }
    }

    return true;
  });
}

export function sortParametricPayslips(
  payslips: ReadonlyArray<ComputedPayslip>,
  sortBy: ParametricFieldId,
  sortDirection: ParametricSortDirection
): ComputedPayslip[] {
  const field = PARAMETRIC_FIELD_MAP[sortBy];
  if (!field) return [...payslips];

  const dir = sortDirection === 'asc' ? 1 : -1;
  return [...payslips].sort((a, b) => {
    const valA = field.getValue(a);
    const valB = field.getValue(b);

    if (typeof valA === 'number' && typeof valB === 'number') {
      return (valA - valB) * dir;
    }

    const strA = String(valA);
    const strB = String(valB);
    return strA.localeCompare(strB, 'fa', { numeric: true }) * dir;
  });
}

export function resolveSelectedParametricRows(
  filteredAndSorted: ReadonlyArray<ComputedPayslip>,
  selectedEmployeeIds: ReadonlyArray<string> | null,
  customRowOrderIds?: ReadonlyArray<string> | null
): ComputedPayslip[] {
  const selectedList =
    selectedEmployeeIds === null
      ? [...filteredAndSorted]
      : filteredAndSorted.filter((s) =>
          selectedEmployeeIds.includes(s.employee.id)
        );

  if (customRowOrderIds && customRowOrderIds.length > 0) {
    const orderMap = new Map<string, number>();
    customRowOrderIds.forEach((id, idx) => orderMap.set(id, idx));
    return [...selectedList].sort((a, b) => {
      const idxA = orderMap.get(a.employee.id);
      const idxB = orderMap.get(b.employee.id);
      if (idxA !== undefined && idxB !== undefined) return idxA - idxB;
      if (idxA !== undefined) return -1;
      if (idxB !== undefined) return 1;
      return 0;
    });
  }

  return selectedList;
}

export interface ParametricTableColumn {
  key: string;
  header: string;
  format: ParametricCellFormat;
  summable: boolean;
}

export interface ParametricTableData {
  columns: ParametricTableColumn[];
  rows: Array<{
    employeeId: string;
    cells: Array<string | number>;
  }>;
  totalsRow: Array<string | number> | null;
}

export function buildParametricTableData(
  payslips: ReadonlyArray<ComputedPayslip>,
  columns: ReadonlyArray<ParametricColumnConfig>,
  options: {
    includeRowIndex: boolean;
    includeTotalsRow: boolean;
  }
): ParametricTableData {
  const resolvedColumns: ParametricTableColumn[] = [];

  if (options.includeRowIndex) {
    resolvedColumns.push({
      key: '__rowIndex',
      header: 'ردیف',
      format: 'number',
      summable: false,
    });
  }

  for (const col of columns) {
    const def = PARAMETRIC_FIELD_MAP[col.fieldId];
    if (!def) continue;
    resolvedColumns.push({
      key: def.id,
      header: col.customLabel?.trim() || def.label,
      format: def.format,
      summable: def.summable,
    });
  }

  const rows = payslips.map((slip, rowIdx) => {
    const cells: Array<string | number> = [];
    if (options.includeRowIndex) {
      cells.push(rowIdx + 1);
    }
    for (const col of columns) {
      const def = PARAMETRIC_FIELD_MAP[col.fieldId];
      if (!def) continue;
      cells.push(def.getValue(slip));
    }
    return {
      employeeId: slip.employee.id,
      cells,
    };
  });

  let totalsRow: Array<string | number> | null = null;
  if (options.includeTotalsRow && rows.length > 0 && resolvedColumns.length > 0) {
    totalsRow = resolvedColumns.map((col, colIdx) => {
      if (colIdx === 0) {
        return col.summable
          ? rows.reduce(
              (sum, r) => sum + (typeof r.cells[colIdx] === 'number' ? (r.cells[colIdx] as number) : 0),
              0
            )
          : `جمع کل (${rows.length} ردیف)`;
      }
      if (!col.summable) return '';
      const sum = rows.reduce((acc, r) => {
        const v = r.cells[colIdx];
        return acc + (typeof v === 'number' && Number.isFinite(v) ? v : 0);
      }, 0);
      return Math.round(sum * 100) / 100;
    });
  }

  return {
    columns: resolvedColumns,
    rows,
    totalsRow,
  };
}
