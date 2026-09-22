/**
 * Сэмплинг для 3D-блоков: поверхность z = f(x, y), облако точек и матрица высот.
 *
 * Режимы (plotMode):
 *  - 'surface' — выражение от x и/или y → регулярная сетка z(x,y);
 *    выражение без x/y, но равное матрице чисел → матрица высот
 *    (x = индекс столбца, y = индекс строки).
 *  - 'points'  — матрица N×3 → N точек (x, y, z);
 *    три вектора через «;» (`X; Y; Z` одинаковой длины) → точки.
 *  - 'matrix'  — принудительно матрица высот (как surface для матриц).
 *  - 'auto'    — эвристика: N×3 → точки, 2D-матрица → высоты, иначе функция.
 *
 * Область: x ∈ [xmin, xmax], y ∈ [ymin, ymax]. Разрешение сетки res×res.
 * Все переменные документа видны (scope), x/y подставляются поверх scope.
 */
import {
  compilePlotExpr,
  math,
  preprocessJ,
  preprocessRanges,
  unitToNumber,
  type Scope,
} from './mathEngine';

export type Plot3dMode = 'auto' | 'surface' | 'points' | 'matrix';

export interface Plot3dSurface {
  mode: 'surface';
  /** исходное выражение */
  expr: string;
  /** координаты узлов сетки */
  gx: number[];
  gy: number[];
  /** zs[row][col], null — разрыв (NaN/Inf/ошибка в точке) */
  zs: (number | null)[][];
  cols: number;
  rows: number;
  xmin: number;
  xmax: number;
  ymin: number;
  ymax: number;
  zmin: number;
  zmax: number;
}

export interface Plot3dPoints {
  mode: 'points';
  expr: string;
  pts: { x: number; y: number; z: number }[];
  xmin: number;
  xmax: number;
  ymin: number;
  ymax: number;
  zmin: number;
  zmax: number;
}

export type Plot3dSample = Plot3dSurface | Plot3dPoints;

export interface Sample3dOpts {
  xmin?: number;
  xmax?: number;
  ymin?: number;
  ymax?: number;
  /** разрешение сетки поверхности (8..100) */
  res?: number;
  mode?: Plot3dMode;
}

function numOf(v: unknown): number | null {
  const un = unitToNumber(v);
  if (un !== null) return un;
  if (v !== null && typeof v === 'object' && 're' in (v as object)) {
    const re = Number((v as { re: number }).re);
    return isFinite(re) ? re : null;
  }
  return null;
}

