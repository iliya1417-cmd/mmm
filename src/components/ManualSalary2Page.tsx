import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  Eraser,
  FileSpreadsheet,
  Lock,
  Search,
  Sparkles,
  Upload,
  X,
} from 'lucide-react';
import type {
  CurrencyUnit,
  Employee,
  ManualSalaryMode,
  ManualSalaryPayment,
  MonthlyTimesheet,
} from '../types/payroll';
import {
  ALL_EMPLOYMENT_TYPES,
  formatMoney,
  formatPeriodLabel,
  getEmploymentTypeLabel,
  isOfficialOrRetiredContract,
  parseNumericInput,
  resolveManualSalaryUnitType,
  splitPersianFullName,
  toPersianDigits,
} from '../utils/payroll';
import {
  CUSTOM_UNIT_SENTINEL,
  buildWorkLocationSelectGroups,
} from '../utils/unitOptions';
import {
  ALL_MANUAL_SALARY_MODES,
  createDefaultMultiSelectFilters,
  extractEmployeeDepartments,
  matchesMultiSelectManualSalaryFilters,
  type MultiSelectManualSalaryFilters,
} from '../utils/manualSalaryFilter';
import {
  buildManualSalary2Drafts,
  hasManualSalary2DraftChanged,
  type ManualSalary2DraftRow,
  type ManualSalary2RowUpdate,
} from '../utils/manualSalary2';
import {
  downloadManualSalary2TableXlsx,
  downloadManualSalaryDetailedXlsx,
  downloadManualSalaryImportModelXlsx,
  downloadOfficialShiftAllowanceXlsx,
  resolveExportNameForImportModel,
  type ManualSalary2ExcelEntry,
  type ManualSalaryDetailedExportRow,
  type ManualSalaryImportModelRow,
  type ShiftPayExportRow,
} from '../utils/xlsxExport';
import {
  importManualSalary2FromRows,
  parseSpreadsheetFile,
} from '../utils/xlsxImport';
import { filterEmployees } from '../utils/employeeFilter';
import { CollapsibleCard } from './CollapsibleCard';
import { ManualSalaryFilterBar } from './ManualSalaryFilterBar';

interface ManualSalary2PageProps {
  employees: Employee[];
  manualPayments: ManualSalaryPayment[];
  timesheets?: MonthlyTimesheet[];
  currency: CurrencyUnit;
  periodKey: string;
  canEnterManualSalary2: boolean;
  onUpsertManualPayments: (updates: ManualSalary2RowUpdate[]) => void;
}

