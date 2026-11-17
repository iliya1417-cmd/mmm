import React, { useEffect, useMemo, useState } from 'react';
import {
  Banknote,
  BarChart3,
  ClipboardEdit,
  Lock,
  LogOut,
  Menu,
  RotateCcw,
  Settings2,
  Shield,
  UserCog,
  Users,
  X,
} from 'lucide-react';
import type {
  AppState,
  Employee,
  Loan,
  LoanStatus,
  ManualSalaryPayment,
  MonthlyTimesheet,
  PageId,
  ParametricReportTemplate,
  PayrollSettings,
  SystemUser,
} from './types/payroll';
import {
  JALALI_MONTHS,
  applyMultiTierManualSalaryUpdates,
  calculatePayrollReport,
  createEmptyTimesheet,
  formatPeriodKey,
  getMonthFromPeriodKey,
  getPeriodDays,
  isAdminUser,
  toPersianDigits,
} from './utils/payroll';
import { loadAppState, resetAppStateToSeed, saveAppState } from './utils/storage';
import { EmployeesPage } from './components/EmployeesPage';
import {
  PayrollDataPage,
  type PayrollDataTab,
} from './components/PayrollDataPage';
import {
  LoansSettingsPage,
  type LoansSettingsTab,
} from './components/LoansSettingsPage';
import { ReportsPage } from './components/ReportsPage';
import { AuthPanel } from './components/AuthModal';

interface NavItem {
  id: PageId;
  step: string;
  label: string;
  subtitle: string;
  icon: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;
}

const NAV_ITEMS: NavItem[] = [
  {
    id: 'employees',
    step: '۱',
    label: 'مشخصات کارمندان',
    subtitle: 'پرونده پرسنلی و حقوق پایه',
    icon: Users,
  },
  {
    id: 'payroll-data',
    step: '۲',
    label: 'مقدار اطلاعات',
    subtitle: 'کارکرد، اضافه‌کاری و مساعده',
    icon: ClipboardEdit,
  },
  {
    id: 'loans-settings',
    step: '۳',
    label: 'وام و تنظیمات',
    subtitle: 'مدیریت اقساط، بیمه و مالیات',
    icon: Settings2,
  },
  {
    id: 'reports',
    step: '۴',
    label: 'گزارش‌دهی',
    subtitle: 'لیست حقوق، فیش و خروجی',
    icon: BarChart3,
  },
];

const AVAILABLE_YEARS = [1403, 1404, 1405, 1406];

