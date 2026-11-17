import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EMPLOYMENT_TYPE_LABELS,
  IRANIAN_BANKS,
  MANUAL_SALARY_MODE_LABELS,
  SALARY_TIER_LABELS,
  applyManualSalaryUpdates,
  applyMultiTierManualSalaryUpdates,
  authenticateUser,
  calculateEmployeePayslip,
  calculateLoanDeductionForPeriod,
  calculatePayrollReport,
  calculateProgressiveTax,
  calculateSoroushWorkDerivation,
  detectBankFromSheba,
  formatMoney,
  generatePayrollCsv,
  getPeriodDays,
  isAdminUser,
  normalizeManualSalaries,
  parseNumericInput,
  sumManualSalaries,
  toEnglishDigits,
  toPersianDigits,
  validateEmployeeInput,
  validateLoanInput,
  validateManualSalaryPaymentInput,
  validateSystemUserInput,
} from './payroll';
import {
  DEFAULT_PAYROLL_SETTINGS,
  INITIAL_SEED_STATE,
  INITIAL_USERS,
} from '../data/seedData';
import type {
  Employee,
  Loan,
  ManualSalaryPayment,
  MonthlyTimesheet,
} from '../types/payroll';

test('getPeriodDays returns exact Jalali calendar month lengths', () => {
  assert.equal(getPeriodDays(1), 31);
  assert.equal(getPeriodDays(6), 31);
  assert.equal(getPeriodDays(7), 30);
  assert.equal(getPeriodDays(8), 30);
  assert.equal(getPeriodDays(11), 30);
  assert.equal(getPeriodDays(12), 29);
});

test('digit conversion and money formatting work accurately', () => {
  assert.equal(toPersianDigits('1405-08'), '۱۴۰۵-۰۸');
  assert.equal(toEnglishDigits('۰۰۱۴۵۸۹۶۳۲'), '0014589632');
  assert.equal(formatMoney(12500000, false), '12,500,000');
  assert.equal(formatMoney(12500000, true), '۱۲,۵۰۰,۰۰۰');
});

test('calculateProgressiveTax computes zero below exemption and slices brackets accurately', () => {
  const brackets = DEFAULT_PAYROLL_SETTINGS.taxBrackets;
  // Bracket 1: 0..12M @ 0%
  assert.equal(calculateProgressiveTax(10_000_000, brackets), 0);
  assert.equal(calculateProgressiveTax(12_000_000, brackets), 0);

  // 15M => 3M * 10% = 300,000
  assert.equal(calculateProgressiveTax(15_000_000, brackets), 300_000);

  // 20M => (16.5M - 12M)*10% + (20M - 16.5M)*15% = 450,000 + 525,000 = 975,000
  assert.equal(calculateProgressiveTax(20_000_000, brackets), 975_000);

  // 45M => 450,000 + (27-16.5)*0.15 (1,575,000) + (40-27)*0.20 (2,600,000) + (45-40)*0.30 (1,500,000) = 6,125,000
  assert.equal(calculateProgressiveTax(45_000_000, brackets), 6_125_000);
});

test('calculateLoanDeductionForPeriod respects active status, startPeriod, and remaining balance', () => {
  const loans: Loan[] = [
    {
      id: 'l1',
      employeeId: 'e1',
      title: 'Loan 1',
      totalAmount: 10_000_000,
      monthlyInstallment: 3_000_000,
      remainingBalance: 2_000_000, // less than installment -> capped at 2M
      startPeriod: '1405-06',
      status: 'active',
      createdAt: '1405/06/01',
    },
    {
      id: 'l2',
      employeeId: 'e1',
      title: 'Paused Loan',
      totalAmount: 5_000_000,
      monthlyInstallment: 1_000_000,
      remainingBalance: 5_000_000,
      startPeriod: '1405-06',
      status: 'paused',
      createdAt: '1405/06/01',
    },
    {
      id: 'l3',
      employeeId: 'e1',
      title: 'Future Loan',
      totalAmount: 5_000_000,
      monthlyInstallment: 1_000_000,
      remainingBalance: 5_000_000,
      startPeriod: '1405-09',
      status: 'active',
      createdAt: '1405/08/01',
    },
  ];

  const res = calculateLoanDeductionForPeriod(loans, 'e1', '1405-08');
  assert.equal(res.deduction, 2_000_000);
  assert.equal(res.remainingAfter, 0);
});

