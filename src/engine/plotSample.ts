/**
 * Сэмплинг выражений от одной переменной для автографиков.
 * Используется пересчётом (превью под формулой) и показывает график,
 * когда блок можно интерпретировать как функцию: `f(x) := ...`,
 * `sin(x) =`, `y := sin(w*x)` при неопределённом x и т.д.
 */
import { math, preprocessJ, preprocessRanges, type Scope } from './mathEngine';

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

export function sampleExpression(rawExpr: string, scope: Scope, opts?: SampleOpts): PlotSample | null {
  const varName = opts?.varName ?? 'x';
  const xmin = opts?.xmin ?? -10;
  const xmax = opts?.xmax ?? 10;
  const n = opts?.n ?? 120;
  if (!/^[A-Za-z_]\w*$/.test(varName)) return null;
  if (!(xmin < xmax) || n < 8 || n > 2000) return null;

  const pre = preprocessRanges(preprocessJ(rawExpr, false));

  // Убеждаемся, что это действительно функция от varName
  let hasVar = false;
  try {
    const node = math.parse(pre);
    node.traverse((nn: unknown) => {
      const s = nn as { isSymbolNode?: boolean; name?: string };
      if (s.isSymbolNode && s.name === varName) hasVar = true;
    });
  } catch {
    return null;
  }
  if (!hasVar) return null;

  // x подставляем числом; остальные переменные — из документа
  const sc: Scope = { ...scope };
  delete sc[varName];
  const varRe = new RegExp(`\\b${varName}\\b`, 'g');

  const xs: number[] = [];
  const ys: (number | null)[] = [];
  for (let k = 0; k < n; k++) {
    const xv = xmin + ((xmax - xmin) * k) / (n - 1);
    xs.push(xv);
    let y: number | null = null;
    try {
      const v: unknown = math.evaluate(pre.replace(varRe, `(${xv})`), sc);
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