export const ManualSalary2Page: React.FC<ManualSalary2PageProps> = ({
  employees,
  manualPayments,
  timesheets = [],
  currency,
  periodKey,
  canEnterManualSalary2,
  onUpsertManualPayments,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>(
    'all'
  );
  const [defaultImportMode, setDefaultImportMode] =
    useState<ManualSalaryMode>('override');

  const departments = useMemo(
    () => extractEmployeeDepartments(employees),
    [employees]
  );
  const [filters, setFilters] = useState<MultiSelectManualSalaryFilters>(() =>
    createDefaultMultiSelectFilters(employees)
  );
  const knownDepartmentsRef = useRef<Set<string>>(new Set(departments));

  useEffect(() => {
    const brandNewDepts = departments.filter(
      (d) => !knownDepartmentsRef.current.has(d)
    );
    if (brandNewDepts.length > 0) {
      brandNewDepts.forEach((d) => knownDepartmentsRef.current.add(d));
      setFilters((prev) => ({
        ...prev,
        selectedDepartments: [...prev.selectedDepartments, ...brandNewDepts],
      }));
    }
  }, [departments]);

  const savedDrafts = useMemo(
    () =>
      buildManualSalary2Drafts(
        employees,
        manualPayments,
        periodKey,
        defaultImportMode
      ),
    [employees, manualPayments, periodKey, defaultImportMode]
  );

  const [drafts, setDrafts] = useState<Record<string, ManualSalary2DraftRow>>(
    savedDrafts
  );
  const [customUnitRows, setCustomUnitRows] = useState<Record<string, boolean>>(
    {}
  );
  const [savedToast, setSavedToast] = useState<string | null>(null);
  const [importStatus, setImportStatus] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);
  const excelInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setDrafts(savedDrafts);
  }, [savedDrafts]);

  const timesheetMap = useMemo(() => {
    const map = new Map<string, MonthlyTimesheet>();
    for (const ts of timesheets) {
      if (ts.periodKey === periodKey) {
        map.set(ts.employeeId, ts);
      }
    }
    return map;
  }, [timesheets, periodKey]);

  const getDraft = (emp: Employee): ManualSalary2DraftRow =>
    drafts[emp.id] ?? {
      employeeId: emp.id,
      amountInput: '',
      mode: defaultImportMode,
      unitType: resolveManualSalaryUnitType(emp),
      description: '',
    };

  const displayedEmployees = useMemo(() => {
    const baseFiltered = filterEmployees(employees, {
      searchQuery,
      departmentFilter: 'all',
      contractFilter: 'all',
      statusFilter,
    });
    return baseFiltered.filter((emp) => {
      const empMode = drafts[emp.id]?.mode ?? defaultImportMode;
      return matchesMultiSelectManualSalaryFilters(emp, empMode, filters);
    });
  }, [employees, searchQuery, statusFilter, drafts, defaultImportMode, filters]);

  const hasActiveFilters = Boolean(
    searchQuery.trim() ||
      statusFilter !== 'all' ||
      filters.selectedDepartments.length < departments.length ||
      filters.selectedContracts.length < ALL_EMPLOYMENT_TYPES.length ||
      filters.selectedModes.length < ALL_MANUAL_SALARY_MODES.length
  );

  const resetAllFilters = () => {
    setSearchQuery('');
    setStatusFilter('all');
    setFilters(createDefaultMultiSelectFilters(employees));
  };

  const modifiedEmployees = useMemo(
    () =>
      employees.filter((emp) =>
        hasManualSalary2DraftChanged(drafts[emp.id], savedDrafts[emp.id])
      ),
    [employees, drafts, savedDrafts]
  );

  const employeesWithAmountCount = useMemo(
    () =>
      employees.filter((emp) => parseNumericInput(getDraft(emp).amountInput) > 0)
        .length,
    [employees, drafts]
  );

  const totalDraftManualAmount = useMemo(
    () =>
      employees.reduce(
        (sum, emp) => sum + parseNumericInput(getDraft(emp).amountInput),
        0
      ),
    [employees, drafts]
  );

  const totalDisplayedManualAmount = useMemo(
    () =>
      displayedEmployees.reduce(
        (sum, emp) => sum + parseNumericInput(getDraft(emp).amountInput),
        0
      ),
    [displayedEmployees, drafts]
  );

  const totalActiveBasePayroll = useMemo(
    () =>
      employees
        .filter((e) => e.isActive)
        .reduce((sum, emp) => sum + Math.max(0, Math.round(emp.baseMonthlySalary)), 0),
    [employees]
  );

  const shiftEligibleRows = useMemo(() => {
    const rows: ShiftPayExportRow[] = [];
    for (const emp of displayedEmployees) {
      if (!isOfficialOrRetiredContract(emp.employmentType)) continue;
      const amt = parseNumericInput(getDraft(emp).amountInput);
      if (amt <= 0) continue;
      rows.push({
        fullName: emp.fullName,
        nationalId: emp.nationalId,
        personnelCode: emp.personnelCode,
        amount: amt,
      });
    }
    return rows;
  }, [displayedEmployees, drafts]);

  const updateRowDraft = (
    emp: Employee,
    patch: Partial<ManualSalary2DraftRow>
  ) => {
    setDrafts((prev) => {
      const current = prev[emp.id] ?? {
        employeeId: emp.id,
        amountInput: '',
        mode: defaultImportMode,
        unitType: resolveManualSalaryUnitType(emp),
        description: '',
      };
      return {
        ...prev,
        [emp.id]: {
          ...current,
          ...patch,
        },
      };
    });
  };

  const handleSaveAllModified = () => {
    if (!canEnterManualSalary2 || modifiedEmployees.length === 0) return;
    const updates: ManualSalary2RowUpdate[] = modifiedEmployees.map((emp) => {
      const d = getDraft(emp);
      return {
        employeeId: emp.id,
        amount: parseNumericInput(d.amountInput),
        mode: d.mode,
        unitType: resolveManualSalaryUnitType(emp, d.unitType),
        description: d.description,
        hazardPay: d.hazardPay,
        nonCalloutPay: d.nonCalloutPay,
        terminationDate: d.terminationDate,
        secondSalaryBonus: d.secondSalaryBonus,
        deduction1: d.deduction1,
        commuteAllowance: d.commuteAllowance,
      };
    });
    onUpsertManualPayments(updates);
    setSavedToast(
      `حقوق دستی ${toPersianDigits(updates.length)} کارمند در دوره ${formatPeriodLabel(
        periodKey
      )} ثبت شد.`
    );
    window.setTimeout(() => setSavedToast(null), 2800);
  };

  const handleSaveSingleRow = (emp: Employee) => {
    if (!canEnterManualSalary2) return;
    const d = getDraft(emp);
    onUpsertManualPayments([
      {
        employeeId: emp.id,
        amount: parseNumericInput(d.amountInput),
        mode: d.mode,
        unitType: resolveManualSalaryUnitType(emp, d.unitType),
        description: d.description,
        hazardPay: d.hazardPay,
        nonCalloutPay: d.nonCalloutPay,
        terminationDate: d.terminationDate,
        secondSalaryBonus: d.secondSalaryBonus,
        deduction1: d.deduction1,
        commuteAllowance: d.commuteAllowance,
      },
    ]);
    setSavedToast(`حقوق دستی ${emp.fullName} ثبت شد.`);
    window.setTimeout(() => setSavedToast(null), 2400);
  };

  const handleClearSingleRow = (emp: Employee) => {
    if (!canEnterManualSalary2) return;
    updateRowDraft(emp, { amountInput: '', description: '' });
    onUpsertManualPayments([
      {
        employeeId: emp.id,
        amount: 0,
        mode: getDraft(emp).mode,
        unitType: resolveManualSalaryUnitType(emp, getDraft(emp).unitType),
        description: '',
      },
    ]);
    setSavedToast(`مبلغ حقوق دستی ${emp.fullName} پاک شد.`);
    window.setTimeout(() => setSavedToast(null), 2400);
  };

  const handlePrefillFromBaseSalary = () => {
    if (!canEnterManualSalary2 || displayedEmployees.length === 0) return;
    setDrafts((prev) => {
      const next = { ...prev };
      for (const emp of displayedEmployees) {
        if (emp.baseMonthlySalary <= 0) continue;
        const current = next[emp.id] ?? {
          employeeId: emp.id,
          amountInput: '',
          mode: defaultImportMode,
          unitType: resolveManualSalaryUnitType(emp),
          description: '',
        };
        next[emp.id] = {
          ...current,
          amountInput: String(Math.round(emp.baseMonthlySalary)),
        };
      }
      return next;
    });
  };

  const handleExportTableXlsx = () => {
    if (displayedEmployees.length === 0) return;
    const entries: Record<string, ManualSalary2ExcelEntry> = {};
    for (const emp of displayedEmployees) {
      const d = getDraft(emp);
      entries[emp.id] = {
        amount: parseNumericInput(d.amountInput),
        mode: d.mode,
        unitType: resolveManualSalaryUnitType(emp, d.unitType),
        description: d.description,
      };
    }
    downloadManualSalary2TableXlsx(
      displayedEmployees,
      entries,
      `manual-salary-2-${periodKey}.xlsx`
    );
  };

  const handleExportDetailedXlsx = () => {
    if (displayedEmployees.length === 0) return;
    const rows: ManualSalaryDetailedExportRow[] = displayedEmployees.map((emp) => {
      const d = getDraft(emp);
      const ts = timesheetMap.get(emp.id);
      const { firstName, lastName } = splitPersianFullName(emp.fullName);
      const contractClause = getEmploymentTypeLabel(
        emp.employmentType,
        emp.customContractTitle
      );
      const defaultDeduction1 =
        (ts?.otherDeductions ?? 0) + (ts?.advancePayment ?? 0);

      return {
        firstName,
        lastName,
        contractClause,
        nationalIdOrPassport: emp.nationalId,
        jobTitle: emp.jobTitle || emp.department || '—',
        hazardPay: d.hazardPay ?? 0,
        nonCalloutPay: d.nonCalloutPay ?? 0,
        totalPaid: parseNumericInput(d.amountInput),
        hireDate: emp.hireDate,
        terminationDate: d.terminationDate ?? '',
        description: d.description,
        secondSalaryBonus: d.secondSalaryBonus ?? ts?.bonus ?? 0,
        deduction1: d.deduction1 ?? defaultDeduction1,
        commuteAllowance: d.commuteAllowance ?? 0,
      };
    });
    downloadManualSalaryDetailedXlsx(
      rows,
      `manual-salary-2-detailed-${periodKey}.xlsx`
    );
  };

  const handleExportShiftAllowanceXlsx = () => {
    if (shiftEligibleRows.length === 0) return;
    downloadOfficialShiftAllowanceXlsx(
      shiftEligibleRows,
      periodKey,
      `official-shift-allowance-${periodKey}.xlsx`
    );
  };

  const importModelExportRows = useMemo<ManualSalaryImportModelRow[]>(() => {
    const rows: ManualSalaryImportModelRow[] = [];
    for (const emp of displayedEmployees) {
      const d = getDraft(emp);
      const amt = parseNumericInput(d.amountInput);
      if (amt <= 0) continue;
      rows.push({
        lastNameOrFullName: resolveExportNameForImportModel(
          emp.fullName,
          employees
        ),
        amount: amt,
        unitType: resolveManualSalaryUnitType(emp, d.unitType),
      });
    }
    return rows;
  }, [displayedEmployees, drafts, employees]);

  const handleExportImportModelXlsx = () => {
    if (importModelExportRows.length === 0) return;
    downloadManualSalaryImportModelXlsx(
      importModelExportRows,
      `manual-salary-2-import-model-${periodKey}.xlsx`
    );
  };

  const handleExcelImportFile = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !canEnterManualSalary2) return;

    try {
      const rows = await parseSpreadsheetFile(file);
      const result = importManualSalary2FromRows(
        rows,
        employees,
        defaultImportMode
      );
      if (result.matchedCount === 0) {
        setImportStatus({
          type: 'error',
          message:
            'هیچ ردیف معتبری در فایل اکسل یافت نشد. فرمت پیشنهادی: ردیف | نام خانوادگی (یا نام کامل) | مبلغ | محل خدمت',
        });
        return;
      }

      const updates: ManualSalary2RowUpdate[] = result.matchedRows.map((row) => ({
        employeeId: row.employeeId,
        amount: row.amount,
        mode: row.mode,
        unitType: row.unitType,
        description: row.description,
        hazardPay: row.hazardPay,
        nonCalloutPay: row.nonCalloutPay,
        terminationDate: row.terminationDate,
        secondSalaryBonus: row.secondSalaryBonus,
        deduction1: row.deduction1,
        commuteAllowance: row.commuteAllowance,
      }));
      onUpsertManualPayments(updates);

      setImportStatus({
        type: 'success',
        message: `حقوق ${toPersianDigits(
          result.matchedCount
        )} کارمند از فایل اکسل در جدول «پرداخت حقوق دستی ۲» بارگذاری و برای دوره ${formatPeriodLabel(
          periodKey
        )} ثبت شد.${
          result.skippedCount > 0
            ? ` (${toPersianDigits(result.skippedCount)} ردیف بدون مبلغ یا نامطابق نادیده گرفته شد.)`
            : ''
        }`,
      });
      window.setTimeout(() => setImportStatus(null), 5000);
    } catch {
      setImportStatus({
        type: 'error',
        message:
          'خطا در خواندن فایل اکسل. لطفاً از فایل .xlsx یا .csv معتبر استفاده کنید.',
      });
    }
  };

  return (
    <div className="space-y-6">

      {/* Compact Summary Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white border border-slate-200 rounded-lg px-5 py-4">
          <p className="text-xs text-slate-500 font-medium">
            پرسنل جدول ({formatPeriodLabel(periodKey)})
          </p>
          <p className="mt-1.5 text-2xl font-semibold text-slate-900 font-mono-num tabular-nums">
            {toPersianDigits(employeesWithAmountCount)}{' '}
            <span className="text-xs font-normal text-slate-500">
              از {toPersianDigits(employees.length)} کارمند دارای حقوق دستی
            </span>
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg px-5 py-4">
          <p className="text-xs text-slate-500 font-medium">
            جمع کل حقوق دستی جدول ۲
          </p>
          <p className="mt-1.5 text-2xl font-semibold text-teal-800 font-mono-num tabular-nums">
            {formatMoney(totalDraftManualAmount)}{' '}
            <span className="text-xs font-normal text-slate-500">{currency}</span>
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg px-5 py-4">
          <p className="text-xs text-slate-500 font-medium">
            مجموع حقوق پایه پرسنل فعال
          </p>
          <p className="mt-1.5 text-2xl font-semibold text-slate-900 font-mono-num tabular-nums">
            {formatMoney(totalActiveBasePayroll)}{' '}
            <span className="text-xs font-normal text-slate-500">{currency}</span>
          </p>
        </div>
      </div>

      {!canEnterManualSalary2 && (
        <div
          role="status"
          className="bg-amber-50 border border-amber-200 text-amber-900 rounded-lg px-4 py-3 flex items-center gap-2 text-xs"
        >
          <Lock className="w-4 h-4 text-amber-700 shrink-0" aria-hidden="true" />
          <span>
            حساب کاربری فعلی فقط مجوز مشاهده جدول پرداخت حقوق دستی ۲ را دارد. برای ویرایش مبالغ یا ورود فایل اکسل، از مدیر سیستم دسترسی «پرداخت حقوق دستی ۲» را دریافت کنید.
          </span>
        </div>
      )}

      {/* Split Excel Import (Right) & Export (Left) Panel */}
      <CollapsibleCard
        title="ورود و خروجی اکسل پرداخت حقوق دستی ۲"
        subtitle="ورودی اکسل در سمت راست و خروجی‌های اکسل در سمت چپ تفکیک شده‌اند."
        defaultOpen={true}
        resizable={false}
      >
        <div className="p-4 space-y-4 bg-slate-50/60">
          <div className="flex flex-wrap items-center justify-between gap-4 bg-white border border-slate-200 rounded-md p-3.5">
            {/* Right Side (RTL start): Excel Import */}
            <div className="flex flex-wrap items-center gap-3">
              <input
                ref={excelInputRef}
                type="file"
                accept=".xlsx,.csv,.tsv"
                onChange={handleExcelImportFile}
                className="hidden"
                aria-label="فایل اکسل ورود حقوق کارمندان در پرداخت حقوق دستی ۲"
              />
              <button
                type="button"
                disabled={!canEnterManualSalary2 || employees.length === 0}
                onClick={() => excelInputRef.current?.click()}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-teal-900 bg-teal-50 hover:bg-teal-100 border border-teal-200 disabled:opacity-40 disabled:cursor-not-allowed rounded-md transition-colors whitespace-nowrap shrink-0"
              >
                <Upload className="w-3.5 h-3.5" aria-hidden="true" />
                <span>ورود از اکسل (.xlsx / .csv)</span>
              </button>
              <div className="text-[11px] text-slate-600 leading-5">
                <span className="font-semibold text-slate-800">ورودی اکسل:</span>{' '}
                ردیف | نام خانوادگی (یا نام کامل) | مبلغ | محل خدمت
              </div>
            </div>

            {/* Left Side (RTL end): Excel Exports */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={displayedEmployees.length === 0}
                onClick={handleExportDetailedXlsx}
                title="خروجی ۱۴ ستونه: نام، نام خانوادگی، ماده قرارداد، کد ملی/پاسپورت، سمت، زیان آور، غیر آفیش، مجموع پرداختی، تاریخ آغاز/ترک کار، توضیحات، حقوق دوم، کسورات ۱، حق ایاب و ذهاب"
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-white bg-slate-800 hover:bg-slate-900 disabled:opacity-40 disabled:cursor-not-allowed rounded-md transition-colors whitespace-nowrap shrink-0"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" aria-hidden="true" />
                <span>خروجی جامع اکسل (۱۴ ستونه)</span>
              </button>
              <button
                type="button"
                disabled={shiftEligibleRows.length === 0}
                onClick={handleExportShiftAllowanceXlsx}
                title="خروجی اکسل لیست اضافه شیفت دریافتی کارکنان رسمی و بازنشسته"
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-white bg-teal-700 hover:bg-teal-800 disabled:opacity-40 disabled:cursor-not-allowed rounded-md transition-colors whitespace-nowrap shrink-0"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" aria-hidden="true" />
                <span>
                  خروجی حق شیفت (رسمی و بازنشسته)
                  {shiftEligibleRows.length > 0
                    ? ` (${toPersianDigits(shiftEligibleRows.length)})`
                    : ''}
                </span>
              </button>
              <button
                type="button"
                disabled={displayedEmployees.length === 0}
                onClick={handleExportTableXlsx}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 disabled:opacity-40 disabled:cursor-not-allowed rounded-md transition-colors whitespace-nowrap shrink-0"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" aria-hidden="true" />
                <span>خروجی اکسل جدولی (.xlsx)</span>
              </button>
              <button
                type="button"
                disabled={importModelExportRows.length === 0}
                onClick={handleExportImportModelXlsx}
                title="خروجی دقیق مطابق مدل ورود اکسل: ردیف | نام خانوادگی | مبلغ | محل خدمت"
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-teal-900 bg-teal-50 hover:bg-teal-100 border border-teal-200 disabled:opacity-40 disabled:cursor-not-allowed rounded-md transition-colors whitespace-nowrap shrink-0"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" aria-hidden="true" />
                <span>خروجی مدل ورودی (.xlsx)</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
            <div className="bg-white border border-slate-200 rounded-md p-3 space-y-1">
              <div className="font-semibold text-slate-900 flex items-center gap-1.5">
                <Upload className="w-4 h-4 text-teal-700" aria-hidden="true" />
                <span>راهنمای ورودی اکسل (سمت راست)</span>
              </div>
              <p className="text-slate-600 leading-5">
                فایل اکسل را با ستون‌های «ردیف | نام خانوادگی | مبلغ | محل خدمت» یا «نام و نام خانوادگی، مبلغ، محل خدمت» و یا فایل خروجی ۱۴ ستونه بارگذاری کنید.
              </p>
            </div>
            <div className="bg-white border border-slate-200 rounded-md p-3 space-y-1">
              <div className="font-semibold text-slate-900 flex items-center gap-1.5">
                <FileSpreadsheet
                  className="w-4 h-4 text-teal-700"
                  aria-hidden="true"
                />
                <span>راهنمای خروجی اکسل (سمت چپ)</span>
              </div>
              <p className="text-slate-600 leading-5">
                خروجی‌ها دقیقاً مطابق گزینه‌های انتخاب‌شده در فیلتر دپارتمان، قرارداد و حالت محاسبه تولید می‌شوند؛ موارد تیک‌نخورده در جدول و اکسل نمایش داده نمی‌شوند.
              </p>
            </div>
          </div>
        </div>
      </CollapsibleCard>

      {/* Interactive Employee Salaries Table */}
      <CollapsibleCard
        title={`جدول پرداخت حقوق دستی ۲ — ${formatPeriodLabel(periodKey)}`}
        subtitle="فهرست ردیف، نام و نام خانوادگی، مبلغ، قرارداد و محل خدمت / نوع استخدام (سیما، خبر، معاونت...)"
        defaultOpen={true}
        resizable={true}
        defaultSize="lg"
        headerActions={
          <div className="flex flex-wrap items-center gap-2">
            {savedToast && (
              <span className="text-xs font-medium text-emerald-700">
                {savedToast}
              </span>
            )}
            <button
              type="button"
              disabled={!canEnterManualSalary2 || displayedEmployees.length === 0}
              onClick={handlePrefillFromBaseSalary}
              title="بارگذاری حقوق پایه پرسنل نمایش‌داده‌شده در ستون مبلغ"
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 disabled:opacity-40 disabled:cursor-not-allowed rounded-md transition-colors whitespace-nowrap shrink-0"
            >
              <Sparkles className="w-3.5 h-3.5 text-teal-700" aria-hidden="true" />
              <span>پر کردن از حقوق پایه</span>
            </button>
            <button
              type="button"
              disabled={!canEnterManualSalary2 || modifiedEmployees.length === 0}
              onClick={handleSaveAllModified}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium text-white bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 disabled:cursor-not-allowed rounded-md transition-colors whitespace-nowrap shrink-0"
            >
              <Check className="w-3.5 h-3.5" aria-hidden="true" />
              <span>
                ثبت نهایی حقوق دستی
                {modifiedEmployees.length > 0
                  ? ` (${toPersianDigits(modifiedEmployees.length)})`
                  : ''}
              </span>
            </button>
          </div>
        }
      >
        {/* Multi-Select Checkboxes & Search Toolbar */}
        <div className="px-4 py-3.5 border-b border-slate-200 bg-slate-50/60 space-y-3">
          <ManualSalaryFilterBar
            departments={departments}
            filters={filters}
            onChange={setFilters}
            idPrefix="manual2"
          />

          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-2.5 pt-2 border-t border-slate-200/80">
            <div className="flex flex-wrap items-center gap-2 flex-1">
              <div className="relative flex-1 min-w-[220px] max-w-md">
                <label htmlFor="manual2-emp-search" className="sr-only">
                  جستجو در جدول پرداخت حقوق دستی ۲ (نام، نام خانوادگی یا کد پرسنلی)
                </label>
                <Search
                  className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none"
                  aria-hidden="true"
                />
                <input
                  id="manual2-emp-search"
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="جستجو بر اساس نام، نام خانوادگی یا کد پرسنلی..."
                  className="w-full pr-9 pl-8 py-1.5 text-xs sm:text-sm border border-slate-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600 transition-colors"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    aria-label="پاک کردن جستجوی پرداخت حقوق دستی ۲"
                    className="absolute left-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700 rounded"
                  >
                    <X className="w-3.5 h-3.5" aria-hidden="true" />
                  </button>
                )}
              </div>

              <select
                aria-label="فیلتر وضعیت پرسنل پرداخت حقوق دستی ۲"
                value={statusFilter}
                onChange={(e) =>
                  setStatusFilter(
                    e.target.value as 'all' | 'active' | 'inactive'
                  )
                }
                className="px-2.5 py-1.5 text-xs border border-slate-200 rounded-md bg-white text-slate-700 focus:outline-none focus:border-teal-600"
              >
                <option value="all">همه وضعیت‌ها</option>
                <option value="active">فقط فعال</option>
                <option value="inactive">فقط غیرفعال</option>
              </select>

              <select
                aria-label="حالت محاسبه ردیف‌های جدید"
                value={defaultImportMode}
                onChange={(e) =>
                  setDefaultImportMode(e.target.value as ManualSalaryMode)
                }
                className="px-2.5 py-1.5 text-xs border border-slate-200 rounded-md bg-white text-slate-700 focus:outline-none focus:border-teal-600"
              >
                <option value="override">حالت پیش‌فرض: جایگزین فیش ماه</option>
                <option value="additional">حالت پیش‌فرض: پرداخت مجزا</option>
              </select>
            </div>

            <div className="flex items-center gap-3 text-xs text-slate-600">
              <span>
                نمایش{' '}
                <strong className="font-mono-num tabular-nums text-slate-900">
                  {toPersianDigits(displayedEmployees.length)}
                </strong>{' '}
                از{' '}
                <strong className="font-mono-num tabular-nums text-slate-900">
                  {toPersianDigits(employees.length)}
                </strong>{' '}
                کارمند
              </span>
              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={resetAllFilters}
                  className="text-teal-700 hover:text-teal-900 font-medium hover:underline whitespace-nowrap"
                >
                  بازنشانی فیلترها
                </button>
              )}
            </div>
          </div>
        </div>

        {importStatus && (
          <div
            role={importStatus.type === 'error' ? 'alert' : 'status'}
            className={`mx-4 mt-3 px-4 py-2.5 text-xs rounded-md border ${
              importStatus.type === 'success'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : 'bg-rose-50 border-rose-200 text-rose-800'
            }`}
          >
            {importStatus.message}
          </div>
        )}

        {displayedEmployees.length === 0 ? (
          <div className="py-10 px-6 text-center text-xs text-slate-500 space-y-2">
            <p className="text-sm font-medium text-slate-700">
              {employees.length === 0
                ? 'کارمندی برای نمایش در جدول ثبت نشده است.'
                : 'با گزینه‌های انتخابی فعلی کارمندی برای نمایش و خروجی وجود ندارد.'}
            </p>
            <p>
              {employees.length > 0
                ? 'دپارتمان‌ها، قراردادها یا حالت محاسبه مورد نظر را تیک بزنید تا ردیف‌های مرتبط نمایش داده شوند.'
                : ''}
            </p>
            {hasActiveFilters && employees.length > 0 && (
              <button
                type="button"
                onClick={resetAllFilters}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-teal-800 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded-md transition-colors"
              >
                انتخاب همه گزینه‌ها
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-medium text-slate-600">
                  <th className="py-2.5 px-3 whitespace-nowrap w-14">ردیف</th>
                  <th className="py-2.5 px-3 whitespace-nowrap">
                    نام و نام خانوادگی
                  </th>
                  <th className="py-2.5 px-3 whitespace-nowrap">
                    مبلغ ({currency})
                  </th>
                  <th className="py-2.5 px-3 whitespace-nowrap">قرارداد</th>
                  <th className="py-2.5 px-3 whitespace-nowrap">
                    محل خدمت / نوع استخدام
                  </th>
                  <th className="py-2.5 px-3 whitespace-nowrap text-left">
                    عملیات
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-xs">
                {displayedEmployees.map((emp, idx) => {
                  const draft = getDraft(emp);
                  const draftAmt = parseNumericInput(draft.amountInput);
                  const savedAmt = parseNumericInput(
                    savedDrafts[emp.id]?.amountInput ?? ''
                  );
                  const isModified = hasManualSalary2DraftChanged(
                    draft,
                    savedDrafts[emp.id]
                  );
                  const contractLabel = getEmploymentTypeLabel(
                    emp.employmentType,
                    emp.customContractTitle
                  );
                  const isShiftEligible = isOfficialOrRetiredContract(
                    emp.employmentType
                  );

                  return (
                    <tr
                      key={emp.id}
                      className={`transition-colors ${
                        isModified
                          ? 'bg-teal-50/45'
                          : savedAmt > 0
                            ? 'bg-emerald-50/20 hover:bg-slate-50/70'
                            : 'hover:bg-slate-50/70'
                      }`}
                    >
                      <td className="py-2.5 px-3 font-mono-num tabular-nums text-slate-500 whitespace-nowrap">
                        {toPersianDigits(idx + 1)}
                      </td>

                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <span className="font-semibold text-slate-900">
                            {emp.fullName}
                          </span>
                          {!emp.isActive && (
                            <span className="px-1.5 py-0.5 text-[10px] rounded bg-slate-100 text-slate-500 border border-slate-200">
                              غیرفعال
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <input
                          type="text"
                          inputMode="numeric"
                          dir="ltr"
                          aria-label={`مبلغ حقوق دستی ${emp.fullName}`}
                          disabled={!canEnterManualSalary2}
                          value={draft.amountInput}
                          onChange={(e) =>
                            updateRowDraft(emp, {
                              amountInput: e.target.value,
                            })
                          }
                          placeholder="0"
                          className="w-36 px-2.5 py-1.5 text-xs border border-slate-200 rounded bg-white disabled:bg-slate-50 disabled:text-slate-500 font-mono-num tabular-nums text-left focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
                        />
                        {draftAmt > 0 && (
                          <div className="text-[10px] text-teal-800 font-mono-num tabular-nums mt-0.5">
                            {formatMoney(draftAmt)} {currency}
                          </div>
                        )}
                      </td>

                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <span
                          className={
                            isShiftEligible
                              ? 'font-medium text-teal-800'
                              : 'text-slate-700'
                          }
                        >
                          {contractLabel}
                        </span>
                      </td>

                      <td className="py-2.5 px-3 whitespace-nowrap">
                        {(() => {
                          const unitGroups = buildWorkLocationSelectGroups(
                            emp,
                            draft.unitType
                          );
                          const isCustomRow =
                            Boolean(customUnitRows[emp.id]) ||
                            unitGroups.isCustomValue;
                          return (
                            <div className="space-y-1">
                              <select
                                aria-label={`محل خدمت ${emp.fullName}`}
                                disabled={!canEnterManualSalary2}
                                value={
                                  isCustomRow
                                    ? CUSTOM_UNIT_SENTINEL
                                    : draft.unitType
                                }
                                onChange={(e) => {
                                  const val = e.target.value;
                                  if (val === CUSTOM_UNIT_SENTINEL) {
                                    setCustomUnitRows((prev) => ({
                                      ...prev,
                                      [emp.id]: true,
                                    }));
                                    if (
                                      unitGroups.allKnownOptions.includes(
                                        draft.unitType
                                      )
                                    ) {
                                      updateRowDraft(emp, { unitType: '' });
                                    }
                                  } else {
                                    setCustomUnitRows((prev) => ({
                                      ...prev,
                                      [emp.id]: false,
                                    }));
                                    updateRowDraft(emp, { unitType: val });
                                  }
                                }}
                                className="w-40 px-2 py-1.5 text-xs border border-slate-200 rounded bg-white disabled:bg-slate-50 disabled:text-slate-500 focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
                              >
                                <optgroup label="ردیف‌های ۸گانه (۸ ردیف حقوق)">
                                  {unitGroups.tierOptions.map((opt) => (
                                    <option key={opt} value={opt}>
                                      {opt}
                                    </option>
                                  ))}
                                </optgroup>
                                <optgroup label="سایر واحدها و محل‌های خدمت">
                                  {unitGroups.otherOptions.map((opt) => (
                                    <option key={opt} value={opt}>
                                      {opt}
                                    </option>
                                  ))}
                                  <option value={CUSTOM_UNIT_SENTINEL}>
                                    سایر (ورود دستی)...
                                  </option>
                                </optgroup>
                              </select>
                              {isCustomRow && (
                                <input
                                  type="text"
                                  disabled={!canEnterManualSalary2}
                                  aria-label={`محل خدمت دلخواه ${emp.fullName}`}
                                  value={draft.unitType}
                                  onChange={(e) =>
                                    updateRowDraft(emp, {
                                      unitType: e.target.value,
                                    })
                                  }
                                  placeholder="محل خدمت دلخواه..."
                                  className="block w-40 px-2 py-1 text-[11px] border border-slate-200 rounded bg-white disabled:bg-slate-50 focus:outline-none focus:border-teal-600"
                                />
                              )}
                            </div>
                          );
                        })()}
                      </td>

                      <td className="py-2.5 px-3 whitespace-nowrap text-left">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            disabled={!canEnterManualSalary2 || !isModified}
                            onClick={() => handleSaveSingleRow(emp)}
                            aria-label={`ثبت حقوق دستی ${emp.fullName}`}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-teal-900 bg-teal-50 hover:bg-teal-100 border border-teal-200 disabled:opacity-35 disabled:cursor-not-allowed rounded transition-colors"
                          >
                            <Check className="w-3 h-3" aria-hidden="true" />
                            <span>ثبت</span>
                          </button>
                          {(savedAmt > 0 || draftAmt > 0) && (
                            <button
                              type="button"
                              disabled={!canEnterManualSalary2}
                              onClick={() => handleClearSingleRow(emp)}
                              aria-label={`پاک کردن حقوق دستی ${emp.fullName}`}
                              title="پاک کردن مبلغ حقوق دستی این کارمند"
                              className="p-1 text-slate-400 hover:text-rose-700 hover:bg-rose-50 disabled:opacity-35 disabled:cursor-not-allowed rounded transition-colors"
                            >
                              <Eraser className="w-3.5 h-3.5" aria-hidden="true" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-slate-50 border-t border-slate-200 text-xs font-semibold text-slate-900">
                  <td className="py-3 px-3 whitespace-nowrap" colSpan={2}>
                    جمع کل ({toPersianDigits(displayedEmployees.length)} کارمند)
                  </td>
                  <td className="py-3 px-3 font-mono-num tabular-nums text-teal-800 text-sm whitespace-nowrap">
                    {formatMoney(totalDisplayedManualAmount)} {currency}
                  </td>
                  <td className="py-3 px-3" colSpan={3} />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </CollapsibleCard>
    </div>
  );
};
