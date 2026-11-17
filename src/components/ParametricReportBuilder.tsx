import React, { useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  BookmarkPlus,
  CheckSquare,
  Download,
  FileSpreadsheet,
  Filter,
  RotateCcw,
  SlidersHorizontal,
  Square,
  Trash2,
  X,
} from 'lucide-react';
import type {
  AppState,
  ComputedPayslip,
  EmploymentType,
  ParametricAlignment,
  ParametricColumnConfig,
  ParametricFieldId,
  ParametricReportFilters,
  ParametricReportTemplate,
  ParametricSheetDirection,
  ParametricSortDirection,
  PayrollSettings,
} from '../types/payroll';
import {
  EMPLOYMENT_TYPE_LABELS,
  IRANIAN_BANKS,
  calculatePayrollReport,
  formatMoney,
  formatPeriodLabel,
  getEmploymentTypeLabel,
  toPersianDigits,
} from '../utils/payroll';
import {
  DEFAULT_PARAMETRIC_FILTERS,
  PARAMETRIC_CATEGORY_LABELS,
  PARAMETRIC_FIELDS,
  PARAMETRIC_FIELD_MAP,
  PARAMETRIC_PRESETS,
  type ParametricCategory,
  buildParametricTableData,
  filterParametricPayslips,
  resolveSelectedParametricRows,
  sortParametricPayslips,
} from '../utils/parametricReport';
import {
  colIndexToExcelLetter,
  downloadParametricXlsx,
} from '../utils/xlsxExport';

interface ParametricReportBuilderProps {
  appState: AppState;
  periodKey: string;
  settings: PayrollSettings;
  isAdmin: boolean;
  savedTemplates: ParametricReportTemplate[];
  onSaveTemplate: (template: ParametricReportTemplate) => void;
  onDeleteTemplate: (templateId: string) => void;
}

const ALIGNMENT_LABELS: Record<ParametricAlignment, string> = {
  left: 'چپ‌چین (Left)',
  center: 'وسط‌چین (Center)',
  right: 'راست‌چین (Right)',
};

const SHEET_DIR_LABELS: Record<ParametricSheetDirection, string> = {
  ltr: 'چپ‌به‌راست (LTR)',
  rtl: 'راست‌به‌راست (RTL)',
};

