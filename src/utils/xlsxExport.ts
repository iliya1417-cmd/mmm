import type {
  Employee,
  ManualSalaryPayment,
  ParametricAlignment,
  ParametricSheetDirection,
  PayrollReport,
} from '../types/payroll';
import type { ParametricTableData } from './parametricReport';
import {
  SALARY_TIER_LABELS,
  getEffectiveSalaryMode,
  getEmploymentTypeLabel,
  getJalaliMonthAndYear,
  normalizeCustomTierAmounts,
  normalizeManualSalaries,
  resolveManualSalaryUnitType,
  splitPersianFullName,
  sumCustomTierAmounts,
  toEnglishDigits,
  toPersianDigits,
} from './payroll';

export interface ThreeColumnExcelRow {
  code: string;
  title: string;
  amount: number;
}

export type ThreeColumnExportSource =
  | 'net-payroll'
  | 'salary-tiers-breakdown'
  | 'manual-payments';

export const THREE_COLUMN_SOURCE_LABELS: Record<
  ThreeColumnExportSource,
  string
> = {
  'net-payroll': 'خالص پرداختی هر کارمند',
  'salary-tiers-breakdown': 'تفکیک حقوق‌های چندگانه و پرداخت‌های دستی (کد-۱، کد-۲...)',
  'manual-payments': 'پرداخت‌های حقوق دستی دوره',
};

export interface BuildThreeColumnRowsParams {
  source: ThreeColumnExportSource;
  report: PayrollReport;
  employees: Employee[];
  manualPayments: ManualSalaryPayment[];
  periodKey: string;
}

export function buildThreeColumnRows({
  source,
  report,
  employees,
  manualPayments,
  periodKey,
}: BuildThreeColumnRowsParams): ThreeColumnExcelRow[] {
  if (source === 'net-payroll') {
    return report.payslips.map((slip) => ({
      code: toEnglishDigits(slip.employee.personnelCode.trim()),
      title: slip.isManualOverride
        ? `${slip.employee.fullName} (حقوق دستی توافقی)`
        : slip.employee.fullName,
      amount: Math.round(slip.netPayable),
    }));
  }

  if (source === 'manual-payments') {
    const empMap = new Map<string, Employee>();
    for (const emp of employees) {
      empMap.set(emp.id, emp);
    }

    const periodItems = manualPayments.filter(
      (p) => p.periodKey === periodKey && Number.isFinite(p.amount) && p.amount > 0
    );

    const perEmployeeCounter = new Map<string, number>();
    return periodItems.map((item) => {
      const emp = empMap.get(item.employeeId);
      const baseCode = toEnglishDigits(
        (emp?.personnelCode || item.referenceCode || item.employeeId).trim()
      );
      const seenCount = perEmployeeCounter.get(item.employeeId) ?? 0;
      perEmployeeCounter.set(item.employeeId, seenCount + 1);
      const code = seenCount === 0 ? baseCode : `${baseCode}-${seenCount}`;
      const defaultDesc =
        item.mode === 'override' ? 'حقوق دستی توافقی' : 'پرداخت حقوق دستی';
      const detail = item.description.trim() || defaultDesc;
      const title = emp ? `${emp.fullName} - ${detail}` : detail;
      return {
        code,
        title,
        amount: Math.round(item.amount),
      };
    });
  }

  // 'salary-tiers-breakdown':
  // Emits active employees' non-zero manual tiers (حقوق اول..پنجم) + period manual payments
  // using Excel sub-code convention matching Screenshot (e.g. 1001, 1001-1, 1001-2).
  const activeEmployees = employees.filter((e) => e.isActive);
  const rows: ThreeColumnExcelRow[] = [];

  for (const emp of activeEmployees) {
    const baseCode = toEnglishDigits(emp.personnelCode.trim());
    const tiers = normalizeManualSalaries(
      emp.manualSalaries,
      emp.baseMonthlySalary
    );
    let subIndex = 0;

    for (let i = 0; i < tiers.length; i += 1) {
      const tierAmount = Math.round(tiers[i]);
      if (tierAmount <= 0) continue;
      const code = subIndex === 0 ? baseCode : `${baseCode}-${subIndex}`;
      rows.push({
        code,
        title: `${emp.fullName} - ${SALARY_TIER_LABELS[i]}`,
        amount: tierAmount,
      });
      subIndex += 1;
    }

    const empManualPayments = manualPayments.filter(
      (p) =>
        p.employeeId === emp.id &&
        p.periodKey === periodKey &&
        Number.isFinite(p.amount) &&
        p.amount > 0
    );
    for (const mp of empManualPayments) {
      const code = subIndex === 0 ? baseCode : `${baseCode}-${subIndex}`;
      const detail =
        mp.description.trim() ||
        (mp.mode === 'override' ? 'حقوق دستی توافقی' : 'پرداخت حقوق دستی مجزا');
      rows.push({
        code,
        title: `${emp.fullName} - ${detail}`,
        amount: Math.round(mp.amount),
      });
      subIndex += 1;
    }
  }

  return rows;
}

export interface RtlXlsxOptions {
  includeHeaderRow?: boolean;
  sheetName?: string;
  headers?: [string, string, string];
}

function escapeXml(raw: string): string {
  // Strip XML 1.0 invalid control characters and escape special entities.
  const cleaned = raw.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
  return cleaned
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function makeCrc32Table(): Uint32Array {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
}

const CRC32_TABLE = makeCrc32Table();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) {
    crc = CRC32_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

interface ZipEntryInput {
  name: string;
  data: Uint8Array;
}

function buildZipStore(entries: ZipEntryInput[]): Uint8Array {
  const encoder = new TextEncoder();
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  // Fixed valid DOS time/date (2026-01-01 00:00:00)
  const dosTime = 0x0000;
  const dosDate = ((2026 - 1980) << 9) | (1 << 5) | 1;

  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.name);
    const dataBytes = entry.data;
    const checksum = crc32(dataBytes);

    // Local file header (30 bytes + name)
    const localHeader = new Uint8Array(30 + nameBytes.length);
    const lView = new DataView(localHeader.buffer);
    lView.setUint32(0, 0x04034b50, true); // Local file header signature
    lView.setUint16(4, 20, true); // Version needed to extract (2.0)
    lView.setUint16(6, 0x0800, true); // UTF-8 filename flag
    lView.setUint16(8, 0, true); // Compression method: 0 (STORE)
    lView.setUint16(10, dosTime, true);
    lView.setUint16(12, dosDate, true);
    lView.setUint32(14, checksum, true);
    lView.setUint32(18, dataBytes.length, true); // Compressed size
    lView.setUint32(22, dataBytes.length, true); // Uncompressed size
    lView.setUint16(26, nameBytes.length, true);
    lView.setUint16(28, 0, true); // Extra field length
    localHeader.set(nameBytes, 30);

    localParts.push(localHeader, dataBytes);

    // Central directory header (46 bytes + name)
    const centralHeader = new Uint8Array(46 + nameBytes.length);
    const cView = new DataView(centralHeader.buffer);
    cView.setUint32(0, 0x02014b50, true); // Central directory signature
    cView.setUint16(4, 20, true); // Version made by
    cView.setUint16(6, 20, true); // Version needed
    cView.setUint16(8, 0x0800, true); // UTF-8 flag
    cView.setUint16(10, 0, true); // Compression method: 0 (STORE)
    cView.setUint16(12, dosTime, true);
    cView.setUint16(14, dosDate, true);
    cView.setUint32(16, checksum, true);
    cView.setUint32(20, dataBytes.length, true);
    cView.setUint32(24, dataBytes.length, true);
    cView.setUint16(28, nameBytes.length, true);
    cView.setUint16(30, 0, true); // Extra field length
    cView.setUint16(32, 0, true); // File comment length
    cView.setUint16(34, 0, true); // Disk number start
    cView.setUint16(36, 0, true); // Internal file attributes
    cView.setUint32(38, 0, true); // External file attributes
    cView.setUint32(42, offset, true); // Relative offset of local header
    centralHeader.set(nameBytes, 46);

    centralParts.push(centralHeader);
    offset += localHeader.length + dataBytes.length;
  }

  const centralSize = centralParts.reduce((sum, p) => sum + p.length, 0);
  const eocd = new Uint8Array(22);
  const eView = new DataView(eocd.buffer);
  eView.setUint32(0, 0x06054b50, true); // End of central directory signature
  eView.setUint16(4, 0, true); // Disk number
  eView.setUint16(6, 0, true); // Central dir start disk
  eView.setUint16(8, entries.length, true);
  eView.setUint16(10, entries.length, true);
  eView.setUint32(12, centralSize, true);
  eView.setUint32(16, offset, true);
  eView.setUint16(20, 0, true); // Comment length

  const totalSize = offset + centralSize + eocd.length;
  const output = new Uint8Array(totalSize);
  let cursor = 0;
  for (const part of localParts) {
    output.set(part, cursor);
    cursor += part.length;
  }
  for (const part of centralParts) {
    output.set(part, cursor);
    cursor += part.length;
  }
  output.set(eocd, cursor);
  return output;
}

