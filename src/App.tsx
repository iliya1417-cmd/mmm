import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  BarChart3,
  ClipboardEdit,
  Download,
  Layers,
  Lock,
  LogOut,
  Menu,
  Moon,
  Settings2,
  Shield,
  Sun,
  TableProperties,
  Upload,
  UserCog,
  Users,
  X,
} from 'lucide-react';
import type {
  AppState,
  Employee,
  Loan,
  LoanStatus,
  MonthlyTimesheet,
  PageId,
  PayrollSettings,
  SystemUser,
} from './types/payroll';
import {
  JALALI_MONTHS,
  USER_PERMISSION_ITEMS,
  applyLoanPayment,
  applyMultiTierManualSalaryUpdates,
  calculatePayrollReport,
  createEmptyTimesheet,
  formatPeriodKey,
  getEffectiveUserPermissions,
  getMonthFromPeriodKey,
  getPeriodDays,
  isAdminUser,
  toPersianDigits,
} from './utils/payroll';
import {
  exportAppStateToJson,
  loadAppState,
  parseAppStateFromJson,
  saveAppState,
} from './utils/storage';
import { EmployeesPage } from './components/EmployeesPage';
import { PayrollDataPage } from './components/PayrollDataPage';
import {
  LoansSettingsPage,
  type LoansSettingsTab,
} from './components/LoansSettingsPage';
import { ManualSalary2Page } from './components/ManualSalary2Page';
import { SalaryTiersPage } from './components/SalaryTiersPage';
import { ReportsPage } from './components/ReportsPage';
import { AuthPanel } from './components/AuthModal';
import {
  upsertManualPaymentsForPeriod,
  type ManualSalary2RowUpdate,
} from './utils/manualSalary2';
import { syncEmployeesTiersFromManualPayments } from './utils/tierExtraction';

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
    subtitle: 'پرونده پرسنلی و قراردادها',
    icon: Users,
  },
  {
    id: 'payroll-data',
    step: '۲',
    label: 'مقدار اطلاعات',
    subtitle: 'کارکرد متغیر ماهانه و اضافه‌کاری',
    icon: ClipboardEdit,
  },
  {
    id: 'loans-settings',
    step: '۳',
    label: 'وام و تنظیمات',
    subtitle: 'مدیریت اقساط، بیمه و کاربران',
    icon: Settings2,
  },
  {
    id: 'manual-salary-2',
    step: '۴',
    label: 'پرداخت حقوق دستی ۲',
    subtitle: 'جدول نام و حقوق کارمندان و اکسل',
    icon: TableProperties,
  },
  {
    id: 'salary-tiers',
    step: '۵',
    label: 'پرداخت و مقدار حقوق (۸ ردیف)',
    subtitle: 'ردیف‌های سازمانی و ورود/خروجی اکسل',
    icon: Layers,
  },
  {
    id: 'reports',
    step: '۶',
    label: 'گزارش‌دهی',
    subtitle: 'لیست حقوق، فیش و خروجی',
    icon: BarChart3,
  },
];

const AVAILABLE_YEARS = [1403, 1404, 1405, 1406];
const THEME_STORAGE_KEY = 'persian_payroll_theme_v1';
type ThemeMode = 'light' | 'dark';

