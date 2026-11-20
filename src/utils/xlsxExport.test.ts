import test from 'node:test';
import assert from 'node:assert/strict';
import { INITIAL_SEED_STATE } from '../data/seedData';
import {
  calculatePayrollReport,
  formatPeriodKey,
  isOfficialOrRetiredContract,
} from './payroll';
import {
  buildManualSalaryDetailedXlsx,
  buildManualSalaryImportModelXlsx,
  buildManualSalaryListTableXlsx,
  buildOfficialShiftAllowanceXlsx,
  buildRtlThreeColumnXlsx,
  buildSalaryTiersTableXlsx,
  buildShiftAllowanceTitle,
  buildThreeColumnRows,
  resolveExportNameForImportModel,
} from './xlsxExport';
import {
  importManualSalary2FromRows,
  importPayrollAmountsFromRows,
  parseXlsxWorkbookRows,
} from './xlsxImport';

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
    manualSalaries: [6_417_600, 7_131_600, 0, 0, 0, 0, 0, 0] as [
      number,
      number,
      number,
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
    title: 'علیرضا شریفی - تولید سیما',
    amount: 6_417_600,
  });
  assert.deepEqual(rows[1], {
    code: 'D4-102-1',
    title: 'علیرضا شریفی - تامین پخش صدا',
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

test('buildSalaryTiersTableXlsx produces RTL table with 8 tiers matching SALARY_TIER_LABELS', () => {
  const bytes = buildSalaryTiersTableXlsx(INITIAL_SEED_STATE.employees);
  const entries = parseZipEntryNamesAndBodies(bytes);
  const sheet1 = entries.get('xl/worksheets/sheet1.xml')!;
  assert.ok(sheet1.includes('rightToLeft="1"'));
  assert.ok(sheet1.includes('تولید سیما'));
  assert.ok(sheet1.includes('فضای مجازی'));
  assert.ok(sheet1.includes('جمع کل حقوق'));
});

test('isOfficialOrRetiredContract matches only employed (رسمی) and retired (بازنشسته)', () => {
  assert.equal(isOfficialOrRetiredContract('employed'), true);
  assert.equal(isOfficialOrRetiredContract('retired'), true);
  assert.equal(isOfficialOrRetiredContract('article-28'), false);
  assert.equal(isOfficialOrRetiredContract('article-38'), false);
  assert.equal(isOfficialOrRetiredContract('sherkati-soroush'), false);
  assert.equal(isOfficialOrRetiredContract('custom'), false);
});

test('buildOfficialShiftAllowanceXlsx creates merged RTL banner with extracted month/year, required columns, and SUM totals', async () => {
  const title = buildShiftAllowanceTitle('1405-08');
  assert.equal(
    title,
    'لیست اضافه شیفت دریافتی کارکنان رسمی آذربایجانی — آبان ماه سال ۱۴۰۵'
  );

  const bytes = buildOfficialShiftAllowanceXlsx(
    [
      {
        fullName: 'امیرحسین رضایی',
        nationalId: '0012345678',
        personnelCode: '1001',
        amount: 8_500_000,
      },
      {
        fullName: 'مسعود اکبری',
        nationalId: '0045678912',
        personnelCode: '1005',
        amount: 6_250_000,
      },
    ],
    '1405-08'
  );

  const entries = parseZipEntryNamesAndBodies(bytes);
  const sheet1 = entries.get('xl/worksheets/sheet1.xml')!;
  assert.ok(sheet1.includes('rightToLeft="1"'));
  assert.ok(sheet1.includes('<mergeCell ref="A1:E1"/>'));
  assert.ok(sheet1.includes('<f>SUM(E3:E4)</f>'));

  const parsed = await parseXlsxWorkbookRows(bytes);
  assert.equal(
    parsed[0][0],
    'لیست اضافه شیفت دریافتی کارکنان رسمی آذربایجانی — آبان ماه سال ۱۴۰۵'
  );
  assert.deepEqual(parsed[1], [
    'ردیف',
    'نام و نام خانوادگی',
    'کد ملی',
    'کد پرسنلی',
    'مبلغ حق الزحمه',
  ]);
  assert.deepEqual(parsed[2], ['1', 'امیرحسین رضایی', '0012345678', '1001', '8500000']);
  assert.deepEqual(parsed[3], ['2', 'مسعود اکبری', '0045678912', '1005', '6250000']);
  assert.equal(parsed[4][0], 'جمع کل');
  assert.equal(parsed[4][4], '14750000');
});

test('buildManualSalaryListTableXlsx exports 5 columns (ردیف، نام و نام خانوادگی، مبلغ، قرارداد، نوع استخدام) with totals', async () => {
  const bytes = buildManualSalaryListTableXlsx([
    {
      fullName: 'امیرحسین رضایی',
      amount: 12_000_000,
      contractLabel: 'رسمی (شاغل)',
      unitType: 'سیما',
    },
    {
      fullName: 'مریم کاظمی',
      amount: 5_000_000,
      contractLabel: 'ماده ۲۸',
      unitType: 'خبر',
    },
  ]);

  const parsed = await parseXlsxWorkbookRows(bytes);
  assert.deepEqual(parsed[0], [
    'ردیف',
    'نام و نام خانوادگی',
    'مبلغ',
    'قرارداد',
    'نوع استخدام',
  ]);
  assert.deepEqual(parsed[1], ['1', 'امیرحسین رضایی', '12000000', 'رسمی (شاغل)', 'سیما']);
  assert.deepEqual(parsed[2], ['2', 'مریم کاظمی', '5000000', 'ماده ۲۸', 'خبر']);
  assert.equal(parsed[3][0], 'جمع کل');
  assert.equal(parsed[3][2], '17000000');
});

test('buildManualSalaryDetailedXlsx exports exact 14 RTL columns in order with summable totals row', async () => {
  const bytes = buildManualSalaryDetailedXlsx([
    {
      firstName: 'مریم',
      lastName: 'کاظمی',
      contractClause: 'ماده ۲۸',
      nationalIdOrPassport: '0023456789',
      jobTitle: 'کارشناس حسابداری',
      hazardPay: 1_000_000,
      nonCalloutPay: 500_000,
      totalPaid: 18_500_000,
      hireDate: '1400/02/01',
      terminationDate: '',
      description: 'پرداخت حقوق سیما',
      secondSalaryBonus: 2_000_000,
      deduction1: 350_000,
      commuteAllowance: 1_200_000,
    },
    {
      firstName: 'علیرضا',
      lastName: 'شریفی',
      contractClause: 'ماده ۳۸',
      nationalIdOrPassport: '0034567891',
      jobTitle: 'تدوینگر',
      hazardPay: 0,
      nonCalloutPay: 300_000,
      totalPaid: 14_000_000,
      hireDate: '1401/05/15',
      terminationDate: '1405/08/20',
      description: 'قرارداد ماده ۳۸',
      secondSalaryBonus: 1_000_000,
      deduction1: 150_000,
      commuteAllowance: 800_000,
    },
  ]);

  const parsed = await parseXlsxWorkbookRows(bytes);
  assert.deepEqual(parsed[0], [
    'نام',
    'نام خانوادگی',
    'ماده قرارداد',
    'کد ملی / شماره پاسپورت',
    'سمت / شغل',
    'زیان آور',
    'غیر آفیش',
    'مجموع پرداختی',
    'تاریخ آغاز کار',
    'تاریخ ترک کار',
    'توضیحات',
    'حقوق دوم / پاداش غیر مستمر',
    'کسورات ۱',
    'حق ایاب و ذهاب',
  ]);
  assert.equal(parsed[1][0], 'مریم');
  assert.equal(parsed[1][1], 'کاظمی');
  assert.equal(parsed[1][2], 'ماده ۲۸');
  assert.equal(parsed[1][7], '18500000');
  assert.equal(parsed[1][13], '1200000');

  assert.equal(parsed[2][2], 'ماده ۳۸');
  assert.equal(parsed[2][9], '1405/08/20');

  // Totals row
  assert.equal(parsed[3][0], 'جمع کل');
  assert.equal(parsed[3][5], '1000000'); // hazardPay
  assert.equal(parsed[3][6], '800000'); // nonCalloutPay
  assert.equal(parsed[3][7], '32500000'); // totalPaid
  assert.equal(parsed[3][11], '3000000'); // secondSalaryBonus
  assert.equal(parsed[3][12], '500000'); // deduction1
  assert.equal(parsed[3][13], '2000000'); // commuteAllowance
});

test('buildManualSalaryImportModelXlsx exports 4-column model and round-trips cleanly through both importers', async () => {
  const empList = INITIAL_SEED_STATE.employees;
  assert.equal(
    resolveExportNameForImportModel('محمدمهدی کریمی', empList),
    'کریمی'
  );
  // Shared last name disambiguates to fullName
  assert.equal(
    resolveExportNameForImportModel('محمدمهدی کریمی', [
      ...empList,
      { fullName: 'سینا کریمی' },
    ]),
    'محمدمهدی کریمی'
  );

  const bytes = buildManualSalaryImportModelXlsx([
    {
      lastNameOrFullName: resolveExportNameForImportModel('محمدمهدی کریمی', empList),
      amount: 12_500_000,
      unitType: 'خبر',
    },
    {
      lastNameOrFullName: resolveExportNameForImportModel('علیرضا شریفی', empList),
      amount: 6_000_000,
      unitType: 'فضای مجازی',
    },
  ]);

  const parsed = await parseXlsxWorkbookRows(bytes);
  assert.deepEqual(parsed[0], ['ردیف', 'نام خانوادگی', 'مبلغ', 'محل خدمت']);
  assert.deepEqual(parsed[1], ['1', 'کریمی', '12500000', 'خبر']);
  assert.deepEqual(parsed[2], ['2', 'شریفی', '6000000', 'فضای مجازی']);

  const reimported1 = importPayrollAmountsFromRows(
    parsed,
    empList,
    [],
    '1405-08',
    'manual-payments'
  );
  assert.equal(reimported1.matchedCount, 2);
  assert.equal(reimported1.manualPaymentsToAdd[0].employeeId, 'emp-2');
  assert.equal(reimported1.manualPaymentsToAdd[0].amount, 12_500_000);
  assert.equal(reimported1.manualPaymentsToAdd[0].unitType, 'خبر');
  assert.equal(reimported1.manualPaymentsToAdd[1].employeeId, 'emp-3');
  assert.equal(reimported1.manualPaymentsToAdd[1].unitType, 'فضای مجازی');

  const reimported2 = importManualSalary2FromRows(parsed, empList, 'additional');
  assert.equal(reimported2.matchedCount, 2);
  assert.equal(reimported2.matchedRows[0].unitType, 'خبر');
  assert.equal(reimported2.matchedRows[1].unitType, 'فضای مجازی');
});

test('buildEmployeesXlsx exports 19 RTL employee profile columns and summable base salary totals', async () => {
  const { buildEmployeesXlsx } = await import('./xlsxExport');
  const bytes = buildEmployeesXlsx(INITIAL_SEED_STATE.employees);
  const entries = parseZipEntryNamesAndBodies(bytes);
  const sheet1 = entries.get('xl/worksheets/sheet1.xml')!;
  assert.ok(sheet1.includes('rightToLeft="1"'));

  const parsed = await parseXlsxWorkbookRows(bytes);
  assert.equal(parsed[0].length, 19);
  assert.equal(parsed[0][0], 'کد پرسنلی');
  assert.equal(parsed[0][1], 'نام و نام خانوادگی');
  assert.equal(parsed[1][1], INITIAL_SEED_STATE.employees[0].fullName);
  const salaryIdx = parsed[0].indexOf('حقوق پایه');
  const expectedTotal = INITIAL_SEED_STATE.employees.reduce(
    (sum, e) => sum + e.baseMonthlySalary,
    0
  );
  const totalsRow = parsed[parsed.length - 1];
  assert.equal(totalsRow[0], 'جمع کل');
  assert.equal(Number(totalsRow[salaryIdx]), expectedTotal);
});


