import { describe, expect, it } from 'vitest';
import { all, create } from 'mathjs';
import {
  complexReOrNull,
  createLru,
  flattenValue,
  isTruthyValue,
  nestedValue,
  padRange,
} from './core';

describe('createLru', () => {
  it('вытесняет самый старый при переполнении', () => {
    const c = createLru<string, number>(2);
    c.set('a', 1);
    c.set('b', 2);
    c.set('c', 3);
    expect(c.get('a')).toBeUndefined();
    expect(c.get('b')).toBe(2);
    expect(c.get('c')).toBe(3);
  });

  it('get освежает порядок (hit не вытесняется)', () => {
    const c = createLru<string, number>(2);
    c.set('a', 1);
    c.set('b', 2);
    c.get('a');
    c.set('c', 3);
    expect(c.get('a')).toBe(1);
    expect(c.get('b')).toBeUndefined();
  });
});

describe('complexReOrNull', () => {
  it('converts BigNumber to double for plotting while preserving truthiness', () => {
    const math = create(all, { number: 'BigNumber', precision: 50 });
    const small = math.evaluate('1e-40');
    expect(complexReOrNull(small)).toBe(1e-40);
    expect(isTruthyValue(small)).toBe(true);
    expect(isTruthyValue(math.evaluate('0'))).toBe(false);
  });

  it('числа и комплексные', () => {
    expect(complexReOrNull(2.5)).toBe(2.5);
    expect(complexReOrNull({ re: 3, im: 4 })).toBe(3);
    expect(complexReOrNull(NaN)).toBeNull();
    expect(complexReOrNull(Infinity)).toBeNull();
    expect(complexReOrNull('x')).toBeNull();
    expect(complexReOrNull(null)).toBeNull();
  });
});

describe('flattenValue / nestedValue', () => {
  it('массивы сплющивает, матрицы через toArray', () => {
    expect(flattenValue([1, [2, [3]]])).toEqual([1, 2, 3]);
    expect(flattenValue({ toArray: () => [[1, 2], [3]] })).toEqual([1, 2, 3]);
    expect(flattenValue(5)).toBeNull();
    expect(nestedValue([[1, 2], [3]])).toEqual([[1, 2], [3]]);
    expect(nestedValue(5)).toBeNull();
  });
});

describe('isTruthyValue', () => {
  it('скаляры и контейнеры', () => {
    expect(isTruthyValue(true)).toBe(true);
    expect(isTruthyValue(0)).toBe(false);
    expect(isTruthyValue(2)).toBe(true);
    expect(isTruthyValue({ re: 0, im: 1 })).toBe(true);
    expect(isTruthyValue({ re: 0, im: 0 })).toBe(false);
    expect(isTruthyValue([])).toBe(false);
    expect(isTruthyValue([0])).toBe(true);
    expect(isTruthyValue(null)).toBe(false);
  });
});

describe('padRange', () => {
  it('вырожденный диапазон расширяет, обычный — pad 12%', () => {
    const [dlo, dhi] = padRange(5, 5);
    expect(dlo).toBeCloseTo(3.76, 10);
    expect(dhi).toBeCloseTo(6.24, 10);
    const [lo, hi] = padRange(0, 100);
    expect(lo).toBeCloseTo(-12, 10);
    expect(hi).toBeCloseTo(112, 10);
  });
});
