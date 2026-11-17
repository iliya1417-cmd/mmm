import React, { useMemo, useState } from 'react';
import { Download, FileSpreadsheet, X } from 'lucide-react';
import type {
  Employee,
  ManualSalaryPayment,
  PayrollReport,
  PayrollSettings,
} from '../types/payroll';
import { formatMoney, formatPeriodLabel, toPersianDigits } from '../utils/payroll';
import {
  THREE_COLUMN_SOURCE_LABELS,
  buildThreeColumnRows,
  downloadRtlThreeColumnXlsx,
  type ThreeColumnExportSource,
} from '../utils/xlsxExport';

interface ExcelThreeColPreviewModalProps {
  report: PayrollReport;
  employees: Employee[];
  manualPayments: ManualSalaryPayment[];
  settings: PayrollSettings;
  onClose: () => void;
}

export const ExcelThreeColPreviewModal: React.FC<
  ExcelThreeColPreviewModalProps
> = ({ report, employees, manualPayments, settings, onClose }) => {
  const [source, setSource] = useState<ThreeColumnExportSource>('net-payroll');
  const [includeHeaderRow, setIncludeHeaderRow] = useState<boolean>(false);
  const [englishDigits, setEnglishDigits] = useState<boolean>(true);
  const [selectedRowIdx, setSelectedRowIdx] = useState<number>(0);

  const rows = useMemo(
    () =>
      buildThreeColumnRows({
        source,
        report,
        employees,
        manualPayments,
        periodKey: report.periodKey,
      }),
    [source, report, employees, manualPayments]
  );

  const totalAmount = useMemo(
    () => rows.reduce((sum, r) => sum + r.amount, 0),
    [rows]
  );

  const displayRows = useMemo(() => {
    const base = rows.map((r) => ({
      code: r.code,
      title: r.title,
      amountText: formatMoney(r.amount, !englishDigits),
      isHeader: false,
    }));
    if (includeHeaderRow) {
      return [
        {
          code: 'کد',
          title: 'نام / شرح',
          amountText: `مبلغ (${settings.currency})`,
          isHeader: true,
        },
        ...base,
      ];
    }
    return base;
  }, [rows, includeHeaderRow, englishDigits, settings.currency]);

  const activeRow = displayRows[selectedRowIdx] ?? displayRows[0];
  const activeRowNumber = selectedRowIdx + 1;

  const handleDownload = () => {
    const suffix =
      source === 'net-payroll'
        ? 'net'
        : source === 'salary-tiers-breakdown'
          ? 'tiers'
          : 'manual';
    downloadRtlThreeColumnXlsx(
      rows,
      `payroll-3col-${suffix}-${report.periodKey}.xlsx`,
      {
        includeHeaderRow,
        sheetName: 'Sheet1',
        headers: ['کد', 'نام / شرح', `مبلغ (${settings.currency})`],
      }
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="excel-3col-title"
    >
      <div className="bg-white border border-slate-200 rounded-lg w-full max-w-4xl max-h-[92vh] flex flex-col shadow-xl overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200 bg-slate-50/70">
          <div className="flex items-center gap-2">
            <FileSpreadsheet
              className="w-5 h-5 text-emerald-700"
              aria-hidden="true"
            />
            <div>
              <h2
                id="excel-3col-title"
                className="text-sm sm:text-base font-semibold text-slate-900"
              >
                خروجی اکسل ۳ ستونه (قالب راست‌به‌چپ Sheet1)
              </h2>
              <p className="text-xs text-slate-500">
                ستون A: کد · ستون B: شرح / نام · ستون C: مبلغ —{' '}
                {formatPeriodLabel(report.periodKey)}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={rows.length === 0}
              onClick={handleDownload}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs sm:text-sm font-medium text-white bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 rounded-md transition-colors whitespace-nowrap shrink-0"
            >
              <Download className="w-4 h-4" aria-hidden="true" />
              <span>دانلود فایل اکسل (.xlsx)</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="بستن پیش‌نمایش اکسل"
              className="p-1.5 text-slate-400 hover:text-slate-700 rounded transition-colors"
            >
              <X className="w-5 h-5" aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Options Strip */}
        <div className="px-5 py-3 border-b border-slate-200 bg-white flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <label
              htmlFor="excel-3col-source"
              className="text-xs font-medium text-slate-700 whitespace-nowrap"
            >
              محتوای خروجی:
            </label>
            <select
              id="excel-3col-source"
              value={source}
              onChange={(e) => {
                setSource(e.target.value as ThreeColumnExportSource);
                setSelectedRowIdx(0);
              }}
              className="px-3 py-1.5 text-xs border border-slate-200 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600/20 focus:border-emerald-700"
            >
              {(
                Object.keys(
                  THREE_COLUMN_SOURCE_LABELS
                ) as ThreeColumnExportSource[]
              ).map((key) => (
                <option key={key} value={key}>
                  {THREE_COLUMN_SOURCE_LABELS[key]}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-wrap items-center gap-4 text-xs text-slate-700">
            <label className="inline-flex items-center gap-1.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={includeHeaderRow}
                onChange={(e) => setIncludeHeaderRow(e.target.checked)}
                className="w-3.5 h-3.5 accent-emerald-700 rounded"
              />
              <span>درج ردیف عنوان ستون‌ها (کد / شرح / مبلغ)</span>
            </label>

            <label className="inline-flex items-center gap-1.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={englishDigits}
                onChange={(e) => setEnglishDigits(e.target.checked)}
                className="w-3.5 h-3.5 accent-emerald-700 rounded"
              />
              <span>نمایش ارقام لاتین در پیش‌نمایش</span>
            </label>
          </div>
        </div>

        {/* Excel-faithful Formula Bar + RTL Sheet1 Grid */}
        <div className="flex-1 overflow-y-auto bg-slate-100 p-4">
          <div className="bg-white border border-slate-300 shadow-xs overflow-hidden">
            {/* Formula bar strip */}
            <div className="flex items-center border-b border-slate-300 bg-slate-50 text-xs">
              <div
                className="w-20 px-2.5 py-1.5 border-l border-slate-300 font-mono text-slate-700 text-center bg-white"
                dir="ltr"
              >
                A{activeRowNumber}
              </div>
              <div className="px-2.5 py-1.5 text-slate-400 italic border-l border-slate-300 select-none">
                fx
              </div>
              <div
                className="flex-1 px-3 py-1.5 font-mono text-slate-800 bg-white truncate"
                dir="ltr"
              >
                {activeRow ? activeRow.code : ''}
              </div>
            </div>

            {displayRows.length === 0 ? (
              <div className="py-14 px-6 text-center text-xs text-slate-500">
                ردیفی برای این حالت خروجی در دوره جاری وجود ندارد.
              </div>
            ) : (
              <div className="overflow-x-auto">
                {/* RTL Table: A (Rightmost) | B (Middle) | C (Leftmost) */}
                <table
                  dir="rtl"
                  className="w-full border-collapse text-[13px]"
                >
                  <thead>
                    <tr className="bg-[#E6E6E6] text-slate-700 text-xs font-medium select-none">
                      <th className="w-12 border border-[#C6C6C6] bg-[#E6E6E6] py-1 text-center font-normal">
                        &nbsp;
                      </th>
                      <th className="w-36 border border-[#C6C6C6] bg-[#D9E8DE] text-emerald-900 py-1 text-center font-semibold">
                        A
                      </th>
                      <th className="border border-[#C6C6C6] py-1 text-center font-normal">
                        B
                      </th>
                      <th className="w-44 border border-[#C6C6C6] py-1 text-center font-normal">
                        C
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayRows.map((row, idx) => {
                      const isActive = idx === selectedRowIdx;
                      return (
                        <tr
                          key={`${row.code}-${idx}`}
                          onClick={() => setSelectedRowIdx(idx)}
                          className="cursor-pointer hover:bg-slate-50/70"
                        >
                          {/* Row Number (far right in RTL Excel) */}
                          <td
                            className={`border border-[#D4D4D4] text-center text-xs font-mono select-none py-1.5 px-2 ${
                              isActive
                                ? 'bg-[#D9E8DE] text-emerald-900 font-semibold'
                                : 'bg-[#F3F3F3] text-slate-600'
                            }`}
                          >
                            {idx + 1}
                          </td>

                          {/* Column A: Code (Right) */}
                          <td
                            dir="ltr"
                            className={`border border-[#D4D4D4] px-2.5 py-1.5 text-left font-mono text-slate-900 whitespace-nowrap ${
                              isActive
                                ? 'outline-2 -outline-offset-2 outline-emerald-700 bg-white'
                                : ''
                            } ${row.isHeader ? 'bg-slate-100 font-semibold text-center' : ''}`}
                          >
                            {row.code}
                          </td>

                          {/* Column B: Description / Name (Middle) */}
                          <td
                            className={`border border-[#D4D4D4] px-3 py-1.5 text-right text-slate-900 ${
                              row.isHeader ? 'bg-slate-100 font-semibold' : ''
                            }`}
                          >
                            {row.title}
                          </td>

                          {/* Column C: Comma-Formatted Numeric Amount (Left) */}
                          <td
                            dir="ltr"
                            className={`border border-[#D4D4D4] px-3 py-1.5 text-right tabular-nums text-slate-900 whitespace-nowrap ${
                              row.isHeader
                                ? 'bg-slate-100 font-semibold text-center'
                                : 'font-mono-num'
                            }`}
                          >
                            {row.amountText}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Excel Bottom Sheet Tab Strip */}
            <div className="bg-[#F3F3F3] border-t border-slate-300 px-3 pt-1.5 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <span className="px-3 py-1 bg-white border border-b-0 border-slate-300 text-emerald-800 font-semibold border-t-2 border-t-emerald-700">
                  Sheet1
                </span>
              </div>
              <div className="pb-1 text-[11px] text-slate-600 font-mono-num tabular-nums">
                تعداد ردیف: {toPersianDigits(rows.length)} · جمع کل:{' '}
                {formatMoney(totalAmount)} {settings.currency}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
