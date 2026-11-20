import test from 'node:test';
import assert from 'node:assert/strict';
import { EMPLOYMENT_UNIT_OPTIONS, SALARY_TIER_LABELS } from './payroll';
import {
  CUSTOM_UNIT_SENTINEL,
  buildWorkLocationSelectGroups,
} from './unitOptions';

test('EMPLOYMENT_UNIT_OPTIONS includes all 8 organizational rows from SALARY_TIER_LABELS', () => {
  for (const tierLabel of SALARY_TIER_LABELS) {
    assert.ok(
      EMPLOYMENT_UNIT_OPTIONS.includes(tierLabel),
      `Missing salary tier in EMPLOYMENT_UNIT_OPTIONS: ${tierLabel}`
    );
  }
  assert.equal(SALARY_TIER_LABELS.length, 8);
});

test('buildWorkLocationSelectGroups surfaces all 8 salary tiers first and preserves employee unit without duplicates', () => {
  const groups = buildWorkLocationSelectGroups(
    { department: 'فنی و مهندسی', workLocation: 'ساختمان پخش' },
    'تولید سیما جیم'
  );

  assert.deepEqual(groups.tierOptions, [...SALARY_TIER_LABELS]);
  assert.ok(groups.otherOptions.includes('فنی و مهندسی'));
  assert.ok(groups.otherOptions.includes('ساختمان پخش'));
  // Ensure no duplicate of 'فنی و مهندسی'
  assert.equal(
    groups.otherOptions.filter((o) => o === 'فنی و مهندسی').length,
    1
  );
  // Ensure no tier option leaks into otherOptions
  for (const tierLabel of SALARY_TIER_LABELS) {
    assert.equal(groups.otherOptions.includes(tierLabel), false);
  }
  assert.equal(groups.isCustomValue, false);
});

test('buildWorkLocationSelectGroups flags unrecognized custom values while keeping sentinel distinct', () => {
  const groups = buildWorkLocationSelectGroups(
    { department: 'خبر', workLocation: 'معاونت خبر' },
    'واحد ویژه مستند'
  );

  assert.equal(groups.isCustomValue, true);
  assert.equal(CUSTOM_UNIT_SENTINEL, '__custom__');
});
