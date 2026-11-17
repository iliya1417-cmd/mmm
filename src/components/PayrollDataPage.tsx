import React, { useMemo, useState } from 'react';
import { CalendarCheck, Check, SlidersHorizontal, X } from 'lucide-react';
import type {
  Employee,
  Loan,
  ManualSalaryPayment,
  MonthlyTimesheet,
  PayrollSettings,
} from '../types/payroll';
import {
  calculateEmployeePayslip,
  calculateSoroushWorkDerivation,
  createEmptyTimesheet,
  formatMoney,
  formatPeriodLabel,
  getEmploymentTypeLabel,
  getMonthFromPeriodKey,
  getPeriodDays,
  parseNumericInput,
  toPersianDigits,
} from '../utils/payroll';
import { ManualSalaryPanel } from './ManualSalaryPanel';

export type PayrollDataTab = 'timesheet' | 'manual-salary';

interface PayrollDataPageProps {
  employees: Employee[];
  timesheets: MonthlyTimesheet[];
  loans: Loan[];
  manualPayments: ManualSalaryPayment[];
  settings: PayrollSettings;
  periodKey: string;
  isAdmin: boolean;
  requestedTab?: PayrollDataTab | null;
  onUpsertTimesheet: (timesheet: MonthlyTimesheet) => void;
  onFillStandardMonth: () => void;
  onAddManualPayment: (
    payment: Omit<ManualSalaryPayment, 'id' | 'createdAt'>
  ) => void;
  onDeleteManualPayment: (id: string) => void;
}

