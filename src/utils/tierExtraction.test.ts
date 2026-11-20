import test from 'node:test';
import assert from 'node:assert/strict';
import { INITIAL_SEED_STATE } from '../data/seedData';
import type { ManualSalaryPayment } from '../types/payroll';
import { SALARY_TIER_LABELS } from './payroll';
import {
  extractTiersFromManualPayments,
  resolveTierIndexFromLocation,
} from './tierExtraction';

test('resolveTierIndexFromLocation maps organizational labels accurately across all 8 tiers', () => {
  assert.equal(SALARY_TIER_LABELS[0], 'تولید سیما');
  assert.equal(resolveTierIndexFromLocation('تولید سیما'), 0);
  assert.equal(resolveTierIndexFromLocation('سیما'), 0);

  assert.equal(SALARY_TIER_LABELS[1], 'تامین پخش صدا');
  assert.equal(resolveTierIndexFromLocation('تامین پخش صدا'), 1);
  assert.equal(resolveTierIndexFromLocation('معاونت صدا'), 1);

  assert.equal(SALARY_TIER_LABELS[2], 'تامین و پخش سیما');
  assert.equal(resolveTierIndexFromLocation('تامین و پخش سیما'), 2);

  assert.equal(SALARY_TIER_LABELS[3], 'تولید سیما جیم');
  assert.equal(resolveTierIndexFromLocation('تولید سیما جیم'), 3);

  assert.equal(SALARY_TIER_LABELS[4], 'متمرکز پاداش');
  assert.equal(resolveTierIndexFromLocation('متمرکز پاداش'), 4);

  assert.equal(SALARY_TIER_LABELS[5], 'تولید سیما دال');
  assert.equal(resolveTierIndexFromLocation('تولید سیما دال'), 5);

  assert.equal(SALARY_TIER_LABELS[6], 'خبر');
  assert.equal(resolveTierIndexFromLocation('خبر'), 6);
  assert.equal(resolveTierIndexFromLocation('', 'حق الزحمه خبر فوری'), 6);

  assert.equal(SALARY_TIER_LABELS[7], 'فضای مجازی');
  assert.equal(resolveTierIndexFromLocation('فضای مجازی'), 7);
});

test('extractTiersFromManualPayments distributes period manual payments into matching tier columns and updates baseMonthlySalary', () => {
  const emp1 = INITIAL_SEED_STATE.employees[0];
  const emp2 = INITIAL_SEED_STATE.employees[1];
  const emp3 = INITIAL_SEED_STATE.employees[2];

  const manualPayments: ManualSalaryPayment[] = [
    {
      id: 'p-1',
      employeeId: emp2.id,
      periodKey: '1405-08',
      amount: 12_500_000,
      mode: 'additional',
      paymentDate: '1405/08/25',
      description: 'پوشش خبر',
      referenceCode: '101',
      unitType: 'خبر',
      createdAt: '1405/08/25',
    },
    {
      id: 'p-2',
      employeeId: emp2.id,
      periodKey: '1405-08',
      amount: 4_500_000,
      mode: 'additional',
      paymentDate: '1405/08/26',
      description: 'محتوای مجازی',
      referenceCode: '102',
      unitType: 'فضای مجازی',
      createdAt: '1405/08/26',
    },
    {
      id: 'p-3',
      employeeId: emp1.id,
      periodKey: '1405-08',
      amount: 18_000_000,
      mode: 'override',
      paymentDate: '1405/08/25',
      description: 'برنامه سیما جیم',
      referenceCode: '103',
      unitType: 'تولید سیما جیم',
      createdAt: '1405/08/25',
    },
    // Different period should be ignored
    {
      id: 'p-other-period',
      employeeId: emp3.id,
      periodKey: '1405-07',
      amount: 99_000_000,
      mode: 'override',
      paymentDate: '1405/07/25',
      description: 'ماه قبل',
      referenceCode: '104',
      unitType: 'خبر',
      createdAt: '1405/07/25',
    },
  ];

  const result = extractTiersFromManualPayments(
    [emp1, emp2, emp3],
    manualPayments,
    '1405-08'
  );

  assert.equal(result.extractedEmployeeCount, 2);
  assert.equal(result.paymentRecordCount, 3);

  const updatedEmp1 = result.updatedEmployees.find((e) => e.id === emp1.id)!;
  const updatedEmp2 = result.updatedEmployees.find((e) => e.id === emp2.id)!;
  const updatedEmp3 = result.updatedEmployees.find((e) => e.id === emp3.id)!;

  assert.deepEqual(updatedEmp1.manualSalaries, [0, 0, 0, 18_000_000, 0, 0, 0, 0]);
  assert.equal(updatedEmp1.baseMonthlySalary, 18_000_000);

  // emp2 receives خبر (idx 6) and فضای مجازی (idx 7)
  assert.deepEqual(updatedEmp2.manualSalaries, [
    0, 0, 0, 0, 0, 0, 12_500_000, 4_500_000,
  ]);
  assert.equal(updatedEmp2.baseMonthlySalary, 17_000_000);

  // emp3 had no 1405-08 manual payment -> untouched
  assert.equal(updatedEmp3.baseMonthlySalary, emp3.baseMonthlySalary);
  assert.equal(result.tierTotals[3], 18_000_000);
  assert.equal(result.tierTotals[6], 12_500_000);
  assert.equal(result.tierTotals[7], 4_500_000);
});

