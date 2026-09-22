/**
 * Сэмплинг выражений от одной переменной для автографиков.
 * Используется пересчётом (превью под формулой) и показывает график,
 * когда блок можно интерпретировать как функцию: `f(x) := ...`,
 * `sin(x) =`, `y := sin(w*x)` при неопределённом x и т.д.
 */
import { compilePlotExpr, math, preprocessJ, preprocessRanges, type Scope } from './mathEngine';

export interface PlotSample {
  /** подпись серии */
  label: string;
  /** выражение для полноценного plot-блока (переменная — всегда x) */
  expr: string;
  xs: number[];
  ys: (number | null)[];
  xmin: number;
  xmax: number;
  ymin: number;
  ymax: number;
}

export interface SampleOpts {
  varName?: string;
  xmin?: number;
  xmax?: number;
  n?: number;
  label?: string;
}

export function sampleExpression(
  rawExpr: string,
  scope: Scope,
  opts?: SampleOpts,
): PlotSample | null {
  const varName = opts?.varName ?? 'x';
  const xmin = opts?.xmin ?? -10;
  const xmax = opts?.xmax ?? 10;
  const n = opts?.n ?? 120;
  if (!/^[A-Za-z_]\w*$/.test(varName)) return null;
  if (!(xmin < xmax) || n < 8 || n > 2000) return null;

  const pre = preprocessRanges(preprocessJ(rawExpr, false));

  // Однократная компиляция: точки гоняем через scope (в ~68 раз быстрее parse на точку)
  const compiled = compilePlotExpr(pre);
  if (!compiled || !compiled.freeVars.includes(varName)) return null;

  // x подставляем числом; остальные переменные — из документа
  const base: Scope = { ...scope };
  delete base[varName];

  const xs: number[] = [];
  const ys: (number | null)[] = [];
  for (let k = 0; k < n; k++) {
    const xv = xmin + ((xmax - xmin) * k) / (n - 1);
    xs.push(xv);
    let y: number | null = null;
    try {
      base[varName] = xv;
      const v: unknown = compiled.code.evaluate(base);
      if (typeof v === 'number' && isFinite(v)) y = v;
      else if (v !== null && typeof v === 'object' && 're' in (v as object)) {
        const re = Number((v as { re: number }).re);
        if (isFinite(re)) y = re;
      }
    } catch {
      y = null;
    }
    ys.push(y);
  }
  const finite = ys.filter((v): v is number => typeof v === 'number' && isFinite(v));
  if (finite.length < 2) return null;
  let lo = Math.min(...finite);
  let hi = Math.max(...finite);
  if (lo === hi) {
    lo -= 1;
    hi += 1;
  }
  const pad = (hi - lo) * 0.12;
  lo -= pad;
  hi += pad;
  return { label: opts?.label ?? rawExpr, expr: rawExpr, xs, ys, xmin, xmax, ymin: lo, ymax: hi };
}

export interface PlotSeriesData {
  expr: string;
  /** true — значения вектора из документа, x = индекс */
  indexMode: boolean;
  xs: number[];
  ys: (number | null)[];
}

export interface PlotBlockSample {
  series: PlotSeriesData[];
  ymin: number;
  ymax: number;
}

function numOf(v: unknown): number | null {
  if (typeof v === 'number' && isFinite(v)) return v;
  if (v !== null && typeof v === 'object' && 're' in (v as object)) {
    const re = Number((v as { re: number }).re);
    return isFinite(re) ? re : null;
  }
  return null;
}

function toFlatArray(v: unknown): unknown[] | null {
  if (Array.isArray(v)) return (v as unknown[]).flat(Infinity);
  if (v !== null && typeof v === 'object' && 'toArray' in (v as object)) {
    try {
      return ((v as { toArray: () => unknown }).toArray() as unknown[]).flat(Infinity);
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Сэмплинг plot-блока: несколько серий через `;`, выражения от x,
 * векторы из документа (по индексу), скаляры (горизонталь).
 * Та же математика, что в PlotBlockView.
 */
export function samplePlotBlock(
  plotFn: string,
  scope: Scope,
  xmin: number,
  xmax: number,
  n = 240,
): PlotBlockSample | null {
  const exprs = plotFn
    .split(/[;\n]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 5);
  if (!exprs.length || !(xmin < xmax)) return null;

  const evalWithX = (() => {
    // Серии компилируем один раз; точки гоняем через общий scope-объект.
    // Нескомпилировавшееся (присваивания и т.п.) даёт null-точки, как раньше.
    const cache = new Map<string, { code: { evaluate: (s: Scope) => unknown } } | null>();
    const base: Scope = { ...scope };
    return (expr: string, x: number): unknown => {
      let c = cache.get(expr);
      if (c === undefined) {
        const pre = preprocessRanges(`(${preprocessJ(expr, false)})`);
        const cc = compilePlotExpr(pre);
        c = cc && cc.freeVars.includes('x') ? { code: cc.code } : null;
        cache.set(expr, c);
      }
      if (!c) throw new Error('no-data');
      base.x = x;
      // чистый eval без присваиваний: base — наша копия, scope документа не пачкаем
      return c.code.evaluate(base);
    };
  })();

  const allY: number[] = [];
  const series: PlotSeriesData[] = [];
  for (const expr of exprs) {
    const hasX = /\bx\b/.test(preprocessJ(expr, false));
    const xs: number[] = [];
    const ys: (number | null)[] = [];
    if (!hasX) {
      let v: unknown = null;
      try {
        v = math.evaluate(preprocessRanges(`(${preprocessJ(expr, false)})`), { ...scope });
      } catch {
        v = null;
      }
      const arr = toFlatArray(v);
      if (arr && arr.length > 1) {
        arr.forEach((item, k) => {
          xs.push(k);
          ys.push(numOf(item));
        });
        series.push({ expr, indexMode: true, xs, ys });
      } else {
        const y0 = numOf(v);
        if (y0 === null) {
          series.push({ expr, indexMode: false, xs: [], ys: [] });
          continue;
        }
        for (let k = 0; k < n; k++) {
          xs.push(xmin + ((xmax - xmin) * k) / (n - 1));
          ys.push(y0);
        }
        series.push({ expr, indexMode: false, xs, ys });
      }
    } else {
      for (let k = 0; k < n; k++) {
        const x = xmin + ((xmax - xmin) * k) / (n - 1);
        let y: number | null = null;
        try {
          y = numOf(evalWithX(expr, x));
        } catch {
          y = null;
        }
        xs.push(x);
        ys.push(y);
      }
      series.push({ expr, indexMode: false, xs, ys });
    }
  }
  for (const s of series) {
    for (const y of s.ys) if (typeof y === 'number' && isFinite(y)) allY.push(y);
  }
  if (!allY.length) return null;
  let lo = Math.min(...allY);
  let hi = Math.max(...allY);
  if (lo === hi) {
    lo -= 1;
    hi += 1;
  }
  const span = hi - lo;
  lo -= span * 0.12;
  hi += span * 0.12;
  return { series, ymin: lo, ymax: hi };
}