export const PayrollDataPage: React.FC<PayrollDataPageProps> = ({
  employees,
  timesheets,
  loans,
  manualPayments,
  settings,
  periodKey,
  isAdmin,
  requestedTab,
  onUpsertTimesheet,
  onFillStandardMonth,
  onAddManualPayment,
  onDeleteManualPayment,
}) => {
  const [activeTab, setActiveTab] = useState<PayrollDataTab>(
    requestedTab ?? 'timesheet'
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [detailEmployeeId, setDetailEmployeeId] = useState<string | null>(null);
  const [filledToast, setFilledToast] = useState(false);

  React.useEffect(() => {
    if (requestedTab) {
      setActiveTab(requestedTab);
    }
  }, [requestedTab]);

  const periodDays = getPeriodDays(getMonthFromPeriodKey(periodKey));
  const activeEmployees = useMemo(
    () => employees.filter((e) => e.isActive),
    [employees]
  );

  const timesheetMap = useMemo(() => {
    const map = new Map<string, MonthlyTimesheet>();
    for (const ts of timesheets) {
      if (ts.periodKey === periodKey) {
        map.set(ts.employeeId, ts);
      }
    }
    return map;
  }, [timesheets, periodKey]);

  const filteredEmployees = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return activeEmployees;
    return activeEmployees.filter(
      (emp) =>
        emp.fullName.toLowerCase().includes(q) ||
        emp.personnelCode.toLowerCase().includes(q) ||
        emp.department.toLowerCase().includes(q)
    );
  }, [activeEmployees, searchQuery]);

  const getTimesheetFor = (employeeId: string): MonthlyTimesheet => {
    return (
      timesheetMap.get(employeeId) ?? createEmptyTimesheet(employeeId, periodKey)
    );
  };

  const updateField = <K extends keyof MonthlyTimesheet>(
    employeeId: string,
    field: K,
    value: MonthlyTimesheet[K]
  ) => {
    if (!isAdmin) return;
    const current = getTimesheetFor(employeeId);
    onUpsertTimesheet({
      ...current,
      [field]: value,
    });
  };

  const updateSoroushEnteredSalary = (emp: Employee, rawValue: string) => {
    if (!isAdmin) return;
    const entered = parseNumericInput(rawValue);
    const current = getTimesheetFor(emp.id);
    const derivation = calculateSoroushWorkDerivation(
      emp.baseMonthlySalary,
      entered,
      periodDays
    );
    onUpsertTimesheet({
      ...current,
      enteredSalary: entered,
      workingDays: derivation.usedEnteredSalary
        ? derivation.derivedWorkingDays
        : periodDays,
    });
  };

  const handleFillMonth = () => {
    onFillStandardMonth();
    setFilledToast(true);
    window.setTimeout(() => setFilledToast(false), 2000);
  };

  const detailEmployee = activeEmployees.find((e) => e.id === detailEmployeeId) ?? null;
  const detailTimesheet = detailEmployee ? getTimesheetFor(detailEmployee.id) : null;
  const detailPayslip = detailEmployee
    ? calculateEmployeePayslip(
        detailEmployee,
        detailTimesheet ?? undefined,
        loans,
        settings,
        periodKey,
        manualPayments
      )
    : null;

  const periodManualCount = manualPayments.filter(
    (p) => p.periodKey === periodKey
  ).length;

  return (
    <div className="space-y-5">
      {/* Sub-Section Tab Switcher */}
      <div
        className="inline-flex items-center gap-1 p-1 bg-white border border-slate-200 rounded-lg"
        role="tablist"
        aria-label="بخش‌های اطلاعات حقوق"
      >
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'timesheet'}
          onClick={() => setActiveTab('timesheet')}
          className={`px-4 py-2 text-xs sm:text-sm font-medium rounded-md transition-colors whitespace-nowrap ${
            activeTab === 'timesheet'
              ? 'bg-teal-700 text-white'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
          }`}
        >
          کارکرد و متغیرهای ماهانه
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'manual-salary'}
          onClick={() => setActiveTab('manual-salary')}
          className={`px-4 py-2 text-xs sm:text-sm font-medium rounded-md transition-colors whitespace-nowrap ${
            activeTab === 'manual-salary'
              ? 'bg-teal-700 text-white'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
          }`}
        >
          پرداخت حقوق دستی
          {periodManualCount > 0 && (
            <span
              className={`mr-1.5 px-1.5 py-0.5 text-[11px] rounded font-mono-num tabular-nums ${
                activeTab === 'manual-salary'
                  ? 'bg-teal-800 text-teal-100'
                  : 'bg-teal-50 text-teal-800'
              }`}
            >
              {toPersianDigits(periodManualCount)}
            </span>
          )}
        </button>
      </div>

      {activeTab === 'manual-salary' ? (
        <ManualSalaryPanel
          employees={employees}
          manualPayments={manualPayments}
          currency={settings.currency}
          periodKey={periodKey}
          isAdmin={isAdmin}
          onAddManualPayment={onAddManualPayment}
          onDeleteManualPayment={onDeleteManualPayment}
        />
      ) : (
        <>
          {/* Toolbar */}
          <div className="bg-white border border-slate-200 rounded-lg p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">
              ورود کارکرد و متغیرهای ماهانه — {formatPeriodLabel(periodKey)}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              سقف روزهای استاندارد این ماه{' '}
              <span className="font-mono-num tabular-nums font-medium text-slate-700">
                {toPersianDigits(periodDays)} روز
              </span>{' '}
              است · تغییرات بلافاصله در محاسبه حقوق و گزارش‌ها اعمال می‌شوند.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="payroll-data-search" className="sr-only">
            فیلتر پرسنل در جدول کارکرد
          </label>
          <input
            id="payroll-data-search"
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="جستجوی نام یا کد..."
            className="px-3 py-2 text-sm border border-slate-200 rounded-md bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600 w-48"
          />

          <button
            type="button"
            onClick={handleFillMonth}
            disabled={!isAdmin}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-teal-800 bg-teal-50 border border-teal-200 hover:bg-teal-100 disabled:opacity-50 disabled:cursor-not-allowed rounded-md transition-colors whitespace-nowrap shrink-0"
          >
            {filledToast ? (
              <Check className="w-4 h-4" aria-hidden="true" />
            ) : (
              <CalendarCheck className="w-4 h-4" aria-hidden="true" />
            )}
            <span>
              {filledToast
                ? 'کارکرد استاندارد ثبت شد'
                : `ثبت کارکرد استاندارد (${toPersianDigits(periodDays)} روز)`}
            </span>
          </button>
        </div>
      </div>

      {/* Spreadsheet Input Table */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        {filteredEmployees.length === 0 ? (
          <div className="py-12 px-6 text-center">
            <p className="text-sm font-medium text-slate-700">
              کارمند فعالی برای ثبت کارکرد وجود ندارد.
            </p>
            <p className="mt-1 text-xs text-slate-500">
              در صفحه «مشخصات کارمندان» پرسنل جدید اضافه یا وضعیت آن‌ها را فعال کنید.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-medium text-slate-600">
                  <th className="py-2.5 px-2.5 whitespace-nowrap">کارمند</th>
                  <th className="py-2.5 px-1.5 whitespace-nowrap">
                    حقوق سروش / روش ورود
                  </th>
                  <th className="py-2.5 px-1.5 whitespace-nowrap">کارکرد (روز)</th>
                  <th className="py-2.5 px-1.5 whitespace-nowrap">غیبت (روز)</th>
                  <th className="py-2.5 px-1.5 whitespace-nowrap">اضافه‌کاری</th>
                  <th className="py-2.5 px-1.5 whitespace-nowrap">تعطیل‌کاری</th>
                  <th className="py-2.5 px-1.5 whitespace-nowrap">شب‌کاری</th>
                  <th className="py-2.5 px-1.5 whitespace-nowrap">پاداش ({settings.currency})</th>
                  <th className="py-2.5 px-1.5 whitespace-nowrap">مساعده ({settings.currency})</th>
                  <th className="py-2.5 px-2 whitespace-nowrap">خالص تخمینی</th>
                  <th className="py-2.5 px-2.5 whitespace-nowrap text-left">جزئیات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-sm">
                {filteredEmployees.map((emp) => {
                  const ts = getTimesheetFor(emp.id);
                  const isSoroush = emp.employmentType === 'sherkati-soroush';
                  const soroushInfo = calculateSoroushWorkDerivation(
                    emp.baseMonthlySalary,
                    ts.enteredSalary ?? 0,
                    periodDays
                  );
                  const slip = calculateEmployeePayslip(
                    emp,
                    ts,
                    loans,
                    settings,
                    periodKey,
                    manualPayments
                  );

                  return (
                    <tr key={emp.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-2.5 px-2.5 whitespace-nowrap">
                        <div className="font-medium text-slate-900 text-xs sm:text-sm">{emp.fullName}</div>
                        <div className="text-[11px] text-slate-500 font-mono-num tabular-nums">
                          {toPersianDigits(emp.personnelCode)} ·{' '}
                          {getEmploymentTypeLabel(emp.employmentType)}
                        </div>
                      </td>

                      <td className="py-2 px-1.5 whitespace-nowrap">
                        {isSoroush ? (
                          <div className="w-36 space-y-1">
                            <input
                              type="text"
                              inputMode="numeric"
                              dir="ltr"
                              disabled={!isAdmin}
                              aria-label={`حقوق واردشده شرکتی سروش ${emp.fullName}`}
                              value={ts.enteredSalary && ts.enteredSalary > 0 ? String(ts.enteredSalary) : ''}
                              onChange={(e) =>
                                updateSoroushEnteredSalary(emp, e.target.value)
                              }
                              placeholder="مبلغ حقوق..."
                              className="w-full px-2 py-1 text-xs border border-teal-300 rounded bg-teal-50/40 disabled:bg-slate-50 disabled:text-slate-500 font-mono-num tabular-nums text-left focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
                            />
                            <div className="text-[10px] text-teal-800 font-mono-num tabular-nums">
                              روزانه: {formatMoney(soroushInfo.dailyWage)}
                              {soroushInfo.usedEnteredSalary && (
                                <> · {toPersianDigits(soroushInfo.derivedWorkingDays)} روز</>
                              )}
                            </div>
                          </div>
                        ) : (
                          <span className="text-[11px] text-slate-400">
                            ثبت مستقیم عددی
                          </span>
                        )}
                      </td>

                      <td className="py-2 px-1.5">
                        <input
                          type="number"
                          min={0}
                          max={isSoroush && soroushInfo.usedEnteredSalary ? 99 : periodDays}
                          step={isSoroush ? '0.01' : '1'}
                          disabled={!isAdmin || (isSoroush && soroushInfo.usedEnteredSalary)}
                          aria-label={`روز کارکرد ${emp.fullName}`}
                          value={
                            isSoroush && soroushInfo.usedEnteredSalary
                              ? soroushInfo.derivedWorkingDays
                              : ts.workingDays
                          }
                          onChange={(e) =>
                            updateField(
                              emp.id,
                              'workingDays',
                              Math.max(0, Math.min(periodDays, Number(e.target.value) || 0))
                            )
                          }
                          className="w-16 px-2 py-1.5 text-xs sm:text-sm border border-slate-200 rounded bg-white disabled:bg-slate-50 disabled:text-slate-500 font-mono-num tabular-nums focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
                        />
                      </td>

                      <td className="py-2 px-1.5">
                        <input
                          type="number"
                          min={0}
                          max={periodDays}
                          disabled={!isAdmin}
                          aria-label={`روز غیبت ${emp.fullName}`}
                          value={ts.absentDays}
                          onChange={(e) =>
                            updateField(
                              emp.id,
                              'absentDays',
                              Math.max(0, Math.min(periodDays, Number(e.target.value) || 0))
                            )
                          }
                          className="w-14 px-2 py-1.5 text-xs sm:text-sm border border-slate-200 rounded bg-white disabled:bg-slate-50 disabled:text-slate-500 font-mono-num tabular-nums focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
                        />
                      </td>

                      <td className="py-2 px-1.5">
                        <input
                          type="number"
                          min={0}
                          step={0.5}
                          disabled={!isAdmin}
                          aria-label={`ساعت اضافه‌کاری ${emp.fullName}`}
                          value={ts.overtimeHours}
                          onChange={(e) =>
                            updateField(
                              emp.id,
                              'overtimeHours',
                              Math.max(0, Number(e.target.value) || 0)
                            )
                          }
                          className="w-16 px-2 py-1.5 text-xs sm:text-sm border border-slate-200 rounded bg-white disabled:bg-slate-50 disabled:text-slate-500 font-mono-num tabular-nums focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
                        />
                      </td>

                      <td className="py-2 px-1.5">
                        <input
                          type="number"
                          min={0}
                          step={0.5}
                          disabled={!isAdmin}
                          aria-label={`ساعت تعطیل‌کاری ${emp.fullName}`}
                          value={ts.holidayHours}
                          onChange={(e) =>
                            updateField(
                              emp.id,
                              'holidayHours',
                              Math.max(0, Number(e.target.value) || 0)
                            )
                          }
                          className="w-16 px-2 py-1.5 text-xs sm:text-sm border border-slate-200 rounded bg-white disabled:bg-slate-50 disabled:text-slate-500 font-mono-num tabular-nums focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
                        />
                      </td>

                      <td className="py-2 px-1.5">
                        <input
                          type="number"
                          min={0}
                          step={0.5}
                          disabled={!isAdmin}
                          aria-label={`ساعت شب‌کاری ${emp.fullName}`}
                          value={ts.nightShiftHours}
                          onChange={(e) =>
                            updateField(
                              emp.id,
                              'nightShiftHours',
                              Math.max(0, Number(e.target.value) || 0)
                            )
                          }
                          className="w-16 px-2 py-1.5 text-xs sm:text-sm border border-slate-200 rounded bg-white disabled:bg-slate-50 disabled:text-slate-500 font-mono-num tabular-nums focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
                        />
                      </td>

                      <td className="py-2 px-1.5">
                        <input
                          type="number"
                          min={0}
                          step={100000}
                          disabled={!isAdmin}
                          aria-label={`پاداش ${emp.fullName}`}
                          value={ts.bonus}
                          onChange={(e) =>
                            updateField(
                              emp.id,
                              'bonus',
                              Math.max(0, Number(e.target.value) || 0)
                            )
                          }
                          className="w-24 px-2 py-1.5 text-xs sm:text-sm border border-slate-200 rounded bg-white disabled:bg-slate-50 disabled:text-slate-500 font-mono-num tabular-nums focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
                        />
                      </td>

                      <td className="py-2 px-1.5">
                        <input
                          type="number"
                          min={0}
                          step={100000}
                          disabled={!isAdmin}
                          aria-label={`مساعده ${emp.fullName}`}
                          value={ts.advancePayment}
                          onChange={(e) =>
                            updateField(
                              emp.id,
                              'advancePayment',
                              Math.max(0, Number(e.target.value) || 0)
                            )
                          }
                          className="w-24 px-2 py-1.5 text-xs sm:text-sm border border-slate-200 rounded bg-white disabled:bg-slate-50 disabled:text-slate-500 font-mono-num tabular-nums focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
                        />
                      </td>

                      <td className="py-2 px-2 whitespace-nowrap">
                        <div className="font-semibold text-teal-800 font-mono-num tabular-nums text-xs sm:text-sm">
                          {formatMoney(slip.netPayable)}
                        </div>
                        <div className="text-[11px] text-slate-400 font-mono-num tabular-nums">
                          ناخالص: {formatMoney(slip.grossSalary)}
                        </div>
                      </td>

                      <td className="py-2 px-2.5 whitespace-nowrap text-left">
                        <button
                          type="button"
                          onClick={() => setDetailEmployeeId(emp.id)}
                          aria-label={`سایر مزایا و کسورات ${emp.fullName}`}
                          className="inline-flex items-center gap-1 px-2 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded transition-colors whitespace-nowrap shrink-0"
                        >
                          <SlidersHorizontal className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>سایر</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Extra Allowances / Deductions Detail Modal */}
      {detailEmployee && detailTimesheet && detailPayslip && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="detail-modal-title"
        >
          <div className="bg-white border border-slate-200 rounded-lg w-full max-w-xl shadow-lg overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <div>
                <h3
                  id="detail-modal-title"
                  className="text-base font-semibold text-slate-900"
                >
                  سایر اطلاعات ماهانه — {detailEmployee.fullName}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  دوره {formatPeriodLabel(periodKey)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDetailEmployeeId(null)}
                aria-label="بستن جزئیات"
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded transition-colors"
              >
                <X className="w-5 h-5" aria-hidden="true" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label
                    htmlFor="detail-mission"
                    className="block text-xs font-medium text-slate-700 mb-1.5"
                  >
                    حق ماموریت ({settings.currency})
                  </label>
                  <input
                    id="detail-mission"
                    type="number"
                    min={0}
                    step={100000}
                    disabled={!isAdmin}
                    value={detailTimesheet.missionAllowance}
                    onChange={(e) =>
                      updateField(
                        detailEmployee.id,
                        'missionAllowance',
                        Math.max(0, Number(e.target.value) || 0)
                      )
                    }
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md disabled:bg-slate-50 disabled:text-slate-500 font-mono-num tabular-nums focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
                  />
                </div>

                <div>
                  <label
                    htmlFor="detail-other-allow"
                    className="block text-xs font-medium text-slate-700 mb-1.5"
                  >
                    سایر مزایا و کارانه ({settings.currency})
                  </label>
                  <input
                    id="detail-other-allow"
                    type="number"
                    min={0}
                    step={100000}
                    disabled={!isAdmin}
                    value={detailTimesheet.otherAllowances}
                    onChange={(e) =>
                      updateField(
                        detailEmployee.id,
                        'otherAllowances',
                        Math.max(0, Number(e.target.value) || 0)
                      )
                    }
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md disabled:bg-slate-50 disabled:text-slate-500 font-mono-num tabular-nums focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
                  />
                </div>

                <div>
                  <label
                    htmlFor="detail-other-deduct"
                    className="block text-xs font-medium text-slate-700 mb-1.5"
                  >
                    سایر کسورات / جریمه ({settings.currency})
                  </label>
                  <input
                    id="detail-other-deduct"
                    type="number"
                    min={0}
                    step={50000}
                    disabled={!isAdmin}
                    value={detailTimesheet.otherDeductions}
                    onChange={(e) =>
                      updateField(
                        detailEmployee.id,
                        'otherDeductions',
                        Math.max(0, Number(e.target.value) || 0)
                      )
                    }
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md disabled:bg-slate-50 disabled:text-slate-500 font-mono-num tabular-nums focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
                  />
                </div>

                <div>
                  <label
                    htmlFor="detail-note"
                    className="block text-xs font-medium text-slate-700 mb-1.5"
                  >
                    توضیحات فیش حقوقی
                  </label>
                  <input
                    id="detail-note"
                    type="text"
                    disabled={!isAdmin}
                    value={detailTimesheet.note}
                    onChange={(e) =>
                      updateField(detailEmployee.id, 'note', e.target.value)
                    }
                    placeholder="مثلاً پورسانت فروش"
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md disabled:bg-slate-50 disabled:text-slate-500 focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
                  />
                </div>
              </div>

              <div className="border-t border-slate-200 pt-4 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div>
                  <span className="text-slate-500 block">جمع ناخالص</span>
                  <span className="font-semibold text-slate-900 font-mono-num tabular-nums">
                    {formatMoney(detailPayslip.grossSalary)}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block">بیمه + مالیات</span>
                  <span className="font-semibold text-rose-700 font-mono-num tabular-nums">
                    {formatMoney(
                      detailPayslip.employeeInsurance + detailPayslip.incomeTax
                    )}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block">قسط وام دوره</span>
                  <span className="font-semibold text-amber-700 font-mono-num tabular-nums">
                    {formatMoney(detailPayslip.loanDeduction)}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block">خالص پرداختی</span>
                  <span className="font-bold text-teal-800 font-mono-num tabular-nums">
                    {formatMoney(detailPayslip.netPayable)} {settings.currency}
                  </span>
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setDetailEmployeeId(null)}
                  className="px-4 py-2 text-sm font-medium text-white bg-teal-700 hover:bg-teal-800 rounded-md transition-colors"
                >
                  بستن و تایید
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
        </>
      )}
    </div>
  );
};
