import React, { useRef, useState } from 'react';
import {
  BarChart3,
  Download,
  FileSpreadsheet,
  FileText,
  Lock,
  SlidersHorizontal,
  Upload,
} from 'lucide-react';
import type {
  AppState,
  ComputedPayslip,
  ParametricReportTemplate,
  PayrollReport,
  PayrollSettings,
} from '../types/payroll';
import {
  SALARY_CALCULATION_MODE_SHORT_LABELS,
  formatMoney,
  formatPeriodLabel,
  generatePayrollCsv,
  getEffectiveSalaryMode,
  getEmploymentTypeLabel,
  toPersianDigits,
} from '../utils/payroll';
import { exportAppStateToJson, parseAppStateFromJson } from '../utils/storage';
import { CollapsibleCard } from './CollapsibleCard';
import { ExcelThreeColPreviewModal } from './ExcelThreeColPreviewModal';
import { ParametricReportBuilder } from './ParametricReportBuilder';
import { PayslipModal } from './PayslipModal';
import { TierAnalyticsPanel } from './TierAnalyticsPanel';

interface ReportsPageProps {
  report: PayrollReport;
  settings: PayrollSettings;
  appState: AppState;
  isAdmin: boolean;
  canViewReports: boolean;
  canManageBackup: boolean;
  canManageSettings: boolean;
  onImportState: (state: AppState) => void;
  onSaveParametricTemplate: (template: ParametricReportTemplate) => void;
  onDeleteParametricTemplate: (templateId: string) => void;
}