/**
 * Generates a genuine OOXML (.xlsx) workbook with:
 * - Sheet1 in RTL layout (rightToLeft="1": Col A on right, Col B middle, Col C left)
 * - Calibri 11pt typography
 * - Real Excel numeric cells formatted as "#,##0" (e.g. 6,417,600)
 */
export function buildRtlThreeColumnXlsx(
  rows: ReadonlyArray<ThreeColumnExcelRow>,
  options: RtlXlsxOptions = {}
): Uint8Array {
  const includeHeaderRow = options.includeHeaderRow ?? false;
  const rawSheetName = (options.sheetName ?? 'Sheet1').trim() || 'Sheet1';
  // Excel sheet names cannot contain : \ / ? * [ ] and max length 31
  const sheetName = rawSheetName.replace(/[:\\/?*[\]]/g, '').slice(0, 31) || 'Sheet1';
  const headers: [string, string, string] = options.headers ?? [
    'کد',
    'نام / شرح',
    'مبلغ',
  ];

  // Auto-calculate generous column widths matching Excel appearance
  const maxCodeLen = Math.max(
    10,
    includeHeaderRow ? headers[0].length : 0,
    ...rows.map((r) => r.code.length + 2)
  );
  const maxTitleLen = Math.max(
    28,
    includeHeaderRow ? headers[1].length + 4 : 0,
    ...rows.map((r) => r.title.length + 6)
  );
  const maxAmountLen = Math.max(
    16,
    includeHeaderRow ? headers[2].length + 4 : 0,
    ...rows.map((r) => Math.round(r.amount).toLocaleString('en-US').length + 4)
  );

  const colAWidth = Math.min(28, maxCodeLen);
  const colBWidth = Math.min(60, maxTitleLen);
  const colCWidth = Math.min(26, maxAmountLen);

  const sheetRowsXml: string[] = [];
  let rowIndex = 1;

  if (includeHeaderRow) {
    sheetRowsXml.push(
      `<row r="${rowIndex}" ht="22" customHeight="1">` +
        `<c r="A${rowIndex}" s="4" t="inlineStr"><is><t xml:space="preserve">${escapeXml(
          headers[0]
        )}</t></is></c>` +
        `<c r="B${rowIndex}" s="5" t="inlineStr"><is><t xml:space="preserve">${escapeXml(
          headers[1]
        )}</t></is></c>` +
        `<c r="C${rowIndex}" s="4" t="inlineStr"><is><t xml:space="preserve">${escapeXml(
          headers[2]
        )}</t></is></c>` +
        `</row>`
    );
    rowIndex += 1;
  }

  for (const row of rows) {
    const safeAmount = Number.isFinite(row.amount) ? Math.round(row.amount) : 0;
    sheetRowsXml.push(
      `<row r="${rowIndex}" ht="20" customHeight="1">` +
        `<c r="A${rowIndex}" s="1" t="inlineStr"><is><t xml:space="preserve">${escapeXml(
          row.code
        )}</t></is></c>` +
        `<c r="B${rowIndex}" s="2" t="inlineStr"><is><t xml:space="preserve">${escapeXml(
          row.title
        )}</t></is></c>` +
        `<c r="C${rowIndex}" s="3" t="n"><v>${safeAmount}</v></c>` +
        `</row>`
    );
    rowIndex += 1;
  }

  const contentTypesXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
    `<Default Extension="xml" ContentType="application/xml"/>` +
    `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
    `<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>` +
    `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
    `</Types>`;

  const rootRelsXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
    `</Relationships>`;

  const workbookXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
    `<sheets>` +
    `<sheet name="${escapeXml(sheetName)}" sheetId="1" r:id="rId1"/>` +
    `</sheets>` +
    `</workbook>`;

  const workbookRelsXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>` +
    `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
    `</Relationships>`;

  // Styles:
  // 0: default Calibri 11
  // 1: Col A (Code) - Calibri 11, left-aligned
  // 2: Col B (Description/Title) - Calibri 11, right-aligned, RTL readingOrder="2"
  // 3: Col C (Numeric Amount) - Calibri 11, numFmtId="164" (#,##0), right-aligned
  // 4: Header (Code/Amount) - Calibri 11 Bold, gray fill, center-aligned
  // 5: Header (Title) - Calibri 11 Bold, gray fill, right-aligned RTL
  const stylesXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<numFmts count="1">` +
    `<numFmt numFmtId="164" formatCode="#,##0"/>` +
    `</numFmts>` +
    `<fonts count="2">` +
    `<font><sz val="11"/><color theme="1"/><name val="Calibri"/></font>` +
    `<font><b/><sz val="11"/><color theme="1"/><name val="Calibri"/></font>` +
    `</fonts>` +
    `<fills count="3">` +
    `<fill><patternFill patternType="none"/></fill>` +
    `<fill><patternFill patternType="gray125"/></fill>` +
    `<fill><patternFill patternType="solid"><fgColor rgb="FFF1F5F9"/><bgColor indexed="64"/></patternFill></fill>` +
    `</fills>` +
    `<borders count="1">` +
    `<border><left/><right/><top/><bottom/><diagonal/></border>` +
    `</borders>` +
    `<cellStyleXfs count="1">` +
    `<xf numFmtId="0" fontId="0" fillId="0" borderId="0"/>` +
    `</cellStyleXfs>` +
    `<cellXfs count="6">` +
    `<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>` +
    `<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf>` +
    `<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment horizontal="right" vertical="center" readingOrder="2"/></xf>` +
    `<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>` +
    `<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="center" vertical="center" readingOrder="2"/></xf>` +
    `<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="right" vertical="center" readingOrder="2"/></xf>` +
    `</cellXfs>` +
    `<cellStyles count="1">` +
    `<cellStyle name="Normal" xfId="0" builtinId="0"/>` +
    `</cellStyles>` +
    `</styleSheet>`;

  const sheet1Xml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<sheetViews>` +
    `<sheetView showGridLines="1" tabSelected="1" rightToLeft="1" workbookViewId="0">` +
    `<selection activeCell="A1" sqref="A1"/>` +
    `</sheetView>` +
    `</sheetViews>` +
    `<sheetFormatPr defaultRowHeight="20"/>` +
    `<cols>` +
    `<col min="1" max="1" width="${colAWidth}" customWidth="1"/>` +
    `<col min="2" max="2" width="${colBWidth}" customWidth="1"/>` +
    `<col min="3" max="3" width="${colCWidth}" customWidth="1"/>` +
    `</cols>` +
    `<sheetData>${sheetRowsXml.join('')}</sheetData>` +
    `</worksheet>`;

  const encoder = new TextEncoder();
  return buildZipStore([
    { name: '[Content_Types].xml', data: encoder.encode(contentTypesXml) },
    { name: '_rels/.rels', data: encoder.encode(rootRelsXml) },
    { name: 'xl/workbook.xml', data: encoder.encode(workbookXml) },
    {
      name: 'xl/_rels/workbook.xml.rels',
      data: encoder.encode(workbookRelsXml),
    },
    { name: 'xl/styles.xml', data: encoder.encode(stylesXml) },
    { name: 'xl/worksheets/sheet1.xml', data: encoder.encode(sheet1Xml) },
  ]);
}

