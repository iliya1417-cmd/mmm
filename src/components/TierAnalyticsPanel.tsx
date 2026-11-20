import React, { useMemo, useState } from 'react';
import { BarChart3, FileSpreadsheet, Layers } from 'lucide-react';
import type { AppState, PayrollSettings } from '../types/payroll';
import {
  JALALI_MONTHS,
  SALARY_TIER_LABELS,
  formatMoney,
  toPersianDigits,
} from '../utils/payroll';
import {
  buildAnnualTierParametricTable,
  calculateAnnualTierBreakdown,
} from '../utils/tierAnalytics';
import { downloadParametricXlsx } from '../utils/xlsxExport';
import { CollapsibleCard } from './CollapsibleCard';

interface TierAnalyticsPanelProps {
  appState: AppState;
  activePeriodKey: string;
  settings: PayrollSettings;
}

const TIER_COLORS: ReadonlyArray<string> = [
  '#0f766e', // تولید سیما
  '#0284c7', // تامین پخش صدا
  '#2563eb', // تامین و پخش سیما
  '#7c3aed', // تولید سیما جیم
  '#d97706', // متمرکز پاداش
  '#059669', // تولید سیما دال
  '#dc2626', // خبر
  '#db2777', // فضای مجازی
];

export const TierAnalyticsPanel: React.FC<TierAnalyticsPanelProps> = ({
  appState,
  activePeriodKey,
  settings,
}) => {
  const initialYear = Number(activePeriodKey.split('-')[0]) || 1405;
  const [selectedYear, setSelectedYear] = useState<number>(initialYear);
  const [includeProjectedMonths, setIncludeProjectedMonths] = useState<boolean>(false);
  const [includeInactive, setIncludeInactive] = useState<boolean>(false);
  const [chartScope, setChartScope] = useState<'annual' | number>('annual');
  const [chartMode, setChartMode] = useState<'tiers' | 'monthly'>('tiers');

  const analytics = useMemo(
    () =>
      calculateAnnualTierBreakdown({
        year: selectedYear,
        activePeriodKey,
        employees: appState.employees,
        timesheets: appState.timesheets,
        loans: appState.loans,
        settings,
        manualPayments: appState.manualPayments ?? [],
        includeInactive,
        includeProjectedMonths,
      }),
    [
      selectedYear,
      activePeriodKey,
      appState.employees,
      appState.timesheets,
      appState.loans,
      appState.manualPayments,
      settings,
      includeInactive,
      includeProjectedMonths,
    ]
  );

  const selectedMonthRow = useMemo(
    () =>
      typeof chartScope === 'number'
        ? analytics.months.find((m) => m.month === chartScope) ?? null
        : null,
    [analytics.months, chartScope]
  );

  const activeTierValues = selectedMonthRow
    ? selectedMonthRow.tierTotals
    : analytics.annualTierTotals;

  const activeGrandTotal = selectedMonthRow
    ? selectedMonthRow.grandTotal
    : analytics.annualGrandTotal;

  const maxTierValue = Math.max(1, ...activeTierValues);
  const maxMonthTotal = Math.max(1, ...analytics.months.map((m) => m.grandTotal));

  const handleExportXlsx = () => {
    const table = buildAnnualTierParametricTable(analytics);
    downloadParametricXlsx(table, `tiers-breakdown-${selectedYear}.xlsx`, {
      sheetDirection: 'rtl',
      cellAlignment: 'right',
      includeHeaderRow: true,
      sheetName: `Tiers_${selectedYear}`,
    });
  };

  return (
    <div className="space-y-5">
      {/* Header & Controls */}
      <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Layers className="w-4 h-4 text-teal-700" aria-hidden="true" />
              <span>تحلیل و گزارش پرداختی ۸ ردیف حقوقی کل سازمان</span>
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              مجموع پرداختی‌های محاسبه‌شده در هر یک از ۸ ردیف حقوقی (تولید سیما، تامین پخش صدا و...) به تفکیک ماه و جمع سالانه — سال {toPersianDigits(selectedYear)}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor="tier-analytics-year" className="text-xs text-slate-600">
              سال مالی:
            </label>
            <select
              id="tier-analytics-year"
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              className="px-2.5 py-1.5 text-xs border border-slate-200 rounded-md bg-white font-mono-num"
            >
              {[1403, 1404, 1405, 1406].map((y) => (
                <option key={y} value={y}>
                  {toPersianDigits(y)}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={handleExportXlsx}
              disabled={analytics.annualGrandTotal <= 0}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-emerald-700 hover:bg-emerald-800 disabled:opacity-45 rounded-md transition-colors whitespace-nowrap shrink-0"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" aria-hidden="true" />
              <span>خروجی اکسل ۸ ردیف (.xlsx)</span>
            </button>
          </div>
        </div>

        <div className="pt-3 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex flex-wrap items-center gap-4">
            <label className="inline-flex items-center gap-1.5 cursor-pointer select-none text-slate-700">
              <input
                type="checkbox"
                checked={includeProjectedMonths}
                onChange={(e) => setIncludeProjectedMonths(e.target.checked)}
                className="w-3.5 h-3.5 accent-teal-700 rounded"
              />
              <span>پیش‌بینی و محاسبه تمام ۱۲ ماه سال (حتی ماه‌های بدون کارکرد ثبت‌شده)</span>
            </label>

            <label className="inline-flex items-center gap-1.5 cursor-pointer select-none text-slate-700">
              <input
                type="checkbox"
                checked={includeInactive}
                onChange={(e) => setIncludeInactive(e.target.checked)}
                className="w-3.5 h-3.5 accent-teal-700 rounded"
              />
              <span>شامل پرسنل غیرفعال</span>
            </label>
          </div>

          <div className="text-slate-600 font-mono-num tabular-nums">
            ماه‌های دارای داده ثبت‌شده:{' '}
            <strong className="text-teal-800">
              {toPersianDigits(analytics.recordedMonthCount)} ماه
            </strong>{' '}
            · جمع کل دوره انتخابی:{' '}
            <strong className="text-slate-900">
              {formatMoney(analytics.annualGrandTotal)} {settings.currency}
            </strong>
          </div>
        </div>
      </div>

      {/* 8-Tier Share KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {analytics.tierSummary.map((item) => (
          <div
            key={item.label}
            className="bg-white border border-slate-200 rounded-lg p-3.5 space-y-1.5"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-800 truncate">
                <span
                  className="w-2.5 h-2.5 rounded-xs shrink-0"
                  style={{ backgroundColor: TIER_COLORS[item.tierIndex] }}
                  aria-hidden="true"
                />
                <span className="truncate">{item.label}</span>
              </span>
              <span className="text-[11px] font-mono-num tabular-nums font-medium text-slate-500">
                {toPersianDigits(item.sharePercent)}٪
              </span>
            </div>
            <div className="text-base font-bold text-slate-900 font-mono-num tabular-nums">
              {formatMoney(item.annualTotal)}{' '}
              <span className="text-[11px] font-normal text-slate-500">
                {settings.currency}
              </span>
            </div>
            <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-300"
                style={{
                  width: `${Math.min(100, Math.max(item.annualTotal > 0 ? 4 : 0, item.sharePercent))}%`,
                  backgroundColor: TIER_COLORS[item.tierIndex],
                }}
              />
            </div>
          </div>
        ))}
      </div>

      {/* Bar Chart Card */}
      <CollapsibleCard
        title="نمودار ستونی هزینه‌کرد ردیف‌های حقوقی"
        subtitle={
          chartMode === 'tiers'
            ? selectedMonthRow
              ? `مقایسه ۸ ردیف حقوقی در ${selectedMonthRow.monthLabel} ${toPersianDigits(selectedYear)}`
              : `مقایسه مجموع سالانه ۸ ردیف حقوقی در سال ${toPersianDigits(selectedYear)}`
            : `روند هزینه‌کرد ماهانه کل سازمان در ۱۲ ماه سال ${toPersianDigits(selectedYear)}`
        }
        defaultOpen={true}
        resizable={true}
        defaultSize="auto"
        headerActions={
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center p-0.5 bg-slate-100 border border-slate-200 rounded-md">
              <button
                type="button"
                onClick={() => setChartMode('tiers')}
                className={`px-2.5 py-1 text-[11px] font-medium rounded ${
                  chartMode === 'tiers'
                    ? 'bg-white text-teal-800 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                به تفکیک ۸ ردیف
              </button>
              <button
                type="button"
                onClick={() => setChartMode('monthly')}
                className={`px-2.5 py-1 text-[11px] font-medium rounded ${
                  chartMode === 'monthly'
                    ? 'bg-white text-teal-800 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                به تفکیک ۱۲ ماه
              </button>
            </div>

            {chartMode === 'tiers' && (
              <select
                aria-label="بازه نمایش نمودار ستونی"
                value={chartScope === 'annual' ? 'annual' : String(chartScope)}
                onChange={(e) =>
                  setChartScope(
                    e.target.value === 'annual' ? 'annual' : Number(e.target.value)
                  )
                }
                className="px-2.5 py-1 text-xs border border-slate-200 rounded-md bg-white"
              >
                <option value="annual">مجموع کل سال</option>
                {JALALI_MONTHS.map((m) => (
                  <option key={m.value} value={m.value}>
                    ماه {m.label}
                  </option>
                ))}
              </select>
            )}
          </div>
        }
        bodyClassName="p-5"
      >
        {activeGrandTotal <= 0 && chartMode === 'tiers' ? (
          <div className="py-10 text-center text-xs text-slate-500">
            برای بازه انتخاب‌شده مبلغی ثبت نشده است.
          </div>
        ) : chartMode === 'tiers' ? (
          <div className="space-y-4">
            {/* Vertical Column Bar Chart for the 8 Tiers */}
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3 items-end min-h-[240px] pt-6 pb-2 px-2 bg-slate-50/70 border border-slate-200 rounded-lg">
              {SALARY_TIER_LABELS.map((label, idx) => {
                const value = activeTierValues[idx];
                const heightPct =
                  value > 0
                    ? Math.max(8, Math.round((value / maxTierValue) * 100))
                    : 0;
                const sharePct =
                  activeGrandTotal > 0
                    ? Math.round((value / activeGrandTotal) * 1000) / 10
                    : 0;

                return (
                  <div
                    key={label}
                    className="flex flex-col items-center justify-end h-52 gap-1.5 group"
                  >
                    <div className="text-[10px] font-mono-num tabular-nums font-semibold text-slate-700 text-center">
                      {value > 0 ? formatMoney(value) : '۰'}
                    </div>
                    <div className="w-full max-w-[44px] flex-1 flex items-end justify-center bg-slate-200/50 rounded-t-md overflow-hidden p-0.5">
                      <div
                        className="w-full rounded-t-sm transition-all duration-300"
                        title={`${label}: ${formatMoney(value)} ${settings.currency} (${toPersianDigits(sharePct)}٪)`}
                        style={{
                          height: `${heightPct}%`,
                          backgroundColor: TIER_COLORS[idx],
                        }}
                      />
                    </div>
                    <div className="text-[11px] font-semibold text-slate-800 text-center leading-tight min-h-[30px] flex items-center">
                      {label}
                    </div>
                    <div className="text-[10px] font-mono-num tabular-nums text-slate-500">
                      {toPersianDigits(sharePct)}٪
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* 12-Month Stacked Column Chart */}
            <div className="grid grid-cols-3 sm:grid-cols-6 lg:grid-cols-12 gap-2.5 items-end min-h-[250px] pt-6 pb-2 px-3 bg-slate-50/70 border border-slate-200 rounded-lg">
              {analytics.months.map((m) => {
                const totalHeightPct =
                  m.grandTotal > 0
                    ? Math.max(8, Math.round((m.grandTotal / maxMonthTotal) * 100))
                    : 0;
                return (
                  <div
                    key={m.periodKey}
                    className="flex flex-col items-center justify-end h-52 gap-1.5"
                  >
                    <div className="text-[10px] font-mono-num tabular-nums font-medium text-slate-700 text-center truncate w-full">
                      {m.grandTotal > 0 ? formatMoney(m.grandTotal) : '—'}
                    </div>
                    <div className="w-full max-w-[38px] flex-1 flex items-end justify-center bg-slate-200/50 rounded-t-md overflow-hidden p-0.5">
                      <div
                        className="w-full flex flex-col-reverse rounded-t-sm overflow-hidden transition-all duration-300"
                        style={{ height: `${totalHeightPct}%` }}
                        title={`${m.monthLabel}: ${formatMoney(m.grandTotal)} ${settings.currency}`}
                      >
                        {m.grandTotal > 0 &&
                          m.tierTotals.map((val, tIdx) => {
                            if (val <= 0) return null;
                            const segPct = (val / m.grandTotal) * 100;
                            return (
                              <div
                                key={`${m.periodKey}-${tIdx}`}
                                style={{
                                  height: `${segPct}%`,
                                  backgroundColor: TIER_COLORS[tIdx],
                                }}
                                title={`${SALARY_TIER_LABELS[tIdx]}: ${formatMoney(val)} ${settings.currency}`}
                              />
                            );
                          })}
                      </div>
                    </div>
                    <div
                      className={`text-[11px] font-medium text-center ${
                        m.hasRecordedData ? 'text-teal-900 font-semibold' : 'text-slate-500'
                      }`}
                    >
                      {m.monthLabel}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-700 pt-1">
              {SALARY_TIER_LABELS.map((label, idx) => (
                <span key={label} className="inline-flex items-center gap-1.5">
                  <span
                    className="w-2.5 h-2.5 rounded-xs shrink-0"
                    style={{ backgroundColor: TIER_COLORS[idx] }}
                    aria-hidden="true"
                  />
                  <span>{label}</span>
                </span>
              ))}
            </div>
          </div>
        )}
      </CollapsibleCard>

      {/* 12-Month × 8-Tier Summary Table */}
      <CollapsibleCard
        title={`جدول تفکیک ماهانه و سالانه ۸ ردیف حقوقی — ${toPersianDigits(selectedYear)}`}
        subtitle="ارقام بر اساس پرداختی محاسبه‌شده در هر ماه و سهم هر یک از ۸ ردیف حقوقی کارمندان استخراج شده است."
        defaultOpen={true}
        resizable={true}
        defaultSize="lg"
        headerActions={
          <button
            type="button"
            onClick={handleExportXlsx}
            disabled={analytics.annualGrandTotal <= 0}
            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 disabled:opacity-40 rounded-md transition-colors"
          >
            <BarChart3 className="w-3.5 h-3.5" aria-hidden="true" />
            <span>اکسل جدول</span>
          </button>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full text-right border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-medium text-slate-600">
                <th className="py-2.5 px-3 whitespace-nowrap">ماه</th>
                {SALARY_TIER_LABELS.map((label, idx) => (
                  <th key={label} className="py-2.5 px-2 whitespace-nowrap">
                    <span className="inline-flex items-center gap-1">
                      <span
                        className="w-2 h-2 rounded-xs shrink-0"
                        style={{ backgroundColor: TIER_COLORS[idx] }}
                        aria-hidden="true"
                      />
                      <span>{label}</span>
                    </span>
                  </th>
                ))}
                <th className="py-2.5 px-3 whitespace-nowrap">
                  جمع ماه ({settings.currency})
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {analytics.months.map((row) => (
                <tr
                  key={row.periodKey}
                  className={
                    row.hasRecordedData
                      ? 'bg-teal-50/25 hover:bg-teal-50/45'
                      : 'hover:bg-slate-50/70 text-slate-500'
                  }
                >
                  <td className="py-2.5 px-3 whitespace-nowrap font-semibold text-slate-800">
                    {row.monthLabel}
                    {row.hasRecordedData && (
                      <span className="mr-1.5 text-[10px] font-normal text-teal-700">
                        (ثبت‌شده)
                      </span>
                    )}
                  </td>
                  {row.tierTotals.map((val, idx) => (
                    <td
                      key={`${row.periodKey}-${idx}`}
                      className="py-2.5 px-2 font-mono-num tabular-nums whitespace-nowrap"
                    >
                      {val > 0 ? formatMoney(val) : '۰'}
                    </td>
                  ))}
                  <td className="py-2.5 px-3 font-mono-num tabular-nums font-bold text-teal-800 whitespace-nowrap">
                    {formatMoney(row.grandTotal)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-slate-50 border-t-2 border-slate-200 font-bold text-slate-900">
                <td className="py-3 px-3 whitespace-nowrap">
                  جمع کل سال {toPersianDigits(selectedYear)}
                </td>
                {analytics.annualTierTotals.map((total, idx) => (
                  <td
                    key={`annual-tier-${idx}`}
                    className="py-3 px-2 font-mono-num tabular-nums whitespace-nowrap text-slate-800"
                  >
                    {formatMoney(total)}
                  </td>
                ))}
                <td className="py-3 px-3 font-mono-num tabular-nums text-teal-900 text-sm whitespace-nowrap">
                  {formatMoney(analytics.annualGrandTotal)} {settings.currency}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </CollapsibleCard>
    </div>
  );
};
