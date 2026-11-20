import test from 'node:test';
import assert from 'node:assert/strict';
import { INITIAL_SEED_STATE } from '../data/seedData';
import {
  ALL_MANUAL_SALARY_MODES,
  createDefaultMultiSelectFilters,
  extractEmployeeDepartments,
  matchesMultiSelectManualSalaryFilters,
  toggleMultiSelectAll,
  toggleMultiSelectItem,
} from './manualSalaryFilter';

test('extractEmployeeDepartments and createDefaultMultiSelectFilters include all departments, contracts, and modes', () => {
  const departments = extractEmployeeDepartments(INITIAL_SEED_STATE.employees);
  assert.ok(departments.length >= 3);

  const defaults = createDefaultMultiSelectFilters(INITIAL_SEED_STATE.employees);
  assert.deepEqual(defaults.selectedDepartments, departments);
  assert.ok(defaults.selectedContracts.includes('employed'));
  assert.ok(defaults.selectedContracts.includes('article-28'));
  assert.ok(defaults.selectedContracts.includes('article-38'));
  assert.deepEqual(defaults.selectedModes, ALL_MANUAL_SALARY_MODES);
});

test('toggleMultiSelectAll unselects all when all are checked and re-selects all when partial or empty', () => {
  const items = ['فنی', 'مالی', 'تولید'];
  const afterUncheck = toggleMultiSelectAll(items, items);
  assert.deepEqual(afterUncheck, []);

  const afterRecheckFromEmpty = toggleMultiSelectAll(afterUncheck, items);
  assert.deepEqual(afterRecheckFromEmpty, items);

  const afterRecheckFromPartial = toggleMultiSelectAll(['فنی'], items);
  assert.deepEqual(afterRecheckFromPartial, items);
});

test('toggleMultiSelectItem adds and removes individual checkboxes cleanly', () => {
  const step1 = toggleMultiSelectItem(['override', 'additional'], 'additional');
  assert.deepEqual(step1, ['override']);

  const step2 = toggleMultiSelectItem(step1, 'additional');
  assert.deepEqual(step2, ['override', 'additional']);
});

test('matchesMultiSelectManualSalaryFilters enforces strict hiding when unselected or empty', () => {
  const emp = INITIAL_SEED_STATE.employees[0];
  const baseFilters = createDefaultMultiSelectFilters(INITIAL_SEED_STATE.employees);

  assert.equal(
    matchesMultiSelectManualSalaryFilters(emp, 'override', baseFilters),
    true
  );

  // Uncheck employee's calculation mode
  assert.equal(
    matchesMultiSelectManualSalaryFilters(emp, 'override', {
      ...baseFilters,
      selectedModes: ['additional'],
    }),
    false
  );

  // Empty modes selection -> nothing shown ("اگر انتخاب نشد نمایش داده نشود")
  assert.equal(
    matchesMultiSelectManualSalaryFilters(emp, 'override', {
      ...baseFilters,
      selectedModes: [],
    }),
    false
  );

  // Empty departments selection -> nothing shown
  assert.equal(
    matchesMultiSelectManualSalaryFilters(emp, 'override', {
      ...baseFilters,
      selectedDepartments: [],
    }),
    false
  );

  // Empty contracts selection -> nothing shown
  assert.equal(
    matchesMultiSelectManualSalaryFilters(emp, 'override', {
      ...baseFilters,
      selectedContracts: [],
    }),
    false
  );

  // Different contract unchecked
  assert.equal(
    matchesMultiSelectManualSalaryFilters(emp, 'override', {
      ...baseFilters,
      selectedContracts: baseFilters.selectedContracts.filter(
        (c) => c !== emp.employmentType
      ),
    }),
    false
  );
});
