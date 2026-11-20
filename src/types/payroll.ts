export type PageId =
  | 'employees'
  | 'payroll-data'
  | 'loans-settings'
  | 'manual-salary-2'
  | 'salary-tiers'
  | 'reports';

export type EmploymentType =
  | 'employed'
  | 'retired'
  | 'article-28'
  | 'article-38'
  | 'sherkati-soroush'
  | 'custom';
export type SalaryCalculationMode = 'manual' | 'fixed' | 'daily-divided';
export type MaritalStatus = 'single' | 'married';
export type CurrencyUnit = 'تومان' | 'ریال';
export type LoanStatus = 'active' | 'paused' | 'settled';
export type ManualSalaryMode = 'additional' | 'override';

export interface EmployeeAllowanceFlags {
  housing: boolean;
  food: boolean;
  marital: boolean;
  child: boolean;
  otherFixed: boolean;
}

export interface ManualSalaryPayment {
  id: string;
  employeeId: string;
  periodKey: string;
  amount: number;
  mode: ManualSalaryMode;
  paymentDate: string;
  description: string;
  referenceCode: string;
  unitType?: string;
  workLocation?: string;
  hazardPay?: number;
  nonCalloutPay?: number;
  terminationDate?: string;
  secondSalaryBonus?: number;
  deduction1?: number;
  commuteAllowance?: number;
  createdAt: string;
}

export interface Period {
  year: number;
  month: number; // 1..12 (Jalali months)
}

export interface Employee {
  id: string;
  personnelCode: string;
  fullName: string;
  nationalId: string;
  department: string;
  jobTitle: string;
  workLocation: string;
  mobileNumber: string;
  workPhone: string;
  employmentType: EmploymentType;
  customContractTitle?: string;
  salaryCalculationMode?: SalaryCalculationMode;
  allowanceFlags?: EmployeeAllowanceFlags;
  baseMonthlySalary: number;
  seniorityAllowance?: number;
  insuranceBaseCap?: number;
  manualSalaries?: number[];
  customTierAmounts?: Record<string, number>;
  maritalStatus: MaritalStatus;
  childrenCount: number;
  bankName: string;
  bankAccount: string;
  hireDate: string;
  isActive: boolean;
}

export interface MonthlyTimesheet {
  id: string;
  employeeId: string;
  periodKey: string; // e.g. "1405-08"
  workingDays: number;
  enteredSalary?: number;
  overtimeHours: number;
  holidayHours: number;
  dayShiftHours?: number;
  nightShiftHours: number;
  absentDays: number;
  missionAllowance: number;
  bonus: number;
  otherAllowances: number;
  advancePayment: number;
  otherDeductions: number;
  note: string;
}

export interface Loan {
  id: string;
  employeeId: string;
  title: string;
  totalAmount: number;
  monthlyInstallment: number;
  remainingBalance: number;
  startPeriod: string; // "YYYY-MM"
  status: LoanStatus;
  createdAt: string;
}

export interface TaxBracket {
  id: string;
  minMonthly: number;
  maxMonthly: number | null; // null = infinity
  ratePercent: number;
}

export interface SpecialContractAllowances {
  housingAllowance: number;
  foodAllowance: number;
  maritalAllowance: number;
  childAllowance: number;
  otherFixedAllowance: number;
  alwaysIncludeMaritalAndChild: boolean;
}

export interface PayrollSettings {
  companyName: string;
  currency: CurrencyUnit;
  standardMonthlyHours: number;
  housingAllowance: number;
  foodAllowance: number;
  maritalAllowance: number;
  childAllowancePerChild: number;
  overtimeMultiplier: number;
  holidayMultiplier: number;
  dayShiftMultiplier?: number;
  nightShiftMultiplier: number;
  employeeInsuranceRate: number; // e.g. 7
  employerInsuranceRate: number; // e.g. 23
  insuranceSalaryCeiling: number; // 0 = no ceiling
  taxBrackets: TaxBracket[];
  specialContractAllowances?: SpecialContractAllowances;
}

export interface ComputedPayslip {
  employee: Employee;
  timesheet: MonthlyTimesheet;
  periodKey: string;
  periodDays: number;
  effectiveDays: number;
  dailyWage: number;
  soroushEnteredSalary: number;
  baseSalaryEarned: number;
  seniorityEarned: number;
  housingEarned: number;
  foodEarned: number;
  maritalEarned: number;
  childEarned: number;
  specialFixedAllowanceEarned: number;
  overtimePay: number;
  holidayPay: number;
  dayShiftPay: number;
  nightShiftPay: number;
  missionAllowance: number;
  bonus: number;
  otherAllowances: number;
  grossSalary: number;
  insurableSalary: number;
  employeeInsurance: number;
  employerInsurance: number;
  taxableIncome: number;
  incomeTax: number;
  loanDeduction: number;
  advancePayment: number;
  otherDeductions: number;
  totalDeductions: number;
  manualAdditionalPay: number;
  manualOverrideAmount: number;
  isManualOverride: boolean;
  netPayable: number;
  totalEmployerCost: number;
  activeLoansRemainingAfter: number;
}