test('INITIAL_SEED_STATE has 3 male default employees in 3 distinct units matching manualPayments', () => {
  assert.equal(INITIAL_SEED_STATE.employees.length, 3);
  const departments = new Set(INITIAL_SEED_STATE.employees.map((e) => e.department));
  const workLocations = new Set(INITIAL_SEED_STATE.employees.map((e) => e.workLocation));
  assert.equal(departments.size, 3);
  assert.equal(workLocations.size, 3);
  assert.deepEqual(
    INITIAL_SEED_STATE.employees.map((e) => e.fullName),
    ['امیرحسین رضایی', 'محمدمهدی کریمی', 'علیرضا شریفی']
  );

  // Manual payments database matches the 8-tier matrix out of the box
  const synced = extractTiersFromManualPayments(
    INITIAL_SEED_STATE.employees,
    INITIAL_SEED_STATE.manualPayments ?? [],
    '1405-08'
  );
  assert.equal(synced.extractedEmployeeCount, 3);
  assert.deepEqual(
    synced.updatedEmployees.map((e) => e.manualSalaries),
    INITIAL_SEED_STATE.employees.map((e) => e.manualSalaries)
  );
});

test('syncEmployeesTiersFromManualPayments updates tiers on add and resets cleared employees on delete', async () => {
  const { syncEmployeesTiersFromManualPayments } = await import('./tierExtraction');
  const { isLegacySeedDataset } = await import('./storage');

  assert.equal(isLegacySeedDataset(INITIAL_SEED_STATE), false);
  assert.equal(
    isLegacySeedDataset({
      employees: [
        ...INITIAL_SEED_STATE.employees,
        { ...INITIAL_SEED_STATE.employees[0], id: 'emp-4', fullName: 'زهرا ناصری' },
      ],
    }),
    true
  );

  const baseEmployees = INITIAL_SEED_STATE.employees;
  const basePayments = INITIAL_SEED_STATE.manualPayments ?? [];

  // 1. Add a new manual payment in تولید سیما جیم (tier 3) for emp-3
  const addedPayment: ManualSalaryPayment = {
    id: 'mp-live-1',
    employeeId: 'emp-3',
    periodKey: '1405-08',
    amount: 5_000_000,
    mode: 'additional',
    paymentDate: '1405/08/27',
    description: 'برنامه جیم',
    referenceCode: '9001',
    unitType: 'تولید سیما جیم',
    workLocation: 'تولید سیما جیم',
    createdAt: '۱۴۰۵/۰۸/۲۷',
  };
  const afterAdd = syncEmployeesTiersFromManualPayments(
    baseEmployees,
    [...basePayments, addedPayment],
    '1405-08'
  );
  const emp3AfterAdd = afterAdd.find((e) => e.id === 'emp-3')!;
  // emp-3 now has 5M in tier 3 (تولید سیما جیم) + 22M seed in tier 6 (خبر)
  assert.deepEqual(emp3AfterAdd.manualSalaries, [0, 0, 0, 5_000_000, 0, 0, 22_000_000, 0]);
  assert.equal(emp3AfterAdd.baseMonthlySalary, 27_000_000);

  // 2. Delete all 1405-08 payments for emp-3 -> clears tiers to 0
  const remainingPayments = basePayments.filter((p) => p.employeeId !== 'emp-3');
  const afterClear = syncEmployeesTiersFromManualPayments(
    afterAdd,
    remainingPayments,
    '1405-08',
    ['emp-3']
  );
  const emp3AfterClear = afterClear.find((e) => e.id === 'emp-3')!;
  assert.deepEqual(emp3AfterClear.manualSalaries, [0, 0, 0, 0, 0, 0, 0, 0]);
  assert.equal(emp3AfterClear.baseMonthlySalary, 0);
});

