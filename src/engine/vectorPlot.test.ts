import { describe, expect, it } from 'vitest';
import { arrowsFromValue, fieldArrows, freeVarsOf } from './vectorPlot';
import { createBaseScope } from './mathEngine';

const numOf = (v: unknown): number | null =>
  typeof v === 'number' && isFinite(v) ? v : null;

describe('arrowsFromValue: значение → стрелки из начала координат', () => {
  it('вектор длины 2 → одна стрелка', () => {
    expect(arrowsFromValue([3, 4], numOf)).toEqual([{ x: 0, y: 0, dx: 3, dy: 4 }]);
  });

  it('матрица N×2 → N стрелок', () => {
    expect(arrowsFromValue([[1, 2], [3, 4]], numOf)).toEqual([
      { x: 0, y: 0, dx: 1, dy: 2 },
      { x: 0, y: 0, dx: 3, dy: 4 },
    ]);
  });

  it('N×1-столбец длины 2 → одна стрелка', () => {
    expect(arrowsFromValue([[3], [4]], numOf)).toEqual([{ x: 0, y: 0, dx: 3, dy: 4 }]);
  });

  it('не подходит: длина 3, скаляр, пусто, нечисловые компоненты', () => {
    expect(arrowsFromValue([1, 2, 3], numOf)).toBeNull();
    expect(arrowsFromValue(5, numOf)).toBeNull();
    expect(arrowsFromValue([], numOf)).toBeNull();
    expect(arrowsFromValue([1, 'a'], numOf)).toBeNull();
    expect(arrowsFromValue([[1, 2, 3]], numOf)).toBeNull();
  });
});

describe('fieldArrows: векторное поле F(x, y)', () => {
  it('вихрь [-y, x] на сетке 4×4', () => {
    const box = { xmin: -2, xmax: 2, ymin: -2, ymax: 2 };
    const arr = fieldArrows('[-y, x]', createBaseScope(), box, numOf, 4, 4);
    expect(arr).not.toBeNull();
    expect(arr!.length).toBe(16);
    const first = arr![0];
    expect(first.x).toBeCloseTo(-1.5, 12);
    expect(first.y).toBeCloseTo(-1.5, 12);
    expect(first.dx).toBeCloseTo(1.5, 12);
    expect(first.dy).toBeCloseTo(-1.5, 12);
  });

  it('требует свободные x и y: только x → null', () => {
    const box = { xmin: -2, xmax: 2, ymin: -2, ymax: 2 };
    expect(fieldArrows('x^2', createBaseScope(), box, numOf)).toBeNull();
    expect(fieldArrows('[x, y, 1]', createBaseScope(), box, numOf)).toBeNull();
  });

  it('вырожденный диапазон → null', () => {
    const box = { xmin: 1, xmax: 1, ymin: -2, ymax: 2 };
    expect(fieldArrows('[-y, x]', createBaseScope(), box, numOf)).toBeNull();
  });
});

describe('freeVarsOf', () => {
  it('находит свободные переменные', () => {
    expect(freeVarsOf('[a*x, b*y]')?.sort()).toEqual(['a', 'b', 'x', 'y']);
    expect(freeVarsOf('sin(x)')).toContain('x');
    expect(freeVarsOf('sin(x)')).not.toContain('y');
    expect(freeVarsOf('1+2')).toEqual([]);
  });
});