/** Значение → вложенный JS-массив (mathjs Matrix или Array). */
function toNested(v: unknown): unknown[] | null {
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

/** Есть ли в выражении свободная переменная x / y (по AST, не регексом). */
function freeVars(expr: string): { x: boolean; y: boolean } {
  const out = { x: false, y: false };
  try {
    const node = math.parse(preprocessRanges(preprocessJ(expr, false)));
    node.traverse((nn: unknown) => {
      const s = nn as { isSymbolNode?: boolean; name?: string };
      if (s.isSymbolNode && (s.name === 'x' || s.name === 'y')) {
        if (s.name === 'x') out.x = true;
        else out.y = true;
      }
    });
  } catch {
    /* не парсится — дальше вернётся ошибка вычисления */
  }
  return out;
}

function evalInScope(expr: string, scope: Scope): unknown {
  return math.evaluate(preprocessRanges(preprocessJ(expr, false)), { ...scope });
}

function pad(lo: number, hi: number): [number, number] {
  if (lo === hi) {
    lo -= 1;
    hi += 1;
  }
  const span = hi - lo;
  return [lo - span * 0.06, hi + span * 0.06];
}

/** Плоский вектор чисел из значения (для X; Y; Z). */
function flatNums(v: unknown): number[] | null {
  const nested = toNested(v);
  if (!nested) return null;
  const flat = nested.flat(Infinity) as unknown[];
  if (flat.length < 2) return null;
  const out: number[] = [];
  for (const item of flat) {
    const n = numOf(item);
    if (n === null) return null;
    out.push(n);
  }
  return out;
}

/**
 * Попытка интерпретировать значение как точки:
 * матрица N×3 (или 3×N — транспонируем) → pts. Иначе null.
 */
function asPointsMatrix(v: unknown): { x: number; y: number; z: number }[] | null {
  const nested = toNested(v);
  if (!nested || !nested.length || !Array.isArray(nested[0])) return null;
  const m = nested as unknown[][];
  const rows = m.length;
  const cols = Math.max(...m.map((r) => (Array.isArray(r) ? r.length : 0)));
  // N×3 напрямую
  const tryShape = (rm: unknown[][]): { x: number; y: number; z: number }[] | null => {
    const pts: { x: number; y: number; z: number }[] = [];
    for (const row of rm) {
      if (!Array.isArray(row) || row.length !== 3) return null;
      const x = numOf(row[0]);
      const y = numOf(row[1]);
      const z = numOf(row[2]);
      if (x === null || y === null || z === null) return null;
      pts.push({ x, y, z });
    }
    return pts.length >= 2 ? pts : null;
  };
  if (cols === 3) {
    const p = tryShape(m);
    if (p) return p;
  }
  // 3×N → транспонировать
  if (rows === 3 && cols !== 3) {
    const t: unknown[][] = m[0].map((_, c) => m.map((r) => r[c]));
    const p = tryShape(t);
    if (p) return p;
  }
  return null;
}

/** 2D-матрица чисел → сетка высот. null, если не матрица чисел. */
function asHeightMatrix(v: unknown): number[][] | null {
  const nested = toNested(v);
  if (!nested || nested.length < 2 || !Array.isArray(nested[0])) return null;
  const grid: number[][] = [];
  for (const row of nested as unknown[][]) {
    if (!Array.isArray(row) || row.length < 2) return null;
    const line: number[] = [];
    for (const item of row) {
      const n = numOf(item);
      if (n === null) return null;
      line.push(n);
    }
    grid.push(line);
  }
  const w = grid[0].length;
  if (!grid.every((r) => r.length === w)) return null;
  return grid;
}

function boundsOf(pts: { x: number; y: number; z: number }[]): {
  xmin: number;
  xmax: number;
  ymin: number;
  ymax: number;
  zmin: number;
  zmax: number;
} {
  let x0 = Infinity,
    x1 = -Infinity,
    y0 = Infinity,
    y1 = -Infinity,
    z0 = Infinity,
    z1 = -Infinity;
  for (const p of pts) {
    if (p.x < x0) x0 = p.x;
    if (p.x > x1) x1 = p.x;
    if (p.y < y0) y0 = p.y;
    if (p.y > y1) y1 = p.y;
    if (p.z < z0) z0 = p.z;
    if (p.z > z1) z1 = p.z;
  }
  const [ax0, ax1] = pad(x0, x1);
  const [ay0, ay1] = pad(y0, y1);
  const [az0, az1] = pad(z0, z1);
  return { xmin: ax0, xmax: ax1, ymin: ay0, ymax: ay1, zmin: az0, zmax: az1 };
}

function sampleSurface(
  expr: string,
  scope: Scope,
  xmin: number,
  xmax: number,
  ymin: number,
  ymax: number,
  res: number,
): Plot3dSurface | null {
  const pre = preprocessRanges(preprocessJ(expr, false));
  // Однократная компиляция вместо parse+compile на каждую точку сетки
  const c = compilePlotExpr(pre);
  if (!c) return null;
  const gx: number[] = [];
  const gy: number[] = [];
  for (let k = 0; k < res; k++) gx.push(xmin + ((xmax - xmin) * k) / (res - 1));
  for (let k = 0; k < res; k++) gy.push(ymin + ((ymax - ymin) * k) / (res - 1));
  const zs: (number | null)[][] = [];
  const finite: number[] = [];
  // scope-копия: x/y подставляются как переменные (надёжнее строковой замены)
  const base: Scope = { ...scope };
  for (const yv of gy) {
    const row: (number | null)[] = [];
    base.y = yv;
    for (const xv of gx) {
      let z: number | null = null;
      try {
        base.x = xv;
        const v: unknown = c.code.evaluate(base);
        z = numOf(v);
      } catch {
        z = null;
      }
      row.push(z);
      if (z !== null) finite.push(z);
    }
    zs.push(row);
  }
  if (finite.length < 2) return null;
  let z0 = Math.min(...finite);
  let z1 = Math.max(...finite);
  [z0, z1] = pad(z0, z1);
  return {
    mode: 'surface',
    expr,
    gx,
    gy,
    zs,
    cols: res,
    rows: res,
    xmin,
    xmax,
    ymin,
    ymax,
    zmin: z0,
    zmax: z1,
  };
}

function heightToSurface(
  expr: string,
  grid: number[][],
  xmin: number,
  xmax: number,
  ymin: number,
  ymax: number,
): Plot3dSurface {
  const rows = grid.length;
  const cols = grid[0].length;
  const gx: number[] = [];
  const gy: number[] = [];
  for (let k = 0; k < cols; k++)
    gx.push(xmin + (xmax - xmin) * (cols === 1 ? 0.5 : k / (cols - 1)));
  for (let k = 0; k < rows; k++)
    gy.push(ymin + (ymax - ymin) * (rows === 1 ? 0.5 : k / (rows - 1)));
  let z0 = Infinity,
    z1 = -Infinity;
  for (const row of grid)
    for (const z of row) {
      if (z < z0) z0 = z;
      if (z > z1) z1 = z;
    }
  [z0, z1] = pad(z0, z1);
  return {
    mode: 'surface',
    expr,
    gx,
    gy,
    zs: grid.map((r) => [...r]),
    cols,
    rows,
    xmin,
    xmax,
    ymin,
    ymax,
    zmin: z0,
    zmax: z1,
  };
}

/**
 * Главная функция сэмплинга 3D-блока. Возвращает null, если интерпретировать
 * ввод как 3D-данные не удалось (компонент покажет подсказку).
 */
export function samplePlot3d(
  plotFn: string,
  scope: Scope,
  opts?: Sample3dOpts,
): Plot3dSample | null {
  const xmin = opts?.xmin ?? -5;
  const xmax = opts?.xmax ?? 5;
  const ymin = opts?.ymin ?? -5;
  const ymax = opts?.ymax ?? 5;
  const res = Math.max(8, Math.min(100, Math.round(opts?.res ?? 48)));
  const mode = opts?.mode ?? 'auto';
  if (!(xmin < xmax) || !(ymin < ymax)) return null;

  const parts = plotFn
    .split(/[;\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (!parts.length) return null;
  const expr = parts[0];

  // Три вектора через «;» → точки (явный синтаксис X; Y; Z)
  if (parts.length === 3 && (mode === 'auto' || mode === 'points')) {
    try {
      const vecs = parts.map((p) => flatNums(evalInScope(p, scope)));
      if (
        vecs.every((v) => v && v.length >= 2) &&
        vecs[0]!.length === vecs[1]!.length &&
        vecs[0]!.length === vecs[2]!.length
      ) {
        const pts = vecs[0]!.map((x, k) => ({ x, y: vecs[1]![k], z: vecs[2]![k] }));
        return { mode: 'points', expr: plotFn, pts, ...boundsOf(pts) };
      }
    } catch {
      /* ниже — другие интерпретации */
    }
  }

  // Одно выражение, вычисляемое без x/y → матрица?
  const fv = freeVars(expr);
  if (!fv.x && !fv.y) {
    let v: unknown = null;
    try {
      v = evalInScope(expr, scope);
    } catch {
      return null;
    }
    if (mode !== 'surface') {
      const pm = asPointsMatrix(v);
      if (pm) return { mode: 'points', expr, pts: pm, ...boundsOf(pm) };
    }
    const hm = asHeightMatrix(v);
    if (hm) {
      // x/y-диапазон для матрицы высот: индексный, если пользователь не задал свой
      return heightToSurface(expr, hm, xmin, xmax, ymin, ymax);
    }
    if (mode === 'points' || mode === 'matrix') return null;
    // скаляр без x/y — нечего рисовать
    return null;
  }

  // Функция от x/y → поверхность (в points-режиме тоже можно: сэмплируем и отдаём узлы как точки)
  if (mode === 'points') {
    const s = sampleSurface(expr, scope, xmin, xmax, ymin, ymax, Math.min(res, 40));
    if (!s) return null;
    const pts: { x: number; y: number; z: number }[] = [];
    s.gy.forEach((yv, r) =>
      s.gx.forEach((xv, c) => {
        const z = s.zs[r][c];
        if (z !== null) pts.push({ x: xv, y: yv, z });
      }),
    );
    if (pts.length < 2) return null;
    return { mode: 'points', expr, pts, ...boundsOf(pts) };
  }
  return sampleSurface(expr, scope, xmin, xmax, ymin, ymax, res);
}