export default function App() {
  const [appState, setAppState] = useState<AppState>(() => loadAppState());
  const [theme, setTheme] = useState<ThemeMode>(() => {
    try {
      const saved = localStorage.getItem(THEME_STORAGE_KEY);
      return saved === 'dark' ? 'dark' : 'light';
    } catch {
      return 'light';
    }
  });
  const [activePage, setActivePage] = useState<PageId>('employees');
  const [loansSettingsTab, setLoansSettingsTab] = useState<LoansSettingsTab | null>(
    null
  );
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [backupNotice, setBackupNotice] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);
  const backupFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    saveAppState(appState);
  }, [appState]);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', theme === 'dark');
    root.setAttribute('data-theme', theme);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // ignore storage errors
    }
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

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
  const userPermissions = useMemo(
    () => getEffectiveUserPermissions(currentUser),
    [currentUser]
  );
  const {
    manageEmployees: canEmp,
    enterTimesheets: canTimesheet,
    manageLoans: canLoan,
    manageSettings: canSettings,
    enterManualSalary2: canManual2,
    enterSalaryTiers: canTiers,
    manageBackup: canBackup,
    viewReports: canReports,
  } = userPermissions;

  const grantedPermissionSummary = useMemo(() => {
    const enabled = USER_PERMISSION_ITEMS.filter(
      (item) => userPermissions[item.key]
    ).map((item) => item.label);
    return enabled.length > 0
      ? enabled.join('، ')
      : 'بدون مجوز عملیات (فقط مشاهده اولیه)';
  }, [userPermissions]);

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
    if (!canEmp) return;
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
    if (!canEmp) return;
    setAppState((prev) => ({
      ...prev,
      employees: prev.employees.map((e) => (e.id === updated.id ? updated : e)),
    }));
  };

  const handleBatchUpdateSalaries = (
    salaryDrafts: Record<string, ReadonlyArray<string | number>>,
    customTierDrafts?: Record<string, Record<string, string | number>>
  ) => {
    if (!canTiers) return;
    setAppState((prev) => ({
      ...prev,
      employees: applyMultiTierManualSalaryUpdates(
        prev.employees,
        salaryDrafts,
        customTierDrafts
      ),
    }));
  };

  const handleImportEmployees = (updatedEmployees: Employee[]) => {
    if (!canTiers) return;
    setAppState((prev) => {
      if (canEmp) {
        return {
          ...prev,
          employees: updatedEmployees,
        };
      }
      const byId = new Map(updatedEmployees.map((u) => [u.id, u]));
      return {
        ...prev,
        employees: prev.employees.map((existing) => {
          const next = byId.get(existing.id);
          if (!next) return existing;
          return {
            ...existing,
            baseMonthlySalary: next.baseMonthlySalary,
            manualSalaries: next.manualSalaries,
            customTierAmounts: next.customTierAmounts,
          };
        }),
      };
    });
  };

  const handleImportEmployeesBatch = (nextEmployees: Employee[]) => {
    if (!canEmp) return;
    setAppState((prev) => ({
      ...prev,
      employees: nextEmployees,
    }));
  };

  const handleUpsertManualSalary2 = (updates: ManualSalary2RowUpdate[]) => {
    if (!canManual2 || updates.length === 0) return;
    setAppState((prev) => {
      const nextManualPayments = upsertManualPaymentsForPeriod(
        prev.manualPayments ?? [],
        periodKey,
        updates
      );
      const clearedIds = updates
        .filter((u) => u.amount <= 0)
        .map((u) => u.employeeId);
      return {
        ...prev,
        manualPayments: nextManualPayments,
        employees: syncEmployeesTiersFromManualPayments(
          prev.employees,
          nextManualPayments,
          periodKey,
          clearedIds
        ),
      };
    });
  };

  const handleToggleEmployeeActive = (id: string) => {
    if (!canEmp) return;
    setAppState((prev) => ({
      ...prev,
      employees: prev.employees.map((e) =>
        e.id === id ? { ...e, isActive: !e.isActive } : e
      ),
    }));
  };

  const handleUpsertTimesheet = (timesheet: MonthlyTimesheet) => {
    if (!canTimesheet) return;
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

  const handleBatchUpsertTimesheets = (timesheets: MonthlyTimesheet[]) => {
    if (!canTimesheet || timesheets.length === 0) return;
    setAppState((prev) => {
      const nextMap = new Map(prev.timesheets.map((t) => [t.id, t]));
      for (const ts of timesheets) {
        nextMap.set(ts.id, ts);
      }
      return {
        ...prev,
        timesheets: Array.from(nextMap.values()),
      };
    });
  };

  const handleFillStandardMonth = () => {
    if (!canTimesheet) return;
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
    if (!canLoan) return;
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

  const handleUpdateLoan = (updatedLoan: Loan) => {
    if (!canLoan) return;
    setAppState((prev) => ({
      ...prev,
      loans: prev.loans.map((l) => (l.id === updatedLoan.id ? updatedLoan : l)),
    }));
  };

  const handlePayLoan = (loanId: string, amount: number) => {
    if (!canLoan || amount <= 0) return;
    setAppState((prev) => ({
      ...prev,
      loans: prev.loans.map((l) =>
        l.id === loanId ? applyLoanPayment(l, amount).updatedLoan : l
      ),
    }));
  };

  const handleUpdateLoanStatus = (loanId: string, status: LoanStatus) => {
    if (!canLoan) return;
    setAppState((prev) => ({
      ...prev,
      loans: prev.loans.map((l) => (l.id === loanId ? { ...l, status } : l)),
    }));
  };

  const handleRecordLoanInstallment = (loanId: string) => {
    if (!canLoan) return;
    setAppState((prev) => ({
      ...prev,
      loans: prev.loans.map((l) => {
        if (l.id !== loanId || l.status === 'settled') return l;
        return applyLoanPayment(l, l.monthlyInstallment).updatedLoan;
      }),
    }));
  };

  const handleDeleteLoan = (loanId: string) => {
    if (!canLoan) return;
    setAppState((prev) => ({
      ...prev,
      loans: prev.loans.filter((l) => l.id !== loanId),
    }));
  };

  const handleUpdateSettings = (settings: PayrollSettings) => {
    if (!canSettings) return;
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
    setLoansSettingsTab(null);
    setMobileMenuOpen(false);
  };

  const handleImportState = (imported: AppState) => {
    if (!canBackup) return;
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
  };

  const handleHeaderBackupDownload = () => {
    if (!canBackup) return;
    const json = exportAppStateToJson(appState);
    const blob = new Blob([json], { type: 'application/json;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `lak-payroll-backup-${periodKey}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    setBackupNotice({
      type: 'success',
      message: `فایل پشتیبان کامل دوره ${toPersianDigits(periodKey)} با موفقیت ذخیره شد.`,
    });
    window.setTimeout(() => setBackupNotice(null), 3500);
  };

  const handleHeaderBackupRestore = (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !canBackup) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = parseAppStateFromJson(String(reader.result));
      if (!result.state) {
        setBackupNotice({
          type: 'error',
          message: result.error ?? 'ساختار فایل پشتیبان معتبر نیست.',
        });
        return;
      }
      handleImportState(result.state);
      setBackupNotice({
        type: 'success',
        message: 'اطلاعات فایل بکاپ با موفقیت در کل سامانه بازیابی شد.',
      });
      window.setTimeout(() => setBackupNotice(null), 3500);
    };
    reader.readAsText(file);
  };

  const currentNav = NAV_ITEMS.find((n) => n.id === activePage) ?? NAV_ITEMS[0];

  const selectPage = (pageId: PageId) => {
    if (pageId !== 'loans-settings') {
      setLoansSettingsTab(null);
    }
    setActivePage(pageId);
    setMobileMenuOpen(false);
  };

  const openUsersManagement = () => {
    setLoansSettingsTab('users');
    setActivePage('loans-settings');
    setMobileMenuOpen(false);
  };

  if (!currentUser) {
    return (
      <div className="relative">
        <button
          type="button"
          onClick={toggleTheme}
          aria-pressed={theme === 'dark'}
          aria-label="تغییر زمینه روز و شب"
          className="fixed top-4 left-4 z-50 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 rounded-md shadow-sm transition-colors"
        >
          {theme === 'dark' ? (
            <>
              <Sun className="w-3.5 h-3.5 text-amber-500" aria-hidden="true" />
              <span>زمینه روز</span>
            </>
          ) : (
            <>
              <Moon className="w-3.5 h-3.5 text-indigo-600" aria-hidden="true" />
              <span>زمینه شب</span>
            </>
          )}
        </button>
        <AuthPanel
          mode="page"
          companyName={appState.settings.companyName}
          users={appState.users}
          currentUser={null}
          onLogin={handleLogin}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col lg:flex-row">
      {/* Desktop Sidebar */}
      <aside
        className="hidden lg:flex lg:flex-col lg:w-72 lg:shrink-0 bg-white border-l border-slate-200 min-h-screen no-print"
        aria-label="منوی اصلی سامانه"
      >
        <div className="px-5 py-5 border-b border-slate-200">
          <div className="text-base font-bold text-slate-900 tracking-tight whitespace-nowrap">
            شرکت مهندسی لک
          </div>
          <div className="mt-1 text-xs text-slate-500 truncate">
            سامانه جامع حقوق و دستمزد
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
                  <div className="text-[13px] font-semibold leading-snug">
                    {item.step}. {item.label}
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5 truncate">
                    {item.subtitle}
                  </div>
                </div>
              </button>
            );
          })}
        </nav>

        <div className="p-3.5 border-t border-slate-200 space-y-2.5">
          {/* Backup & Restore Controls placed neatly alongside System Admin card */}
          <input
            ref={backupFileInputRef}
            type="file"
            accept="application/json,.json"
            onChange={handleHeaderBackupRestore}
            className="hidden"
            aria-label="انتخاب فایل بکاپ برای بازیابی"
          />
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
                  <span>{isAdmin ? 'مدیر سیستم (دسترسی کامل)' : 'کاربر دسترسی سفارشی'}</span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                disabled={!canBackup}
                onClick={handleHeaderBackupDownload}
                title="دریافت فایل پشتیبان کامل سامانه (JSON)"
                className="inline-flex items-center justify-center gap-1 px-2 py-1.5 text-[11px] font-medium text-teal-800 bg-teal-50 hover:bg-teal-100 border border-teal-200 disabled:opacity-45 disabled:cursor-not-allowed rounded transition-colors whitespace-nowrap"
              >
                <Download className="w-3 h-3 shrink-0" aria-hidden="true" />
                <span>بکاپ‌گیری</span>
              </button>
              <button
                type="button"
                disabled={!canBackup}
                onClick={() => backupFileInputRef.current?.click()}
                title="بازیابی اطلاعات سامانه از فایل بکاپ"
                className="inline-flex items-center justify-center gap-1 px-2 py-1.5 text-[11px] font-medium text-slate-700 bg-white hover:bg-slate-100 border border-slate-200 disabled:opacity-45 disabled:cursor-not-allowed rounded transition-colors whitespace-nowrap"
              >
                <Upload className="w-3 h-3 shrink-0" aria-hidden="true" />
                <span>استفاده از بکاپ</span>
              </button>
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
                className="w-full text-[11px] font-medium text-teal-800 hover:text-teal-950 text-right pt-1.5 border-t border-slate-200"
              >
                تعریف و سطح دسترسی کاربران ({toPersianDigits(appState.users.length)} کاربر)
              </button>
            )}
          </div>
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
                شرکت مهندسی لک
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
            </nav>
            <div className="p-4 border-t border-slate-200 space-y-2.5">
              <div className="text-xs font-semibold text-slate-800">
                {currentUser.fullName} ({isAdmin ? 'مدیر سیستم' : 'دسترسی سفارشی'})
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  disabled={!canBackup}
                  onClick={() => {
                    setMobileMenuOpen(false);
                    handleHeaderBackupDownload();
                  }}
                  className="inline-flex items-center justify-center gap-1 px-2 py-1.5 text-[11px] font-medium text-teal-800 bg-teal-50 hover:bg-teal-100 border border-teal-200 disabled:opacity-45 rounded"
                >
                  <Download className="w-3 h-3 shrink-0" aria-hidden="true" />
                  <span>بکاپ‌گیری</span>
                </button>
                <button
                  type="button"
                  disabled={!canBackup}
                  onClick={() => {
                    setMobileMenuOpen(false);
                    backupFileInputRef.current?.click();
                  }}
                  className="inline-flex items-center justify-center gap-1 px-2 py-1.5 text-[11px] font-medium text-slate-700 bg-white hover:bg-slate-100 border border-slate-200 disabled:opacity-45 rounded"
                >
                  <Upload className="w-3 h-3 shrink-0" aria-hidden="true" />
                  <span>استفاده از بکاپ</span>
                </button>
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
            </div>
          </aside>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top Bar Contract */}
        <header className="bg-white border-b border-slate-200 px-4 sm:px-8 py-3.5 flex flex-wrap items-center justify-between gap-3 no-print">
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
                شرکت مهندسی لک <span className="mx-1">/</span> صفحه{' '}
                {currentNav.step}
              </div>
              <h1 className="text-base sm:text-lg font-bold text-slate-900 truncate">
                {currentNav.label}
              </h1>
            </div>
          </div>

          {/* Top Bar Controls: Theme + Period Selector + User Switch */}
          <div className="flex flex-wrap items-center gap-2 shrink-0">

            <button
              type="button"
              onClick={toggleTheme}
              aria-pressed={theme === 'dark'}
              aria-label="تغییر زمینه روز و شب"
              title={
                theme === 'dark'
                  ? 'تغییر به زمینه روشن (روز)'
                  : 'تغییر به زمینه تیره (شب)'
              }
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white hover:bg-slate-100 border border-slate-200 rounded-md transition-colors whitespace-nowrap"
            >
              {theme === 'dark' ? (
                <>
                  <Sun className="w-3.5 h-3.5 text-amber-500" aria-hidden="true" />
                  <span>زمینه روز</span>
                </>
              ) : (
                <>
                  <Moon className="w-3.5 h-3.5 text-indigo-600" aria-hidden="true" />
                  <span>زمینه شب</span>
                </>
              )}
            </button>

            <span className="hidden sm:inline-block h-5 w-px bg-slate-200 mx-0.5" aria-hidden="true" />

            <label htmlFor="period-month" className="text-xs text-slate-500 hidden sm:inline">
              دوره مالی:
            </label>
            <select
              id="period-month"
              aria-label="انتخاب ماه دوره مالی"
              value={appState.selectedPeriod.month}
              onChange={(e) =>
                setAppState((prev) => {
                  const nextPeriod = {
                    ...prev.selectedPeriod,
                    month: Number(e.target.value),
                  };
                  const nextPeriodKey = formatPeriodKey(nextPeriod);
                  return {
                    ...prev,
                    selectedPeriod: nextPeriod,
                    employees: syncEmployeesTiersFromManualPayments(
                      prev.employees,
                      prev.manualPayments ?? [],
                      nextPeriodKey
                    ),
                  };
                })
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
                setAppState((prev) => {
                  const nextPeriod = {
                    ...prev.selectedPeriod,
                    year: Number(e.target.value),
                  };
                  const nextPeriodKey = formatPeriodKey(nextPeriod);
                  return {
                    ...prev,
                    selectedPeriod: nextPeriod,
                    employees: syncEmployeesTiersFromManualPayments(
                      prev.employees,
                      prev.manualPayments ?? [],
                      nextPeriodKey
                    ),
                  };
                })
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
          {backupNotice && (
            <div
              role={backupNotice.type === 'error' ? 'alert' : 'status'}
              className={`rounded-lg px-4 py-2.5 text-xs flex items-center justify-between gap-2 border no-print ${
                backupNotice.type === 'success'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                  : 'bg-rose-50 border-rose-200 text-rose-800'
              }`}
            >
              <span>{backupNotice.message}</span>
              <button
                type="button"
                onClick={() => setBackupNotice(null)}
                aria-label="بستن پیام بکاپ"
                className="p-1 hover:opacity-75"
              >
                <X className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </div>
          )}

          {!isAdmin && (
            <div
              role="status"
              className="bg-amber-50 border border-amber-200 text-amber-900 rounded-lg px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-xs no-print"
            >
              <div className="flex items-center gap-2">
                <Lock className="w-4 h-4 text-amber-700 shrink-0" aria-hidden="true" />
                <span>
                  حساب کاربری <strong>{currentUser.fullName}</strong> — دسترسی‌های مجاز تعریف‌شده توسط مدیر سیستم:{' '}
                  <strong>{grantedPermissionSummary}</strong>.
                </span>
              </div>
              <button
                type="button"
                onClick={() => setIsAuthModalOpen(true)}
                className="text-amber-900 font-semibold underline hover:text-amber-950 self-start sm:self-auto whitespace-nowrap"
              >
                ورود با حساب مدیر سیستم
              </button>
            </div>
          )}

          {activePage === 'employees' && (
            <EmployeesPage
              employees={appState.employees}
              currency={appState.settings.currency}
              canManageEmployees={canEmp}
              onAddEmployee={handleAddEmployee}
              onUpdateEmployee={handleUpdateEmployee}
              onToggleActive={handleToggleEmployeeActive}
              onImportEmployeesBatch={handleImportEmployeesBatch}
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
              canEnterSalaries={canTimesheet}
              onUpsertTimesheet={handleUpsertTimesheet}
              onBatchUpsertTimesheets={handleBatchUpsertTimesheets}
              onFillStandardMonth={handleFillStandardMonth}
            />
          )}

          {activePage === 'loans-settings' && (
            <LoansSettingsPage
              employees={appState.employees}
              loans={appState.loans}
              settings={appState.settings}
              appState={appState}
              periodKey={periodKey}
              isAdmin={isAdmin}
              canManageLoans={canLoan}
              canManageSettings={canSettings}
              canManageBackup={canBackup}
              users={appState.users}
              currentUserId={appState.currentUserId}
              requestedTab={loansSettingsTab}
              onAddLoan={handleAddLoan}
              onUpdateLoan={handleUpdateLoan}
              onPayLoan={handlePayLoan}
              onUpdateLoanStatus={handleUpdateLoanStatus}
              onRecordLoanInstallment={handleRecordLoanInstallment}
              onDeleteLoan={handleDeleteLoan}
              onUpdateSettings={handleUpdateSettings}
              onImportState={handleImportState}
              onAddUser={handleAddUser}
              onUpdateUser={handleUpdateUser}
              onDeleteUser={handleDeleteUser}
            />
          )}

          {activePage === 'manual-salary-2' && (
            <ManualSalary2Page
              employees={appState.employees}
              manualPayments={appState.manualPayments ?? []}
              timesheets={appState.timesheets}
              currency={appState.settings.currency}
              periodKey={periodKey}
              canEnterManualSalary2={canManual2}
              onUpsertManualPayments={handleUpsertManualSalary2}
            />
          )}

          {activePage === 'salary-tiers' && (
            <SalaryTiersPage
              employees={appState.employees}
              manualPayments={appState.manualPayments ?? []}
              periodKey={periodKey}
              currency={appState.settings.currency}
              canEnterSalaryTiers={canTiers}
              canManageEmployees={canEmp}
              onUpdateEmployee={handleUpdateEmployee}
              onBatchUpdateSalaries={handleBatchUpdateSalaries}
              onImportEmployees={handleImportEmployees}
            />
          )}

          {activePage === 'reports' && (
            <ReportsPage
              report={report}
              settings={appState.settings}
              appState={appState}
              isAdmin={isAdmin}
              canViewReports={canReports}
              canManageBackup={canBackup}
              canManageSettings={canSettings}
              onImportState={handleImportState}
              onSaveParametricTemplate={(template) => {
                if (!isAdmin && !canSettings) return;
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
                if (!isAdmin && !canSettings) return;
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
