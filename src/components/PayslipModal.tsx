import React from 'react';
import { Printer, X } from 'lucide-react';
import type { ComputedPayslip, PayrollSettings } from '../types/payroll';
import {
  SALARY_TIER_LABELS,
  formatMoney,
  formatPeriodLabel,
  getEmploymentTypeLabel,
  normalizeManualSalaries,
  toPersianDigits,
} from '../utils/payroll';

interface PayslipModalProps {
  payslip: ComputedPayslip;
  settings: PayrollSettings;
  onClose: () => void;
}

export const PayslipModal: React.FC<PayslipModalProps> = ({
  payslip,
  settings,
  onClose,
}) => {
  const { employee, timesheet } = payslip;
  const manualTiers = normalizeManualSalaries(
    employee.manualSalaries,
    employee.baseMonthlySalary
  );
  const nonZeroTiers = manualTiers
    .map((amount, idx) => ({ label: SALARY_TIER_LABELS[idx], amount }))
    .filter((item) => item.amount > 0);

  const earningsRows = payslip.isManualOverride
    ? [
        { label: 'حقوق دستی توافقی دوره', value: payslip.manualOverrideAmount },
        ...(payslip.manualAdditionalPay > 0
          ? [{ label: 'پرداخت حقوق دستی مجزا', value: payslip.manualAdditionalPay }]
          : []),
      ]
    : [
        { label: 'حقوق پایه (متناسب با کارکرد)', value: payslip.baseSalaryEarned },
        { label: 'حق مسکن', value: payslip.housingEarned },
        { label: 'بن خواربار و کارگری', value: payslip.foodEarned },
        { label: 'حق تاهل (عائله‌مندی)', value: payslip.maritalEarned },
        {
          label:
            employee.childrenCount > 0
              ? `حق اولاد (${toPersianDigits(employee.childrenCount)} فرزند)`
              : 'حق اولاد (سهم قرارداد)',
          value: payslip.childEarned,
        },
        { label: 'سایر مزایای ثابت (ماده ۲۸ / سروش)', value: payslip.specialFixedAllowanceEarned },
        { label: `اضافه‌کاری (${toPersianDigits(timesheet.overtimeHours)} ساعت)`, value: payslip.overtimePay },
        { label: `تعطیل‌کاری (${toPersianDigits(timesheet.holidayHours)} ساعت)`, value: payslip.holidayPay },
        { label: `شب‌کاری (${toPersianDigits(timesheet.nightShiftHours)} ساعت)`, value: payslip.nightShiftPay },
        { label: 'حق ماموریت', value: payslip.missionAllowance },
        { label: 'پاداش و کارانه', value: payslip.bonus },
        { label: 'سایر مزایا', value: payslip.otherAllowances },
        { label: 'پرداخت حقوق دستی مجزا', value: payslip.manualAdditionalPay },
      ].filter((item) => item.value > 0);

  const deductionRows = [
    { label: `بیمه تامین اجتماعی سهم کارگر (${toPersianDigits(settings.employeeInsuranceRate)}٪)`, value: payslip.employeeInsurance },
    { label: 'مالیات حقوق ماهانه', value: payslip.incomeTax },
    { label: 'کسر اقساط وام', value: payslip.loanDeduction },
    { label: 'مساعده دریافتی', value: payslip.advancePayment },
    { label: 'سایر کسورات', value: payslip.otherDeductions },
  ].filter((item) => item.value > 0);

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="payslip-title"
    >
      <div className="bg-white border border-slate-200 rounded-lg w-full max-w-3xl max-h-[92vh] overflow-y-auto shadow-xl print-only-area">
        {/* Modal Header (Hidden on Print) */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 no-print">
          <h2 id="payslip-title" className="text-base font-semibold text-slate-900">
            فیش حقوقی — {employee.fullName}
          </h2>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-2 px-3.5 py-1.5 text-sm font-medium text-white bg-teal-700 hover:bg-teal-800 rounded-md transition-colors"
            >
              <Printer className="w-4 h-4" aria-hidden="true" />
              <span>چاپ فیش حقوقی</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="بستن فیش حقوقی"
              className="p-1.5 text-slate-400 hover:text-slate-700 rounded transition-colors"
            >
              <X className="w-5 h-5" aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Formal Printable Payslip Content */}
        <div className="p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-3 border-b border-slate-200">
            <div>
              <h3 className="text-lg font-bold text-slate-900">{settings.companyName}</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                فیش حقوق و دستمزد پرسنل · واحد پولی: {settings.currency}
              </p>
            </div>
            <div className="text-sm font-semibold text-teal-800">
              دوره مالی: {formatPeriodLabel(payslip.periodKey)}
            </div>
          </div>

          {/* Employee & Attendance Identity Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs bg-slate-50 border border-slate-200 rounded-md p-4">
            <div>
              <span className="text-slate-500 block">نام و نام خانوادگی</span>
              <span className="font-semibold text-slate-900 mt-0.5 block">
                {employee.fullName}
              </span>
            </div>
            <div>
              <span className="text-slate-500 block">کد پرسنلی / کد ملی</span>
              <span className="font-semibold text-slate-900 font-mono-num tabular-nums mt-0.5 block">
                {toPersianDigits(employee.personnelCode)} / {toPersianDigits(employee.nationalId)}
              </span>
            </div>
            <div>
              <span className="text-slate-500 block">دپارتمان، سمت و محل خدمت</span>
              <span className="font-semibold text-slate-900 mt-0.5 block">
                {employee.department} · {employee.jobTitle} ({employee.workLocation})
              </span>
            </div>
            <div>
              <span className="text-slate-500 block">نوع قرارداد و کارکرد</span>
              <span className="font-semibold text-slate-900 font-mono-num tabular-nums mt-0.5 block">
                {getEmploymentTypeLabel(employee.employmentType)} · {toPersianDigits(payslip.effectiveDays)} روز
              </span>
              {employee.employmentType === 'sherkati-soroush' && payslip.dailyWage > 0 && (
                <span className="text-[11px] text-teal-800 font-mono-num tabular-nums mt-0.5 block">
                  نرخ روزانه: {formatMoney(payslip.dailyWage)} {settings.currency}
                </span>
              )}
            </div>
          </div>

          {/* Earnings vs Deductions Two-Column Ledger */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Earnings */}
            <div className="border border-slate-200 rounded-md overflow-hidden">
              <div className="bg-slate-50 px-4 py-2.5 border-b border-slate-200 text-xs font-semibold text-slate-700">
                حقوق و مزایا (بستانکار)
              </div>
              <table className="w-full text-sm">
                <tbody className="divide-y divide-slate-100">
                  {earningsRows.map((row) => (
                    <tr key={row.label}>
                      <td className="py-1.5 px-4 text-slate-700 text-xs">{row.label}</td>
                      <td className="py-1.5 px-4 text-left font-mono-num tabular-nums font-medium text-slate-900">
                        {formatMoney(row.value)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-50 border-t border-slate-200 font-semibold">
                    <td className="py-2.5 px-4 text-xs text-slate-900">جمع کل حقوق و مزایا</td>
                    <td className="py-2.5 px-4 text-left font-mono-num tabular-nums text-slate-900">
                      {formatMoney(payslip.grossSalary)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Deductions */}
            <div className="border border-slate-200 rounded-md overflow-hidden flex flex-col justify-between">
              <div>
                <div className="bg-slate-50 px-4 py-2.5 border-b border-slate-200 text-xs font-semibold text-slate-700">
                  کسورات قانونی و توافقی (بدهکار)
                </div>
                <table className="w-full text-sm">
                  <tbody className="divide-y divide-slate-100">
                    {deductionRows.length === 0 ? (
                      <tr>
                        <td className="py-4 px-4 text-xs text-slate-400 text-center" colSpan={2}>
                          کسوراتی در این دوره ثبت نشده است.
                        </td>
                      </tr>
                    ) : (
                      deductionRows.map((row) => (
                        <tr key={row.label}>
                          <td className="py-2 px-4 text-slate-700 text-xs">{row.label}</td>
                          <td className="py-2 px-4 text-left font-mono-num tabular-nums font-medium text-rose-700">
                            {formatMoney(row.value)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              <div className="bg-slate-50 border-t border-slate-200 px-4 py-2.5 flex items-center justify-between font-semibold text-sm">
                <span className="text-xs text-slate-900">جمع کل کسورات</span>
                <span className="font-mono-num tabular-nums text-rose-700">
                  {formatMoney(payslip.totalDeductions)}
                </span>
              </div>
            </div>
          </div>

          {/* Net Pay Summary Footer */}
          <div className="border border-teal-200 bg-teal-50/70 rounded-md p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="space-y-1 text-xs text-slate-600">
              <div>
                بیمه سهم کارفرما ({toPersianDigits(settings.employerInsuranceRate)}٪):{' '}
                <span className="font-mono-num tabular-nums font-medium text-slate-800">
                  {formatMoney(payslip.employerInsurance)} {settings.currency}
                </span>
                {payslip.activeLoansRemainingAfter > 0 && (
                  <>
                    <span className="mx-2 text-slate-300" aria-hidden="true">
                      ·
                    </span>
                    <span>
                      مانده وام پس از این دوره:{' '}
                      <strong className="font-mono-num tabular-nums text-slate-800">
                        {formatMoney(payslip.activeLoansRemainingAfter)} {settings.currency}
                      </strong>
                    </span>
                  </>
                )}
              </div>
              {employee.bankAccount && (
                <div className="font-mono-num tabular-nums">
                  واریز به {employee.bankName || 'بانک'}:{' '}
                  <span dir="ltr">{employee.bankAccount}</span>
                </div>
              )}
              {payslip.isManualOverride && (
                <div className="text-amber-800 font-medium">
                  حالت فیش: حقوق دستی توافقی (جایگزین محاسبه فرمولی ماه)
                </div>
              )}
              {!payslip.isManualOverride && nonZeroTiers.length > 1 && (
                <div>
                  ترکیب حقوق دستی:{' '}
                  <span className="font-mono-num tabular-nums text-slate-800">
                    {nonZeroTiers
                      .map((t) => `${t.label}: ${formatMoney(t.amount)}`)
                      .join(' + ')}
                  </span>
                </div>
              )}
              {timesheet.note && <div>توضیحات: {timesheet.note}</div>}
            </div>

            <div className="text-right sm:text-left shrink-0">
              <span className="block text-xs text-teal-800 font-medium">
                خالص قابل پرداخت
              </span>
              <span className="text-2xl font-bold text-teal-900 font-mono-num tabular-nums whitespace-nowrap">
                {formatMoney(payslip.netPayable)}{' '}
                <span className="text-sm font-medium">{settings.currency}</span>
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
