import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  Building2,
  Check,
  CreditCard,
  Edit3,
  FileSpreadsheet,
  Lock,
  MapPin,
  Phone,
  Plus,
  Search,
  Smartphone,
  Upload,
  UserCheck,
  UserCog,
  Users,
  UserX,
  X,
} from 'lucide-react';
import type {
  CurrencyUnit,
  Employee,
  EmployeeAllowanceFlags,
  EmploymentType,
  MaritalStatus,
  SalaryCalculationMode,
} from '../types/payroll';
import {
  ALL_EMPLOYMENT_TYPES,
  DEFAULT_ALLOWANCE_FLAGS,
  EMPLOYMENT_TYPE_LABELS,
  EMPLOYMENT_UNIT_OPTIONS,
  IRANIAN_BANKS,
  SALARY_CALCULATION_MODE_LABELS,
  SALARY_CALCULATION_MODE_SHORT_LABELS,
  detectBankFromSheba,
  formatMoney,
  getEffectiveSalaryMode,
  getEmploymentTypeLabel,
  normalizeAllowanceFlags,
  normalizeCustomTierAmounts,
  normalizeManualSalaries,
  parseNumericInput,
  toEnglishDigits,
  toPersianDigits,
  validateEmployeeInput,
  type ValidationErrors,
} from '../utils/payroll';
import { extractEmployeeDepartments } from '../utils/manualSalaryFilter';
import { filterEmployees } from '../utils/employeeFilter';
import { resolveStrictTierIndexFromLocation } from '../utils/tierExtraction';
import { downloadEmployeesXlsx } from '../utils/xlsxExport';
import {
  importEmployeesFromRows,
  parseSpreadsheetFile,
} from '../utils/xlsxImport';
import { CollapsibleCard } from './CollapsibleCard';
import { ContractDepartmentChecklist } from './ContractDepartmentChecklist';

