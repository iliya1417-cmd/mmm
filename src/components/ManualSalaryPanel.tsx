import React, { useMemo, useState } from 'react';
import {
  Banknote,
  Building2,
  Check,
  CreditCard,
  FileSpreadsheet,
  Search,
  Trash2,
} from 'lucide-react';
import type {
  CurrencyUnit,
  Employee,
  ManualSalaryMode,
  ManualSalaryPayment,
} from '../types/payroll';
import {
  MANUAL_SALARY_MODE_LABELS,
  formatMoney,
  formatPeriodLabel,
  getEmploymentTypeLabel,
  parseNumericInput,
  toEnglishDigits,
  toPersianDigits,
  validateManualSalaryPaymentInput,
  type ValidationErrors,
} from '../utils/payroll';
import {
  downloadRtlThreeColumnXlsx,
  type ThreeColumnExcelRow,
} from '../utils/xlsxExport';

interface ManualSalaryPanelProps {
  employees: Employee[];
  manualPayments: ManualSalaryPayment[];
  currency: CurrencyUnit;
  periodKey: string;
  isAdmin: boolean;
  onAddManualPayment: (
    payment: Omit<ManualSalaryPayment, 'id' | 'createdAt'>
  ) => void;
  onDeleteManualPayment: (id: string) => void;
}

