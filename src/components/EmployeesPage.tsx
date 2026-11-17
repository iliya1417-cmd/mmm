import React, { useEffect, useMemo, useState } from 'react';
import {
  Building2,
  Check,
  CreditCard,
  Edit3,
  FileSpreadsheet,
  MapPin,
  Phone,
  Plus,
  Search,
  Smartphone,
  Trash2,
  UserCheck,
  UserX,
  X,
} from 'lucide-react';
import type {
  CurrencyUnit,
  Employee,
  EmploymentType,
  MaritalStatus,
} from '../types/payroll';
import {
  EMPLOYMENT_TYPE_LABELS,
  IRANIAN_BANKS,
  SALARY_TIER_LABELS,
  detectBankFromSheba,
  formatMoney,
  getEmploymentTypeLabel,
  normalizeManualSalaries,
  parseNumericInput,
  sumManualSalaries,
  toEnglishDigits,
  toPersianDigits,
  validateEmployeeInput,
  type ValidationErrors,
} from '../utils/payroll';
import {
  downloadRtlThreeColumnXlsx,
  type ThreeColumnExcelRow,
} from '../utils/xlsxExport';

interface EmployeesPageProps {
  employees: Employee[];
  currency: CurrencyUnit;
  isAdmin: boolean;
  onAddEmployee: (emp: Omit<Employee, 'id'>) => void;
  onUpdateEmployee: (emp: Employee) => void;
  onBatchUpdateSalaries: (
    salaryDrafts: Record<string, ReadonlyArray<string | number>>
  ) => void;
  onDeleteEmployee: (id: string) => void;
  onToggleActive: (id: string) => void;
}

const EMPTY_FORM: Omit<Employee, 'id'> = {
  personnelCode: '',
  fullName: '',
  nationalId: '',
  department: '',
  jobTitle: '',
  workLocation: 'ستاد مرکزی تهران',
  mobileNumber: '',
  workPhone: '',
  employmentType: 'employed',
  baseMonthlySalary: 15_000_000,
  maritalStatus: 'single',
  childrenCount: 0,
  bankName: 'بانک ملی ایران',
  bankAccount: '',
  hireDate: '1405/01/01',
  isActive: true,
};

const MARITAL_LABELS: Record<MaritalStatus, string> = {
  single: 'مجرد',
  married: 'متاهل',
};