interface EmployeesPageProps {
  employees: Employee[];
  currency: CurrencyUnit;
  canManageEmployees: boolean;
  onAddEmployee: (emp: Omit<Employee, 'id'>) => void;
  onUpdateEmployee: (emp: Employee) => void;
  onToggleActive: (id: string) => void;
  onImportEmployeesBatch?: (nextEmployees: Employee[]) => void;
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
  customContractTitle: '',
  salaryCalculationMode: 'daily-divided',
  allowanceFlags: { ...DEFAULT_ALLOWANCE_FLAGS },
  baseMonthlySalary: 15_000_000,
  seniorityAllowance: 0,
  insuranceBaseCap: 0,
  manualSalaries: [15_000_000, 0, 0, 0, 0, 0, 0, 0],
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

const ALLOWANCE_FLAG_LABELS: ReadonlyArray<{
  key: keyof EmployeeAllowanceFlags;
  label: string;
}> = [
  { key: 'housing', label: 'حق مسکن' },
  { key: 'food', label: 'بن خواربار' },
  { key: 'marital', label: 'حق عائله‌مندی / تاهل' },
  { key: 'child', label: 'حق اولاد / فرزند' },
  { key: 'otherFixed', label: 'سایر مزایای ثابت (ماده ۲۸ / سروش)' },
];

export const EmployeesPage: React.FC<EmployeesPageProps> = ({
  employees,
  currency,
  canManageEmployees,
  onAddEmployee,
  onUpdateEmployee,
  onToggleActive,
  onImportEmployeesBatch,
}) => {
  const departments = useMemo(
    () => extractEmployeeDepartments(employees),
    [employees]
  );

  const [activeSubView, setActiveSubView] = useState<'list' | 'details'>('list');
  const [excelImportStatus, setExcelImportStatus] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);
  const employeesExcelInputRef = useRef<HTMLInputElement>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDepartments, setSelectedDepartments] = useState<string[]>(() =>
    extractEmployeeDepartments(employees)
  );
  const [selectedContracts, setSelectedContracts] = useState<EmploymentType[]>(
    () => [...ALL_EMPLOYMENT_TYPES]
  );
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>(
    'all'
  );
  const knownDepartmentsRef = useRef<Set<string>>(new Set(departments));

  useEffect(() => {
    const brandNew = departments.filter(
      (d) => !knownDepartmentsRef.current.has(d)
    );
    if (brandNew.length > 0) {
      brandNew.forEach((d) => knownDepartmentsRef.current.add(d));
      setSelectedDepartments((prev) => [...prev, ...brandNew]);
    }
  }, [departments]);

  const [selectedId, setSelectedId] = useState<string | null>(
    employees[0]?.id ?? null
  );

  // Right-side Inspector quick-edit state
  const [inspectorEmploymentType, setInspectorEmploymentType] =
    useState<EmploymentType>('employed');
  const [inspectorCustomContract, setInspectorCustomContract] = useState('');
  const [inspectorSalaryMode, setInspectorSalaryMode] =
    useState<SalaryCalculationMode>('daily-divided');
  const [inspectorAllowanceFlags, setInspectorAllowanceFlags] =
    useState<EmployeeAllowanceFlags>({ ...DEFAULT_ALLOWANCE_FLAGS });
  const [inspectorWorkLocation, setInspectorWorkLocation] = useState('');
  const [inspectorMobile, setInspectorMobile] = useState('');
  const [inspectorWorkPhone, setInspectorWorkPhone] = useState('');
  const [inspectorBankName, setInspectorBankName] = useState('بانک ملی ایران');
  const [inspectorBankAccount, setInspectorBankAccount] = useState('');
  const [inspectorNewAccountMode, setInspectorNewAccountMode] = useState(false);
  const [inspectorSalaryInput, setInspectorSalaryInput] = useState('');
  const [inspectorSeniorityInput, setInspectorSeniorityInput] = useState('0');
  const [inspectorInsuranceCapInput, setInspectorInsuranceCapInput] =
    useState('0');
  const [inspectorMaritalStatus, setInspectorMaritalStatus] =
    useState<MaritalStatus>('single');
  const [inspectorChildrenInput, setInspectorChildrenInput] = useState('0');
  const [inspectorErrors, setInspectorErrors] = useState<ValidationErrors>({});
  const [inspectorSaved, setInspectorSaved] = useState(false);

  // Full Create / Edit Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [formState, setFormState] = useState<Omit<Employee, 'id'>>(EMPTY_FORM);
  const [salaryInputText, setSalaryInputText] = useState('15000000');
  const [seniorityInputText, setSeniorityInputText] = useState('0');
  const [insuranceCapInputText, setInsuranceCapInputText] = useState('0');
  const [errors, setErrors] = useState<ValidationErrors>({});

  const selectedEmployee = useMemo(
    () => employees.find((e) => e.id === selectedId) ?? employees[0] ?? null,
    [employees, selectedId]
  );

  useEffect(() => {
    if (!selectedEmployee) return;
    setInspectorEmploymentType(selectedEmployee.employmentType);
    setInspectorCustomContract(selectedEmployee.customContractTitle ?? '');
    setInspectorSalaryMode(getEffectiveSalaryMode(selectedEmployee));
    setInspectorAllowanceFlags(
      normalizeAllowanceFlags(selectedEmployee.allowanceFlags)
    );
    setInspectorWorkLocation(selectedEmployee.workLocation);
    setInspectorMobile(selectedEmployee.mobileNumber ?? '');
    setInspectorWorkPhone(selectedEmployee.workPhone ?? '');
    setInspectorBankName(selectedEmployee.bankName || 'بانک ملی ایران');
    setInspectorBankAccount(selectedEmployee.bankAccount);
    setInspectorNewAccountMode(false);
    setInspectorSalaryInput(String(selectedEmployee.baseMonthlySalary));
    setInspectorSeniorityInput(String(selectedEmployee.seniorityAllowance ?? 0));
    setInspectorInsuranceCapInput(String(selectedEmployee.insuranceBaseCap ?? 0));
    setInspectorMaritalStatus(selectedEmployee.maritalStatus);
    setInspectorChildrenInput(String(selectedEmployee.childrenCount));
    setInspectorErrors({});
    setInspectorSaved(false);
  }, [selectedEmployee]);

  const filteredEmployees = useMemo(
    () =>
      filterEmployees(employees, {
        searchQuery,
        selectedDepartments,
        selectedContracts,
        statusFilter,
      }),
    [employees, searchQuery, selectedDepartments, selectedContracts, statusFilter]
  );

  const hasActiveFilters = Boolean(
    searchQuery.trim() ||
      selectedDepartments.length < departments.length ||
      selectedContracts.length < ALL_EMPLOYMENT_TYPES.length ||
      statusFilter !== 'all'
  );

  const resetAllFilters = () => {
    setSearchQuery('');
    setSelectedDepartments(departments);
    setSelectedContracts([...ALL_EMPLOYMENT_TYPES]);
    setStatusFilter('all');
  };

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
    if (!selectedEmployee || !canManageEmployees) return;

    const salaryNum = parseNumericInput(inspectorSalaryInput);
    const seniorityNum = parseNumericInput(inspectorSeniorityInput);
    const insuranceCapNum = parseNumericInput(inspectorInsuranceCapInput);
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

    const salaryUnchanged = salaryNum === selectedEmployee.baseMonthlySalary;
    let preservedManualSalaries = normalizeManualSalaries(
      selectedEmployee.manualSalaries,
      salaryNum,
      selectedEmployee.customTierAmounts
    );
    let preservedCustomTiers = normalizeCustomTierAmounts(
      selectedEmployee.customTierAmounts
    );

    if (!salaryUnchanged) {
      const strictIdx = resolveStrictTierIndexFromLocation(
        inspectorWorkLocation.trim(),
        selectedEmployee.department
      );
      if (strictIdx !== null) {
        const nextTiers: [
          number,
          number,
          number,
          number,
          number,
          number,
          number,
          number,
        ] = [0, 0, 0, 0, 0, 0, 0, 0];
        nextTiers[strictIdx] = salaryNum;
        preservedManualSalaries = nextTiers;
        preservedCustomTiers = {};
      } else {
        const locTrimmed = inspectorWorkLocation.trim();
        const customUnit =
          (locTrimmed &&
          locTrimmed !== 'ستاد مرکزی تهران' &&
          locTrimmed !== 'ستاد مرکزی'
            ? locTrimmed
            : '') || selectedEmployee.department.trim();
        if (customUnit) {
          preservedManualSalaries = [0, 0, 0, 0, 0, 0, 0, 0];
          preservedCustomTiers = { [customUnit]: salaryNum };
        } else {
          preservedManualSalaries = [salaryNum, 0, 0, 0, 0, 0, 0, 0];
          preservedCustomTiers = {};
        }
      }
    }

    onUpdateEmployee({
      ...selectedEmployee,
      employmentType: inspectorEmploymentType,
      customContractTitle:
        inspectorEmploymentType === 'custom'
          ? inspectorCustomContract.trim()
          : '',
      salaryCalculationMode: inspectorSalaryMode,
      allowanceFlags: inspectorAllowanceFlags,
      workLocation: inspectorWorkLocation.trim(),
      mobileNumber: toEnglishDigits(inspectorMobile.trim()),
      workPhone: toEnglishDigits(inspectorWorkPhone.trim()),
      bankName: inspectorBankName,
      bankAccount: toEnglishDigits(inspectorBankAccount.trim()),
      baseMonthlySalary: salaryNum,
      seniorityAllowance: seniorityNum,
      insuranceBaseCap: insuranceCapNum,
      manualSalaries: preservedManualSalaries,
      customTierAmounts: preservedCustomTiers,
      maritalStatus: inspectorMaritalStatus,
      childrenCount: childrenNum,
    });
    setInspectorErrors({});
    setInspectorNewAccountMode(false);
    setInspectorSaved(true);
    window.setTimeout(() => setInspectorSaved(false), 2000);
  };

  const handleExportEmployeesExcel = () => {
    downloadEmployeesXlsx(employees, 'employees-profiles-rtl.xlsx');
  };

  const handleImportEmployeesExcel = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !canManageEmployees) return;

    try {
      const rows = await parseSpreadsheetFile(file);
      const res = importEmployeesFromRows(rows, employees);
      if (res.createdCount === 0 && res.updatedCount === 0) {
        setExcelImportStatus({
          type: 'error',
          message:
            'هیچ ردیف کارمند معتبری در فایل اکسل یافت نشد. لطفاً از فایل خروجی مشخصات کارمندان استفاده کنید.',
        });
        return;
      }
      if (onImportEmployeesBatch) {
        onImportEmployeesBatch(res.updatedEmployees);
      } else {
        for (const emp of res.updatedEmployees) {
          const exists = employees.some((ex) => ex.id === emp.id);
          if (exists) {
            onUpdateEmployee(emp);
          } else {
            const { id: _id, ...rest } = emp;
            onAddEmployee(rest);
          }
        }
      }
      setExcelImportStatus({
        type: 'success',
        message: `ورود مشخصات کارمندان با موفقیت انجام شد: ${toPersianDigits(
          res.createdCount
        )} کارمند جدید و ${toPersianDigits(res.updatedCount)} کارمند بروزرسانی شد.`,
      });
      window.setTimeout(() => setExcelImportStatus(null), 5000);
    } catch {
      setExcelImportStatus({
        type: 'error',
        message:
          'خطا در خواندن فایل اکسل مشخصات کارمندان. لطفاً فایل .xlsx یا .csv معتبر انتخاب کنید.',
      });
    }
  };

  const openDetailsForEmployee = (empId: string) => {
    setSelectedId(empId);
    setActiveSubView('details');
  };

  const openCreateModal = () => {
    if (!canManageEmployees) return;
    const nextCodeNum =
      employees.reduce((max, e) => {
        const parsed = parseInt(toEnglishDigits(e.personnelCode), 10);
        return Number.isFinite(parsed) ? Math.max(max, parsed) : max;
      }, 1000) + 1;

    setEditingEmployee(null);
    setFormState({
      ...EMPTY_FORM,
      personnelCode: String(nextCodeNum),
      allowanceFlags: { ...DEFAULT_ALLOWANCE_FLAGS },
    });
    setSalaryInputText(String(EMPTY_FORM.baseMonthlySalary));
    setSeniorityInputText('0');
    setInsuranceCapInputText('0');
    setErrors({});
    setIsModalOpen(true);
  };

  const openEditModal = (emp: Employee) => {
    if (!canManageEmployees) return;
    setEditingEmployee(emp);
    const { id: _id, ...rest } = emp;
    setFormState({
      ...rest,
      customContractTitle: emp.customContractTitle ?? '',
      salaryCalculationMode: getEffectiveSalaryMode(emp),
      allowanceFlags: normalizeAllowanceFlags(emp.allowanceFlags),
    });
    setSalaryInputText(String(emp.baseMonthlySalary));
    setSeniorityInputText(String(emp.seniorityAllowance ?? 0));
    setInsuranceCapInputText(String(emp.insuranceBaseCap ?? 0));
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
    if (!canManageEmployees) return;
    const parsedSalary = parseNumericInput(salaryInputText);
    const parsedSeniority = parseNumericInput(seniorityInputText);
    const parsedInsuranceCap = parseNumericInput(insuranceCapInputText);
    const cleanDept = formState.department.trim();
    const cleanWorkLoc = formState.workLocation.trim() || 'ستاد مرکزی';
    const salaryUnchanged =
      Boolean(editingEmployee) &&
      parsedSalary === editingEmployee?.baseMonthlySalary;

    let preservedManualSalaries: [
      number,
      number,
      number,
      number,
      number,
      number,
      number,
      number,
    ] = [parsedSalary, 0, 0, 0, 0, 0, 0, 0];
    let preservedCustomTiers: Record<string, number> = {};

    if (salaryUnchanged && editingEmployee) {
      preservedManualSalaries = normalizeManualSalaries(
        editingEmployee.manualSalaries,
        parsedSalary,
        editingEmployee.customTierAmounts
      );
      preservedCustomTiers = normalizeCustomTierAmounts(
        editingEmployee.customTierAmounts
      );
    } else {
      const strictIdx = resolveStrictTierIndexFromLocation(
        cleanWorkLoc,
        cleanDept
      );
      if (strictIdx !== null) {
        const nextTiers: [
          number,
          number,
          number,
          number,
          number,
          number,
          number,
          number,
        ] = [0, 0, 0, 0, 0, 0, 0, 0];
        nextTiers[strictIdx] = parsedSalary;
        preservedManualSalaries = nextTiers;
        preservedCustomTiers = {};
      } else {
        const customUnit =
          (cleanWorkLoc &&
          cleanWorkLoc !== 'ستاد مرکزی تهران' &&
          cleanWorkLoc !== 'ستاد مرکزی'
            ? cleanWorkLoc
            : '') || cleanDept;
        if (customUnit) {
          preservedManualSalaries = [0, 0, 0, 0, 0, 0, 0, 0];
          preservedCustomTiers = { [customUnit]: parsedSalary };
        }
      }
    }

    const cleanedInput: Omit<Employee, 'id'> = {
      ...formState,
      personnelCode: toEnglishDigits(formState.personnelCode.trim()),
      nationalId: toEnglishDigits(formState.nationalId.trim()),
      fullName: formState.fullName.trim(),
      department: cleanDept,
      jobTitle: formState.jobTitle.trim(),
      workLocation: cleanWorkLoc,
      mobileNumber: toEnglishDigits(formState.mobileNumber.trim()),
      workPhone: toEnglishDigits(formState.workPhone.trim()),
      customContractTitle:
        formState.employmentType === 'custom'
          ? (formState.customContractTitle ?? '').trim()
          : '',
      salaryCalculationMode: formState.salaryCalculationMode ?? 'daily-divided',
      allowanceFlags: normalizeAllowanceFlags(formState.allowanceFlags),
      bankName: formState.bankName.trim() || 'بانک ملی ایران',
      bankAccount: toEnglishDigits(formState.bankAccount.trim()),
      baseMonthlySalary: parsedSalary,
      seniorityAllowance: parsedSeniority,
      insuranceBaseCap: parsedInsuranceCap,
      manualSalaries: preservedManualSalaries,
      customTierAmounts: preservedCustomTiers,
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

  const inspectorBasePlusSeniority =
    parseNumericInput(inspectorSalaryInput) +
    parseNumericInput(inspectorSeniorityInput);

  return (
    <div className="space-y-6">
      <datalist id="emp-work-location-options">
        {EMPLOYMENT_UNIT_OPTIONS.map((opt) => (
          <option key={opt} value={opt} />
        ))}
        <option value="ستاد مرکزی تهران" />
        <option value="شعبه غرب تهران" />
      </datalist>
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

      {/* Sub-view Switcher: Search/List vs Complete Employee Profile Details + Excel Actions */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div
          className="inline-flex flex-wrap items-center gap-1 p-1 bg-slate-200/70 rounded-lg self-start"
          role="tablist"
          aria-label="بخش‌های مدیریت کارمندان"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeSubView === 'list'}
            onClick={() => setActiveSubView('list')}
            className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
              activeSubView === 'list'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Users className="w-4 h-4 text-teal-700" aria-hidden="true" />
            <span>جستجو و فهرست کارمندان</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeSubView === 'details'}
            onClick={() => setActiveSubView('details')}
            className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
              activeSubView === 'details'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <UserCog className="w-4 h-4 text-teal-700" aria-hidden="true" />
            <span>مشخصات تکمیلی، قرارداد و تنظیمات کارمند</span>
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <input
            ref={employeesExcelInputRef}
            type="file"
            accept=".xlsx,.csv,.tsv"
            onChange={handleImportEmployeesExcel}
            className="hidden"
            aria-label="فایل اکسل ورود مشخصات کارمندان"
          />
          <button
            type="button"
            disabled={!canManageEmployees}
            onClick={() => employeesExcelInputRef.current?.click()}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-teal-900 bg-teal-50 hover:bg-teal-100 border border-teal-200 disabled:opacity-45 disabled:cursor-not-allowed rounded-md transition-colors whitespace-nowrap shrink-0"
          >
            <Upload className="w-3.5 h-3.5" aria-hidden="true" />
            <span>ورود کارمندان از اکسل (.xlsx)</span>
          </button>
          <button
            type="button"
            disabled={employees.length === 0}
            onClick={handleExportEmployeesExcel}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-white bg-emerald-700 hover:bg-emerald-800 disabled:opacity-45 disabled:cursor-not-allowed rounded-md transition-colors whitespace-nowrap shrink-0"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" aria-hidden="true" />
            <span>خروجی اکسل مشخصات (.xlsx)</span>
          </button>
          <button
            type="button"
            disabled={!canManageEmployees}
            onClick={openCreateModal}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-teal-700 hover:bg-teal-800 disabled:opacity-50 disabled:cursor-not-allowed rounded-md transition-colors whitespace-nowrap shrink-0"
          >
            <Plus className="w-3.5 h-3.5" aria-hidden="true" />
            <span>افزودن کارمند</span>
          </button>
        </div>
      </div>

      {excelImportStatus && (
        <div
          role="status"
          className={`px-4 py-2.5 text-xs rounded-md border flex items-center justify-between gap-2 ${
            excelImportStatus.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          <span>{excelImportStatus.message}</span>
          <button
            type="button"
            onClick={() => setExcelImportStatus(null)}
            aria-label="بستن اعلان"
            className="p-0.5 hover:opacity-75"
          >
            <X className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        </div>
      )}

      {activeSubView === 'details' ? (
        /* Dedicated Full-Width Complete Employee Details & Configuration View */
        <CollapsibleCard
          title="مشخصات تکمیلی، قرارداد و تنظیمات کارمند"
          subtitle="مشخصات کامل فرد انتخاب‌شده شامل نوع قرارداد، روش محاسبه، سنوات، سقف بیمه، شمول مزایا، محل خدمت و حساب بانکی"
          defaultOpen={true}
          resizable={false}
          headerActions={
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1.5">
                <label
                  htmlFor="details-emp-switcher"
                  className="text-xs text-slate-600 whitespace-nowrap"
                >
                  کارمند:
                </label>
                <select
                  id="details-emp-switcher"
                  value={selectedEmployee?.id ?? ''}
                  onChange={(e) => setSelectedId(e.target.value)}
                  className="px-2.5 py-1.5 text-xs border border-slate-200 rounded-md bg-white text-slate-800 focus:outline-none focus:border-teal-600"
                >
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.fullName} (کد {toPersianDigits(emp.personnelCode)})
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                onClick={() => setActiveSubView('list')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-md transition-colors whitespace-nowrap"
              >
                <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                <span>بازگشت به فهرست کارمندان</span>
              </button>
            </div>
          }
        >
          {!selectedEmployee ? (
            <div className="p-8 text-center text-xs text-slate-500">
              کارمندی برای نمایش انتخاب نشده است.
            </div>
          ) : (
            <form
              onSubmit={handleInspectorSave}
              className="p-5 space-y-5"
              noValidate
            >
              {/* Selected Employee Identity Banner */}
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-base font-bold text-slate-900">
                    {selectedEmployee.fullName}
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    کد {toPersianDigits(selectedEmployee.personnelCode)} · کد ملی{' '}
                    {toPersianDigits(selectedEmployee.nationalId)} ·{' '}
                    {selectedEmployee.department} · {selectedEmployee.jobTitle}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-teal-800 bg-teal-50 border border-teal-200 px-2.5 py-1 rounded whitespace-nowrap">
                    {getEmploymentTypeLabel(
                      selectedEmployee.employmentType,
                      selectedEmployee.customContractTitle
                    )}
                  </span>
                  <button
                    type="button"
                    disabled={!canManageEmployees}
                    onClick={() => openEditModal(selectedEmployee)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-700 bg-white hover:bg-slate-100 border border-slate-200 disabled:opacity-40 rounded transition-colors"
                  >
                    <Edit3 className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>ویرایش هویتی و کامل</span>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
                <div className="space-y-4">
                  {/* Drawer 1: Contract Type, Work Location & Phone */}
                  <CollapsibleCard
                    title="۱. قرارداد، محل خدمت و اطلاعات تماس"
                    defaultOpen={true}
                    resizable={false}
                    bodyClassName="p-4 space-y-3"
                  >
                    <div>
                      <label
                        htmlFor="inspector-employment-type"
                        className="block text-xs font-medium text-slate-700 mb-1"
                      >
                        نوع قرارداد
                      </label>
                      <select
                        id="inspector-employment-type"
                        disabled={!canManageEmployees}
                        value={inspectorEmploymentType}
                        onChange={(e) =>
                          setInspectorEmploymentType(
                            e.target.value as EmploymentType
                          )
                        }
                        className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded-md bg-white disabled:bg-slate-50 disabled:text-slate-500 focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
                      >
                        {(
                          Object.keys(EMPLOYMENT_TYPE_LABELS) as EmploymentType[]
                        ).map((key) => (
                          <option key={key} value={key}>
                            {EMPLOYMENT_TYPE_LABELS[key]}
                          </option>
                        ))}
                      </select>
                    </div>

                    {inspectorEmploymentType === 'custom' && (
                      <div>
                        <label
                          htmlFor="inspector-custom-contract"
                          className="block text-xs font-medium text-slate-700 mb-1"
                        >
                          عنوان قرارداد سفارشی
                        </label>
                        <input
                          id="inspector-custom-contract"
                          type="text"
                          disabled={!canManageEmployees}
                          value={inspectorCustomContract}
                          onChange={(e) =>
                            setInspectorCustomContract(e.target.value)
                          }
                          placeholder="مثلاً پروژه‌ای تولید سیما"
                          className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded-md bg-white disabled:bg-slate-50 disabled:text-slate-500 focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
                        />
                      </div>
                    )}

                    <div>
                      <label
                        htmlFor="inspector-work-location"
                        className="flex items-center gap-1.5 text-xs font-medium text-slate-700 mb-1"
                      >
                        <MapPin
                          className="w-3.5 h-3.5 text-teal-700"
                          aria-hidden="true"
                        />
                        <span>محل خدمت (قابل تغییر دستی)</span>
                      </label>
                      <input
                        id="inspector-work-location"
                        type="text"
                        list="emp-work-location-options"
                        disabled={!canManageEmployees}
                        value={inspectorWorkLocation}
                        onChange={(e) => setInspectorWorkLocation(e.target.value)}
                        placeholder="مثلاً تولید سیما، خبر، ستاد مرکزی..."
                        className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded-md bg-white disabled:bg-slate-50 disabled:text-slate-500 focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
                      />
                      {inspectorErrors.workLocation && (
                        <p className="mt-1 text-xs text-rose-600">
                          {inspectorErrors.workLocation}
                        </p>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <div>
                        <label
                          htmlFor="inspector-mobile"
                          className="flex items-center gap-1.5 text-xs font-medium text-slate-700 mb-1"
                        >
                          <Smartphone
                            className="w-3.5 h-3.5 text-teal-700"
                            aria-hidden="true"
                          />
                          <span>شماره موبایل</span>
                        </label>
                        <input
                          id="inspector-mobile"
                          type="tel"
                          inputMode="tel"
                          dir="ltr"
                          disabled={!canManageEmployees}
                          value={inspectorMobile}
                          onChange={(e) => setInspectorMobile(e.target.value)}
                          placeholder="09123456789"
                          className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded-md bg-white disabled:bg-slate-50 disabled:text-slate-500 font-mono-num tabular-nums text-left focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
                        />
                      </div>
                      <div>
                        <label
                          htmlFor="inspector-work-phone"
                          className="flex items-center gap-1.5 text-xs font-medium text-slate-700 mb-1"
                        >
                          <Phone
                            className="w-3.5 h-3.5 text-teal-700"
                            aria-hidden="true"
                          />
                          <span>تلفن محل کار</span>
                        </label>
                        <input
                          id="inspector-work-phone"
                          type="tel"
                          inputMode="tel"
                          dir="ltr"
                          disabled={!canManageEmployees}
                          value={inspectorWorkPhone}
                          onChange={(e) => setInspectorWorkPhone(e.target.value)}
                          placeholder="021-88401210"
                          className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded-md bg-white disabled:bg-slate-50 disabled:text-slate-500 font-mono-num tabular-nums text-left focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
                        />
                      </div>
                    </div>
                  </CollapsibleCard>

                  {/* Drawer 3: Bank Account & Marital / Children */}
                  <CollapsibleCard
                    title="۳. اطلاعات بانکی، تاهل و فرزندان"
                    defaultOpen={true}
                    resizable={false}
                    bodyClassName="p-4 space-y-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-800">
                        <CreditCard
                          className="w-3.5 h-3.5 text-teal-700"
                          aria-hidden="true"
                        />
                        <span>حساب و بانک عامل</span>
                      </span>
                      <button
                        type="button"
                        disabled={!canManageEmployees}
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
                        {inspectorNewAccountMode
                          ? 'بازگشت به شماره فعلی'
                          : '+ شماره حساب جدید'}
                      </button>
                    </div>

                    <div>
                      <label
                        htmlFor="inspector-bank-name"
                        className="block text-xs font-medium text-slate-700 mb-1"
                      >
                        نوع بانک
                      </label>
                      <select
                        id="inspector-bank-name"
                        disabled={!canManageEmployees}
                        value={inspectorBankName}
                        onChange={(e) => setInspectorBankName(e.target.value)}
                        className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded-md bg-white disabled:bg-slate-50 disabled:text-slate-500 focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
                      >
                        {IRANIAN_BANKS.map((bank) => (
                          <option key={bank} value={bank}>
                            {bank}
                          </option>
                        ))}
                        {!IRANIAN_BANKS.includes(inspectorBankName) &&
                          inspectorBankName && (
                            <option value={inspectorBankName}>
                              {inspectorBankName}
                            </option>
                          )}
                      </select>
                    </div>

                    <div>
                      <label
                        htmlFor="inspector-bank-account"
                        className="block text-xs font-medium text-slate-700 mb-1"
                      >
                        {inspectorNewAccountMode
                          ? 'ورود شماره حساب / شبا جدید'
                          : 'شماره حساب / شبا فعلی'}
                      </label>
                      <input
                        id="inspector-bank-account"
                        type="text"
                        dir="ltr"
                        disabled={!canManageEmployees}
                        value={inspectorBankAccount}
                        onChange={(e) =>
                          handleInspectorAccountChange(e.target.value)
                        }
                        placeholder="IR000000000000000000000000 یا شماره حساب"
                        className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded-md bg-white disabled:bg-slate-50 disabled:text-slate-500 font-mono-num tabular-nums text-left focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2.5">
                      <div>
                        <label
                          htmlFor="inspector-marital"
                          className="block text-xs font-medium text-slate-700 mb-1"
                        >
                          وضعیت تاهل
                        </label>
                        <select
                          id="inspector-marital"
                          disabled={!canManageEmployees}
                          value={inspectorMaritalStatus}
                          onChange={(e) =>
                            setInspectorMaritalStatus(
                              e.target.value as MaritalStatus
                            )
                          }
                          className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded-md bg-white disabled:bg-slate-50 disabled:text-slate-500"
                        >
                          <option value="single">مجرد</option>
                          <option value="married">متاهل</option>
                        </select>
                      </div>
                      <div>
                        <label
                          htmlFor="inspector-children"
                          className="block text-xs font-medium text-slate-700 mb-1"
                        >
                          تعداد فرزندان
                        </label>
                        <input
                          id="inspector-children"
                          type="text"
                          inputMode="numeric"
                          dir="ltr"
                          disabled={!canManageEmployees}
                          value={inspectorChildrenInput}
                          onChange={(e) =>
                            setInspectorChildrenInput(e.target.value)
                          }
                          className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded-md bg-white disabled:bg-slate-50 disabled:text-slate-500 font-mono-num tabular-nums text-left focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
                        />
                      </div>
                    </div>
                  </CollapsibleCard>
                </div>

                {/* Drawer 2: Salary Calculation Mode, Base Salary, Seniority, Insurance Cap & Allowances */}
                <CollapsibleCard
                  title="۲. روش محاسبه، پایه سنوات، سقف بیمه و مزایا"
                  defaultOpen={true}
                  resizable={false}
                  bodyClassName="p-4 space-y-3.5"
                >
                  <div>
                    <label
                      htmlFor="inspector-salary-mode"
                      className="block text-xs font-medium text-slate-700 mb-1"
                    >
                      روش محاسبه حقوق فرد
                    </label>
                    <select
                      id="inspector-salary-mode"
                      disabled={!canManageEmployees}
                      value={inspectorSalaryMode}
                      onChange={(e) =>
                        setInspectorSalaryMode(
                          e.target.value as SalaryCalculationMode
                        )
                      }
                      className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded-md bg-white disabled:bg-slate-50 disabled:text-slate-500 focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
                    >
                      {(
                        Object.keys(
                          SALARY_CALCULATION_MODE_LABELS
                        ) as SalaryCalculationMode[]
                      ).map((modeKey) => (
                        <option key={modeKey} value={modeKey}>
                          {SALARY_CALCULATION_MODE_LABELS[modeKey]}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div>
                      <label
                        htmlFor="inspector-salary"
                        className="block text-xs font-medium text-slate-700 mb-1"
                      >
                        حقوق پایه ({currency})
                      </label>
                      <input
                        id="inspector-salary"
                        type="text"
                        inputMode="numeric"
                        dir="ltr"
                        disabled={!canManageEmployees}
                        value={inspectorSalaryInput}
                        onChange={(e) => setInspectorSalaryInput(e.target.value)}
                        placeholder="28000000"
                        className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded-md bg-white disabled:bg-slate-50 disabled:text-slate-500 font-mono-num tabular-nums text-left focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
                      />
                    </div>

                    <div>
                      <label
                        htmlFor="inspector-seniority"
                        className="block text-xs font-medium text-slate-700 mb-1"
                      >
                        پایه سنوات ماهانه ({currency})
                      </label>
                      <input
                        id="inspector-seniority"
                        type="text"
                        inputMode="numeric"
                        dir="ltr"
                        disabled={!canManageEmployees}
                        value={inspectorSeniorityInput}
                        onChange={(e) =>
                          setInspectorSeniorityInput(e.target.value)
                        }
                        placeholder="0"
                        className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded-md bg-white disabled:bg-slate-50 disabled:text-slate-500 font-mono-num tabular-nums text-left focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
                      />
                    </div>
                  </div>

                  <div className="text-[11px] text-teal-800 bg-teal-50 border border-teal-200 rounded px-2.5 py-1.5 font-mono-num tabular-nums flex items-center justify-between gap-2">
                    <span>نرخ روزانه مبنا (پایه + سنوات ÷ ۳۰):</span>
                    <strong>
                      {formatMoney(Math.round(inspectorBasePlusSeniority / 30))}{' '}
                      {currency}
                    </strong>
                  </div>
                  {inspectorErrors.baseMonthlySalary && (
                    <p className="text-xs text-rose-600">
                      {inspectorErrors.baseMonthlySalary}
                    </p>
                  )}

                  <div>
                    <label
                      htmlFor="inspector-insurance-cap"
                      className="block text-xs font-medium text-slate-700 mb-1"
                    >
                      سقف / مبنای حقوق مشمول بیمه فرد ({currency} · ۰ = کل مشمول)
                    </label>
                    <input
                      id="inspector-insurance-cap"
                      type="text"
                      inputMode="numeric"
                      dir="ltr"
                      disabled={!canManageEmployees}
                      value={inspectorInsuranceCapInput}
                      onChange={(e) =>
                        setInspectorInsuranceCapInput(e.target.value)
                      }
                      placeholder="0"
                      className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded-md bg-white disabled:bg-slate-50 disabled:text-slate-500 font-mono-num tabular-nums text-left focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
                    />
                    <p className="mt-1 text-[11px] text-slate-500">
                      اگر حقوق بالاتر از این مقدار باشد، بیمه بر اساس همین سقف محاسبه می‌شود.
                    </p>
                  </div>

                  {/* Per-employee Allowance Flags */}
                  <div className="pt-2 border-t border-slate-100 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-800">
                        شمول مزایای کارمند
                      </span>
                      <div className="flex items-center gap-2 text-[11px]">
                        <button
                          type="button"
                          disabled={!canManageEmployees}
                          onClick={() =>
                            setInspectorAllowanceFlags({
                              housing: true,
                              food: true,
                              marital: true,
                              child: true,
                              otherFixed: true,
                            })
                          }
                          className="text-teal-700 hover:underline disabled:opacity-40"
                        >
                          همه
                        </button>
                        <span className="text-slate-300">|</span>
                        <button
                          type="button"
                          disabled={!canManageEmployees}
                          onClick={() =>
                            setInspectorAllowanceFlags({
                              housing: false,
                              food: false,
                              marital: false,
                              child: false,
                              otherFixed: false,
                            })
                          }
                          className="text-slate-600 hover:underline disabled:opacity-40"
                        >
                          هیچکدام
                        </button>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                      {ALLOWANCE_FLAG_LABELS.map((item) => (
                        <label
                          key={item.key}
                          className="inline-flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer select-none"
                        >
                          <input
                            type="checkbox"
                            disabled={!canManageEmployees}
                            checked={inspectorAllowanceFlags[item.key]}
                            onChange={(e) =>
                              setInspectorAllowanceFlags((prev) => ({
                                ...prev,
                                [item.key]: e.target.checked,
                              }))
                            }
                            className="w-3.5 h-3.5 accent-teal-700 rounded"
                          />
                          <span>{item.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                </CollapsibleCard>
              </div>

              <div className="pt-3 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
                <button
                  type="submit"
                  disabled={!canManageEmployees}
                  className="inline-flex items-center justify-center gap-1.5 px-5 py-2 text-sm font-medium text-white bg-teal-700 hover:bg-teal-800 disabled:opacity-50 disabled:cursor-not-allowed rounded-md transition-colors whitespace-nowrap shrink-0"
                >
                  {inspectorSaved && (
                    <Check className="w-4 h-4" aria-hidden="true" />
                  )}
                  <span>{inspectorSaved ? 'ذخیره شد' : 'ذخیره مشخصات تکمیلی'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveSubView('list')}
                  className="text-xs font-medium text-slate-600 hover:text-slate-900 whitespace-nowrap"
                >
                  مشاهده و جستجو در فهرست کل کارمندان
                </button>
              </div>
            </form>
          )}
        </CollapsibleCard>
      ) : (
        /* Dedicated Full-Width Employee Search & List View */
        <CollapsibleCard
          title="جستجوی سریع و فهرست کارمندان"
          subtitle={`نمایش ${toPersianDigits(filteredEmployees.length)} از ${toPersianDigits(
            employees.length
          )} کارمند · برای مشاهده مشخصات تکمیلی، روی نام یا دکمه «مشخصات» کلیک کنید`}
          defaultOpen={true}
          resizable={false}
        >
          <div className="p-4 border-b border-slate-200 flex flex-col gap-3 bg-white">
            <ContractDepartmentChecklist
              departments={departments}
              selectedDepartments={selectedDepartments}
              selectedContracts={selectedContracts}
              onChangeDepartments={setSelectedDepartments}
              onChangeContracts={setSelectedContracts}
              idPrefix="emp-list"
            />

            <div className="flex flex-wrap items-center justify-between gap-2">
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

              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={resetAllFilters}
                  className="text-[11px] font-medium text-teal-700 hover:text-teal-900 hover:underline whitespace-nowrap"
                >
                  بازنشانی فیلترها
                </button>
              )}
            </div>

            <div>
              <label
                htmlFor="emp-search"
                className="block text-xs font-medium text-slate-700 mb-1.5"
              >
                جستجوی متنی (نام، نام خانوادگی یا کد پرسنلی)
              </label>
              <div className="relative max-w-xl">
                <Search
                  className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none"
                  aria-hidden="true"
                />
                <input
                  id="emp-search"
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="نام، نام خانوادگی یا کد پرسنلی را وارد کنید (مثلاً کریمی یا ۱۰۰۲)..."
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
          </div>

          {filteredEmployees.length === 0 ? (
            <div className="py-12 px-6 text-center space-y-2">
              <p className="text-sm font-medium text-slate-700">
                {employees.length === 0
                  ? 'هنوز کارمندی ثبت نشده است.'
                  : 'کارمندی با این مشخصات یافت نشد.'}
              </p>
              {hasActiveFilters && employees.length > 0 && (
                <button
                  type="button"
                  onClick={resetAllFilters}
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-teal-800 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded-md transition-colors"
                >
                  نمایش همه کارمندان
                </button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-right border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/80 text-xs font-medium text-slate-500">
                    <th className="py-3 px-4 whitespace-nowrap">کارمند / کد</th>
                    <th className="py-3 px-3 whitespace-nowrap">واحد و محل خدمت</th>
                    <th className="py-3 px-3 whitespace-nowrap">بانک و شماره حساب</th>
                    <th className="py-3 px-3 whitespace-nowrap">قرارداد و روش محاسبه</th>
                    <th className="py-3 px-3 whitespace-nowrap">وضعیت</th>
                    <th className="py-3 px-4 whitespace-nowrap text-left">عملیات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-xs">
                  {filteredEmployees.map((emp) => {
                    const isSelected = selectedEmployee?.id === emp.id;
                    const salaryMode = getEffectiveSalaryMode(emp);
                    return (
                      <tr
                        key={emp.id}
                        className={`transition-colors ${
                          isSelected ? 'bg-teal-50/40' : 'hover:bg-slate-50/70'
                        } ${emp.isActive ? '' : 'opacity-65'}`}
                      >
                        <td className="py-3 px-4 whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => openDetailsForEmployee(emp.id)}
                            aria-label={`مشخصات تکمیلی کارمند ${emp.fullName}`}
                            className="text-right group"
                          >
                            <div className="text-sm font-semibold text-slate-900 group-hover:text-teal-700 transition-colors">
                              {emp.fullName}
                            </div>
                            <div className="text-[11px] text-slate-500 font-mono-num tabular-nums mt-0.5">
                              کد {toPersianDigits(emp.personnelCode)} ·{' '}
                              {toPersianDigits(emp.nationalId)}
                            </div>
                            {emp.mobileNumber && (
                              <div className="text-[10px] text-slate-500 font-mono-num tabular-nums mt-0.5">
                                <span dir="ltr">
                                  {toPersianDigits(emp.mobileNumber)}
                                </span>
                              </div>
                            )}
                          </button>
                        </td>

                        <td className="py-3 px-3">
                          <div className="text-xs font-medium text-slate-800">
                            {emp.department}
                          </div>
                          <div className="text-[11px] text-slate-500 mt-0.5 inline-flex items-center gap-1">
                            <Building2
                              className="w-3 h-3 text-slate-400 shrink-0"
                              aria-hidden="true"
                            />
                            <span>{emp.workLocation || 'ستاد مرکزی'}</span>
                          </div>
                        </td>

                        <td className="py-3 px-3 whitespace-nowrap">
                          <div className="text-xs font-medium text-slate-800">
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

                        <td className="py-3 px-3 whitespace-nowrap">
                          <div className="text-xs text-slate-800 font-medium">
                            {getEmploymentTypeLabel(
                              emp.employmentType,
                              emp.customContractTitle
                            )}
                            <span
                              className="mx-1 text-slate-300"
                              aria-hidden="true"
                            >
                              ·
                            </span>
                            {MARITAL_LABELS[emp.maritalStatus]}
                          </div>
                          <div className="text-[11px] text-teal-800 mt-0.5">
                            {SALARY_CALCULATION_MODE_SHORT_LABELS[salaryMode]}
                          </div>
                        </td>

                        <td className="py-3 px-3 whitespace-nowrap">
                          <button
                            type="button"
                            disabled={!canManageEmployees}
                            onClick={() => onToggleActive(emp.id)}
                            className={`inline-flex items-center gap-1 text-xs font-medium disabled:opacity-60 disabled:cursor-not-allowed ${
                              emp.isActive ? 'text-emerald-700' : 'text-slate-500'
                            }`}
                          >
                            {emp.isActive ? (
                              <UserCheck className="w-3.5 h-3.5" aria-hidden="true" />
                            ) : (
                              <UserX className="w-3.5 h-3.5" aria-hidden="true" />
                            )}
                            <span>{emp.isActive ? 'فعال' : 'غیرفعال'}</span>
                          </button>
                        </td>

                        <td className="py-3 px-4 whitespace-nowrap text-left">
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => openDetailsForEmployee(emp.id)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-teal-800 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded transition-colors"
                            >
                              <UserCog className="w-3 h-3" aria-hidden="true" />
                              <span>مشخصات تکمیلی</span>
                            </button>
                            <button
                              type="button"
                              disabled={!canManageEmployees}
                              onClick={() => openEditModal(emp)}
                              aria-label={`ویرایش ${emp.fullName}`}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:text-teal-800 bg-slate-100 hover:bg-teal-50 border border-slate-200 disabled:opacity-40 disabled:cursor-not-allowed rounded transition-colors"
                            >
                              <Edit3 className="w-3 h-3" aria-hidden="true" />
                              <span>ویرایش</span>
                            </button>
                            <span
                              title="امکان حذف پرسنل برای حفاظت از سوابق غیرفعال است"
                              className="inline-flex items-center gap-1 px-1.5 py-1 text-[10px] text-slate-500 bg-slate-50 border border-slate-200 rounded"
                            >
                              <Lock className="w-2.5 h-2.5" aria-hidden="true" />
                              <span>محافظت‌شده</span>
                            </span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CollapsibleCard>
      )}

      {/* Add / Edit Employee Modal (with Collapsible Subsections) */}
      {isModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="employee-modal-title"
        >
          <div className="bg-white border border-slate-200 rounded-lg w-full max-w-3xl max-h-[90vh] overflow-y-auto shadow-lg">
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

            <form onSubmit={handleSubmit} className="p-5 space-y-4" noValidate>
              <CollapsibleCard
                title="۱. مشخصات هویتی و شغلی"
                defaultOpen={true}
                resizable={false}
                bodyClassName="p-4 grid grid-cols-1 sm:grid-cols-2 gap-4"
              >
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
                    <p className="mt-1 text-xs text-rose-600">
                      {errors.fullName}
                    </p>
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
                      setFormState((s) => ({
                        ...s,
                        personnelCode: e.target.value,
                      }))
                    }
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md font-mono-num tabular-nums focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
                    placeholder="مثلاً 1006"
                  />
                  {errors.personnelCode && (
                    <p className="mt-1 text-xs text-rose-600">
                      {errors.personnelCode}
                    </p>
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
                    <p className="mt-1 text-xs text-rose-600">
                      {errors.nationalId}
                    </p>
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
                    <p className="mt-1 text-xs text-rose-600">
                      {errors.department}
                    </p>
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
                    <p className="mt-1 text-xs text-rose-600">
                      {errors.jobTitle}
                    </p>
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
                    list="emp-work-location-options"
                    value={formState.workLocation}
                    onChange={(e) =>
                      setFormState((s) => ({
                        ...s,
                        workLocation: e.target.value,
                      }))
                    }
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
                    placeholder="مثلاً تولید سیما، خبر، ستاد مرکزی..."
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label
                      htmlFor="emp-mobile"
                      className="block text-xs font-medium text-slate-700 mb-1.5"
                    >
                      موبایل
                    </label>
                    <input
                      id="emp-mobile"
                      type="tel"
                      dir="ltr"
                      value={formState.mobileNumber}
                      onChange={(e) =>
                        setFormState((s) => ({
                          ...s,
                          mobileNumber: e.target.value,
                        }))
                      }
                      className="w-full px-2.5 py-2 text-sm border border-slate-200 rounded-md font-mono-num text-left"
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
                      dir="ltr"
                      value={formState.workPhone}
                      onChange={(e) =>
                        setFormState((s) => ({
                          ...s,
                          workPhone: e.target.value,
                        }))
                      }
                      className="w-full px-2.5 py-2 text-sm border border-slate-200 rounded-md font-mono-num text-left"
                      placeholder="021-88401210"
                    />
                  </div>
                </div>
              </CollapsibleCard>

              <CollapsibleCard
                title="۲. قرارداد، روش محاسبه حقوق، سنوات و بیمه"
                defaultOpen={true}
                resizable={false}
                bodyClassName="p-4 space-y-4"
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md bg-white"
                    >
                      {(
                        Object.keys(EMPLOYMENT_TYPE_LABELS) as EmploymentType[]
                      ).map((key) => (
                        <option key={key} value={key}>
                          {EMPLOYMENT_TYPE_LABELS[key]}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label
                      htmlFor="emp-salary-mode"
                      className="block text-xs font-medium text-slate-700 mb-1.5"
                    >
                      روش محاسبه حقوق فرد
                    </label>
                    <select
                      id="emp-salary-mode"
                      value={formState.salaryCalculationMode ?? 'daily-divided'}
                      onChange={(e) =>
                        setFormState((s) => ({
                          ...s,
                          salaryCalculationMode:
                            e.target.value as SalaryCalculationMode,
                        }))
                      }
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md bg-white"
                    >
                      {(
                        Object.keys(
                          SALARY_CALCULATION_MODE_LABELS
                        ) as SalaryCalculationMode[]
                      ).map((modeKey) => (
                        <option key={modeKey} value={modeKey}>
                          {SALARY_CALCULATION_MODE_LABELS[modeKey]}
                        </option>
                      ))}
                    </select>
                  </div>

                  {formState.employmentType === 'custom' && (
                    <div className="sm:col-span-2">
                      <label
                        htmlFor="emp-custom-contract"
                        className="block text-xs font-medium text-slate-700 mb-1.5"
                      >
                        عنوان قرارداد سفارشی (ورود دستی)
                      </label>
                      <input
                        id="emp-custom-contract"
                        type="text"
                        value={formState.customContractTitle ?? ''}
                        onChange={(e) =>
                          setFormState((s) => ({
                            ...s,
                            customContractTitle: e.target.value,
                          }))
                        }
                        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md"
                        placeholder="مثلاً قرارداد پروژه‌ای سیما"
                      />
                    </div>
                  )}

                  <div>
                    <label
                      htmlFor="emp-base-salary"
                      className="block text-xs font-medium text-slate-700 mb-1.5"
                    >
                      حقوق پایه ماهانه ({currency}) *
                    </label>
                    <input
                      id="emp-base-salary"
                      type="text"
                      inputMode="numeric"
                      dir="ltr"
                      value={salaryInputText}
                      onChange={(e) => setSalaryInputText(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md font-mono-num tabular-nums text-left"
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
                      htmlFor="emp-seniority"
                      className="block text-xs font-medium text-slate-700 mb-1.5"
                    >
                      پایه سنوات ماهانه ({currency})
                    </label>
                    <input
                      id="emp-seniority"
                      type="text"
                      inputMode="numeric"
                      dir="ltr"
                      value={seniorityInputText}
                      onChange={(e) => setSeniorityInputText(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md font-mono-num tabular-nums text-left"
                      placeholder="0"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label
                      htmlFor="emp-ins-cap"
                      className="block text-xs font-medium text-slate-700 mb-1.5"
                    >
                      مبنا / سقف حقوق مشمول بیمه کارمند ({currency} · ۰ = کل مشمول)
                    </label>
                    <input
                      id="emp-ins-cap"
                      type="text"
                      inputMode="numeric"
                      dir="ltr"
                      value={insuranceCapInputText}
                      onChange={(e) => setInsuranceCapInputText(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md font-mono-num tabular-nums text-left"
                      placeholder="0"
                    />
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-100 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-800">
                      مزایای مشمول پرداخت برای این کارمند
                    </span>
                    <div className="flex items-center gap-2 text-[11px]">
                      <button
                        type="button"
                        onClick={() =>
                          setFormState((s) => ({
                            ...s,
                            allowanceFlags: {
                              housing: true,
                              food: true,
                              marital: true,
                              child: true,
                              otherFixed: true,
                            },
                          }))
                        }
                        className="text-teal-700 hover:underline"
                      >
                        همه
                      </button>
                      <span className="text-slate-300">|</span>
                      <button
                        type="button"
                        onClick={() =>
                          setFormState((s) => ({
                            ...s,
                            allowanceFlags: {
                              housing: false,
                              food: false,
                              marital: false,
                              child: false,
                              otherFixed: false,
                            },
                          }))
                        }
                        className="text-slate-600 hover:underline"
                      >
                        هیچکدام
                      </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {ALLOWANCE_FLAG_LABELS.map((item) => (
                      <label
                        key={item.key}
                        className="inline-flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer select-none"
                      >
                        <input
                          type="checkbox"
                          checked={
                            normalizeAllowanceFlags(formState.allowanceFlags)[
                              item.key
                            ]
                          }
                          onChange={(e) =>
                            setFormState((s) => ({
                              ...s,
                              allowanceFlags: {
                                ...normalizeAllowanceFlags(s.allowanceFlags),
                                [item.key]: e.target.checked,
                              },
                            }))
                          }
                          className="w-3.5 h-3.5 accent-teal-700 rounded"
                        />
                        <span>{item.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </CollapsibleCard>

              <CollapsibleCard
                title="۳. تاهل، فرزندان و حساب بانکی"
                defaultOpen={true}
                resizable={false}
                bodyClassName="p-4 grid grid-cols-1 sm:grid-cols-2 gap-4"
              >
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
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md bg-white"
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
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md font-mono-num tabular-nums"
                  />
                  {errors.childrenCount && (
                    <p className="mt-1 text-xs text-rose-600">
                      {errors.childrenCount}
                    </p>
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
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md bg-white"
                  >
                    {IRANIAN_BANKS.map((bank) => (
                      <option key={bank} value={bank}>
                        {bank}
                      </option>
                    ))}
                    {!IRANIAN_BANKS.includes(formState.bankName) &&
                      formState.bankName && (
                        <option value={formState.bankName}>
                          {formState.bankName}
                        </option>
                      )}
                  </select>
                </div>

                <div>
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
                    onChange={(e) =>
                      handleModalBankAccountChange(e.target.value)
                    }
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md font-mono-num tabular-nums text-left"
                    placeholder="IR000000000000000000000000"
                  />
                </div>
              </CollapsibleCard>

              <div className="flex items-center justify-between pt-3 border-t border-slate-200">
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
