import React, { useEffect, useState } from 'react';
import {
  CheckCircle2,
  PauseCircle,
  PlayCircle,
  Plus,
  RotateCcw,
  Shield,
  Trash2,
  UserCheck,
  UserPlus,
  UserX,
  Wallet,
  X,
} from 'lucide-react';
import type {
  CurrencyUnit,
  Employee,
  Loan,
  LoanStatus,
  PayrollSettings,
  SpecialContractAllowances,
  SystemUser,
  TaxBracket,
  UserRole,
} from '../types/payroll';
import {
  USER_ROLE_LABELS,
  formatMoney,
  formatPeriodLabel,
  toEnglishDigits,
  toPersianDigits,
  validateLoanInput,
  validateSystemUserInput,
  type ValidationErrors,
} from '../utils/payroll';
import { DEFAULT_PAYROLL_SETTINGS } from '../data/seedData';

export type LoansSettingsTab = 'loans' | 'settings' | 'users';

interface LoansSettingsPageProps {
  employees: Employee[];
  loans: Loan[];
  settings: PayrollSettings;
  periodKey: string;
  isAdmin: boolean;
  users: SystemUser[];
  currentUserId: string | null;
  requestedTab?: LoansSettingsTab | null;
  onAddLoan: (loan: Omit<Loan, 'id' | 'createdAt'>) => void;
  onUpdateLoanStatus: (loanId: string, status: LoanStatus) => void;
  onRecordLoanInstallment: (loanId: string) => void;
  onDeleteLoan: (loanId: string) => void;
  onUpdateSettings: (settings: PayrollSettings) => void;
  onAddUser: (user: Omit<SystemUser, 'id' | 'createdAt'>) => void;
  onUpdateUser: (user: SystemUser) => void;
  onDeleteUser: (userId: string) => void;
}

const LOAN_STATUS_META: Record<
  LoanStatus,
  { label: string; className: string }
> = {
  active: { label: 'در حال بازپرداخت', className: 'text-emerald-700' },
  paused: { label: 'متوقف', className: 'text-amber-700' },
  settled: { label: 'تسویه‌شده', className: 'text-slate-500' },
};

