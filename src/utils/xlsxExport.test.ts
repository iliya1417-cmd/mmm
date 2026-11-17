import test from 'node:test';
import assert from 'node:assert/strict';
import { INITIAL_SEED_STATE } from '../data/seedData';
import { calculatePayrollReport, formatPeriodKey } from './payroll';
import { buildRtlThreeColumnXlsx, buildThreeColumnRows } from './xlsxExport';

function parseZipEntryNamesAndBodies(zipBytes: Uint8Array): Map<string, string> {
  const decoder = new TextDecoder();
  const view = new DataView(zipBytes.buffer, zipBytes.byteOffset, zipBytes.byteLength);
  const entries = new Map<string, string>();
  let offset = 0;

  while (offset + 4 <= zipBytes.length) {
    const sig = view.getUint32(offset, true);
    if (sig !== 0x04034b50) break;
    const compression = view.getUint16(offset + 8, true);
    assert.equal(compression, 0);
    const compSize = view.getUint32(offset + 18, true);
    const uncompSize = view.getUint32(offset + 22, true);
    assert.equal(compSize, uncompSize);
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

test('buildThreeColumnRows exports net-payroll rows with code, title, and net amount', () => {
  const periodKey = formatPeriodKey(INITIAL_SEED_STATE.selectedPeriod);
  const report = calculatePayrollReport(
    INITIAL_SEED_STATE.employees,
    INITIAL_SEED_STATE.timesheets,
    INITIAL_SEED_STATE.loans,
    INITIAL_SEED_STATE.settings,
    periodKey
  );

  const rows = buildThreeColumnRows({
    source: 'net-payroll',
    report,
    employees: INITIAL_SEED_STATE.employees,
    manualPayments: [],
    periodKey,
  });

  assert.equal(rows.length, report.payslips.length);
  assert.equal(rows[0].code, '1001');
  assert.equal(rows[0].title, report.payslips[0].employee.fullName);
  assert.equal(rows[0].amount, Math.round(report.payslips[0].netPayable));
});

test('buildThreeColumnRows exports salary-tiers-breakdown with code, code-1 subcodes', () => {
  const periodKey = formatPeriodKey(INITIAL_SEED_STATE.selectedPeriod);
  const emp = {
    ...INITIAL_SEED_STATE.employees[0],
    personnelCode: 'D4-102',
    fullName: 'علیرضا شریفی',
    manualSalaries: [6_417_600, 7_131_600, 0, 0, 0] as [
      number,
      number,
      number,
      number,
      number,
    ],
    baseMonthlySalary: 13_549_200,
  };
  const report = calculatePayrollReport(
    [emp],
    INITIAL_SEED_STATE.timesheets,
    INITIAL_SEED_STATE.loans,
    INITIAL_SEED_STATE.settings,
    periodKey
  );

  const rows = buildThreeColumnRows({
    source: 'salary-tiers-breakdown',
    report,
    employees: [emp],
    manualPayments: [],
    periodKey,
  });

  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0], {
    code: 'D4-102',
    title: 'علیرضا شریفی - حقوق اول',
    amount: 6_417_600,
  });
  assert.deepEqual(rows[1], {
    code: 'D4-102-1',
    title: 'علیرضا شریفی - حقوق دوم',
    amount: 7_131_600,
  });
});

test('buildRtlThreeColumnXlsx produces valid OOXML Sheet1 with RTL view, Calibri 11, and #,##0 format', () => {
  const bytes = buildRtlThreeColumnXlsx(
    [
      { code: 'D4-102', title: 'کشیدن دندان قدامی شیری', amount: 6417600 },
      { code: 'D4-102-1', title: 'کشیدن دندان قدامی شیری تخصصی', amount: 7131600 },
    ],
    { includeHeaderRow: false }
  );

  const entries = parseZipEntryNamesAndBodies(bytes);
  assert.ok(entries.has('[Content_Types].xml'));
  assert.ok(entries.has('_rels/.rels'));
  assert.ok(entries.has('xl/workbook.xml'));
  assert.ok(entries.has('xl/_rels/workbook.xml.rels'));
  assert.ok(entries.has('xl/styles.xml'));
  assert.ok(entries.has('xl/worksheets/sheet1.xml'));

  const workbook = entries.get('xl/workbook.xml')!;
  assert.ok(workbook.includes('name="Sheet1"'));

  const styles = entries.get('xl/styles.xml')!;
  assert.ok(styles.includes('formatCode="#,##0"'));
  assert.ok(styles.includes('<name val="Calibri"/>'));

  const sheet1 = entries.get('xl/worksheets/sheet1.xml')!;
  assert.ok(sheet1.includes('rightToLeft="1"'));
  assert.ok(sheet1.includes('<c r="A1" s="1" t="inlineStr">'));
  assert.ok(sheet1.includes('D4-102'));
  assert.ok(sheet1.includes('کشیدن دندان قدامی شیری'));
  assert.ok(sheet1.includes('<c r="C1" s="3" t="n"><v>6417600</v></c>'));
  assert.ok(sheet1.includes('<c r="A2" s="1" t="inlineStr">'));
  assert.ok(sheet1.includes('<c r="C2" s="3" t="n"><v>7131600</v></c>'));
});
