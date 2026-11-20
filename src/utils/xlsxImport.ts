import type {
  Employee,
  EmploymentType,
  ManualSalaryMode,
  ManualSalaryPayment,
  MaritalStatus,
  MonthlyTimesheet,
  SalaryCalculationMode,
} from '../types/payroll';
import {
  DEFAULT_ALLOWANCE_FLAGS,
  SALARY_TIER_LABELS,
  type SalaryTierTuple,
  createEmptyTimesheet,
  detectBankFromSheba,
  normalizeCustomTierAmounts,
  normalizeManualSalaries,
  splitPersianFullName,
  sumCustomTierAmounts,
  sumManualSalaries,
  toEnglishDigits,
} from './payroll';

function decodeXmlEntities(raw: string): string {
  return raw
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) =>
      String.fromCodePoint(parseInt(hex, 16))
    )
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&amp;/g, '&');
}

function excelColLettersToIndex(colRef: string): number {
  let idx = 0;
  for (let i = 0; i < colRef.length; i += 1) {
    const code = colRef.charCodeAt(i);
    if (code >= 65 && code <= 90) {
      idx = idx * 26 + (code - 64);
    }
  }
  return Math.max(0, idx - 1);
}

async function inflateRawBytes(compressed: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream !== 'undefined') {
    const copy = new Uint8Array(compressed.byteLength);
    copy.set(compressed);
    const stream = new Blob([copy.buffer])
      .stream()
      .pipeThrough(new DecompressionStream('deflate-raw'));
    const buffer = await new Response(stream).arrayBuffer();
    return new Uint8Array(buffer);
  }
  // Fallback for Node.js environments lacking DecompressionStream
  const nodeZlib = await import('node:zlib');
  const out = nodeZlib.inflateRawSync(compressed);
  return new Uint8Array(out.buffer, out.byteOffset, out.byteLength);
}

/**
 * Parses an OOXML .xlsx ZIP archive supporting both STORE (method 0) and DEFLATE (method 8)
 * entries via Central Directory headers (works even when Excel uses data descriptors).
 */
async function extractZipXmlEntries(
  zipBytes: Uint8Array
): Promise<Map<string, string>> {
  const view = new DataView(zipBytes.buffer, zipBytes.byteOffset, zipBytes.byteLength);
  const decoder = new TextDecoder('utf-8');
  const files = new Map<string, string>();

  // Locate End of Central Directory (0x06054b50) from the end
  let eocdOffset = -1;
  const minOffset = Math.max(0, zipBytes.length - 65557);
  for (let i = zipBytes.length - 22; i >= minOffset; i -= 1) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }

  if (eocdOffset >= 0) {
    const totalEntries = view.getUint16(eocdOffset + 10, true);
    let cdOffset = view.getUint32(eocdOffset + 16, true);

    for (let i = 0; i < totalEntries && cdOffset + 46 <= zipBytes.length; i += 1) {
      if (view.getUint32(cdOffset, true) !== 0x02014b50) break;
      const compMethod = view.getUint16(cdOffset + 10, true);
      const compSize = view.getUint32(cdOffset + 20, true);
      const nameLen = view.getUint16(cdOffset + 28, true);
      const extraLen = view.getUint16(cdOffset + 30, true);
      const commentLen = view.getUint16(cdOffset + 32, true);
      const localHeaderOffset = view.getUint32(cdOffset + 42, true);

      const entryName = decoder.decode(
        zipBytes.slice(cdOffset + 46, cdOffset + 46 + nameLen)
      );
      cdOffset += 46 + nameLen + extraLen + commentLen;

      if (
        !entryName.endsWith('.xml') &&
        !entryName.endsWith('.rels')
      ) {
        continue;
      }

      if (localHeaderOffset + 30 <= zipBytes.length) {
        const lhNameLen = view.getUint16(localHeaderOffset + 26, true);
        const lhExtraLen = view.getUint16(localHeaderOffset + 28, true);
        const dataStart = localHeaderOffset + 30 + lhNameLen + lhExtraLen;
        const compressed = zipBytes.slice(dataStart, dataStart + compSize);
        if (compMethod === 0) {
          files.set(entryName, decoder.decode(compressed));
        } else if (compMethod === 8) {
          const inflated = await inflateRawBytes(compressed);
          files.set(entryName, decoder.decode(inflated));
        }
      }
    }
    return files;
  }

  // Fallback linear local header scan if EOCD not found
  let offset = 0;
  while (offset + 30 <= zipBytes.length) {
    if (view.getUint32(offset, true) !== 0x04034b50) break;
    const compMethod = view.getUint16(offset + 8, true);
    const compSize = view.getUint32(offset + 18, true);
    const nameLen = view.getUint16(offset + 26, true);
    const extraLen = view.getUint16(offset + 28, true);
    const name = decoder.decode(zipBytes.slice(offset + 30, offset + 30 + nameLen));
    const dataStart = offset + 30 + nameLen + extraLen;
    const compressed = zipBytes.slice(dataStart, dataStart + compSize);
    if (compMethod === 0) {
      files.set(name, decoder.decode(compressed));
    } else if (compMethod === 8) {
      const inflated = await inflateRawBytes(compressed);
      files.set(name, decoder.decode(inflated));
    }
    offset = dataStart + compSize;
  }
  return files;
}

function parseSharedStrings(xml: string | undefined): string[] {
  if (!xml) return [];
  const strings: string[] = [];
  const siRegex = /<si\b[^>]*>([\s\S]*?)<\/si>/g;
  let match: RegExpExecArray | null;
  while ((match = siRegex.exec(xml)) !== null) {
    const inner = match[1];
    const tParts: string[] = [];
    const tRegex = /<t\b[^>]*>([\s\S]*?)<\/t>/g;
    let tMatch: RegExpExecArray | null;
    while ((tMatch = tRegex.exec(inner)) !== null) {
      tParts.push(decodeXmlEntities(tMatch[1]));
    }
    strings.push(tParts.join(''));
  }
  return strings;
}

