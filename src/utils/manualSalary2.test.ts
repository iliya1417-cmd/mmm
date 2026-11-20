import test from 'node:test';
import assert from 'node:assert/strict';
import { INITIAL_SEED_STATE } from '../data/seedData';
import {
  buildManualSalary2Drafts,
  hasManualSalary2DraftChanged,
  upsertManualPaymentsForPeriod,
} from './manualSalary2';
import { buildManualSalary2TableXlsx, buildRtlThreeColumnXlsx } from './xlsxExport';
import {
  importManualSalary2FromRows,
  parseCsvRows,
  parseXlsxWorkbookRows,
} from './xlsxImport';

test('buildManualSalary2Drafts and upsertManualPaymentsForPeriod manage period payments cleanly', () => {
  const emp1 = INITIAL_SEED_STATE.employees[0];
  const emp2 = INITIAL_SEED_STATE.employees[1];

  const existing = [
    {
      id: 'mp-prev-period',
      employeeId: emp1.id,
      periodKey: '1405-07',
      amount: 11_000_000,
      mode: 'override' as const,
      paymentDate: '1405/07/25',
      description: 'مهر',
      referenceCode: '',
      createdAt: '۱۴۰۵/۰۷/۲۵',
    },
    {
      id: 'mp-curr-1',
      employeeId: emp1.id,
      periodKey: '1405-08',
      amount: 15_000_000,
      mode: 'additional' as const,
      paymentDate: '1405/08/25',
      description: 'بخش اول',
      referenceCode: '',
      createdAt: '۱۴۰۵/۰۸/۲۵',
    },
  ];

  const drafts = buildManualSalary2Drafts(
    INITIAL_SEED_STATE.employees,
    existing,
    '1405-08'
  );
  assert.equal(drafts[emp1.id].amountInput, '15000000');
  assert.equal(drafts[emp1.id].mode, 'additional');
  assert.equal(drafts[emp2.id].amountInput, '');

  assert.equal(
    hasManualSalary2DraftChanged(
      { ...drafts[emp1.id], amountInput: '20,000,000' },
      drafts[emp1.id]
    ),
    true
  );
  assert.equal(hasManualSalary2DraftChanged(drafts[emp1.id], drafts[emp1.id]), false);

  // Upsert: update emp1 to 22M override, add emp2 18M override, leave 1405-07 intact
  const next = upsertManualPaymentsForPeriod(existing, '1405-08', [
    {
      employeeId: emp1.id,
      amount: 22_000_000,
      mode: 'override',
      unitType: 'سیما',
      description: 'توافقی آبان',
    },
    {
      employeeId: emp2.id,
      amount: 18_000_000,
      mode: 'override',
      unitType: 'خبر',
      description: 'حقوق توافقی',
    },
  ]);

  // Previous period payment remains
  assert.equal(next.filter((p) => p.periodKey === '1405-07').length, 1);
  // Current period has 2 replaced entries (old 15M for emp1 was replaced, not summed!)
  const curr = next.filter((p) => p.periodKey === '1405-08');
  assert.equal(curr.length, 2);
  assert.equal(curr.find((p) => p.employeeId === emp1.id)?.amount, 22_000_000);
  assert.equal(curr.find((p) => p.employeeId === emp1.id)?.unitType, 'سیما');
  assert.equal(curr.find((p) => p.employeeId === emp2.id)?.amount, 18_000_000);
  assert.equal(curr.find((p) => p.employeeId === emp2.id)?.unitType, 'خبر');

  // Zeroing emp1 removes emp1 from current period while preserving emp2
  const cleared = upsertManualPaymentsForPeriod(next, '1405-08', [
    {
      employeeId: emp1.id,
      amount: 0,
      mode: 'override',
      description: '',
    },
  ]);
  const currAfterClear = cleared.filter((p) => p.periodKey === '1405-08');
  assert.equal(currAfterClear.length, 1);
  assert.equal(currAfterClear[0].employeeId, emp2.id);
});

test('Manual Salary 2 XLSX round-trip and 2-column / 3-column Excel imports match employees accurately', async () => {
  const emp1 = INITIAL_SEED_STATE.employees[0];
  const emp2 = INITIAL_SEED_STATE.employees[1];

  const xlsxBytes = buildManualSalary2TableXlsx(INITIAL_SEED_STATE.employees, {
    [emp1.id]: {
      amount: 27_500_000,
      mode: 'override',
      unitType: 'سیما',
      description: 'توافق آبان',
    },
    [emp2.id]: {
      amount: 4_000_000,
      mode: 'additional',
      unitType: 'معاونت',
      description: 'پاداش پروژه',
    },
  });

  const rows = await parseXlsxWorkbookRows(xlsxBytes);
  assert.equal(rows[0][0], 'کد پرسنلی');
  assert.equal(rows[0][2], 'قرارداد');
  assert.equal(rows[0][3], 'نوع استخدام');
  assert.equal(rows[0][6], 'مبلغ حقوق دستی');

  const roundTrip = importManualSalary2FromRows(
    rows,
    INITIAL_SEED_STATE.employees,
    'override'
  );
  assert.equal(roundTrip.matchedCount, 2);
  const r1 = roundTrip.matchedRows.find((r) => r.employeeId === emp1.id);
  const r2 = roundTrip.matchedRows.find((r) => r.employeeId === emp2.id);
  assert.equal(r1?.amount, 27_500_000);
  assert.equal(r1?.mode, 'override');
  assert.equal(r1?.unitType, 'سیما');
  assert.equal(r1?.description, 'توافق آبان');
  assert.equal(r2?.amount, 4_000_000);
  assert.equal(r2?.mode, 'additional');
  assert.equal(r2?.unitType, 'معاونت');
  assert.equal(r2?.description, 'پاداش پروژه');

  // Simple 2-column CSV without header (Name, Salary)
  const twoColRows = parseCsvRows(
    'امیرحسین رضایی,31000000\nمحمدمهدی کریمی,۱۹۵۰۰۰۰۰\nجمع کل,50500000'
  );
  const twoColImport = importManualSalary2FromRows(
    twoColRows,
    INITIAL_SEED_STATE.employees,
    'override'
  );
  assert.equal(twoColImport.matchedCount, 2);
  assert.equal(twoColImport.skippedCount, 0);
  assert.equal(
    twoColImport.matchedRows.find((r) => r.employeeId === emp1.id)?.amount,
    31_000_000
  );
  assert.equal(
    twoColImport.matchedRows.find((r) => r.employeeId === emp2.id)?.amount,
    19_500_000
  );

  // 3-column XLSX import
  const threeColBytes = buildRtlThreeColumnXlsx(
    [
      { code: '1003', title: 'علیرضا شریفی - حق الزحمه', amount: 12_000_000 },
      { code: '1003-1', title: 'علیرضا شریفی - اضافه‌کار توافقی', amount: 3_000_000 },
    ],
    { includeHeaderRow: false }
  );
  const threeColRows = await parseXlsxWorkbookRows(threeColBytes);
  const threeColImport = importManualSalary2FromRows(
    threeColRows,
    INITIAL_SEED_STATE.employees,
    'additional'
  );
  assert.equal(threeColImport.matchedCount, 1);
  assert.equal(threeColImport.matchedRows[0].amount, 15_000_000);
  assert.equal(threeColImport.matchedRows[0].mode, 'additional');
});