test('calculateEmployeePayslip computes full payslip accurately with insurance ceiling and overtime', () => {
  const employee: Employee = {
    id: 'emp-test',
    personnelCode: '2001',
    fullName: 'تست کارمند',
    nationalId: '0011223344',
    department: 'مالی',
    jobTitle: 'حسابدار',
    workLocation: 'ستاد مرکزی',
    mobileNumber: '09121112233',
    workPhone: '021-88001122',
    employmentType: 'employed',
    baseMonthlySalary: 22_000_000,
    maritalStatus: 'married',
    childrenCount: 2,
    bankName: 'بانک ملی ایران',
    bankAccount: 'IR0000',
    hireDate: '1402/01/01',
    isActive: true,
  };

  const timesheet: MonthlyTimesheet = {
    id: 'emp-test__1405-08',
    employeeId: 'emp-test',
    periodKey: '1405-08',
    workingDays: 30,
    overtimeHours: 10,
    holidayHours: 0,
    nightShiftHours: 0,
    absentDays: 0,
    missionAllowance: 1_000_000,
    bonus: 0,
    otherAllowances: 0,
    advancePayment: 500_000,
    otherDeductions: 0,
    note: '',
  };

  const settings = {
    ...DEFAULT_PAYROLL_SETTINGS,
    insuranceSalaryCeiling: 20_000_000,
  };

  const slip = calculateEmployeePayslip(employee, timesheet, [], settings, '1405-08');

  // Hourly rate: 22,000,000 / 220 = 100,000 -> 10h * 1.4 = 1,400,000
  assert.equal(slip.overtimePay, 1_400_000);
  assert.equal(slip.baseSalaryEarned, 22_000_000);
  assert.equal(slip.housingEarned, 900_000);
  assert.equal(slip.foodEarned, 1_400_000);
  assert.equal(slip.maritalEarned, 500_000);
  assert.equal(slip.childEarned, 716_618 * 2);

  // Insurance capped at 20,000,000 => 7% = 1,400,000, 23% = 4,600,000
  assert.equal(slip.insurableSalary, 20_000_000);
  assert.equal(slip.employeeInsurance, 1_400_000);
  assert.equal(slip.employerInsurance, 4_600_000);

  // Net payable = gross - employeeInsurance - incomeTax - advancePayment
  assert.equal(
    slip.netPayable,
    slip.grossSalary - slip.employeeInsurance - slip.incomeTax - 500_000
  );
  assert.equal(slip.totalEmployerCost, slip.grossSalary + slip.employerInsurance);
});

test('calculatePayrollReport aggregates seed employees and exports UTF-8 BOM CSV', () => {
  const report = calculatePayrollReport(
    INITIAL_SEED_STATE.employees,
    INITIAL_SEED_STATE.timesheets,
    INITIAL_SEED_STATE.loans,
    INITIAL_SEED_STATE.settings,
    '1405-08'
  );

  assert.equal(report.totals.employeeCount, 5);
  assert.ok(report.totals.grossTotal > 0);
  assert.ok(report.totals.netPayableTotal < report.totals.grossTotal);
  assert.equal(report.totals.loanDeductionTotal, 2_500_000 + 1_500_000);
  assert.ok(report.departmentBreakdown.length >= 3);

  const csv = generatePayrollCsv(report, INITIAL_SEED_STATE.settings);
  assert.ok(csv.startsWith('\uFEFF'));
  assert.ok(csv.includes('امیرحسین رضایی'));
  assert.ok(csv.includes('شماره موبایل'));
  assert.ok(csv.includes('تلفن محل کار'));
  assert.ok(csv.includes(INITIAL_SEED_STATE.employees[0].mobileNumber));
  assert.ok(csv.includes(INITIAL_SEED_STATE.employees[0].workPhone));
});

test('detectBankFromSheba, IRANIAN_BANKS (including صندوق جام جم), and parseNumericInput work properly', () => {
  assert.ok(IRANIAN_BANKS.includes('صندوق جام جم'));
  assert.equal(detectBankFromSheba('IR450170000000102548963214'), 'بانک ملی ایران');
  assert.equal(detectBankFromSheba('ir120120000000458712369852'), 'بانک ملت');
  assert.equal(detectBankFromSheba('IR880190000000332145698741'), 'بانک صادرات');
  assert.equal(detectBankFromSheba('123456789'), null);

  assert.equal(parseNumericInput('۲۸,۰۰۰,۰۰۰'), 28_000_000);
  assert.equal(parseNumericInput('18500000'), 18_500_000);
  assert.equal(parseNumericInput(''), 0);
});