export async function parseXlsxWorkbookRows(
  bytes: Uint8Array
): Promise<string[][]> {
  const files = await extractZipXmlEntries(bytes);
  const sharedStrings = parseSharedStrings(files.get('xl/sharedStrings.xml'));
  const sheetXml =
    files.get('xl/worksheets/sheet1.xml') ??
    Array.from(files.entries()).find(([k]) =>
      k.startsWith('xl/worksheets/sheet')
    )?.[1];

  if (!sheetXml) {
    throw new Error('فایل اکسل فاقد کاربرگ معتبر است.');
  }

  const rows: string[][] = [];
  const rowRegex = /<row\b[^>]*>([\s\S]*?)<\/row>/g;
  let rowMatch: RegExpExecArray | null;
  let fallbackColIdx = 0;

  while ((rowMatch = rowRegex.exec(sheetXml)) !== null) {
    const rowBody = rowMatch[1];
    const rowCells: string[] = [];
    fallbackColIdx = 0;

    const cellRegex = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
    let cellMatch: RegExpExecArray | null;
    while ((cellMatch = cellRegex.exec(rowBody)) !== null) {
      const attrs = cellMatch[1];
      const inner = cellMatch[2] ?? '';
      const refMatch = attrs.match(/\br="([A-Z]+)\d+"/i);
      const colIdx = refMatch
        ? excelColLettersToIndex(refMatch[1].toUpperCase())
        : fallbackColIdx;
      fallbackColIdx = colIdx + 1;

      const typeMatch = attrs.match(/\bt="([^"]+)"/);
      const cellType = typeMatch ? typeMatch[1] : '';

      let valueText = '';
      if (cellType === 'inlineStr') {
        const tMatches = inner.match(/<t\b[^>]*>([\s\S]*?)<\/t>/g) ?? [];
        valueText = tMatches
          .map((t) => decodeXmlEntities(t.replace(/<[^>]+>/g, '')))
          .join('');
      } else if (cellType === 's') {
        const vMatch = inner.match(/<v>([\s\S]*?)<\/v>/);
        const sIdx = vMatch ? Number(vMatch[1]) : -1;
        valueText = Number.isInteger(sIdx) ? sharedStrings[sIdx] ?? '' : '';
      } else if (cellType === 'str') {
        const vMatch = inner.match(/<v>([\s\S]*?)<\/v>/);
        valueText = vMatch ? decodeXmlEntities(vMatch[1]) : '';
      } else {
        const vMatch = inner.match(/<v>([\s\S]*?)<\/v>/);
        valueText = vMatch ? decodeXmlEntities(vMatch[1]) : '';
      }

      while (rowCells.length <= colIdx) {
        rowCells.push('');
      }
      rowCells[colIdx] = valueText.trim();
    }

    if (rowCells.some((c) => c !== '')) {
      rows.push(rowCells);
    }
  }

  return rows;
}