export default function App() {
  const [appState, setAppState] = useState<AppState>(() => loadAppState());
  const [activePage, setActivePage] = useState<PageId>('employees');
  const [payrollDataTab, setPayrollDataTab] = useState<PayrollDataTab | null>(
    null
  );
  const [loansSettingsTab, setLoansSettingsTab] = useState<LoansSettingsTab | null>(
    null
  );
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);

  useEffect(() => {
    saveAppState(appState);
  }, [appState]);

  const currentUser = useMemo(
    () =>
      appState.currentUserId
        ? appState.users.find(
            (u) => u.id === appState.currentUserId && u.isActive
          ) ?? null
        : null,
    [appState.currentUserId, appState.users]
  );

  const isAdmin = isAdminUser(currentUser);

  const periodKey = formatPeriodKey(appState.selectedPeriod);

  const report = useMemo(
    () =>
      calculatePayrollReport(
        appState.employees,
        appState.timesheets,
        appState.loans,
        appState.settings,
        periodKey,
        false,
        appState.manualPayments ?? []
      ),
    [
      appState.employees,
      appState.timesheets,
      appState.loans,
      appState.settings,
      appState.manualPayments,
      periodKey,
    ]
  );

  const handleAddEmployee = (empData: Omit<Employee, 'id'>) => {
    if (!isAdmin) return;
    const newEmployee: Employee = {
      ...empData,
      id: `emp-${Date.now()}`,
    };
    setAppState((prev) => ({
      ...prev,
      employees: [...prev.employees, newEmployee],
    }));
  };

  const handleUpdateEmployee = (updated: Employee) => {
    if (!isAdmin) return;
    setAppState((prev) => ({
      ...prev,
      employees: prev.employees.map((e) => (e.id === updated.id ? updated : e)),
    }));
  };

  const handleBatchUpdateSalaries = (
    salaryDrafts: Record<string, ReadonlyArray<string | number>>
  ) => {
    if (!isAdmin) return;
    setAppState((prev) => ({
      ...prev,
      employees: applyMultiTierManualSalaryUpdates(prev.employees, salaryDrafts),
    }));
  };

  const handleDeleteEmployee = (id: string) => {
    if (!isAdmin) return;
    setAppState((prev) => ({
      ...prev,
      employees: prev.employees.filter((e) => e.id !== id),
      timesheets: prev.timesheets.filter((t) => t.employeeId !== id),
      loans: prev.loans.filter((l) => l.employeeId !== id),
      manualPayments: (prev.manualPayments ?? []).filter(
        (p) => p.employeeId !== id
      ),
    }));
  };

  const handleAddManualPayment = (
    paymentData: Omit<ManualSalaryPayment, 'id' | 'createdAt'>
  ) => {
    if (!isAdmin) return;
    const newPayment: ManualSalaryPayment = {
      ...paymentData,
      id: `mpay-${Date.now()}`,
      createdAt: `${toPersianDigits(appState.selectedPeriod.year)}/${toPersianDigits(
        String(appState.selectedPeriod.month).padStart(2, '0')
      )}/01`,
    };
    setAppState((prev) => ({
      ...prev,
      manualPayments: [...(prev.manualPayments ?? []), newPayment],
    }));
  };

  const handleDeleteManualPayment = (paymentId: string) => {
    if (!isAdmin) return;
    setAppState((prev) => ({
      ...prev,
      manualPayments: (prev.manualPayments ?? []).filter((p) => p.id !== paymentId),
    }));
  };

  const handleToggleEmployeeActive = (id: string) => {
    if (!isAdmin) return;
    setAppState((prev) => ({
      ...prev,
      employees: prev.employees.map((e) =>
        e.id === id ? { ...e, isActive: !e.isActive } : e
      ),
    }));
  };

  const handleUpsertTimesheet = (timesheet: MonthlyTimesheet) => {
    if (!isAdmin) return;
    setAppState((prev) => {
      const exists = prev.timesheets.some((t) => t.id === timesheet.id);
      return {
        ...prev,
        timesheets: exists
          ? prev.timesheets.map((t) => (t.id === timesheet.id ? timesheet : t))
          : [...prev.timesheets, timesheet],
      };
    });
  };

  const handleFillStandardMonth = () => {
    if (!isAdmin) return;
    const standardDays = getPeriodDays(getMonthFromPeriodKey(periodKey));
    setAppState((prev) => {
      const nextTimesheets = [...prev.timesheets];
      for (const emp of prev.employees) {
        if (!emp.isActive) continue;
        const tsId = `${emp.id}__${periodKey}`;
        const idx = nextTimesheets.findIndex((t) => t.id === tsId);
        if (idx >= 0) {
          nextTimesheets[idx] = {
            ...nextTimesheets[idx],
            workingDays: standardDays,
            absentDays: 0,
          };
        } else {
          nextTimesheets.push({
            ...createEmptyTimesheet(emp.id, periodKey),
            workingDays: standardDays,
          });
        }
      }
      return {
        ...prev,
        timesheets: nextTimesheets,
      };
    });
  };

  const handleAddLoan = (loanData: Omit<Loan, 'id' | 'createdAt'>) => {
    if (!isAdmin) return;
    const newLoan: Loan = {
      ...loanData,
      id: `loan-${Date.now()}`,
      createdAt: `${toPersianDigits(appState.selectedPeriod.year)}/${toPersianDigits(
        String(appState.selectedPeriod.month).padStart(2, '0')
      )}/01`,
    };
    setAppState((prev) => ({
      ...prev,
      loans: [...prev.loans, newLoan],
    }));
  };

  const handleUpdateLoanStatus = (loanId: string, status: LoanStatus) => {
    if (!isAdmin) return;
    setAppState((prev) => ({
      ...prev,
      loans: prev.loans.map((l) => (l.id === loanId ? { ...l, status } : l)),
    }));
  };

  const handleRecordLoanInstallment = (loanId: string) => {
    if (!isAdmin) return;
    setAppState((prev) => ({
      ...prev,
      loans: prev.loans.map((l) => {
        if (l.id !== loanId || l.status === 'settled') return l;
        const nextBalance = Math.max(0, l.remainingBalance - l.monthlyInstallment);
        return {
          ...l,
          remainingBalance: nextBalance,
          status: nextBalance === 0 ? 'settled' : l.status,
        };
      }),
    }));
  };

  const handleDeleteLoan = (loanId: string) => {
    if (!isAdmin) return;
    setAppState((prev) => ({
      ...prev,
      loans: prev.loans.filter((l) => l.id !== loanId),
    }));
  };

  const handleUpdateSettings = (settings: PayrollSettings) => {
    if (!isAdmin) return;
    setAppState((prev) => ({
      ...prev,
      settings,
    }));
  };

  const handleAddUser = (userData: Omit<SystemUser, 'id' | 'createdAt'>) => {
    if (!isAdmin) return;
    const newUser: SystemUser = {
      ...userData,
      id: `user-${Date.now()}`,
      createdAt: `${appState.selectedPeriod.year}/${String(
        appState.selectedPeriod.month
      ).padStart(2, '0')}/01`,
    };
    setAppState((prev) => ({
      ...prev,
      users: [...prev.users, newUser],
    }));
  };

  const handleUpdateUser = (updatedUser: SystemUser) => {
    if (!isAdmin) return;
    setAppState((prev) => ({
      ...prev,
      users: prev.users.map((u) => (u.id === updatedUser.id ? updatedUser : u)),
    }));
  };

  const handleDeleteUser = (userId: string) => {
    if (!isAdmin || userId === appState.currentUserId) return;
    setAppState((prev) => ({
      ...prev,
      users: prev.users.filter((u) => u.id !== userId),
    }));
  };

  const handleLogin = (user: SystemUser) => {
    setAppState((prev) => ({
      ...prev,
      currentUserId: user.id,
    }));
    setIsAuthModalOpen(false);
  };

  const handleLogout = () => {
    setAppState((prev) => ({
      ...prev,
      currentUserId: null,
    }));
    setActivePage('employees');
    setPayrollDataTab(null);
    setLoansSettingsTab(null);
    setMobileMenuOpen(false);
  };

  const handleResetDemoData = () => {
    if (!isAdmin) return;
    const fresh = resetAppStateToSeed();
    setAppState(fresh);
  };

  const currentNav = NAV_ITEMS.find((n) => n.id === activePage) ?? NAV_ITEMS[0];

  const selectPage = (pageId: PageId) => {
    if (pageId !== 'loans-settings') {
      setLoansSettingsTab(null);
    }
    if (pageId !== 'payroll-data') {
      setPayrollDataTab(null);
    }
    setActivePage(pageId);
    setMobileMenuOpen(false);
  };

  const openManualSalarySection = () => {
    setPayrollDataTab('manual-salary');
    setActivePage('payroll-data');
    setMobileMenuOpen(false);
  };

  const openUsersManagement = () => {
    setLoansSettingsTab('users');
    setActivePage('loans-settings');
    setMobileMenuOpen(false);
  };

  if (!currentUser) {
    return (
      <AuthPanel
        mode="page"
        companyName={appState.settings.companyName}
        users={appState.users}
        currentUser={null}
        onLogin={handleLogin}
      />
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col lg:flex-row">
      {/* Desktop Sidebar */}
      <aside
        className="hidden lg:flex lg:flex-col lg:w-64 lg:shrink-0 bg-white border-l border-slate-200 min-h-screen no-print"
        aria-label="منوی اصلی سامانه"
      >
        <div className="px-5 py-5 border-b border-slate-200">
          <div className="text-base font-bold text-slate-900 tracking-tight whitespace-nowrap">
            دفتر حقوق و دستمزد
          </div>
          <div className="mt-1 text-xs text-slate-500 truncate">
            {appState.settings.companyName}
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-1">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activePage === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => selectPage(item.id)}
                aria-current={isActive ? 'page' : undefined}
                className={`w-full flex items-start gap-3 px-3.5 py-3 rounded-md text-right ${
                  isActive
                    ? 'bg-teal-50 text-teal-900 border border-teal-200'
                    : 'text-slate-700 hover:bg-slate-100/80 border border-transparent transition-colors duration-75'
                }`}
              >
                <Icon
                  className={`w-4 h-4 mt-0.5 shrink-0 ${
                    isActive ? 'text-teal-700' : 'text-slate-400'
                  }`}
                  aria-hidden={true}
                />
                <div className="min-w-0">
                  <div className="text-sm font-semibold whitespace-nowrap">
                    {item.step}. {item.label}
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5 truncate">
                    {item.subtitle}
                  </div>
                </div>
              </button>
            );
          })}

          <div className="pt-2 mt-2 border-t border-slate-200">
            <button
              type="button"
              onClick={openManualSalarySection}
              className={`w-full flex items-start gap-3 px-3.5 py-3 rounded-md text-right transition-colors ${
                activePage === 'payroll-data' && payrollDataTab === 'manual-salary'
                  ? 'bg-teal-700 text-white'
                  : 'text-teal-900 bg-teal-50/70 hover:bg-teal-100/80 border border-teal-200'
              }`}
            >
              <Banknote
                className={`w-4 h-4 mt-0.5 shrink-0 ${
                  activePage === 'payroll-data' && payrollDataTab === 'manual-salary'
                    ? 'text-white'
                    : 'text-teal-700'
                }`}
                aria-hidden={true}
              />
              <div className="min-w-0">
                <div className="text-sm font-semibold whitespace-nowrap">
                  پرداخت حقوق دستی
                </div>
                <div
                  className={`text-xs mt-0.5 truncate ${
                    activePage === 'payroll-data' && payrollDataTab === 'manual-salary'
                      ? 'text-teal-100'
                      : 'text-teal-700/80'
                  }`}
                >
                  ثبت و پرداخت مستقیم حقوق
                </div>
              </div>
            </button>
          </div>
        </nav>

        <div className="p-4 border-t border-slate-200 space-y-3">
          {/* Active User & Role Card */}
          <div className="bg-slate-50 border border-slate-200 rounded-md p-3 space-y-2.5">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="text-xs font-bold text-slate-900 truncate">
                  {currentUser.fullName}
                </div>
                <div
                  className={`mt-0.5 inline-flex items-center gap-1 text-[11px] font-medium ${
                    isAdmin ? 'text-teal-800' : 'text-amber-700'
                  }`}
                >
                  <Shield className="w-3 h-3 shrink-0" aria-hidden="true" />
                  <span>{isAdmin ? 'ادمین سیستم' : 'کاربر عادی (فقط مشاهده)'}</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setIsAuthModalOpen(true)}
                className="flex-1 inline-flex items-center justify-center gap-1 px-2 py-1.5 text-[11px] font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-100 rounded transition-colors"
              >
                <UserCog className="w-3.5 h-3.5" aria-hidden="true" />
                <span>تغییر کاربر</span>
              </button>
              <button
                type="button"
                onClick={handleLogout}
                aria-label="خروج از حساب کاربری"
                className="inline-flex items-center justify-center gap-1 px-2 py-1.5 text-[11px] font-medium text-rose-700 bg-white border border-slate-200 hover:bg-rose-50 rounded transition-colors"
              >
                <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
                <span>خروج</span>
              </button>
            </div>

            {isAdmin && (
              <button
                type="button"
                onClick={openUsersManagement}
                className="w-full text-[11px] font-medium text-teal-800 hover:text-teal-950 text-right pt-1 border-t border-slate-200"
              >
                تعریف و مدیریت کاربران ({toPersianDigits(appState.users.length)} کاربر)
              </button>
            )}
          </div>

          {isAdmin && (
            <button
              type="button"
              onClick={handleResetDemoData}
              className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-md transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
              <span>بازنشانی داده‌های نمونه</span>
            </button>
          )}
        </div>
      </aside>

      {/* Mobile Drawer Overlay */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex no-print">
          <div
            className="fixed inset-0 bg-slate-900/40"
            onClick={() => setMobileMenuOpen(false)}
            aria-hidden="true"
          />
          <aside className="relative w-72 max-w-[85vw] bg-white border-l border-slate-200 h-full flex flex-col z-10">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <span className="text-base font-bold text-slate-900">
                دفتر حقوق و دستمزد
              </span>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                aria-label="بستن منو"
                className="p-1.5 text-slate-500 hover:text-slate-800 rounded"
              >
                <X className="w-5 h-5" aria-hidden="true" />
              </button>
            </div>
            <nav className="flex-1 p-3 space-y-1">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const isActive = activePage === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => selectPage(item.id)}
                    className={`w-full flex items-center gap-3 px-3.5 py-3 rounded-md text-right transition-colors ${
                      isActive
                        ? 'bg-teal-50 text-teal-900 border border-teal-200'
                        : 'text-slate-700 hover:bg-slate-100 border border-transparent'
                    }`}
                  >
                    <Icon
                      className={`w-4 h-4 shrink-0 ${
                        isActive ? 'text-teal-700' : 'text-slate-400'
                      }`}
                      aria-hidden={true}
                    />
                    <span className="text-sm font-semibold">
                      {item.step}. {item.label}
                    </span>
                  </button>
                );
              })}

              <div className="pt-2 mt-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={openManualSalarySection}
                  className="w-full flex items-center gap-3 px-3.5 py-3 rounded-md text-right text-teal-900 bg-teal-50 hover:bg-teal-100 border border-teal-200 transition-colors"
                >
                  <Banknote className="w-4 h-4 shrink-0 text-teal-700" aria-hidden={true} />
                  <span className="text-sm font-semibold">پرداخت حقوق دستی</span>
                </button>
              </div>
            </nav>
            <div className="p-4 border-t border-slate-200 space-y-2">
              <div className="text-xs font-semibold text-slate-800">
                {currentUser.fullName} ({isAdmin ? 'ادمین سیستم' : 'فقط مشاهده'})
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    setIsAuthModalOpen(true);
                  }}
                  className="flex-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded"
                >
                  تغییر کاربر
                </button>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="px-2.5 py-1.5 text-xs font-medium text-rose-700 bg-rose-50 hover:bg-rose-100 rounded"
                >
                  خروج
                </button>
              </div>
              {isAdmin && (
                <button
                  type="button"
                  onClick={handleResetDemoData}
                  className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-md"
                >
                  <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>بازنشانی داده‌های نمونه</span>
                </button>
              )}
            </div>
          </aside>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top Bar Contract */}
        <header className="bg-white border-b border-slate-200 px-4 sm:px-8 py-3.5 flex items-center justify-between gap-4 no-print">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="باز کردن منوی صفحات"
              className="lg:hidden p-2 text-slate-600 hover:bg-slate-100 rounded-md"
            >
              <Menu className="w-5 h-5" aria-hidden="true" />
            </button>
            <div className="min-w-0">
              <div className="text-xs text-slate-500 hidden sm:block">
                حسابداری حقوق و دستمزد <span className="mx-1">/</span> صفحه{' '}
                {currentNav.step}
              </div>
              <h1 className="text-base sm:text-lg font-bold text-slate-900 truncate">
                {currentNav.label}
              </h1>
            </div>
          </div>

          {/* Period Selector + Quick Switch User */}
          <div className="flex items-center gap-2 shrink-0">
            <label htmlFor="period-month" className="text-xs text-slate-500 hidden sm:inline">
              دوره مالی:
            </label>
            <select
              id="period-month"
              aria-label="انتخاب ماه دوره مالی"
              value={appState.selectedPeriod.month}
              onChange={(e) =>
                setAppState((prev) => ({
                  ...prev,
                  selectedPeriod: {
                    ...prev.selectedPeriod,
                    month: Number(e.target.value),
                  },
                }))
              }
              className="px-2.5 py-1.5 text-sm border border-slate-200 rounded-md bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
            >
              {JALALI_MONTHS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
            <select
              id="period-year"
              aria-label="انتخاب سال دوره مالی"
              value={appState.selectedPeriod.year}
              onChange={(e) =>
                setAppState((prev) => ({
                  ...prev,
                  selectedPeriod: {
                    ...prev.selectedPeriod,
                    year: Number(e.target.value),
                  },
                }))
              }
              className="px-2.5 py-1.5 text-sm border border-slate-200 rounded-md bg-white text-slate-800 font-mono-num tabular-nums focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
            >
              {AVAILABLE_YEARS.map((y) => (
                <option key={y} value={y}>
                  {toPersianDigits(y)}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => setIsAuthModalOpen(true)}
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-slate-200 rounded-md bg-slate-50 hover:bg-slate-100 text-slate-700 whitespace-nowrap"
            >
              <Shield
                className={`w-3.5 h-3.5 ${isAdmin ? 'text-teal-700' : 'text-amber-600'}`}
                aria-hidden="true"
              />
              <span>{currentUser.fullName}</span>
            </button>
          </div>
        </header>

        {/* Page Viewport */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-[1440px] w-full mx-auto space-y-5">
          {!isAdmin && (
            <div
              role="status"
              className="bg-amber-50 border border-amber-200 text-amber-900 rounded-lg px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-xs no-print"
            >
              <div className="flex items-center gap-2">
                <Lock className="w-4 h-4 text-amber-700 shrink-0" aria-hidden="true" />
                <span>
                  حالت فقط مشاهده: شما با حساب <strong>{currentUser.fullName}</strong> وارد شده‌اید. اعمال تغییرات در سامانه فقط توسط <strong>ادمین سیستم</strong> مجاز است.
                </span>
              </div>
              <button
                type="button"
                onClick={() => setIsAuthModalOpen(true)}
                className="text-amber-900 font-semibold underline hover:text-amber-950 self-start sm:self-auto whitespace-nowrap"
              >
                ورود با حساب ادمین
              </button>
            </div>
          )}

          {activePage === 'employees' && (
            <EmployeesPage
              employees={appState.employees}
              currency={appState.settings.currency}
              isAdmin={isAdmin}
              onAddEmployee={handleAddEmployee}
              onUpdateEmployee={handleUpdateEmployee}
              onBatchUpdateSalaries={handleBatchUpdateSalaries}
              onDeleteEmployee={handleDeleteEmployee}
              onToggleActive={handleToggleEmployeeActive}
            />
          )}

          {activePage === 'payroll-data' && (
            <PayrollDataPage
              employees={appState.employees}
              timesheets={appState.timesheets}
              loans={appState.loans}
              manualPayments={appState.manualPayments ?? []}
              settings={appState.settings}
              periodKey={periodKey}
              isAdmin={isAdmin}
              requestedTab={payrollDataTab}
              onUpsertTimesheet={handleUpsertTimesheet}
              onFillStandardMonth={handleFillStandardMonth}
              onAddManualPayment={handleAddManualPayment}
              onDeleteManualPayment={handleDeleteManualPayment}
            />
          )}

          {activePage === 'loans-settings' && (
            <LoansSettingsPage
              employees={appState.employees}
              loans={appState.loans}
              settings={appState.settings}
              periodKey={periodKey}
              isAdmin={isAdmin}
              users={appState.users}
              currentUserId={appState.currentUserId}
              requestedTab={loansSettingsTab}
              onAddLoan={handleAddLoan}
              onUpdateLoanStatus={handleUpdateLoanStatus}
              onRecordLoanInstallment={handleRecordLoanInstallment}
              onDeleteLoan={handleDeleteLoan}
              onUpdateSettings={handleUpdateSettings}
              onAddUser={handleAddUser}
              onUpdateUser={handleUpdateUser}
              onDeleteUser={handleDeleteUser}
            />
          )}

          {activePage === 'reports' && (
            <ReportsPage
              report={report}
              settings={appState.settings}
              appState={appState}
              isAdmin={isAdmin}
              onImportState={(imported) => {
                if (!isAdmin) return;
                setAppState({
                  ...imported,
                  users:
                    Array.isArray(imported.users) && imported.users.length > 0
                      ? imported.users
                      : appState.users,
                  currentUserId: appState.currentUserId,
                  parametricTemplates: Array.isArray(imported.parametricTemplates)
                    ? imported.parametricTemplates
                    : appState.parametricTemplates ?? [],
                });
              }}
              onSaveParametricTemplate={(template) => {
                if (!isAdmin) return;
                setAppState((prev) => ({
                  ...prev,
                  parametricTemplates: [
                    ...(prev.parametricTemplates ?? []).filter(
                      (t) => t.id !== template.id
                    ),
                    template,
                  ],
                }));
              }}
              onDeleteParametricTemplate={(templateId) => {
                if (!isAdmin) return;
                setAppState((prev) => ({
                  ...prev,
                  parametricTemplates: (prev.parametricTemplates ?? []).filter(
                    (t) => t.id !== templateId
                  ),
                }));
              }}
            />
          )}
        </main>
      </div>

      {isAuthModalOpen && (
        <AuthPanel
          mode="modal"
          companyName={appState.settings.companyName}
          users={appState.users}
          currentUser={currentUser}
          onLogin={handleLogin}
          onClose={() => setIsAuthModalOpen(false)}
        />
      )}
    </div>
  );
}