export interface DepartmentSummary {
  department: string;
  employeeCount: number;
  grossTotal: number;
  netTotal: number;
  employerInsuranceTotal: number;
  totalCost: number;
}

export interface PayrollReport {
  periodKey: string;
  payslips: ComputedPayslip[];
  totals: {
    employeeCount: number;
    grossTotal: number;
    employeeInsuranceTotal: number;
    employerInsuranceTotal: number;
    taxTotal: number;
    loanDeductionTotal: number;
    advanceAndOtherDeductionsTotal: number;
    totalDeductions: number;
    netPayableTotal: number;
    totalEmployerCost: number;
  };
  departmentBreakdown: DepartmentSummary[];
}

export type UserRole = 'admin' | 'viewer';

export interface UserPermissions {
  manageEmployees: boolean;
  enterTimesheets: boolean;
  manageLoans: boolean;
  manageSettings: boolean;
  enterManualSalary: boolean;
  enterManualSalary2: boolean;
  enterSalaryTiers: boolean;
  manageBackup: boolean;
  viewReports: boolean;
}

export interface SystemUser {
  id: string;
  fullName: string;
  username: string;
  password: string;
  role: UserRole;
  isActive: boolean;
  createdAt: string;
  permissions?: UserPermissions;
}

export type ParametricFieldId =
  | 'personnelCode'
  | 'fullName'
  | 'nationalId'
  | 'department'
  | 'jobTitle'
  | 'workLocation'
  | 'employmentType'
  | 'salaryCalculationMode'
  | 'maritalStatus'
  | 'childrenCount'
  | 'hireDate'
  | 'isActive'
  | 'bankName'
  | 'bankAccount'
  | 'mobileNumber'
  | 'workPhone'
  | 'effectiveDays'
  | 'absentDays'
  | 'dailyWage'
  | 'soroushEnteredSalary'
  | 'overtimeHours'
  | 'holidayHours'
  | 'nightShiftHours'
  | 'baseMonthlySalary'
  | 'seniorityAllowance'
  | 'insuranceBaseCap'
  | 'manualSalary1'
  | 'manualSalary2'
  | 'manualSalary3'
  | 'manualSalary4'
  | 'manualSalary5'
  | 'manualSalary6'
  | 'manualSalary7'
  | 'manualSalary8'
  | 'baseSalaryEarned'
  | 'seniorityEarned'
  | 'housingEarned'
  | 'foodEarned'
  | 'maritalEarned'
  | 'childEarned'
  | 'specialFixedAllowanceEarned'
  | 'overtimePay'
  | 'holidayPay'
  | 'dayShiftPay'
  | 'nightShiftPay'
  | 'missionAllowance'
  | 'bonus'
  | 'otherAllowances'
  | 'manualAdditionalPay'
  | 'grossSalary'
  | 'employeeInsurance'
  | 'incomeTax'
  | 'loanDeduction'
  | 'activeLoansRemainingAfter'
  | 'advancePayment'
  | 'otherDeductions'
  | 'totalDeductions'
  | 'netPayable'
  | 'employerInsurance'
  | 'totalEmployerCost';

export type ParametricAlignment = 'left' | 'center' | 'right';
export type ParametricSheetDirection = 'ltr' | 'rtl';
export type ParametricSortDirection = 'asc' | 'desc';

export interface ParametricColumnConfig {
  fieldId: ParametricFieldId;
  customLabel?: string;
}

export interface ParametricReportFilters {
  searchQuery: string;
  department: string;
  employmentType: EmploymentType | 'all';
  selectedDepartments?: ReadonlyArray<string>;
  selectedContracts?: ReadonlyArray<EmploymentType>;
  bankName: string;
  includeInactive: boolean;
  minNetPayable: string;
  maxNetPayable: string;
}

export interface ParametricReportTemplate {
  id: string;
  name: string;
  columns: ParametricColumnConfig[];
  selectedEmployeeIds: string[] | null;
  sortBy: ParametricFieldId;
  sortDirection: ParametricSortDirection;
  sheetDirection: ParametricSheetDirection;
  cellAlignment: ParametricAlignment;
  includeHeaderRow: boolean;
  includeRowIndex: boolean;
  includeTotalsRow: boolean;
  sheetName: string;
  updatedAt: string;
}

export interface AppState {
  employees: Employee[];
  timesheets: MonthlyTimesheet[];
  loans: Loan[];
  manualPayments?: ManualSalaryPayment[];
  settings: PayrollSettings;
  selectedPeriod: Period;
  users: SystemUser[];
  currentUserId: string | null;
  parametricTemplates?: ParametricReportTemplate[];
}