export const ParametricReportBuilder: React.FC<ParametricReportBuilderProps> = ({
  appState,
  periodKey,
  settings,
  isAdmin,
  savedTemplates,
  onSaveTemplate,
  onDeleteTemplate,
}) => {
  const [columns, setColumns] = useState<ParametricColumnConfig[]>(
    PARAMETRIC_PRESETS[0].columns
  );
  const [activeCategory, setActiveCategory] = useState<
    ParametricCategory | 'all'
  >('all');
  const [fieldSearch, setFieldSearch] = useState('');

  const [filters, setFilters] = useState<ParametricReportFilters>(
    DEFAULT_PARAMETRIC_FILTERS
  );
  const [sortBy, setSortBy] = useState<ParametricFieldId>('personnelCode');
  const [sortDirection, setSortDirection] =
    useState<ParametricSortDirection>('asc');

  // null means "all currently filtered rows"; string[] means hand-picked employee IDs
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<
    string[] | null
  >(null);
  const [customRowOrderIds, setCustomRowOrderIds] = useState<string[] | null>(
    null
  );

  // Excel output parameters: default LTR & left-aligned as requested
  const [sheetDirection, setSheetDirection] =
    useState<ParametricSheetDirection>('ltr');
  const [cellAlignment, setCellAlignment] =
    useState<ParametricAlignment>('left');
  const [includeHeaderRow, setIncludeHeaderRow] = useState(true);
  const [includeRowIndex, setIncludeRowIndex] = useState(false);
  const [includeTotalsRow, setIncludeTotalsRow] = useState(true);
  const [englishDigitsPreview, setEnglishDigitsPreview] = useState(true);
  const [sheetName, setSheetName] = useState('ParametricReport');

  const [templateNameInput, setTemplateNameInput] = useState('');
  const [activeTemplateId, setActiveTemplateId] = useState<string>('');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const allPayslipsReport = useMemo(
    () =>
      calculatePayrollReport(
        appState.employees,
        appState.timesheets,
        appState.loans,
        settings,
        periodKey,
        filters.includeInactive,
        appState.manualPayments ?? []
      ),
    [
      appState.employees,
      appState.timesheets,
      appState.loans,
      appState.manualPayments,
      settings,
      periodKey,
      filters.includeInactive,
    ]
  );

  const departmentOptions = useMemo(() => {
    const set = new Set<string>();
    for (const emp of appState.employees) {
      if (emp.department.trim()) set.add(emp.department.trim());
    }
    return Array.from(set);
  }, [appState.employees]);

  const bankOptions = useMemo(() => {
    const set = new Set<string>(IRANIAN_BANKS);
    for (const emp of appState.employees) {
      if (emp.bankName.trim()) set.add(emp.bankName.trim());
    }
    return Array.from(set);
  }, [appState.employees]);

  const filteredAndSortedPayslips: ComputedPayslip[] = useMemo(() => {
    const filtered = filterParametricPayslips(
      allPayslipsReport.payslips,
      filters
    );
    return sortParametricPayslips(filtered, sortBy, sortDirection);
  }, [allPayslipsReport.payslips, filters, sortBy, sortDirection]);

  const selectedRows: ComputedPayslip[] = useMemo(
    () =>
      resolveSelectedParametricRows(
        filteredAndSortedPayslips,
        selectedEmployeeIds,
        customRowOrderIds
      ),
    [filteredAndSortedPayslips, selectedEmployeeIds, customRowOrderIds]
  );

  const tableData = useMemo(
    () =>
      buildParametricTableData(selectedRows, columns, {
        includeRowIndex,
        includeTotalsRow,
      }),
    [selectedRows, columns, includeRowIndex, includeTotalsRow]
  );

  const visibleCatalogFields = useMemo(() => {
    const q = fieldSearch.trim().toLowerCase();
    return PARAMETRIC_FIELDS.filter((f) => {
      if (activeCategory !== 'all' && f.category !== activeCategory) {
        return false;
      }
      if (q && !f.label.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [activeCategory, fieldSearch]);

  const selectedFieldSet = useMemo(
    () => new Set(columns.map((c) => c.fieldId)),
    [columns]
  );

  const selectedIdSet = useMemo(() => {
    if (selectedEmployeeIds === null) {
      return new Set(filteredAndSortedPayslips.map((s) => s.employee.id));
    }
    return new Set(selectedEmployeeIds);
  }, [selectedEmployeeIds, filteredAndSortedPayslips]);

  const toggleColumn = (fieldId: ParametricFieldId) => {
    setColumns((prev) => {
      const exists = prev.some((c) => c.fieldId === fieldId);
      if (exists) {
        return prev.filter((c) => c.fieldId !== fieldId);
      }
      return [...prev, { fieldId }];
    });
  };

  const moveColumn = (index: number, delta: -1 | 1) => {
    setColumns((prev) => {
      const target = index + delta;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      const [item] = next.splice(index, 1);
      next.splice(target, 0, item);
      return next;
    });
  };

  const updateColumnCustomLabel = (
    fieldId: ParametricFieldId,
    customLabel: string
  ) => {
    setColumns((prev) =>
      prev.map((c) =>
        c.fieldId === fieldId ? { ...c, customLabel: customLabel || undefined } : c
      )
    );
  };

  const selectAllVisibleFields = () => {
    setColumns((prev) => {
      const existing = new Set(prev.map((c) => c.fieldId));
      const added = visibleCatalogFields
        .filter((f) => !existing.has(f.id))
        .map((f) => ({ fieldId: f.id }));
      return [...prev, ...added];
    });
  };

  const toggleEmployeeRow = (empId: string) => {
    setSelectedEmployeeIds((prev) => {
      const currentList =
        prev === null
          ? filteredAndSortedPayslips.map((s) => s.employee.id)
          : prev;
      if (currentList.includes(empId)) {
        return currentList.filter((id) => id !== empId);
      }
      return [...currentList, empId];
    });
  };

  const handleSelectAllFilteredRows = () => {
    setSelectedEmployeeIds(null);
  };

  const handleDeselectAllRows = () => {
    setSelectedEmployeeIds([]);
    setCustomRowOrderIds(null);
  };

  const moveSelectedRow = (empId: string, delta: -1 | 1) => {
    const orderedIds = selectedRows.map((s) => s.employee.id);
    const idx = orderedIds.indexOf(empId);
    const target = idx + delta;
    if (idx < 0 || target < 0 || target >= orderedIds.length) return;
    const nextOrder = [...orderedIds];
    const [item] = nextOrder.splice(idx, 1);
    nextOrder.splice(target, 0, item);
    setCustomRowOrderIds(nextOrder);
    if (selectedEmployeeIds === null) {
      setSelectedEmployeeIds(nextOrder);
    }
  };

  const applyPreset = (presetId: string) => {
    const preset = PARAMETRIC_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    setColumns(preset.columns.map((c) => ({ ...c })));
    setSortBy(preset.sortBy);
    setSortDirection(preset.sortDirection);
    setActiveTemplateId('');
    setStatusMessage(`الگوی آماده «${preset.label}» اعمال شد.`);
    window.setTimeout(() => setStatusMessage(null), 2200);
  };

  const applySavedTemplate = (templateId: string) => {
    setActiveTemplateId(templateId);
    const tpl = savedTemplates.find((t) => t.id === templateId);
    if (!tpl) return;
    setColumns(tpl.columns.map((c) => ({ ...c })));
    setSelectedEmployeeIds(
      tpl.selectedEmployeeIds ? [...tpl.selectedEmployeeIds] : null
    );
    setCustomRowOrderIds(
      tpl.selectedEmployeeIds ? [...tpl.selectedEmployeeIds] : null
    );
    setSortBy(tpl.sortBy);
    setSortDirection(tpl.sortDirection);
    setSheetDirection(tpl.sheetDirection);
    setCellAlignment(tpl.cellAlignment);
    setIncludeHeaderRow(tpl.includeHeaderRow);
    setIncludeRowIndex(tpl.includeRowIndex);
    setIncludeTotalsRow(tpl.includeTotalsRow);
    setSheetName(tpl.sheetName || 'ParametricReport');
    setStatusMessage(`الگوی ذخیره‌شده «${tpl.name}» بارگذاری شد.`);
    window.setTimeout(() => setStatusMessage(null), 2200);
  };

  const handleSaveNewTemplate = () => {
    if (!isAdmin) return;
    const trimmed = templateNameInput.trim();
    if (!trimmed) return;
    const orderedIds =
      selectedEmployeeIds === null ? null : selectedRows.map((s) => s.employee.id);
    const newTpl: ParametricReportTemplate = {
      id: `tpl-${Date.now()}`,
      name: trimmed,
      columns: columns.map((c) => ({ ...c })),
      selectedEmployeeIds: orderedIds,
      sortBy,
      sortDirection,
      sheetDirection,
      cellAlignment,
      includeHeaderRow,
      includeRowIndex,
      includeTotalsRow,
      sheetName: sheetName.trim() || 'ParametricReport',
      updatedAt: periodKey,
    };
    onSaveTemplate(newTpl);
    setTemplateNameInput('');
    setActiveTemplateId(newTpl.id);
    setStatusMessage(`الگوی «${trimmed}» با موفقیت ذخیره شد.`);
    window.setTimeout(() => setStatusMessage(null), 2500);
  };

  const handleDownloadXlsx = () => {
    if (tableData.columns.length === 0 || tableData.rows.length === 0) return;
    const prefix = sheetDirection === 'ltr' ? 'ltr-left' : 'rtl';
    downloadParametricXlsx(
      tableData,
      `parametric-${prefix}-${periodKey}.xlsx`,
      {
        sheetDirection,
        cellAlignment,
        includeHeaderRow,
        sheetName,
      }
    );
  };

  const cellAlignClass =
    cellAlignment === 'left'
      ? 'text-left'
      : cellAlignment === 'center'
        ? 'text-center'
        : 'text-right';

  const formatCellDisplay = (
    val: string | number,
    format: 'text' | 'code' | 'money' | 'number'
  ): string => {
    if (typeof val === 'number') {
      if (format === 'money') {
        return formatMoney(val, !englishDigitsPreview);
      }
      return englishDigitsPreview ? String(val) : toPersianDigits(val);
    }
    return englishDigitsPreview ? val : toPersianDigits(val);
  };

  return (
    <div className="space-y-5">
      {/* Header Toolbar + Presets + Templates */}
      <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <SlidersHorizontal
                className="w-4 h-4 text-emerald-700"
                aria-hidden="true"
              />
              <span>گزارش‌ساز پارامتریک اکسل (خروجی چپ‌چین)</span>
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              هر ستون، فیلتر، ترتیب و ردیف دلخواه را انتخاب کنید و خروجی واقعی اکسل (
              <span className="font-mono text-slate-700">.xlsx</span>) را به‌صورت چپ‌چین دریافت نمایید — دوره{' '}
              {formatPeriodLabel(periodKey)}
            </p>
          </div>

          <button
            type="button"
            disabled={
              tableData.columns.length === 0 || tableData.rows.length === 0
            }
            onClick={handleDownloadXlsx}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 disabled:cursor-not-allowed rounded-md transition-colors whitespace-nowrap shrink-0"
          >
            <Download className="w-4 h-4" aria-hidden="true" />
            <span>
              دانلود اکسل{' '}
              {cellAlignment === 'left' && sheetDirection === 'ltr'
                ? 'چپ‌چین'
                : 'سفارشی'}{' '}
              (.xlsx)
            </span>
          </button>
        </div>

        {/* Presets & Saved Templates Bar */}
        <div className="pt-3 border-t border-slate-200 flex flex-col xl:flex-row xl:items-center xl:justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-medium text-slate-500 ml-1">
              پیش‌فرض سریع:
            </span>
            {PARAMETRIC_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => applyPreset(preset.id)}
                className="px-2.5 py-1 text-xs font-medium text-teal-900 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded transition-colors"
              >
                {preset.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {savedTemplates.length > 0 && (
              <div className="flex items-center gap-1.5">
                <label
                  htmlFor="saved-template-select"
                  className="text-xs text-slate-600 whitespace-nowrap"
                >
                  الگوهای ذخیره‌شده:
                </label>
                <select
                  id="saved-template-select"
                  value={activeTemplateId}
                  onChange={(e) => applySavedTemplate(e.target.value)}
                  className="px-2.5 py-1.5 text-xs border border-slate-200 rounded-md bg-white text-slate-800"
                >
                  <option value="">انتخاب الگو...</option>
                  {savedTemplates.map((tpl) => (
                    <option key={tpl.id} value={tpl.id}>
                      {tpl.name} ({toPersianDigits(tpl.columns.length)} ستون)
                    </option>
                  ))}
                </select>
                {activeTemplateId && isAdmin && (
                  <button
                    type="button"
                    onClick={() => {
                      onDeleteTemplate(activeTemplateId);
                      setActiveTemplateId('');
                    }}
                    aria-label="حذف الگوی انتخاب‌شده"
                    className="p-1.5 text-rose-600 hover:bg-rose-50 border border-slate-200 rounded"
                  >
                    <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                  </button>
                )}
              </div>
            )}

            {isAdmin && (
              <div className="flex items-center gap-1.5">
                <input
                  id="parametric-template-name"
                  type="text"
                  value={templateNameInput}
                  onChange={(e) => setTemplateNameInput(e.target.value)}
                  placeholder="نام الگو برای ذخیره..."
                  aria-label="نام الگو برای ذخیره"
                  className="px-2.5 py-1.5 text-xs border border-slate-200 rounded-md bg-white w-44 focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
                />
                <button
                  type="button"
                  disabled={!templateNameInput.trim() || columns.length === 0}
                  onClick={handleSaveNewTemplate}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 rounded-md transition-colors whitespace-nowrap"
                >
                  <BookmarkPlus className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>ذخیره الگو</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {statusMessage && (
          <div
            role="status"
            className="bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs px-3 py-2 rounded-md"
          >
            {statusMessage}
          </div>
        )}
      </div>

      {/* Main 2-Column Parametric Configurator */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Column Configuration & Excel Layout (6 cols) */}
        <div className="lg:col-span-6 bg-white border border-slate-200 rounded-lg p-4 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-slate-900">
              ۱. انتخاب مشخصات و ستون‌های خروجی ({toPersianDigits(columns.length)}{' '}
              ستون)
            </h3>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={selectAllVisibleFields}
                className="px-2 py-1 text-[11px] font-medium text-teal-800 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded"
              >
                افزودن همه این دسته
              </button>
              <button
                type="button"
                onClick={() => setColumns([])}
                className="px-2 py-1 text-[11px] font-medium text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded"
              >
                پاک کردن
              </button>
            </div>
          </div>

          {/* Category Filter + Field Search */}
          <div className="flex flex-col sm:flex-row gap-2">
            <select
              id="parametric-field-category"
              aria-label="فیلتر دسته ستون‌ها"
              value={activeCategory}
              onChange={(e) =>
                setActiveCategory(e.target.value as ParametricCategory | 'all')
              }
              className="px-2.5 py-1.5 text-xs border border-slate-200 rounded-md bg-white"
            >
              <option value="all">همه دسته‌ها</option>
              {(Object.keys(PARAMETRIC_CATEGORY_LABELS) as ParametricCategory[]).map(
                (cat) => (
                  <option key={cat} value={cat}>
                    {PARAMETRIC_CATEGORY_LABELS[cat]}
                  </option>
                )
              )}
            </select>
            <input
              id="parametric-field-search"
              type="text"
              value={fieldSearch}
              onChange={(e) => setFieldSearch(e.target.value)}
              placeholder="جستجوی نام ستون (مثلاً حق مسکن، شبا، وام...)"
              aria-label="جستجوی نام ستون"
              className="flex-1 px-2.5 py-1.5 text-xs border border-slate-200 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
            />
          </div>

          {/* Field Selection Checkboxes */}
          <div className="max-h-52 overflow-y-auto border border-slate-200 rounded-md p-2.5 grid grid-cols-1 sm:grid-cols-2 gap-1.5 bg-slate-50/50">
            {visibleCatalogFields.map((field) => {
              const isChecked = selectedFieldSet.has(field.id);
              return (
                <label
                  key={field.id}
                  className={`flex items-center gap-2 px-2.5 py-1.5 rounded text-xs cursor-pointer select-none border transition-colors ${
                    isChecked
                      ? 'bg-teal-50 border-teal-300 text-teal-950 font-medium'
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => toggleColumn(field.id)}
                    className="w-3.5 h-3.5 accent-teal-700 rounded"
                  />
                  <span className="truncate">{field.label}</span>
                </label>
              );
            })}
          </div>

          {/* Selected Columns Order & Custom Title */}
          <div className="space-y-2">
            <div className="text-xs font-semibold text-slate-700">
              ترتیب و عنوان ستون‌ها در اکسل (از چپ به راست: A, B, C...)
            </div>
            {columns.length === 0 ? (
              <div className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded p-3 text-center">
                هیچ ستونی انتخاب نشده است. حداقل یک ستون انتخاب کنید.
              </div>
            ) : (
              <div className="max-h-52 overflow-y-auto space-y-1.5 border border-slate-200 rounded-md p-2 bg-slate-50/40">
                {columns.map((col, idx) => {
                  const def = PARAMETRIC_FIELD_MAP[col.fieldId];
                  const colLetter = colIndexToExcelLetter(
                    includeRowIndex ? idx + 1 : idx
                  );
                  return (
                    <div
                      key={col.fieldId}
                      className="flex items-center gap-2 bg-white border border-slate-200 rounded px-2 py-1.5"
                    >
                      <span
                        className="w-7 text-center font-mono text-[11px] font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 rounded py-0.5 shrink-0"
                        dir="ltr"
                      >
                        {colLetter}
                      </span>
                      <input
                        type="text"
                        value={col.customLabel ?? ''}
                        onChange={(e) =>
                          updateColumnCustomLabel(col.fieldId, e.target.value)
                        }
                        placeholder={def?.label ?? col.fieldId}
                        aria-label={`عنوان سفارشی ستون ${def?.label ?? col.fieldId}`}
                        className="flex-1 min-w-0 px-2 py-1 text-xs border border-slate-200 rounded bg-white focus:outline-none focus:border-teal-600"
                      />
                      <div className="flex items-center gap-0.5 shrink-0">
                        <button
                          type="button"
                          disabled={idx === 0}
                          onClick={() => moveColumn(idx, -1)}
                          aria-label={`انتقال ستون ${def?.label} به جلو`}
                          className="p-1 text-slate-500 hover:text-slate-900 disabled:opacity-30 rounded"
                        >
                          <ArrowUp className="w-3.5 h-3.5" aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          disabled={idx === columns.length - 1}
                          onClick={() => moveColumn(idx, 1)}
                          aria-label={`انتقال ستون ${def?.label} به عقب`}
                          className="p-1 text-slate-500 hover:text-slate-900 disabled:opacity-30 rounded"
                        >
                          <ArrowDown className="w-3.5 h-3.5" aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          onClick={() => toggleColumn(col.fieldId)}
                          aria-label={`حذف ستون ${def?.label}`}
                          className="p-1 text-rose-500 hover:text-rose-700 rounded"
                        >
                          <X className="w-3.5 h-3.5" aria-hidden="true" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Excel Left-Align & Format Controls */}
          <div className="pt-3 border-t border-slate-200 space-y-3">
            <div className="text-xs font-semibold text-slate-800">
              تنظیمات اکسل و چیدمان چپ‌چین
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <div>
                <label
                  htmlFor="parametric-sheet-dir"
                  className="block text-[11px] text-slate-500 mb-1"
                >
                  جهت کاربرگ اکسل
                </label>
                <select
                  id="parametric-sheet-dir"
                  value={sheetDirection}
                  onChange={(e) =>
                    setSheetDirection(e.target.value as ParametricSheetDirection)
                  }
                  className="w-full px-2 py-1.5 text-xs border border-slate-200 rounded bg-white"
                >
                  {(
                    Object.keys(SHEET_DIR_LABELS) as ParametricSheetDirection[]
                  ).map((dir) => (
                    <option key={dir} value={dir}>
                      {SHEET_DIR_LABELS[dir]}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="parametric-cell-align"
                  className="block text-[11px] text-slate-500 mb-1"
                >
                  تراز محتوای سلول‌ها
                </label>
                <select
                  id="parametric-cell-align"
                  value={cellAlignment}
                  onChange={(e) =>
                    setCellAlignment(e.target.value as ParametricAlignment)
                  }
                  className="w-full px-2 py-1.5 text-xs border border-slate-200 rounded bg-white"
                >
                  {(Object.keys(ALIGNMENT_LABELS) as ParametricAlignment[]).map(
                    (align) => (
                      <option key={align} value={align}>
                        {ALIGNMENT_LABELS[align]}
                      </option>
                    )
                  )}
                </select>
              </div>

              <div>
                <label
                  htmlFor="parametric-sheet-name"
                  className="block text-[11px] text-slate-500 mb-1"
                >
                  نام کاربرگ (Sheet)
                </label>
                <input
                  id="parametric-sheet-name"
                  type="text"
                  value={sheetName}
                  onChange={(e) => setSheetName(e.target.value)}
                  dir="ltr"
                  className="w-full px-2 py-1.5 text-xs border border-slate-200 rounded bg-white font-mono"
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-slate-700">
              <label className="inline-flex items-center gap-1.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={includeHeaderRow}
                  onChange={(e) => setIncludeHeaderRow(e.target.checked)}
                  className="w-3.5 h-3.5 accent-emerald-700 rounded"
                />
                <span>درج ردیف سرستون</span>
              </label>

              <label className="inline-flex items-center gap-1.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={includeRowIndex}
                  onChange={(e) => setIncludeRowIndex(e.target.checked)}
                  className="w-3.5 h-3.5 accent-emerald-700 rounded"
                />
                <span>ستون شماره ردیف</span>
              </label>

              <label className="inline-flex items-center gap-1.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={includeTotalsRow}
                  onChange={(e) => setIncludeTotalsRow(e.target.checked)}
                  className="w-3.5 h-3.5 accent-emerald-700 rounded"
                />
                <span>ردیف جمع کل ستون‌های عددی</span>
              </label>

              <label className="inline-flex items-center gap-1.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={englishDigitsPreview}
                  onChange={(e) => setEnglishDigitsPreview(e.target.checked)}
                  className="w-3.5 h-3.5 accent-emerald-700 rounded"
                />
                <span>ارقام لاتین در پیش‌نمایش</span>
              </label>
            </div>
          </div>
        </div>

        {/* Row Filtering, Sorting & Individual Row Selection (6 cols) */}
        <div className="lg:col-span-6 bg-white border border-slate-200 rounded-lg p-4 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-1.5">
              <Filter className="w-4 h-4 text-teal-700" aria-hidden="true" />
              <span>
                ۲. فیلتر و انتخاب ردیف‌های دلخواه (
                {toPersianDigits(selectedRows.length)} از{' '}
                {toPersianDigits(filteredAndSortedPayslips.length)} ردیف)
              </span>
            </h3>
            <button
              type="button"
              onClick={() => {
                setFilters(DEFAULT_PARAMETRIC_FILTERS);
                setSelectedEmployeeIds(null);
                setCustomRowOrderIds(null);
              }}
              className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded"
            >
              <RotateCcw className="w-3 h-3" aria-hidden="true" />
              <span>بازنشانی فیلترها</span>
            </button>
          </div>

          {/* Filter Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            <div className="sm:col-span-2 lg:col-span-3">
              <label
                htmlFor="parametric-row-search"
                className="block text-[11px] text-slate-500 mb-1"
              >
                جستجوی ردیف (نام، کد پرسنلی، کد ملی، محل خدمت، شماره حساب)
              </label>
              <input
                id="parametric-row-search"
                type="text"
                value={filters.searchQuery}
                onChange={(e) =>
                  setFilters((f) => ({ ...f, searchQuery: e.target.value }))
                }
                placeholder="جستجو در مشخصات پرسنل..."
                className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
              />
            </div>

            <div>
              <label
                htmlFor="parametric-filter-contract"
                className="block text-[11px] text-slate-500 mb-1"
              >
                نوع قرارداد
              </label>
              <select
                id="parametric-filter-contract"
                value={filters.employmentType}
                onChange={(e) =>
                  setFilters((f) => ({
                    ...f,
                    employmentType: e.target.value as EmploymentType | 'all',
                  }))
                }
                className="w-full px-2 py-1.5 text-xs border border-slate-200 rounded bg-white"
              >
                <option value="all">همه قراردادها</option>
                {(
                  Object.keys(EMPLOYMENT_TYPE_LABELS) as EmploymentType[]
                ).map((t) => (
                  <option key={t} value={t}>
                    {EMPLOYMENT_TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="parametric-filter-dept"
                className="block text-[11px] text-slate-500 mb-1"
              >
                دپارتمان / واحد
              </label>
              <select
                id="parametric-filter-dept"
                value={filters.department}
                onChange={(e) =>
                  setFilters((f) => ({ ...f, department: e.target.value }))
                }
                className="w-full px-2 py-1.5 text-xs border border-slate-200 rounded bg-white"
              >
                <option value="all">همه دپارتمان‌ها</option>
                {departmentOptions.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="parametric-filter-bank"
                className="block text-[11px] text-slate-500 mb-1"
              >
                بانک عامل
              </label>
              <select
                id="parametric-filter-bank"
                value={filters.bankName}
                onChange={(e) =>
                  setFilters((f) => ({ ...f, bankName: e.target.value }))
                }
                className="w-full px-2 py-1.5 text-xs border border-slate-200 rounded bg-white"
              >
                <option value="all">همه بانک‌ها</option>
                {bankOptions.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="parametric-sort-field"
                className="block text-[11px] text-slate-500 mb-1"
              >
                مرتب‌سازی بر اساس
              </label>
              <select
                id="parametric-sort-field"
                value={sortBy}
                onChange={(e) => {
                  setSortBy(e.target.value as ParametricFieldId);
                  setCustomRowOrderIds(null);
                }}
                className="w-full px-2 py-1.5 text-xs border border-slate-200 rounded bg-white"
              >
                {PARAMETRIC_FIELDS.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="parametric-sort-dir"
                className="block text-[11px] text-slate-500 mb-1"
              >
                جهت مرتب‌سازی
              </label>
              <select
                id="parametric-sort-dir"
                value={sortDirection}
                onChange={(e) => {
                  setSortDirection(e.target.value as ParametricSortDirection);
                  setCustomRowOrderIds(null);
                }}
                className="w-full px-2 py-1.5 text-xs border border-slate-200 rounded bg-white"
              >
                <option value="asc">صعودی (کم به زیاد / الف تا ی)</option>
                <option value="desc">نزولی (زیاد به کم / ی تا الف)</option>
              </select>
            </div>

            <div className="flex items-end pb-1">
              <label className="inline-flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={filters.includeInactive}
                  onChange={(e) =>
                    setFilters((f) => ({
                      ...f,
                      includeInactive: e.target.checked,
                    }))
                  }
                  className="w-3.5 h-3.5 accent-teal-700 rounded"
                />
                <span>نمایش کارمندان غیرفعال</span>
              </label>
            </div>
          </div>

          {/* Optional Min/Max Net Range + Row Selection Controls */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div>
              <label
                htmlFor="parametric-min-net"
                className="block text-[11px] text-slate-500 mb-1"
              >
                حداقل خالص پرداختی ({settings.currency})
              </label>
              <input
                id="parametric-min-net"
                type="text"
                inputMode="numeric"
                value={filters.minNetPayable}
                onChange={(e) =>
                  setFilters((f) => ({ ...f, minNetPayable: e.target.value }))
                }
                placeholder="مثلاً 10000000"
                dir="ltr"
                className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded bg-white font-mono text-left"
              />
            </div>
            <div>
              <label
                htmlFor="parametric-max-net"
                className="block text-[11px] text-slate-500 mb-1"
              >
                حداکثر خالص پرداختی ({settings.currency})
              </label>
              <input
                id="parametric-max-net"
                type="text"
                inputMode="numeric"
                value={filters.maxNetPayable}
                onChange={(e) =>
                  setFilters((f) => ({ ...f, maxNetPayable: e.target.value }))
                }
                placeholder="بدون محدودیت"
                dir="ltr"
                className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded bg-white font-mono text-left"
              />
            </div>
          </div>

          {/* Individual Row Checkboxes */}
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-semibold text-slate-700">
                انتخاب دستی ردیف‌ها (تیک بزنید تا فقط همان ردیف‌ها در اکسل باشند)
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={handleSelectAllFilteredRows}
                  className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-teal-800 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded"
                >
                  <CheckSquare className="w-3 h-3" aria-hidden="true" />
                  <span>انتخاب همه</span>
                </button>
                <button
                  type="button"
                  onClick={handleDeselectAllRows}
                  className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded"
                >
                  <Square className="w-3 h-3" aria-hidden="true" />
                  <span>لغو انتخاب</span>
                </button>
              </div>
            </div>

            <div className="max-h-60 overflow-y-auto border border-slate-200 rounded-md divide-y divide-slate-100">
              {filteredAndSortedPayslips.length === 0 ? (
                <div className="py-8 px-4 text-center text-xs text-slate-500">
                  هیچ ردیفی مطابق با فیلترهای فعلی یافت نشد.
                </div>
              ) : (
                filteredAndSortedPayslips.map((slip) => {
                  const isChecked = selectedIdSet.has(slip.employee.id);
                  const orderIdx = selectedRows.findIndex(
                    (s) => s.employee.id === slip.employee.id
                  );
                  return (
                    <div
                      key={slip.employee.id}
                      className={`flex items-center justify-between gap-2 px-3 py-2 text-xs ${
                        isChecked ? 'bg-teal-50/40' : 'bg-white'
                      }`}
                    >
                      <label className="flex items-center gap-2.5 min-w-0 flex-1 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleEmployeeRow(slip.employee.id)}
                          className="w-3.5 h-3.5 accent-teal-700 rounded shrink-0"
                        />
                        <div className="min-w-0">
                          <div className="font-medium text-slate-900 truncate">
                            {slip.employee.fullName}{' '}
                            <span className="text-[11px] text-slate-400 font-normal">
                              ({toPersianDigits(slip.employee.personnelCode)})
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-500 truncate">
                            {getEmploymentTypeLabel(slip.employee.employmentType)} ·{' '}
                            {slip.employee.bankName} · خالص:{' '}
                            <span className="font-mono-num tabular-nums font-medium text-teal-800">
                              {formatMoney(slip.netPayable)}
                            </span>
                          </div>
                        </div>
                      </label>

                      {isChecked && orderIdx >= 0 && (
                        <div className="flex items-center gap-0.5 shrink-0">
                          <button
                            type="button"
                            disabled={orderIdx === 0}
                            onClick={() => moveSelectedRow(slip.employee.id, -1)}
                            aria-label={`انتقال ردیف ${slip.employee.fullName} به بالا`}
                            className="p-1 text-slate-500 hover:text-slate-900 disabled:opacity-30 rounded"
                          >
                            <ArrowUp className="w-3.5 h-3.5" aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            disabled={orderIdx === selectedRows.length - 1}
                            onClick={() => moveSelectedRow(slip.employee.id, 1)}
                            aria-label={`انتقال ردیف ${slip.employee.fullName} به پایین`}
                            className="p-1 text-slate-500 hover:text-slate-900 disabled:opacity-30 rounded"
                          >
                            <ArrowDown className="w-3.5 h-3.5" aria-hidden="true" />
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Live Excel Preview Grid */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 bg-slate-50/70 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div className="flex items-center gap-2">
            <FileSpreadsheet
              className="w-4 h-4 text-emerald-700"
              aria-hidden="true"
            />
            <h3 className="text-sm font-semibold text-slate-900">
              پیش‌نمایش زنده خروجی اکسل ({sheetName || 'ParametricReport'})
            </h3>
          </div>
          <div className="text-xs text-slate-600 flex flex-wrap items-center gap-3">
            <span>
              جهت: <strong>{sheetDirection === 'ltr' ? 'چپ‌به‌راست (LTR)' : 'راست‌به‌راست (RTL)'}</strong>
            </span>
            <span>·</span>
            <span>
              تراز سلول‌ها: <strong>{ALIGNMENT_LABELS[cellAlignment]}</strong>
            </span>
            <span>·</span>
            <span className="font-mono-num tabular-nums">
              {toPersianDigits(tableData.rows.length)} ردیف ×{' '}
              {toPersianDigits(tableData.columns.length)} ستون
            </span>
          </div>
        </div>

        {tableData.columns.length === 0 || tableData.rows.length === 0 ? (
          <div className="py-12 px-6 text-center text-xs text-slate-500">
            برای نمایش پیش‌نمایش و دانلود فایل اکسل، حداقل یک ستون و یک ردیف انتخاب کنید.
          </div>
        ) : (
          <div className="p-3 bg-slate-100">
            <div className="bg-white border border-slate-300 shadow-xs overflow-x-auto">
              <table
                dir={sheetDirection}
                className="w-full border-collapse text-[13px]"
              >
                <thead>
                  {/* Excel Column Letters Row (A, B, C, ...) */}
                  <tr className="bg-[#E6E6E6] text-slate-700 text-xs font-mono select-none">
                    <th className="w-10 border border-[#C6C6C6] bg-[#E6E6E6] py-1 text-center font-normal">
                      &nbsp;
                    </th>
                    {tableData.columns.map((col, idx) => (
                      <th
                        key={col.key}
                        className="border border-[#C6C6C6] py-1 px-2.5 text-center font-semibold bg-[#E6E6E6]"
                      >
                        {colIndexToExcelLetter(idx)}
                      </th>
                    ))}
                  </tr>

                  {/* Optional Column Header Row */}
                  {includeHeaderRow && (
                    <tr className="bg-slate-200/80 text-slate-900 text-xs font-bold">
                      <td className="border border-[#C6C6C6] bg-[#F3F3F3] text-center font-mono text-slate-600 py-1.5">
                        1
                      </td>
                      {tableData.columns.map((col) => (
                        <td
                          key={`hdr-${col.key}`}
                          className={`border border-[#C6C6C6] px-2.5 py-1.5 whitespace-nowrap ${cellAlignClass}`}
                        >
                          {col.header}
                        </td>
                      ))}
                    </tr>
                  )}
                </thead>

                <tbody>
                  {tableData.rows.map((row, rIdx) => {
                    const excelRowNum = (includeHeaderRow ? 2 : 1) + rIdx;
                    return (
                      <tr
                        key={`${row.employeeId}-${rIdx}`}
                        className="hover:bg-slate-50/70"
                      >
                        <td className="border border-[#D4D4D4] bg-[#F3F3F3] text-center text-xs font-mono text-slate-600 py-1.5 px-2 select-none">
                          {excelRowNum}
                        </td>
                        {row.cells.map((val, cIdx) => {
                          const col = tableData.columns[cIdx];
                          const isCodeOrNum =
                            col.format === 'code' ||
                            col.format === 'money' ||
                            col.format === 'number';
                          return (
                            <td
                              key={`${row.employeeId}-${col.key}`}
                              dir={sheetDirection === 'ltr' && isCodeOrNum ? 'ltr' : undefined}
                              className={`border border-[#D4D4D4] px-2.5 py-1.5 whitespace-nowrap text-slate-900 ${cellAlignClass} ${
                                col.format === 'money' || col.format === 'number'
                                  ? 'font-mono-num tabular-nums'
                                  : col.format === 'code'
                                    ? 'font-mono'
                                    : ''
                              }`}
                            >
                              {formatCellDisplay(val, col.format)}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}

                  {tableData.totalsRow && (
                    <tr className="bg-emerald-50 font-semibold text-emerald-950">
                      <td className="border border-[#C6C6C6] bg-[#E6EFE9] text-center text-xs font-mono text-emerald-900 py-1.5 px-2 select-none">
                        {(includeHeaderRow ? 2 : 1) + tableData.rows.length}
                      </td>
                      {tableData.totalsRow.map((totVal, cIdx) => {
                        const col = tableData.columns[cIdx];
                        return (
                          <td
                            key={`tot-${col.key}`}
                            className={`border border-[#C6C6C6] px-2.5 py-1.5 whitespace-nowrap ${cellAlignClass} ${
                              col.format === 'money' || col.format === 'number'
                                ? 'font-mono-num tabular-nums'
                                : ''
                            }`}
                          >
                            {totVal === ''
                              ? ''
                              : formatCellDisplay(totVal, col.format)}
                          </td>
                        );
                      })}
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Excel Sheet Tab Footer */}
            <div className="bg-[#F3F3F3] border border-t-0 border-slate-300 px-3 pt-1.5 flex items-center justify-between text-xs">
              <span className="px-3 py-1 bg-white border border-b-0 border-slate-300 text-emerald-800 font-semibold border-t-2 border-t-emerald-700">
                {sheetName || 'ParametricReport'}
              </span>
              <span className="pb-1 text-[11px] text-slate-500">
                پیش‌نمایش منطبق با ساختار ستون‌های فایل اکسل خروجی
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
