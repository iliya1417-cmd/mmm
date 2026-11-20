import React from 'react';
import type { EmploymentType, ManualSalaryMode } from '../types/payroll';
import {
  ALL_EMPLOYMENT_TYPES,
  getEmploymentTypeLabel,
  toPersianDigits,
} from '../utils/payroll';
import {
  ALL_MANUAL_SALARY_MODES,
  toggleMultiSelectAll,
  toggleMultiSelectItem,
  type MultiSelectManualSalaryFilters,
} from '../utils/manualSalaryFilter';

interface ManualSalaryFilterBarProps {
  departments: ReadonlyArray<string>;
  filters: MultiSelectManualSalaryFilters;
  onChange: (next: MultiSelectManualSalaryFilters) => void;
  idPrefix: string;
}

const MODE_SHORT_LABELS: Record<ManualSalaryMode, string> = {
  override: 'جایگزین فیش ماه',
  additional: 'پرداخت مجزا',
};

export const ManualSalaryFilterBar: React.FC<ManualSalaryFilterBarProps> = ({
  departments,
  filters,
  onChange,
  idPrefix,
}) => {
  const allDeptsSelected =
    departments.length > 0 &&
    departments.every((d) => filters.selectedDepartments.includes(d));

  const allContractsSelected = ALL_EMPLOYMENT_TYPES.every((c) =>
    filters.selectedContracts.includes(c)
  );

  const allModesSelected = ALL_MANUAL_SALARY_MODES.every((m) =>
    filters.selectedModes.includes(m)
  );

  return (
    <div className="space-y-2.5">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {/* Departments (همه دپارتمان‌ها) */}
        <fieldset className="bg-white border border-slate-200 rounded-md p-3">
          <legend className="px-1 text-[11px] font-semibold text-slate-700">
            دپارتمان‌ها ({toPersianDigits(filters.selectedDepartments.length)} از{' '}
            {toPersianDigits(departments.length)})
          </legend>
          <div className="space-y-2">
            <label
              htmlFor={`${idPrefix}-dept-all`}
              className="flex items-center gap-2 pb-1.5 border-b border-slate-100 text-xs font-semibold text-teal-900 cursor-pointer select-none"
            >
              <input
                id={`${idPrefix}-dept-all`}
                type="checkbox"
                checked={allDeptsSelected}
                onChange={() =>
                  onChange({
                    ...filters,
                    selectedDepartments: toggleMultiSelectAll(
                      filters.selectedDepartments,
                      departments
                    ),
                  })
                }
                className="w-3.5 h-3.5 rounded accent-teal-700"
              />
              <span>انتخاب همه (همه دپارتمان‌ها)</span>
            </label>

            {departments.length === 0 ? (
              <p className="text-[11px] text-slate-400">دپارتمانی ثبت نشده است</p>
            ) : (
              <div className="flex flex-wrap gap-x-3 gap-y-1.5 max-h-24 overflow-y-auto">
                {departments.map((dept, idx) => {
                  const checked = filters.selectedDepartments.includes(dept);
                  return (
                    <label
                      key={dept}
                      htmlFor={`${idPrefix}-dept-${idx}`}
                      className="inline-flex items-center gap-1.5 text-xs text-slate-700 hover:text-slate-950 cursor-pointer select-none"
                    >
                      <input
                        id={`${idPrefix}-dept-${idx}`}
                        type="checkbox"
                        checked={checked}
                        onChange={() =>
                          onChange({
                            ...filters,
                            selectedDepartments: toggleMultiSelectItem(
                              filters.selectedDepartments,
                              dept
                            ),
                          })
                        }
                        className="w-3.5 h-3.5 rounded accent-teal-700"
                      />
                      <span>{dept}</span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        </fieldset>

        {/* Contracts (همه قراردادها + انتخاب زیر گزینه‌ها) */}
        <fieldset className="bg-white border border-slate-200 rounded-md p-3">
          <legend className="px-1 text-[11px] font-semibold text-slate-700">
            قراردادها ({toPersianDigits(filters.selectedContracts.length)} از{' '}
            {toPersianDigits(ALL_EMPLOYMENT_TYPES.length)})
          </legend>
          <div className="space-y-2">
            <label
              htmlFor={`${idPrefix}-contract-all`}
              className="flex items-center gap-2 pb-1.5 border-b border-slate-100 text-xs font-semibold text-teal-900 cursor-pointer select-none"
            >
              <input
                id={`${idPrefix}-contract-all`}
                type="checkbox"
                checked={allContractsSelected}
                onChange={() =>
                  onChange({
                    ...filters,
                    selectedContracts: toggleMultiSelectAll(
                      filters.selectedContracts,
                      ALL_EMPLOYMENT_TYPES
                    ),
                  })
                }
                className="w-3.5 h-3.5 rounded accent-teal-700"
              />
              <span>انتخاب همه (همه قراردادها)</span>
            </label>

            <div className="flex flex-wrap gap-x-3 gap-y-1.5">
              {ALL_EMPLOYMENT_TYPES.map((contract: EmploymentType) => {
                const checked = filters.selectedContracts.includes(contract);
                return (
                  <label
                    key={contract}
                    htmlFor={`${idPrefix}-contract-${contract}`}
                    className="inline-flex items-center gap-1.5 text-xs text-slate-700 hover:text-slate-950 cursor-pointer select-none"
                  >
                    <input
                      id={`${idPrefix}-contract-${contract}`}
                      type="checkbox"
                      checked={checked}
                      onChange={() =>
                        onChange({
                          ...filters,
                          selectedContracts: toggleMultiSelectItem(
                            filters.selectedContracts,
                            contract
                          ),
                        })
                      }
                      className="w-3.5 h-3.5 rounded accent-teal-700"
                    />
                    <span>
                      {getEmploymentTypeLabel(contract)}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
        </fieldset>

        {/* Calculation Mode (حالت محاسبه: جایگزین فیش ماه / پرداخت مجزا) */}
        <fieldset className="bg-white border border-slate-200 rounded-md p-3">
          <legend className="px-1 text-[11px] font-semibold text-slate-700">
            حالت محاسبه ({toPersianDigits(filters.selectedModes.length)} از{' '}
            {toPersianDigits(ALL_MANUAL_SALARY_MODES.length)})
          </legend>
          <div className="space-y-2">
            <label
              htmlFor={`${idPrefix}-mode-all`}
              className="flex items-center gap-2 pb-1.5 border-b border-slate-100 text-xs font-semibold text-teal-900 cursor-pointer select-none"
            >
              <input
                id={`${idPrefix}-mode-all`}
                type="checkbox"
                checked={allModesSelected}
                onChange={() =>
                  onChange({
                    ...filters,
                    selectedModes: toggleMultiSelectAll(
                      filters.selectedModes,
                      ALL_MANUAL_SALARY_MODES
                    ),
                  })
                }
                className="w-3.5 h-3.5 rounded accent-teal-700"
              />
              <span>انتخاب همه (همه حالت‌ها)</span>
            </label>

            <div className="flex flex-col gap-1.5">
              {ALL_MANUAL_SALARY_MODES.map((m) => {
                const checked = filters.selectedModes.includes(m);
                return (
                  <label
                    key={m}
                    htmlFor={`${idPrefix}-mode-${m}`}
                    className="inline-flex items-center gap-1.5 text-xs text-slate-700 hover:text-slate-950 cursor-pointer select-none"
                  >
                    <input
                      id={`${idPrefix}-mode-${m}`}
                      type="checkbox"
                      checked={checked}
                      onChange={() =>
                        onChange({
                          ...filters,
                          selectedModes: toggleMultiSelectItem(
                            filters.selectedModes,
                            m
                          ),
                        })
                      }
                      className="w-3.5 h-3.5 rounded accent-teal-700"
                    />
                    <span>{MODE_SHORT_LABELS[m]}</span>
                  </label>
                );
              })}
            </div>
          </div>
        </fieldset>
      </div>

      <p className="text-[11px] text-slate-500">
        نکته فیلتر انتخابی: هر دپارتمان، قرارداد یا حالت محاسبه‌ای که تیک آن برداشته شود، در جدول و خروجی اکسل نمایش داده نمی‌شود.
      </p>
    </div>
  );
};
