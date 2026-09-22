/**
 * lib/plotTicks — общие тики и подписи осей для 2D/3D/Sim-вьюх.
 *
 * Раньше fmtTick был скопирован в 4 компонента с дрейфом
 * (пороги 1000/10000, exp 0/1), а niceTicks/logTicks жили только
 * в PlotBlockView. Здесь — одна параметризованная реализация,
 * поведение по умолчанию = Plot/Contour (самый частый вариант).
 */

export interface TickFmtOpts {
  /** Порог exp-сверху (по умолчанию 1000, у Sim — 10000). */
  hi?: number;
  /** Порог exp-снизу (по умолчанию 0.01, у Sim — 0.001). */
  lo?: number;
  /** Значащих цифр в середине (везде 4). */
  precision?: number;
  /** Знаков в экспоненте (Plot/Contour/Sim — 0, Plot3d — 1). */
  expDigits?: number;
  /** Что показать для не-чисел (по умолчанию '—', у Plot/Contour — 'NaN'). */
  nonFinite?: string;
}

/** Подпись тика оси. */
export function formatTick(v: number, opts?: TickFmtOpts): string {
  const hi = opts?.hi ?? 1000;
  const lo = opts?.lo ?? 0.01;
  const precision = opts?.precision ?? 4;
  const expDigits = opts?.expDigits ?? 0;
  if (!isFinite(v)) return opts?.nonFinite ?? '—';
  if (v === 0) return '0';
  const a = Math.abs(v);
  if (a >= hi || a < lo) return v.toExponential(expDigits);
  return String(Number(v.toPrecision(precision)));
}

/** "Красивые" тики для оси (были только в PlotBlockView). */
export function niceTicks(lo: number, hi: number, count = 5): number[] {
  if (!isFinite(lo) || !isFinite(hi) || lo === hi) return [lo];
  const span = hi - lo;
  const step0 = span / count;
  const mag = 10 ** Math.floor(Math.log10(step0));
  const norm = step0 / mag;
  const step = (norm >= 5 ? 5 : norm >= 2 ? 2 : 1) * mag;
  const ticks: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-12; v += step) {
    ticks.push(Number(v.toPrecision(10)));
  }
  return ticks;
}

/** Логарифмические тики: 1, 2, 5 · 10ᵖ внутри (lo, hi). */
export function logTicks(lo: number, hi: number): number[] {
  const out: number[] = [];
  for (let p = Math.floor(Math.log10(lo)); p <= Math.ceil(Math.log10(hi)); p++) {
    const base = 10 ** p;
    for (const m of [1, 2, 5]) {
      const v = m * base;
      if (v >= lo - 1e-12 && v <= hi + 1e-12) out.push(v);
    }
  }
  return out;
}