test('retired employees are exempt from social security insurance deductions', () => {
  const retiredEmp: Employee = {
    id: 'emp-ret',
    personnelCode: '3001',
    fullName: 'کارمند بازنشسته',
    nationalId: '0011223355',
    department: 'فنی',
    jobTitle: 'مشاور',
    workLocation: 'شعبه شرق',
    mobileNumber: '09123334455',
    workPhone: '021-77001122',
    employmentType: 'retired',
    baseMonthlySalary: 20_000_000,
    maritalStatus: 'married',
    childrenCount: 0,
    bankName: 'بانک سپه',
    bankAccount: '',
    hireDate: '1405/01/01',
    isActive: true,
  };

  const slip = calculateEmployeePayslip(
    retiredEmp,
    undefined,
    [],
    DEFAULT_PAYROLL_SETTINGS,
    '1405-08'
  );

  assert.equal(slip.insurableSalary, 0);
  assert.equal(slip.employeeInsurance, 0);
  assert.equal(slip.employerInsurance, 0);
  assert.ok(slip.incomeTax > 0);
});

test('validation rejects invalid national IDs, duplicate personnel codes, and invalid loan amounts', () => {
  const empErrors = validateEmployeeInput(
    {
      personnelCode: '1001', // duplicate with seed emp-1
      fullName: '',
      nationalId: '1234',
      department: 'فنی',
      jobTitle: 'مهندس',
      workLocation: 'ستاد مرکزی',
      mobileNumber: '',
      workPhone: '',
      employmentType: 'article-28',
      baseMonthlySalary: 0,
      maritalStatus: 'single',
      childrenCount: -1,
      bankName: 'بانک ملی ایران',
      bankAccount: '',
      hireDate: '',
      isActive: true,
    },
    INITIAL_SEED_STATE.employees
  );

  assert.ok(empErrors.fullName);
  assert.ok(empErrors.personnelCode);
  assert.ok(empErrors.nationalId);
  assert.ok(empErrors.baseMonthlySalary);
  assert.ok(empErrors.childrenCount);

  const loanErrors = validateLoanInput({
    employeeId: '',
    title: '',
    totalAmount: 1_000_000,
    monthlyInstallment: 2_000_000,
    remainingBalance: 1_500_000,
  });

  assert.ok(loanErrors.employeeId);
  assert.ok(loanErrors.title);
  assert.ok(loanErrors.monthlyInstallment);
  assert.ok(loanErrors.remainingBalance);
});

test('authenticateUser and isAdminUser enforce admin vs viewer roles and active status', () => {
  const adminRes = authenticateUser(INITIAL_USERS, 'admin', '1234');
  assert.ok(adminRes.user);
  assert.equal(isAdminUser(adminRes.user), true);

  const viewerRes = authenticateUser(INITIAL_USERS, 'user2', '1234');
  assert.ok(viewerRes.user);
  assert.equal(isAdminUser(viewerRes.user), false);

  const badPass = authenticateUser(INITIAL_USERS, 'admin', 'wrong');
  assert.equal(badPass.user, null);
  assert.ok(badPass.error);

  const inactiveRes = authenticateUser(
    [{ ...INITIAL_USERS[1], isActive: false }],
    'user2',
    '1234'
  );
  assert.equal(inactiveRes.user, null);
  assert.ok(inactiveRes.error);
});

test('validateSystemUserInput rejects duplicate usernames and short passwords', () => {
  const errs = validateSystemUserInput(
    {
      fullName: '',
      username: 'admin',
      password: '12',
      role: 'viewer',
      isActive: true,
    },
    INITIAL_USERS
  );
  assert.ok(errs.fullName);
  assert.ok(errs.username);
  assert.ok(errs.password);

  const validErrs = validateSystemUserInput(
    {
      fullName: 'حسابدار دوم',
      username: 'ali.acc',
      password: '1234',
      role: 'viewer',
      isActive: true,
    },
    INITIAL_USERS
  );
  assert.deepEqual(validErrs, {});
});

test('applyManualSalaryUpdates updates employee base salaries from Persian/English numeric drafts', () => {
  const updated = applyManualSalaryUpdates(INITIAL_SEED_STATE.employees, {
    'emp-1': '۳۱,۵۰۰,۰۰۰',
    'emp-2': 26000000,
    'emp-3': '0', // invalid zero ignored
  });
  assert.equal(updated[0].baseMonthlySalary, 31_500_000);
  assert.equal(updated[1].baseMonthlySalary, 26_000_000);
  assert.equal(updated[2].baseMonthlySalary, INITIAL_SEED_STATE.employees[2].baseMonthlySalary);
});