export function parseCsvRows(text: string): string[][] {
  const cleaned = text.replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let current = '';
  let inQuotes = false;

  const firstLine = cleaned.split(/\r?\n/, 1)[0] ?? '';
  const delimiter =
    firstLine.includes('\t') && !firstLine.includes(',') ? '\t' : ',';

  for (let i = 0; i < cleaned.length; i += 1) {
    const ch = cleaned[i];
    if (inQuotes) {
      if (ch === '"') {
        if (cleaned[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      row.push(current.trim());
      current = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && cleaned[i + 1] === '\n') {
        i += 1;
      }
      row.push(current.trim());
      if (row.some((c) => c !== '')) {
        rows.push(row);
      }
      row = [];
      current = '';
    } else {
      current += ch;
    }
  }

  if (current.length > 0 || row.length > 0) {
    row.push(current.trim());
    if (row.some((c) => c !== '')) {
      rows.push(row);
    }
  }

  return rows;
}

export async function parseSpreadsheetFile(file: File): Promise<string[][]> {
  const lowerName = file.name.toLowerCase();
  if (lowerName.endsWith('.csv') || lowerName.endsWith('.tsv') || lowerName.endsWith('.txt')) {
    const text = await file.text();
    return parseCsvRows(text);
  }
  const buffer = await file.arrayBuffer();
  return parseXlsxWorkbookRows(new Uint8Array(buffer));
}

function parseExcelNumber(raw: string | undefined): number {
  if (!raw) return 0;
  const eng = toEnglishDigits(raw.trim()).replace(/,/g, '').replace(/\s+/g, '');
  if (!eng) return 0;
  const parsed = Number(eng);
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : 0;
}

function normalizeHeaderText(raw: string): string {
  return toEnglishDigits(raw)
    .replace(/ي/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/\u200c/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function parseSalaryModeText(raw: string | undefined): SalaryCalculationMode | null {
  if (!raw) return null;
  const text = normalizeHeaderText(raw);
  if (text.includes('دستی') || text.includes('توافقی')) return 'manual';
  if (text.includes('ثابت')) return 'fixed';
  if (text.includes('تقسیم') || text.includes('روزانه') || text.includes('پایه')) {
    return 'daily-divided';
  }
  return null;
}

export interface TierImportResult {
  updatedEmployees: Employee[];
  matchedEmployeeCount: number;
  skippedRowsCount: number;
  formatDetected: 'table-8-tiers' | 'three-column';
}

/**
 * Imports manual 8-tier salary data from parsed spreadsheet rows back into employees.
 * Supports:
 * 1. Table-format .xlsx / .csv exported by buildSalaryTiersTableXlsx (matching header names or exact column positions)
 * 2. 3-column accounting format (کد / کد-۱ | نام - عنوان ردیف | مبلغ)
 */
export function importManualTiersFromRows(
  rows: ReadonlyArray<ReadonlyArray<string>>,
  employees: ReadonlyArray<Employee>
): TierImportResult {
  if (rows.length === 0) {
    return {
      updatedEmployees: [...employees],
      matchedEmployeeCount: 0,
      skippedRowsCount: 0,
      formatDetected: 'table-8-tiers',
    };
  }

  const byCode = new Map<string, Employee>();
  const byName = new Map<string, Employee>();
  for (const emp of employees) {
    byCode.set(toEnglishDigits(emp.personnelCode.trim()).toLowerCase(), emp);
    byName.set(normalizeHeaderText(emp.fullName), emp);
  }

  const normalizedTierLabels = SALARY_TIER_LABELS.map((l) => normalizeHeaderText(l));
  const firstRowNorm = rows[0].map((c) => normalizeHeaderText(c));
  const tierColIndices = normalizedTierLabels.map((lbl) =>
    firstRowNorm.findIndex((h) => h === lbl || h.includes(lbl))
  );
  const codeColIdx = firstRowNorm.findIndex(
    (h) => h === 'کد پرسنلی' || h === 'کد' || h.includes('کد پرسنلی')
  );
  const nameColIdx = firstRowNorm.findIndex(
    (h) => h.includes('نام و نام خانوادگی') || h === 'نام' || h.includes('نام کارمند')
  );
  const modeColIdx = firstRowNorm.findIndex((h) => h.includes('روش محاسبه'));

  const totalColIdx = firstRowNorm.findIndex(
    (h) => h.includes('جمع کل') || h === 'مجموع' || h === 'جمع'
  );
  const contractColIdx = firstRowNorm.findIndex(
    (h) => h.includes('قرارداد')
  );

  // Any extra columns not matching metadata/standard tiers/total are custom معاونت/واحد columns
  const knownMetaCols = new Set<number>(
    [
      codeColIdx,
      nameColIdx,
      modeColIdx,
      contractColIdx,
      totalColIdx,
      ...tierColIndices,
    ].filter((idx) => idx >= 0)
  );
  const customColEntries: Array<{ colIdx: number; label: string }> = [];
  if (tierColIndices.filter((idx) => idx >= 0).length >= 3) {
    rows[0].forEach((rawHeader, idx) => {
      const trimmed = rawHeader.replace(/\s+/g, ' ').trim();
      if (!trimmed || knownMetaCols.has(idx)) return;
      customColEntries.push({ colIdx: idx, label: trimmed });
    });
  }

  const isTableFormat =
    tierColIndices.filter((idx) => idx >= 0).length >= 3 ||
    (rows[0].length >= 10 && (codeColIdx >= 0 || nameColIdx >= 0));

  const tierUpdates = new Map<
    string,
    {
      tiers: SalaryTierTuple;
      customTierAmounts: Record<string, number>;
      mode?: SalaryCalculationMode;
    }
  >();
  let skippedRowsCount = 0;

  if (isTableFormat) {
    const startIdx =
      codeColIdx >= 0 || nameColIdx >= 0 || tierColIndices.some((i) => i >= 0)
        ? 1
        : 0;

    for (let r = startIdx; r < rows.length; r += 1) {
      const row = rows[r];
      const rawCode = toEnglishDigits(
        (row[codeColIdx >= 0 ? codeColIdx : 0] ?? '').trim()
      ).toLowerCase();
      const rawName = normalizeHeaderText(
        row[nameColIdx >= 0 ? nameColIdx : 1] ?? ''
      );

      // Skip totals / summary footer rows
      if (rawCode.startsWith('جمع') || rawName.startsWith('جمع کل')) {
        continue;
      }

      const emp = byCode.get(rawCode) ?? byName.get(rawName);
      if (!emp) {
        skippedRowsCount += 1;
        continue;
      }

      const tiers: SalaryTierTuple = [0, 0, 0, 0, 0, 0, 0, 0];
      for (let t = 0; t < SALARY_TIER_LABELS.length; t += 1) {
        const colIdx =
          tierColIndices[t] >= 0 ? tierColIndices[t] : 4 + t;
        tiers[t] = parseExcelNumber(row[colIdx]);
      }

      const customTierAmounts: Record<string, number> = {};
      for (const customCol of customColEntries) {
        const val = parseExcelNumber(row[customCol.colIdx]);
        if (val > 0) {
          customTierAmounts[customCol.label] = val;
        }
      }

      const parsedMode =
        modeColIdx >= 0 ? parseSalaryModeText(row[modeColIdx]) : null;
      const total = sumManualSalaries(tiers) + sumCustomTierAmounts(customTierAmounts);
      if (total > 0 || parsedMode) {
        tierUpdates.set(emp.id, {
          tiers:
            total > 0
              ? tiers
              : normalizeManualSalaries(
                  emp.manualSalaries,
                  emp.baseMonthlySalary,
                  emp.customTierAmounts
                ),
          customTierAmounts:
            total > 0
              ? customTierAmounts
              : normalizeCustomTierAmounts(emp.customTierAmounts),
          mode: parsedMode ?? undefined,
        });
      }
    }

    const updatedEmployees = employees.map((emp) => {
      const upd = tierUpdates.get(emp.id);
      if (!upd) return emp;
      const total =
        sumManualSalaries(upd.tiers) + sumCustomTierAmounts(upd.customTierAmounts);
      return {
        ...emp,
        baseMonthlySalary: total > 0 ? total : emp.baseMonthlySalary,
        manualSalaries: upd.tiers,
        customTierAmounts: upd.customTierAmounts,
        salaryCalculationMode: upd.mode ?? emp.salaryCalculationMode,
      };
    });

    return {
      updatedEmployees,
      matchedEmployeeCount: tierUpdates.size,
      skippedRowsCount,
      formatDetected: 'table-8-tiers',
    };
  }

  // Otherwise handle 3-column format (کد / کد-۱ | نام - عنوان ردیف | مبلغ)
  const hasHeader =
    firstRowNorm[0]?.includes('کد') ||
    firstRowNorm[1]?.includes('نام') ||
    firstRowNorm[2]?.includes('مبلغ');
  const startRow = hasHeader ? 1 : 0;

  for (let r = startRow; r < rows.length; r += 1) {
    const row = rows[r];
    if (row.length < 3) {
      skippedRowsCount += 1;
      continue;
    }
    const rawCode = toEnglishDigits((row[0] ?? '').trim());
    const baseCode = rawCode.replace(/-\d+$/, '').toLowerCase();
    const rawTitle = row[1] ?? '';
    const amount = parseExcelNumber(row[2]);

    const namePart = rawTitle.split('-')[0]?.trim() ?? '';
    const emp =
      byCode.get(baseCode) ?? byName.get(normalizeHeaderText(namePart));
    if (!emp || amount <= 0) {
      skippedRowsCount += 1;
      continue;
    }

    const existing = tierUpdates.get(emp.id)?.tiers ?? [0, 0, 0, 0, 0, 0, 0, 0];
    const normTitle = normalizeHeaderText(rawTitle);
    let tierIdx = normalizedTierLabels.findIndex((lbl) => normTitle.includes(lbl));
    if (tierIdx < 0) {
      // Fall back to sub-code index if present, or first empty slot
      const subMatch = rawCode.match(/-(\d+)$/);
      const subIdx = subMatch ? Number(subMatch[1]) : 0;
      tierIdx = subIdx >= 0 && subIdx < 8 ? subIdx : existing.findIndex((v) => v === 0);
      if (tierIdx < 0) tierIdx = 0;
    }
    existing[tierIdx] += amount;
    tierUpdates.set(emp.id, { tiers: existing, customTierAmounts: {} });
  }

  const updatedEmployees = employees.map((emp) => {
    const upd = tierUpdates.get(emp.id);
    if (!upd) return emp;
    const total = sumManualSalaries(upd.tiers);
    return {
      ...emp,
      baseMonthlySalary: total > 0 ? total : emp.baseMonthlySalary,
      manualSalaries: upd.tiers,
    };
  });

  return {
    updatedEmployees,
    matchedEmployeeCount: tierUpdates.size,
    skippedRowsCount,
    formatDetected: 'three-column',
  };
}

function buildEmployeeLookup(employees: ReadonlyArray<Employee>) {
  const byCode = new Map<string, Employee>();
  const byNationalId = new Map<string, Employee>();
  const byName = new Map<string, Employee>();
  const lastNameCounts = new Map<string, number>();
  const byLastNameRaw = new Map<string, Employee>();

  for (const emp of employees) {
    byCode.set(toEnglishDigits(emp.personnelCode.trim()).toLowerCase(), emp);
    if (emp.nationalId?.trim()) {
      byNationalId.set(toEnglishDigits(emp.nationalId.trim()).toLowerCase(), emp);
    }
    byName.set(normalizeHeaderText(emp.fullName), emp);
    const { lastName } = splitPersianFullName(emp.fullName);
    const normLast = normalizeHeaderText(lastName);
    if (normLast) {
      lastNameCounts.set(normLast, (lastNameCounts.get(normLast) ?? 0) + 1);
      byLastNameRaw.set(normLast, emp);
    }
  }

  const byLastNameUnique = new Map<string, Employee>();
  for (const [normLast, count] of lastNameCounts.entries()) {
    if (count === 1) {
      const emp = byLastNameRaw.get(normLast);
      if (emp) byLastNameUnique.set(normLast, emp);
    }
  }

  return { byCode, byNationalId, byName, byLastNameUnique };
}

function findMatchedEmployee(
  lookup: ReturnType<typeof buildEmployeeLookup>,
  rawCode: string,
  rawNationalId: string,
  rawName: string,
  rawLastName = ''
): Employee | undefined {
  const titleNamePart = rawName.split('-')[0]?.trim() ?? '';
  const normCombined = normalizeHeaderText(rawName);
  const normTitlePart = normalizeHeaderText(titleNamePart);
  const normLast = normalizeHeaderText(rawLastName || titleNamePart || rawName);

  return (
    (rawCode ? lookup.byCode.get(rawCode) : undefined) ??
    (rawNationalId ? lookup.byNationalId.get(rawNationalId) : undefined) ??
    lookup.byName.get(normTitlePart) ??
    lookup.byName.get(normCombined) ??
    lookup.byLastNameUnique.get(normLast)
  );
}

export interface PayrollExcelImportResult {
  timesheetsToUpsert: MonthlyTimesheet[];
  manualPaymentsToAdd: Array<Omit<ManualSalaryPayment, 'id' | 'createdAt'>>;
  matchedCount: number;
  skippedCount: number;
}

/**
 * Imports monthly salary payments or worked days/entered salary from Excel (.xlsx / .csv) rows.
 * Supports:
 * - «ردیف | نام و نام خانوادگی (یا نام خانوادگی) | مبلغ | محل خدمت» (with or without headers)
 * - Separate «نام» + «نام خانوادگی» columns (including 14-column detailed export)
 * - 3-column accounting format (کد پرسنلی | نام - شرح | مبلغ)
 */
export function importPayrollAmountsFromRows(
  rows: ReadonlyArray<ReadonlyArray<string>>,
  employees: ReadonlyArray<Employee>,
  existingTimesheets: ReadonlyArray<MonthlyTimesheet>,
  periodKey: string,
  targetMode: 'manual-payments' | 'timesheet-entered-salary'
): PayrollExcelImportResult {
  if (rows.length === 0) {
    return {
      timesheetsToUpsert: [],
      manualPaymentsToAdd: [],
      matchedCount: 0,
      skippedCount: 0,
    };
  }

  const lookup = buildEmployeeLookup(employees);

  const tsMap = new Map<string, MonthlyTimesheet>();
  for (const ts of existingTimesheets) {
    if (ts.periodKey === periodKey) {
      tsMap.set(ts.employeeId, ts);
    }
  }

  const firstNorm = rows[0].map((c) => normalizeHeaderText(c));
  const rowIndexCol = firstNorm.findIndex((h) => h === 'ردیف' || h === 'شماره ردیف');
  const codeCol = firstNorm.findIndex(
    (h) => h === 'کد پرسنلی' || h === 'کد' || h.includes('کد پرسنلی')
  );
  const nationalIdCol = firstNorm.findIndex(
    (h) => h.includes('کد ملی') || h.includes('پاسپورت')
  );
  const firstNameCol = firstNorm.findIndex((h) => h === 'نام' || h === 'نام کوچک');
  const lastNameCol = firstNorm.findIndex(
    (h) => h === 'نام خانوادگی' || h === 'فامیلی'
  );
  const fullNameCol = firstNorm.findIndex(
    (h) =>
      h.includes('نام و نام خانوادگی') ||
      h.includes('نام کارمند') ||
      (firstNameCol < 0 && lastNameCol < 0 && h.includes('نام'))
  );
  const amountCol = firstNorm.findIndex(
    (h) =>
      h.includes('مجموع پرداختی') ||
      h.includes('مبلغ') ||
      h.includes('پرداختی') ||
      h.includes('خالص') ||
      h.includes('جمع کل') ||
      (h.includes('حقوق') && !h.includes('حقوق دوم'))
  );
  const unitCol = firstNorm.findIndex(
    (h) =>
      h.includes('محل خدمت') ||
      h.includes('نوع استخدام') ||
      h === 'بخش' ||
      h === 'واحد'
  );
  const descCol = firstNorm.findIndex(
    (h) => h.includes('توضیحات') || h.includes('شرح') || h.includes('بابت')
  );
  const hazardCol = firstNorm.findIndex((h) => h.includes('زیان'));
  const nonCalloutCol = firstNorm.findIndex((h) => h.includes('آفیش'));
  const termDateCol = firstNorm.findIndex((h) => h.includes('تاریخ ترک'));
  const secondBonusCol = firstNorm.findIndex(
    (h) => h.includes('حقوق دوم') || h.includes('پاداش غیر مستمر')
  );
  const deduction1Col = firstNorm.findIndex((h) => h.includes('کسورات'));
  const commuteCol = firstNorm.findIndex((h) => h.includes('ایاب'));
  const daysCol = firstNorm.findIndex((h) => h.includes('کارکرد'));

  const firstRowHasNumericMoney = rows[0].some((c) => {
    const cleaned = toEnglishDigits(c.trim()).replace(/,/g, '');
    return /^\d{4,}$/.test(cleaned);
  });

  const hasHeader =
    !firstRowHasNumericMoney &&
    (rowIndexCol >= 0 ||
      codeCol >= 0 ||
      nationalIdCol >= 0 ||
      firstNameCol >= 0 ||
      lastNameCol >= 0 ||
      fullNameCol >= 0 ||
      amountCol >= 0 ||
      unitCol >= 0 ||
      daysCol >= 0);
  const startRow = hasHeader ? 1 : 0;

  const [y, m] = periodKey.split('-');
  const defaultPayDate = `${y}/${m}/25`;

  const manualPaymentsToAdd: Array<Omit<ManualSalaryPayment, 'id' | 'createdAt'>> = [];
  const upsertedMap = new Map<string, MonthlyTimesheet>();
  let matchedCount = 0;
  let skippedCount = 0;

  for (let r = startRow; r < rows.length; r += 1) {
    const row = rows[r];
    if (!row || row.every((c) => !c.trim())) continue;

    let rawCode = '';
    if (codeCol >= 0) {
      rawCode = toEnglishDigits((row[codeCol] ?? '').trim())
        .replace(/-\d+$/, '')
        .toLowerCase();
    } else if (!hasHeader && rowIndexCol < 0) {
      const col0 = toEnglishDigits((row[0] ?? '').trim())
        .replace(/-\d+$/, '')
        .toLowerCase();
      if (lookup.byCode.has(col0)) {
        rawCode = col0;
      }
    }

    const rawNationalId =
      nationalIdCol >= 0
        ? toEnglishDigits((row[nationalIdCol] ?? '').trim()).toLowerCase()
        : '';

    let rawName = '';
    let rawLastName = '';
    if (firstNameCol >= 0 && lastNameCol >= 0 && firstNameCol !== lastNameCol) {
      const fn = (row[firstNameCol] ?? '').trim();
      const ln = (row[lastNameCol] ?? '').trim();
      rawName = `${fn} ${ln}`.trim();
      rawLastName = ln;
    } else if (fullNameCol >= 0) {
      rawName = (row[fullNameCol] ?? '').trim();
      rawLastName = rawName;
    } else if (lastNameCol >= 0) {
      rawName = (row[lastNameCol] ?? '').trim();
      rawLastName = rawName;
    } else if (firstNameCol >= 0) {
      rawName = (row[firstNameCol] ?? '').trim();
    } else {
      rawName = (row[1] ?? '').trim();
      rawLastName = rawName;
    }

    if (
      rawCode.startsWith('جمع') ||
      normalizeHeaderText(rawName).startsWith('جمع کل') ||
      normalizeHeaderText(row[0] ?? '').startsWith('جمع کل')
    ) {
      continue;
    }

    const emp = findMatchedEmployee(
      lookup,
      rawCode,
      rawNationalId,
      rawName,
      rawLastName
    );

    if (!emp) {
      skippedCount += 1;
      continue;
    }

    const amountIdx =
      amountCol >= 0
        ? amountCol
        : !hasHeader && row.length >= 4
          ? 2
          : row.length >= 3
            ? row.length - 1
            : 2;
    const amount = parseExcelNumber(row[amountIdx]);
    const workedDays =
      daysCol >= 0 ? Number(toEnglishDigits(row[daysCol] ?? '')) || 0 : 0;

    if (amount <= 0 && workedDays <= 0) {
      skippedCount += 1;
      continue;
    }

    matchedCount += 1;

    if (targetMode === 'manual-payments') {
      if (amount > 0) {
        const rawDesc = descCol >= 0 ? (row[descCol] ?? '').trim() : '';
        const descPart =
          rawDesc ||
          (rawName.includes('-')
            ? rawName.split('-').slice(1).join('-').trim()
            : 'ورود گروهی از فایل اکسل');
        const resolvedLocationCol =
          unitCol >= 0 ? unitCol : !hasHeader && row.length >= 4 ? 3 : -1;
        const rawLocation =
          resolvedLocationCol >= 0 ? (row[resolvedLocationCol] ?? '').trim() : '';

        manualPaymentsToAdd.push({
          employeeId: emp.id,
          periodKey,
          amount,
          mode: 'override',
          paymentDate: defaultPayDate,
          description: descPart || 'ورود گروهی از فایل اکسل',
          referenceCode: rawCode || emp.personnelCode,
          unitType: rawLocation || undefined,
          workLocation: rawLocation || undefined,
          hazardPay: hazardCol >= 0 ? parseExcelNumber(row[hazardCol]) : undefined,
          nonCalloutPay:
            nonCalloutCol >= 0 ? parseExcelNumber(row[nonCalloutCol]) : undefined,
          terminationDate:
            termDateCol >= 0 ? (row[termDateCol] ?? '').trim() || undefined : undefined,
          secondSalaryBonus:
            secondBonusCol >= 0 ? parseExcelNumber(row[secondBonusCol]) : undefined,
          deduction1:
            deduction1Col >= 0 ? parseExcelNumber(row[deduction1Col]) : undefined,
          commuteAllowance:
            commuteCol >= 0 ? parseExcelNumber(row[commuteCol]) : undefined,
        });
      }
    } else {
      const baseTs =
        upsertedMap.get(emp.id) ??
        tsMap.get(emp.id) ??
        createEmptyTimesheet(emp.id, periodKey);
      upsertedMap.set(emp.id, {
        ...baseTs,
        enteredSalary: amount > 0 ? amount : baseTs.enteredSalary,
        workingDays: workedDays > 0 ? workedDays : baseTs.workingDays,
      });
    }
  }

  return {
    timesheetsToUpsert: Array.from(upsertedMap.values()),
    manualPaymentsToAdd,
    matchedCount,
    skippedCount,
  };
}

export interface ManualSalary2ImportedRow {
  employeeId: string;
  amount: number;
  mode: ManualSalaryMode;
  unitType?: string;
  description: string;
  hazardPay?: number;
  nonCalloutPay?: number;
  terminationDate?: string;
  secondSalaryBonus?: number;
  deduction1?: number;
  commuteAllowance?: number;
}

export interface ManualSalary2ExcelImportResult {
  matchedRows: ManualSalary2ImportedRow[];
  matchedCount: number;
  skippedCount: number;
}

function parseManualPaymentModeText(
  raw: string | undefined,
  fallback: ManualSalaryMode
): ManualSalaryMode {
  if (!raw) return fallback;
  const text = normalizeHeaderText(raw);
  if (text.includes('مجزا') || text.includes('اضافه')) return 'additional';
  if (text.includes('جایگزین') || text.includes('توافقی')) return 'override';
  return fallback;
}

/**
 * Imports employee salaries for «پرداخت حقوق دستی ۲» from:
 * 1. Exported RTL table (.xlsx/.csv) or 14-column detailed export
 * 2. «ردیف | نام خانوادگی (یا نام و نام خانوادگی) | مبلغ | محل خدمت» (with or without header)
 * 3. 3-column accounting sheets (کد | نام | مبلغ)
 * 4. Simple 2-column sheets (نام یا کد | مبلغ حقوق)
 */
export function importManualSalary2FromRows(
  rows: ReadonlyArray<ReadonlyArray<string>>,
  employees: ReadonlyArray<Employee>,
  defaultMode: ManualSalaryMode = 'override'
): ManualSalary2ExcelImportResult {
  if (rows.length === 0) {
    return { matchedRows: [], matchedCount: 0, skippedCount: 0 };
  }

  const lookup = buildEmployeeLookup(employees);

  const firstNorm = rows[0].map((c) => normalizeHeaderText(c));
  const rowIndexCol = firstNorm.findIndex((h) => h === 'ردیف' || h === 'شماره ردیف');
  let codeCol = firstNorm.findIndex(
    (h) => h === 'کد پرسنلی' || h === 'کد' || h.includes('کد پرسنلی')
  );
  if (codeCol < 0) {
    codeCol = firstNorm.findIndex(
      (h) => h.includes('کد') && !h.includes('ملی')
    );
  }
  const nationalIdCol = firstNorm.findIndex(
    (h) => h.includes('کد ملی') || h.includes('پاسپورت')
  );
  const firstNameCol = firstNorm.findIndex((h) => h === 'نام' || h === 'نام کوچک');
  const lastNameCol = firstNorm.findIndex(
    (h) => h === 'نام خانوادگی' || h === 'فامیلی'
  );
  const fullNameCol = firstNorm.findIndex(
    (h) =>
      h.includes('نام و نام خانوادگی') ||
      h.includes('نام کارمند') ||
      (firstNameCol < 0 && lastNameCol < 0 && h.includes('نام'))
  );
  const modeCol = firstNorm.findIndex(
    (h) => h.includes('نحوه محاسبه') || h.includes('نوع پرداخت')
  );
  const unitCol = firstNorm.findIndex(
    (h) =>
      h.includes('محل خدمت') ||
      h.includes('نوع استخدام') ||
      h === 'بخش' ||
      h === 'واحد'
  );
  // Prefer explicit manual salary / مجموع پرداختی header over baseMonthlySalary
  let amountCol = firstNorm.findIndex(
    (h) =>
      h.includes('مبلغ حقوق دستی') ||
      h.includes('حقوق دستی') ||
      h.includes('مجموع پرداختی') ||
      h.includes('پرداختی') ||
      h.includes('خالص')
  );
  if (amountCol < 0) {
    amountCol = firstNorm.findIndex(
      (h) =>
        h.includes('مبلغ') ||
        (h.includes('حقوق') &&
          !h.includes('حقوق پایه') &&
          !h.includes('حقوق دوم'))
    );
  }
  if (amountCol < 0) {
    amountCol = firstNorm.findIndex(
      (h) => h.includes('حقوق') && !h.includes('حقوق دوم')
    );
  }
  const descCol = firstNorm.findIndex(
    (h) => h.includes('توضیحات') || h.includes('شرح') || h.includes('بابت')
  );
  const hazardCol = firstNorm.findIndex((h) => h.includes('زیان'));
  const nonCalloutCol = firstNorm.findIndex((h) => h.includes('آفیش'));
  const termDateCol = firstNorm.findIndex((h) => h.includes('تاریخ ترک'));
  const secondBonusCol = firstNorm.findIndex(
    (h) => h.includes('حقوق دوم') || h.includes('پاداش غیر مستمر')
  );
  const deduction1Col = firstNorm.findIndex((h) => h.includes('کسورات'));
  const commuteCol = firstNorm.findIndex((h) => h.includes('ایاب'));

  const firstRowHasNumericMoney = rows[0].some((c) => {
    const cleaned = toEnglishDigits(c.trim()).replace(/,/g, '');
    return /^\d{4,}$/.test(cleaned);
  });

  const hasHeader =
    !firstRowHasNumericMoney &&
    (rowIndexCol >= 0 ||
      codeCol >= 0 ||
      nationalIdCol >= 0 ||
      firstNameCol >= 0 ||
      lastNameCol >= 0 ||
      fullNameCol >= 0 ||
      amountCol >= 0 ||
      modeCol >= 0 ||
      unitCol >= 0 ||
      descCol >= 0);
  const startRow = hasHeader ? 1 : 0;

  const aggregatedByEmployee = new Map<string, ManualSalary2ImportedRow>();
  let skippedCount = 0;

  for (let r = startRow; r < rows.length; r += 1) {
    const row = rows[r];
    if (!row || row.every((c) => !c.trim())) continue;

    let rawCode = '';
    let rawName = '';
    let rawLastName = '';

    if (hasHeader) {
      if (codeCol >= 0) {
        rawCode = toEnglishDigits((row[codeCol] ?? '').trim())
          .replace(/-\d+$/, '')
          .toLowerCase();
      }
      if (firstNameCol >= 0 && lastNameCol >= 0 && firstNameCol !== lastNameCol) {
        const fn = (row[firstNameCol] ?? '').trim();
        const ln = (row[lastNameCol] ?? '').trim();
        rawName = `${fn} ${ln}`.trim();
        rawLastName = ln;
      } else if (fullNameCol >= 0) {
        rawName = (row[fullNameCol] ?? '').trim();
        rawLastName = rawName;
      } else if (lastNameCol >= 0) {
        rawName = (row[lastNameCol] ?? '').trim();
        rawLastName = rawName;
      } else if (firstNameCol >= 0) {
        rawName = (row[firstNameCol] ?? '').trim();
      }
    } else if (row.length === 2) {
      const col0 = row[0] ?? '';
      const maybeCode = toEnglishDigits(col0.trim()).replace(/-\d+$/, '').toLowerCase();
      if (lookup.byCode.has(maybeCode)) {
        rawCode = maybeCode;
      }
      rawName = col0.trim();
      rawLastName = rawName;
    } else {
      const col0Code = toEnglishDigits((row[0] ?? '').trim())
        .replace(/-\d+$/, '')
        .toLowerCase();
      if (lookup.byCode.has(col0Code)) {
        rawCode = col0Code;
      }
      rawName = (row[1] ?? '').trim();
      rawLastName = rawName;
    }

    const rawNationalId =
      nationalIdCol >= 0
        ? toEnglishDigits((row[nationalIdCol] ?? '').trim()).toLowerCase()
        : '';

    const normName = normalizeHeaderText(rawName);
    const col0Norm = normalizeHeaderText(row[0] ?? '');

    if (
      rawCode.startsWith('جمع') ||
      col0Norm.startsWith('جمع کل') ||
      normName.startsWith('جمع کل') ||
      normName.startsWith('مجموع')
    ) {
      continue;
    }

    const emp = findMatchedEmployee(
      lookup,
      rawCode,
      rawNationalId,
      rawName,
      rawLastName
    );

    if (!emp) {
      skippedCount += 1;
      continue;
    }

    const resolvedAmountCol =
      amountCol >= 0
        ? amountCol
        : row.length === 2
          ? 1
          : row.length >= 4 && !hasHeader
            ? 2
            : row.length >= 3
              ? 2
              : 1;
    const amount = parseExcelNumber(row[resolvedAmountCol]);
    if (amount <= 0) {
      skippedCount += 1;
      continue;
    }

    const parsedMode =
      modeCol >= 0
        ? parseManualPaymentModeText(row[modeCol], defaultMode)
        : defaultMode;
    const resolvedUnitCol =
      unitCol >= 0 ? unitCol : !hasHeader && row.length >= 4 ? 3 : -1;
    const rawUnitType =
      resolvedUnitCol >= 0 ? (row[resolvedUnitCol] ?? '').trim() : '';
    const rawDesc = descCol >= 0 ? (row[descCol] ?? '').trim() : '';
    const derivedDesc =
      rawDesc ||
      (rawName.includes('-') ? rawName.split('-').slice(1).join('-').trim() : '');

    const hazardPay = hazardCol >= 0 ? parseExcelNumber(row[hazardCol]) : undefined;
    const nonCalloutPay =
      nonCalloutCol >= 0 ? parseExcelNumber(row[nonCalloutCol]) : undefined;
    const terminationDate =
      termDateCol >= 0 ? (row[termDateCol] ?? '').trim() || undefined : undefined;
    const secondSalaryBonus =
      secondBonusCol >= 0 ? parseExcelNumber(row[secondBonusCol]) : undefined;
    const deduction1 =
      deduction1Col >= 0 ? parseExcelNumber(row[deduction1Col]) : undefined;
    const commuteAllowance =
      commuteCol >= 0 ? parseExcelNumber(row[commuteCol]) : undefined;

    const prev = aggregatedByEmployee.get(emp.id);
    if (prev) {
      aggregatedByEmployee.set(emp.id, {
        employeeId: emp.id,
        amount: prev.amount + amount,
        mode: parsedMode,
        unitType: rawUnitType || prev.unitType,
        description: derivedDesc || prev.description,
        hazardPay:
          hazardPay !== undefined || prev.hazardPay !== undefined
            ? (prev.hazardPay ?? 0) + (hazardPay ?? 0)
            : undefined,
        nonCalloutPay:
          nonCalloutPay !== undefined || prev.nonCalloutPay !== undefined
            ? (prev.nonCalloutPay ?? 0) + (nonCalloutPay ?? 0)
            : undefined,
        terminationDate: terminationDate || prev.terminationDate,
        secondSalaryBonus:
          secondSalaryBonus !== undefined || prev.secondSalaryBonus !== undefined
            ? (prev.secondSalaryBonus ?? 0) + (secondSalaryBonus ?? 0)
            : undefined,
        deduction1:
          deduction1 !== undefined || prev.deduction1 !== undefined
            ? (prev.deduction1 ?? 0) + (deduction1 ?? 0)
            : undefined,
        commuteAllowance:
          commuteAllowance !== undefined || prev.commuteAllowance !== undefined
            ? (prev.commuteAllowance ?? 0) + (commuteAllowance ?? 0)
            : undefined,
      });
    } else {
      aggregatedByEmployee.set(emp.id, {
        employeeId: emp.id,
        amount,
        mode: parsedMode,
        unitType: rawUnitType || undefined,
        description: derivedDesc,
        hazardPay,
        nonCalloutPay,
        terminationDate,
        secondSalaryBonus,
        deduction1,
        commuteAllowance,
      });
    }
  }

  const matchedRows = Array.from(aggregatedByEmployee.values());
  return {
    matchedRows,
    matchedCount: matchedRows.length,
    skippedCount,
  };
}

function parseEmploymentTypeText(raw: string | undefined): {
  employmentType: EmploymentType;
  customContractTitle?: string;
} {
  const trimmed = raw?.trim() ?? '';
  const norm = normalizeHeaderText(trimmed);
  if (!norm) return { employmentType: 'employed' };
  if (norm.includes('28') || norm.includes('۲۸')) return { employmentType: 'article-28' };
  if (norm.includes('38') || norm.includes('۳۸')) return { employmentType: 'article-38' };
  if (norm.includes('سروش') || norm.includes('شرکتی')) {
    return { employmentType: 'sherkati-soroush' };
  }
  if (norm.includes('بازنشسته')) return { employmentType: 'retired' };
  if (norm.includes('رسمی') || norm.includes('شاغل')) {
    return { employmentType: 'employed' };
  }
  return { employmentType: 'custom', customContractTitle: trimmed };
}

function parseMaritalText(raw: string | undefined): MaritalStatus | null {
  const norm = normalizeHeaderText(raw ?? '');
  if (!norm) return null;
  if (norm.includes('متاهل') || norm.includes('متأهل')) return 'married';
  if (norm.includes('مجرد')) return 'single';
  return null;
}

function parseActiveStatusText(raw: string | undefined): boolean | null {
  const norm = normalizeHeaderText(raw ?? '');
  if (!norm) return null;
  if (norm.includes('غیرفعال') || norm.includes('غیر فعال') || norm === '0' || norm === 'no') {
    return false;
  }
  if (norm.includes('فعال') || norm === '1' || norm === 'yes') {
    return true;
  }
  return null;
}

export interface EmployeeExcelImportResult {
  updatedEmployees: Employee[];
  createdCount: number;
  updatedCount: number;
  skippedCount: number;
}

/**
 * Imports employee master profiles from Excel/CSV rows exported by buildEmployeesXlsx
 * or custom spreadsheets. Updates existing employees matched by کد پرسنلی / کد ملی / نام
 * and adds brand-new employees for unmatched rows with valid names.
 */
export function importEmployeesFromRows(
  rows: ReadonlyArray<ReadonlyArray<string>>,
  existingEmployees: ReadonlyArray<Employee>
): EmployeeExcelImportResult {
  if (rows.length === 0) {
    return {
      updatedEmployees: [...existingEmployees],
      createdCount: 0,
      updatedCount: 0,
      skippedCount: 0,
    };
  }

  const headers = rows[0].map((c) => normalizeHeaderText(c));
  const codeCol = headers.findIndex(
    (h) => h === 'کد پرسنلی' || h === 'کد' || h.includes('کد پرسنلی')
  );
  const firstNameCol = headers.findIndex((h) => h === 'نام' || h === 'نام کوچک');
  const lastNameCol = headers.findIndex(
    (h) => h === 'نام خانوادگی' || h === 'فامیلی'
  );
  const fullNameCol = headers.findIndex(
    (h) =>
      h.includes('نام و نام خانوادگی') ||
      h.includes('نام کارمند') ||
      (firstNameCol < 0 && lastNameCol < 0 && h.includes('نام'))
  );
  const nationalIdCol = headers.findIndex((h) => h.includes('کد ملی'));
  const deptCol = headers.findIndex(
    (h) => h.includes('دپارتمان') || h === 'واحد' || h.includes('معاونت')
  );
  const jobCol = headers.findIndex((h) => h.includes('سمت') || h.includes('شغل'));
  const locCol = headers.findIndex((h) => h.includes('محل خدمت'));
  const mobileCol = headers.findIndex((h) => h.includes('موبایل') || h.includes('همراه'));
  const phoneCol = headers.findIndex((h) => h.includes('تلفن'));
  const contractCol = headers.findIndex((h) => h.includes('قرارداد'));
  const modeCol = headers.findIndex((h) => h.includes('روش محاسبه'));
  const salaryCol = headers.findIndex(
    (h) => h.includes('حقوق پایه') || h === 'حقوق' || h.includes('مبلغ حقوق')
  );
  const seniorityCol = headers.findIndex((h) => h.includes('سنوات'));
  const insCapCol = headers.findIndex((h) => h.includes('سقف بیمه'));
  const maritalCol = headers.findIndex((h) => h.includes('تاهل'));
  const childrenCol = headers.findIndex((h) => h.includes('فرزند') || h.includes('اولاد'));
  const bankNameCol = headers.findIndex((h) => h.includes('نام بانک') || h === 'بانک');
  const bankAccCol = headers.findIndex((h) => h.includes('حساب') || h.includes('شبا'));
  const hireDateCol = headers.findIndex((h) => h.includes('تاریخ استخدام') || h.includes('تاریخ آغاز'));
  const statusCol = headers.findIndex((h) => h === 'وضعیت');

  const hasHeader =
    codeCol >= 0 ||
    fullNameCol >= 0 ||
    firstNameCol >= 0 ||
    lastNameCol >= 0 ||
    nationalIdCol >= 0 ||
    deptCol >= 0 ||
    salaryCol >= 0;
  const startRow = hasHeader ? 1 : 0;

  let nextCodeCounter =
    existingEmployees.reduce((max, emp) => {
      const n = parseInt(toEnglishDigits(emp.personnelCode), 10);
      return Number.isFinite(n) ? Math.max(max, n) : max;
    }, 1000) + 1;

  const workingList = existingEmployees.map((emp) => ({ ...emp }));
  const lookup = buildEmployeeLookup(workingList);

  let createdCount = 0;
  let updatedCount = 0;
  let skippedCount = 0;
  const nowSeed = Date.now();

  for (let r = startRow; r < rows.length; r += 1) {
    const row = rows[r];
    if (!row || row.every((c) => !c.trim())) continue;

    const rawCode = toEnglishDigits(
      (row[codeCol >= 0 ? codeCol : 0] ?? '').trim()
    );
    const rawNationalId =
      nationalIdCol >= 0
        ? toEnglishDigits((row[nationalIdCol] ?? '').trim())
        : '';

    let rawFullName = '';
    if (firstNameCol >= 0 && lastNameCol >= 0 && firstNameCol !== lastNameCol) {
      rawFullName = `${(row[firstNameCol] ?? '').trim()} ${(row[lastNameCol] ?? '').trim()}`.trim();
    } else if (fullNameCol >= 0) {
      rawFullName = (row[fullNameCol] ?? '').trim();
    } else if (!hasHeader) {
      rawFullName = (row[1] ?? '').trim();
    }

    const normFirst = normalizeHeaderText(row[0] ?? '');
    const normFull = normalizeHeaderText(rawFullName);
    if (
      normFirst.startsWith('جمع کل') ||
      normFull.startsWith('جمع کل') ||
      normFull.startsWith('مجموع')
    ) {
      continue;
    }

    if (!rawFullName && !rawCode) {
      skippedCount += 1;
      continue;
    }

    const matched = findMatchedEmployee(
      lookup,
      rawCode.toLowerCase(),
      rawNationalId.toLowerCase(),
      rawFullName
    );

    const parsedSalary = salaryCol >= 0 ? parseExcelNumber(row[salaryCol]) : 0;
    const parsedSeniority =
      seniorityCol >= 0 ? parseExcelNumber(row[seniorityCol]) : undefined;
    const parsedInsCap =
      insCapCol >= 0 ? parseExcelNumber(row[insCapCol]) : undefined;
    const parsedChildren =
      childrenCol >= 0 ? parseExcelNumber(row[childrenCol]) : undefined;
    const parsedMarital =
      maritalCol >= 0 ? parseMaritalText(row[maritalCol]) : null;
    const parsedActive =
      statusCol >= 0 ? parseActiveStatusText(row[statusCol]) : null;
    const parsedMode =
      modeCol >= 0 ? parseSalaryModeText(row[modeCol]) : null;
    const parsedContract =
      contractCol >= 0 && (row[contractCol] ?? '').trim()
        ? parseEmploymentTypeText(row[contractCol])
        : null;
    const rawBankAcc =
      bankAccCol >= 0 ? toEnglishDigits((row[bankAccCol] ?? '').trim()) : '';
    const rawBankName = bankNameCol >= 0 ? (row[bankNameCol] ?? '').trim() : '';
    const detectedBank = rawBankAcc ? detectBankFromSheba(rawBankAcc) : null;

    if (matched) {
      const idx = workingList.findIndex((e) => e.id === matched.id);
      if (idx < 0) continue;
      const cur = workingList[idx];
      const nextSalary = parsedSalary > 0 ? parsedSalary : cur.baseMonthlySalary;
      const nextCustom = normalizeCustomTierAmounts(cur.customTierAmounts);
      const nextTiers =
        parsedSalary > 0 && parsedSalary !== cur.baseMonthlySalary
          ? [parsedSalary, 0, 0, 0, 0, 0, 0, 0]
          : normalizeManualSalaries(
              cur.manualSalaries,
              nextSalary,
              nextCustom
            );

      workingList[idx] = {
        ...cur,
        personnelCode: rawCode || cur.personnelCode,
        fullName: rawFullName || cur.fullName,
        nationalId: rawNationalId || cur.nationalId,
        department: (deptCol >= 0 ? row[deptCol]?.trim() : '') || cur.department,
        jobTitle: (jobCol >= 0 ? row[jobCol]?.trim() : '') || cur.jobTitle,
        workLocation: (locCol >= 0 ? row[locCol]?.trim() : '') || cur.workLocation,
        mobileNumber:
          mobileCol >= 0 && row[mobileCol]?.trim()
            ? toEnglishDigits(row[mobileCol].trim())
            : cur.mobileNumber,
        workPhone:
          phoneCol >= 0 && row[phoneCol]?.trim()
            ? toEnglishDigits(row[phoneCol].trim())
            : cur.workPhone,
        employmentType: parsedContract?.employmentType ?? cur.employmentType,
        customContractTitle:
          parsedContract?.employmentType === 'custom'
            ? parsedContract.customContractTitle ?? cur.customContractTitle
            : parsedContract
              ? ''
              : cur.customContractTitle,
        salaryCalculationMode: parsedMode ?? cur.salaryCalculationMode,
        baseMonthlySalary: nextSalary,
        seniorityAllowance:
          parsedSeniority !== undefined ? parsedSeniority : cur.seniorityAllowance,
        insuranceBaseCap:
          parsedInsCap !== undefined ? parsedInsCap : cur.insuranceBaseCap,
        manualSalaries: nextTiers,
        customTierAmounts:
          parsedSalary > 0 && parsedSalary !== cur.baseMonthlySalary ? {} : nextCustom,
        maritalStatus: parsedMarital ?? cur.maritalStatus,
        childrenCount:
          parsedChildren !== undefined ? parsedChildren : cur.childrenCount,
        bankName: rawBankName || detectedBank || cur.bankName,
        bankAccount: rawBankAcc || cur.bankAccount,
        hireDate:
          hireDateCol >= 0 && row[hireDateCol]?.trim()
            ? toEnglishDigits(row[hireDateCol].trim())
            : cur.hireDate,
        isActive: parsedActive ?? cur.isActive,
      };
      updatedCount += 1;
    } else {
      if (!rawFullName) {
        skippedCount += 1;
        continue;
      }
      const codeToUse = rawCode || String(nextCodeCounter++);
      const dept = (deptCol >= 0 ? row[deptCol]?.trim() : '') || 'عمومی';
      const workLoc = (locCol >= 0 ? row[locCol]?.trim() : '') || dept || 'ستاد مرکزی';
      const baseSalary = parsedSalary > 0 ? parsedSalary : 15_000_000;
      const newEmp: Employee = {
        id: `emp-imp-${nowSeed}-${r}`,
        personnelCode: codeToUse,
        fullName: rawFullName,
        nationalId: rawNationalId || String(1000000000 + r).slice(0, 10),
        department: dept,
        jobTitle: (jobCol >= 0 ? row[jobCol]?.trim() : '') || 'کارشناس',
        workLocation: workLoc,
        mobileNumber:
          mobileCol >= 0 ? toEnglishDigits((row[mobileCol] ?? '').trim()) : '',
        workPhone:
          phoneCol >= 0 ? toEnglishDigits((row[phoneCol] ?? '').trim()) : '',
        employmentType: parsedContract?.employmentType ?? 'employed',
        customContractTitle: parsedContract?.customContractTitle ?? '',
        salaryCalculationMode: parsedMode ?? 'daily-divided',
        allowanceFlags: { ...DEFAULT_ALLOWANCE_FLAGS },
        baseMonthlySalary: baseSalary,
        seniorityAllowance: parsedSeniority ?? 0,
        insuranceBaseCap: parsedInsCap ?? 0,
        manualSalaries: [baseSalary, 0, 0, 0, 0, 0, 0, 0],
        customTierAmounts: {},
        maritalStatus: parsedMarital ?? 'single',
        childrenCount: parsedChildren ?? 0,
        bankName: rawBankName || detectedBank || 'بانک ملی ایران',
        bankAccount: rawBankAcc,
        hireDate:
          hireDateCol >= 0 && row[hireDateCol]?.trim()
            ? toEnglishDigits(row[hireDateCol].trim())
            : '1405/01/01',
        isActive: parsedActive ?? true,
      };
      workingList.push(newEmp);
      lookup.byCode.set(codeToUse.toLowerCase(), newEmp);
      lookup.byName.set(normalizeHeaderText(rawFullName), newEmp);
      createdCount += 1;
    }
  }

  return {
    updatedEmployees: workingList,
    createdCount,
    updatedCount,
    skippedCount,
  };
}



