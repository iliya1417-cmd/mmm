import test from 'node:test';
import assert from 'node:assert/strict';
import { INITIAL_SEED_STATE } from '../data/seedData';
import {
  buildManualSalaryDetailedXlsx,
  buildRtlThreeColumnXlsx,
  buildSalaryTiersTableXlsx,
} from './xlsxExport';
import {
  importManualSalary2FromRows,
  importManualTiersFromRows,
  importPayrollAmountsFromRows,
  parseCsvRows,
  parseXlsxWorkbookRows,
} from './xlsxImport';

test('table-format 8-tier XLSX exports and imports back round-trip accurately', async () => {
  const bytes = buildSalaryTiersTableXlsx(INITIAL_SEED_STATE.employees, {
    [INITIAL_SEED_STATE.employees[0].id]: [
      12_000_000,
      3_000_000,
      1_500_000,
      500_000,
      0,
      0,
      0,
      1_000_000,
    ],
  });

  const rows = await parseXlsxWorkbookRows(bytes);
  assert.ok(rows.length >= INITIAL_SEED_STATE.employees.length + 1);
  assert.equal(rows[0][0], 'کد پرسنلی');

  const result = importManualTiersFromRows(rows, INITIAL_SEED_STATE.employees);
  assert.equal(result.formatDetected, 'table-8-tiers');
  assert.equal(result.matchedEmployeeCount, INITIAL_SEED_STATE.employees.length);
  assert.equal(result.updatedEmployees[0].baseMonthlySalary, 18_000_000);
  assert.deepEqual(result.updatedEmployees[0].manualSalaries, [
    12_000_000,
    3_000_000,
    1_500_000,
    500_000,
    0,
    0,
    0,
    1_000_000,
  ]);
});

test('three-column XLSX and CSV import maps tiers and monthly payroll amounts', async () => {
  const bytes = buildRtlThreeColumnXlsx(
    [
      { code: '1001', title: 'امیرحسین رضایی - تولید سیما', amount: 15_000_000 },
      { code: '1001-1', title: 'امیرحسین رضایی - فضای مجازی', amount: 5_000_000 },
    ],
    { includeHeaderRow: false }
  );

  const rows = await parseXlsxWorkbookRows(bytes);
  const tierRes = importManualTiersFromRows(rows, INITIAL_SEED_STATE.employees);
  assert.equal(tierRes.formatDetected, 'three-column');
  assert.equal(tierRes.matchedEmployeeCount, 1);
  assert.equal(tierRes.updatedEmployees[0].baseMonthlySalary, 20_000_000);
  assert.equal(tierRes.updatedEmployees[0].manualSalaries?.[0], 15_000_000);
  assert.equal(tierRes.updatedEmployees[0].manualSalaries?.[7], 5_000_000);

  const csvRows = parseCsvRows(
    '\uFEFFکد پرسنلی,نام کارمند,مبلغ پرداختی,کارکرد\n1002,محمدمهدی کریمی,22500000,25'
  );
  const manualRes = importPayrollAmountsFromRows(
    csvRows,
    INITIAL_SEED_STATE.employees,
    INITIAL_SEED_STATE.timesheets,
    '1405-08',
    'manual-payments'
  );
  assert.equal(manualRes.matchedCount, 1);
  assert.equal(manualRes.manualPaymentsToAdd[0].employeeId, 'emp-2');
  assert.equal(manualRes.manualPaymentsToAdd[0].amount, 22_500_000);

  const tsRes = importPayrollAmountsFromRows(
    csvRows,
    INITIAL_SEED_STATE.employees,
    INITIAL_SEED_STATE.timesheets,
    '1405-08',
    'timesheet-entered-salary'
  );
  assert.equal(tsRes.matchedCount, 1);
  assert.equal(tsRes.timesheetsToUpsert[0].enteredSalary, 22_500_000);
  assert.equal(tsRes.timesheetsToUpsert[0].workingDays, 25);
});

test('imports manual payments and ManualSalary2 rows by ردیف | نام خانوادگی | مبلغ | محل خدمت (headered & headerless)', () => {
  const headeredCsv = parseCsvRows(
    'ردیف,نام خانوادگی,مبلغ,محل خدمت\n1,کریمی,16500000,سیما\n2,شریفی,12000000,خبر'
  );
  const headeredRes = importPayrollAmountsFromRows(
    headeredCsv,
    INITIAL_SEED_STATE.employees,
    [],
    '1405-08',
    'manual-payments'
  );
  assert.equal(headeredRes.matchedCount, 2);
  assert.equal(headeredRes.manualPaymentsToAdd[0].employeeId, 'emp-2');
  assert.equal(headeredRes.manualPaymentsToAdd[0].amount, 16_500_000);
  assert.equal(headeredRes.manualPaymentsToAdd[0].workLocation, 'سیما');
  assert.equal(headeredRes.manualPaymentsToAdd[0].unitType, 'سیما');
  assert.equal(headeredRes.manualPaymentsToAdd[1].employeeId, 'emp-3');
  assert.equal(headeredRes.manualPaymentsToAdd[1].workLocation, 'خبر');

  const headerlessRows = [
    ['1', 'رضایی', '19000000', 'معاونت'],
    ['2', 'شریفی', '11000000', 'رادیو'],
  ];
  const ms2Res = importManualSalary2FromRows(
    headerlessRows,
    INITIAL_SEED_STATE.employees,
    'override'
  );
  assert.equal(ms2Res.matchedCount, 2);
  assert.equal(ms2Res.matchedRows[0].employeeId, 'emp-1');
  assert.equal(ms2Res.matchedRows[0].amount, 19_000_000);
  assert.equal(ms2Res.matchedRows[0].unitType, 'معاونت');
  assert.equal(ms2Res.matchedRows[1].employeeId, 'emp-3');
  assert.equal(ms2Res.matchedRows[1].unitType, 'رادیو');
});

