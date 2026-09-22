/**
 * Общие численные методы NyaMath: Ньютон для систем, Брент, Нелдер–Мид,
 * адаптивный Симпсон, RK4 для систем. Используют packs (решатели листа)
 * и simEngine (TR-BDF2/BVP). Ошибки — Error с английским кодом,
 * вызывающий код маппит их в локализованные через i18n.
 */

export interface NewtonResult {
  x: number[];
  converged: boolean;
  iters: number;
}

/* ---------- шаговый лог решателей (Symbolab-стиль, у нас free) ----------
 * trace?: приёмник строк итераций. Вызывающий код (паки) собирает строки
 * в подпись блока через pushSolverTrace(scope, ...). Формат компактный,
 * без LaTeX — как programTrace. Густоту режем compactTrace (первые+последние).
 */

/** Приёмник строк итераций решателя. */
export type TraceFn = (line: string) => void;

/**
 * Ключ лога в scope документа. Строка, а не символ: raw-функции паков
 * получают от mathjs не сам scope, а PartitionedMap-обёртку (записи туда
 *  снаружи не видны), а вот ЧТЕНИЕ делегируется — поэтому канал это ОБЩИЙ
 *  массив: движок кладёт [], решатели push'ат, забор сбрасывает в [].
 *  Имя с даблами подчёркиваниями — пользовательские переменные так не зовут.
 */
import { formatCompact } from './format';
export const SOLVER_TRACE_KEY = '__nya_trace__';

export interface SolverTraceEntry {
  label: string;
  lines: string[];
}

interface MapLike {
  get?: (k: string) => unknown;
  set?: (k: string, v: unknown) => void;
}

/** Прочитать канал: PartitionedMap mathjs — через .get, плоский scope — скобками. */
function chanGet(scope: Record<string, unknown>): unknown[] | undefined {
  const m = scope as Record<string, unknown> & MapLike;
  try {
    const v = typeof m.get === 'function' ? m.get(SOLVER_TRACE_KEY) : m[SOLVER_TRACE_KEY];
    return Array.isArray(v) ? v : undefined;
  } catch {
    return undefined;
  }
}

/** Подготовить канал перед оценкой блока (иначе решатели молчат). */
export function resetSolverTrace(scope: Record<string, unknown>): void {
  const m = scope as Record<string, unknown> & MapLike;
  try {
    if (typeof m.set === 'function') m.set(SOLVER_TRACE_KEY, []);
    else m[SOLVER_TRACE_KEY] = [];
  } catch {
    /* scope только для чтения — решатели промолчат */
  }
}

/** Опубликовать лог одного вызова решателя (нет канала — молча пропускаем). */
export function pushSolverTrace(scope: Record<string, unknown>, entry: SolverTraceEntry): void {
  const arr = chanGet(scope);
  if (arr) arr.push(entry);
}

/** Забрать лог блока плоским списком строк (и очистить — не течёт ниже/в плоты). */
export function takeSolverTrace(scope: Record<string, unknown>, maxLines = 40): string[] {
  const arr = chanGet(scope);
  resetSolverTrace(scope);
  if (!arr) return [];
  const out: string[] = [];
  for (const e of arr as SolverTraceEntry[]) {
    if (!e || typeof e.label !== 'string') continue;
    out.push(e.label);
    if (Array.isArray(e.lines)) out.push(...e.lines);
    if (out.length >= maxLines) break;
  }
  return out.slice(0, maxLines);
}

/** Компактный формат числа для лога (единая реализация — в engine/format.ts). */
export function fmtTrace(n: number): string {
  return formatCompact(n);
}

/** Вектор для лога. */
export function vecTrace(x: number[]): string {
  return `[${x.map(fmtTrace).join(', ')}]`;
}

/** Первые 5 + «…N» + последние 6 (итераций бывает сотни). */
export function compactTrace(lines: string[], keep = 12): string[] {
  if (lines.length <= keep) return lines;
  return [...lines.slice(0, 5), `… ${lines.length - 11} more`, ...lines.slice(-6)];
}