test('extractTiersFromManualPayments merges matching 8-tier معاونت and isolates distinct معاونت into customTierAmounts', async () => {
  const {
    collectCustomTierLabels,
    resolveStrictTierIndexFromLocation,
  } = await import('./tierExtraction');

  assert.equal(resolveStrictTierIndexFromLocation('خبر'), 6);
  assert.equal(resolveStrictTierIndexFromLocation('تولید سیما'), 0);
  assert.equal(resolveStrictTierIndexFromLocation('معاونت مالی و اداری'), null);
  assert.equal(resolveStrictTierIndexFromLocation('فناوری اطلاعات'), null);

  const newEmp = {
    ...INITIAL_SEED_STATE.employees[0],
    id: 'emp-new-finance',
    personnelCode: '1004',
    fullName: 'حسین احمدی',
    department: 'معاونت مالی و اداری',
    workLocation: 'معاونت مالی و اداری',
    baseMonthlySalary: 0,
    manualSalaries: [0, 0, 0, 0, 0, 0, 0, 0] as [
      number,
      number,
      number,
      number,
      number,
      number,
      number,
      number,
    ],
  };

  const payments: ManualSalaryPayment[] = [
    {
      id: 'p-match-sima',
      employeeId: newEmp.id,
      periodKey: '1405-08',
      amount: 7_500_000,
      mode: 'additional',
      paymentDate: '1405/08/25',
      description: 'همکاری تولید سیما',
      referenceCode: '',
      unitType: 'تولید سیما',
      workLocation: 'تولید سیما',
      createdAt: '1405/08/25',
    },
    {
      id: 'p-separate-finance',
      employeeId: newEmp.id,
      periodKey: '1405-08',
      amount: 16_000_000,
      mode: 'additional',
      paymentDate: '1405/08/25',
      description: 'حقوق معاونت مالی',
      referenceCode: '',
      unitType: 'معاونت مالی و اداری',
      workLocation: 'معاونت مالی و اداری',
      createdAt: '1405/08/25',
    },
  ];

  const customLabels = collectCustomTierLabels([newEmp], payments, '1405-08');
  assert.deepEqual(customLabels, ['معاونت مالی و اداری']);

  const result = extractTiersFromManualPayments([newEmp], payments, '1405-08');
  assert.equal(result.extractedEmployeeCount, 1);
  assert.equal(result.paymentRecordCount, 2);

  const updated = result.updatedEmployees[0];
  // تولید سیما goes to tier 0, while معاونت مالی و اداری stays separate in customTierAmounts
  assert.deepEqual(updated.manualSalaries, [7_500_000, 0, 0, 0, 0, 0, 0, 0]);
  assert.deepEqual(updated.customTierAmounts, { 'معاونت مالی و اداری': 16_000_000 });
  assert.equal(updated.baseMonthlySalary, 23_500_000);
  assert.equal(result.tierTotals[0], 7_500_000);
  assert.equal(result.customTierTotals['معاونت مالی و اداری'], 16_000_000);
});