test('14-column detailed Excel export round-trips cleanly back through importManualSalary2FromRows', async () => {
  const bytes = buildManualSalaryDetailedXlsx([
    {
      firstName: 'محمدمهدی',
      lastName: 'کریمی',
      contractClause: 'ماده ۲۸',
      nationalIdOrPassport: '0023456789',
      jobTitle: 'کارشناس تامین و پخش صدا',
      hazardPay: 900_000,
      nonCalloutPay: 400_000,
      totalPaid: 21_000_000,
      hireDate: '1400/02/01',
      terminationDate: '',
      description: 'شرح آزمایشی',
      secondSalaryBonus: 1_500_000,
      deduction1: 250_000,
      commuteAllowance: 850_000,
    },
  ]);

  const rows = await parseXlsxWorkbookRows(bytes);
  const res = importManualSalary2FromRows(
    rows,
    INITIAL_SEED_STATE.employees,
    'additional'
  );
  assert.equal(res.matchedCount, 1);
  assert.equal(res.matchedRows[0].employeeId, 'emp-2');
  assert.equal(res.matchedRows[0].amount, 21_000_000);
  assert.equal(res.matchedRows[0].hazardPay, 900_000);
  assert.equal(res.matchedRows[0].nonCalloutPay, 400_000);
  assert.equal(res.matchedRows[0].secondSalaryBonus, 1_500_000);
  assert.equal(res.matchedRows[0].deduction1, 250_000);
  assert.equal(res.matchedRows[0].commuteAllowance, 850_000);
});

test('buildEmployeesXlsx and importEmployeesFromRows round-trip existing updates and create new employees', async () => {
  const { buildEmployeesXlsx } = await import('./xlsxExport');
  const { importEmployeesFromRows } = await import('./xlsxImport');

  const bytes = buildEmployeesXlsx(INITIAL_SEED_STATE.employees);
  const parsed = await parseXlsxWorkbookRows(bytes);
  assert.equal(parsed[0][0], 'کد پرسنلی');
  assert.ok(parsed[0].includes('نام و نام خانوادگی'));
  assert.ok(parsed[0].includes('حقوق پایه'));

  // Modify row 1 base salary and append a brand-new employee row
  const modifiedRows = parsed.map((r) => [...r]);
  const salaryColIdx = modifiedRows[0].indexOf('حقوق پایه');
  modifiedRows[1][salaryColIdx] = '31000000';

  const newRow = [...modifiedRows[1]];
  newRow[modifiedRows[0].indexOf('کد پرسنلی')] = '1099';
  newRow[modifiedRows[0].indexOf('نام و نام خانوادگی')] = 'سعید محمدی';
  newRow[modifiedRows[0].indexOf('کد ملی')] = '0099887766';
  newRow[modifiedRows[0].indexOf('دپارتمان / واحد')] = 'معاونت مالی';
  newRow[modifiedRows[0].indexOf('محل خدمت')] = 'معاونت مالی';
  newRow[salaryColIdx] = '19500000';

  // Insert before totals row
  const insertAt = modifiedRows.findIndex((r) => r[0] === 'جمع کل');
  modifiedRows.splice(insertAt > 0 ? insertAt : modifiedRows.length, 0, newRow);

  const res = importEmployeesFromRows(modifiedRows, INITIAL_SEED_STATE.employees);
  assert.equal(res.updatedCount, INITIAL_SEED_STATE.employees.length);
  assert.equal(res.createdCount, 1);

  const updatedFirst = res.updatedEmployees.find((e) => e.personnelCode === '1001')!;
  assert.equal(updatedFirst.baseMonthlySalary, 31_000_000);

  const created = res.updatedEmployees.find((e) => e.personnelCode === '1099')!;
  assert.equal(created.fullName, 'سعید محمدی');
  assert.equal(created.department, 'معاونت مالی');
  assert.equal(created.baseMonthlySalary, 19_500_000);
});

test('custom معاونت tier columns round-trip through buildSalaryTiersTableXlsx and importManualTiersFromRows', async () => {
  const empWithCustom = {
    ...INITIAL_SEED_STATE.employees[0],
    manualSalaries: [10_000_000, 0, 0, 0, 0, 0, 0, 0] as [
      number,
      number,
      number,
      number,
      number,
      number,
      number,
      number,
    ],
    customTierAmounts: { 'معاونت مالی': 14_000_000 },
    baseMonthlySalary: 24_000_000,
  };

  const bytes = buildSalaryTiersTableXlsx(
    [empWithCustom],
    undefined,
    ['معاونت مالی']
  );
  const rows = await parseXlsxWorkbookRows(bytes);
  assert.ok(rows[0].includes('معاونت مالی'));

  const imported = importManualTiersFromRows(rows, [
    { ...empWithCustom, baseMonthlySalary: 0, customTierAmounts: {} },
  ]);
  assert.equal(imported.formatDetected, 'table-8-tiers');
  assert.equal(imported.matchedEmployeeCount, 1);
  assert.equal(imported.updatedEmployees[0].manualSalaries?.[0], 10_000_000);
  assert.deepEqual(imported.updatedEmployees[0].customTierAmounts, {
    'معاونت مالی': 14_000_000,
  });
  assert.equal(imported.updatedEmployees[0].baseMonthlySalary, 24_000_000);
});