/** Ньютон для системы F(x)=0 с численной якобианой и демпфированием. */
export function newtonSystem(
  F: (x: number[]) => number[],
  x0: number[],
  maxIter = 100,
  tol = 1e-10,
  trace?: TraceFn,
): NewtonResult {
  const n = x0.length;
  let x = x0.slice();
  let r = F(x);
  checkVec(r, n);
  for (let k = 0; k < maxIter; k++) {
    const norm = Math.sqrt(r.reduce((s, v) => s + v * v, 0));
    trace?.(`k=${k} x=${vecTrace(x)} |F|=${fmtTrace(norm)}`);
    if (norm < tol) return { x, converged: true, iters: k };
    // численная якобиана
    const J: number[][] = [];
    for (let i = 0; i < n; i++) {
      J.push(new Array<number>(n).fill(0));
    }
    for (let j = 0; j < n; j++) {
      const h = 1e-8 * Math.max(1, Math.abs(x[j]));
      const xp = x.slice();
      xp[j] += h;
      const rp = F(xp);
      checkVec(rp, n);
      for (let i = 0; i < n; i++) J[i][j] = (rp[i] - r[i]) / h;
    }
    const dx = solveLinear(
      J,
      r.map((v) => -v),
    );
    // демпфирование: уменьшаем шаг, пока невязка падает
    let lam = 1;
    let xn: number[] = x;
    let rn: number[] = r;
    let nn = norm;
    for (let d = 0; d < 20; d++) {
      xn = x.map((v, i) => v + lam * dx[i]);
      rn = F(xn);
      checkVec(rn, n);
      nn = Math.sqrt(rn.reduce((s, v) => s + v * v, 0));
      if (nn < norm) break;
      lam /= 2;
    }
    if (!(nn < norm)) throw new Error('Newton stalled');
    x = xn;
    r = rn;
  }
  const norm = Math.sqrt(r.reduce((s, v) => s + v * v, 0));
  if (norm < tol) return { x, converged: true, iters: maxIter };
  throw new Error('Newton did not converge');
}

function checkVec(v: number[], n: number) {
  if (!Array.isArray(v) || v.length !== n || v.some((z) => typeof z !== 'number' || !isFinite(z))) {
    throw new Error('Function must return finite numbers');
  }
}

/** Решение J*dx = b методом Гаусса с выбором ведущего. */
export function solveLinear(J: number[][], b: number[]): number[] {
  const n = b.length;
  const M = J.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) {
      if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
    }
    if (Math.abs(M[piv][c]) < 1e-15) throw new Error('Singular Jacobian');
    [M[c], M[piv]] = [M[piv], M[c]];
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r][c] / M[c][c];
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  return M.map((row, i) => row[n] / M[i][i]);
}

/** Брент на [a,b], нужна смена знака. */
export function brent(
  f: (x: number) => number,
  a: number,
  b: number,
  tol = 1e-12,
  maxIter = 100,
  trace?: TraceFn,
): number {
  let fa = f(a);
  let fb = f(b);
  if (!isFinite(fa) || !isFinite(fb)) throw new Error('Function not finite on bracket');
  if (fa * fb > 0) throw new Error('Root not bracketed');
  if (Math.abs(fa) < Math.abs(fb)) {
    [a, b] = [b, a];
    [fa, fb] = [fb, fa];
  }
  let c = a;
  let fc = fa;
  let d = b - a;
  let e = d;
  for (let k = 0; k < maxIter; k++) {
    if (fb * fc > 0) {
      c = a;
      fc = fa;
      d = b - a;
      e = d;
    }
    if (Math.abs(fc) < Math.abs(fb)) {
      a = b;
      b = c;
      c = a;
      fa = fb;
      fb = fc;
      fc = fa;
    }
    const m = 0.5 * (c - b);
    trace?.(`k=${k} b=${fmtTrace(b)} f=${fmtTrace(fb)}`);
    if (Math.abs(m) < tol || fb === 0) return b;
    if (Math.abs(e) >= tol && Math.abs(fa) > Math.abs(fb)) {
      const s = fb / fa;
      let p: number;
      let q: number;
      if (a === c) {
        p = 2 * m * s;
        q = 1 - s;
      } else {
        const r = fb / fc;
        const t = fa / fc;
        p = s * (2 * m * t * (t - r) - (b - a) * (r - 1));
        q = (t - 1) * (r - 1) * (s - 1);
      }
      if (p > 0) q = -q;
      else p = -p;
      if (2 * p < Math.min(3 * m * q - Math.abs(tol * q), Math.abs(e * q))) {
        e = d;
        d = p / q;
      } else {
        d = m;
        e = m;
      }
    } else {
      d = m;
      e = m;
    }
    a = b;
    fa = fb;
    b += Math.abs(d) > tol ? d : m > 0 ? tol : -tol;
    fb = f(b);
    if (!isFinite(fb)) throw new Error('Function not finite on bracket');
  }
  throw new Error('Brent did not converge');
}

export interface NelderMeadResult {
  x: number[];
  fx: number;
  iters: number;
}