export const ManualSalaryPanel: React.FC<ManualSalaryPanelProps> = ({
  employees,
  manualPayments,
  currency,
  periodKey,
  isAdmin,
  onAddManualPayment,
  onDeleteManualPayment,
}) => {
  const activeEmployees = useMemo(
    () => employees.filter((e) => e.isActive),
    [employees]
  );

  const defaultDate = useMemo(() => {
    const [y, m] = periodKey.split('-');
    return `${y}/${m}/25`;
  }, [periodKey]);

  const [employeeId, setEmployeeId] = useState<string>(
    activeEmployees[0]?.id ?? employees[0]?.id ?? ''
  );
  const [amountInput, setAmountInput] = useState<string>('');
  const [mode, setMode] = useState<ManualSalaryMode>('additional');
  const [paymentDate, setPaymentDate] = useState<string>(defaultDate);
  const [referenceCode, setReferenceCode] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [errors, setErrors] = useState<ValidationErrors>({});
  const [savedToast, setSavedToast] = useState(false);

  const [periodFilter, setPeriodFilter] = useState<'current' | 'all'>('current');
  const [searchQuery, setSearchQuery] = useState('');

  const selectedEmployee = useMemo(
    () => employees.find((e) => e.id === employeeId) ?? activeEmployees[0] ?? null,
    [employees, activeEmployees, employeeId]
  );

  const employeeMap = useMemo(() => {
    const map = new Map<string, Employee>();
    for (const emp of employees) {
      map.set(emp.id, emp);
    }
    return map;
  }, [employees]);

  const currentPeriodPayments = useMemo(
    () => manualPayments.filter((p) => p.periodKey === periodKey),
    [manualPayments, periodKey]
  );

  const currentPeriodTotal = useMemo(
    () => currentPeriodPayments.reduce((sum, p) => sum + p.amount, 0),
    [currentPeriodPayments]
  );

  const currentOverrideCount = useMemo(
    () =>
      new Set(
        currentPeriodPayments
          .filter((p) => p.mode === 'override')
          .map((p) => p.employeeId)
      ).size,
    [currentPeriodPayments]
  );

  const filteredPayments = useMemo(() => {
    const q = toEnglishDigits(searchQuery.trim().toLowerCase());
    return manualPayments
      .filter((p) => (periodFilter === 'current' ? p.periodKey === periodKey : true))
      .filter((p) => {
        if (!q) return true;
        const emp = employeeMap.get(p.employeeId);
        const haystack = [
          emp?.fullName ?? '',
          toEnglishDigits(emp?.personnelCode ?? ''),
          p.description,
          toEnglishDigits(p.referenceCode),
        ]
          .join(' ')
          .toLowerCase();
        return haystack.includes(q);
      })
      .slice()
      .reverse();
  }, [manualPayments, periodFilter, periodKey, searchQuery, employeeMap]);

  const parsedAmount = parseNumericInput(amountInput);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) return;

    const targetEmployeeId = employeeId || activeEmployees[0]?.id || '';
    const cleaned = {
      employeeId: targetEmployeeId,
      periodKey,
      amount: parsedAmount,
      mode,
      paymentDate: toEnglishDigits(paymentDate.trim()),
      description: description.trim(),
      referenceCode: toEnglishDigits(referenceCode.trim()),
    };

    const validation = validateManualSalaryPaymentInput(cleaned);
    if (Object.keys(validation).length > 0) {
      setErrors(validation);
      return;
    }

    onAddManualPayment(cleaned);
    setAmountInput('');
    setReferenceCode('');
    setDescription('');
    setErrors({});
    setSavedToast(true);
    window.setTimeout(() => setSavedToast(false), 2400);
  };

  const handleExportManualPaymentsXlsx = () => {
    const perEmpCount = new Map<string, number>();
    const rows: ThreeColumnExcelRow[] = filteredPayments
      .slice()
      .reverse()
      .map((item) => {
        const emp = employeeMap.get(item.employeeId);
        const baseCode = toEnglishDigits(
          (emp?.personnelCode || item.referenceCode || item.employeeId).trim()
        );
        const count = perEmpCount.get(item.employeeId) ?? 0;
        perEmpCount.set(item.employeeId, count + 1);
        const code = count === 0 ? baseCode : `${baseCode}-${count}`;
        const detail =
          item.description.trim() ||
          (item.mode === 'override' ? 'حقوق دستی توافقی' : 'پرداخت حقوق دستی');
        return {
          code,
          title: emp ? `${emp.fullName} - ${detail}` : detail,
          amount: Math.round(item.amount),
        };
      });
    downloadRtlThreeColumnXlsx(rows, `manual-salaries-${periodKey}.xlsx`, {
      includeHeaderRow: false,
      sheetName: 'Sheet1',
    });
  };

  return (
    <div className="space-y-6">
      {/* Compact Summary Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white border border-slate-200 rounded-lg px-5 py-4">
          <p className="text-xs text-slate-500 font-medium">
            تعداد پرداخت‌های حقوق دستی ({formatPeriodLabel(periodKey)})
          </p>
          <p className="mt-1.5 text-2xl font-semibold text-slate-900 font-mono-num tabular-nums">
            {toPersianDigits(currentPeriodPayments.length)}{' '}
            <span className="text-xs font-normal text-slate-500">سند</span>
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg px-5 py-4">
          <p className="text-xs text-slate-500 font-medium">
            جمع کل حقوق دستی داده‌شده در دوره
          </p>
          <p className="mt-1.5 text-2xl font-semibold text-teal-800 font-mono-num tabular-nums">
            {formatMoney(currentPeriodTotal)}{' '}
            <span className="text-xs font-normal text-slate-500">{currency}</span>
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg px-5 py-4">
          <p className="text-xs text-slate-500 font-medium">
            کارمندان با حقوق توافقی جایگزین فیش
          </p>
          <p className="mt-1.5 text-2xl font-semibold text-slate-900 font-mono-num tabular-nums">
            {toPersianDigits(currentOverrideCount)}{' '}
            <span className="text-xs font-normal text-slate-500">نفر</span>
          </p>
        </div>
      </div>

      {/* Split Workspace: Form (Right) + Ledger History (Left) */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* Manual Salary Payout Form */}
        <section
          aria-label="فرم پرداخت و ثبت حقوق دستی"
          className="xl:col-span-5 bg-white border border-slate-200 rounded-lg overflow-hidden"
        >
          <div className="px-5 py-4 border-b border-slate-200 bg-slate-50/70">
            <div className="flex items-center gap-2">
              <Banknote className="w-4 h-4 text-teal-700" aria-hidden="true" />
              <h2 className="text-sm font-semibold text-slate-900">
                پرداخت و ثبت حقوق دستی — {formatPeriodLabel(periodKey)}
              </h2>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              در این بخش می‌توانید مستقیماً برای هر کارمند حقوق دستی ثبت و پرداخت کنید.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="p-5 space-y-4" noValidate>
            <div>
              <label
                htmlFor="manual-pay-employee"
                className="block text-xs font-medium text-slate-700 mb-1.5"
              >
                انتخاب کارمند *
              </label>
              <select
                id="manual-pay-employee"
                disabled={!isAdmin || employees.length === 0}
                value={selectedEmployee?.id ?? ''}
                onChange={(e) => setEmployeeId(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md bg-white disabled:bg-slate-50 disabled:text-slate-500 focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
              >
                {employees.length === 0 ? (
                  <option value="">کارمندی ثبت نشده است</option>
                ) : (
                  employees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.fullName} (کد {toPersianDigits(emp.personnelCode)} —{' '}
                      {getEmploymentTypeLabel(emp.employmentType)})
                    </option>
                  ))
                )}
              </select>
              {errors.employeeId && (
                <p className="mt-1 text-xs text-rose-600">{errors.employeeId}</p>
              )}
            </div>

            {selectedEmployee && (
              <div className="bg-slate-50 border border-slate-200 rounded-md p-3 text-xs space-y-1.5">
                <div className="flex items-center justify-between gap-2 text-slate-700">
                  <span className="inline-flex items-center gap-1.5">
                    <Building2 className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
                    <span>{selectedEmployee.workLocation || 'ستاد مرکزی'}</span>
                  </span>
                  <span className="font-mono-num tabular-nums font-medium text-slate-800">
                    حقوق پایه: {formatMoney(selectedEmployee.baseMonthlySalary)} {currency}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2 text-slate-600">
                  <span className="inline-flex items-center gap-1.5">
                    <CreditCard className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
                    <span>{selectedEmployee.bankName || 'بانک نامشخص'}</span>
                  </span>
                  <span
                    className="font-mono-num tabular-nums text-[11px]"
                    dir="ltr"
                  >
                    {selectedEmployee.bankAccount || 'بدون شماره حساب'}
                  </span>
                </div>
              </div>
            )}

            <div>
              <label
                htmlFor="manual-pay-amount"
                className="block text-xs font-medium text-slate-700 mb-1.5"
              >
                مبلغ حقوق دستی ({currency}) *
              </label>
              <input
                id="manual-pay-amount"
                type="text"
                inputMode="numeric"
                dir="ltr"
                disabled={!isAdmin}
                value={amountInput}
                onChange={(e) => setAmountInput(e.target.value)}
                placeholder="مثلاً 15000000"
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md bg-white disabled:bg-slate-50 disabled:text-slate-500 font-mono-num tabular-nums text-left focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
              />
              <div className="mt-1 flex items-center justify-between text-[11px] text-slate-500">
                <span>مبلغ به حروف عددی:</span>
                <span className="font-mono-num tabular-nums font-semibold text-teal-800">
                  {formatMoney(parsedAmount)} {currency}
                </span>
              </div>
              {errors.amount && (
                <p className="mt-1 text-xs text-rose-600">{errors.amount}</p>
              )}
            </div>

            <div>
              <span className="block text-xs font-medium text-slate-700 mb-1.5">
                نحوه محاسبه در حقوق دوره
              </span>
              <div className="space-y-2">
                {(Object.keys(MANUAL_SALARY_MODE_LABELS) as ManualSalaryMode[]).map(
                  (key) => (
                    <label
                      key={key}
                      className={`flex items-start gap-2.5 p-2.5 border rounded-md cursor-pointer transition-colors ${
                        mode === key
                          ? 'border-teal-500 bg-teal-50/50'
                          : 'border-slate-200 hover:bg-slate-50'
                      } ${!isAdmin ? 'opacity-60 cursor-not-allowed' : ''}`}
                    >
                      <input
                        type="radio"
                        name="manual-salary-mode"
                        value={key}
                        disabled={!isAdmin}
                        checked={mode === key}
                        onChange={() => setMode(key)}
                        className="mt-0.5 accent-teal-700"
                      />
                      <div className="text-xs">
                        <div className="font-medium text-slate-900">
                          {MANUAL_SALARY_MODE_LABELS[key]}
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          {key === 'additional'
                            ? 'این مبلغ بدون کسر بیمه و مالیات به عنوان حقوق دستی به خالص دریافتی این ماه اضافه می‌شود.'
                            : 'کل فیش ماه این کارمند جایگزین شده و خالص پرداختی دقیقاً برابر مبلغ حقوق دستی ثبت می‌شود.'}
                        </div>
                      </div>
                    </label>
                  )
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="manual-pay-date"
                  className="block text-xs font-medium text-slate-700 mb-1.5"
                >
                  تاریخ پرداخت *
                </label>
                <input
                  id="manual-pay-date"
                  type="text"
                  dir="ltr"
                  disabled={!isAdmin}
                  value={paymentDate}
                  onChange={(e) => setPaymentDate(e.target.value)}
                  placeholder="1405/08/25"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md bg-white disabled:bg-slate-50 disabled:text-slate-500 font-mono-num tabular-nums text-left focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
                />
                {errors.paymentDate && (
                  <p className="mt-1 text-xs text-rose-600">{errors.paymentDate}</p>
                )}
              </div>

              <div>
                <label
                  htmlFor="manual-pay-ref"
                  className="block text-xs font-medium text-slate-700 mb-1.5"
                >
                  شماره پیگیری / سند
                </label>
                <input
                  id="manual-pay-ref"
                  type="text"
                  dir="ltr"
                  disabled={!isAdmin}
                  value={referenceCode}
                  onChange={(e) => setReferenceCode(e.target.value)}
                  placeholder="مثلاً 948210"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md bg-white disabled:bg-slate-50 disabled:text-slate-500 font-mono-num tabular-nums text-left focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="manual-pay-desc"
                className="block text-xs font-medium text-slate-700 mb-1.5"
              >
                شرح / بابت
              </label>
              <input
                id="manual-pay-desc"
                type="text"
                disabled={!isAdmin}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="مثلاً پرداخت حقوق دستی توافقی یا حق‌الزحمه"
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md bg-white disabled:bg-slate-50 disabled:text-slate-500 focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
              />
            </div>

            <div className="pt-3 border-t border-slate-200 flex items-center justify-between gap-3">
              <button
                type="submit"
                disabled={!isAdmin || employees.length === 0}
                className="inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-white bg-teal-700 hover:bg-teal-800 disabled:opacity-50 disabled:cursor-not-allowed rounded-md transition-colors whitespace-nowrap shrink-0"
              >
                <Check className="w-4 h-4" aria-hidden="true" />
                <span>ثبت و پرداخت حقوق دستی</span>
              </button>

              {savedToast && (
                <span className="text-xs font-medium text-emerald-700">
                  حقوق دستی با موفقیت ثبت شد
                </span>
              )}
            </div>
          </form>
        </section>

        {/* Manual Salary Payments Ledger */}
        <section
          aria-label="لیست حقوق‌های دستی داده‌شده"
          className="xl:col-span-7 bg-white border border-slate-200 rounded-lg overflow-hidden"
        >
          <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">
                لیست حقوق‌های دستی داده‌شده
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                تمامی مبالغ ثبت‌شده بلافاصله در لیست حقوق و فیش حقوقی صفحه گزارش‌دهی لحاظ می‌شوند.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search
                  className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
                  aria-hidden="true"
                />
                <label htmlFor="manual-pay-search" className="sr-only">
                  جستجو در سوابق حقوق دستی
                </label>
                <input
                  id="manual-pay-search"
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="جستجوی نام یا شرح..."
                  className="w-40 pr-8 pl-2.5 py-1.5 text-xs border border-slate-200 rounded-md bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
                />
              </div>

              <div
                className="flex items-center gap-1 p-1 bg-slate-100 rounded-md"
                role="group"
                aria-label="فیلتر دوره حقوق دستی"
              >
                <button
                  type="button"
                  onClick={() => setPeriodFilter('current')}
                  className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap ${
                    periodFilter === 'current'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  دوره جاری
                </button>
                <button
                  type="button"
                  onClick={() => setPeriodFilter('all')}
                  className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap ${
                    periodFilter === 'all'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  همه دوره‌ها
                </button>
              </div>

              <button
                type="button"
                disabled={filteredPayments.length === 0}
                onClick={handleExportManualPaymentsXlsx}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 disabled:opacity-40 disabled:cursor-not-allowed rounded-md transition-colors whitespace-nowrap shrink-0"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" aria-hidden="true" />
                <span>اکسل (.xlsx)</span>
              </button>
            </div>
          </div>

          {filteredPayments.length === 0 ? (
            <div className="py-14 px-6 text-center">
              <p className="text-sm font-medium text-slate-700">
                هنوز حقوق دستی برای این بخش ثبت نشده است.
              </p>
              <p className="mt-1 text-xs text-slate-500">
                از فرم سمت راست برای پرداخت حقوق دستی به کارمند موردنظر استفاده کنید.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-right border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-medium text-slate-500">
                    <th className="py-2.5 px-3 whitespace-nowrap">کارمند / کد</th>
                    <th className="py-2.5 px-2.5 whitespace-nowrap">نوع و تاریخ</th>
                    <th className="py-2.5 px-2.5 whitespace-nowrap">شرح / پیگیری</th>
                    <th className="py-2.5 px-2.5 whitespace-nowrap">مبلغ ({currency})</th>
                    <th className="py-2.5 px-3 whitespace-nowrap text-left">حذف</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-xs">
                  {filteredPayments.map((item) => {
                    const emp = employeeMap.get(item.employeeId);
                    return (
                      <tr key={item.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="py-3 px-3 whitespace-nowrap">
                          <div className="font-semibold text-slate-900">
                            {emp?.fullName ?? 'کارمند حذف‌شده'}
                          </div>
                          <div className="text-[11px] text-slate-500 font-mono-num tabular-nums mt-0.5">
                            {emp ? `کد ${toPersianDigits(emp.personnelCode)}` : ''} ·{' '}
                            {formatPeriodLabel(item.periodKey)}
                          </div>
                        </td>
                        <td className="py-3 px-2.5 whitespace-nowrap">
                          <div
                            className={`font-medium ${
                              item.mode === 'override'
                                ? 'text-amber-700'
                                : 'text-teal-800'
                            }`}
                          >
                            {item.mode === 'override'
                              ? 'جایگزین فیش ماه'
                              : 'پرداخت مجزا'}
                          </div>
                          <div className="text-[11px] text-slate-500 font-mono-num tabular-nums mt-0.5">
                            {toPersianDigits(item.paymentDate)}
                          </div>
                        </td>
                        <td className="py-3 px-2.5">
                          <div className="text-slate-700 max-w-[200px] truncate">
                            {item.description || 'پرداخت حقوق دستی'}
                          </div>
                          {item.referenceCode && (
                            <div className="text-[11px] text-slate-400 font-mono-num tabular-nums mt-0.5">
                              پیگیری: {toPersianDigits(item.referenceCode)}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-2.5 font-mono-num tabular-nums text-sm font-semibold text-teal-800 whitespace-nowrap">
                          {formatMoney(item.amount)}
                        </td>
                        <td className="py-3 px-3 whitespace-nowrap text-left">
                          <button
                            type="button"
                            disabled={!isAdmin}
                            onClick={() => onDeleteManualPayment(item.id)}
                            aria-label={`حذف پرداخت حقوق دستی ${emp?.fullName ?? ''}`}
                            className="p-1.5 text-slate-400 hover:text-rose-700 hover:bg-rose-50 disabled:opacity-40 disabled:cursor-not-allowed rounded transition-colors"
                          >
                            <Trash2 className="w-4 h-4" aria-hidden="true" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-50 border-t border-slate-200 text-xs font-semibold text-slate-900">
                    <td className="py-3 px-3 whitespace-nowrap" colSpan={3}>
                      جمع کل ({toPersianDigits(filteredPayments.length)} مورد)
                    </td>
                    <td className="py-3 px-2.5 font-mono-num tabular-nums text-teal-800 text-sm whitespace-nowrap" colSpan={2}>
                      {formatMoney(
                        filteredPayments.reduce((sum, p) => sum + p.amount, 0)
                      )}{' '}
                      {currency}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
};
