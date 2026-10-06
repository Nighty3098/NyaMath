/**
 * Векторная визуализация plot-блоков: стиль «Стрелки» (arrow) и
 * «Векторное поле» (field). Чистые функции без DOM — их же используют
 * plotSample (MCP/тесты) и PlotBlockView (SVG).
 */
import { compilePlotExpr, preprocessJ, preprocessRanges } from './mathEngine';
import type { Scope } from './core';

/** Стрелка в данных координатах: из (x, y) в (x+dx, y+dy). */
export interface ArrowDatum {
  x: number;
  y: number;
  dx: number;
  dy: number;
}

export type NumOf = (v: unknown) => number | null;

function numArr(v: unknown): unknown[] | null {
  if (Array.isArray(v)) return v;
  if (v !== null && typeof v === 'object' && 'toArray' in (v as object)) {
    try {
      const a = (v as { toArray: () => unknown }).toArray();
      return Array.isArray(a) ? a : null;
    } catch {
      return null;
    }
  }
  return null;
}

/** Значение → плоский массив чисел (юниты/комплексные через numOf). null — не числа. */
function flatNums(v: unknown, numOf: NumOf): number[] | null {
  const arr = numArr(v);
  if (!arr) return null;
  const out: number[] = [];
  for (const item of arr.flat(Infinity)) {
    const n = numOf(item);
    if (n === null) return null;
    out.push(n);
  }
  return out;
}

/**
 * Значение без x → стрелки от начала координат:
 *  - вектор длины 2 → одна стрелка (0,0)→(dx,dy);
 *  - матрица N×2 (каждая строка длины 2) → N стрелок;
 *  - N×1-столбец длины 2 → одна стрелка.
 * null — не подходит (скаляр, длина 3, нечисловые компоненты):
 * вызывающий падает обратно на обычную линию.
 */
export function arrowsFromValue(v: unknown, numOf: NumOf): ArrowDatum[] | null {
  const arr = numArr(v);
  if (!arr || !arr.length) return null;
  const nested = arr.some((r) => numArr(r) !== null);
  if (!nested) {
    const flat = flatNums(arr, numOf);
    if (!flat || flat.length !== 2) return null;
    return [{ x: 0, y: 0, dx: flat[0], dy: flat[1] }];
  }
  const rows: ArrowDatum[] = [];
  const numsRows: number[][] = [];
  for (const r of arr) {
    const nums = flatNums(r, numOf);
    if (!nums) return null;
    numsRows.push(nums);
  }
  // N×1-столбец длины 2 → одна стрелка (столбец трактуем как [dx, dy])
  if (numsRows.every((n) => n.length === 1)) {
    if (numsRows.length !== 2) return null;
    return [{ x: 0, y: 0, dx: numsRows[0][0], dy: numsRows[1][0] }];
  }
  for (const nums of numsRows) {
    if (nums.length !== 2) return null;
    rows.push({ x: 0, y: 0, dx: nums[0], dy: nums[1] });
  }
  return rows.length ? rows : null;
}

/** Свободные переменные выражения (после той же обработки, что у графиков). null — не компилируется. */
export function freeVarsOf(expr: string): string[] | null {
  try {
    const cc = compilePlotExpr(preprocessRanges(`(${preprocessJ(expr, false)})`));
    return cc ? cc.freeVars : null;
  } catch {
    return null;
  }
}

export interface FieldBox {
  xmin: number;
  xmax: number;
  ymin: number;
  ymax: number;
}

/**
 * Векторное поле: expr свободна в x и y → сетка стрелок по прямоугольнику.
 * Точки — в центрах ячеек (сдвиг 0.5), null — выражение не бинарное
 * или ни одна точка не считалась.
 */
export function fieldArrows(
  expr: string,
  scope: Scope,
  box: FieldBox,
  numOf: NumOf,
  gx = 12,
  gy = 9,
): ArrowDatum[] | null {
  const { xmin, xmax, ymin, ymax } = box;
  if (!(xmin < xmax) || !(ymin < ymax) || gx < 2 || gy < 2) return null;
  const free = freeVarsOf(expr);
  if (!free || !free.includes('x') || !free.includes('y')) return null;
  let compiled: { code: { evaluate: (s: Scope) => unknown } };
  try {
    const cc = compilePlotExpr(preprocessRanges(`(${preprocessJ(expr, false)})`));
    if (!cc) return null;
    compiled = { code: cc.code };
  } catch {
    return null;
  }
  const base: Scope = { ...scope };
  const out: ArrowDatum[] = [];
  for (let j = 0; j < gy; j++) {
    const y = ymin + ((ymax - ymin) * (j + 0.5)) / gy;
    for (let i = 0; i < gx; i++) {
      const x = xmin + ((xmax - xmin) * (i + 0.5)) / gx;
      try {
        base.x = x;
        base.y = y;
        const pair = flatNums(compiled.code.evaluate(base), numOf);
        if (pair && pair.length === 2) out.push({ x, y, dx: pair[0], dy: pair[1] });
      } catch {
        /* точка выпала */
      }
    }
  }
  return out.length ? out : null;
}
