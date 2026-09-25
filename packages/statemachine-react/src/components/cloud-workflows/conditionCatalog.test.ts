import { describe, it, expect } from 'vitest';
import {
  checkCyodaGoSchemaVersion,
  isValidJsonPath,
  validateCyodaGoCondition,
} from './conditionCatalog';

describe('isValidJsonPath (cyoda-go v0.8.4 grammar)', () => {
  it.each([
    '$.amount', '$.a.b', '$.tags[*]', '$.arr[0]', '$.matrix[*][*]',
    '$.orders[*].lines[*].sku', '$.snake_case-name', '$.a[2147483647]',
  ])('accepts %s', (p) => {
    expect(isValidJsonPath(p)).toBe(true);
  });

  it.each([
    '', 'amount', '$', '$.', '$..a', '$.a.', "$['x']", '$.a[', '$.a[]', '$.a[-1]',
    '$.a[0:2]', '$.a[0,1]', '$.a[?(@.x)]', '$.a[ 0]', '$.a[0]b', '$.a[0];DROP',
    '$.[0]', '$.a[2147483648]', '$.naïve',
  ])('rejects %j', (p) => {
    expect(isValidJsonPath(p)).toBe(false);
  });
});

describe('checkCyodaGoSchemaVersion', () => {
  it.each(['1.1', '1.3', '1.4'])('accepts %s', (v) => {
    expect(checkCyodaGoSchemaVersion(v)).toBeNull();
  });

  it.each(['1.0', '1.5', '2.1', '1', '1.0.0', '01.1', 'x'])('rejects %s', (v) => {
    expect(checkCyodaGoSchemaVersion(v)).toMatch(/version/i);
  });
});

describe('validateCyodaGoCondition', () => {
  const simple = (over: Record<string, unknown> = {}) =>
    ({ type: 'simple', jsonPath: '$.amount', operation: 'EQUALS', value: '1', ...over });

  it('returns [] for undefined and for a valid tree', () => {
    expect(validateCyodaGoCondition(undefined, '/criterion')).toEqual([]);
    expect(validateCyodaGoCondition({
      type: 'group', operator: 'AND', conditions: [
        simple(),
        { type: 'lifecycle', field: 'state', operatorType: 'EQUALS', value: 'NEW' },
        { type: 'group', operator: 'NOT', conditions: [simple({ jsonPath: '$.tags[*]' })] },
        { type: 'array', jsonPath: '$.tags[*]', values: ['a'] },
      ],
    }, '/criterion')).toEqual([]);
  });

  it('flags a bare jsonPath with its location', () => {
    expect(validateCyodaGoCondition(
      { type: 'group', operator: 'AND', conditions: [simple({ jsonPath: 'amount' })] },
      '/criterion',
    )).toEqual([expect.objectContaining({ path: '/criterion/conditions/0/jsonPath' })]);
  });

  it('flags operators outside the catalog, whichever alias carries them', () => {
    for (const key of ['operation', 'operator', 'operatorType']) {
      const c: Record<string, unknown> = { type: 'simple', jsonPath: '$.a', value: '1' };
      c[key] = 'GREATER_THAN_OR_EQUAL';
      expect(validateCyodaGoCondition(c, '/c')).toEqual([
        expect.objectContaining({ path: '/c/operation', message: expect.stringContaining('GREATER_THAN_OR_EQUAL') }),
      ]);
    }
  });

  it('rejects IS_CHANGED (cloud-only change-generation operator)', () => {
    expect(validateCyodaGoCondition(simple({ operation: 'IS_CHANGED' }), '/c')).toHaveLength(1);
  });

  it.each([0, 2])('flags NOT with %i children', (n) => {
    const conditions = Array.from({ length: n }, () => simple());
    expect(validateCyodaGoCondition({ type: 'group', operator: 'NOT', conditions }, '/c')).toEqual([
      expect.objectContaining({ path: '/c/conditions', message: expect.stringContaining('exactly one') }),
    ]);
  });

  it('flags a lowercase group operator', () => {
    expect(validateCyodaGoCondition({ type: 'group', operator: 'and', conditions: [] }, '/c')).toEqual([
      expect.objectContaining({ path: '/c/operator' }),
    ]);
  });

  it('flags an array condition without a trailing [*]', () => {
    expect(validateCyodaGoCondition({ type: 'array', jsonPath: '$.tags', values: [] }, '/c')).toEqual([
      expect.objectContaining({ path: '/c/jsonPath' }),
    ]);
  });

  it('validates the nested criterion of a function condition', () => {
    expect(validateCyodaGoCondition(
      { type: 'function', function: { name: 'f', criterion: simple({ jsonPath: 'x' }) } },
      '/c',
    )).toEqual([expect.objectContaining({ path: '/c/function/criterion/jsonPath' })]);
  });
});
