import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDownToLine,
  Check,
  FileSpreadsheet,
  Lock,
  Search,
  Upload,
  X,
} from 'lucide-react';
import type {
  CurrencyUnit,
  Employee,
  EmploymentType,
  ManualSalaryPayment,
  SalaryCalculationMode,
} from '../types/payroll';
import {
  ALL_EMPLOYMENT_TYPES,
  SALARY_CALCULATION_MODE_SHORT_LABELS,
  SALARY_TIER_LABELS,
  formatMoney,
  formatPeriodLabel,
  getEffectiveSalaryMode,
  normalizeCustomTierAmounts,
  normalizeManualSalaries,
  parseNumericInput,
  sumCustomTierAmounts,
  sumManualSalaries,
  toEnglishDigits,
  toPersianDigits,
} from '../utils/payroll';
import { extractEmployeeDepartments } from '../utils/manualSalaryFilter';
import {
  collectCustomTierLabels,
  extractTiersFromManualPayments,
} from '../utils/tierExtraction';
import {
  downloadRtlThreeColumnXlsx,
  downloadSalaryTiersTableXlsx,
  type ThreeColumnExcelRow,
} from '../utils/xlsxExport';
import {
  importManualTiersFromRows,
  parseSpreadsheetFile,
} from '../utils/xlsxImport';
import { filterEmployees } from '../utils/employeeFilter';
import { CollapsibleCard } from './CollapsibleCard';
import { ContractDepartmentChecklist } from './ContractDepartmentChecklist';

type SalaryDraftTuple = [
  string,
  string,
  string,
  string,
  string,
  string,
  string,
  string,
];

interface SalaryTiersPageProps {
  employees: Employee[];
  manualPayments?: ManualSalaryPayment[];
  periodKey?: string;
  currency: CurrencyUnit;
  canEnterSalaryTiers: boolean;
  canManageEmployees: boolean;
  onUpdateEmployee: (emp: Employee) => void;
  onBatchUpdateSalaries: (
    salaryDrafts: Record<string, ReadonlyArray<string | number>>,
    customTierDrafts?: Record<string, Record<string, string | number>>
  ) => void;
  onImportEmployees: (updatedEmployees: Employee[]) => void;
}

function tiersToDraftTuple(tiers: ReadonlyArray<number>): SalaryDraftTuple {
  return [
    String(tiers[0] ?? 0),
    String(tiers[1] ?? 0),
    String(tiers[2] ?? 0),
    String(tiers[3] ?? 0),
    String(tiers[4] ?? 0),
    String(tiers[5] ?? 0),
    String(tiers[6] ?? 0),
    String(tiers[7] ?? 0),
  ];
}