test('5-tier manual salaries normalize, sum, and update baseMonthlySalary accurately', () => {
  assert.equal(SALARY_TIER_LABELS.length, 5);
  assert.deepEqual(normalizeManualSalaries(undefined, 18_000_000), [
    18_000_000,
    0,
    0,
    0,
    0,
  ]);
  assert.deepEqual(normalizeManualSalaries([10_000_000, 5_000_000], 18_000_000), [
    10_000_000,
    5_000_000,
    0,
    0,
    0,
  ]);
  assert.equal(
    sumManualSalaries([10_000_000, 5_000_000, 3_000_000, 2_000_000, 1_000_000]),
    21_000_000
  );

  const updated = applyMultiTierManualSalaryUpdates(INITIAL_SEED_STATE.employees, {
    'emp-1': ['10,000,000', '۵,۰۰۰,۰۰۰', '3000000', '2000000', 1_000_000],
    'emp-2': ['0', '0', '0', '0', '0'], // zero total ignored
  });

  assert.equal(updated[0].baseMonthlySalary, 21_000_000);
  assert.deepEqual(updated[0].manualSalaries, [
    10_000_000,
    5_000_000,
    3_000_000,
    2_000_000,
    1_000_000,
  ]);
  assert.equal(
    updated[1].baseMonthlySalary,
    INITIAL_SEED_STATE.employees[1].baseMonthlySalary
  );

  const slip = calculateEmployeePayslip(
    updated[0],
    INITIAL_SEED_STATE.timesheets[0],
    [],
    DEFAULT_PAYROLL_SETTINGS,
    '1405-08'
  );
  assert.equal(slip.baseSalaryEarned, 21_000_000);
});

test('manual salary payments support validation, additional mode, and override mode', () => {
  assert.ok(MANUAL_SALARY_MODE_LABELS.additional);
  assert.ok(MANUAL_SALARY_MODE_LABELS.override);

  const invalid = validateManualSalaryPaymentInput({
    employeeId: '',
    amount: 0,
    paymentDate: '',
  });
  assert.ok(invalid.employeeId);
  assert.ok(invalid.amount);
  assert.ok(invalid.paymentDate);

  const baseEmp = INITIAL_SEED_STATE.employees[1]; // مریم کاظمی
  const ts = INITIAL_SEED_STATE.timesheets[1];
  const baseline = calculateEmployeePayslip(
    baseEmp,
    ts,
    [],
    DEFAULT_PAYROLL_SETTINGS,
    '1405-08'
  );

  const additionalPayment: ManualSalaryPayment = {
    id: 'mp-1',
    employeeId: baseEmp.id,
    periodKey: '1405-08',
    amount: 5_000_000,
    mode: 'additional',
    paymentDate: '1405/08/25',
    description: 'حقوق دستی کارشناسی',
    referenceCode: '123456',
    createdAt: '1405/08/25',
  };

  const withAdditional = calculateEmployeePayslip(
    baseEmp,
    ts,
    [],
    DEFAULT_PAYROLL_SETTINGS,
    '1405-08',
    [additionalPayment]
  );
  assert.equal(withAdditional.isManualOverride, false);
  assert.equal(withAdditional.manualAdditionalPay, 5_000_000);
  assert.equal(withAdditional.netPayable, baseline.netPayable + 5_000_000);

  const overridePayment: ManualSalaryPayment = {
    id: 'mp-2',
    employeeId: INITIAL_SEED_STATE.employees[2].id, // علیرضا شریفی
    periodKey: '1405-08',
    amount: 25_000_000,
    mode: 'override',
    paymentDate: '1405/08/25',
    description: 'حقوق دستی توافقی آبان',
    referenceCode: '998877',
    createdAt: '1405/08/25',
  };

  const withOverride = calculateEmployeePayslip(
    INITIAL_SEED_STATE.employees[2],
    INITIAL_SEED_STATE.timesheets[2],
    INITIAL_SEED_STATE.loans,
    DEFAULT_PAYROLL_SETTINGS,
    '1405-08',
    [overridePayment]
  );
  assert.equal(withOverride.isManualOverride, true);
  assert.equal(withOverride.manualOverrideAmount, 25_000_000);
  assert.equal(withOverride.netPayable, 25_000_000);
  assert.equal(withOverride.employeeInsurance, 0);
  assert.equal(withOverride.incomeTax, 0);

  const report = calculatePayrollReport(
    INITIAL_SEED_STATE.employees,
    INITIAL_SEED_STATE.timesheets,
    INITIAL_SEED_STATE.loans,
    DEFAULT_PAYROLL_SETTINGS,
    '1405-08',
    false,
    [additionalPayment, overridePayment]
  );
  const emp2Slip = report.payslips.find((p) => p.employee.id === baseEmp.id);
  const emp3Slip = report.payslips.find((p) => p.employee.id === INITIAL_SEED_STATE.employees[2].id);
  assert.equal(emp2Slip?.manualAdditionalPay, 5_000_000);
  assert.equal(emp3Slip?.netPayable, 25_000_000);
});

