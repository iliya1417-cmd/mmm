import test from 'node:test';
import assert from 'node:assert/strict';
import type { Employee } from '../types/payroll';
import { DEFAULT_ALLOWANCE_FLAGS } from './payroll';
import {
  filterEmployees,
  matchesEmployeeNameOrCode,
  normalizePersianSearchText,
} from './employeeFilter';

const SAMPLE_EMPLOYEES: Employee[] = [
  {
    id: 'e1',
    personnelCode: '1001',
    fullName: 'امیرحسین رضایی',
    nationalId: '0014589632',
    department: 'فنی و مهندسی',
    jobTitle: 'توسعه‌دهنده',
    workLocation: 'ستاد مرکزی تهران',
    mobileNumber: '09123456789',
    workPhone: '02188776655',
    employmentType: 'employed',
    salaryCalculationMode: 'daily-divided',
    allowanceFlags: { ...DEFAULT_ALLOWANCE_FLAGS },
    baseMonthlySalary: 28_000_000,
    seniorityAllowance: 0,
    insuranceBaseCap: 0,
    manualSalaries: [28_000_000, 0, 0, 0, 0, 0, 0, 0],
    maritalStatus: 'married',
    childrenCount: 1,
    bankName: 'بانک ملی ایران',
    bankAccount: 'IR450170000000102030403214',
    hireDate: '1400/02/15',
    isActive: true,
  },
  {
    id: 'e2',
    personnelCode: '1002',
    fullName: 'مریم کاظمی',
    nationalId: '0078945612',
    department: 'مالی و حسابداری',
    jobTitle: 'حسابدار',
    workLocation: 'ستاد مرکزی تهران',
    mobileNumber: '09128765432',
    workPhone: '02188776644',
    employmentType: 'article-28',
    salaryCalculationMode: 'daily-divided',
    allowanceFlags: { ...DEFAULT_ALLOWANCE_FLAGS },
    baseMonthlySalary: 22_000_000,
    seniorityAllowance: 0,
    insuranceBaseCap: 0,
    manualSalaries: [22_000_000, 0, 0, 0, 0, 0, 0, 0],
    maritalStatus: 'single',
    childrenCount: 0,
    bankName: 'بانک ملت',
    bankAccount: 'IR120120000000203040509852',
    hireDate: '1401/05/01',
    isActive: true,
  },
  {
    id: 'e3',
    personnelCode: '1003',
    fullName: 'علیرضا شریفی',
    nationalId: '1270984512',
    department: 'فروش و بازاریابی',
    jobTitle: 'کارشناس فروش',
    workLocation: 'شعبه غرب تهران',
    mobileNumber: '09351122334',
    workPhone: '02144332211',
    employmentType: 'article-38',
    salaryCalculationMode: 'fixed',
    allowanceFlags: { ...DEFAULT_ALLOWANCE_FLAGS },
    baseMonthlySalary: 16_000_000,
    seniorityAllowance: 0,
    insuranceBaseCap: 0,
    manualSalaries: [16_000_000, 0, 0, 0, 0, 0, 0, 0],
    maritalStatus: 'single',
    childrenCount: 0,
    bankName: 'بانک صادرات',
    bankAccount: 'IR880190000000304050608741',
    hireDate: '1402/09/10',
    isActive: false,
  },
];

test('normalizePersianSearchText unifies digits, Arabic letters, and ZWNJ', () => {
  assert.equal(normalizePersianSearchText('كاظمي\u200cها ۱۰۰۲'), 'کاظمی ها 1002');
  assert.equal(normalizePersianSearchText('  امیر‌حسین   رضایی '), 'امیر حسین رضایی');
});

test('matchesEmployeeNameOrCode matches first name, last name, reverse tokens, and personnel code', () => {
  assert.equal(matchesEmployeeNameOrCode(SAMPLE_EMPLOYEES[0], 'امیرحسین'), true);
  assert.equal(matchesEmployeeNameOrCode(SAMPLE_EMPLOYEES[0], 'امیر حسین'), true);
  assert.equal(matchesEmployeeNameOrCode(SAMPLE_EMPLOYEES[0], 'رضایی'), true);
  assert.equal(matchesEmployeeNameOrCode(SAMPLE_EMPLOYEES[0], 'رضایی امیر'), true);
  assert.equal(matchesEmployeeNameOrCode(SAMPLE_EMPLOYEES[1], 'كاظمي'), true);
  assert.equal(matchesEmployeeNameOrCode(SAMPLE_EMPLOYEES[2], '۱۰۰۳'), true);
  assert.equal(matchesEmployeeNameOrCode(SAMPLE_EMPLOYEES[2], '1003'), true);
  assert.equal(matchesEmployeeNameOrCode(SAMPLE_EMPLOYEES[2], 'شریفی 1003'), true);
});

test('matchesEmployeeNameOrCode does not falsely match bank name or national ID', () => {
  assert.equal(matchesEmployeeNameOrCode(SAMPLE_EMPLOYEES[0], 'ملی'), false);
  assert.equal(matchesEmployeeNameOrCode(SAMPLE_EMPLOYEES[0], '0014589632'), false);
  assert.equal(matchesEmployeeNameOrCode(SAMPLE_EMPLOYEES[0], 'تهران'), false);
});

test('filterEmployees combines text filter with department, contract, and status filters', () => {
  assert.deepEqual(
    filterEmployees(SAMPLE_EMPLOYEES, { searchQuery: 'مریم' }).map((e) => e.id),
    ['e2']
  );

  assert.deepEqual(
    filterEmployees(SAMPLE_EMPLOYEES, {
      searchQuery: '100',
      statusFilter: 'active',
    }).map((e) => e.id),
    ['e1', 'e2']
  );

  assert.deepEqual(
    filterEmployees(SAMPLE_EMPLOYEES, {
      searchQuery: 'شریفی',
      statusFilter: 'inactive',
    }).map((e) => e.id),
    ['e3']
  );

  assert.deepEqual(
    filterEmployees(SAMPLE_EMPLOYEES, {
      searchQuery: 'شریفی',
      statusFilter: 'active',
    }),
    []
  );
});

test('filterEmployees supports selectedDepartments and selectedContracts multi-select arrays', () => {
  assert.deepEqual(
    filterEmployees(SAMPLE_EMPLOYEES, {
      selectedDepartments: ['فنی و مهندسی', 'فروش و بازاریابی'],
      selectedContracts: ['employed', 'article-38'],
    }).map((e) => e.id),
    ['e1', 'e3']
  );

  // Unchecking all contracts or departments yields empty list
  assert.deepEqual(
    filterEmployees(SAMPLE_EMPLOYEES, {
      selectedContracts: [],
    }),
    []
  );
  assert.deepEqual(
    filterEmployees(SAMPLE_EMPLOYEES, {
      selectedDepartments: [],
    }),
    []
  );
});