/** Нелдер–Мид без производных. */
export function nelderMead(
  f: (x: number[]) => number,
  x0: number[],
  maxIter = 500,
  tol = 1e-8,
  trace?: TraceFn,
): NelderMeadResult {
  const n = x0.length;
  const alpha = 1;
  const gamma = 2;
  const rho = 0.5;
  const sigma = 0.5;
  const simplex = [x0.slice()];
  for (let i = 0; i < n; i++) {
    const p = x0.slice();
    p[i] = p[i] !== 0 ? p[i] * 1.05 : 0.00025;
    simplex.push(p);
  }
  let vals = simplex.map((p) => f(p));
  vals.forEach((v) => {
    if (typeof v !== 'number' || !isFinite(v))
      throw new Error('Function must return finite numbers');
  });
  const order = () => simplex.map((_, i) => i).sort((a, b) => vals[a] - vals[b]);
  for (let k = 0; k < maxIter; k++) {
    const idx = order();
    const best = idx[0];
    const worst = idx[n];
    const second = idx[n - 1];
    // сходимость: разброс значений
    const spread = Math.max(...vals) - Math.min(...vals);
    trace?.(`k=${k} best=${fmtTrace(vals[best])} x=${vecTrace(simplex[best])}`);
    if (spread < tol) {
      return { x: simplex[best], fx: vals[best], iters: k };
    }
    const centroid = new Array<number>(n).fill(0);
    for (const i of idx.slice(0, n)) {
      for (let j = 0; j < n; j++) centroid[j] += simplex[i][j] / n;
    }
    const xr = centroid.map((c, j) => c + alpha * (c - simplex[worst][j]));
    const fr = f(xr);
    if (!isFinite(fr)) throw new Error('Function must return finite numbers');
    if (fr < vals[best]) {
      const xe = centroid.map((c, j) => c + gamma * (xr[j] - c));
      const fe = f(xe);
      if (!isFinite(fe)) throw new Error('Function must return finite numbers');
      if (fe < fr) {
        simplex[worst] = xe;
        vals[worst] = fe;
      } else {
        simplex[worst] = xr;
        vals[worst] = fr;
      }
    } else if (fr < vals[second]) {
      simplex[worst] = xr;
      vals[worst] = fr;
    } else {
      const xc =
        fr < vals[worst]
          ? centroid.map((c, j) => c + rho * (xr[j] - c))
          : centroid.map((c, j) => c + rho * (simplex[worst][j] - c));
      const fc = f(xc);
      if (!isFinite(fc)) throw new Error('Function must return finite numbers');
      if (fc < vals[worst]) {
        simplex[worst] = xc;
        vals[worst] = fc;
      } else {
        for (let i = 1; i <= n; i++) {
          const ii = idx[i];
          simplex[ii] = simplex[ii].map(
            (v, j) => simplex[best][j] + sigma * (v - simplex[best][j]),
          );
          vals[ii] = f(simplex[ii]);
          if (!isFinite(vals[ii])) throw new Error('Function must return finite numbers');
        }
      }
    }
  }
  const idx = order();
  return { x: simplex[idx[0]], fx: vals[idx[0]], iters: maxIter };
}

/** Адаптивный Симпсон (лог: дробины/счётчик f — рекурсия в одну строку итога). */
export function adaptiveSimpson(
  f: (x: number) => number,
  a: number,
  b: number,
  tol = 1e-10,
  maxDepth = 20,
  trace?: TraceFn,
): number {
  let evals = 3;
  let splits = 0;
  let maxHit = 0;
  const fa = f(a);
  const fb = f(b);
  const m = (a + b) / 2;
  const fm = f(m);
  for (const v of [fa, fb, fm]) {
    if (typeof v !== 'number' || !isFinite(v))
      throw new Error('Function must return finite numbers');
  }
  const whole = ((b - a) / 6) * (fa + 4 * fm + fb);
  trace?.(`[${fmtTrace(a)}, ${fmtTrace(b)}] S0=${fmtTrace(whole)}`);
  const rec = (
    x0: number,
    f0: number,
    xm: number,
    fm2: number,
    x1: number,
    f1: number,
    w: number,
    depth: number,
  ): number => {
    const m1 = (x0 + xm) / 2;
    const m2 = (xm + x1) / 2;
    const f1v = f(m1);
    const f2v = f(m2);
    evals += 2;
    if (!isFinite(f1v) || !isFinite(f2v)) throw new Error('Function must return finite numbers');
    const left = ((xm - x0) / 6) * (f0 + 4 * f1v + fm2);
    const right = ((x1 - xm) / 6) * (fm2 + 4 * f2v + f1);
    const delta = left + right - w;
    if (depth <= 0) {
      maxHit = Math.max(maxHit, maxDepth - depth);
      return left + right + delta / 15;
    }
    if (Math.abs(delta) < 15 * tol) return left + right + delta / 15;
    splits++;
    maxHit = Math.max(maxHit, maxDepth - depth);
    return (
      rec(x0, f0, m1, f1v, xm, fm2, left, depth - 1) +
      rec(xm, fm2, m2, f2v, x1, f1, right, depth - 1)
    );
  };
  const result = rec(a, fa, m, fm, b, fb, whole, maxDepth);
  trace?.(`splits=${splits} f-evals=${evals} I=${fmtTrace(result)}`);
  return result;
}

/** Один шаг RK4 для системы (для BVP-стрельбы и тестов). */
export function rk4Step(
  F: (t: number, y: number[]) => number[],
  t: number,
  y: number[],
  h: number,
): number[] {
  const k1 = F(t, y);
  const y2 = y.map((v, i) => v + (h / 2) * k1[i]);
  const k2 = F(t + h / 2, y2);
  const y3 = y.map((v, i) => v + (h / 2) * k2[i]);
  const k3 = F(t + h / 2, y3);
  const y4 = y.map((v, i) => v + h * k3[i]);
  const k4 = F(t + h, y4);
  return y.map((v, i) => v + (h / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]));
}