export function downloadRtlThreeColumnXlsx(
  rows: ReadonlyArray<ThreeColumnExcelRow>,
  filename: string,
  options?: RtlXlsxOptions
): void {
  const bytes = buildRtlThreeColumnXlsx(rows, options);
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const blob = new Blob([copy.buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function colIndexToExcelLetter(colIndex: number): string {
  let n = colIndex + 1;
  let result = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    result = String.fromCharCode(65 + rem) + result;
    n = Math.floor((n - 1) / 26);
  }
  return result || 'A';
}

export interface ParametricXlsxOptions {
  sheetDirection?: ParametricSheetDirection; // default 'ltr' (چپ‌چین)
  cellAlignment?: ParametricAlignment; // default 'left' (چپ‌چین)
  includeHeaderRow?: boolean; // default true
  sheetName?: string; // default 'ParametricReport'
}

/**
 * Builds an arbitrary-column OOXML (.xlsx) spreadsheet from parametric report data.
 * Defaults to LTR sheet layout (rightToLeft="0") and left-aligned cells (horizontal="left").
 */
export function buildParametricXlsx(
  tableData: ParametricTableData,
  options: ParametricXlsxOptions = {}
): Uint8Array {
  const sheetDirection: ParametricSheetDirection = options.sheetDirection ?? 'ltr';
  const cellAlignment: ParametricAlignment = options.cellAlignment ?? 'left';
  const includeHeaderRow = options.includeHeaderRow ?? true;
  const rawSheetName = (options.sheetName ?? 'Report').trim() || 'Report';
  const sheetName =
    rawSheetName.replace(/[:\\/?*[\]]/g, '').slice(0, 31) || 'Report';

  const cols = tableData.columns;
  const readingOrderAttr =
    sheetDirection === 'rtl' ? ' readingOrder="2"' : ' readingOrder="1"';
  const rtlAttr = sheetDirection === 'rtl' ? '1' : '0';

  // Auto-fit column widths across header, rows, and totals row
  const colWidths = cols.map((col, colIdx) => {
    let maxLen = Math.max(10, includeHeaderRow ? col.header.length + 4 : 0);
    for (const row of tableData.rows) {
      const val = row.cells[colIdx];
      const text =
        typeof val === 'number'
          ? col.format === 'money'
            ? Math.round(val).toLocaleString('en-US')
            : String(val)
          : String(val ?? '');
      maxLen = Math.max(maxLen, text.length + 4);
    }
    if (tableData.totalsRow) {
      const totVal = tableData.totalsRow[colIdx];
      const totText =
        typeof totVal === 'number'
          ? col.format === 'money'
            ? Math.round(totVal).toLocaleString('en-US')
            : String(totVal)
          : String(totVal ?? '');
      maxLen = Math.max(maxLen, totText.length + 4);
    }
    return Math.min(48, maxLen);
  });

  const colsXml =
    cols.length > 0
      ? `<cols>${colWidths
          .map(
            (w, idx) =>
              `<col min="${idx + 1}" max="${idx + 1}" width="${w}" customWidth="1"/>`
          )
          .join('')}</cols>`
      : '';

  // Style indices:
  // 0: Normal
  // 1: Text/Code cell (alignment, Calibri 11, thin border)
  // 2: Money numeric cell (alignment, Calibri 11, #,##0, thin border)
  // 3: Plain numeric cell (alignment, Calibri 11, General, thin border)
  // 4: Header cell (alignment, Calibri 11 Bold, #E2E8F0 fill, thin border)
  // 5: Totals text cell (alignment, Calibri 11 Bold, #ECFDF5 fill, thin border)
  // 6: Totals money cell (alignment, Calibri 11 Bold, #ECFDF5 fill, #,##0, thin border)
  // 7: Totals plain numeric cell (alignment, Calibri 11 Bold, #ECFDF5 fill, thin border)
  const stylesXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<numFmts count="1">` +
    `<numFmt numFmtId="164" formatCode="#,##0"/>` +
    `</numFmts>` +
    `<fonts count="2">` +
    `<font><sz val="11"/><color theme="1"/><name val="Calibri"/></font>` +
    `<font><b/><sz val="11"/><color theme="1"/><name val="Calibri"/></font>` +
    `</fonts>` +
    `<fills count="4">` +
    `<fill><patternFill patternType="none"/></fill>` +
    `<fill><patternFill patternType="gray125"/></fill>` +
    `<fill><patternFill patternType="solid"><fgColor rgb="FFE2E8F0"/><bgColor indexed="64"/></patternFill></fill>` +
    `<fill><patternFill patternType="solid"><fgColor rgb="FFECFDF5"/><bgColor indexed="64"/></patternFill></fill>` +
    `</fills>` +
    `<borders count="2">` +
    `<border><left/><right/><top/><bottom/><diagonal/></border>` +
    `<border>` +
    `<left style="thin"><color rgb="FFCBD5E1"/></left>` +
    `<right style="thin"><color rgb="FFCBD5E1"/></right>` +
    `<top style="thin"><color rgb="FFCBD5E1"/></top>` +
    `<bottom style="thin"><color rgb="FFCBD5E1"/></bottom>` +
    `<diagonal/>` +
    `</border>` +
    `</borders>` +
    `<cellStyleXfs count="1">` +
    `<xf numFmtId="0" fontId="0" fillId="0" borderId="0"/>` +
    `</cellStyleXfs>` +
    `<cellXfs count="8">` +
    `<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>` +
    `<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="${cellAlignment}" vertical="center"${readingOrderAttr}/></xf>` +
    `<xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="${cellAlignment}" vertical="center"/></xf>` +
    `<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="${cellAlignment}" vertical="center"/></xf>` +
    `<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="${cellAlignment}" vertical="center"${readingOrderAttr}/></xf>` +
    `<xf numFmtId="0" fontId="1" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="${cellAlignment}" vertical="center"${readingOrderAttr}/></xf>` +
    `<xf numFmtId="164" fontId="1" fillId="3" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="${cellAlignment}" vertical="center"/></xf>` +
    `<xf numFmtId="0" fontId="1" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="${cellAlignment}" vertical="center"/></xf>` +
    `</cellXfs>` +
    `<cellStyles count="1">` +
    `<cellStyle name="Normal" xfId="0" builtinId="0"/>` +
    `</cellStyles>` +
    `</styleSheet>`;

  const sheetRowsXml: string[] = [];
  let rowIndex = 1;

  if (includeHeaderRow && cols.length > 0) {
    const headerCells = cols
      .map((col, colIdx) => {
        const ref = `${colIndexToExcelLetter(colIdx)}${rowIndex}`;
        return `<c r="${ref}" s="4" t="inlineStr"><is><t xml:space="preserve">${escapeXml(
          col.header
        )}</t></is></c>`;
      })
      .join('');
    sheetRowsXml.push(
      `<row r="${rowIndex}" ht="24" customHeight="1">${headerCells}</row>`
    );
    rowIndex += 1;
  }

  for (const row of tableData.rows) {
    const rowCells = cols
      .map((col, colIdx) => {
        const ref = `${colIndexToExcelLetter(colIdx)}${rowIndex}`;
        const val = row.cells[colIdx] ?? '';
        if (
          typeof val === 'number' &&
          Number.isFinite(val) &&
          (col.format === 'money' || col.format === 'number')
        ) {
          const styleId = col.format === 'money' ? '2' : '3';
          const numVal = col.format === 'money' ? Math.round(val) : val;
          return `<c r="${ref}" s="${styleId}" t="n"><v>${numVal}</v></c>`;
        }
        return `<c r="${ref}" s="1" t="inlineStr"><is><t xml:space="preserve">${escapeXml(
          String(val)
        )}</t></is></c>`;
      })
      .join('');
    sheetRowsXml.push(
      `<row r="${rowIndex}" ht="20" customHeight="1">${rowCells}</row>`
    );
    rowIndex += 1;
  }

  if (tableData.totalsRow && cols.length > 0) {
    const totalCells = cols
      .map((col, colIdx) => {
        const ref = `${colIndexToExcelLetter(colIdx)}${rowIndex}`;
        const val = tableData.totalsRow![colIdx] ?? '';
        if (
          typeof val === 'number' &&
          Number.isFinite(val) &&
          (col.format === 'money' || col.format === 'number')
        ) {
          const styleId = col.format === 'money' ? '6' : '7';
          const numVal = col.format === 'money' ? Math.round(val) : val;
          return `<c r="${ref}" s="${styleId}" t="n"><v>${numVal}</v></c>`;
        }
        return `<c r="${ref}" s="5" t="inlineStr"><is><t xml:space="preserve">${escapeXml(
          String(val)
        )}</t></is></c>`;
      })
      .join('');
    sheetRowsXml.push(
      `<row r="${rowIndex}" ht="22" customHeight="1">${totalCells}</row>`
    );
  }

  const contentTypesXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
    `<Default Extension="xml" ContentType="application/xml"/>` +
    `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
    `<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>` +
    `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
    `</Types>`;

  const rootRelsXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
    `</Relationships>`;

  const workbookXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
    `<sheets>` +
    `<sheet name="${escapeXml(sheetName)}" sheetId="1" r:id="rId1"/>` +
    `</sheets>` +
    `</workbook>`;

  const workbookRelsXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>` +
    `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
    `</Relationships>`;

  const sheet1Xml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<sheetViews>` +
    `<sheetView showGridLines="1" tabSelected="1" rightToLeft="${rtlAttr}" workbookViewId="0">` +
    `<selection activeCell="A1" sqref="A1"/>` +
    `</sheetView>` +
    `</sheetViews>` +
    `<sheetFormatPr defaultRowHeight="20"/>` +
    colsXml +
    `<sheetData>${sheetRowsXml.join('')}</sheetData>` +
    `</worksheet>`;

  const encoder = new TextEncoder();
  return buildZipStore([
    { name: '[Content_Types].xml', data: encoder.encode(contentTypesXml) },
    { name: '_rels/.rels', data: encoder.encode(rootRelsXml) },
    { name: 'xl/workbook.xml', data: encoder.encode(workbookXml) },
    {
      name: 'xl/_rels/workbook.xml.rels',
      data: encoder.encode(workbookRelsXml),
    },
    { name: 'xl/styles.xml', data: encoder.encode(stylesXml) },
    { name: 'xl/worksheets/sheet1.xml', data: encoder.encode(sheet1Xml) },
  ]);
}

export function downloadParametricXlsx(
  tableData: ParametricTableData,
  filename: string,
  options?: ParametricXlsxOptions
): void {
  const bytes = buildParametricXlsx(tableData, options);
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const blob = new Blob([copy.buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Exports the exact 8-tier Manual Salary Table in RTL (rightToLeft="1") .xlsx format,
 * matching the on-screen columns so the exported file can be edited in Excel and re-imported.
 */
export function buildSalaryTiersTableXlsx(
  employees: ReadonlyArray<Employee>,
  draftOverrides?: Record<string, ReadonlyArray<number>>,
  customTierLabels: ReadonlyArray<string> = [],
  customDraftOverrides?: Record<string, Record<string, number>>
): Uint8Array {
  const columns: ParametricTableData['columns'] = [
    { key: 'personnelCode', header: 'کد پرسنلی', format: 'code', summable: false },
    { key: 'fullName', header: 'نام و نام خانوادگی', format: 'text', summable: false },
    { key: 'employmentType', header: 'نوع قرارداد', format: 'text', summable: false },
    { key: 'salaryMode', header: 'روش محاسبه حقوق', format: 'text', summable: false },
    ...SALARY_TIER_LABELS.map((label, idx) => ({
      key: `tier_${idx}`,
      header: label,
      format: 'money' as const,
      summable: true,
    })),
    ...customTierLabels.map((label, idx) => ({
      key: `custom_tier_${idx}`,
      header: label,
      format: 'money' as const,
      summable: true,
    })),
    { key: 'total', header: 'جمع کل حقوق', format: 'money', summable: true },
  ];

  const rows = employees.map((emp) => {
    const customMap = normalizeCustomTierAmounts(
      customDraftOverrides?.[emp.id] ?? emp.customTierAmounts
    );
    const tiers =
      draftOverrides?.[emp.id] ??
      normalizeManualSalaries(
        emp.manualSalaries,
        emp.baseMonthlySalary,
        customMap
      );
    const tierVals = SALARY_TIER_LABELS.map((_, idx) =>
      Math.max(0, Math.round(Number(tiers[idx]) || 0))
    );
    const customVals = customTierLabels.map((lbl) =>
      Math.max(0, Math.round(Number(customMap[lbl]) || 0))
    );
    const total =
      tierVals.reduce((s, n) => s + n, 0) +
      customVals.reduce((s, n) => s + n, 0);
    const modeLabel =
      emp.salaryCalculationMode === 'manual'
        ? 'دستی (توافقی)'
        : emp.salaryCalculationMode === 'fixed'
          ? 'حقوق ثابت'
          : 'تقسیم پایه / روزانه';
    const contractLabel =
      emp.employmentType === 'custom' && emp.customContractTitle?.trim()
        ? emp.customContractTitle.trim()
        : emp.employmentType === 'article-28'
          ? 'ماده ۲۸'
          : emp.employmentType === 'article-38'
            ? 'ماده ۳۸'
            : emp.employmentType === 'sherkati-soroush'
              ? 'شرکتی سروش'
              : emp.employmentType === 'retired'
                ? 'بازنشسته'
                : 'رسمی (شاغل)';

    return {
      employeeId: emp.id,
      cells: [
        toEnglishDigits(emp.personnelCode.trim()),
        emp.fullName,
        contractLabel,
        modeLabel,
        ...tierVals,
        ...customVals,
        total,
      ],
    };
  });

  const totalsRow: Array<string | number> = columns.map((col, idx) => {
    if (idx === 0) return `جمع کل (${rows.length} نفر)`;
    if (!col.summable) return '';
    return rows.reduce(
      (sum, r) => sum + (typeof r.cells[idx] === 'number' ? (r.cells[idx] as number) : 0),
      0
    );
  });

  return buildParametricXlsx(
    {
      columns,
      rows,
      totalsRow: rows.length > 0 ? totalsRow : null,
    },
    {
      sheetDirection: 'rtl',
      cellAlignment: 'right',
      includeHeaderRow: true,
      sheetName: 'ManualSalaries8Tiers',
    }
  );
}

export function downloadSalaryTiersTableXlsx(
  employees: ReadonlyArray<Employee>,
  filename: string,
  draftOverrides?: Record<string, ReadonlyArray<number>>,
  customTierLabels: ReadonlyArray<string> = [],
  customDraftOverrides?: Record<string, Record<string, number>>
): void {
  const bytes = buildSalaryTiersTableXlsx(
    employees,
    draftOverrides,
    customTierLabels,
    customDraftOverrides
  );
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const blob = new Blob([copy.buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export interface ManualSalary2ExcelEntry {
  amount: number;
  mode: 'additional' | 'override';
  unitType?: string;
  description: string;
}

/**
 * Exports the Manual Salary 2 employee table in RTL .xlsx format so users can
 * edit employees' manual salaries in Excel and re-import them back cleanly.
 */
export function buildManualSalary2TableXlsx(
  employees: ReadonlyArray<Employee>,
  draftEntries: Record<string, ManualSalary2ExcelEntry>
): Uint8Array {
  const columns: ParametricTableData['columns'] = [
    { key: 'personnelCode', header: 'کد پرسنلی', format: 'code', summable: false },
    { key: 'fullName', header: 'نام و نام خانوادگی', format: 'text', summable: false },
    { key: 'contract', header: 'قرارداد', format: 'text', summable: false },
    { key: 'unitType', header: 'نوع استخدام', format: 'text', summable: false },
    { key: 'baseMonthlySalary', header: 'حقوق پایه', format: 'money', summable: true },
    { key: 'mode', header: 'نحوه محاسبه', format: 'text', summable: false },
    { key: 'manualSalary', header: 'مبلغ حقوق دستی', format: 'money', summable: true },
    { key: 'description', header: 'شرح / بابت', format: 'text', summable: false },
  ];

  const rows = employees.map((emp) => {
    const entry = draftEntries[emp.id];
    const manualAmount = Math.max(0, Math.round(Number(entry?.amount) || 0));
    const modeLabel =
      (entry?.mode ?? 'override') === 'override'
        ? 'جایگزین فیش ماه'
        : 'پرداخت مجزا';
    return {
      employeeId: emp.id,
      cells: [
        toEnglishDigits(emp.personnelCode.trim()),
        emp.fullName,
        getEmploymentTypeLabel(emp.employmentType, emp.customContractTitle),
        resolveManualSalaryUnitType(emp, entry?.unitType),
        Math.max(0, Math.round(emp.baseMonthlySalary)),
        modeLabel,
        manualAmount,
        entry?.description?.trim() ?? '',
      ],
    };
  });

  const totalsRow: Array<string | number> = columns.map((col, idx) => {
    if (idx === 0) return `جمع کل (${rows.length} نفر)`;
    if (!col.summable) return '';
    return rows.reduce(
      (sum, r) => sum + (typeof r.cells[idx] === 'number' ? (r.cells[idx] as number) : 0),
      0
    );
  });

  return buildParametricXlsx(
    {
      columns,
      rows,
      totalsRow: rows.length > 0 ? totalsRow : null,
    },
    {
      sheetDirection: 'rtl',
      cellAlignment: 'right',
      includeHeaderRow: true,
      sheetName: 'ManualSalary2',
    }
  );
}

export function downloadManualSalary2TableXlsx(
  employees: ReadonlyArray<Employee>,
  draftEntries: Record<string, ManualSalary2ExcelEntry>,
  filename: string
): void {
  const bytes = buildManualSalary2TableXlsx(employees, draftEntries);
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const blob = new Blob([copy.buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export interface ManualSalaryListExportRow {
  fullName: string;
  amount: number;
  contractLabel: string;
  unitType: string;
}

/**
 * Exports the streamlined 5-column Manual Salary list (ردیف | نام و نام خانوادگی | مبلغ | قرارداد | نوع استخدام)
 * in RTL .xlsx with totals row.
 */
export function buildManualSalaryListTableXlsx(
  rows: ReadonlyArray<ManualSalaryListExportRow>
): Uint8Array {
  const columns: ParametricTableData['columns'] = [
    { key: 'rowIndex', header: 'ردیف', format: 'number', summable: false },
    { key: 'fullName', header: 'نام و نام خانوادگی', format: 'text', summable: false },
    { key: 'amount', header: 'مبلغ', format: 'money', summable: true },
    { key: 'contract', header: 'قرارداد', format: 'text', summable: false },
    { key: 'unitType', header: 'نوع استخدام', format: 'text', summable: false },
  ];

  const mappedRows = rows.map((r, idx) => ({
    employeeId: `row-${idx}`,
    cells: [
      idx + 1,
      r.fullName,
      Math.max(0, Math.round(r.amount)),
      r.contractLabel,
      r.unitType,
    ],
  }));

  const totalAmount = rows.reduce(
    (sum, r) => sum + Math.max(0, Math.round(r.amount)),
    0
  );

  return buildParametricXlsx(
    {
      columns,
      rows: mappedRows,
      totalsRow:
        mappedRows.length > 0
          ? ['جمع کل', `${toPersianDigits(mappedRows.length)} ردیف`, totalAmount, '', '']
          : null,
    },
    {
      sheetDirection: 'rtl',
      cellAlignment: 'right',
      includeHeaderRow: true,
      sheetName: 'ManualSalaryList',
    }
  );
}

export function downloadManualSalaryListTableXlsx(
  rows: ReadonlyArray<ManualSalaryListExportRow>,
  filename: string
): void {
  const bytes = buildManualSalaryListTableXlsx(rows);
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const blob = new Blob([copy.buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export interface ShiftPayExportRow {
  fullName: string;
  nationalId: string;
  personnelCode: string;
  amount: number;
}

export function buildShiftAllowanceTitle(periodKey: string): string {
  const { monthName, persianYear } = getJalaliMonthAndYear(periodKey);
  return `لیست اضافه شیفت دریافتی کارکنان رسمی آذربایجانی — ${monthName} ماه سال ${persianYear}`;
}

/**
 * Generates an RTL OOXML (.xlsx) workbook for Official & Retired employees' shift allowance:
 * - Row 1 (merged A1:E1): Dynamic title with extracted Jalali month & year
 * - Row 2: ردیف | نام و نام خانوادگی | کد ملی | کد پرسنلی | مبلغ حق الزحمه
 * - Rows 3..N: Employee shift pay records
 * - Final Row: جمع کل with SUM formula and formatted total
 */
export function buildOfficialShiftAllowanceXlsx(
  rows: ReadonlyArray<ShiftPayExportRow>,
  periodKey: string
): Uint8Array {
  const titleText = buildShiftAllowanceTitle(periodKey);
  const headers = [
    'ردیف',
    'نام و نام خانوادگی',
    'کد ملی',
    'کد پرسنلی',
    'مبلغ حق الزحمه',
  ] as const;

  const totalAmount = rows.reduce(
    (sum, r) => sum + Math.max(0, Math.round(r.amount)),
    0
  );

  const colAWidth = 10;
  const colBWidth = Math.min(
    40,
    Math.max(24, ...rows.map((r) => r.fullName.length + 6))
  );
  const colCWidth = 18;
  const colDWidth = 16;
  const colEWidth = Math.max(
    20,
    Math.round(totalAmount).toLocaleString('en-US').length + 6
  );

  // Styles:
  // 0: Normal
  // 1: Center text/code with border (ردیف / کد ملی / کد پرسنلی)
  // 2: Right-aligned RTL text with border (نام و نام خانوادگی)
  // 3: Money numeric cell (#,##0), right-aligned with border
  // 4: Table header cell (Bold, #E2E8F0 fill, center, border)
  // 5: Totals label cell (Bold, #ECFDF5 fill, center, border)
  // 6: Totals money cell (Bold, #ECFDF5 fill, #,##0, border)
  // 7: Merged top banner title cell (Bold 12pt, #0F766E fill, white text, center, RTL, border)
  const stylesXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<numFmts count="1">` +
    `<numFmt numFmtId="164" formatCode="#,##0"/>` +
    `</numFmts>` +
    `<fonts count="3">` +
    `<font><sz val="11"/><color theme="1"/><name val="Calibri"/></font>` +
    `<font><b/><sz val="11"/><color theme="1"/><name val="Calibri"/></font>` +
    `<font><b/><sz val="12"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>` +
    `</fonts>` +
    `<fills count="5">` +
    `<fill><patternFill patternType="none"/></fill>` +
    `<fill><patternFill patternType="gray125"/></fill>` +
    `<fill><patternFill patternType="solid"><fgColor rgb="FFE2E8F0"/><bgColor indexed="64"/></patternFill></fill>` +
    `<fill><patternFill patternType="solid"><fgColor rgb="FFECFDF5"/><bgColor indexed="64"/></patternFill></fill>` +
    `<fill><patternFill patternType="solid"><fgColor rgb="FF0F766E"/><bgColor indexed="64"/></patternFill></fill>` +
    `</fills>` +
    `<borders count="2">` +
    `<border><left/><right/><top/><bottom/><diagonal/></border>` +
    `<border>` +
    `<left style="thin"><color rgb="FFCBD5E1"/></left>` +
    `<right style="thin"><color rgb="FFCBD5E1"/></right>` +
    `<top style="thin"><color rgb="FFCBD5E1"/></top>` +
    `<bottom style="thin"><color rgb="FFCBD5E1"/></bottom>` +
    `<diagonal/>` +
    `</border>` +
    `</borders>` +
    `<cellStyleXfs count="1">` +
    `<xf numFmtId="0" fontId="0" fillId="0" borderId="0"/>` +
    `</cellStyleXfs>` +
    `<cellXfs count="8">` +
    `<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>` +
    `<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>` +
    `<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center" readingOrder="2"/></xf>` +
    `<xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>` +
    `<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" readingOrder="2"/></xf>` +
    `<xf numFmtId="0" fontId="1" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" readingOrder="2"/></xf>` +
    `<xf numFmtId="164" fontId="1" fillId="3" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>` +
    `<xf numFmtId="0" fontId="2" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" readingOrder="2" wrapText="1"/></xf>` +
    `</cellXfs>` +
    `<cellStyles count="1">` +
    `<cellStyle name="Normal" xfId="0" builtinId="0"/>` +
    `</cellStyles>` +
    `</styleSheet>`;

  const sheetRowsXml: string[] = [];

  // Row 1: Merged Title Banner
  sheetRowsXml.push(
    `<row r="1" ht="28" customHeight="1">` +
      `<c r="A1" s="7" t="inlineStr"><is><t xml:space="preserve">${escapeXml(
        titleText
      )}</t></is></c>` +
      `<c r="B1" s="7"/>` +
      `<c r="C1" s="7"/>` +
      `<c r="D1" s="7"/>` +
      `<c r="E1" s="7"/>` +
      `</row>`
  );

  // Row 2: Column Headers
  sheetRowsXml.push(
    `<row r="2" ht="24" customHeight="1">` +
      headers
        .map(
          (h, idx) =>
            `<c r="${colIndexToExcelLetter(idx)}2" s="4" t="inlineStr"><is><t xml:space="preserve">${escapeXml(
              h
            )}</t></is></c>`
        )
        .join('') +
      `</row>`
  );

  // Data Rows (Row 3 .. Row 2 + rows.length)
  let rowIndex = 3;
  rows.forEach((row, idx) => {
    const safeAmount = Math.max(0, Math.round(row.amount));
    sheetRowsXml.push(
      `<row r="${rowIndex}" ht="20" customHeight="1">` +
        `<c r="A${rowIndex}" s="1" t="n"><v>${idx + 1}</v></c>` +
        `<c r="B${rowIndex}" s="2" t="inlineStr"><is><t xml:space="preserve">${escapeXml(
          row.fullName
        )}</t></is></c>` +
        `<c r="C${rowIndex}" s="1" t="inlineStr"><is><t xml:space="preserve">${escapeXml(
          toEnglishDigits(row.nationalId.trim())
        )}</t></is></c>` +
        `<c r="D${rowIndex}" s="1" t="inlineStr"><is><t xml:space="preserve">${escapeXml(
          toEnglishDigits(row.personnelCode.trim())
        )}</t></is></c>` +
        `<c r="E${rowIndex}" s="3" t="n"><v>${safeAmount}</v></c>` +
        `</row>`
    );
    rowIndex += 1;
  });

  // Final Totals Row
  const firstDataRow = 3;
  const lastDataRow = Math.max(3, rowIndex - 1);
  const sumFormula =
    rows.length > 0 ? `<f>SUM(E${firstDataRow}:E${lastDataRow})</f>` : '';
  sheetRowsXml.push(
    `<row r="${rowIndex}" ht="24" customHeight="1">` +
      `<c r="A${rowIndex}" s="5" t="inlineStr"><is><t xml:space="preserve">جمع کل</t></is></c>` +
      `<c r="B${rowIndex}" s="5" t="inlineStr"><is><t xml:space="preserve">${escapeXml(
        `${toPersianDigits(rows.length)} نفر`
      )}</t></is></c>` +
      `<c r="C${rowIndex}" s="5" t="inlineStr"><is><t xml:space="preserve"></t></is></c>` +
      `<c r="D${rowIndex}" s="5" t="inlineStr"><is><t xml:space="preserve"></t></is></c>` +
      `<c r="E${rowIndex}" s="6" t="n">${sumFormula}<v>${totalAmount}</v></c>` +
      `</row>`
  );

  const contentTypesXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-officedocument.relationships+xml"/>` +
    `<Default Extension="xml" ContentType="application/xml"/>` +
    `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
    `<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>` +
    `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
    `</Types>`;

  const rootRelsXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
    `</Relationships>`;

  const workbookXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
    `<sheets>` +
    `<sheet name="OfficialShiftAllowance" sheetId="1" r:id="rId1"/>` +
    `</sheets>` +
    `</workbook>`;

  const workbookRelsXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>` +
    `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
    `</Relationships>`;

  const sheet1Xml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<sheetViews>` +
    `<sheetView showGridLines="1" tabSelected="1" rightToLeft="1" workbookViewId="0">` +
    `<selection activeCell="A1" sqref="A1"/>` +
    `</sheetView>` +
    `</sheetViews>` +
    `<sheetFormatPr defaultRowHeight="20"/>` +
    `<cols>` +
    `<col min="1" max="1" width="${colAWidth}" customWidth="1"/>` +
    `<col min="2" max="2" width="${colBWidth}" customWidth="1"/>` +
    `<col min="3" max="3" width="${colCWidth}" customWidth="1"/>` +
    `<col min="4" max="4" width="${colDWidth}" customWidth="1"/>` +
    `<col min="5" max="5" width="${colEWidth}" customWidth="1"/>` +
    `</cols>` +
    `<sheetData>${sheetRowsXml.join('')}</sheetData>` +
    `<mergeCells count="1"><mergeCell ref="A1:E1"/></mergeCells>` +
    `</worksheet>`;

  const encoder = new TextEncoder();
  return buildZipStore([
    { name: '[Content_Types].xml', data: encoder.encode(contentTypesXml) },
    { name: '_rels/.rels', data: encoder.encode(rootRelsXml) },
    { name: 'xl/workbook.xml', data: encoder.encode(workbookXml) },
    {
      name: 'xl/_rels/workbook.xml.rels',
      data: encoder.encode(workbookRelsXml),
    },
    { name: 'xl/styles.xml', data: encoder.encode(stylesXml) },
    { name: 'xl/worksheets/sheet1.xml', data: encoder.encode(sheet1Xml) },
  ]);
}

export function downloadOfficialShiftAllowanceXlsx(
  rows: ReadonlyArray<ShiftPayExportRow>,
  periodKey: string,
  filename: string
): void {
  const bytes = buildOfficialShiftAllowanceXlsx(rows, periodKey);
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const blob = new Blob([copy.buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export interface ManualSalaryDetailedExportRow {
  firstName: string;
  lastName: string;
  contractClause: string;
  nationalIdOrPassport: string;
  jobTitle: string;
  hazardPay: number;
  nonCalloutPay: number;
  totalPaid: number;
  hireDate: string;
  terminationDate: string;
  description: string;
  secondSalaryBonus: number;
  deduction1: number;
  commuteAllowance: number;
}

/**
 * Generates the comprehensive 14-column RTL OOXML (.xlsx) workbook for Manual Salary exports:
 * 1. نام | 2. نام خانوادگی | 3. ماده قرارداد | 4. کد ملی / شماره پاسپورت |
 * 5. سمت / شغل | 6. زیان آور | 7. غیر آفیش | 8. مجموع پرداختی |
 * 9. تاریخ آغاز کار | 10. تاریخ ترک کار | 11. توضیحات |
 * 12. حقوق دوم / پاداش غیر مستمر | 13. کسورات ۱ | 14. حق ایاب و ذهاب
 */
export function buildManualSalaryDetailedXlsx(
  rows: ReadonlyArray<ManualSalaryDetailedExportRow>
): Uint8Array {
  const columns: ParametricTableData['columns'] = [
    { key: 'firstName', header: 'نام', format: 'text', summable: false },
    { key: 'lastName', header: 'نام خانوادگی', format: 'text', summable: false },
    { key: 'contractClause', header: 'ماده قرارداد', format: 'text', summable: false },
    {
      key: 'nationalIdOrPassport',
      header: 'کد ملی / شماره پاسپورت',
      format: 'code',
      summable: false,
    },
    { key: 'jobTitle', header: 'سمت / شغل', format: 'text', summable: false },
    { key: 'hazardPay', header: 'زیان آور', format: 'money', summable: true },
    { key: 'nonCalloutPay', header: 'غیر آفیش', format: 'money', summable: true },
    { key: 'totalPaid', header: 'مجموع پرداختی', format: 'money', summable: true },
    { key: 'hireDate', header: 'تاریخ آغاز کار', format: 'code', summable: false },
    { key: 'terminationDate', header: 'تاریخ ترک کار', format: 'code', summable: false },
    { key: 'description', header: 'توضیحات', format: 'text', summable: false },
    {
      key: 'secondSalaryBonus',
      header: 'حقوق دوم / پاداش غیر مستمر',
      format: 'money',
      summable: true,
    },
    { key: 'deduction1', header: 'کسورات ۱', format: 'money', summable: true },
    {
      key: 'commuteAllowance',
      header: 'حق ایاب و ذهاب',
      format: 'money',
      summable: true,
    },
  ];

  const mappedRows = rows.map((r, idx) => ({
    employeeId: `det-${idx}`,
    cells: [
      r.firstName,
      r.lastName,
      r.contractClause,
      toEnglishDigits(r.nationalIdOrPassport.trim()),
      r.jobTitle,
      Math.max(0, Math.round(r.hazardPay)),
      Math.max(0, Math.round(r.nonCalloutPay)),
      Math.max(0, Math.round(r.totalPaid)),
      toEnglishDigits(r.hireDate.trim()),
      toEnglishDigits(r.terminationDate.trim()),
      r.description,
      Math.max(0, Math.round(r.secondSalaryBonus)),
      Math.max(0, Math.round(r.deduction1)),
      Math.max(0, Math.round(r.commuteAllowance)),
    ],
  }));

  const totalsRow: Array<string | number> = columns.map((col, idx) => {
    if (idx === 0) return 'جمع کل';
    if (idx === 1) return `${toPersianDigits(mappedRows.length)} نفر`;
    if (!col.summable) return '';
    return mappedRows.reduce(
      (sum, row) =>
        sum + (typeof row.cells[idx] === 'number' ? (row.cells[idx] as number) : 0),
      0
    );
  });

  return buildParametricXlsx(
    {
      columns,
      rows: mappedRows,
      totalsRow: mappedRows.length > 0 ? totalsRow : null,
    },
    {
      sheetDirection: 'rtl',
      cellAlignment: 'right',
      includeHeaderRow: true,
      sheetName: 'ManualSalaryDetailed',
    }
  );
}

export function downloadManualSalaryDetailedXlsx(
  rows: ReadonlyArray<ManualSalaryDetailedExportRow>,
  filename: string
): void {
  const bytes = buildManualSalaryDetailedXlsx(rows);
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const blob = new Blob([copy.buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export interface ManualSalaryImportModelRow {
  lastNameOrFullName: string;
  amount: number;
  unitType: string;
}

/**
 * Returns the employee's last name if unique across employees, otherwise their full name,
 * so 4-column Excel exports can be cleanly round-tripped back via «ورود اکسل».
 */
export function resolveExportNameForImportModel(
  empFullName: string,
  employees: ReadonlyArray<Pick<Employee, 'fullName'>>
): string {
  const { lastName } = splitPersianFullName(empFullName);
  const normLast = toEnglishDigits(lastName)
    .replace(/ي/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
  if (!normLast) return empFullName.trim();

  let count = 0;
  for (const emp of employees) {
    const curLast = toEnglishDigits(splitPersianFullName(emp.fullName).lastName)
      .replace(/ي/g, 'ی')
      .replace(/ك/g, 'ک')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
    if (curLast === normLast) count += 1;
  }
  return count === 1 ? lastName : empFullName.trim();
}

/**
 * Generates an RTL OOXML (.xlsx) file matching the exact 4-column Manual Salary import model:
 * ردیف | نام خانوادگی | مبلغ | محل خدمت
 */
export function buildManualSalaryImportModelXlsx(
  rows: ReadonlyArray<ManualSalaryImportModelRow>
): Uint8Array {
  const columns: ParametricTableData['columns'] = [
    { key: 'rowIndex', header: 'ردیف', format: 'number', summable: false },
    { key: 'lastName', header: 'نام خانوادگی', format: 'text', summable: false },
    { key: 'amount', header: 'مبلغ', format: 'money', summable: false },
    { key: 'unitType', header: 'محل خدمت', format: 'text', summable: false },
  ];

  const mappedRows = rows.map((r, idx) => ({
    employeeId: `imp-${idx}`,
    cells: [
      idx + 1,
      r.lastNameOrFullName,
      Math.max(0, Math.round(r.amount)),
      r.unitType,
    ],
  }));

  return buildParametricXlsx(
    {
      columns,
      rows: mappedRows,
      totalsRow: null,
    },
    {
      sheetDirection: 'rtl',
      cellAlignment: 'right',
      includeHeaderRow: true,
      sheetName: 'ManualImportModel',
    }
  );
}

export function downloadManualSalaryImportModelXlsx(
  rows: ReadonlyArray<ManualSalaryImportModelRow>,
  filename: string
): void {
  const bytes = buildManualSalaryImportModelXlsx(rows);
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const blob = new Blob([copy.buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Generates an RTL OOXML (.xlsx) workbook with complete employee profiles for backup/editing
 * and clean round-trip re-import into «مشخصات کارمندان».
 */
export function buildEmployeesXlsx(
  employees: ReadonlyArray<Employee>
): Uint8Array {
  const columns: ParametricTableData['columns'] = [
    { key: 'personnelCode', header: 'کد پرسنلی', format: 'code', summable: false },
    { key: 'fullName', header: 'نام و نام خانوادگی', format: 'text', summable: false },
    { key: 'nationalId', header: 'کد ملی', format: 'code', summable: false },
    { key: 'department', header: 'دپارتمان / واحد', format: 'text', summable: false },
    { key: 'jobTitle', header: 'سمت شغلی', format: 'text', summable: false },
    { key: 'workLocation', header: 'محل خدمت', format: 'text', summable: false },
    { key: 'mobileNumber', header: 'شماره موبایل', format: 'code', summable: false },
    { key: 'workPhone', header: 'تلفن محل کار', format: 'code', summable: false },
    { key: 'employmentType', header: 'نوع قرارداد', format: 'text', summable: false },
    { key: 'salaryCalculationMode', header: 'روش محاسبه حقوق', format: 'text', summable: false },
    { key: 'baseMonthlySalary', header: 'حقوق پایه', format: 'money', summable: true },
    { key: 'seniorityAllowance', header: 'پایه سنوات', format: 'money', summable: true },
    { key: 'insuranceBaseCap', header: 'سقف بیمه', format: 'money', summable: false },
    { key: 'maritalStatus', header: 'وضعیت تاهل', format: 'text', summable: false },
    { key: 'childrenCount', header: 'تعداد فرزندان', format: 'number', summable: false },
    { key: 'bankName', header: 'نام بانک', format: 'text', summable: false },
    { key: 'bankAccount', header: 'شماره حساب / شبا', format: 'code', summable: false },
    { key: 'hireDate', header: 'تاریخ استخدام', format: 'code', summable: false },
    { key: 'isActive', header: 'وضعیت', format: 'text', summable: false },
  ];

  const rows = employees.map((emp) => {
    const mode = getEffectiveSalaryMode(emp);
    const modeLabel =
      mode === 'manual'
        ? 'دستی (توافقی)'
        : mode === 'fixed'
          ? 'حقوق ثابت'
          : 'تقسیم پایه / روزانه';
    const contractLabel = getEmploymentTypeLabel(
      emp.employmentType,
      emp.customContractTitle
    );
    const effectiveBase = Math.max(
      0,
      Math.round(emp.baseMonthlySalary || sumCustomTierAmounts(emp.customTierAmounts))
    );

    return {
      employeeId: emp.id,
      cells: [
        toEnglishDigits(emp.personnelCode.trim()),
        emp.fullName,
        toEnglishDigits(emp.nationalId.trim()),
        emp.department,
        emp.jobTitle,
        emp.workLocation || 'ستاد مرکزی',
        toEnglishDigits(emp.mobileNumber?.trim() ?? ''),
        toEnglishDigits(emp.workPhone?.trim() ?? ''),
        contractLabel,
        modeLabel,
        effectiveBase,
        Math.max(0, Math.round(emp.seniorityAllowance ?? 0)),
        Math.max(0, Math.round(emp.insuranceBaseCap ?? 0)),
        emp.maritalStatus === 'married' ? 'متاهل' : 'مجرد',
        Math.max(0, Math.round(emp.childrenCount ?? 0)),
        emp.bankName || 'بانک ملی ایران',
        toEnglishDigits(emp.bankAccount?.trim() ?? ''),
        toEnglishDigits(emp.hireDate?.trim() ?? ''),
        emp.isActive ? 'فعال' : 'غیرفعال',
      ],
    };
  });

  const totalsRow: Array<string | number> = columns.map((col, idx) => {
    if (idx === 0) return 'جمع کل';
    if (idx === 1) return `${toPersianDigits(rows.length)} کارمند`;
    if (!col.summable) return '';
    return rows.reduce(
      (sum, r) => sum + (typeof r.cells[idx] === 'number' ? (r.cells[idx] as number) : 0),
      0
    );
  });

  return buildParametricXlsx(
    {
      columns,
      rows,
      totalsRow: rows.length > 0 ? totalsRow : null,
    },
    {
      sheetDirection: 'rtl',
      cellAlignment: 'right',
      includeHeaderRow: true,
      sheetName: 'Employees',
    }
  );
}

export function downloadEmployeesXlsx(
  employees: ReadonlyArray<Employee>,
  filename: string
): void {
  const bytes = buildEmployeesXlsx(employees);
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const blob = new Blob([copy.buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