export const SalaryTiersPage: React.FC<SalaryTiersPageProps> = ({
  employees,
  manualPayments = [],
  periodKey = '1405-08',
  currency,
  canEnterSalaryTiers,
  canManageEmployees,
  onUpdateEmployee,
  onBatchUpdateSalaries,
  onImportEmployees,
}) => {
  const departments = useMemo(
    () => extractEmployeeDepartments(employees),
    [employees]
  );

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDepartments, setSelectedDepartments] = useState<string[]>(() =>
    extractEmployeeDepartments(employees)
  );
  const [selectedContracts, setSelectedContracts] = useState<EmploymentType[]>(
    () => [...ALL_EMPLOYMENT_TYPES]
  );
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>(
    'all'
  );
  const knownDepartmentsRef = useRef<Set<string>>(new Set(departments));

  useEffect(() => {
    const brandNew = departments.filter(
      (d) => !knownDepartmentsRef.current.has(d)
    );
    if (brandNew.length > 0) {
      brandNew.forEach((d) => knownDepartmentsRef.current.add(d));
      setSelectedDepartments((prev) => [...prev, ...brandNew]);
    }
  }, [departments]);

  const customTierLabels = useMemo(
    () => collectCustomTierLabels(employees, manualPayments, periodKey),
    [employees, manualPayments, periodKey]
  );

  const [manualSalaryDrafts, setManualSalaryDrafts] = useState<
    Record<string, SalaryDraftTuple>
  >({});
  const [customTierDrafts, setCustomTierDrafts] = useState<
    Record<string, Record<string, string>>
  >({});
  const [manualSalarySavedToast, setManualSalarySavedToast] = useState(false);
  const [excelImportStatus, setExcelImportStatus] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);
  const excelImportRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setManualSalaryDrafts(() => {
      const next: Record<string, SalaryDraftTuple> = {};
      for (const emp of employees) {
        const tiers = normalizeManualSalaries(
          emp.manualSalaries,
          emp.baseMonthlySalary,
          emp.customTierAmounts
        );
        next[emp.id] = tiersToDraftTuple(tiers);
      }
      return next;
    });
    setCustomTierDrafts(() => {
      const nextCustom: Record<string, Record<string, string>> = {};
      for (const emp of employees) {
        const clean = normalizeCustomTierAmounts(emp.customTierAmounts);
        const rowMap: Record<string, string> = {};
        for (const lbl of customTierLabels) {
          rowMap[lbl] = String(clean[lbl] ?? 0);
        }
        nextCustom[emp.id] = rowMap;
      }
      return nextCustom;
    });
  }, [employees, customTierLabels]);

  const filteredEmployees = useMemo(
    () =>
      filterEmployees(employees, {
        searchQuery,
        selectedDepartments,
        selectedContracts,
        statusFilter,
      }),
    [employees, searchQuery, selectedDepartments, selectedContracts, statusFilter]
  );

  const hasActiveFilters = Boolean(
    searchQuery.trim() ||
      selectedDepartments.length < departments.length ||
      selectedContracts.length < ALL_EMPLOYMENT_TYPES.length ||
      statusFilter !== 'all'
  );

  const displayedTierEmployees = filteredEmployees;

  const resetAllFilters = () => {
    setSearchQuery('');
    setSelectedDepartments(departments);
    setSelectedContracts([...ALL_EMPLOYMENT_TYPES]);
    setStatusFilter('all');
  };

  const getEmployeeDraftTiers = (
    emp: Employee
  ): [number, number, number, number, number, number, number, number] => {
    const fallback = normalizeManualSalaries(
      emp.manualSalaries,
      emp.baseMonthlySalary,
      emp.customTierAmounts
    );
    const rawTuple = manualSalaryDrafts[emp.id];
    if (!rawTuple) return fallback;
    return [
      parseNumericInput(rawTuple[0] ?? ''),
      parseNumericInput(rawTuple[1] ?? ''),
      parseNumericInput(rawTuple[2] ?? ''),
      parseNumericInput(rawTuple[3] ?? ''),
      parseNumericInput(rawTuple[4] ?? ''),
      parseNumericInput(rawTuple[5] ?? ''),
      parseNumericInput(rawTuple[6] ?? ''),
      parseNumericInput(rawTuple[7] ?? ''),
    ];
  };

  const getEmployeeDraftCustomTiers = (emp: Employee): Record<string, number> => {
    const saved = normalizeCustomTierAmounts(emp.customTierAmounts);
    const rawMap = customTierDrafts[emp.id];
    if (!rawMap) return saved;
    const parsed: Record<string, number> = {};
    for (const lbl of customTierLabels) {
      const val = parseNumericInput(rawMap[lbl] ?? '');
      if (val > 0) parsed[lbl] = val;
    }
    return parsed;
  };

  const getEmployeeTotalDraft = (emp: Employee): number =>
    sumManualSalaries(getEmployeeDraftTiers(emp)) +
    sumCustomTierAmounts(getEmployeeDraftCustomTiers(emp));

  const isEmployeeManualModified = (emp: Employee): boolean => {
    const currentTiers = normalizeManualSalaries(
      emp.manualSalaries,
      emp.baseMonthlySalary,
      emp.customTierAmounts
    );
    const currentCustom = normalizeCustomTierAmounts(emp.customTierAmounts);
    const draftTiers = getEmployeeDraftTiers(emp);
    const draftCustom = getEmployeeDraftCustomTiers(emp);
    const draftTotal =
      sumManualSalaries(draftTiers) + sumCustomTierAmounts(draftCustom);
    if (draftTotal <= 0) return false;
    return (
      draftTotal !== emp.baseMonthlySalary ||
      draftTiers.some((val, idx) => val !== currentTiers[idx]) ||
      customTierLabels.some(
        (lbl) => (draftCustom[lbl] ?? 0) !== (currentCustom[lbl] ?? 0)
      )
    );
  };

  const modifiedCount = useMemo(
    () => employees.filter((emp) => isEmployeeManualModified(emp)).length,
    [employees, manualSalaryDrafts, customTierDrafts]
  );

  const hasManualSalaryChanges = modifiedCount > 0;

  const totalDraftPayroll = useMemo(
    () =>
      employees
        .filter((e) => e.isActive)
        .reduce((sum, emp) => sum + getEmployeeTotalDraft(emp), 0),
    [employees, manualSalaryDrafts, customTierDrafts]
  );

  const handleSaveAllManualSalaries = () => {
    if (!canEnterSalaryTiers || !hasManualSalaryChanges) return;
    onBatchUpdateSalaries(manualSalaryDrafts, customTierDrafts);
    setManualSalarySavedToast(true);
    window.setTimeout(() => setManualSalarySavedToast(false), 2200);
  };

  const handleSaveSingleManualSalary = (emp: Employee) => {
    if (!canEnterSalaryTiers || !isEmployeeManualModified(emp)) return;
    const draftTiers = getEmployeeDraftTiers(emp);
    const draftCustom = getEmployeeDraftCustomTiers(emp);
    onBatchUpdateSalaries(
      { [emp.id]: draftTiers },
      { [emp.id]: draftCustom }
    );
    setManualSalarySavedToast(true);
    window.setTimeout(() => setManualSalarySavedToast(false), 2200);
  };

  const handleExportTiersTableXlsx = () => {
    const draftOverrides: Record<string, ReadonlyArray<number>> = {};
    const customOverrides: Record<string, Record<string, number>> = {};
    for (const emp of employees) {
      draftOverrides[emp.id] = getEmployeeDraftTiers(emp);
      customOverrides[emp.id] = getEmployeeDraftCustomTiers(emp);
    }
    downloadSalaryTiersTableXlsx(
      employees,
      'employee-salary-tiers-rtl.xlsx',
      draftOverrides,
      customTierLabels,
      customOverrides
    );
  };

  const handleExportThreeColXlsx = () => {
    const rows: ThreeColumnExcelRow[] = [];
    for (const emp of employees) {
      const tiers = getEmployeeDraftTiers(emp);
      const baseCode = toEnglishDigits(emp.personnelCode.trim());
      let subIndex = 0;
      for (let i = 0; i < tiers.length; i += 1) {
        if (tiers[i] <= 0) continue;
        rows.push({
          code: subIndex === 0 ? baseCode : `${baseCode}-${subIndex}`,
          title: `${emp.fullName} - ${SALARY_TIER_LABELS[i]}`,
          amount: Math.round(tiers[i]),
        });
        subIndex += 1;
      }
    }
    downloadRtlThreeColumnXlsx(rows, 'employee-manual-tiers-3col.xlsx', {
      includeHeaderRow: false,
      sheetName: 'Sheet1',
    });
  };

  const handleExcelImportFile = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !canEnterSalaryTiers) return;

    try {
      const rows = await parseSpreadsheetFile(file);
      const result = importManualTiersFromRows(rows, employees);
      if (result.matchedEmployeeCount === 0) {
        setExcelImportStatus({
          type: 'error',
          message:
            'هیچ ردیف مطابقی (بر اساس کد پرسنلی یا نام کارمند) در فایل اکسل یافت نشد.',
        });
        return;
      }
      onImportEmployees(result.updatedEmployees);
      setExcelImportStatus({
        type: 'success',
        message: `اطلاعات حقوق ${toPersianDigits(
          result.matchedEmployeeCount
        )} کارمند از فایل اکسل (${
          result.formatDetected === 'table-8-tiers' ? 'جدول ۸ ردیفه' : '۳ ستونه'
        }) بارگذاری و در محاسبات اعمال شد.`,
      });
      window.setTimeout(() => setExcelImportStatus(null), 4500);
    } catch {
      setExcelImportStatus({
        type: 'error',
        message:
          'خطا در خواندن فایل اکسل. لطفاً از فایل خروجی .xlsx یا .csv معتبر استفاده کنید.',
      });
    }
  };

  const periodManualPaymentCount = useMemo(
    () =>
      manualPayments.filter(
        (p) => p.periodKey === periodKey && Number.isFinite(p.amount) && p.amount > 0
      ).length,
    [manualPayments, periodKey]
  );

  const handleExtractFromManualPayments = () => {
    if (!canEnterSalaryTiers) return;
    const res = extractTiersFromManualPayments(
      employees,
      manualPayments,
      periodKey
    );
    if (res.extractedEmployeeCount === 0) {
      setExcelImportStatus({
        type: 'error',
        message: `هیچ سند پرداخت حقوق دستی برای دوره ${formatPeriodLabel(
          periodKey
        )} ثبت نشده است. ابتدا در صفحه ۴ (پرداخت حقوق دستی ۲) مبالغ را ثبت یا از اکسل وارد کنید.`,
      });
      return;
    }
    onImportEmployees(res.updatedEmployees);
    setExcelImportStatus({
      type: 'success',
      message: `مبالغ ${toPersianDigits(
        res.paymentRecordCount
      )} سند پرداخت حقوق دستی دوره ${formatPeriodLabel(
        periodKey
      )} برای ${toPersianDigits(
        res.extractedEmployeeCount
      )} کارمند استخراج شد؛ واحدهای هم‌نام با ۸ ردیف در ستون مربوطه جمع و معاونت‌های مجزا در کادر اختصاصی خود ثبت شدند.`,
    });
    window.setTimeout(() => setExcelImportStatus(null), 5000);
  };

  return (
    <div className="space-y-6">
      {/* Compact Summary Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white border border-slate-200 rounded-lg px-5 py-4">
          <p className="text-xs text-slate-500 font-medium">تعداد پرسنل فهرست</p>
          <p className="mt-1.5 text-2xl font-semibold text-slate-900 font-mono-num tabular-nums">
            {toPersianDigits(employees.length)}{' '}
            <span className="text-xs font-normal text-slate-500">
              ({toPersianDigits(employees.filter((e) => e.isActive).length)} فعال)
            </span>
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg px-5 py-4">
          <p className="text-xs text-slate-500 font-medium">
            جمع کل مبالغ ۸ ردیف سازمانی (پرسنل فعال)
          </p>
          <p className="mt-1.5 text-2xl font-semibold text-teal-800 font-mono-num tabular-nums">
            {formatMoney(totalDraftPayroll)}{' '}
            <span className="text-xs font-normal text-slate-500">{currency}</span>
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg px-5 py-4">
          <p className="text-xs text-slate-500 font-medium">
            تغییرات آماده ثبت نهایی
          </p>
          <p className="mt-1.5 text-2xl font-semibold text-slate-900 font-mono-num tabular-nums">
            {toPersianDigits(modifiedCount)}{' '}
            <span className="text-xs font-normal text-slate-500">کارمند</span>
          </p>
        </div>
      </div>

      {!canEnterSalaryTiers && (
        <div
          role="status"
          className="bg-amber-50 border border-amber-200 text-amber-900 rounded-lg px-4 py-3 flex items-center gap-2 text-xs"
        >
          <Lock className="w-4 h-4 text-amber-700 shrink-0" aria-hidden="true" />
          <span>
            حساب کاربری فعلی فقط مجوز مشاهده جدول ۸ ردیف را دارد. برای ویرایش مبالغ یا ورود فایل اکسل، از مدیر سیستم دسترسی «ورود و خروجی اکسل ۸ ردیف حقوق» را دریافت کنید.
          </span>
        </div>
      )}

      {/* Dedicated Excel Import & Export Guide + Action Bar */}
      <CollapsibleCard
        title="ورود و خروجی اکسل جدول ۸ ردیف سازمانی"
        subtitle="فایل اکسل جدولی راست‌چین (.xlsx) یا ۳ ستونه را خروجی بگیرید، در اکسل تکمیل یا ویرایش کنید و دقیقاً همان فایل را به سیستم وارد نمایید."
        defaultOpen={true}
        resizable={false}
        headerActions={
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {manualSalarySavedToast && (
              <span className="text-xs font-medium text-emerald-700">
                مقادیر حقوق ثبت شد
              </span>
            )}
            <input
              ref={excelImportRef}
              type="file"
              accept=".xlsx,.csv,.tsv"
              onChange={handleExcelImportFile}
              className="hidden"
              aria-label="فایل اکسل ورود حقوق ۸ ردیف"
            />
            <button
              type="button"
              disabled={!canEnterSalaryTiers || periodManualPaymentCount === 0}
              onClick={handleExtractFromManualPayments}
              title="استخراج خودکار مبالغ از پرداخت حقوق دستی بر اساس محل خدمت (مانند خبر، تولید سیما، فضای مجازی) و ثبت در ستون مربوطه"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-indigo-700 hover:bg-indigo-800 disabled:opacity-45 disabled:cursor-not-allowed rounded-md transition-colors whitespace-nowrap shrink-0"
            >
              <ArrowDownToLine className="w-3.5 h-3.5" aria-hidden="true" />
              <span>
                استخراج از پرداخت حقوق دستی ۲
                {periodManualPaymentCount > 0
                  ? ` (${toPersianDigits(periodManualPaymentCount)} سند)`
                  : ''}
              </span>
            </button>
            <button
              type="button"
              disabled={!canEnterSalaryTiers || employees.length === 0}
              onClick={() => excelImportRef.current?.click()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-teal-900 bg-teal-50 hover:bg-teal-100 border border-teal-200 disabled:opacity-40 disabled:cursor-not-allowed rounded-md transition-colors whitespace-nowrap shrink-0"
            >
              <Upload className="w-3.5 h-3.5" aria-hidden="true" />
              <span>ورود از اکسل (.xlsx)</span>
            </button>
            <button
              type="button"
              disabled={employees.length === 0}
              onClick={handleExportTiersTableXlsx}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-emerald-700 hover:bg-emerald-800 disabled:opacity-40 disabled:cursor-not-allowed rounded-md transition-colors whitespace-nowrap shrink-0"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" aria-hidden="true" />
              <span>خروجی اکسل جدولی راست‌چین (.xlsx)</span>
            </button>
            <button
              type="button"
              disabled={employees.length === 0}
              onClick={handleExportThreeColXlsx}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 disabled:opacity-40 disabled:cursor-not-allowed rounded-md transition-colors whitespace-nowrap shrink-0"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" aria-hidden="true" />
              <span>خروجی ۳ ستونه</span>
            </button>
            <button
              type="button"
              disabled={!canEnterSalaryTiers || !hasManualSalaryChanges}
              onClick={handleSaveAllManualSalaries}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium text-white bg-teal-700 hover:bg-teal-800 disabled:opacity-50 disabled:cursor-not-allowed rounded-md transition-colors whitespace-nowrap shrink-0"
            >
              <Check className="w-3.5 h-3.5" aria-hidden="true" />
              <span>ثبت مقادیر حقوق دستی</span>
            </button>
          </div>
        }
      >
        <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-3 text-xs bg-slate-50/70">
          <div className="bg-white border border-slate-200 rounded-md p-3 space-y-1">
            <div className="font-semibold text-slate-900 flex items-center gap-1.5">
              <FileSpreadsheet className="w-4 h-4 text-emerald-700" aria-hidden="true" />
              <span>خروجی اکسل راست‌چین (جدول ۸ ردیفه و ۳ ستونه)</span>
            </div>
            <p className="text-slate-600 leading-5">
              با زدن «خروجی اکسل جدولی راست‌چین»، کل جدول شامل کد پرسنلی، نام کارمند و هر ۸ ردیف سازمانی (تولید سیما، تامین پخش صدا، تامین و پخش سیما، تولید سیما جیم، متمرکز پاداش، تولید سیما دال، خبر و فضای مجازی) با چیدمان راست‌به‌چپ تولید می‌شود.
            </p>
          </div>
          <div className="bg-white border border-slate-200 rounded-md p-3 space-y-1">
            <div className="font-semibold text-slate-900 flex items-center gap-1.5">
              <Upload className="w-4 h-4 text-teal-700" aria-hidden="true" />
              <span>ورود مجدد فایل اکسل به سیستم (.xlsx / .csv)</span>
            </div>
            <p className="text-slate-600 leading-5">
              همان فایل خروجی یا فایل ۳ ستونه را پس از تغییر مبالغ از طریق دکمه «ورود از اکسل (.xlsx)» انتخاب کنید تا مبالغ جدید به صورت خودکار برای تک‌تک کارمندان بارگذاری و در محاسبات فیش و گزارش‌ها اعمال شود.
            </p>
          </div>
        </div>
      </CollapsibleCard>

      {/* Dedicated Collapsible & Resizable 8-Tier Salary Payment & Amount Table */}
      <CollapsibleCard
        title="پرداخت حقوق و مقدار حقوق کارمندان (بر اساس ۸ ردیف سازمانی)"
        subtitle="مبالغ ثبت‌شده در «پرداخت حقوق دستی ۲» به صورت خودکار بر اساس محل خدمت در ۸ ردیف سازمانی (یا ستون اختصاصی معاونت جداگانه) بارگذاری می‌شوند؛ همچنین می‌توانید مستقیماً ویرایش یا از اکسل وارد کنید."
        defaultOpen={true}
        resizable={true}
        defaultSize="lg"
      >
        {/* Filter & Search Row */}
        <div className="px-4 py-3 border-b border-slate-200 bg-slate-50/60 space-y-3">
          <ContractDepartmentChecklist
            departments={departments}
            selectedDepartments={selectedDepartments}
            selectedContracts={selectedContracts}
            onChangeDepartments={setSelectedDepartments}
            onChangeContracts={setSelectedContracts}
            idPrefix="tiers"
          />

          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5">
            <div className="flex flex-wrap items-center gap-2 flex-1">
              <div className="relative flex-1 min-w-[220px] max-w-md">
                <label htmlFor="tier-emp-search" className="sr-only">
                  جستجو در مقدار حقوق کارمندان (نام، نام خانوادگی یا کد پرسنلی)
                </label>
                <Search
                  className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none"
                  aria-hidden="true"
                />
                <input
                  id="tier-emp-search"
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
                    aria-label="پاک کردن جستجوی جدول حقوق"
                    className="absolute left-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700 rounded"
                  >
                    <X className="w-3.5 h-3.5" aria-hidden="true" />
                  </button>
                )}
              </div>

              <select
                aria-label="فیلتر وضعیت جدول حقوق"
                value={statusFilter}
                onChange={(e) =>
                  setStatusFilter(e.target.value as 'all' | 'active' | 'inactive')
                }
                className="px-2.5 py-1.5 text-xs border border-slate-200 rounded-md bg-white text-slate-700 focus:outline-none focus:border-teal-600"
              >
                <option value="all">همه وضعیت‌ها</option>
                <option value="active">فقط فعال</option>
                <option value="inactive">فقط غیرفعال</option>
              </select>
            </div>

            <div className="flex items-center gap-3 text-xs text-slate-600">
              <span>
                نمایش{' '}
                <strong className="font-mono-num tabular-nums text-slate-900">
                  {toPersianDigits(displayedTierEmployees.length)}
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
                  پاک کردن فیلترها
                </button>
              )}
            </div>
          </div>
        </div>

        {excelImportStatus && (
          <div
            role="status"
            className={`mx-4 mt-3 px-4 py-2.5 text-xs rounded-md border ${
              excelImportStatus.type === 'success'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : 'bg-rose-50 border-rose-200 text-rose-800'
            }`}
          >
            {excelImportStatus.message}
          </div>
        )}

        {displayedTierEmployees.length === 0 ? (
          <div className="py-10 px-6 text-center text-xs text-slate-500 space-y-2">
            <p>
              {employees.length === 0
                ? 'کارمندی برای ورود حقوق دستی ثبت نشده است.'
                : 'کارمندی مطابق فیلتر جستجو در جدول ۸ ردیفه یافت نشد.'}
            </p>
            {hasActiveFilters && employees.length > 0 && (
              <button
                type="button"
                onClick={resetAllFilters}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-teal-800 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded-md transition-colors"
              >
                نمایش همه کارمندان
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-medium text-slate-600">
                  <th className="py-2.5 px-1.5 whitespace-nowrap">کارمند / کد</th>
                  <th className="py-2.5 px-1 whitespace-nowrap">روش محاسبه</th>
                  {SALARY_TIER_LABELS.map((label) => (
                    <th key={label} className="py-2.5 px-0.5 whitespace-nowrap">
                      {label}
                    </th>
                  ))}
                  {customTierLabels.map((customLabel) => (
                    <th
                      key={`custom-${customLabel}`}
                      className="py-2.5 px-1 whitespace-nowrap bg-indigo-50/70 text-indigo-900 border-r border-indigo-200/70"
                    >
                      {customLabel}
                    </th>
                  ))}
                  <th className="py-2.5 px-1.5 whitespace-nowrap">
                    جمع کل ({currency})
                  </th>
                  <th className="py-2.5 px-1.5 whitespace-nowrap text-left">
                    عملیات
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-xs">
                {displayedTierEmployees.map((emp) => {
                  const defaultTiers = normalizeManualSalaries(
                    emp.manualSalaries,
                    emp.baseMonthlySalary,
                    emp.customTierAmounts
                  );
                  const rawTuple =
                    manualSalaryDrafts[emp.id] ?? tiersToDraftTuple(defaultTiers);
                  const parsedTiers = getEmployeeDraftTiers(emp);
                  const parsedCustom = getEmployeeDraftCustomTiers(emp);
                  const draftTotal =
                    sumManualSalaries(parsedTiers) +
                    sumCustomTierAmounts(parsedCustom);
                  const isModified = isEmployeeManualModified(emp);
                  const empMode = getEffectiveSalaryMode(emp);

                  return (
                    <tr
                      key={emp.id}
                      className={`transition-colors ${
                        isModified ? 'bg-teal-50/40' : 'hover:bg-slate-50/70'
                      }`}
                    >
                      <td className="py-2 px-1.5 whitespace-nowrap">
                        <div className="font-semibold text-slate-900 text-xs">
                          {emp.fullName}
                        </div>
                        <div className="text-[10px] text-slate-500 font-mono-num tabular-nums mt-0.5">
                          کد {toPersianDigits(emp.personnelCode)}
                        </div>
                      </td>

                      <td className="py-2 px-1 whitespace-nowrap">
                        <select
                          aria-label={`روش محاسبه حقوق ${emp.fullName}`}
                          disabled={!canManageEmployees}
                          value={empMode}
                          onChange={(e) =>
                            onUpdateEmployee({
                              ...emp,
                              salaryCalculationMode:
                                e.target.value as SalaryCalculationMode,
                            })
                          }
                          className="px-1 py-1 text-[10px] border border-slate-200 rounded bg-white disabled:bg-slate-50 disabled:text-slate-600 focus:outline-none focus:border-teal-600 max-w-[100px]"
                        >
                          {(
                            Object.keys(
                              SALARY_CALCULATION_MODE_SHORT_LABELS
                            ) as SalaryCalculationMode[]
                          ).map((modeKey) => (
                            <option key={modeKey} value={modeKey}>
                              {SALARY_CALCULATION_MODE_SHORT_LABELS[modeKey]}
                            </option>
                          ))}
                        </select>
                      </td>

                      {SALARY_TIER_LABELS.map((tierLabel, tierIdx) => (
                        <td
                          key={tierLabel}
                          className="py-2 px-0.5 whitespace-nowrap align-top"
                        >
                          <div className="w-[56px]">
                            <input
                              id={`manual-salary-${tierIdx}-${emp.id}`}
                              type="text"
                              inputMode="numeric"
                              dir="ltr"
                              disabled={!canEnterSalaryTiers}
                              aria-label={`${tierLabel} ${emp.fullName}`}
                              value={rawTuple[tierIdx] ?? '0'}
                              onChange={(e) => {
                                const nextVal = e.target.value;
                                setManualSalaryDrafts((prev) => {
                                  const cur =
                                    prev[emp.id] ??
                                    tiersToDraftTuple(defaultTiers);
                                  const updatedTuple: SalaryDraftTuple = [
                                    cur[0],
                                    cur[1],
                                    cur[2],
                                    cur[3],
                                    cur[4],
                                    cur[5],
                                    cur[6],
                                    cur[7],
                                  ];
                                  updatedTuple[tierIdx] = nextVal;
                                  return {
                                    ...prev,
                                    [emp.id]: updatedTuple,
                                  };
                                });
                              }}
                              className="w-full px-1 py-1 text-[11px] border border-slate-200 rounded bg-white disabled:bg-slate-50 disabled:text-slate-500 font-mono-num tabular-nums text-left focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
                            />
                            <div
                              className="mt-0.5 text-[9px] font-mono-num tabular-nums text-slate-500 text-left"
                              dir="ltr"
                            >
                              {formatMoney(parsedTiers[tierIdx])}
                            </div>
                          </div>
                        </td>
                      ))}

                      {customTierLabels.map((customLabel) => {
                        const rawVal =
                          customTierDrafts[emp.id]?.[customLabel] ??
                          String(emp.customTierAmounts?.[customLabel] ?? 0);
                        return (
                          <td
                            key={`custom-${customLabel}-${emp.id}`}
                            className="py-2 px-1 whitespace-nowrap align-top bg-indigo-50/30 border-r border-indigo-100"
                          >
                            <div className="w-[62px]">
                              <input
                                type="text"
                                inputMode="numeric"
                                dir="ltr"
                                disabled={!canEnterSalaryTiers}
                                aria-label={`${customLabel} ${emp.fullName}`}
                                value={rawVal}
                                onChange={(e) => {
                                  const nextVal = e.target.value;
                                  setCustomTierDrafts((prev) => ({
                                    ...prev,
                                    [emp.id]: {
                                      ...(prev[emp.id] ?? {}),
                                      [customLabel]: nextVal,
                                    },
                                  }));
                                }}
                                className="w-full px-1 py-1 text-[11px] border border-indigo-200 rounded bg-white disabled:bg-slate-50 disabled:text-slate-500 font-mono-num tabular-nums text-left focus:outline-none focus:ring-2 focus:ring-indigo-600/20 focus:border-indigo-600"
                              />
                              <div
                                className="mt-0.5 text-[9px] font-mono-num tabular-nums text-indigo-800 text-left"
                                dir="ltr"
                              >
                                {formatMoney(parsedCustom[customLabel] ?? 0)}
                              </div>
                            </div>
                          </td>
                        );
                      })}

                      <td className="py-2 px-1.5 whitespace-nowrap">
                        <div className="font-mono-num tabular-nums text-xs font-semibold text-teal-800">
                          {formatMoney(draftTotal)}
                        </div>
                        {draftTotal <= 0 ? (
                          <div className="text-[10px] text-rose-600 mt-0.5">
                            جمع حقوق باید &gt; ۰ باشد
                          </div>
                        ) : (
                          draftTotal !== emp.baseMonthlySalary && (
                            <div className="text-[10px] text-slate-500 font-mono-num tabular-nums mt-0.5">
                              فعلی: {formatMoney(emp.baseMonthlySalary)}
                            </div>
                          )
                        )}
                      </td>

                      <td className="py-2 px-1.5 whitespace-nowrap text-left">
                        <button
                          type="button"
                          disabled={!canEnterSalaryTiers || !isModified}
                          onClick={() => handleSaveSingleManualSalary(emp)}
                          className="px-2 py-1 text-[11px] font-medium text-teal-800 bg-teal-50 hover:bg-teal-100 border border-teal-200 disabled:opacity-40 disabled:cursor-not-allowed rounded transition-colors whitespace-nowrap"
                        >
                          ثبت
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-slate-50 border-t border-slate-200 text-xs font-semibold text-slate-900">
                  <td className="py-3 px-1.5 whitespace-nowrap" colSpan={2}>
                    جمع کل ({toPersianDigits(displayedTierEmployees.length)} نفر
                    {hasActiveFilters
                      ? ` از ${toPersianDigits(employees.length)}`
                      : ''}
                    )
                  </td>
                  {SALARY_TIER_LABELS.map((label, tierIdx) => (
                    <td
                      key={label}
                      className="py-3 px-0.5 text-[10px] font-mono-num tabular-nums text-slate-700 whitespace-nowrap"
                    >
                      {formatMoney(
                        displayedTierEmployees.reduce(
                          (sum, emp) => sum + getEmployeeDraftTiers(emp)[tierIdx],
                          0
                        )
                      )}
                    </td>
                  ))}
                  {customTierLabels.map((customLabel) => (
                    <td
                      key={`foot-custom-${customLabel}`}
                      className="py-3 px-1 text-[10px] font-mono-num tabular-nums text-indigo-900 bg-indigo-50/60 border-r border-indigo-200/70 whitespace-nowrap"
                    >
                      {formatMoney(
                        displayedTierEmployees.reduce(
                          (sum, emp) =>
                            sum + (getEmployeeDraftCustomTiers(emp)[customLabel] ?? 0),
                          0
                        )
                      )}
                    </td>
                  ))}
                  <td className="py-3 px-1.5 font-mono-num tabular-nums text-teal-800 text-xs whitespace-nowrap">
                    {formatMoney(
                      displayedTierEmployees.reduce(
                        (sum, emp) => sum + getEmployeeTotalDraft(emp),
                        0
                      )
                    )}{' '}
                    {currency}
                  </td>
                  <td className="py-3 px-1.5" />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </CollapsibleCard>
    </div>
  );
};
