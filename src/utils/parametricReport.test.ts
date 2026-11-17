import test from 'node:test';
import assert from 'node:assert/strict';
import { INITIAL_SEED_STATE } from '../data/seedData';
import { calculatePayrollReport, formatPeriodKey } from './payroll';
import {
  DEFAULT_PARAMETRIC_FILTERS,
  buildParametricTableData,
  filterParametricPayslips,
  resolveSelectedParametricRows,
  sortParametricPayslips,
} from './parametricReport';
import { buildParametricXlsx, colIndexToExcelLetter } from './xlsxExport';

function parseZipEntries(zipBytes: Uint8Array): Map<string, string> {
  const decoder = new TextDecoder();
  const view = new DataView(
    zipBytes.buffer,
    zipBytes.byteOffset,
    zipBytes.byteLength
  );
  const entries = new Map<string, string>();
  let offset = 0;

  while (offset + 4 <= zipBytes.length) {
    const sig = view.getUint32(offset, true);
    if (sig !== 0x04034b50) break;
    const compSize = view.getUint32(offset + 18, true);
    const nameLen = view.getUint16(offset + 26, true);
    const extraLen = view.getUint16(offset + 28, true);
    const nameStart = offset + 30;
    const dataStart = nameStart + nameLen + extraLen;
    const name = decoder.decode(zipBytes.slice(nameStart, nameStart + nameLen));
    const body = decoder.decode(zipBytes.slice(dataStart, dataStart + compSize));
    entries.set(name, body);
    offset = dataStart + compSize;
  }

  return entries;
}

test('colIndexToExcelLetter handles single and multi-letter Excel columns', () => {
  assert.equal(colIndexToExcelLetter(0), 'A');
  assert.equal(colIndexToExcelLetter(2), 'C');
  assert.equal(colIndexToExcelLetter(25), 'Z');
  assert.equal(colIndexToExcelLetter(26), 'AA');
  assert.equal(colIndexToExcelLetter(27), 'AB');
});

test('filterParametricPayslips and sortParametricPayslips filter and sort accurately', () => {
  const periodKey = formatPeriodKey(INITIAL_SEED_STATE.selectedPeriod);
  const report = calculatePayrollReport(
    INITIAL_SEED_STATE.employees,
    INITIAL_SEED_STATE.timesheets,
    INITIAL_SEED_STATE.loans,
    INITIAL_SEED_STATE.settings,
    periodKey,
    true
  );

  const byContract = filterParametricPayslips(report.payslips, {
    ...DEFAULT_PARAMETRIC_FILTERS,
    employmentType: 'retired',
    includeInactive: true,
  });
  assert.ok(byContract.length >= 1);
  assert.ok(byContract.every((s) => s.employee.employmentType === 'retired'));

  const sortedDesc = sortParametricPayslips(
    report.payslips,
    'netPayable',
    'desc'
  );
  for (let i = 1; i < sortedDesc.length; i += 1) {
    assert.ok(sortedDesc[i - 1].netPayable >= sortedDesc[i].netPayable);
  }
});

test('resolveSelectedParametricRows + buildParametricTableData builds exact rows, custom headers, and totals', () => {
  const periodKey = formatPeriodKey(INITIAL_SEED_STATE.selectedPeriod);
  const report = calculatePayrollReport(
    INITIAL_SEED_STATE.employees,
    INITIAL_SEED_STATE.timesheets,
    INITIAL_SEED_STATE.loans,
    INITIAL_SEED_STATE.settings,
    periodKey
  );

  const pickedIds = [
    report.payslips[1].employee.id,
    report.payslips[0].employee.id,
  ];
  const rowsSelected = resolveSelectedParametricRows(
    report.payslips,
    pickedIds,
    pickedIds
  );

  assert.equal(rowsSelected.length, 2);
  assert.equal(rowsSelected[0].employee.id, pickedIds[0]);
  assert.equal(rowsSelected[1].employee.id, pickedIds[1]);

  const table = buildParametricTableData(
    rowsSelected,
    [
      { fieldId: 'personnelCode', customLabel: 'کد' },
      { fieldId: 'fullName' },
      { fieldId: 'netPayable' },
    ],
    { includeRowIndex: true, includeTotalsRow: true }
  );

  assert.deepEqual(
    table.columns.map((c) => c.header),
    ['ردیف', 'کد', 'نام و نام خانوادگی', 'خالص قابل پرداخت']
  );
  assert.equal(table.rows.length, 2);
  assert.equal(table.rows[0].cells[0], 1);
  assert.equal(table.rows[1].cells[0], 2);
  assert.ok(table.totalsRow);
  const expectedNetSum =
    Math.round(rowsSelected[0].netPayable) +
    Math.round(rowsSelected[1].netPayable);
  assert.equal(table.totalsRow![3], expectedNetSum);
});

test('buildParametricXlsx generates LTR (rightToLeft="0") left-aligned OOXML workbook with all columns', () => {
  const periodKey = formatPeriodKey(INITIAL_SEED_STATE.selectedPeriod);
  const report = calculatePayrollReport(
    INITIAL_SEED_STATE.employees,
    INITIAL_SEED_STATE.timesheets,
    INITIAL_SEED_STATE.loans,
    INITIAL_SEED_STATE.settings,
    periodKey
  );

  const table = buildParametricTableData(
    report.payslips.slice(0, 2),
    [
      { fieldId: 'personnelCode' },
      { fieldId: 'fullName' },
      { fieldId: 'bankName' },
      { fieldId: 'bankAccount' },
      { fieldId: 'netPayable' },
    ],
    { includeRowIndex: false, includeTotalsRow: true }
  );

  const bytes = buildParametricXlsx(table, {
    sheetDirection: 'ltr',
    cellAlignment: 'left',
    includeHeaderRow: true,
    sheetName: 'CustomLeftReport',
  });

  const entries = parseZipEntries(bytes);
  const workbook = entries.get('xl/workbook.xml')!;
  const styles = entries.get('xl/styles.xml')!;
  const sheet1 = entries.get('xl/worksheets/sheet1.xml')!;

  assert.ok(workbook.includes('name="CustomLeftReport"'));
  assert.ok(styles.includes('horizontal="left"'));
  assert.ok(!styles.includes('horizontal="right"'));
  assert.ok(sheet1.includes('rightToLeft="0"'));
  assert.ok(sheet1.includes('<c r="A1" s="4" t="inlineStr">'));
  assert.ok(sheet1.includes('<c r="E1" s="4" t="inlineStr">'));
  assert.ok(sheet1.includes('<c r="E2" s="2" t="n">'));
  assert.ok(sheet1.includes('<c r="E4" s="6" t="n">'));
});