test('sherkati-soroush divides enteredSalary by baseMonthlySalary to derive dailyWage and working days', () => {
  assert.equal(EMPLOYMENT_TYPE_LABELS['sherkati-soroush'], 'شرکتی سروش');

  // Base monthly salary 15,000,000 over 30 days => daily wage = 500,000
  // Entered salary 10,000,000 => ratio 2/3 => 20 worked days
  const derived = calculateSoroushWorkDerivation(15_000_000, 10_000_000, 30);
  assert.equal(derived.dailyWage, 500_000);
  assert.equal(derived.usedEnteredSalary, true);
  assert.equal(derived.derivedWorkingDays, 20);

  const soroushEmp: Employee = {
    id: 'emp-soroush',
    personnelCode: '4001',
    fullName: 'کارمند شرکتی سروش',
    nationalId: '0099887766',
    department: 'عملیات',
    jobTitle: 'نیروی شرکتی',
    workLocation: 'ساختمان مرکزی',
    mobileNumber: '09121234567',
    workPhone: '02188009900',
    employmentType: 'sherkati-soroush',
    baseMonthlySalary: 15_000_000,
    maritalStatus: 'single',
    childrenCount: 0,
    bankName: 'صندوق جام جم',
    bankAccount: '123456',
    hireDate: '1405/01/01',
    isActive: true,
  };

  const ts: MonthlyTimesheet = {
    id: 'emp-soroush__1405-08',
    employeeId: 'emp-soroush',
    periodKey: '1405-08',
    workingDays: 20,
    enteredSalary: 10_000_000,
    overtimeHours: 0,
    holidayHours: 0,
    nightShiftHours: 0,
    absentDays: 0,
    missionAllowance: 0,
    bonus: 0,
    otherAllowances: 0,
    advancePayment: 0,
    otherDeductions: 0,
    note: '',
  };

  const slip = calculateEmployeePayslip(
    soroushEmp,
    ts,
    [],
    DEFAULT_PAYROLL_SETTINGS,
    '1405-08'
  );
  assert.equal(slip.dailyWage, 500_000);
  assert.equal(slip.effectiveDays, 20);
  assert.equal(slip.baseSalaryEarned, 10_000_000);

  // Special contract allowances (housing, food, marital, child, fixed extra) prorated by 20/30
  assert.equal(slip.housingEarned, Math.round(900_000 * (20 / 30)));
  assert.equal(slip.foodEarned, Math.round(1_400_000 * (20 / 30)));
  assert.equal(slip.maritalEarned, Math.round(500_000 * (20 / 30)));
  assert.equal(slip.childEarned, Math.round(716_618 * (20 / 30)));
  assert.equal(slip.specialFixedAllowanceEarned, Math.round(500_000 * (20 / 30)));
});

test('article-28 pays housing, food, marital, child, and fixed extra allowances', () => {
  const art28Emp = INITIAL_SEED_STATE.employees[1]; // مریم کاظمی (article-28, married, 2 children)
  const ts = {
    ...INITIAL_SEED_STATE.timesheets[1],
    workingDays: 30,
    absentDays: 0,
  };
  const slip = calculateEmployeePayslip(
    art28Emp,
    ts,
    [],
    DEFAULT_PAYROLL_SETTINGS,
    '1405-08'
  );
  assert.equal(slip.housingEarned, 900_000);
  assert.equal(slip.foodEarned, 1_400_000);
  assert.equal(slip.maritalEarned, 500_000);
  assert.equal(slip.childEarned, 716_618 * 2);
  assert.equal(slip.specialFixedAllowanceEarned, 500_000);
});