export const EmployeesPage: React.FC<EmployeesPageProps> = ({
  employees,
  currency,
  isAdmin,
  onAddEmployee,
  onUpdateEmployee,
  onBatchUpdateSalaries,
  onDeleteEmployee,
  onToggleActive,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState<string>('all');
  const [contractFilter, setContractFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');

  const [selectedId, setSelectedId] = useState<string | null>(
    employees[0]?.id ?? null
  );

  // Right-side Inspector quick-edit state
  const [inspectorEmploymentType, setInspectorEmploymentType] =
    useState<EmploymentType>('employed');
  const [inspectorWorkLocation, setInspectorWorkLocation] = useState('');
  const [inspectorMobile, setInspectorMobile] = useState('');
  const [inspectorWorkPhone, setInspectorWorkPhone] = useState('');
  const [inspectorBankName, setInspectorBankName] = useState('بانک ملی ایران');
  const [inspectorBankAccount, setInspectorBankAccount] = useState('');
  const [inspectorNewAccountMode, setInspectorNewAccountMode] = useState(false);
  const [inspectorSalaryInput, setInspectorSalaryInput] = useState('');
  const [inspectorChildrenInput, setInspectorChildrenInput] = useState('0');
  const [inspectorErrors, setInspectorErrors] = useState<ValidationErrors>({});
  const [inspectorSaved, setInspectorSaved] = useState(false);

  // Full Create / Edit Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [formState, setFormState] = useState<Omit<Employee, 'id'>>(EMPTY_FORM);
  const [salaryInputText, setSalaryInputText] = useState('15000000');
  const [errors, setErrors] = useState<ValidationErrors>({});
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Dedicated table state: مقدار وارد شده حقوق بر اساس دستی (۵ ردیف حقوق برای هر نفر)
  const [manualSalaryDrafts, setManualSalaryDrafts] = useState<
    Record<string, [string, string, string, string, string]>
  >({});
  const [manualSalarySavedToast, setManualSalarySavedToast] = useState(false);

  useEffect(() => {
    setManualSalaryDrafts(() => {
      const next: Record<string, [string, string, string, string, string]> = {};
      for (const emp of employees) {
        const tiers = normalizeManualSalaries(
          emp.manualSalaries,
          emp.baseMonthlySalary
        );
        next[emp.id] = [
          String(tiers[0]),
          String(tiers[1]),
          String(tiers[2]),
          String(tiers[3]),
          String(tiers[4]),
        ];
      }
      return next;
    });
  }, [employees]);

  const selectedEmployee = useMemo(
    () => employees.find((e) => e.id === selectedId) ?? employees[0] ?? null,
    [employees, selectedId]
  );

  useEffect(() => {
    if (!selectedEmployee) return;
    setInspectorEmploymentType(selectedEmployee.employmentType);
    setInspectorWorkLocation(selectedEmployee.workLocation);
    setInspectorMobile(selectedEmployee.mobileNumber ?? '');
    setInspectorWorkPhone(selectedEmployee.workPhone ?? '');
    setInspectorBankName(selectedEmployee.bankName || 'بانک ملی ایران');
    setInspectorBankAccount(selectedEmployee.bankAccount);
    setInspectorNewAccountMode(false);
    setInspectorSalaryInput(String(selectedEmployee.baseMonthlySalary));
    setInspectorChildrenInput(String(selectedEmployee.childrenCount));
    setInspectorErrors({});
    setInspectorSaved(false);
  }, [selectedEmployee]);

  const departments = useMemo(() => {
    const set = new Set<string>();
    for (const emp of employees) {
      if (emp.department.trim()) set.add(emp.department.trim());
    }
    return Array.from(set);
  }, [employees]);

  const filteredEmployees = useMemo(() => {
    const q = toEnglishDigits(searchQuery.trim().toLowerCase());
    return employees.filter((emp) => {
      if (departmentFilter !== 'all' && emp.department !== departmentFilter) {
        return false;
      }
      if (contractFilter !== 'all' && emp.employmentType !== contractFilter) {
        return false;
      }
      if (statusFilter === 'active' && !emp.isActive) return false;
      if (statusFilter === 'inactive' && emp.isActive) return false;

      if (!q) return true;
      const haystack = [
        emp.fullName,
        toEnglishDigits(emp.personnelCode),
        toEnglishDigits(emp.nationalId),
        emp.department,
        emp.jobTitle,
        emp.workLocation,
        toEnglishDigits(emp.mobileNumber || ''),
        toEnglishDigits(emp.workPhone || ''),
        emp.bankName,
        emp.bankAccount,
        getEmploymentTypeLabel(emp.employmentType),
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [employees, searchQuery, departmentFilter, contractFilter, statusFilter]);

  const activeCount = employees.filter((e) => e.isActive).length;
  const totalBasePayroll = employees
    .filter((e) => e.isActive)
    .reduce((sum, e) => sum + e.baseMonthlySalary, 0);

  const handleInspectorAccountChange = (val: string) => {
    setInspectorBankAccount(val);
    const detected = detectBankFromSheba(val);
    if (detected) {
      setInspectorBankName(detected);
    }
  };

  const handleInspectorSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEmployee || !isAdmin) return;

    const salaryNum = parseNumericInput(inspectorSalaryInput);
    const childrenNum = parseNumericInput(inspectorChildrenInput);
    const errs: ValidationErrors = {};

    if (!inspectorWorkLocation.trim()) {
      errs.workLocation = 'محل خدمت نمی‌تواند خالی باشد.';
    }
    if (salaryNum <= 0) {
      errs.baseMonthlySalary = 'مقدار حقوق پایه باید بزرگتر از صفر باشد.';
    }
    if (Object.keys(errs).length > 0) {
      setInspectorErrors(errs);
      return;
    }

    const preservedManualSalaries =
      salaryNum === selectedEmployee.baseMonthlySalary
        ? normalizeManualSalaries(selectedEmployee.manualSalaries, salaryNum)
        : [salaryNum, 0, 0, 0, 0];

    onUpdateEmployee({
      ...selectedEmployee,
      employmentType: inspectorEmploymentType,
      workLocation: inspectorWorkLocation.trim(),
      mobileNumber: toEnglishDigits(inspectorMobile.trim()),
      workPhone: toEnglishDigits(inspectorWorkPhone.trim()),
      bankName: inspectorBankName,
      bankAccount: toEnglishDigits(inspectorBankAccount.trim()),
      baseMonthlySalary: salaryNum,
      manualSalaries: preservedManualSalaries,
      childrenCount: childrenNum,
    });
    setInspectorErrors({});
    setInspectorNewAccountMode(false);
    setInspectorSaved(true);
    window.setTimeout(() => setInspectorSaved(false), 2000);
  };

  const getEmployeeDraftTiers = (emp: Employee): [number, number, number, number, number] => {
    const fallback = normalizeManualSalaries(emp.manualSalaries, emp.baseMonthlySalary);
    const rawTuple = manualSalaryDrafts[emp.id];
    if (!rawTuple) return fallback;
    return [
      parseNumericInput(rawTuple[0] ?? ''),
      parseNumericInput(rawTuple[1] ?? ''),
      parseNumericInput(rawTuple[2] ?? ''),
      parseNumericInput(rawTuple[3] ?? ''),
      parseNumericInput(rawTuple[4] ?? ''),
    ];
  };

  const isEmployeeManualModified = (emp: Employee): boolean => {
    const currentTiers = normalizeManualSalaries(
      emp.manualSalaries,
      emp.baseMonthlySalary
    );
    const draftTiers = getEmployeeDraftTiers(emp);
    const draftTotal = sumManualSalaries(draftTiers);
    if (draftTotal <= 0) return false;
    return (
      draftTotal !== emp.baseMonthlySalary ||
      draftTiers.some((val, idx) => val !== currentTiers[idx])
    );
  };

  const hasManualSalaryChanges = useMemo(
    () => employees.some((emp) => isEmployeeManualModified(emp)),
    [employees, manualSalaryDrafts]
  );

  const handleSaveAllManualSalaries = () => {
    if (!isAdmin || !hasManualSalaryChanges) return;
    onBatchUpdateSalaries(manualSalaryDrafts);
    setManualSalarySavedToast(true);
    window.setTimeout(() => setManualSalarySavedToast(false), 2200);
  };

  const handleSaveSingleManualSalary = (emp: Employee) => {
    if (!isAdmin || !isEmployeeManualModified(emp)) return;
    const draftTiers = getEmployeeDraftTiers(emp);
    onBatchUpdateSalaries({ [emp.id]: draftTiers });
    setManualSalarySavedToast(true);
    window.setTimeout(() => setManualSalarySavedToast(false), 2200);
  };

  const openCreateModal = () => {
    if (!isAdmin) return;
    const nextCodeNum =
      employees.reduce((max, e) => {
        const parsed = parseInt(toEnglishDigits(e.personnelCode), 10);
        return Number.isFinite(parsed) ? Math.max(max, parsed) : max;
      }, 1000) + 1;

    setEditingEmployee(null);
    setFormState({
      ...EMPTY_FORM,
      personnelCode: String(nextCodeNum),
    });
    setSalaryInputText(String(EMPTY_FORM.baseMonthlySalary));
    setErrors({});
    setIsModalOpen(true);
  };

  const openEditModal = (emp: Employee) => {
    if (!isAdmin) return;
    setEditingEmployee(emp);
    const { id: _id, ...rest } = emp;
    setFormState(rest);
    setSalaryInputText(String(emp.baseMonthlySalary));
    setErrors({});
    setIsModalOpen(true);
  };

  const handleModalBankAccountChange = (val: string) => {
    const detected = detectBankFromSheba(val);
    setFormState((s) => ({
      ...s,
      bankAccount: val,
      bankName: detected ?? s.bankName,
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) return;
    const parsedSalary = parseNumericInput(salaryInputText);
    const preservedManualSalaries =
      editingEmployee && parsedSalary === editingEmployee.baseMonthlySalary
        ? normalizeManualSalaries(editingEmployee.manualSalaries, parsedSalary)
        : [parsedSalary, 0, 0, 0, 0];

    const cleanedInput: Omit<Employee, 'id'> = {
      ...formState,
      personnelCode: toEnglishDigits(formState.personnelCode.trim()),
      nationalId: toEnglishDigits(formState.nationalId.trim()),
      fullName: formState.fullName.trim(),
      department: formState.department.trim(),
      jobTitle: formState.jobTitle.trim(),
      workLocation: formState.workLocation.trim() || 'ستاد مرکزی',
      mobileNumber: toEnglishDigits(formState.mobileNumber.trim()),
      workPhone: toEnglishDigits(formState.workPhone.trim()),
      bankName: formState.bankName.trim() || 'بانک ملی ایران',
      bankAccount: toEnglishDigits(formState.bankAccount.trim()),
      baseMonthlySalary: parsedSalary,
      manualSalaries: preservedManualSalaries,
      hireDate: toEnglishDigits(formState.hireDate.trim()),
    };

    const validation = validateEmployeeInput(
      cleanedInput,
      employees,
      editingEmployee?.id
    );
    if (Object.keys(validation).length > 0) {
      setErrors(validation);
      return;
    }

    if (editingEmployee) {
      onUpdateEmployee({ id: editingEmployee.id, ...cleanedInput });
      setSelectedId(editingEmployee.id);
    } else {
      onAddEmployee(cleanedInput);
    }
    setIsModalOpen(false);
  };

  const formatShortAccount = (account: string): string => {
    if (!account) return 'ثبت نشده';
    if (account.length <= 16) return account;
    return `${account.slice(0, 6)}...${account.slice(-4)}`;
  };

  return (
    <div className="space-y-6">
      {/* Compact Summary Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white border border-slate-200 rounded-lg px-5 py-4">
          <p className="text-xs text-slate-500 font-medium">تعداد کل پرسنل</p>
          <p className="mt-1.5 text-2xl font-semibold text-slate-900 font-mono-num tabular-nums">
            {toPersianDigits(employees.length)}{' '}
            <span className="text-xs font-normal text-slate-500">
              ({toPersianDigits(activeCount)} فعال)
            </span>
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg px-5 py-4">
          <p className="text-xs text-slate-500 font-medium">دپارتمان‌های فعال</p>
          <p className="mt-1.5 text-2xl font-semibold text-slate-900 font-mono-num tabular-nums">
            {toPersianDigits(departments.length)}{' '}
            <span className="text-xs font-normal text-slate-500">واحد سازمانی</span>
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg px-5 py-4">
          <p className="text-xs text-slate-500 font-medium">
            مجموع حقوق پایه پرسنل فعال
          </p>
          <p className="mt-1.5 text-2xl font-semibold text-slate-900 font-mono-num tabular-nums">
            {formatMoney(totalBasePayroll)}{' '}
            <span className="text-xs font-normal text-slate-500">{currency}</span>
          </p>
        </div>
      </div>

      {/* Main Split Workspace: Right-side Employee Inspector Panel + Left-side Employee Ledger */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* Right-Side Dedicated Panel (In RTL, first column appears on the RIGHT side) */}
        <section
          aria-label="پنل مشخصات، محل خدمت و حساب بانکی کارمند"
          className="xl:col-span-4 bg-white border border-slate-200 rounded-lg overflow-hidden"
        >
          <div className="px-5 py-4 border-b border-slate-200 bg-slate-50/70 flex items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">
                مشخصات، محل خدمت و حساب کارمند
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                با انتخاب هر کارمند، محل خدمت، حساب جدید و مبلغ حقوق را اینجا ثبت کنید.
              </p>
            </div>
          </div>

          {!selectedEmployee ? (
            <div className="p-6 text-center text-xs text-slate-500">
              کارمندی برای نمایش انتخاب نشده است.
            </div>
          ) : (
            <form onSubmit={handleInspectorSave} className="p-5 space-y-4" noValidate>
              {/* Selected Employee Header */}
              <div className="pb-3.5 border-b border-slate-200 flex items-start justify-between gap-2">
                <div>
                  <div className="text-base font-bold text-slate-900">
                    {selectedEmployee.fullName}
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    کد {toPersianDigits(selectedEmployee.personnelCode)} ·{' '}
                    {selectedEmployee.department} · {selectedEmployee.jobTitle}
                  </div>
                </div>
                <span className="text-xs font-medium text-teal-800 whitespace-nowrap">
                  {getEmploymentTypeLabel(selectedEmployee.employmentType)}
                </span>
              </div>

              {/* Employment Type (نوع قرارداد) */}
              <div>
                <label
                  htmlFor="inspector-employment-type"
                  className="block text-xs font-medium text-slate-700 mb-1.5"
                >
                  نوع قرارداد
                </label>
                <select
                  id="inspector-employment-type"
                  disabled={!isAdmin}
                  value={inspectorEmploymentType}
                  onChange={(e) =>
                    setInspectorEmploymentType(e.target.value as EmploymentType)
                  }
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md bg-white disabled:bg-slate-50 disabled:text-slate-500 focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
                >
                  {(Object.keys(EMPLOYMENT_TYPE_LABELS) as EmploymentType[]).map(
                    (key) => (
                      <option key={key} value={key}>
                        {EMPLOYMENT_TYPE_LABELS[key]}
                      </option>
                    )
                  )}
                </select>
                {inspectorEmploymentType === 'sherkati-soroush' && (
                  <p className="mt-1.5 text-[11px] text-teal-800 bg-teal-50 border border-teal-200 rounded px-2.5 py-1.5 font-mono-num tabular-nums">
                    نرخ روزانه مبنا (۳۰ روزه):{' '}
                    <strong>
                      {formatMoney(
                        Math.round(parseNumericInput(inspectorSalaryInput) / 30)
                      )}{' '}
                      {currency}
                    </strong>{' '}
                    · در صفحه «مقدار اطلاعات» کارکرد از تقسیم حقوق واردشده بر پایه محاسبه می‌شود.
                  </p>
                )}
              </div>

              {/* Work Location (محل خدمت) */}
              <div>
                <label
                  htmlFor="inspector-work-location"
                  className="flex items-center gap-1.5 text-xs font-medium text-slate-700 mb-1.5"
                >
                  <MapPin className="w-3.5 h-3.5 text-teal-700" aria-hidden="true" />
                  <span>محل خدمت</span>
                </label>
                <input
                  id="inspector-work-location"
                  type="text"
                  disabled={!isAdmin}
                  value={inspectorWorkLocation}
                  onChange={(e) => setInspectorWorkLocation(e.target.value)}
                  placeholder="مثلاً ستاد مرکزی تهران"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md bg-white disabled:bg-slate-50 disabled:text-slate-500 focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
                />
                {inspectorErrors.workLocation && (
                  <p className="mt-1 text-xs text-rose-600">
                    {inspectorErrors.workLocation}
                  </p>
                )}
              </div>

              {/* Mobile & Work Phone (شماره موبایل و تلفن محل کار) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="inspector-mobile"
                    className="flex items-center gap-1.5 text-xs font-medium text-slate-700 mb-1.5"
                  >
                    <Smartphone className="w-3.5 h-3.5 text-teal-700" aria-hidden="true" />
                    <span>شماره موبایل</span>
                  </label>
                  <input
                    id="inspector-mobile"
                    type="tel"
                    inputMode="tel"
                    dir="ltr"
                    disabled={!isAdmin}
                    value={inspectorMobile}
                    onChange={(e) => setInspectorMobile(e.target.value)}
                    placeholder="09123456789"
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md bg-white disabled:bg-slate-50 disabled:text-slate-500 font-mono-num tabular-nums text-left focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
                  />
                </div>
                <div>
                  <label
                    htmlFor="inspector-work-phone"
                    className="flex items-center gap-1.5 text-xs font-medium text-slate-700 mb-1.5"
                  >
                    <Phone className="w-3.5 h-3.5 text-teal-700" aria-hidden="true" />
                    <span>تلفن محل کار</span>
                  </label>
                  <input
                    id="inspector-work-phone"
                    type="tel"
                    inputMode="tel"
                    dir="ltr"
                    disabled={!isAdmin}
                    value={inspectorWorkPhone}
                    onChange={(e) => setInspectorWorkPhone(e.target.value)}
                    placeholder="021-88401210"
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md bg-white disabled:bg-slate-50 disabled:text-slate-500 font-mono-num tabular-nums text-left focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
                  />
                </div>
              </div>

              {/* Manual Base Salary (ورود دستی مقدار حقوق) */}
              <div>
                <label
                  htmlFor="inspector-salary"
                  className="block text-xs font-medium text-slate-700 mb-1.5"
                >
                  مقدار حقوق پایه ماهانه ({currency} — ورود دستی اعداد)
                </label>
                <input
                  id="inspector-salary"
                  type="text"
                  inputMode="numeric"
                  dir="ltr"
                  disabled={!isAdmin}
                  value={inspectorSalaryInput}
                  onChange={(e) => setInspectorSalaryInput(e.target.value)}
                  placeholder="28000000"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md bg-white disabled:bg-slate-50 disabled:text-slate-500 font-mono-num tabular-nums text-left focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
                />
                <div className="mt-1 flex items-center justify-between text-[11px] text-slate-500">
                  <span>مبلغ محاسبه‌شده:</span>
                  <span className="font-mono-num tabular-nums font-semibold text-teal-800">
                    {formatMoney(parseNumericInput(inspectorSalaryInput))} {currency}
                  </span>
                </div>
                {inspectorErrors.baseMonthlySalary && (
                  <p className="mt-1 text-xs text-rose-600">
                    {inspectorErrors.baseMonthlySalary}
                  </p>
                )}
              </div>

              {/* Bank Type & Account / New Account Section */}
              <div className="pt-2 border-t border-slate-100 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-800">
                    <CreditCard className="w-3.5 h-3.5 text-teal-700" aria-hidden="true" />
                    <span>اطلاعات بانکی و شماره حساب</span>
                  </span>
                  <button
                    type="button"
                    disabled={!isAdmin}
                    onClick={() => {
                      setInspectorNewAccountMode((prev) => {
                        const next = !prev;
                        if (next) {
                          setInspectorBankAccount('');
                        } else {
                          setInspectorBankAccount(selectedEmployee.bankAccount);
                          setInspectorBankName(selectedEmployee.bankName);
                        }
                        return next;
                      });
                    }}
                    className="text-xs font-medium text-teal-700 hover:text-teal-900 disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
                  >
                    {inspectorNewAccountMode ? 'بازگشت به شماره فعلی' : '+ شماره حساب جدید'}
                  </button>
                </div>

                <div>
                  <label
                    htmlFor="inspector-bank-name"
                    className="block text-xs font-medium text-slate-700 mb-1.5"
                  >
                    نوع بانک
                  </label>
                  <select
                    id="inspector-bank-name"
                    disabled={!isAdmin}
                    value={inspectorBankName}
                    onChange={(e) => setInspectorBankName(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md bg-white disabled:bg-slate-50 disabled:text-slate-500 focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
                  >
                    {IRANIAN_BANKS.map((bank) => (
                      <option key={bank} value={bank}>
                        {bank}
                      </option>
                    ))}
                    {!IRANIAN_BANKS.includes(inspectorBankName) && inspectorBankName && (
                      <option value={inspectorBankName}>{inspectorBankName}</option>
                    )}
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="inspector-bank-account"
                    className="block text-xs font-medium text-slate-700 mb-1.5"
                  >
                    {inspectorNewAccountMode
                      ? 'ورود شماره حساب / شبا جدید'
                      : 'شماره حساب / شبا فعلی'}
                  </label>
                  <input
                    id="inspector-bank-account"
                    type="text"
                    dir="ltr"
                    disabled={!isAdmin}
                    value={inspectorBankAccount}
                    onChange={(e) => handleInspectorAccountChange(e.target.value)}
                    placeholder="IR000000000000000000000000 یا شماره حساب"
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md bg-white disabled:bg-slate-50 disabled:text-slate-500 font-mono-num tabular-nums text-left focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
                  />
                  <p className="mt-1 text-[11px] text-slate-400">
                    در صورت وارد کردن شماره شبا (IR...)، نوع بانک به صورت خودکار تشخیص داده می‌شود.
                  </p>
                </div>

                <div>
                  <label
                    htmlFor="inspector-children"
                    className="block text-xs font-medium text-slate-700 mb-1.5"
                  >
                    تعداد فرزندان (ورود عدد)
                  </label>
                  <input
                    id="inspector-children"
                    type="text"
                    inputMode="numeric"
                    dir="ltr"
                    disabled={!isAdmin}
                    value={inspectorChildrenInput}
                    onChange={(e) => setInspectorChildrenInput(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md bg-white disabled:bg-slate-50 disabled:text-slate-500 font-mono-num tabular-nums text-left focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-slate-200 flex items-center justify-between gap-3">
                <button
                  type="submit"
                  disabled={!isAdmin}
                  className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-teal-700 hover:bg-teal-800 disabled:opacity-50 disabled:cursor-not-allowed rounded-md transition-colors whitespace-nowrap shrink-0"
                >
                  {inspectorSaved && <Check className="w-4 h-4" aria-hidden="true" />}
                  <span>{inspectorSaved ? 'ذخیره شد' : 'ذخیره مشخصات'}</span>
                </button>

                <button
                  type="button"
                  disabled={!isAdmin}
                  onClick={() => openEditModal(selectedEmployee)}
                  className="text-xs font-medium text-slate-600 hover:text-slate-900 disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
                >
                  ویرایش کامل پرونده
                </button>
              </div>
            </form>
          )}
        </section>

        {/* Left/Main Area: Filter Toolbar & Employee List Table */}
        <div className="xl:col-span-8 bg-white border border-slate-200 rounded-lg">
          <div className="p-4 border-b border-slate-200 flex flex-col gap-3">
            <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
              <div className="flex-1">
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <label
                    htmlFor="emp-search"
                    className="text-xs font-semibold text-slate-800"
                  >
                    جستجوی سریع کارمند (بر اساس نام یا کد ملی)
                  </label>
                  <span className="text-[11px] text-slate-500 font-mono-num tabular-nums">
                    نمایش {toPersianDigits(filteredEmployees.length)} از{' '}
                    {toPersianDigits(employees.length)} کارمند
                  </span>
                </div>
                <div className="relative">
                  <Search
                    className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none"
                    aria-hidden="true"
                  />
                  <input
                    id="emp-search"
                    type="search"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="نام و نام خانوادگی، کد ملی (۱۰ رقمی) یا کد پرسنلی را وارد کنید..."
                    className="w-full pr-9 pl-8 py-2 text-sm border border-slate-300 rounded-md bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600 transition-colors"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      aria-label="پاک کردن جستجو"
                      className="absolute left-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700 rounded"
                    >
                      <X className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                  )}
                </div>
              </div>

              <button
                type="button"
                disabled={!isAdmin}
                onClick={openCreateModal}
                className="inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-white bg-teal-700 hover:bg-teal-800 disabled:opacity-50 disabled:cursor-not-allowed rounded-md transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2"
              >
                <Plus className="w-4 h-4" aria-hidden="true" />
                <span>افزودن کارمند</span>
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <label htmlFor="dept-filter" className="sr-only">
                فیلتر دپارتمان
              </label>
              <select
                id="dept-filter"
                value={departmentFilter}
                onChange={(e) => setDepartmentFilter(e.target.value)}
                className="px-3 py-1.5 text-xs border border-slate-200 rounded-md bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
              >
                <option value="all">همه دپارتمان‌ها</option>
                {departments.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>

              <label htmlFor="contract-filter" className="sr-only">
                فیلتر نوع قرارداد
              </label>
              <select
                id="contract-filter"
                value={contractFilter}
                onChange={(e) => setContractFilter(e.target.value)}
                className="px-3 py-1.5 text-xs border border-slate-200 rounded-md bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
              >
                <option value="all">همه قراردادها</option>
                {(Object.keys(EMPLOYMENT_TYPE_LABELS) as EmploymentType[]).map(
                  (key) => (
                    <option key={key} value={key}>
                      {EMPLOYMENT_TYPE_LABELS[key]}
                    </option>
                  )
                )}
              </select>

              <div
                className="flex items-center gap-1 p-1 bg-slate-100 rounded-md"
                role="group"
                aria-label="فیلتر وضعیت پرسنل"
              >
                {(
                  [
                    { key: 'all', label: 'همه' },
                    { key: 'active', label: 'فعال' },
                    { key: 'inactive', label: 'غیرفعال' },
                  ] as const
                ).map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setStatusFilter(item.key)}
                    className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                      statusFilter === item.key
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Employee Table */}
          {filteredEmployees.length === 0 ? (
            <div className="py-14 px-6 text-center">
              <p className="text-sm font-medium text-slate-700">
                {employees.length === 0
                  ? 'هنوز کارمندی ثبت نشده است.'
                  : 'کارمندی با این مشخصات یافت نشد.'}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {employees.length === 0
                  ? 'برای شروع محاسبه حقوق و دستمزد، اولین کارمند را اضافه کنید.'
                  : 'عبارت جستجو یا فیلترها را تغییر دهید.'}
              </p>
              {employees.length === 0 && isAdmin && (
                <button
                  type="button"
                  onClick={openCreateModal}
                  className="mt-4 inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-teal-700 hover:bg-teal-800 rounded-md transition-colors"
                >
                  <Plus className="w-4 h-4" aria-hidden="true" />
                  <span>ثبت اولین کارمند</span>
                </button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-right border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-medium text-slate-500">
                    <th className="py-2.5 px-3 whitespace-nowrap">کارمند / کد</th>
                    <th className="py-2.5 px-2.5 whitespace-nowrap">واحد و محل خدمت</th>
                    <th className="py-2.5 px-2.5 whitespace-nowrap">بانک و شماره حساب</th>
                    <th className="py-2.5 px-2.5 whitespace-nowrap">قرارداد / وضعیت</th>
                    <th className="py-2.5 px-2.5 whitespace-nowrap">حقوق پایه ({currency})</th>
                    <th className="py-2.5 px-3 whitespace-nowrap text-left">عملیات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-xs">
                  {filteredEmployees.map((emp) => {
                    const isSelected = selectedEmployee?.id === emp.id;
                    return (
                      <tr
                        key={emp.id}
                        className={`transition-colors ${
                          isSelected
                            ? 'bg-teal-50/50'
                            : 'hover:bg-slate-50/70'
                        } ${emp.isActive ? '' : 'opacity-65'}`}
                      >
                        <td className="py-3 px-3 whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => setSelectedId(emp.id)}
                            aria-label={`مشخصات کارمند ${emp.fullName}`}
                            className="text-right group"
                          >
                            <div className="text-sm font-semibold text-slate-900 group-hover:text-teal-700 transition-colors">
                              {emp.fullName}
                            </div>
                            <div className="text-[11px] text-slate-500 font-mono-num tabular-nums mt-0.5">
                              کد {toPersianDigits(emp.personnelCode)} · ملی{' '}
                              {toPersianDigits(emp.nationalId)}
                            </div>
                            {emp.mobileNumber && (
                              <div className="text-[11px] text-slate-500 font-mono-num tabular-nums mt-0.5">
                                موبایل: <span dir="ltr">{toPersianDigits(emp.mobileNumber)}</span>
                              </div>
                            )}
                          </button>
                        </td>

                        <td className="py-3 px-2.5 whitespace-nowrap">
                          <div className="font-medium text-slate-800">{emp.department}</div>
                          <div className="text-[11px] text-slate-500 mt-0.5 inline-flex items-center gap-1">
                            <Building2 className="w-3 h-3 text-slate-400" aria-hidden="true" />
                            <span>{emp.workLocation || 'ستاد مرکزی'}</span>
                          </div>
                          {emp.workPhone && (
                            <div className="text-[11px] text-slate-500 font-mono-num tabular-nums mt-0.5">
                              تلفن: <span dir="ltr">{toPersianDigits(emp.workPhone)}</span>
                            </div>
                          )}
                        </td>

                        <td className="py-3 px-2.5 whitespace-nowrap">
                          <div className="font-medium text-slate-800">
                            {emp.bankName || 'نامشخص'}
                          </div>
                          <div
                            className="text-[11px] text-slate-500 font-mono-num tabular-nums mt-0.5"
                            dir="ltr"
                            title={emp.bankAccount}
                          >
                            {formatShortAccount(emp.bankAccount)}
                          </div>
                        </td>

                        <td className="py-3 px-2.5 whitespace-nowrap">
                          <div className="text-slate-700">
                            {getEmploymentTypeLabel(emp.employmentType)}
                            <span className="mx-1 text-slate-300" aria-hidden="true">
                              ·
                            </span>
                            {MARITAL_LABELS[emp.maritalStatus]}
                          </div>
                          <button
                            type="button"
                            disabled={!isAdmin}
                            onClick={() => onToggleActive(emp.id)}
                            aria-label={
                              emp.isActive
                                ? `غیرفعال کردن ${emp.fullName}`
                                : `فعال کردن ${emp.fullName}`
                            }
                            className={`mt-0.5 inline-flex items-center gap-1 text-[11px] font-medium disabled:opacity-60 disabled:cursor-not-allowed ${
                              emp.isActive ? 'text-emerald-700' : 'text-slate-500'
                            }`}
                          >
                            {emp.isActive ? (
                              <UserCheck className="w-3 h-3" aria-hidden="true" />
                            ) : (
                              <UserX className="w-3 h-3" aria-hidden="true" />
                            )}
                            <span>{emp.isActive ? 'فعال' : 'غیرفعال'}</span>
                          </button>
                        </td>

                        <td className="py-3 px-2.5 font-mono-num tabular-nums text-sm font-semibold text-slate-900 whitespace-nowrap">
                          {formatMoney(emp.baseMonthlySalary)}
                        </td>

                        <td className="py-3 px-3 whitespace-nowrap text-left">
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              disabled={!isAdmin}
                              onClick={() => openEditModal(emp)}
                              aria-label={`ویرایش ${emp.fullName}`}
                              className="p-1.5 text-slate-500 hover:text-teal-700 hover:bg-teal-50 disabled:opacity-40 disabled:cursor-not-allowed rounded transition-colors"
                            >
                              <Edit3 className="w-4 h-4" aria-hidden="true" />
                            </button>
                            {confirmDeleteId === emp.id && isAdmin ? (
                              <div className="inline-flex items-center gap-1 bg-rose-50 px-2 py-1 rounded border border-rose-200">
                                <button
                                  type="button"
                                  onClick={() => {
                                    onDeleteEmployee(emp.id);
                                    setConfirmDeleteId(null);
                                  }}
                                  className="text-xs font-medium text-rose-700 hover:text-rose-900 px-1"
                                >
                                  تایید حذف
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteId(null)}
                                  className="text-xs text-slate-600 hover:text-slate-900 px-1"
                                >
                                  انصراف
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                disabled={!isAdmin}
                                onClick={() => setConfirmDeleteId(emp.id)}
                                aria-label={`حذف ${emp.fullName}`}
                                className="p-1.5 text-slate-500 hover:text-rose-700 hover:bg-rose-50 disabled:opacity-40 disabled:cursor-not-allowed rounded transition-colors"
                              >
                                <Trash2 className="w-4 h-4" aria-hidden="true" />
                              </button>
                            )}
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

      {/* Dedicated Table: مقدار وارد شده حقوق بر اساس دستی (حقوق اول تا پنجم) */}
      <section
        aria-label="جدول مقدار وارد شده حقوق بر اساس دستی"
        className="bg-white border border-slate-200 rounded-lg overflow-hidden"
      >
        <div className="px-5 py-4 border-b border-slate-200 bg-slate-50/70 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">
              مقدار وارد شده حقوق بر اساس دستی (تا ۵ حقوق برای هر کارمند)
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              در این جدول می‌توانید برای هر فرد حقوق اول تا حقوق پنجم را به ترتیب و به صورت دستی وارد کنید تا مجموع آن‌ها در حقوق پایه محاسبه شود.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            {manualSalarySavedToast && (
              <span className="text-xs font-medium text-emerald-700">
                مقادیر حقوق دستی ثبت شد
              </span>
            )}
            <button
              type="button"
              disabled={employees.length === 0}
              onClick={() => {
                const rows: ThreeColumnExcelRow[] = [];
                for (const emp of employees) {
                  const tiers = getEmployeeDraftTiers(emp);
                  const baseCode = toEnglishDigits(emp.personnelCode.trim());
                  let subIndex = 0;
                  for (let i = 0; i < tiers.length; i += 1) {
                    if (tiers[i] <= 0) continue;
                    rows.push({
                      code: subIndex === 0 ? baseCode : `${baseCode}-${subIndex}`,
                      title: `${emp.fullName} - ${SALARY_TIER_LABELS[i]}`,
                      amount: Math.round(tiers[i]),
                    });
                    subIndex += 1;
                  }
                }
                downloadRtlThreeColumnXlsx(rows, 'employee-manual-tiers.xlsx', {
                  includeHeaderRow: false,
                  sheetName: 'Sheet1',
                });
              }}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 disabled:opacity-40 disabled:cursor-not-allowed rounded-md transition-colors whitespace-nowrap shrink-0"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" aria-hidden="true" />
              <span>خروجی اکسل (.xlsx)</span>
            </button>
            <button
              type="button"
              disabled={!isAdmin || !hasManualSalaryChanges}
              onClick={handleSaveAllManualSalaries}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-teal-700 hover:bg-teal-800 disabled:opacity-50 disabled:cursor-not-allowed rounded-md transition-colors whitespace-nowrap shrink-0"
            >
              <Check className="w-3.5 h-3.5" aria-hidden="true" />
              <span>ثبت مقادیر حقوق دستی</span>
            </button>
          </div>
        </div>

        {employees.length === 0 ? (
          <div className="py-10 px-6 text-center text-xs text-slate-500">
            کارمندی برای ورود حقوق دستی ثبت نشده است.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-medium text-slate-500">
                  <th className="py-2.5 px-2.5 whitespace-nowrap">کارمند / کد</th>
                  {SALARY_TIER_LABELS.map((label) => (
                    <th key={label} className="py-2.5 px-1.5 whitespace-nowrap">
                      {label}
                    </th>
                  ))}
                  <th className="py-2.5 px-2.5 whitespace-nowrap">
                    جمع کل حقوق ({currency})
                  </th>
                  <th className="py-2.5 px-2.5 whitespace-nowrap text-left">عملیات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-xs">
                {(searchQuery.trim() ? filteredEmployees : employees).map((emp) => {
                  const defaultTiers = normalizeManualSalaries(
                    emp.manualSalaries,
                    emp.baseMonthlySalary
                  );
                  const rawTuple =
                    manualSalaryDrafts[emp.id] ??
                    ([
                      String(defaultTiers[0]),
                      String(defaultTiers[1]),
                      String(defaultTiers[2]),
                      String(defaultTiers[3]),
                      String(defaultTiers[4]),
                    ] as [string, string, string, string, string]);
                  const parsedTiers = getEmployeeDraftTiers(emp);
                  const draftTotal = sumManualSalaries(parsedTiers);
                  const isModified = isEmployeeManualModified(emp);

                  return (
                    <tr
                      key={emp.id}
                      className={`transition-colors ${
                        isModified ? 'bg-teal-50/40' : 'hover:bg-slate-50/70'
                      }`}
                    >
                      <td className="py-2.5 px-2.5 whitespace-nowrap">
                        <div className="font-semibold text-slate-900">{emp.fullName}</div>
                        <div className="text-[11px] text-slate-500 font-mono-num tabular-nums mt-0.5">
                          کد {toPersianDigits(emp.personnelCode)} · {emp.workLocation || 'ستاد مرکزی'}
                        </div>
                      </td>

                      {SALARY_TIER_LABELS.map((tierLabel, tierIdx) => (
                        <td key={tierLabel} className="py-2 px-1.5 whitespace-nowrap align-top">
                          <div className="w-28">
                            <input
                              id={`manual-salary-${tierIdx}-${emp.id}`}
                              type="text"
                              inputMode="numeric"
                              dir="ltr"
                              disabled={!isAdmin}
                              aria-label={`${tierLabel} ${emp.fullName}`}
                              value={rawTuple[tierIdx] ?? '0'}
                              onChange={(e) => {
                                const nextVal = e.target.value;
                                setManualSalaryDrafts((prev) => {
                                  const cur =
                                    prev[emp.id] ??
                                    ([
                                      String(defaultTiers[0]),
                                      String(defaultTiers[1]),
                                      String(defaultTiers[2]),
                                      String(defaultTiers[3]),
                                      String(defaultTiers[4]),
                                    ] as [string, string, string, string, string]);
                                  const updatedTuple: [
                                    string,
                                    string,
                                    string,
                                    string,
                                    string,
                                  ] = [cur[0], cur[1], cur[2], cur[3], cur[4]];
                                  updatedTuple[tierIdx] = nextVal;
                                  return {
                                    ...prev,
                                    [emp.id]: updatedTuple,
                                  };
                                });
                              }}
                              className="w-full px-2 py-1 text-xs border border-slate-200 rounded-md bg-white disabled:bg-slate-50 disabled:text-slate-500 font-mono-num tabular-nums text-left focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
                            />
                            <div
                              className="mt-0.5 text-[10px] font-mono-num tabular-nums text-slate-500 text-left"
                              dir="ltr"
                            >
                              {formatMoney(parsedTiers[tierIdx])}
                            </div>
                          </div>
                        </td>
                      ))}

                      <td className="py-2.5 px-2.5 whitespace-nowrap">
                        <div className="font-mono-num tabular-nums text-sm font-semibold text-teal-800">
                          {formatMoney(draftTotal)}
                        </div>
                        {draftTotal <= 0 ? (
                          <div className="text-[10px] text-rose-600 mt-0.5">
                            جمع حقوق باید &gt; ۰ باشد
                          </div>
                        ) : (
                          draftTotal !== emp.baseMonthlySalary && (
                            <div className="text-[10px] text-slate-500 font-mono-num tabular-nums mt-0.5">
                              فعلی: {formatMoney(emp.baseMonthlySalary)}
                            </div>
                          )
                        )}
                      </td>

                      <td className="py-2.5 px-2.5 whitespace-nowrap text-left">
                        <button
                          type="button"
                          disabled={!isAdmin || !isModified}
                          onClick={() => handleSaveSingleManualSalary(emp)}
                          className="px-2.5 py-1 text-xs font-medium text-teal-800 bg-teal-50 hover:bg-teal-100 border border-teal-200 disabled:opacity-40 disabled:cursor-not-allowed rounded transition-colors whitespace-nowrap"
                        >
                          ثبت
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-slate-50 border-t border-slate-200 text-xs font-semibold text-slate-900">
                  <td className="py-3 px-2.5 whitespace-nowrap">
                    جمع کل ({toPersianDigits(employees.length)} نفر)
                  </td>
                  {SALARY_TIER_LABELS.map((label, tierIdx) => (
                    <td
                      key={label}
                      className="py-3 px-1.5 font-mono-num tabular-nums text-slate-700 whitespace-nowrap"
                    >
                      {formatMoney(
                        employees.reduce(
                          (sum, emp) => sum + getEmployeeDraftTiers(emp)[tierIdx],
                          0
                        )
                      )}
                    </td>
                  ))}
                  <td className="py-3 px-2.5 font-mono-num tabular-nums text-teal-800 whitespace-nowrap">
                    {formatMoney(
                      employees.reduce(
                        (sum, emp) => sum + sumManualSalaries(getEmployeeDraftTiers(emp)),
                        0
                      )
                    )}{' '}
                    {currency}
                  </td>
                  <td className="py-3 px-2.5" />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>

      {/* Add / Edit Employee Modal */}
      {isModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="employee-modal-title"
        >
          <div className="bg-white border border-slate-200 rounded-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-lg">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <h2
                id="employee-modal-title"
                className="text-base font-semibold text-slate-900"
              >
                {editingEmployee
                  ? `ویرایش مشخصات ${editingEmployee.fullName}`
                  : 'ثبت کارمند جدید'}
              </h2>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                aria-label="بستن پنجره"
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded transition-colors"
              >
                <X className="w-5 h-5" aria-hidden="true" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-5" noValidate>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label
                    htmlFor="emp-fullname"
                    className="block text-xs font-medium text-slate-700 mb-1.5"
                  >
                    نام و نام خانوادگی *
                  </label>
                  <input
                    id="emp-fullname"
                    type="text"
                    value={formState.fullName}
                    onChange={(e) =>
                      setFormState((s) => ({ ...s, fullName: e.target.value }))
                    }
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
                    placeholder="مثلاً سارا محمدی"
                  />
                  {errors.fullName && (
                    <p className="mt-1 text-xs text-rose-600">{errors.fullName}</p>
                  )}
                </div>

                <div>
                  <label
                    htmlFor="emp-code"
                    className="block text-xs font-medium text-slate-700 mb-1.5"
                  >
                    کد پرسنلی *
                  </label>
                  <input
                    id="emp-code"
                    type="text"
                    value={formState.personnelCode}
                    onChange={(e) =>
                      setFormState((s) => ({ ...s, personnelCode: e.target.value }))
                    }
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md font-mono-num tabular-nums focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
                    placeholder="مثلاً 1006"
                  />
                  {errors.personnelCode && (
                    <p className="mt-1 text-xs text-rose-600">{errors.personnelCode}</p>
                  )}
                </div>

                <div>
                  <label
                    htmlFor="emp-national-id"
                    className="block text-xs font-medium text-slate-700 mb-1.5"
                  >
                    کد ملی (۱۰ رقمی) *
                  </label>
                  <input
                    id="emp-national-id"
                    type="text"
                    inputMode="numeric"
                    maxLength={10}
                    value={formState.nationalId}
                    onChange={(e) =>
                      setFormState((s) => ({ ...s, nationalId: e.target.value }))
                    }
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md font-mono-num tabular-nums focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
                    placeholder="0012345678"
                  />
                  {errors.nationalId && (
                    <p className="mt-1 text-xs text-rose-600">{errors.nationalId}</p>
                  )}
                </div>

                <div>
                  <label
                    htmlFor="emp-hire-date"
                    className="block text-xs font-medium text-slate-700 mb-1.5"
                  >
                    تاریخ استخدام
                  </label>
                  <input
                    id="emp-hire-date"
                    type="text"
                    value={formState.hireDate}
                    onChange={(e) =>
                      setFormState((s) => ({ ...s, hireDate: e.target.value }))
                    }
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md font-mono-num tabular-nums focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
                    placeholder="1405/01/01"
                  />
                </div>

                <div>
                  <label
                    htmlFor="emp-dept"
                    className="block text-xs font-medium text-slate-700 mb-1.5"
                  >
                    دپارتمان / واحد *
                  </label>
                  <input
                    id="emp-dept"
                    type="text"
                    value={formState.department}
                    onChange={(e) =>
                      setFormState((s) => ({ ...s, department: e.target.value }))
                    }
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
                    placeholder="مثلاً مالی و حسابداری"
                  />
                  {errors.department && (
                    <p className="mt-1 text-xs text-rose-600">{errors.department}</p>
                  )}
                </div>

                <div>
                  <label
                    htmlFor="emp-job"
                    className="block text-xs font-medium text-slate-700 mb-1.5"
                  >
                    سمت شغلی *
                  </label>
                  <input
                    id="emp-job"
                    type="text"
                    value={formState.jobTitle}
                    onChange={(e) =>
                      setFormState((s) => ({ ...s, jobTitle: e.target.value }))
                    }
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
                    placeholder="مثلاً کارشناس مالی"
                  />
                  {errors.jobTitle && (
                    <p className="mt-1 text-xs text-rose-600">{errors.jobTitle}</p>
                  )}
                </div>

                <div>
                  <label
                    htmlFor="emp-work-location"
                    className="block text-xs font-medium text-slate-700 mb-1.5"
                  >
                    محل خدمت
                  </label>
                  <input
                    id="emp-work-location"
                    type="text"
                    value={formState.workLocation}
                    onChange={(e) =>
                      setFormState((s) => ({ ...s, workLocation: e.target.value }))
                    }
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
                    placeholder="مثلاً ستاد مرکزی تهران"
                  />
                </div>

                <div>
                  <label
                    htmlFor="emp-base-salary"
                    className="block text-xs font-medium text-slate-700 mb-1.5"
                  >
                    حقوق پایه ماهانه ({currency} — ورود دستی) *
                  </label>
                  <input
                    id="emp-base-salary"
                    type="text"
                    inputMode="numeric"
                    dir="ltr"
                    value={salaryInputText}
                    onChange={(e) => setSalaryInputText(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md font-mono-num tabular-nums text-left focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
                    placeholder="18000000"
                  />
                  <p className="mt-1 text-[11px] text-teal-800 font-mono-num tabular-nums">
                    {formatMoney(parseNumericInput(salaryInputText))} {currency}
                  </p>
                  {errors.baseMonthlySalary && (
                    <p className="mt-1 text-xs text-rose-600">
                      {errors.baseMonthlySalary}
                    </p>
                  )}
                </div>

                <div>
                  <label
                    htmlFor="emp-mobile"
                    className="block text-xs font-medium text-slate-700 mb-1.5"
                  >
                    شماره موبایل
                  </label>
                  <input
                    id="emp-mobile"
                    type="tel"
                    inputMode="tel"
                    dir="ltr"
                    value={formState.mobileNumber}
                    onChange={(e) =>
                      setFormState((s) => ({ ...s, mobileNumber: e.target.value }))
                    }
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md font-mono-num tabular-nums text-left focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
                    placeholder="09123456789"
                  />
                </div>

                <div>
                  <label
                    htmlFor="emp-work-phone"
                    className="block text-xs font-medium text-slate-700 mb-1.5"
                  >
                    تلفن محل کار
                  </label>
                  <input
                    id="emp-work-phone"
                    type="tel"
                    inputMode="tel"
                    dir="ltr"
                    value={formState.workPhone}
                    onChange={(e) =>
                      setFormState((s) => ({ ...s, workPhone: e.target.value }))
                    }
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md font-mono-num tabular-nums text-left focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
                    placeholder="021-88401210"
                  />
                </div>

                <div>
                  <label
                    htmlFor="emp-type"
                    className="block text-xs font-medium text-slate-700 mb-1.5"
                  >
                    نوع قرارداد
                  </label>
                  <select
                    id="emp-type"
                    value={formState.employmentType}
                    onChange={(e) =>
                      setFormState((s) => ({
                        ...s,
                        employmentType: e.target.value as EmploymentType,
                      }))
                    }
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
                  >
                    {(Object.keys(EMPLOYMENT_TYPE_LABELS) as EmploymentType[]).map(
                      (key) => (
                        <option key={key} value={key}>
                          {EMPLOYMENT_TYPE_LABELS[key]}
                        </option>
                      )
                    )}
                  </select>
                  {formState.employmentType === 'retired' && (
                    <p className="mt-1 text-[11px] text-teal-700">
                      کارمندان بازنشسته از کسر بیمه تامین اجتماعی معاف هستند.
                    </p>
                  )}
                  {formState.employmentType === 'sherkati-soroush' && (
                    <p className="mt-1 text-[11px] text-teal-700">
                      برای شرکتی سروش نرخ روزانه و کارکرد از تقسیم حقوق واردشده بر حقوق پایه محاسبه می‌شود.
                    </p>
                  )}
                </div>

                <div>
                  <label
                    htmlFor="emp-marital"
                    className="block text-xs font-medium text-slate-700 mb-1.5"
                  >
                    وضعیت تاهل
                  </label>
                  <select
                    id="emp-marital"
                    value={formState.maritalStatus}
                    onChange={(e) =>
                      setFormState((s) => ({
                        ...s,
                        maritalStatus: e.target.value as MaritalStatus,
                      }))
                    }
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
                  >
                    <option value="single">مجرد</option>
                    <option value="married">متاهل</option>
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="emp-children"
                    className="block text-xs font-medium text-slate-700 mb-1.5"
                  >
                    تعداد فرزندان مشمول حق اولاد
                  </label>
                  <input
                    id="emp-children"
                    type="number"
                    min={0}
                    max={15}
                    value={formState.childrenCount}
                    onChange={(e) =>
                      setFormState((s) => ({
                        ...s,
                        childrenCount: Math.max(0, Number(e.target.value) || 0),
                      }))
                    }
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md font-mono-num tabular-nums focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
                  />
                  {errors.childrenCount && (
                    <p className="mt-1 text-xs text-rose-600">{errors.childrenCount}</p>
                  )}
                </div>

                <div>
                  <label
                    htmlFor="emp-bank-name"
                    className="block text-xs font-medium text-slate-700 mb-1.5"
                  >
                    نوع بانک
                  </label>
                  <select
                    id="emp-bank-name"
                    value={formState.bankName}
                    onChange={(e) =>
                      setFormState((s) => ({ ...s, bankName: e.target.value }))
                    }
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
                  >
                    {IRANIAN_BANKS.map((bank) => (
                      <option key={bank} value={bank}>
                        {bank}
                      </option>
                    ))}
                    {!IRANIAN_BANKS.includes(formState.bankName) && formState.bankName && (
                      <option value={formState.bankName}>{formState.bankName}</option>
                    )}
                  </select>
                </div>

                <div className="sm:col-span-2">
                  <label
                    htmlFor="emp-bank"
                    className="block text-xs font-medium text-slate-700 mb-1.5"
                  >
                    شماره حساب / شبا
                  </label>
                  <input
                    id="emp-bank"
                    type="text"
                    dir="ltr"
                    value={formState.bankAccount}
                    onChange={(e) => handleModalBankAccountChange(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md font-mono-num tabular-nums text-left focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
                    placeholder="IR000000000000000000000000"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between pt-4 border-t border-slate-200">
                <label className="inline-flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formState.isActive}
                    onChange={(e) =>
                      setFormState((s) => ({ ...s, isActive: e.target.checked }))
                    }
                    className="w-4 h-4 accent-teal-700 rounded"
                  />
                  <span>کارمند در لیست محاسبه حقوق فعال باشد</span>
                </label>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-md transition-colors whitespace-nowrap shrink-0"
                  >
                    انصراف
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 text-sm font-medium text-white bg-teal-700 hover:bg-teal-800 rounded-md transition-colors whitespace-nowrap shrink-0"
                  >
                    {editingEmployee ? 'ذخیره تغییرات' : 'ثبت کارمند'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