export const ReportsPage: React.FC<ReportsPageProps> = ({
  report,
  settings,
  appState,
  isAdmin,
  canViewReports,
  canManageBackup,
  canManageSettings,
  onImportState,
  onSaveParametricTemplate,
  onDeleteParametricTemplate,
}) => {
  const [activeTab, setActiveTab] = useState<
    'summary' | 'tier-analytics' | 'parametric'
  >('summary');
  const [selectedPayslip, setSelectedPayslip] = useState<ComputedPayslip | null>(
    null
  );
  const [showThreeColExcelModal, setShowThreeColExcelModal] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDownloadCsv = () => {
    const csvContent = generatePayrollCsv(report, settings);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `payroll-${report.periodKey}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleDownloadBackup = () => {
    if (!canManageBackup) return;
    const json = exportAppStateToJson(appState);
    const blob = new Blob([json], { type: 'application/json;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `payroll-backup-${report.periodKey}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!canManageBackup) return;
    const file = e.target.files?.[0];
    if (!file) return;
    setImportError(null);
    setImportSuccess(false);

    const reader = new FileReader();
    reader.onload = () => {
      const result = parseAppStateFromJson(String(reader.result));
      if (!result.state) {
        setImportError(result.error ?? 'ساختار فایل پشتیبان معتبر نیست.');
        return;
      }
      onImportState(result.state);
      setImportSuccess(true);
      window.setTimeout(() => setImportSuccess(false), 2500);
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  if (!canViewReports) {
    return (
      <div className="bg-white border border-slate-200 rounded-lg p-10 text-center space-y-2">
        <div className="w-10 h-10 rounded-full bg-amber-50 border border-amber-200 text-amber-700 flex items-center justify-center mx-auto">
          <Lock className="w-5 h-5" aria-hidden="true" />
        </div>
        <h2 className="text-sm font-bold text-slate-900">
          عدم دسترسی به بخش گزارش‌دهی
        </h2>
        <p className="text-xs text-slate-600 max-w-md mx-auto leading-5">
          دسترسی مشاهده و دریافت گزارش‌ها برای این حساب کاربری توسط مدیر سیستم فعال نشده است. در صورت نیاز از مدیر سیستم درخواست فعال‌سازی مجوز «مشاهده و خروجی گزارش‌ها» را بنمایید.
        </p>
      </div>
    );
  }

  const maxDeptCost = report.departmentBreakdown.reduce(
    (max, d) => Math.max(max, d.totalCost),
    1
  );

  return (
    <div className="space-y-6">
      {/* Sub-navigation Tabs */}
      <div className="bg-white border border-slate-200 rounded-lg p-1.5 inline-flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => setActiveTab('summary')}
          aria-pressed={activeTab === 'summary'}
          className={`inline-flex items-center gap-2 px-4 py-2 text-xs sm:text-sm font-semibold rounded-md transition-colors ${
            activeTab === 'summary'
              ? 'bg-teal-700 text-white'
              : 'text-slate-700 hover:bg-slate-100'
          }`}
        >
          <FileText className="w-4 h-4" aria-hidden="true" />
          <span>گزارش جامع دوره</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('tier-analytics')}
          aria-pressed={activeTab === 'tier-analytics'}
          className={`inline-flex items-center gap-2 px-4 py-2 text-xs sm:text-sm font-semibold rounded-md transition-colors ${
            activeTab === 'tier-analytics'
              ? 'bg-teal-700 text-white'
              : 'text-slate-700 hover:bg-slate-100'
          }`}
        >
          <BarChart3 className="w-4 h-4" aria-hidden="true" />
          <span>تحلیل ۸ ردیف حقوقی (ماهانه/سالانه)</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('parametric')}
          aria-pressed={activeTab === 'parametric'}
          className={`inline-flex items-center gap-2 px-4 py-2 text-xs sm:text-sm font-semibold rounded-md transition-colors ${
            activeTab === 'parametric'
              ? 'bg-emerald-700 text-white'
              : 'text-slate-700 hover:bg-slate-100'
          }`}
        >
          <SlidersHorizontal className="w-4 h-4" aria-hidden="true" />
          <span>گزارش پارامتریک (اکسل چپ‌چین)</span>
        </button>
      </div>

      {activeTab === 'tier-analytics' ? (
        <TierAnalyticsPanel
          appState={appState}
          activePeriodKey={report.periodKey}
          settings={settings}
        />
      ) : activeTab === 'parametric' ? (
        <ParametricReportBuilder
          appState={appState}
          periodKey={report.periodKey}
          settings={settings}
          isAdmin={isAdmin || canManageSettings}
          savedTemplates={appState.parametricTemplates ?? []}
          onSaveTemplate={onSaveParametricTemplate}
          onDeleteTemplate={onDeleteParametricTemplate}
        />
      ) : (
        <>
          {/* Executive 4-KPI Summary Strip */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white border border-slate-200 rounded-lg px-5 py-4">
              <p className="text-xs text-slate-500 font-medium">
                جمع ناخالص حقوق و مزایا
              </p>
              <p className="mt-1.5 text-2xl font-semibold text-slate-900 font-mono-num tabular-nums">
                {formatMoney(report.totals.grossTotal)}
              </p>
              <p className="mt-1 text-xs text-slate-400">
                {settings.currency} · {toPersianDigits(report.totals.employeeCount)}{' '}
                نفر
              </p>
            </div>

            <div className="bg-white border border-slate-200 rounded-lg px-5 py-4">
              <p className="text-xs text-slate-500 font-medium">
                جمع کسورات (بیمه، مالیات، وام)
              </p>
              <p className="mt-1.5 text-2xl font-semibold text-rose-700 font-mono-num tabular-nums">
                {formatMoney(report.totals.totalDeductions)}
              </p>
              <p className="mt-1 text-xs text-slate-400 font-mono-num tabular-nums">
                مالیات: {formatMoney(report.totals.taxTotal)} · بیمه کارگر:{' '}
                {formatMoney(report.totals.employeeInsuranceTotal)}
              </p>
            </div>

            <div className="bg-white border border-slate-200 rounded-lg px-5 py-4">
              <p className="text-xs text-slate-500 font-medium">
                جمع خالص پرداختی به پرسنل
              </p>
              <p className="mt-1.5 text-2xl font-semibold text-teal-800 font-mono-num tabular-nums">
                {formatMoney(report.totals.netPayableTotal)}
              </p>
              <p className="mt-1 text-xs text-slate-400">
                خالص واریزی به حساب پرسنل ({settings.currency})
              </p>
            </div>

            <div className="bg-white border border-slate-200 rounded-lg px-5 py-4">
              <p className="text-xs text-slate-500 font-medium">
                بهای تمام‌شده کل کارفرما
              </p>
              <p className="mt-1.5 text-2xl font-semibold text-slate-900 font-mono-num tabular-nums">
                {formatMoney(report.totals.totalEmployerCost)}
              </p>
              <p className="mt-1 text-xs text-slate-400 font-mono-num tabular-nums">
                شامل بیمه کارفرما (
                {toPersianDigits(settings.employerInsuranceRate)}٪):{' '}
                {formatMoney(report.totals.employerInsuranceTotal)}
              </p>
            </div>
          </div>

          {/* Report Export & Backup Toolbar */}
          <div className="bg-white border border-slate-200 rounded-lg p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">
                لیست جامع حقوق و دستمزد — {formatPeriodLabel(report.periodKey)}
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                برای مشاهده جزئیات کامل یا چاپ فیش حقوقی هر کارمند، روی دکمه «فیش» کلیک کنید.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setActiveTab('tier-analytics')}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-teal-900 bg-teal-50 border border-teal-200 hover:bg-teal-100 rounded-md transition-colors whitespace-nowrap shrink-0"
              >
                <BarChart3 className="w-3.5 h-3.5" aria-hidden="true" />
                <span>تحلیل ۸ ردیف</span>
              </button>

              <button
                type="button"
                onClick={() => setShowThreeColExcelModal(true)}
                disabled={report.payslips.length === 0}
                className="inline-flex items-center gap-2 px-3.5 py-2 text-xs sm:text-sm font-medium text-white bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 rounded-md transition-colors whitespace-nowrap shrink-0"
              >
                <FileSpreadsheet className="w-4 h-4" aria-hidden="true" />
                <span>خروجی اکسل ۳ ستونه (.xlsx)</span>
              </button>

              <button
                type="button"
                onClick={handleDownloadCsv}
                disabled={report.payslips.length === 0}
                className="inline-flex items-center gap-2 px-3 py-2 text-xs font-medium text-teal-800 bg-teal-50 border border-teal-200 hover:bg-teal-100 disabled:opacity-50 rounded-md transition-colors whitespace-nowrap shrink-0"
              >
                <FileSpreadsheet className="w-4 h-4" aria-hidden="true" />
                <span>اکسل جامع (CSV)</span>
              </button>

              <button
                type="button"
                disabled={!canManageBackup}
                onClick={handleDownloadBackup}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed rounded-md transition-colors whitespace-nowrap shrink-0"
              >
                <Download className="w-3.5 h-3.5" aria-hidden="true" />
                <span>پشتیبان JSON</span>
              </button>

              <input
                ref={fileInputRef}
                type="file"
                accept="application/json,.json"
                onChange={handleFileChange}
                className="hidden"
              />
              <button
                type="button"
                disabled={!canManageBackup}
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed rounded-md transition-colors whitespace-nowrap shrink-0"
              >
                <Upload className="w-3.5 h-3.5" aria-hidden="true" />
                <span>بازیابی پشتیبان</span>
              </button>
            </div>
          </div>

          {importError && (
            <div className="bg-rose-50 border border-rose-200 text-rose-800 text-xs px-4 py-3 rounded-md">
              {importError}
            </div>
          )}
          {importSuccess && (
            <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs px-4 py-3 rounded-md">
              فایل پشتیبان با موفقیت بازیابی و جایگزین شد.
            </div>
          )}

          {/* Collapsible & Resizable Comprehensive Ledger Table */}
          <CollapsibleCard
            title={`جدول جامع لیست حقوق و کسورات — ${formatPeriodLabel(report.periodKey)}`}
            subtitle={`شامل ${toPersianDigits(report.payslips.length)} فیش محاسبه‌شده`}
            defaultOpen={true}
            resizable={true}
            defaultSize="lg"
          >
            {report.payslips.length === 0 ? (
              <div className="py-12 px-6 text-center">
                <p className="text-sm font-medium text-slate-700">
                  داده‌ای برای گزارش‌گیری در این دوره وجود ندارد.
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  ابتدا کارمندان فعال را در صفحه اول ثبت و کارکرد آن‌ها را در صفحه دوم وارد کنید.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-right border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-medium text-slate-500">
                      <th className="py-2.5 px-2.5 whitespace-nowrap">کارمند</th>
                      <th className="py-2.5 px-2 whitespace-nowrap">کارکرد / روزانه</th>
                      <th className="py-2.5 px-2 whitespace-nowrap">حقوق پایه</th>
                      <th className="py-2.5 px-2 whitespace-nowrap">مزایا و سنوات</th>
                      <th className="py-2.5 px-2 whitespace-nowrap">جمع ناخالص</th>
                      <th className="py-2.5 px-2 whitespace-nowrap">بیمه کارگر</th>
                      <th className="py-2.5 px-2 whitespace-nowrap">مالیات</th>
                      <th className="py-2.5 px-2 whitespace-nowrap">قسط وام</th>
                      <th className="py-2.5 px-2 whitespace-nowrap">سایر کسور</th>
                      <th className="py-2.5 px-2 whitespace-nowrap">خالص پرداختی</th>
                      <th className="py-2.5 px-2 whitespace-nowrap">بیمه کارفرما</th>
                      <th className="py-2.5 px-2.5 whitespace-nowrap text-left">فیش</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 text-xs">
                    {report.payslips.map((slip) => {
                      const allowancesAndShifts =
                        slip.grossSalary - slip.baseSalaryEarned;
                      const miscDeductions =
                        slip.advancePayment + slip.otherDeductions;
                      const salaryMode = getEffectiveSalaryMode(slip.employee);

                      return (
                        <tr
                          key={slip.employee.id}
                          className="hover:bg-slate-50/70 transition-colors"
                        >
                          <td className="py-2.5 px-2.5 whitespace-nowrap">
                            <div className="font-medium text-slate-900 text-xs sm:text-sm">
                              {slip.employee.fullName}
                            </div>
                            <div className="text-[11px] text-slate-400">
                              {toPersianDigits(slip.employee.personnelCode)} ·{' '}
                              {getEmploymentTypeLabel(
                                slip.employee.employmentType,
                                slip.employee.customContractTitle
                              )}{' '}
                              · {SALARY_CALCULATION_MODE_SHORT_LABELS[salaryMode]}
                            </div>
                            {(slip.isManualOverride ||
                              slip.manualAdditionalPay > 0) && (
                              <div className="text-[10px] font-medium text-teal-700 mt-0.5">
                                {slip.isManualOverride
                                  ? 'حقوق دستی توافقی'
                                  : `+ ${formatMoney(slip.manualAdditionalPay)} حقوق دستی`}
                              </div>
                            )}
                          </td>
                          <td className="py-2.5 px-2 font-mono-num tabular-nums text-slate-600 whitespace-nowrap">
                            <div>{toPersianDigits(slip.effectiveDays)} روز</div>
                            {slip.dailyWage > 0 && (
                              <div className="text-[10px] text-teal-700">
                                روزانه: {formatMoney(slip.dailyWage)}
                              </div>
                            )}
                          </td>
                          <td className="py-2.5 px-2 font-mono-num tabular-nums text-slate-700 whitespace-nowrap">
                            {formatMoney(slip.baseSalaryEarned)}
                          </td>
                          <td className="py-2.5 px-2 font-mono-num tabular-nums text-slate-700 whitespace-nowrap">
                            {formatMoney(allowancesAndShifts)}
                          </td>
                          <td className="py-2.5 px-2 font-mono-num tabular-nums font-medium text-slate-900 whitespace-nowrap">
                            {formatMoney(slip.grossSalary)}
                          </td>
                          <td className="py-2.5 px-2 font-mono-num tabular-nums text-rose-700 whitespace-nowrap">
                            {formatMoney(slip.employeeInsurance)}
                          </td>
                          <td className="py-2.5 px-2 font-mono-num tabular-nums text-rose-700 whitespace-nowrap">
                            {formatMoney(slip.incomeTax)}
                          </td>
                          <td className="py-2.5 px-2 font-mono-num tabular-nums text-amber-700 whitespace-nowrap">
                            {formatMoney(slip.loanDeduction)}
                          </td>
                          <td className="py-2.5 px-2 font-mono-num tabular-nums text-slate-600 whitespace-nowrap">
                            {formatMoney(miscDeductions)}
                          </td>
                          <td className="py-2.5 px-2 font-mono-num tabular-nums font-semibold text-teal-800 text-sm whitespace-nowrap">
                            {formatMoney(slip.netPayable)}
                          </td>
                          <td className="py-2.5 px-2 font-mono-num tabular-nums text-slate-500 whitespace-nowrap">
                            {formatMoney(slip.employerInsurance)}
                          </td>
                          <td className="py-2.5 px-2.5 whitespace-nowrap text-left">
                            <button
                              type="button"
                              onClick={() => setSelectedPayslip(slip)}
                              aria-label={`مشاهده فیش حقوقی ${slip.employee.fullName}`}
                              className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-teal-800 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded transition-colors whitespace-nowrap shrink-0"
                            >
                              <FileText className="w-3.5 h-3.5" aria-hidden="true" />
                              <span>فیش</span>
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="bg-slate-50 border-t-2 border-slate-200 text-xs font-semibold text-slate-900">
                      <td className="py-3 px-2.5 whitespace-nowrap" colSpan={4}>
                        جمع کل ({toPersianDigits(report.totals.employeeCount)} کارمند)
                      </td>
                      <td className="py-3 px-2 font-mono-num tabular-nums whitespace-nowrap">
                        {formatMoney(report.totals.grossTotal)}
                      </td>
                      <td className="py-3 px-2 font-mono-num tabular-nums text-rose-700 whitespace-nowrap">
                        {formatMoney(report.totals.employeeInsuranceTotal)}
                      </td>
                      <td className="py-3 px-2 font-mono-num tabular-nums text-rose-700 whitespace-nowrap">
                        {formatMoney(report.totals.taxTotal)}
                      </td>
                      <td className="py-3 px-2 font-mono-num tabular-nums text-amber-700 whitespace-nowrap">
                        {formatMoney(report.totals.loanDeductionTotal)}
                      </td>
                      <td className="py-3 px-2 font-mono-num tabular-nums text-slate-700 whitespace-nowrap">
                        {formatMoney(report.totals.advanceAndOtherDeductionsTotal)}
                      </td>
                      <td className="py-3 px-2 font-mono-num tabular-nums text-teal-800 text-sm whitespace-nowrap">
                        {formatMoney(report.totals.netPayableTotal)}
                      </td>
                      <td className="py-3 px-2 font-mono-num tabular-nums text-slate-600 whitespace-nowrap">
                        {formatMoney(report.totals.employerInsuranceTotal)}
                      </td>
                      <td className="py-3 px-2.5" />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </CollapsibleCard>

          {/* Department Cost Breakdown & Legal Obligations */}
          {report.departmentBreakdown.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <CollapsibleCard
                title="توزیع هزینه حقوق و دستمزد بر اساس دپارتمان"
                defaultOpen={true}
                resizable={true}
                defaultSize="auto"
                bodyClassName="p-5 space-y-3.5"
              >
                {report.departmentBreakdown.map((dept) => {
                  const widthPercent = Math.max(
                    4,
                    Math.round((dept.totalCost / maxDeptCost) * 100)
                  );
                  return (
                    <div key={dept.department} className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium text-slate-800">
                          {dept.department}{' '}
                          <span className="text-slate-400 font-normal">
                            ({toPersianDigits(dept.employeeCount)} نفر)
                          </span>
                        </span>
                        <span className="font-mono-num tabular-nums font-semibold text-slate-900">
                          {formatMoney(dept.totalCost)} {settings.currency}
                        </span>
                      </div>
                      <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-teal-600 rounded-full transition-all duration-300"
                          style={{ width: `${widthPercent}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </CollapsibleCard>

              <CollapsibleCard
                title="خلاصه تعهدات قانونی و پرداختی‌های دوره"
                defaultOpen={true}
                resizable={true}
                defaultSize="auto"
                bodyClassName="p-5"
              >
                <div className="divide-y divide-slate-100 text-sm">
                  <div className="py-2.5 flex items-center justify-between">
                    <span className="text-slate-600">
                      حق بیمه کل سازمان تامین اجتماعی (
                      {toPersianDigits(
                        settings.employeeInsuranceRate +
                          settings.employerInsuranceRate
                      )}
                      ٪)
                    </span>
                    <span className="font-mono-num tabular-nums font-semibold text-slate-900">
                      {formatMoney(
                        report.totals.employeeInsuranceTotal +
                          report.totals.employerInsuranceTotal
                      )}{' '}
                      {settings.currency}
                    </span>
                  </div>
                  <div className="py-2.5 flex items-center justify-between">
                    <span className="text-slate-600">
                      مالیات حقوق قابل واریز به دارایی
                    </span>
                    <span className="font-mono-num tabular-nums font-semibold text-slate-900">
                      {formatMoney(report.totals.taxTotal)} {settings.currency}
                    </span>
                  </div>
                  <div className="py-2.5 flex items-center justify-between">
                    <span className="text-slate-600">اقساط وام کسرشده از پرسنل</span>
                    <span className="font-mono-num tabular-nums font-semibold text-slate-900">
                      {formatMoney(report.totals.loanDeductionTotal)}{' '}
                      {settings.currency}
                    </span>
                  </div>
                  <div className="py-2.5 flex items-center justify-between">
                    <span className="text-slate-600">خالص حقوق پرداختی به پرسنل</span>
                    <span className="font-mono-num tabular-nums font-bold text-teal-800">
                      {formatMoney(report.totals.netPayableTotal)}{' '}
                      {settings.currency}
                    </span>
                  </div>
                </div>
              </CollapsibleCard>
            </div>
          )}

          {selectedPayslip && (
            <PayslipModal
              payslip={selectedPayslip}
              settings={settings}
              onClose={() => setSelectedPayslip(null)}
            />
          )}

          {showThreeColExcelModal && (
            <ExcelThreeColPreviewModal
              report={report}
              employees={appState.employees}
              manualPayments={appState.manualPayments ?? []}
              settings={settings}
              onClose={() => setShowThreeColExcelModal(false)}
            />
          )}
        </>
      )}
    </div>
  );
};
