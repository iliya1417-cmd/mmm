import React from 'react';
import type { EmploymentType } from '../types/payroll';
import {
  ALL_EMPLOYMENT_TYPES,
  getEmploymentTypeLabel,
  toPersianDigits,
} from '../utils/payroll';
import {
  toggleMultiSelectAll,
  toggleMultiSelectItem,
} from '../utils/manualSalaryFilter';

interface ContractDepartmentChecklistProps {
  departments: ReadonlyArray<string>;
  selectedDepartments: ReadonlyArray<string>;
  selectedContracts: ReadonlyArray<EmploymentType>;
  onChangeDepartments: (next: string[]) => void;
  onChangeContracts: (next: EmploymentType[]) => void;
  idPrefix: string;
}

export const ContractDepartmentChecklist: React.FC<
  ContractDepartmentChecklistProps
> = ({
  departments,
  selectedDepartments,
  selectedContracts,
  onChangeDepartments,
  onChangeContracts,
  idPrefix,
}) => {
  const allDeptsSelected =
    departments.length > 0 &&
    departments.every((d) => selectedDepartments.includes(d));

  const allContractsSelected = ALL_EMPLOYMENT_TYPES.every((c) =>
    selectedContracts.includes(c)
  );

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {/* Departments (همه دپارتمان‌ها) */}
      <fieldset className="bg-white border border-slate-200 rounded-md p-3">
        <legend className="px-1 text-[11px] font-semibold text-slate-700">
          دپارتمان‌ها ({toPersianDigits(selectedDepartments.length)} از{' '}
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
                onChangeDepartments(
                  toggleMultiSelectAll(selectedDepartments, departments)
                )
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
                const checked = selectedDepartments.includes(dept);
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
                        onChangeDepartments(
                          toggleMultiSelectItem(selectedDepartments, dept)
                        )
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

      {/* Contracts (همه قراردادها) */}
      <fieldset className="bg-white border border-slate-200 rounded-md p-3">
        <legend className="px-1 text-[11px] font-semibold text-slate-700">
          قراردادها ({toPersianDigits(selectedContracts.length)} از{' '}
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
                onChangeContracts(
                  toggleMultiSelectAll(selectedContracts, ALL_EMPLOYMENT_TYPES)
                )
              }
              className="w-3.5 h-3.5 rounded accent-teal-700"
            />
            <span>انتخاب همه (همه قراردادها)</span>
          </label>

          <div className="flex flex-wrap gap-x-3 gap-y-1.5">
            {ALL_EMPLOYMENT_TYPES.map((contract) => {
              const checked = selectedContracts.includes(contract);
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
                      onChangeContracts(
                        toggleMultiSelectItem(selectedContracts, contract)
                      )
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
    </div>
  );
};