export const LoansSettingsPage: React.FC<LoansSettingsPageProps> = ({
  employees,
  loans,
  settings,
  periodKey,
  isAdmin,
  users,
  currentUserId,
  requestedTab,
  onAddLoan,
  onUpdateLoanStatus,
  onRecordLoanInstallment,
  onDeleteLoan,
  onUpdateSettings,
  onAddUser,
  onUpdateUser,
  onDeleteUser,
}) => {
  const [activeTab, setActiveTab] = useState<LoansSettingsTab>(requestedTab ?? 'loans');
  const [isLoanModalOpen, setIsLoanModalOpen] = useState(false);

  useEffect(() => {
    if (requestedTab) {
      setActiveTab(requestedTab);
    }
  }, [requestedTab]);

  // User Management Modal State
  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  const [userForm, setUserForm] = useState<{
    fullName: string;
    username: string;
    password: string;
    role: UserRole;
    isActive: boolean;
  }>({
    fullName: '',
    username: '',
    password: '',
    role: 'viewer',
    isActive: true,
  });
  const [userErrors, setUserErrors] = useState<ValidationErrors>({});

  const [loanForm, setLoanForm] = useState<{
    employeeId: string;
    title: string;
    totalAmount: number;
    monthlyInstallment: number;
    remainingBalance: number;
    startPeriod: string;
  }>({
    employeeId: employees[0]?.id ?? '',
    title: '',
    totalAmount: 20_000_000,
    monthlyInstallment: 2_000_000,
    remainingBalance: 20_000_000,
    startPeriod: periodKey,
  });
  const [loanErrors, setLoanErrors] = useState<ValidationErrors>({});
  const [settingsSavedNotice, setSettingsSavedNotice] = useState(false);

  const employeeMap = new Map(employees.map((e) => [e.id, e]));

  const totalRemainingLoans = loans
    .filter((l) => l.status !== 'settled')
    .reduce((sum, l) => sum + l.remainingBalance, 0);

  const activeMonthlyInstallments = loans
    .filter((l) => l.status === 'active' && l.remainingBalance > 0 && l.startPeriod <= periodKey)
    .reduce((sum, l) => sum + Math.min(l.monthlyInstallment, l.remainingBalance), 0);

  const openLoanModal = () => {
    if (!isAdmin) return;
    setLoanForm({
      employeeId: employees[0]?.id ?? '',
      title: '',
      totalAmount: 20_000_000,
      monthlyInstallment: 2_000_000,
      remainingBalance: 20_000_000,
      startPeriod: periodKey,
    });
    setLoanErrors({});
    setIsLoanModalOpen(true);
  };

  const handleLoanSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) return;
    const errs = validateLoanInput({
      employeeId: loanForm.employeeId,
      title: loanForm.title,
      totalAmount: loanForm.totalAmount,
      monthlyInstallment: loanForm.monthlyInstallment,
      remainingBalance: loanForm.remainingBalance,
    });
    if (Object.keys(errs).length > 0) {
      setLoanErrors(errs);
      return;
    }

    onAddLoan({
      employeeId: loanForm.employeeId,
      title: loanForm.title.trim(),
      totalAmount: loanForm.totalAmount,
      monthlyInstallment: loanForm.monthlyInstallment,
      remainingBalance: loanForm.remainingBalance,
      startPeriod: loanForm.startPeriod,
      status: loanForm.remainingBalance === 0 ? 'settled' : 'active',
    });
    setIsLoanModalOpen(false);
  };

  const openUserModal = () => {
    if (!isAdmin) return;
    setUserForm({
      fullName: '',
      username: '',
      password: '',
      role: 'viewer',
      isActive: true,
    });
    setUserErrors({});
    setIsUserModalOpen(true);
  };

  const handleUserSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) return;
    const cleaned = {
      fullName: userForm.fullName.trim(),
      username: toEnglishDigits(userForm.username.trim()).toLowerCase(),
      password: userForm.password,
      role: userForm.role,
      isActive: userForm.isActive,
    };
    const errs = validateSystemUserInput(cleaned, users);
    if (Object.keys(errs).length > 0) {
      setUserErrors(errs);
      return;
    }
    onAddUser(cleaned);
    setIsUserModalOpen(false);
  };

  const activeAdminCount = users.filter(
    (u) => u.isActive && u.role === 'admin'
  ).length;

  const updateSettingField = <K extends keyof PayrollSettings>(
    field: K,
    value: PayrollSettings[K]
  ) => {
    if (!isAdmin) return;
    onUpdateSettings({
      ...settings,
      [field]: value,
    });
    setSettingsSavedNotice(true);
    window.setTimeout(() => setSettingsSavedNotice(false), 1800);
  };

  const specialAllowances: SpecialContractAllowances =
    settings.specialContractAllowances ??
    DEFAULT_PAYROLL_SETTINGS.specialContractAllowances!;

  const updateSpecialAllowanceField = <
    K extends keyof SpecialContractAllowances,
  >(
    field: K,
    value: SpecialContractAllowances[K]
  ) => {
    updateSettingField('specialContractAllowances', {
      ...specialAllowances,
      [field]: value,
    });
  };

  const updateBracket = (
    id: string,
    patch: Partial<TaxBracket>
  ) => {
    if (!isAdmin) return;
    const next = settings.taxBrackets.map((b) =>
      b.id === id ? { ...b, ...patch } : b
    );
    updateSettingField('taxBrackets', next);
  };

  const addBracket = () => {
    if (!isAdmin) return;
    const sorted = [...settings.taxBrackets].sort(
      (a, b) => a.minMonthly - b.minMonthly
    );
    const last = sorted[sorted.length - 1];
    const nextMin = last?.maxMonthly ?? (last ? last.minMonthly + 10_000_000 : 0);
    const nextBracket: TaxBracket = {
      id: `tb-${Date.now()}`,
      minMonthly: nextMin,
      maxMonthly: null,
      ratePercent: 25,
    };
    const updated = settings.taxBrackets.map((b) =>
      b.id === last?.id && b.maxMonthly === null
        ? { ...b, maxMonthly: nextMin }
        : b
    );
    updateSettingField('taxBrackets', [...updated, nextBracket]);
  };

  const removeBracket = (id: string) => {
    if (!isAdmin || settings.taxBrackets.length <= 1) return;
    updateSettingField(
      'taxBrackets',
      settings.taxBrackets.filter((b) => b.id !== id)
    );
  };

  return (
    <div className="space-y-6">
      {/* Sub-navigation between Loans, Payroll Settings & Users */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div
          className="inline-flex flex-wrap items-center gap-1 p-1 bg-slate-200/70 rounded-lg self-start"
          role="tablist"
          aria-label="بخش‌های وام، تنظیمات و کاربران"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'loans'}
            onClick={() => setActiveTab('loans')}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
              activeTab === 'loans'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            مدیریت وام کارمندان
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'settings'}
            onClick={() => setActiveTab('settings')}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
              activeTab === 'settings'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            تنظیمات حقوق، بیمه و مالیات
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'users'}
            onClick={() => setActiveTab('users')}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
              activeTab === 'users'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            مدیریت کاربران و دسترسی
          </button>
        </div>

        {activeTab === 'loans' ? (
          <button
            type="button"
            onClick={openLoanModal}
            disabled={!isAdmin || employees.length === 0}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-teal-700 hover:bg-teal-800 disabled:opacity-50 disabled:cursor-not-allowed rounded-md transition-colors whitespace-nowrap shrink-0"
          >
            <Plus className="w-4 h-4" aria-hidden="true" />
            <span>ثبت وام جدید</span>
          </button>
        ) : activeTab === 'settings' ? (
          <div className="flex items-center gap-3">
            {settingsSavedNotice && (
              <span className="text-xs font-medium text-emerald-700">
                تغییرات ذخیره شد
              </span>
            )}
            <button
              type="button"
              disabled={!isAdmin}
              onClick={() => {
                if (!isAdmin) return;
                onUpdateSettings(DEFAULT_PAYROLL_SETTINGS);
                setSettingsSavedNotice(true);
                window.setTimeout(() => setSettingsSavedNotice(false), 1800);
              }}
              className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed rounded-md transition-colors whitespace-nowrap shrink-0"
            >
              <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
              <span>بازگردانی به نرخ‌های پیش‌فرض</span>
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={openUserModal}
            disabled={!isAdmin}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-teal-700 hover:bg-teal-800 disabled:opacity-50 disabled:cursor-not-allowed rounded-md transition-colors whitespace-nowrap shrink-0"
          >
            <UserPlus className="w-4 h-4" aria-hidden="true" />
            <span>تعریف کاربر جدید</span>
          </button>
        )}
      </div>

      {activeTab === 'loans' ? (
        <div className="space-y-5">
          {/* Loan KPI Summary */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white border border-slate-200 rounded-lg px-5 py-4">
              <p className="text-xs text-slate-500 font-medium">تعداد وام‌های فعال</p>
              <p className="mt-1.5 text-2xl font-semibold text-slate-900 font-mono-num tabular-nums">
                {toPersianDigits(loans.filter((l) => l.status === 'active').length)}{' '}
                <span className="text-xs font-normal text-slate-500">
                  از {toPersianDigits(loans.length)} پرونده
                </span>
              </p>
            </div>
            <div className="bg-white border border-slate-200 rounded-lg px-5 py-4">
              <p className="text-xs text-slate-500 font-medium">
                جمع اقساط کسرشونده در {formatPeriodLabel(periodKey)}
              </p>
              <p className="mt-1.5 text-2xl font-semibold text-slate-900 font-mono-num tabular-nums">
                {formatMoney(activeMonthlyInstallments)}{' '}
                <span className="text-xs font-normal text-slate-500">
                  {settings.currency}
                </span>
              </p>
            </div>
            <div className="bg-white border border-slate-200 rounded-lg px-5 py-4">
              <p className="text-xs text-slate-500 font-medium">مانده کل مطالبات وام</p>
              <p className="mt-1.5 text-2xl font-semibold text-slate-900 font-mono-num tabular-nums">
                {formatMoney(totalRemainingLoans)}{' '}
                <span className="text-xs font-normal text-slate-500">
                  {settings.currency}
                </span>
              </p>
            </div>
          </div>

          {/* Loans Table */}
          <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
            {loans.length === 0 ? (
              <div className="py-12 px-6 text-center">
                <p className="text-sm font-medium text-slate-700">
                  هیچ وامی برای کارمندان ثبت نشده است.
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  با ثبت وام، مبلغ قسط ماهانه به صورت خودکار از فیش حقوقی کارمند کسر می‌شود.
                </p>
                {isAdmin && (
                  <button
                    type="button"
                    onClick={openLoanModal}
                    className="mt-4 inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-teal-700 hover:bg-teal-800 rounded-md transition-colors"
                  >
                    <Plus className="w-4 h-4" aria-hidden="true" />
                    <span>ثبت اولین وام</span>
                  </button>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-right border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-500">
                      <th className="py-3 px-4 whitespace-nowrap">کارمند</th>
                      <th className="py-3 px-4 whitespace-nowrap">عنوان وام</th>
                      <th className="py-3 px-4 whitespace-nowrap">مبلغ کل ({settings.currency})</th>
                      <th className="py-3 px-4 whitespace-nowrap">قسط ماهانه ({settings.currency})</th>
                      <th className="py-3 px-4 whitespace-nowrap">مانده بدهی ({settings.currency})</th>
                      <th className="py-3 px-4 whitespace-nowrap">شروع بازپرداخت</th>
                      <th className="py-3 px-4 whitespace-nowrap">وضعیت</th>
                      <th className="py-3 px-4 whitespace-nowrap text-left">عملیات</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 text-sm">
                    {loans.map((loan) => {
                      const emp = employeeMap.get(loan.employeeId);
                      const paidPercent =
                        loan.totalAmount > 0
                          ? Math.round(
                              ((loan.totalAmount - loan.remainingBalance) /
                                loan.totalAmount) *
                                100
                            )
                          : 100;
                      const statusMeta = LOAN_STATUS_META[loan.status];

                      return (
                        <tr key={loan.id} className="hover:bg-slate-50/70">
                          <td className="py-3 px-4 whitespace-nowrap">
                            <div className="font-medium text-slate-900">
                              {emp?.fullName ?? 'کارمند حذف‌شده'}
                            </div>
                            {emp && (
                              <div className="text-xs text-slate-400 font-mono-num tabular-nums">
                                کد {toPersianDigits(emp.personnelCode)}
                              </div>
                            )}
                          </td>
                          <td className="py-3 px-4 text-slate-800 whitespace-nowrap">
                            {loan.title}
                          </td>
                          <td className="py-3 px-4 font-mono-num tabular-nums text-slate-700 whitespace-nowrap">
                            {formatMoney(loan.totalAmount)}
                          </td>
                          <td className="py-3 px-4 font-mono-num tabular-nums font-medium text-slate-900 whitespace-nowrap">
                            {formatMoney(loan.monthlyInstallment)}
                          </td>
                          <td className="py-3 px-4 whitespace-nowrap">
                            <div className="font-mono-num tabular-nums font-semibold text-slate-900">
                              {formatMoney(loan.remainingBalance)}
                            </div>
                            <div className="w-28 h-1.5 bg-slate-100 rounded-full mt-1 overflow-hidden">
                              <div
                                className="h-full bg-teal-600"
                                style={{ width: `${Math.min(100, Math.max(0, paidPercent))}%` }}
                              />
                            </div>
                          </td>
                          <td className="py-3 px-4 text-xs text-slate-600 whitespace-nowrap">
                            {formatPeriodLabel(loan.startPeriod)}
                          </td>
                          <td className="py-3 px-4 whitespace-nowrap">
                            <span
                              className={`inline-flex items-center gap-1.5 text-xs font-medium ${statusMeta.className}`}
                            >
                              {loan.status === 'active' && (
                                <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                              )}
                              {loan.status === 'paused' && (
                                <PauseCircle className="w-3.5 h-3.5" aria-hidden="true" />
                              )}
                              {loan.status === 'settled' && (
                                <Wallet className="w-3.5 h-3.5" aria-hidden="true" />
                              )}
                              <span>{statusMeta.label}</span>
                            </span>
                          </td>
                          <td className="py-3 px-4 whitespace-nowrap text-left">
                            <div className="inline-flex items-center gap-1.5">
                              {loan.status !== 'settled' && (
                                <>
                                  <button
                                    type="button"
                                    disabled={!isAdmin}
                                    onClick={() => onRecordLoanInstallment(loan.id)}
                                    className="px-2.5 py-1 text-xs font-medium text-teal-800 bg-teal-50 hover:bg-teal-100 border border-teal-200 disabled:opacity-40 disabled:cursor-not-allowed rounded transition-colors"
                                  >
                                    ثبت پرداخت ۱ قسط
                                  </button>
                                  <button
                                    type="button"
                                    disabled={!isAdmin}
                                    onClick={() =>
                                      onUpdateLoanStatus(
                                        loan.id,
                                        loan.status === 'active' ? 'paused' : 'active'
                                      )
                                    }
                                    aria-label={
                                      loan.status === 'active'
                                        ? `توقف قسط ${loan.title}`
                                        : `ازسرگیری قسط ${loan.title}`
                                    }
                                    className="p-1.5 text-slate-500 hover:text-amber-700 hover:bg-amber-50 disabled:opacity-40 disabled:cursor-not-allowed rounded transition-colors"
                                  >
                                    {loan.status === 'active' ? (
                                      <PauseCircle className="w-4 h-4" aria-hidden="true" />
                                    ) : (
                                      <PlayCircle className="w-4 h-4" aria-hidden="true" />
                                    )}
                                  </button>
                                </>
                              )}
                              <button
                                type="button"
                                disabled={!isAdmin}
                                onClick={() => onDeleteLoan(loan.id)}
                                aria-label={`حذف وام ${loan.title}`}
                                className="p-1.5 text-slate-500 hover:text-rose-700 hover:bg-rose-50 disabled:opacity-40 disabled:cursor-not-allowed rounded transition-colors"
                              >
                                <Trash2 className="w-4 h-4" aria-hidden="true" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      ) : activeTab === 'settings' ? (
        /* Settings Tab */
        <fieldset disabled={!isAdmin} className="space-y-6 disabled:opacity-75">
          {/* General & Statutory Allowances */}
          <div className="bg-white border border-slate-200 rounded-lg p-6 space-y-5">
            <div>
              <h3 className="text-base font-semibold text-slate-900">
                پارامترهای عمومی و مزایای قانونی کار
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                مقادیر زیر پایه محاسبه حقوق، مزایای مستمر و نرخ ساعتی کلیه کارمندان در دوره‌های مالی است.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <label
                  htmlFor="set-company"
                  className="block text-xs font-medium text-slate-700 mb-1.5"
                >
                  نام سازمان / شرکت (جهت درج در فیش)
                </label>
                <input
                  id="set-company"
                  type="text"
                  value={settings.companyName}
                  onChange={(e) => updateSettingField('companyName', e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
                />
              </div>

              <div>
                <label
                  htmlFor="set-currency"
                  className="block text-xs font-medium text-slate-700 mb-1.5"
                >
                  واحد پولی نمایش و محاسبه
                </label>
                <select
                  id="set-currency"
                  value={settings.currency}
                  onChange={(e) =>
                    updateSettingField('currency', e.target.value as CurrencyUnit)
                  }
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
                >
                  <option value="تومان">تومان</option>
                  <option value="ریال">ریال</option>
                </select>
              </div>

              <div>
                <label
                  htmlFor="set-hours"
                  className="block text-xs font-medium text-slate-700 mb-1.5"
                >
                  ساعات موظفی ماهانه (مخرج مزد ساعتی)
                </label>
                <input
                  id="set-hours"
                  type="number"
                  min={1}
                  value={settings.standardMonthlyHours}
                  onChange={(e) =>
                    updateSettingField(
                      'standardMonthlyHours',
                      Math.max(1, Number(e.target.value) || 220)
                    )
                  }
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md font-mono-num tabular-nums focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
                />
              </div>

              <div>
                <label
                  htmlFor="set-housing"
                  className="block text-xs font-medium text-slate-700 mb-1.5"
                >
                  حق مسکن ماهانه ({settings.currency})
                </label>
                <input
                  id="set-housing"
                  type="number"
                  min={0}
                  step={50000}
                  value={settings.housingAllowance}
                  onChange={(e) =>
                    updateSettingField(
                      'housingAllowance',
                      Math.max(0, Number(e.target.value) || 0)
                    )
                  }
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md font-mono-num tabular-nums focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
                />
              </div>

              <div>
                <label
                  htmlFor="set-food"
                  className="block text-xs font-medium text-slate-700 mb-1.5"
                >
                  بن خواربار / کارگری ماهانه ({settings.currency})
                </label>
                <input
                  id="set-food"
                  type="number"
                  min={0}
                  step={50000}
                  value={settings.foodAllowance}
                  onChange={(e) =>
                    updateSettingField(
                      'foodAllowance',
                      Math.max(0, Number(e.target.value) || 0)
                    )
                  }
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md font-mono-num tabular-nums focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
                />
              </div>

              <div>
                <label
                  htmlFor="set-marital"
                  className="block text-xs font-medium text-slate-700 mb-1.5"
                >
                  حق تاهل ماهانه ({settings.currency})
                </label>
                <input
                  id="set-marital"
                  type="number"
                  min={0}
                  step={50000}
                  value={settings.maritalAllowance}
                  onChange={(e) =>
                    updateSettingField(
                      'maritalAllowance',
                      Math.max(0, Number(e.target.value) || 0)
                    )
                  }
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md font-mono-num tabular-nums focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
                />
              </div>

              <div>
                <label
                  htmlFor="set-child"
                  className="block text-xs font-medium text-slate-700 mb-1.5"
                >
                  حق اولاد به ازای هر فرزند ({settings.currency})
                </label>
                <input
                  id="set-child"
                  type="number"
                  min={0}
                  step={10000}
                  value={settings.childAllowancePerChild}
                  onChange={(e) =>
                    updateSettingField(
                      'childAllowancePerChild',
                      Math.max(0, Number(e.target.value) || 0)
                    )
                  }
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md font-mono-num tabular-nums focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
                />
              </div>
            </div>
          </div>

          {/* Dedicated Allowances for ماده ۲۸ and شرکتی سروش */}
          <div className="bg-white border border-slate-200 rounded-lg p-6 space-y-5">
            <div>
              <h3 className="text-base font-semibold text-slate-900">
                مزایای اختصاصی قراردادهای ماده ۲۸ و شرکتی سروش
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                مبالغ زیر به صورت مشخص برای کارمندان با نوع قرارداد «ماده ۲۸» و «شرکتی سروش» به عنوان حق مسکن، بن خواربار، حق عائله‌مندی، حق فرزند و سایر مزایای ثابت پرداخت می‌شود.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <label
                  htmlFor="set-special-housing"
                  className="block text-xs font-medium text-slate-700 mb-1.5"
                >
                  حق مسکن ماده ۲۸ و سروش ({settings.currency})
                </label>
                <input
                  id="set-special-housing"
                  type="number"
                  min={0}
                  step={50000}
                  value={specialAllowances.housingAllowance}
                  onChange={(e) =>
                    updateSpecialAllowanceField(
                      'housingAllowance',
                      Math.max(0, Number(e.target.value) || 0)
                    )
                  }
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md font-mono-num tabular-nums focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
                />
              </div>

              <div>
                <label
                  htmlFor="set-special-food"
                  className="block text-xs font-medium text-slate-700 mb-1.5"
                >
                  بن خواربار ماده ۲۸ و سروش ({settings.currency})
                </label>
                <input
                  id="set-special-food"
                  type="number"
                  min={0}
                  step={50000}
                  value={specialAllowances.foodAllowance}
                  onChange={(e) =>
                    updateSpecialAllowanceField(
                      'foodAllowance',
                      Math.max(0, Number(e.target.value) || 0)
                    )
                  }
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md font-mono-num tabular-nums focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
                />
              </div>

              <div>
                <label
                  htmlFor="set-special-marital"
                  className="block text-xs font-medium text-slate-700 mb-1.5"
                >
                  حق عائله‌مندی ماده ۲۸ و سروش ({settings.currency})
                </label>
                <input
                  id="set-special-marital"
                  type="number"
                  min={0}
                  step={50000}
                  value={specialAllowances.maritalAllowance}
                  onChange={(e) =>
                    updateSpecialAllowanceField(
                      'maritalAllowance',
                      Math.max(0, Number(e.target.value) || 0)
                    )
                  }
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md font-mono-num tabular-nums focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
                />
              </div>

              <div>
                <label
                  htmlFor="set-special-child"
                  className="block text-xs font-medium text-slate-700 mb-1.5"
                >
                  حق فرزند ماده ۲۸ و سروش ({settings.currency})
                </label>
                <input
                  id="set-special-child"
                  type="number"
                  min={0}
                  step={10000}
                  value={specialAllowances.childAllowance}
                  onChange={(e) =>
                    updateSpecialAllowanceField(
                      'childAllowance',
                      Math.max(0, Number(e.target.value) || 0)
                    )
                  }
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md font-mono-num tabular-nums focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
                />
              </div>

              <div>
                <label
                  htmlFor="set-special-other"
                  className="block text-xs font-medium text-slate-700 mb-1.5"
                >
                  سایر مزایای ثابت / فوق‌العاده ({settings.currency})
                </label>
                <input
                  id="set-special-other"
                  type="number"
                  min={0}
                  step={50000}
                  value={specialAllowances.otherFixedAllowance}
                  onChange={(e) =>
                    updateSpecialAllowanceField(
                      'otherFixedAllowance',
                      Math.max(0, Number(e.target.value) || 0)
                    )
                  }
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md font-mono-num tabular-nums focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
                />
              </div>
            </div>

            <label className="inline-flex items-center gap-2 text-xs text-slate-700 cursor-pointer pt-1">
              <input
                type="checkbox"
                checked={specialAllowances.alwaysIncludeMaritalAndChild}
                onChange={(e) =>
                  updateSpecialAllowanceField(
                    'alwaysIncludeMaritalAndChild',
                    e.target.checked
                  )
                }
                className="w-4 h-4 accent-teal-700 rounded"
              />
              <span>
                پرداخت حق عائله‌مندی و حداقل یک سهم حق فرزند به تمام کارمندان ماده ۲۸ و شرکتی سروش
              </span>
            </label>
          </div>

          {/* Multipliers & Insurance Rates */}
          <div className="bg-white border border-slate-200 rounded-lg p-6 space-y-5">
            <h3 className="text-base font-semibold text-slate-900">
              ضرایب اضافه‌کاری و نرخ بیمه تامین اجتماعی
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <label
                  htmlFor="set-ot-mult"
                  className="block text-xs font-medium text-slate-700 mb-1.5"
                >
                  ضریب اضافه‌کاری (پیش‌فرض ۱.۴)
                </label>
                <input
                  id="set-ot-mult"
                  type="number"
                  min={1}
                  step={0.05}
                  value={settings.overtimeMultiplier}
                  onChange={(e) =>
                    updateSettingField(
                      'overtimeMultiplier',
                      Math.max(0, Number(e.target.value) || 0)
                    )
                  }
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md font-mono-num tabular-nums focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
                />
              </div>

              <div>
                <label
                  htmlFor="set-hol-mult"
                  className="block text-xs font-medium text-slate-700 mb-1.5"
                >
                  ضریب تعطیل‌کاری / جمعه‌کاری
                </label>
                <input
                  id="set-hol-mult"
                  type="number"
                  min={0}
                  step={0.05}
                  value={settings.holidayMultiplier}
                  onChange={(e) =>
                    updateSettingField(
                      'holidayMultiplier',
                      Math.max(0, Number(e.target.value) || 0)
                    )
                  }
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md font-mono-num tabular-nums focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
                />
              </div>

              <div>
                <label
                  htmlFor="set-night-mult"
                  className="block text-xs font-medium text-slate-700 mb-1.5"
                >
                  ضریب شب‌کاری (فوق‌العاده ۳۵٪ = ۰.۳۵)
                </label>
                <input
                  id="set-night-mult"
                  type="number"
                  min={0}
                  step={0.05}
                  value={settings.nightShiftMultiplier}
                  onChange={(e) =>
                    updateSettingField(
                      'nightShiftMultiplier',
                      Math.max(0, Number(e.target.value) || 0)
                    )
                  }
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md font-mono-num tabular-nums focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
                />
              </div>

              <div>
                <label
                  htmlFor="set-emp-ins"
                  className="block text-xs font-medium text-slate-700 mb-1.5"
                >
                  نرخ بیمه سهم کارگر (٪)
                </label>
                <input
                  id="set-emp-ins"
                  type="number"
                  min={0}
                  max={50}
                  step={0.5}
                  value={settings.employeeInsuranceRate}
                  onChange={(e) =>
                    updateSettingField(
                      'employeeInsuranceRate',
                      Math.max(0, Number(e.target.value) || 0)
                    )
                  }
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md font-mono-num tabular-nums focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
                />
              </div>

              <div>
                <label
                  htmlFor="set-er-ins"
                  className="block text-xs font-medium text-slate-700 mb-1.5"
                >
                  نرخ بیمه سهم کارفرما (٪)
                </label>
                <input
                  id="set-er-ins"
                  type="number"
                  min={0}
                  max={50}
                  step={0.5}
                  value={settings.employerInsuranceRate}
                  onChange={(e) =>
                    updateSettingField(
                      'employerInsuranceRate',
                      Math.max(0, Number(e.target.value) || 0)
                    )
                  }
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md font-mono-num tabular-nums focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
                />
              </div>

              <div>
                <label
                  htmlFor="set-ins-ceil"
                  className="block text-xs font-medium text-slate-700 mb-1.5"
                >
                  سقف حقوق مشمول بیمه ({settings.currency} · ۰ = بدون سقف)
                </label>
                <input
                  id="set-ins-ceil"
                  type="number"
                  min={0}
                  step={1000000}
                  value={settings.insuranceSalaryCeiling}
                  onChange={(e) =>
                    updateSettingField(
                      'insuranceSalaryCeiling',
                      Math.max(0, Number(e.target.value) || 0)
                    )
                  }
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md font-mono-num tabular-nums focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
                />
              </div>
            </div>
          </div>

          {/* Progressive Tax Brackets */}
          <div className="bg-white border border-slate-200 rounded-lg p-6 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-slate-900">
                  جدول پلکانی مالیات بر درآمد حقوق (ماهانه)
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  مالیات هر کارمند به صورت پلکانی بر اساس درآمد مشمول مالیات محاسبه می‌شود.
                </p>
              </div>
              <button
                type="button"
                onClick={addBracket}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-teal-800 bg-teal-50 border border-teal-200 hover:bg-teal-100 rounded-md transition-colors whitespace-nowrap shrink-0"
              >
                <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                <span>افزودن پله</span>
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-right border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-500">
                    <th className="py-2.5 px-3">از مبلغ ({settings.currency})</th>
                    <th className="py-2.5 px-3">تا مبلغ ({settings.currency} · خالی = بی‌نهایت)</th>
                    <th className="py-2.5 px-3">نرخ مالیات (٪)</th>
                    <th className="py-2.5 px-3 text-left">حذف</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-sm">
                  {settings.taxBrackets.map((bracket, idx) => (
                    <tr key={bracket.id}>
                      <td className="py-2.5 px-3">
                        <input
                          type="number"
                          min={0}
                          step={500000}
                          aria-label={`حداقل درآمد پله ${idx + 1}`}
                          value={bracket.minMonthly}
                          onChange={(e) =>
                            updateBracket(bracket.id, {
                              minMonthly: Math.max(0, Number(e.target.value) || 0),
                            })
                          }
                          className="w-40 px-2.5 py-1.5 text-sm border border-slate-200 rounded font-mono-num tabular-nums focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
                        />
                      </td>
                      <td className="py-2.5 px-3">
                        <input
                          type="number"
                          min={0}
                          step={500000}
                          aria-label={`حداکثر درآمد پله ${idx + 1}`}
                          value={bracket.maxMonthly ?? ''}
                          placeholder="مازاد بر سقف"
                          onChange={(e) =>
                            updateBracket(bracket.id, {
                              maxMonthly:
                                e.target.value === ''
                                  ? null
                                  : Math.max(0, Number(e.target.value) || 0),
                            })
                          }
                          className="w-40 px-2.5 py-1.5 text-sm border border-slate-200 rounded font-mono-num tabular-nums focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
                        />
                      </td>
                      <td className="py-2.5 px-3">
                        <input
                          type="number"
                          min={0}
                          max={100}
                          step={1}
                          aria-label={`درصد مالیات پله ${idx + 1}`}
                          value={bracket.ratePercent}
                          onChange={(e) =>
                            updateBracket(bracket.id, {
                              ratePercent: Math.max(0, Math.min(100, Number(e.target.value) || 0)),
                            })
                          }
                          className="w-24 px-2.5 py-1.5 text-sm border border-slate-200 rounded font-mono-num tabular-nums focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
                        />
                      </td>
                      <td className="py-2.5 px-3 text-left">
                        <button
                          type="button"
                          disabled={settings.taxBrackets.length <= 1}
                          onClick={() => removeBracket(bracket.id)}
                          aria-label={`حذف پله ${idx + 1}`}
                          className="p-1.5 text-slate-400 hover:text-rose-700 disabled:opacity-30 rounded transition-colors"
                        >
                          <Trash2 className="w-4 h-4" aria-hidden="true" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </fieldset>
      ) : (
        /* Users & Access Control Tab */
        <div className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white border border-slate-200 rounded-lg px-5 py-4">
              <p className="text-xs text-slate-500 font-medium">تعداد کل کاربران سیستم</p>
              <p className="mt-1.5 text-2xl font-semibold text-slate-900 font-mono-num tabular-nums">
                {toPersianDigits(users.length)}{' '}
                <span className="text-xs font-normal text-slate-500">
                  ({toPersianDigits(users.filter((u) => u.isActive).length)} فعال)
                </span>
              </p>
            </div>
            <div className="bg-white border border-slate-200 rounded-lg px-5 py-4">
              <p className="text-xs text-slate-500 font-medium">ادمین‌های سیستم</p>
              <p className="mt-1.5 text-2xl font-semibold text-teal-800 font-mono-num tabular-nums">
                {toPersianDigits(activeAdminCount)}{' '}
                <span className="text-xs font-normal text-slate-500">دسترسی کامل</span>
              </p>
            </div>
            <div className="bg-white border border-slate-200 rounded-lg px-5 py-4">
              <p className="text-xs text-slate-500 font-medium">کاربران عادی (نفر دوم)</p>
              <p className="mt-1.5 text-2xl font-semibold text-slate-900 font-mono-num tabular-nums">
                {toPersianDigits(users.filter((u) => u.role === 'viewer').length)}{' '}
                <span className="text-xs font-normal text-slate-500">فقط مشاهده</span>
              </p>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 bg-slate-50/70">
              <h3 className="text-sm font-semibold text-slate-900">
                فهرست کاربران و سطوح دسترسی سامانه
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                فقط ادمین سیستم مجاز به اعمال تغییر در اطلاعات پرسنل، حقوق، وام‌ها و تعریف کاربر جدید است. کاربران عادی فقط امکان مشاهده و دریافت گزارش را دارند.
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-right border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-500">
                    <th className="py-3 px-4 whitespace-nowrap">نام و نام خانوادگی</th>
                    <th className="py-3 px-4 whitespace-nowrap">نام کاربری</th>
                    <th className="py-3 px-4 whitespace-nowrap">نقش و سطح دسترسی</th>
                    <th className="py-3 px-4 whitespace-nowrap">وضعیت</th>
                    <th className="py-3 px-4 whitespace-nowrap">تاریخ ایجاد</th>
                    <th className="py-3 px-4 whitespace-nowrap text-left">عملیات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-sm">
                  {users.map((u) => {
                    const isSelf = u.id === currentUserId;
                    const isLastActiveAdmin =
                      u.isActive && u.role === 'admin' && activeAdminCount <= 1;

                    return (
                      <tr key={u.id} className="hover:bg-slate-50/70">
                        <td className="py-3 px-4 whitespace-nowrap">
                          <div className="font-semibold text-slate-900">
                            {u.fullName}
                            {isSelf && (
                              <span className="mr-2 text-[11px] font-medium text-teal-700">
                                (حساب فعلی)
                              </span>
                            )}
                          </div>
                        </td>
                        <td
                          className="py-3 px-4 font-mono-num text-xs text-slate-700 whitespace-nowrap"
                          dir="ltr"
                        >
                          {u.username}
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          <span
                            className={`inline-flex items-center gap-1.5 text-xs font-medium ${
                              u.role === 'admin' ? 'text-teal-800' : 'text-slate-600'
                            }`}
                          >
                            <Shield className="w-3.5 h-3.5" aria-hidden="true" />
                            <span>{USER_ROLE_LABELS[u.role]}</span>
                          </span>
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          <button
                            type="button"
                            disabled={!isAdmin || isSelf || isLastActiveAdmin}
                            onClick={() =>
                              onUpdateUser({ ...u, isActive: !u.isActive })
                            }
                            className={`inline-flex items-center gap-1 text-xs font-medium disabled:opacity-60 disabled:cursor-not-allowed ${
                              u.isActive ? 'text-emerald-700' : 'text-slate-500'
                            }`}
                          >
                            {u.isActive ? (
                              <UserCheck className="w-3.5 h-3.5" aria-hidden="true" />
                            ) : (
                              <UserX className="w-3.5 h-3.5" aria-hidden="true" />
                            )}
                            <span>{u.isActive ? 'فعال' : 'غیرفعال'}</span>
                          </button>
                        </td>
                        <td className="py-3 px-4 font-mono-num tabular-nums text-xs text-slate-500 whitespace-nowrap">
                          {toPersianDigits(u.createdAt)}
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap text-left">
                          <div className="inline-flex items-center gap-2">
                            <select
                              aria-label={`تغییر نقش ${u.fullName}`}
                              disabled={!isAdmin || isSelf || isLastActiveAdmin}
                              value={u.role}
                              onChange={(e) =>
                                onUpdateUser({
                                  ...u,
                                  role: e.target.value as UserRole,
                                })
                              }
                              className="px-2.5 py-1 text-xs border border-slate-200 rounded bg-white disabled:bg-slate-50 disabled:text-slate-400"
                            >
                              <option value="admin">ادمین سیستم</option>
                              <option value="viewer">کاربر عادی (فقط مشاهده)</option>
                            </select>

                            <button
                              type="button"
                              disabled={!isAdmin || isSelf || isLastActiveAdmin}
                              onClick={() => onDeleteUser(u.id)}
                              aria-label={`حذف کاربر ${u.fullName}`}
                              className="p-1.5 text-slate-500 hover:text-rose-700 hover:bg-rose-50 disabled:opacity-30 disabled:cursor-not-allowed rounded transition-colors"
                            >
                              <Trash2 className="w-4 h-4" aria-hidden="true" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Add Loan Modal */}
      {isLoanModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="loan-modal-title"
        >
          <div className="bg-white border border-slate-200 rounded-lg w-full max-w-lg shadow-lg">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <h2
                id="loan-modal-title"
                className="text-base font-semibold text-slate-900"
              >
                ثبت وام جدید برای کارمند
              </h2>
              <button
                type="button"
                onClick={() => setIsLoanModalOpen(false)}
                aria-label="بستن پنجره وام"
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded transition-colors"
              >
                <X className="w-5 h-5" aria-hidden="true" />
              </button>
            </div>

            <form onSubmit={handleLoanSubmit} className="p-6 space-y-4" noValidate>
              <div>
                <label
                  htmlFor="loan-emp"
                  className="block text-xs font-medium text-slate-700 mb-1.5"
                >
                  کارمند *
                </label>
                <select
                  id="loan-emp"
                  value={loanForm.employeeId}
                  onChange={(e) =>
                    setLoanForm((f) => ({ ...f, employeeId: e.target.value }))
                  }
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
                >
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.fullName} ({toPersianDigits(emp.personnelCode)})
                    </option>
                  ))}
                </select>
                {loanErrors.employeeId && (
                  <p className="mt-1 text-xs text-rose-600">{loanErrors.employeeId}</p>
                )}
              </div>

              <div>
                <label
                  htmlFor="loan-title"
                  className="block text-xs font-medium text-slate-700 mb-1.5"
                >
                  عنوان وام *
                </label>
                <input
                  id="loan-title"
                  type="text"
                  value={loanForm.title}
                  onChange={(e) =>
                    setLoanForm((f) => ({ ...f, title: e.target.value }))
                  }
                  placeholder="مثلاً وام ودیعه مسکن"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
                />
                {loanErrors.title && (
                  <p className="mt-1 text-xs text-rose-600">{loanErrors.title}</p>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label
                    htmlFor="loan-total"
                    className="block text-xs font-medium text-slate-700 mb-1.5"
                  >
                    مبلغ کل وام ({settings.currency}) *
                  </label>
                  <input
                    id="loan-total"
                    type="number"
                    min={0}
                    step={500000}
                    value={loanForm.totalAmount}
                    onChange={(e) => {
                      const val = Math.max(0, Number(e.target.value) || 0);
                      setLoanForm((f) => ({
                        ...f,
                        totalAmount: val,
                        remainingBalance: val,
                      }));
                    }}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md font-mono-num tabular-nums focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
                  />
                  {loanErrors.totalAmount && (
                    <p className="mt-1 text-xs text-rose-600">{loanErrors.totalAmount}</p>
                  )}
                </div>

                <div>
                  <label
                    htmlFor="loan-installment"
                    className="block text-xs font-medium text-slate-700 mb-1.5"
                  >
                    مبلغ قسط ماهانه ({settings.currency}) *
                  </label>
                  <input
                    id="loan-installment"
                    type="number"
                    min={0}
                    step={100000}
                    value={loanForm.monthlyInstallment}
                    onChange={(e) =>
                      setLoanForm((f) => ({
                        ...f,
                        monthlyInstallment: Math.max(0, Number(e.target.value) || 0),
                      }))
                    }
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md font-mono-num tabular-nums focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
                  />
                  {loanErrors.monthlyInstallment && (
                    <p className="mt-1 text-xs text-rose-600">
                      {loanErrors.monthlyInstallment}
                    </p>
                  )}
                </div>

                <div>
                  <label
                    htmlFor="loan-remaining"
                    className="block text-xs font-medium text-slate-700 mb-1.5"
                  >
                    مانده فعلی ({settings.currency})
                  </label>
                  <input
                    id="loan-remaining"
                    type="number"
                    min={0}
                    step={100000}
                    value={loanForm.remainingBalance}
                    onChange={(e) =>
                      setLoanForm((f) => ({
                        ...f,
                        remainingBalance: Math.max(0, Number(e.target.value) || 0),
                      }))
                    }
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md font-mono-num tabular-nums focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
                  />
                  {loanErrors.remainingBalance && (
                    <p className="mt-1 text-xs text-rose-600">
                      {loanErrors.remainingBalance}
                    </p>
                  )}
                </div>

                <div>
                  <label
                    htmlFor="loan-start"
                    className="block text-xs font-medium text-slate-700 mb-1.5"
                  >
                    دوره شروع کسر از حقوق
                  </label>
                  <input
                    id="loan-start"
                    type="text"
                    value={loanForm.startPeriod}
                    onChange={(e) =>
                      setLoanForm((f) => ({ ...f, startPeriod: e.target.value }))
                    }
                    placeholder="1405-08"
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md font-mono-num tabular-nums focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsLoanModalOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-md transition-colors"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-sm font-medium text-white bg-teal-700 hover:bg-teal-800 rounded-md transition-colors"
                >
                  ثبت وام
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add System User Modal */}
      {isUserModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="user-modal-title"
        >
          <div className="bg-white border border-slate-200 rounded-lg w-full max-w-md shadow-lg">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <h2
                id="user-modal-title"
                className="text-base font-semibold text-slate-900"
              >
                تعریف کاربر جدید در سامانه
              </h2>
              <button
                type="button"
                onClick={() => setIsUserModalOpen(false)}
                aria-label="بستن پنجره کاربر"
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded transition-colors"
              >
                <X className="w-5 h-5" aria-hidden="true" />
              </button>
            </div>

            <form onSubmit={handleUserSubmit} className="p-6 space-y-4" noValidate>
              <div>
                <label
                  htmlFor="new-user-fullname"
                  className="block text-xs font-medium text-slate-700 mb-1.5"
                >
                  نام و نام خانوادگی *
                </label>
                <input
                  id="new-user-fullname"
                  type="text"
                  value={userForm.fullName}
                  onChange={(e) =>
                    setUserForm((f) => ({ ...f, fullName: e.target.value }))
                  }
                  placeholder="مثلاً سارا احمدی (کاربر دوم)"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
                />
                {userErrors.fullName && (
                  <p className="mt-1 text-xs text-rose-600">{userErrors.fullName}</p>
                )}
              </div>

              <div>
                <label
                  htmlFor="new-user-username"
                  className="block text-xs font-medium text-slate-700 mb-1.5"
                >
                  نام کاربری (انگلیسی) *
                </label>
                <input
                  id="new-user-username"
                  type="text"
                  dir="ltr"
                  value={userForm.username}
                  onChange={(e) =>
                    setUserForm((f) => ({ ...f, username: e.target.value }))
                  }
                  placeholder="sara.user"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md font-mono-num text-left focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
                />
                {userErrors.username && (
                  <p className="mt-1 text-xs text-rose-600">{userErrors.username}</p>
                )}
              </div>

              <div>
                <label
                  htmlFor="new-user-password"
                  className="block text-xs font-medium text-slate-700 mb-1.5"
                >
                  رمز عبور (حداقل ۴ کاراکتر) *
                </label>
                <input
                  id="new-user-password"
                  type="password"
                  dir="ltr"
                  value={userForm.password}
                  onChange={(e) =>
                    setUserForm((f) => ({ ...f, password: e.target.value }))
                  }
                  placeholder="1234"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md font-mono-num text-left focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
                />
                {userErrors.password && (
                  <p className="mt-1 text-xs text-rose-600">{userErrors.password}</p>
                )}
              </div>

              <div>
                <label
                  htmlFor="new-user-role"
                  className="block text-xs font-medium text-slate-700 mb-1.5"
                >
                  نقش و سطح دسترسی
                </label>
                <select
                  id="new-user-role"
                  value={userForm.role}
                  onChange={(e) =>
                    setUserForm((f) => ({ ...f, role: e.target.value as UserRole }))
                  }
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
                >
                  <option value="viewer">کاربر عادی / نفر دوم (فقط مشاهده)</option>
                  <option value="admin">ادمین سیستم (دسترسی کامل به تغییرات)</option>
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsUserModalOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-md transition-colors"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-sm font-medium text-white bg-teal-700 hover:bg-teal-800 rounded-md transition-colors"
                >
                  ثبت کاربر
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
