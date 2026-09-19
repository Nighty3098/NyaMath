/**
 * Доменные паки NyaMath: статистика, физика, телекоммуникации, математика.
 * Все функции/константы — чистый клиентский JS поверх mathjs, zero-latency.
 */
import type { MathJsInstance, MathNode } from 'mathjs';
import { t, type LText, type PackId } from '../i18n';
import { SI_CONSTANTS, CODATA2022 } from './constants';
import { MATERIALS, MAT_PROP_KEYS, MAT_PROP_NAMES, findMaterial, type MatPropKey } from './materials';
import { getCompiledPre, preprocessJ, preprocessRanges } from './mathEngine';
import { adaptiveSimpson, brent, nelderMead, newtonSystem, rk4Step } from './numeric';

export type Scope = Record<string, unknown>;

/**
 * Scope mathjs (PartitionedMap) → плоский объект: spread `{...scope}`
 * записи НЕ копирует, поэтому для подстановок нужен plainScope.
 */
export function plainScope(scope: Scope): Scope {
  const o: Scope = {};
  const s = scope as unknown as { forEach?: unknown };
  if (s && typeof s.forEach === 'function') {
    (s.forEach as (cb: (v: unknown, k: string) => void) => void).call(s, (v, k) => {
      o[k] = v;
    });
  } else {
    Object.assign(o, scope);
  }
  return o;
}

/** Построить scope паков. Вызывать один раз из mathEngine (там есть инстанс math). */
export function buildPackScope(math: MathJsInstance): Scope {
  const flat = (v: unknown): number[] => {
    try {
      const m = math.matrix(v as never);
      return ((m as unknown as { toArray: () => unknown }).toArray() as unknown[]).flat(
        Infinity,
      ) as number[];
    } catch {
      return [Number(v)];
    }
  };

  const seq = (a: unknown, b: unknown, step?: unknown): unknown => {
    const A = Number(a);
    const B = Number(b);
    const S = step === undefined ? 1 : Number(step);
    if (!isFinite(A) || !isFinite(B) || !isFinite(S)) throw new Error(t('e.seqArgs'));
    if (S === 0) throw new Error(t('e.seqStep'));
    const n = Math.floor((B - A) / S + 1e-9) + 1;
    if (n < 0) return math.matrix([]);
    if (n > 100000) throw new Error(t('e.seqRange'));
    // Fast-path (#D): целочисленная монотонная последовательность — концы
    // ограничивают все значения; при |v| < 1e12 (≤12 цифр) toPrecision(12)
    // тождественен, поэтому результат бит-идентичен медленному пути.
    if (Number.isInteger(A) && Number.isInteger(B) && Number.isInteger(S)
        && Math.abs(A) < 1e12 && Math.abs(B) < 1e12) {
      const out = new Array<number>(n);
      for (let k = 0; k < n; k++) out[k] = A + k * S;
      return math.matrix(out);
    }
    const out: number[] = [];
    for (let k = 0; k < n; k++) out.push(Number((A + k * S).toPrecision(12)));
    return math.matrix(out);
  };

  const linspace = (a: unknown, b: unknown, n?: unknown): unknown => {
    const A = Number(a);
    const B = Number(b);
    const N = n === undefined ? 50 : Math.floor(Number(n));
    if (N < 2 || N > 100000) throw new Error(t('e.linspaceN'));
    const out: number[] = [];
    for (let k = 0; k < N; k++) out.push(Number((A + ((B - A) * k) / (N - 1)).toPrecision(12)));
    return math.matrix(out);
  };

  const rows = (m: unknown): number => {
    const s = math.size(m as never) as unknown as { toArray: () => number[] };
    return s.toArray()[0] ?? 0;
  };
  const cols = (m: unknown): number => {
    const s = math.size(m as never) as unknown as { toArray: () => number[] };
    const a = s.toArray();
    return a.length > 1 ? a[1] : 1;
  };

  const C = SI_CONSTANTS.c;
  // μ₀/ε₀/η₀ — измеряемые CODATA 2022 (после SI-2019 не 4π·10⁻⁷ и не 1/(μ₀c²)):
  const MU0 = CODATA2022.mu_0;
  const EPS0 = CODATA2022.eps_0;

  /* ----- помощники для rawArgs-функций (доступ к scope вызывающего) ----- */
  type RawFn = (args: MathNode[], math: MathJsInstance, scope: Scope) => unknown;
  const raw = (fn: RawFn): RawFn => {
    (fn as unknown as { rawArgs: boolean }).rawArgs = true;
    return fn;
  };
  const evNode = (node: MathNode, scope: Scope): unknown => node.compile().evaluate(scope);
  const asArr = (v: unknown): unknown[] => {
    if (Array.isArray(v)) return v;
    if (v !== null && typeof v === 'object' && 'toArray' in (v as object)) {
      return ((v as { toArray: () => unknown }).toArray() as unknown[]).flat(Infinity);
    }
    return [v];
  };
  const needStr = (v: unknown): string => {
    if (typeof v !== 'string' || !v) throw new Error(t('e.calcArgs'));
    return v;
  };
  const needNum = (v: unknown): number => {
    const n = Number(v);
    if (typeof v === 'boolean' || !isFinite(n)) throw new Error(t('e.calcArgs'));
    return n;
  };
  const needNumVec = (v: unknown): number[] => {
    const a = asArr(v).map(Number);
    if (!a.length || a.some((z) => !isFinite(z))) throw new Error(t('e.calcArgs'));
    return a;
  };
  const needStrVec = (v: unknown): string[] => {
    const a = asArr(v);
    if (!a.length || a.some((z) => typeof z !== 'string' || !z)) throw new Error(t('e.calcArgs'));
    return a as string[];
  };
  /** Вычислитель числового выражения (#A): компиляция один раз + переиспользуемый scope.
   * Заменяет parse+spread на каждый вызов в циклах (nsum/nint/Ньютон/Нелдер–Мид).
   * Экзотика (присваивания внутри) идёт медленным путём в копии scope — как раньше. */
  /** Вставленный из рендера LaTeX-мусор: \textasciicircum → ^ и т.п. */
  const unlatexExpr = (s: string): string =>
    s
      .replace(/\\textasciicircum\{\}/g, '^')
      .replace(/\\textasciicircum(?![A-Za-z])/g, '^')
      .replace(/\\\^\{\}/g, '^')
      // mathjs съедает \t из вставки: TAB + extasciicircum → ^
      .replace(/[\t ]extasciicircum(\{\})?/g, '^');

  const numEvaluator = (expr: string, scope: Scope): ((bind: Record<string, number>) => number) => {
    const pre = preprocessRanges(preprocessJ(unlatexExpr(expr), false));
    const code = getCompiledPre(pre);
    const flat: Scope = { ...plainScope(scope) };
    return (bind) => {
      for (const k of Object.keys(bind)) flat[k] = bind[k];
      let v: unknown;
      try {
        v = code ? code.evaluate(flat) : math.evaluate(pre, { ...flat });
      } catch {
        throw new Error(t('e.simEval', { expr: expr.slice(0, 60) }));
      }
      if (typeof v !== 'number' || !isFinite(v)) throw new Error(t('e.simNotNum', { expr: expr.slice(0, 60) }));
      return v;
    };
  };
  // (разовые вычисления — напрямую через numEvaluator в местах вызова)
  /** Ньютон для системы строк; strict=false → minerr (вернуть последнее). */
  const solveEqs = (eqs: string[], vars: string[], guess: number[], scope: Scope, strict: boolean): number[] => {
    if (!eqs.length || eqs.length !== vars.length || guess.length !== vars.length) throw new Error(t('e.calcArgs'));
    if (vars.some((v) => !/^[A-Za-z_]\w*$/.test(v))) throw new Error(t('e.calcArgs'));
    const evs = eqs.map((e) => numEvaluator(e, scope));
    const F = (x: number[]): number[] => {
      const bind: Record<string, number> = {};
      vars.forEach((v, i) => {
        bind[v] = x[i];
      });
      return evs.map((ev) => ev(bind));
    };
    try {
      return newtonSystem(F, guess).x;
    } catch {
      if (!strict) {
        // minerr: приближённый ответ вместо ошибки
        try {
          return newtonSystem(F, guess, 30, 1e-4).x;
        } catch {
          return guess.slice();
        }
      }
      throw new Error(t('e.calcNoConv'));
    }
  };

  /* ----- символьное разложение на множители: целочисленные корни + синтетика ----- */
  const factorPoly = (expr: string, v: string): string => {
    if (!/^[A-Za-z_]\w*$/.test(v)) throw new Error(t('e.calcArgs'));
    const node = math.parse(expr);
    // коэффициенты по возрастанию степени через значения в 0..n (n ≤ 6)
    const compiled = node.compile();
    const f = (x: number): number => {
      const r = compiled.evaluate({ [v]: x });
      if (typeof r !== 'number' || !isFinite(r)) throw new Error('no-roots');
      return r;
    };
    let deg = -1;
    let coeffs: number[] = [];
    for (let n = 1; n <= 6; n++) {
      const h = 0.5;
      // оцениваем степень по старшим конечным разностям
      const vals = Array.from({ length: n + 2 }, (_, i) => f(i * h));
      const deltas: number[][] = [vals];
      for (let d = 0; d < n + 1; d++) {
        const prev = deltas[d];
        const nx: number[] = [];
        for (let i = 0; i + 1 < prev.length; i++) nx.push(prev[i + 1] - prev[i]);
        deltas.push(nx);
      }
      const last = deltas[n + 1][0];
      if (Math.abs(last) < 1e-6 * Math.max(1, Math.abs(deltas[0][0]))) {
        deg = n;
        // восстанавливаем коэффициенты интерполяцией в целых точках 0..n:
        // прямые разности Δ^k, базис C(x,k) → P(x) = Σ Δ^k·C(x,k)
        const ys = Array.from({ length: n + 1 }, (_, i) => f(i));
        coeffs = new Array<number>(n + 1).fill(0);
        const dd: number[][] = [ys.slice()];
        for (let d = 1; d <= n; d++) {
          const prev = dd[d - 1];
          const nx: number[] = [];
          for (let i = 0; i + d <= n; i++) nx.push(prev[i + 1] - prev[i]);
          dd.push(nx);
        }
        // базисные полиномы C(x,k) → степени: разворачиваем
        const basis: number[][] = [[1]];
        for (let k = 1; k <= n; k++) {
          // C(x,k) = C(x,k-1)*(x-k+1)/k
          const prev = basis[k - 1];
          const cur = new Array<number>(k + 1).fill(0);
          for (let i = 0; i < prev.length; i++) {
            cur[i + 1] += prev[i] / k;
            cur[i] += (prev[i] * -(k - 1)) / k;
          }
          basis.push(cur);
        }
        for (let k = 0; k <= n; k++) {
          const c = dd[k][0];
          for (let i = 0; i < basis[k].length; i++) coeffs[i] += c * basis[k][i];
        }
        // проверка восстановления
        let ok = true;
        for (const x of [-2.5, -1, 0.5, 2, 3.5]) {
          const pv = coeffs.reduce((s, c, i) => s + c * x ** i, 0);
          if (Math.abs(pv - f(x)) > 1e-4 * Math.max(1, Math.abs(f(x)))) {
            ok = false;
            break;
          }
        }
        if (ok) break;
        deg = -1;
      }
    }
    if (deg < 1) throw new Error('НЕТ-КОРНЕЙ: не полином');
    // нормируем почти-целые коэффициенты
    coeffs = coeffs.map((c) => (Math.abs(c - Math.round(c)) < 1e-6 ? Math.round(c) : c));
    // целочисленные корни перебором делителей свободного члена
    const roots: number[] = [];
    let c = coeffs.slice();
    for (let guard = 0; guard < deg; guard++) {
      while (c.length > 1 && Math.abs(c[c.length - 1]) < 1e-9) {
        // множитель v
        roots.push(0);
        c = c.slice(0, -1);
      }
      if (c.length <= 1) break;
      const a0 = c[0];
      if (!Number.isInteger(a0) || !Number.isInteger(c[c.length - 1])) break;
      const cands = new Set<number>();
      const lim = Math.min(5000, Math.abs(a0));
      for (let d = 1; d <= lim; d++) {
        if (a0 % d === 0) {
          cands.add(d);
          cands.add(-d);
          if (Number.isInteger(a0 / d)) {
            cands.add(a0 / d);
            cands.add(-a0 / d);
          }
        }
      }
      let found: number | null = null;
      for (const r of cands) {
        const pv = c.reduce((s, cc, i) => s + cc * r ** i, 0);
        if (Math.abs(pv) < 1e-6) {
          found = r;
          break;
        }
      }
      if (found === null) break;
      roots.push(found);
      // синтетическое деление на (v - found)
      const nc = new Array<number>(c.length - 1).fill(0);
      nc[nc.length - 1] = c[c.length - 1];
      for (let i = nc.length - 2; i >= 0; i--) nc[i] = c[i + 1] + found * nc[i + 1];
      c = nc;
    }
    if (!roots.length) throw new Error('НЕТ-КОРНЕЙ: нет целочисленных корней');
    const parts = roots.map((r) => (r === 0 ? `${v}` : r > 0 ? `(${v} - ${r})` : `(${v} + ${-r})`));
    if (c.length > 1) {
      const rest = c
        .map((cc, i) => ({ cc, i }))
        .filter(({ cc }) => Math.abs(cc) > 1e-9)
        .map(({ cc, i }) => (i === 0 ? `${fmtC(cc)}` : i === 1 ? `${fmtC(cc)}*${v}` : `${fmtC(cc)}*${v}^${i}`))
        .join(' + ')
        .replace(/\+ -/g, '- ');
      parts.push(`(${rest || '1'})`);
    }
    const leadStr = c.length <= 1 && Math.abs(c[0] - 1) > 1e-9 ? `${fmtC(c[0])}*` : '';
    return `${leadStr}${parts.join('*')}`;
  };

  const fmtC = (c: number): string => {
    const r = Math.abs(c - Math.round(c)) < 1e-9 ? Math.round(c) : Number(c.toPrecision(6));
    return String(r);
  };

  /* ----- табличный символьный интеграл ----- */
  const symbolicIntegrate = (expr: string, v: string): string => {
    if (!/^[A-Za-z_]\w*$/.test(v)) throw new Error(t('e.calcArgs'));
    const node = math.parse(expr);
    const W = (s: string): string => (s.includes('+') || s.includes('-') || s.includes(' ') ? `(${s})` : s);
    const integ = (n: unknown): string => {
      const nn = n as {
        isOperatorNode?: boolean;
        isFunctionNode?: boolean;
        isSymbolNode?: boolean;
        isConstantNode?: boolean;
        isParenthesisNode?: boolean;
        op?: string;
        fn?: { name?: string } | string;
        args?: unknown[];
        name?: string;
        value?: unknown;
      };
      if (nn.isParenthesisNode) return integ(nn.args?.[0] ?? nn);
      if (nn.isConstantNode) return `${String(nn.value)}*${v}`;
      if (nn.isSymbolNode) {
        if (nn.name === v) return `${v}^2/2`;
        return `${nn.name}*${v}`;
      }
      if (nn.isOperatorNode && nn.op === '+' && nn.args?.length === 2) {
        return `${integ(nn.args[0])} + ${integ(nn.args[1])}`;
      }
      if (nn.isOperatorNode && nn.op === '-' && nn.args?.length === 2) {
        return `${integ(nn.args[0])} - ${integ(nn.args[1])}`;
      }
      if (nn.isOperatorNode && nn.op === '-' && nn.args?.length === 1) {
        return `-(${integ(nn.args[0])})`;
      }
      if (nn.isOperatorNode && (nn.op === '*' || nn.op === '/')) {
        const [a, b] = nn.args as unknown[];
        const aFree = !dependsOn(a, v);
        const bFree = !dependsOn(b, v);
        if (nn.op === '*') {
          if (aFree) return `${W(fmtNode(a))}*(${integ(b)})`;
          if (bFree) return `${W(fmtNode(b))}*(${integ(a)})`;
        } else {
          if (bFree) return `(${integ(a)})/${W(fmtNode(b))}`;
          // c / v → c·log(v)
          if (aFree && sameSymbol(b, v)) {
            const num = fmtNode(a);
            return num === '1' ? `log(${v})` : `${W(num)}*log(${v})`;
          }
        }
        throw new Error('no-table');
      }
      if (nn.isOperatorNode && nn.op === '^' && nn.args?.length === 2) {
        const [base, pw] = nn.args as unknown[];
        if (sameSymbol(base, v) && isNum(pw)) {
          const p = numVal(pw);
          if (Math.abs(p + 1) < 1e-12) return `log(${v})`;
          return `(${v}^${trimN(p + 1)})/${trimN(p + 1)}`;
        }
        if (isNum(base) && sameSymbol(pw, v)) {
          return `(${fmtNode(base)}^${v})/log(${fmtNode(base)})`;
        }
        throw new Error('no-table');
      }
      if (nn.isFunctionNode) {
        const fname = typeof nn.fn === 'string' ? nn.fn : nn.fn?.name;
        const arg = (nn.args as unknown[])?.[0];
        if (sameSymbol(arg, v)) {
          if (fname === 'sin') return `-cos(${v})`;
          if (fname === 'cos') return `sin(${v})`;
          if (fname === 'exp') return `exp(${v})`;
        }
        // линейный аргумент a*v (+b): подстановка
        const lin = linearArgs(arg, v);
        if (lin && arg) {
          const { a } = lin;
          const inner = fmtNode(arg);
          const pre = `1/${trimN(a)}`;
          if (fname === 'sin') return `${pre}*(-cos(${inner}))`;
          if (fname === 'cos') return `${pre}*sin(${inner})`;
          if (fname === 'exp') return `${pre}*exp(${inner})`;
        }
        if (fname === 'log' && sameSymbol(arg, v)) return `${v}*log(${v}) - ${v}`;
        if (fname === 'sqrt' && sameSymbol(arg, v)) return `(2*${v}^(3/2))/3`;
        throw new Error('no-table');
      }
      throw new Error('no-table');
    };
    try {
      return integ(node);
    } catch {
      throw new Error(t('e.calcNoConv'));
    }
  };

  const dependsOn = (n: unknown, v: string): boolean => {
    let found = false;
    try {
      (n as { traverse?: (cb: (x: unknown) => void) => void }).traverse?.((x: unknown) => {
        const s = x as { isSymbolNode?: boolean; name?: string };
        if (s.isSymbolNode && s.name === v) found = true;
      });
    } catch {
      found = true;
    }
    return found;
  };

  const sameSymbol = (n: unknown, v: string): boolean => {
    const s = n as { isSymbolNode?: boolean; isParenthesisNode?: boolean; name?: string; args?: unknown[] };
    if (s.isParenthesisNode) return sameSymbol(s.args?.[0], v);
    return !!s.isSymbolNode && s.name === v;
  };

  const isNum = (n: unknown): boolean => {
    const s = n as { isConstantNode?: boolean; isParenthesisNode?: boolean; args?: unknown[] };
    if (s.isParenthesisNode) return isNum(s.args?.[0]);
    return !!s.isConstantNode;
  };

  const numVal = (n: unknown): number => {
    const s = n as { isConstantNode?: boolean; isParenthesisNode?: boolean; value?: unknown; args?: unknown[] };
    if (s.isParenthesisNode) return numVal(s.args?.[0]);
    return Number(s.value);
  };

  const fmtNode = (n: unknown): string => {
    try {
      return String((n as { toString?: () => string }).toString?.() ?? '?');
    } catch {
      return '?';
    }
  };

  const trimN = (x: number): string => String(Number(x.toPrecision(10)));

  /** Коэффициенты a, b линейной функции a*v + b; null если не линейна. */
  const linearArgs = (n: unknown, v: string): { a: number; b: number } | null => {
    try {
      const cmp = (n as { compile?: () => { evaluate: (s: unknown) => unknown } }).compile?.();
      if (!cmp) return null;
      const f = (x: number): number => {
        const r = cmp.evaluate({ [v]: x });
        return typeof r === 'number' ? r : NaN;
      };
      const b = f(0);
      const a = f(1) - b;
      if (!isFinite(a) || !isFinite(b)) return null;
      if (Math.abs(f(2.5) - (a * 2.5 + b)) > 1e-9) return null;
      return { a, b };
    } catch {
      return null;
    }
  };

  /* ----- общие помощники новых паков (ВТ / высшая математика / физика / ЭМ) ----- */
  const ETA0 = CODATA2022.Z_0;
  const R_GAS = SI_CONSTANTS.R_gas;
  const SIGMA_SB = SI_CONSTANTS.sigma_sb;
  const G_STD = SI_CONSTANTS.g_std;

  const truncI = (v: unknown): number => {
    const n = Number(v);
    if (typeof v === 'boolean' || !isFinite(n) || Math.floor(n) !== n) throw new Error(t('e.calcArgs'));
    return n;
  };
  const optInt = (v: unknown, dflt: number): number => (v === undefined ? dflt : truncI(v));
  const optNum = (v: unknown, dflt: number): number => (v === undefined ? dflt : needNum(v));
  const maskOf = (w: number): number => (w >= 32 ? 0xffffffff : ((1 << w) - 1) >>> 0);
  const u32of = (v: unknown): number => {
    const n = Number(v);
    if (typeof v === 'boolean' || !isFinite(n)) throw new Error(t('e.calcArgs'));
    return Math.trunc(n) >>> 0;
  };
  const checkWidth = (w: number, max = 32): void => {
    if (!Number.isInteger(w) || w < 1 || w > max) throw new Error(t('e.calcArgs'));
  };

  /** dec -> строка в основании base; digits = минимум цифр (дополнить нулями). */
  const dec2base = (v: unknown, w: unknown, base: number): string => {
    let n = Number(v);
    if (typeof v === 'boolean' || !isFinite(n)) throw new Error(t('e.calcArgs'));
    n = Math.trunc(n);
    const W = w === undefined ? 0 : truncI(w);
    if (W < 0 || W > 32) throw new Error(t('e.calcArgs'));
    const digits = '0123456789ABCDEF'.slice(0, base);
    const conv = (m: number): string => {
      if (m === 0) return '0';
      let s = '';
      let q = m;
      while (q > 0) {
        s = digits[q % base] + s;
        q = Math.floor(q / base);
      }
      return s;
    };
    // двоичное с шириной: отрицательные — дополнительный код (как в МК)
    if (base === 2 && n < 0 && W > 0) {
      if (W > 32 || n < -(2 ** (W - 1)) || n >= 2 ** (W - 1)) throw new Error(t('e.calcArgs'));
      return conv(2 ** W + n).padStart(W, '0');
    }
    const body = conv(Math.abs(n)).padStart(W, '0');
    return (n < 0 ? '-' : '') + body;
  };
  const stripPrefix = (s: string, p: string): string => (s.toLowerCase().startsWith(p) ? s.slice(p.length) : s);
  const cleanIntStr = (v: unknown): string => String(v).replace(/[\s_]/g, '');

  const erfImpl = (x: number): number => {
    const s = x < 0 ? -1 : 1;
    const ax = Math.abs(x);
    const tt = 1 / (1 + 0.3275911 * ax);
    const y =
      1 -
      (((((1.061405429 * tt - 1.453152027) * tt + 1.421413741) * tt - 0.284496736) * tt + 0.254829592) * tt) *
        Math.exp(-ax * ax);
    return s * y;
  };

  interface CNum {
    re: number;
    im: number;
  }
  const toC = (v: unknown): CNum => {
    if (typeof v === 'number' && isFinite(v)) return { re: v, im: 0 };
    if (v !== null && typeof v === 'object' && 're' in v && 'im' in v) {
      const c = v as { re: unknown; im: unknown };
      const re = Number(c.re);
      const im = Number(c.im);
      if (isFinite(re) && isFinite(im)) return { re, im };
    }
    throw new Error(t('e.calcArgs'));
  };
  /** БПФ для степени двойки, иначе прямое ДПФ O(n^2). */
  const fftCore = (a: CNum[], invert: boolean): CNum[] => {
    const n = a.length;
    if (n > 1 && (n & (n - 1)) === 0) {
      // итеративное radix-2 DIT: сначала бит-реверсная перестановка
      const bits = Math.log2(n);
      const out: CNum[] = new Array(n);
      for (let i = 0; i < n; i++) {
        let r = 0;
        for (let b = 0; b < bits; b++) r |= ((i >>> b) & 1) << (bits - 1 - b);
        out[r] = { re: a[i].re, im: a[i].im };
      }
      for (let len = 2; len <= n; len <<= 1) {
        const ang = ((invert ? 2 : -2) * Math.PI) / len;
        const wlen = { re: Math.cos(ang), im: Math.sin(ang) };
        for (let i = 0; i < n; i += len) {
          let w = { re: 1, im: 0 };
          for (let j = 0; j < len / 2; j++) {
            const u = out[i + j];
            const v0 = out[i + j + len / 2];
            const v = { re: v0.re * w.re - v0.im * w.im, im: v0.re * w.im + v0.im * w.re };
            out[i + j] = { re: u.re + v.re, im: u.im + v.im };
            out[i + j + len / 2] = { re: u.re - v.re, im: u.im - v.im };
            w = { re: w.re * wlen.re - w.im * wlen.im, im: w.re * wlen.im + w.im * wlen.re };
          }
        }
      }
      if (invert) {
        for (let i = 0; i < n; i++) {
          out[i].re /= n;
          out[i].im /= n;
        }
      }
      return out;
    }
    const res: CNum[] = [];
    for (let k = 0; k < n; k++) {
      let re = 0;
      let im = 0;
      for (let m = 0; m < n; m++) {
        const ang = ((invert ? 2 : -2) * Math.PI * k * m) / n;
        re += a[m].re * Math.cos(ang) - a[m].im * Math.sin(ang);
        im += a[m].re * Math.sin(ang) + a[m].im * Math.cos(ang);
      }
      if (invert) {
        re /= n;
        im /= n;
      }
      res.push({ re, im });
    }
    return res;
  };
  const dftImpl = (v: unknown, invert: boolean): unknown => {
    const arr = asArrD(v);
    if (!arr.length || arr.length > 8192) throw new Error(t('e.calcArgs'));
    const r = fftCore(arr.map(toC), invert);
    return math.matrix(r.map((c) => math.complex(c.re, c.im)));
  };

  const to2D = (m: unknown): number[][] => {
    const mm = math.matrix(m as never);
    const arr = (mm as unknown as { toArray: () => unknown }).toArray() as unknown[];
    if (!arr.length) throw new Error(t('e.calcArgs'));
    const rows2: number[][] = Array.isArray(arr[0])
      ? (arr as unknown[][]).map((r) => r.map(Number))
      : [(arr as unknown[]).map(Number)];
    if (!rows2.length || !rows2[0].length || rows2.some((r) => r.length !== rows2[0].length || r.some((z) => !isFinite(z)))) {
      throw new Error(t('e.calcArgs'));
    }
    return rows2;
  };
  const frobNorm = (a: number[][]): number => Math.sqrt(a.reduce((s, r) => s + r.reduce((s2, z) => s2 + z * z, 0), 0));

  const rankImpl = (m: unknown, tol?: unknown): number => {
    const a = to2D(m).map((r) => r.slice());
    const R = a.length;
    const Cc = a[0].length;
    const T = tol === undefined ? 1e-10 : needNum(tol);
    if (!(T > 0)) throw new Error(t('e.calcArgs'));
    const sc = frobNorm(a) || 1;
    let rank = 0;
    let row = 0;
    for (let col = 0; col < Cc && row < R; col++) {
      let piv = row;
      for (let i = row + 1; i < R; i++) {
        if (Math.abs(a[i][col]) > Math.abs(a[piv][col])) piv = i;
      }
      if (Math.abs(a[piv][col]) <= T * sc) continue;
      [a[row], a[piv]] = [a[piv], a[row]];
      for (let i = row + 1; i < R; i++) {
        const f = a[i][col] / a[row][col];
        for (let j = col; j < Cc; j++) a[i][j] -= f * a[row][j];
      }
      row++;
      rank++;
    }
    return rank;
  };

  const cNKImpl = (n: number, k: number): number => {
    if (k < 0 || k > n) return 0;
    k = Math.min(k, n - k);
    let r = 1;
    for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
    return Math.round(r);
  };
  const pNKImpl = (n: number, k: number): number => {
    if (k < 0 || k > n) return 0;
    let r = 1;
    for (let i = 0; i < k; i++) r *= n - i;
    return r;
  };

  /** Модуль комплексного/числа через mathjs (работает и для Complex). */
  const cAbs = (v: unknown): number => {
    const a = (math as unknown as { abs: (x: unknown) => unknown }).abs(v as never);
    const n = Number(a);
    if (!isFinite(n)) throw new Error(t('e.calcArgs'));
    return n;
  };

  // ---- помощники Bode (САУ/АЧХ): полиномы от jω -------------------------
  const coefArr = (v: unknown): number[] => {
    const a = asArr(v).map(Number);
    if (!a.length || a.some((z) => !isFinite(z))) throw new Error(t('e.calcArgs'));
    return a;
  };
  /** Значение полинома (коэфф. старшая→младшая) на jω: {re, im}. */
  const polyAt = (c: number[], w: number): { re: number; im: number } => {
    let re = 0;
    let im = 0;
    for (const k of c) {
      const nre = -im * w;
      const nim = re * w;
      re = nre + k;
      im = nim;
    }
    return { re, im };
  };
  /** H(jω) = num/den, комплексные re/im (throws при полюсе на оси). */
  const pqAt = (num: number[], den: number[], w: number): { re: number; im: number } => {
    const n = polyAt(num, w);
    const d = polyAt(den, w);
    const denAbs2 = d.re * d.re + d.im * d.im;
    if (!(denAbs2 > 0)) throw new Error(t('e.calcArgs'));
    return { re: (n.re * d.re + n.im * d.im) / denAbs2, im: (n.im * d.re - n.re * d.im) / denAbs2 };
  };
  /** |H(jω)| */
  const magAt = (num: number[], den: number[], w: number): number => {
    const q = pqAt(num, den, w);
    return Math.sqrt(q.re * q.re + q.im * q.im);
  };
  /** Скаляр → скаляр; массив/матрица → поэлементно (mathjs Matrix). */
  const asArrAny = <T>(w: unknown, f: (x: number) => T): T | T[] => {
    if (Array.isArray(w)) return math.matrix((w as unknown[]).map((z) => f(Number(z))) as never) as unknown as T[];
    if (w !== null && typeof w === 'object' && 'toArray' in (w as object)) {
      const flat = ((w as { toArray: () => unknown }).toArray() as unknown[]).flat(Infinity);
      return math.matrix(flat.map((z) => f(Number(z))) as never) as unknown as T[];
    }
    return f(needNum(w));
  };

  const PROP_ALIASES: Array<[string, MatPropKey]> = [
    ['sigma', 'sigma'], ['conductivity', 'sigma'], ['cond', 'sigma'],
    ['rho', 'rho'], ['density', 'rho'],
    ['epsr', 'eps_r'], ['epsilonr', 'eps_r'], ['permittivity', 'eps_r'], ['dielectricconstant', 'eps_r'], ['dk', 'eps_r'],
    ['mur', 'mu_r'], ['permeability', 'mu_r'],
    ['alphares', 'alpha_res'], ['alphatemp', 'alpha_res'], ['tcr', 'alpha_res'], ['alpha', 'alpha_res'],
    ['melting', 'melting'], ['meltingpoint', 'melting'], ['melt', 'melting'],
    ['ct', 'ct'], ['thermalconductivity', 'ct'], ['lambda', 'ct'], ['ktherm', 'ct'],
    ['cp', 'cp'], ['specificheat', 'cp'], ['heatcapacity', 'cp'],
    ['bandgap', 'bandgap'], ['eg', 'bandgap'], ['gap', 'bandgap'],
  ];
  const matPropKeyOf = (s: string): MatPropKey | undefined => {
    const n = s.toLowerCase().replace(/[^a-z0-9]/gi, '');
    return PROP_ALIASES.find(([a]) => a === n)?.[1];
  };

  const zinLineImpl = (ZL: unknown, Z0: unknown, betaL: unknown): unknown => {
    const bl = needNum(betaL);
    if (cAbs(Z0) === 0) throw new Error(t('e.calcArgs'));
    const tt = Math.tan(bl);
    const m = math as unknown as {
      multiply: (a: unknown, b: unknown) => unknown;
      add: (a: unknown, b: unknown) => unknown;
      divide: (a: unknown, b: unknown) => unknown;
    };
    const j = math.complex(0, 1);
    const num = m.add(ZL as never, m.multiply(m.multiply(j, Z0 as never), tt));
    const den = m.add(Z0 as never, m.multiply(m.multiply(j, ZL as never), tt));
    return m.multiply(Z0 as never, m.divide(num, den));
  };

  const propConstImpl = (epsR: unknown, tanD: unknown, f: unknown, muR?: unknown): unknown => {
    const er = needNum(epsR);
    const td = needNum(tanD);
    const ff = needNum(f);
    const mr = muR === undefined ? 1 : needNum(muR);
    if (!(er > 0 && td >= 0 && ff > 0 && mr > 0)) throw new Error(t('e.calcArgs'));
    const om = 2 * Math.PI * ff;
    const k = om * Math.sqrt(EPS0 * er * MU0 * mr);
    const s = Math.sqrt(1 + td * td);
    return math.matrix([k * Math.sqrt((s - 1) / 2), k * Math.sqrt((s + 1) / 2)]);
  };

  const microstripImpl = (W: unknown, H: unknown, epsR: unknown): number => {
    const w = needNum(W);
    const h = needNum(H);
    const er = needNum(epsR);
    if (!(w > 0 && h > 0 && er > 1)) throw new Error(t('e.calcArgs'));
    const wh = w / h;
    if (wh <= 1) {
      const ee = (er + 1) / 2 + ((er - 1) / 2) * (1 / Math.sqrt(1 + 12 / wh) + 0.04 * (1 - wh) ** 2);
      return (60 / Math.sqrt(ee)) * Math.log(8 / wh + 0.25 * wh);
    }
    const ee = (er + 1) / 2 + ((er - 1) / 2) / Math.sqrt(1 + 12 / wh);
    return 120 * Math.PI / (Math.sqrt(ee) * (wh + 1.393 + 0.667 * Math.log(wh + 1.444)));
  };

  const crc16Impl = (s: string): number => {
    let crc = 0xffff;
    for (let i = 0; i < s.length; i++) {
      crc ^= s.charCodeAt(i);
      for (let b = 0; b < 8; b++) crc = crc & 1 ? (crc >>> 1) ^ 0xa001 : crc >>> 1;
    }
    return crc >>> 0;
  };
  const CRC32_TAB = (() => {
    const tab = new Array<number>(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      tab[i] = c >>> 0;
    }
    return tab;
  })();
  const crc32Impl = (s: string): number => {
    let crc = 0xffffffff;
    for (let i = 0; i < s.length; i++) crc = CRC32_TAB[(crc ^ s.charCodeAt(i)) & 0xff] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
  };
  const fnv1aImpl = (s: string): number => {
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
  };

  /* ----- неопределённость измерений: квантили (Acklam + A&S 26.7.5) ----- */
  /** Обратная стандартная нормальная CDF, q∈(0,1). Алгоритм Acklam. */
  const normInvCdf = (q: number): number => {
    if (!(q > 0 && q < 1)) throw new Error(t('e.calcArgs'));
    const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239];
    const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
    const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
    const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
    const plow = 0.02425;
    const phigh = 1 - plow;
    let x: number;
    if (q < plow) {
      x = Math.sqrt(-2 * Math.log(q));
      return (((((c[0] * x + c[1]) * x + c[2]) * x + c[3]) * x + c[4]) * x + c[5]) / ((((d[0] * x + d[1]) * x + d[2]) * x + d[3]) * x + 1);
    }
    if (q <= phigh) {
      x = q - 0.5;
      const r = x * x;
      return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * x / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
    }
    x = Math.sqrt(-2 * Math.log(1 - q));
    return -(((((c[0] * x + c[1]) * x + c[2]) * x + c[3]) * x + c[4]) * x + c[5]) / ((((d[0] * x + d[1]) * x + d[2]) * x + d[3]) * x + 1);
  };
  /**
   * Односторонняя обратная CDF Стьюдента F⁻¹(q; ν).
   * ν=1 — точное Коши tan(π(q−½)); ν=∞ — нормальная; иначе Корниш–Фишер
   * (Abramowitz & Stegun 26.7.5, 4 члена; погрешность <1% при ν≥2).
   * GUM-нотация t_p(ν) двусторонняя: t_p = tStud((1+p)/2, ν).
   */
  const tStudCdf = (q: number, nu: number): number => {
    if (!(q > 0 && q < 1)) throw new Error(t('e.calcArgs'));
    if (!isFinite(nu)) {
      if (!(nu > 0)) throw new Error(t('e.calcArgs'));
      return normInvCdf(q);
    }
    const N = Number(nu);
    if (!(N > 0)) throw new Error(t('e.calcArgs'));
    if (N === 1) return Math.tan(Math.PI * (q - 0.5));
    const z = normInvCdf(q);
    const z2 = z * z;
    const z3 = z2 * z;
    const z5 = z3 * z2;
    const z7 = z5 * z2;
    const z9 = z7 * z2;
    const n2 = N * N;
    const n3 = n2 * N;
    const n4 = n3 * N;
    return z + (z3 + z) / (4 * N)
      + (5 * z5 + 16 * z3 + 3 * z) / (96 * n2)
      + (3 * z7 + 19 * z5 + 17 * z3 - 15 * z) / (384 * n3)
      + (79 * z9 + 779 * z7 + 1482 * z5 - 1920 * z3 - 945 * z) / (92160 * n4);
  };
  /** Округление неопределённости ВВЕРХ до 2 значащих цифр (консервативно, GUM 7.2.6). */
  const uncUp2 = (U: number): number => {
    if (!(U > 0)) throw new Error(t('e.calcArgs'));
    const e = Math.floor(Math.log10(U));
    const f = U / 10 ** e;
    let r = Math.ceil(f * 10 - 1e-9) / 10;
    let ee = e;
    if (r >= 10) {
      r = 1;
      ee += 1;
    }
    return Number((r * 10 ** ee).toPrecision(12));
  };

  const S: Scope = {
    // ---------- математика ----------
    seq,
    linspace,
    rows,
    cols,
    rms: (v: unknown) => {
      const f = flat(v).map(Number);
      if (!f.length) throw new Error(t('e.rmsEmpty'));
      return Math.sqrt(f.reduce((s, x) => s + x * x, 0) / f.length);
    },
    sinc: (x: unknown) => {
      const v = Number(x);
      if (v === 0) return 1;
      const t = Math.PI * v;
      return Math.sin(t) / t;
    },
    augment: (a: unknown, b: unknown) => math.concat(a as never, b as never),
    // ---------- единицы измерения (SI / USCS / CGS — ядро mathjs) ----------
    // Напрямую: L := 5 m, F := 10 lbf, E := 3 eV, T := 25 degC.
    // Несовместимые размерности (5 m + 3 s) дают ошибку e.unitsMismatch.
    // Своя единица: defunit("smoot", "1.7*m") — дальше smoot как обычная единица
    defunit: (name: unknown, def: unknown) => {
      const nm = String(name);
      if (!/^[A-Za-z_µΩ][A-Za-z_0-9µΩ]*$/.test(nm)) throw new Error(t('e.badUnitName', { name: nm }));
      math.createUnit(nm, String(def));
      return math.unit(String(def));
    },
    // convertTo(5 m, "cm") → 500 cm; convertTo("10 lbf", "N") → 44.48 N
    convertTo: (q: unknown, u: unknown) => {
      const target = String(u);
      try {
        const v = typeof q === 'string' ? math.evaluate(q as string) : q;
        if (v !== null && typeof v === 'object' && math.isUnit(v)) {
          return (v as { to: (s: string) => unknown }).to(target);
        }
        if (typeof q === 'number' && isFinite(q)) return math.unit(Number(q), target);
        throw new Error('no-unit');
      } catch (e) {
        if (e instanceof Error && /e\.unit|unitConvert/.test(e.message)) throw e;
        throw new Error(t('e.unitConvert', { q: String(q).slice(0, 40), u: target }));
      }
    },
    // inUnits(5 m, "cm") → 500 (число); удобно для графиков и программ
    inUnits: (q: unknown, u: unknown) => {
      const target = String(u);
      try {
        const v = typeof q === 'string' ? math.evaluate(q as string) : q;
        if (v !== null && typeof v === 'object' && math.isUnit(v)) {
          return (v as { toNumber: (s: string) => number }).toNumber(target);
        }
        if (typeof q === 'number' && isFinite(q)) return Number(q);
        throw new Error('no-unit');
      } catch (e) {
        if (e instanceof Error && /e\.unit|unitConvert/.test(e.message)) throw e;
        throw new Error(t('e.unitConvert', { q: String(q).slice(0, 40), u: target }));
      }
    },
    // hasUnit(5 m) → true; проверка, что значение — величина с размерностью
    hasUnit: (q: unknown) => math.isUnit(typeof q === 'string' ? math.evaluate(q as string) : q),

    // ---------- статистика ----------
    // mean/median/mode/std/var/min/max/sum/prod/quantileSeq уже есть в mathjs.
    zscore: (v: unknown) => {
      const f = flat(v).map(Number);
      const m = f.reduce((s, x) => s + x, 0) / f.length;
      const sd = Math.sqrt(f.reduce((s, x) => s + (x - m) * (x - m), 0) / (f.length - 1 || 1));
      return math.matrix(f.map((x) => (x - m) / (sd || 1)));
    },

    // ---------- физика: константы SI (CODATA-2022, см. constants.ts) ----------
    c_light: C,
    mu_0: MU0,
    eps_0: EPS0,
    h_planck: SI_CONSTANTS.h,
    hbar: SI_CONSTANTS.hbar,
    k_B: SI_CONSTANTS.k_B,
    q_e: SI_CONSTANTS.q_e,
    N_A: SI_CONSTANTS.N_A,
    G_const: CODATA2022.G_const,
    m_e: CODATA2022.m_e,
    m_p: CODATA2022.m_p,
    m_n: CODATA2022.m_n,
    u_mass: CODATA2022.u_mass,
    alpha: CODATA2022.alpha,
    alpha_inv: CODATA2022.alpha_inv,
    mu_B: CODATA2022.mu_B,
    mu_N: CODATA2022.mu_N,
    R_inf: CODATA2022.R_inf,
    a0: CODATA2022.a0,
    r_e: CODATA2022.r_e,
    lam_compton: CODATA2022.lam_compton,
    Z_0: CODATA2022.Z_0,
    F_const: SI_CONSTANTS.F_const,

    // ---------- телекоммуникации ----------
    // dB — отношение мощностей; dBV — отношение напряжений
    dB: (r: unknown) => 10 * Math.log10(Number(r)),
    dBV: (r: unknown) => 20 * Math.log10(Number(r)),
    idB: (db: unknown) => Math.pow(10, Number(db) / 10),
    // dBm: мощность в Вт -> дБм; WdBm: обратно
    dBm: (w: unknown) => 10 * Math.log10(Number(w) / 1e-3),
    WdBm: (dbm: unknown) => 1e-3 * Math.pow(10, Number(dbm) / 10),
    // длина волны по частоте, м
    lambda_f: (f: unknown) => C / Number(f),
    // потери в свободном пространстве: линейные и в дБ (d — м, f — Гц)
    fspl: (d: unknown, f: unknown) => {
      const t = ((4 * Math.PI * Number(d) * Number(f)) / C) ** 2;
      return t;
    },
    fspl_dB: (d: unknown, f: unknown) => 20 * Math.log10((4 * Math.PI * Number(d) * Number(f)) / C),

    // ---------- символьные ----------
    // simplify("x^2+2*x+1") → строка; sderiv("sin(x^2)", "x") → строка
    simplify: (s: unknown) => {
      try {
        return String(math.simplify(needStr(s)));
      } catch {
        throw new Error(t('e.calcArgs'));
      }
    },
    sderiv: (s: unknown, v: unknown) => {
      try {
        return String(math.derivative(needStr(s), needStr(v)));
      } catch {
        throw new Error(t('e.calcArgs'));
      }
    },
    // expand("(x+1)^2") → "x^2 + 2*x + 1" (раскрытие скобок)
    expand: (s: unknown) => {
      try {
        return String(math.rationalize(needStr(s)));
      } catch {
        throw new Error(t('e.calcArgs'));
      }
    },
    // sfactor("x^2+3*x+2", "x") → "(x + 1)*(x + 2)": целочисленные корни + деление
    sfactor: (s: unknown, v: unknown) => {
      try {
        return factorPoly(needStr(s), needStr(v));
      } catch (e) {
        if (e instanceof Error && e.message.startsWith('Симуляция:')) throw e;
        if (e instanceof Error && e.message.startsWith('НЕТ-КОРНЕЙ:')) {
          return String(math.rationalize(needStr(s)));
        }
        throw new Error(t('e.calcArgs'));
      }
    },
    // sint("x^2", "x") → "x^3/3": табличный интеграл (степени, exp, sin/cos, 1/x)
    sint: (s: unknown, v: unknown) => {
      try {
        return symbolicIntegrate(needStr(s), needStr(v));
      } catch (e) {
        if (e instanceof Error && e.message.startsWith('Симуляция:')) throw e;
        throw new Error(t('e.calcNoConv'));
      }
    },

    // ---------- алгебраические решатели (rawArgs: видят scope) ----------
    // nlsolve(["x^2+y^2-4", "x-y-1"], ["x","y"], [1, 0])
    nlsolve: raw((args, _m, scope) => {
      const eqs = needStrVec(evNode(args[0], scope));
      const vars = needStrVec(evNode(args[1], scope));
      const guess = needNumVec(evNode(args[2], scope));
      return math.matrix(solveEqs(eqs, vars, guess, scope, true));
    }),
    // minerr — то же, но приближённый ответ вместо ошибки
    minerr: raw((args, _m, scope) => {
      const eqs = needStrVec(evNode(args[0], scope));
      const vars = needStrVec(evNode(args[1], scope));
      const guess = needNumVec(evNode(args[2], scope));
      return math.matrix(solveEqs(eqs, vars, guess, scope, false));
    }),
    // minimize("(x-2)^2+(y+1)^2", ["x","y"], [0, 0]) — Нелдер–Мид
    minimize: raw((args, _m, scope) => {
      const expr = needStr(evNode(args[0], scope));
      const vars = needStrVec(evNode(args[1], scope));
      const guess = needNumVec(evNode(args[2], scope));
      if (guess.length !== vars.length) throw new Error(t('e.calcArgs'));
      const ev = numEvaluator(expr, scope);
      const f = (x: number[]): number => {
        const bind: Record<string, number> = {};
        vars.forEach((v, i) => {
          bind[v] = x[i];
        });
        return ev(bind);
      };
      try {
        return math.matrix(nelderMead(f, guess).x);
      } catch {
        throw new Error(t('e.calcNoConv'));
      }
    }),
    maximize: raw((args, _m, scope) => {
      const expr = needStr(evNode(args[0], scope));
      const vars = needStrVec(evNode(args[1], scope));
      const guess = needNumVec(evNode(args[2], scope));
      if (guess.length !== vars.length) throw new Error(t('e.calcArgs'));
      const ev = numEvaluator(expr, scope);
      const f = (x: number[]): number => {
        const bind: Record<string, number> = {};
        vars.forEach((v, i) => {
          bind[v] = x[i];
        });
        return -ev(bind);
      };
      try {
        return math.matrix(nelderMead(f, guess).x);
      } catch {
        throw new Error(t('e.calcNoConv'));
      }
    }),
    // root("x^3-2", "x", 0, 2) — Брент; root("cos(x)-x", "x", 0.5) — Ньютон от старта
    root: raw((args, _m, scope) => {
      const expr = needStr(evNode(args[0], scope));
      const v = needStr(evNode(args[1], scope));
      if (!/^[A-Za-z_]\w*$/.test(v)) throw new Error(t('e.calcArgs'));
      const ev = numEvaluator(expr, scope);
      const f = (x: number): number => ev({ [v]: x });
      try {
        if (args.length >= 4) {
          const a = needNum(evNode(args[2], scope));
          const b = needNum(evNode(args[3], scope));
          if (!(a < b)) throw new Error(t('e.calcArgs'));
          return brent(f, a, b);
        }
        const g0 = needNum(evNode(args[2], scope));
        // скалярный Ньютон с численной производной
        let x = g0;
        for (let k = 0; k < 100; k++) {
          const fx = f(x);
          const h = 1e-8 * Math.max(1, Math.abs(x));
          const d = (f(x + h) - f(x - h)) / (2 * h);
          if (!isFinite(d) || d === 0) throw new Error(t('e.calcNoConv'));
          const nx = x - fx / d;
          if (Math.abs(nx - x) < 1e-12) return nx;
          x = nx;
        }
        throw new Error(t('e.calcNoConv'));
      } catch (e) {
        if (e instanceof Error && /bracket/i.test(e.message)) throw new Error(t('e.calcBracket'));
        if (e instanceof Error && e.message.startsWith('Симуляция:')) throw e;
        throw new Error(t('e.calcNoConv'));
      }
    }),
    // bvp("f(x,y,yp)", "x", a, b, ya, yb, s0) — стрельба для y''=f; возвращает матрицу N×2 [x, y]
    bvp: raw((args, _m, scope) => {
      const expr = needStr(evNode(args[0], scope));
      const vx = needStr(evNode(args[1], scope));
      const a = needNum(evNode(args[2], scope));
      const b = needNum(evNode(args[3], scope));
      const ya = needNum(evNode(args[4], scope));
      const yb = needNum(evNode(args[5], scope));
      const s0 = args.length > 6 ? needNum(evNode(args[6], scope)) : (yb - ya) / (b - a);
      if (!/^[A-Za-z_]\w*$/.test(vx) || !(b > a)) throw new Error(t('e.calcArgs'));
      const NPTS = 101;
      const ev = numEvaluator(expr, scope);
      const rhs = (tt: number, y: number[]): number[] => {
        const yp = ev({ [vx]: tt, y: y[0], yp: y[1] });
        return [y[1], yp];
      };
      const shoot = (s: number): number => {
        const h = (b - a) / 400;
        let y = [ya, s];
        let tt = a;
        for (let k = 0; k < 400; k++) {
          y = rk4Step(rhs, tt, y, h);
          tt += h;
          if (!isFinite(y[0]) || !isFinite(y[1])) return NaN;
        }
        return y[0] - yb;
      };
      try {
        let x0 = s0;
        let x1 = s0 * 1.001 + 1e-6;
        let f0 = shoot(x0);
        if (!isFinite(f0)) throw new Error(t('e.calcNoConv'));
        for (let k = 0; k < 60; k++) {
          const f1 = shoot(x1);
          if (!isFinite(f1)) throw new Error(t('e.calcNoConv'));
          if (Math.abs(f1) < 1e-9) {
            x0 = x1;
            break;
          }
          const denom = f1 - f0;
          if (denom === 0) throw new Error(t('e.calcNoConv'));
          const x2 = x1 - (f1 * (x1 - x0)) / denom;
          x0 = x1;
          f0 = f1;
          x1 = x2;
        }
        // финальный прогон с сеткой для графика
        const h = (b - a) / (NPTS - 1);
        let y = [ya, x0];
        let tt = a;
        const rows: number[][] = [[a, ya]];
        for (let k = 1; k < NPTS; k++) {
          y = rk4Step(rhs, tt, y, h);
          tt = a + k * h;
          rows.push([tt, y[0]]);
        }
        return math.matrix(rows);
      } catch (e) {
        if (e instanceof Error && e.message.startsWith('Симуляция:')) throw e;
        throw new Error(t('e.calcNoConv'));
      }
    }),

    // ---------- исчисление ----------
    // ndiff("sin(x)", "x", 1) — центральная разность 4-го порядка
    ndiff: raw((args, _m, scope) => {
      const expr = needStr(evNode(args[0], scope));
      const v = needStr(evNode(args[1], scope));
      const at = needNum(evNode(args[2], scope));
      const hArg = args.length > 3 ? evNode(args[3], scope) : null;
      const h = hArg === null ? Math.cbrt(Number.EPSILON) * Math.max(1, Math.abs(at)) : needNum(hArg);
      if (!/^[A-Za-z_]\w*$/.test(v) || !(h > 0)) throw new Error(t('e.calcArgs'));
      const ev = numEvaluator(expr, scope);
      const f = (x: number): number => ev({ [v]: x });
      try {
        return (-f(at + 2 * h) + 8 * f(at + h) - 8 * f(at - h) + f(at - 2 * h)) / (12 * h);
      } catch (e) {
        if (e instanceof Error && e.message.startsWith('Симуляция:')) throw e;
        throw new Error(t('e.calcArgs'));
      }
    }),
    // nint("sin(x)", "x", 0, pi) — адаптивный Симпсон;
    // пределы можно менять местами: ∫ₐᵇ = −∫ᵦₐ, при a == b ответ 0
    nint: raw((args, _m, scope) => {
      const expr = needStr(evNode(args[0], scope));
      const v = needStr(evNode(args[1], scope));
      const a = needNum(evNode(args[2], scope));
      const b = needNum(evNode(args[3], scope));
      if (!/^[A-Za-z_]\w*$/.test(v)) throw new Error(t('e.calcArgs'));
      if (a === b) return 0;
      const lo = Math.min(a, b);
      const hi = Math.max(a, b);
      const sign = a < b ? 1 : -1;
      const ev = numEvaluator(expr, scope);
      const f = (x: number): number => ev({ [v]: x });
      try {
        return sign * adaptiveSimpson(f, lo, hi);
      } catch {
        throw new Error(t('e.calcNoConv'));
      }
    }),
    // nsum("k^2", "k", 1, 100), nprod — целочисленные суммы/произведения;
    // nsum держит и бесконечный предел: суммирует до малости члена
    nsum: raw((args, _m, scope) => {
      const [expr, v, a, b] = sumProdArgs(args, scope, true);
      const ev = numEvaluator(expr, scope);
      if (Number.isFinite(a) && Number.isFinite(b)) {
        let s = 0;
        for (let k = a; k <= b; k++) s += ev({ [v]: k });
        return s;
      }
      // Σ до ±∞: стоп по малости члена, иначе — честная несходимость
      const MAX = 1000000;
      const TOL = 1e-9;
      let s = 0;
      if (!Number.isFinite(b)) {
        for (let k = a, n = 0; n < MAX; k++, n++) {
          const term = ev({ [v]: k });
          if (typeof term !== 'number' || !isFinite(term)) throw new Error(t('e.sumNoConv'));
          s += term;
          if (n > 10 && Math.abs(term) <= TOL * (1 + Math.abs(s))) return s;
        }
      } else {
        for (let k = b, n = 0; n < MAX; k--, n++) {
          const term = ev({ [v]: k });
          if (typeof term !== 'number' || !isFinite(term)) throw new Error(t('e.sumNoConv'));
          s += term;
          if (n > 10 && Math.abs(term) <= TOL * (1 + Math.abs(s))) return s;
        }
      }
      throw new Error(t('e.sumNoConv'));
    }),
    nprod: raw((args, _m, scope) => {
      const [expr, v, a, b] = sumProdArgs(args, scope);
      const ev = numEvaluator(expr, scope);
      let p = 1;
      for (let k = a; k <= b; k++) p *= ev({ [v]: k });
      return p;
    }),

    // ---------- линейная алгебра и регрессия ----------
    // lsolve([[3,-1],[1,2]], [5,5]) — точное решение СЛАУ
    lsolve: (A: unknown, b: unknown) => {
      try {
        const r = math.lusolve(A as never, (b as never[]).length !== undefined ? (b as never) : b as never) as unknown as { toArray: () => unknown };
        const arr = (r.toArray() as unknown[]).flat(Infinity).map(Number);
        return math.matrix(arr);
      } catch {
        throw new Error(t('e.calcNoConv'));
      }
    },
    // polyroots([2,-3,1]) — корни (коэффициенты по возрастанию степени)
    polyroots: (c: unknown) => {
      const cf = (Array.isArray(c) ? c : asArrD(c)).map(Number);
      const lead = cf[cf.length - 1];
      if (cf.length < 2 || !cf.every(isFinite) || lead === 0) throw new Error(t('e.calcArgs'));
      const n = cf.length - 1;
      const M: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(0));
      for (let i = 0; i < n - 1; i++) M[i + 1][i] = 1;
      for (let i = 0; i < n; i++) M[i][n - 1] = -cf[i] / lead;
      try {
        const ev = math.eigs(M) as unknown as { values: unknown[] };
        return math.matrix(ev.values as never);
      } catch {
        throw new Error(t('e.calcNoConv'));
      }
    },
    // linfit(X, y) — МНК: строки X — наблюдения; polyfit(x, y, n)
    linfit: (X: unknown, y: unknown) => {
      try {
        const Xm = math.matrix(X as never);
        const yv = math.matrix(y as never);
        const Xt = math.transpose(Xm);
        const beta = math.lusolve(math.multiply(Xt, Xm) as never, math.multiply(Xt, yv) as never) as unknown as { toArray: () => unknown };
        return math.matrix((beta.toArray() as unknown[]).flat(Infinity).map(Number));
      } catch {
        throw new Error(t('e.calcNoConv'));
      }
    },
    polyfit: (x: unknown, y: unknown, n: unknown) => {
      const xs = asArrD(x).map(Number);
      const ys = asArrD(y).map(Number);
      const deg = Math.floor(Number(n));
      if (xs.length !== ys.length || xs.length < 2 || !xs.every(isFinite) || !ys.every(isFinite) || !(deg >= 1) || deg >= xs.length) {
        throw new Error(t('e.calcArgs'));
      }
      const V = xs.map((xi) => Array.from({ length: deg + 1 }, (_, p) => xi ** p));
      try {
        const Vt = math.transpose(math.matrix(V));
        const beta = math.lusolve(math.multiply(Vt, math.matrix(V)) as never, math.multiply(Vt, math.matrix(ys)) as never) as unknown as { toArray: () => unknown };
        return math.matrix((beta.toArray() as unknown[]).flat(Infinity).map(Number));
      } catch {
        throw new Error(t('e.calcNoConv'));
      }
    },

    // ---------- вычислительная техника: системы счисления и биты ----------
    // dec2bin(13) → "1101"; dec2bin(-3, 8) → дополнительный код "11111101"
    dec2bin: (n: unknown, w?: unknown) => dec2base(n, w, 2),
    dec2hex: (n: unknown, w?: unknown) => dec2base(n, w, 16),
    dec2oct: (n: unknown, w?: unknown) => dec2base(n, w, 8),
    bin2dec: (s: unknown) => {
      const c = stripPrefix(cleanIntStr(needStr(s)), '0b');
      if (!/^[01]+$/.test(c) || c.length > 53) throw new Error(t('e.calcArgs'));
      return parseInt(c, 2);
    },
    hex2dec: (s: unknown) => {
      const c = stripPrefix(cleanIntStr(needStr(s)), '0x');
      if (!/^[0-9a-fA-F]+$/.test(c) || c.length > 13) throw new Error(t('e.calcArgs'));
      return parseInt(c, 16);
    },
    oct2dec: (s: unknown) => {
      const c = stripPrefix(cleanIntStr(needStr(s)), '0o');
      if (!/^[0-7]+$/.test(c) || c.length > 17) throw new Error(t('e.calcArgs'));
      return parseInt(c, 8);
    },
    bitand: (a: unknown, b: unknown) => (u32of(a) & u32of(b)) >>> 0,
    bitor: (a: unknown, b: unknown) => (u32of(a) | u32of(b)) >>> 0,
    bitxor: (a: unknown, b: unknown) => (u32of(a) ^ u32of(b)) >>> 0,
    bitnot: (a: unknown, w?: unknown) => {
      const W = optInt(w, 8);
      checkWidth(W);
      return (~u32of(a)) & maskOf(W);
    },
    shl: (a: unknown, n: unknown) => (u32of(a) << (truncI(n) & 31)) >>> 0,
    shr: (a: unknown, n: unknown) => u32of(a) >>> (truncI(n) & 31),
    rol: (a: unknown, n: unknown, w?: unknown) => {
      const W = optInt(w, 8);
      checkWidth(W);
      const m = maskOf(W);
      const v = u32of(a) & m;
      const k = ((truncI(n) % W) + W) % W;
      return (((v << k) | (v >>> (W - k))) & m) >>> 0;
    },
    ror: (a: unknown, n: unknown, w?: unknown) => {
      const W = optInt(w, 8);
      checkWidth(W);
      const m = maskOf(W);
      const v = u32of(a) & m;
      const k = ((truncI(n) % W) + W) % W;
      return (((v >>> k) | (v << (W - k))) & m) >>> 0;
    },
    popcount: (a: unknown) => {
      let x = u32of(a);
      let c = 0;
      while (x) {
        c += x & 1;
        x >>>= 1;
      }
      return c;
    },
    parity: (a: unknown) => {
      let x = u32of(a);
      let p = 0;
      while (x) {
        p ^= x & 1;
        x >>>= 1;
      }
      return p;
    },
    hammdist: (a: unknown, b: unknown) => {
      let x = (u32of(a) ^ u32of(b)) >>> 0;
      let c = 0;
      while (x) {
        c += x & 1;
        x >>>= 1;
      }
      return c;
    },
    isPow2: (n: unknown) => {
      const v = truncI(n);
      return v > 0 && (v & (v - 1)) === 0;
    },
    nextPow2: (n: unknown) => {
      const v = truncI(n);
      if (v <= 1) return 1;
      if (v > 2 ** 31) throw new Error(t('e.calcArgs'));
      return 2 ** Math.ceil(Math.log2(v));
    },
    // bytesFmt(1536) → "1.5 KiB"
    bytesFmt: (n: unknown) => {
      const v = Number(n);
      if (typeof n === 'boolean' || !isFinite(v) || v < 0) throw new Error(t('e.calcArgs'));
      const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB'];
      let q = v;
      let u = 0;
      while (q >= 1024 && u < units.length - 1) {
        q /= 1024;
        u++;
      }
      const s = u === 0 ? String(Math.round(q)) : String(Number(q.toPrecision(4)));
      return `${s} ${units[u]}`;
    },
    // АЦП/тракт: adcSNR(12) → дБ, shannonCap(20e6, 30) → бит/с
    adcSNR: (b: unknown) => {
      const v = needNum(b);
      if (!(v >= 1 && v <= 32)) throw new Error(t('e.calcArgs'));
      return 6.02 * v + 1.76;
    },
    adcLevels: (b: unknown) => {
      const v = truncI(b);
      if (v < 1 || v > 32) throw new Error(t('e.calcArgs'));
      return 2 ** v;
    },
    quantStep: (vref: unknown, b: unknown) => {
      const v = needNum(vref);
      const bb = truncI(b);
      if (!(v > 0) || bb < 1 || bb > 32) throw new Error(t('e.calcArgs'));
      return v / 2 ** bb;
    },
    shannonCap: (B: unknown, snrDb: unknown) => {
      const b = needNum(B);
      const s = needNum(snrDb);
      if (!(b > 0)) throw new Error(t('e.calcArgs'));
      return b * Math.log2(1 + 10 ** (s / 10));
    },
    thermalNoiseV: (T: unknown, R: unknown, B: unknown) => {
      const tt = needNum(T);
      const r = needNum(R);
      const b = needNum(B);
      if (!(tt > 0 && r > 0 && b > 0)) throw new Error(t('e.calcArgs'));
      return Math.sqrt(4 * 1.380649e-23 * tt * r * b);
    },
    // хеш/CRC строки (для протоколов и учебных задач)
    fnv1a: (s: unknown) => fnv1aImpl(needStr(s)),
    crc16: (s: unknown) => crc16Impl(needStr(s)),
    crc32: (s: unknown) => crc32Impl(needStr(s)),
    // lfsrSeq(0x1F, 0x1B, 16, 5): 16 бит ПСП с 5-битным регистром
    lfsrSeq: (seed: unknown, mask: unknown, n: unknown, w?: unknown) => {
      const W = optInt(w, 8);
      checkWidth(W, 31);
      const N = truncI(n);
      if (N < 1 || N > 100000) throw new Error(t('e.calcArgs'));
      let st = u32of(seed) & maskOf(W);
      const taps = u32of(mask) & maskOf(W);
      if (st === 0) throw new Error(t('e.calcArgs'));
      const out: number[] = [];
      for (let k = 0; k < N; k++) {
        out.push(st & 1);
        let fb = 0;
        let x = st & taps;
        while (x) {
          fb ^= x & 1;
          x >>>= 1;
        }
        st = ((st >>> 1) | (fb << (W - 1))) & maskOf(W);
      }
      return math.matrix(out);
    },

    // ---------- высшая математика ----------
    // taylor("sin(x)", "x", 0, 5) → строка-полином; видит переменные документа
    taylor: raw((args, _m, scope) => {
      if (args.length < 4) throw new Error(t('e.calcArgs'));
      const expr = needStr(evNode(args[0], scope));
      const v = needStr(evNode(args[1], scope));
      const a = needNum(evNode(args[2], scope));
      const N = truncI(evNode(args[3], scope));
      if (!/^[A-Za-z_]\w*$/.test(v) || N < 0 || N > 12) throw new Error(t('e.calcArgs'));
      const fmtK = (c: number): string => String(Number(c.toPrecision(8)));
      let dk = expr;
      const terms: string[] = [];
      for (let k = 0; k <= N; k++) {
        let c: number;
        try {
          c = numEvaluator(dk, scope)({ [v]: a });
        } catch {
          throw new Error(t('e.calcNoConv'));
        }
        if (!isFinite(c)) throw new Error(t('e.calcNoConv'));
        if (Math.abs(c) > 1e-12) {
          let fact = 1;
          for (let i = 2; i <= k; i++) fact *= i;
          const coef = c / fact;
          const cs = fmtK(coef);
          if (k === 0) terms.push(`(${cs})`);
          else if (k === 1) terms.push(`(${cs})*(${v} - (${fmtK(a)}))`);
          else terms.push(`(${cs})*(${v} - (${fmtK(a)}))^${k}`);
        }
        if (k < N) {
          try {
            dk = String(math.derivative(dk, v));
          } catch {
            throw new Error(t('e.calcArgs'));
          }
        }
      }
      return terms.length ? terms.join(' + ') : '0';
    }),
    // limit("sin(x)/x", "x", 0) — численный предел по сходящейся сетке
    limit: raw((args, _m, scope) => {
      if (args.length < 3) throw new Error(t('e.calcArgs'));
      const expr = needStr(evNode(args[0], scope));
      const v = needStr(evNode(args[1], scope));
      const a = needNum(evNode(args[2], scope));
      const dir = args.length > 3 ? truncI(evNode(args[3], scope)) : 0;
      if (!/^[A-Za-z_]\w*$/.test(v) || ![-1, 0, 1].includes(dir)) throw new Error(t('e.calcArgs'));
      const ev = numEvaluator(expr, scope);
      const f = (x: number): number => ev({ [v]: x });
      const sc = Math.max(1, Math.abs(a));
      const probe = (fn: (x: number) => number, h: number, side: number): number => fn(a + side * h * sc);
      const converge = (fn: (x: number) => number): number => {
        try {
          return convergeGrid(fn);
        } catch {
          return convergeRichardson(fn);
        }
      };
      const convergeGrid = (fn: (x: number) => number): number => {
        const sides = dir === 0 ? [-1, 1] : [dir];
        let cand = 0;
        for (const side of sides) {
          const vals: number[] = [];
          for (let k = 1; k <= 12; k++) {
            const h = 10 ** -k;
            let y: number;
            try {
              y = probe(fn, h, side);
            } catch {
              throw new Error(t('e.calcNoConv'));
            }
            if (!isFinite(y)) throw new Error(t('e.calcNoConv'));
            vals.push(y);
          }
          const tail = vals.slice(-4);
          const mx = Math.max(...tail.map(Math.abs), 1);
          if (Math.max(...tail) - Math.min(...tail) > 1e-6 * mx) throw new Error(t('e.calcNoConv'));
          // хвост из точных нулей при ненулевом начале — схлопывание точности,
          // а не предел: отдать на Ричардсона/Лопиталя
          if (tail[3] === 0 && vals.some((y) => y !== 0)) throw new Error(t('e.calcNoConv'));
          cand = side === sides[0] ? tail[3] : (cand + tail[3]) / 2;
        }
        return cand;
      };
      // Мелкая сетка утонула в погрешности (0/0 высокого порядка):
      // экстраполяция Ричардсона по умеренным h (ошибка чётна по h)
      const convergeRichardson = (fn: (x: number) => number): number => {
        const sides = dir === 0 ? [-1, 1] : [dir];
        let cand = 0;
        for (const side of sides) {
          const hs = [0.5, 0.25, 0.125, 0.0625, 0.03125, 0.015625];
          const vals: number[] = [];
          for (const h of hs) {
            let y: number;
            try {
              y = probe(fn, h, side);
            } catch {
              throw new Error(t('e.calcNoConv'));
            }
            if (!isFinite(y)) throw new Error(t('e.calcNoConv'));
            vals.push(y);
          }
          const t1 = vals.slice(0, -1).map((r, k) => (4 * vals[k + 1] - r) / 3);
          const t2 = t1.slice(0, -1).map((r, k) => (16 * t1[k + 1] - r) / 15);
          const last = t2[t2.length - 1];
          const prev = t2[t2.length - 2];
          if (Math.abs(last - prev) > 1e-3 * (1 + Math.abs(last))) throw new Error(t('e.calcNoConv'));
          // субпикоскоп — честный ноль, а не шум экстраполяции
          const snapped = Math.abs(last) < 1e-12 ? 0 : last;
          cand = side === sides[0] ? snapped : (cand + snapped) / 2;
        }
        return cand;
      };
      try {
        return converge(f);
      } catch {
        // 0/0: правило Лопиталя символьным дифференцированием (до 4 уровней)
        let num = '';
        let den = '';
        try {
          const root = math.parse(expr) as unknown as { type?: string; op?: string; args?: unknown[] };
          if (root?.type !== 'OperatorNode' || root.op !== '/' || root.args?.length !== 2) throw new Error('no');
          num = String(root.args[0]);
          den = String(root.args[1]);
        } catch {
          throw new Error(t('e.calcNoConv'));
        }
        for (let level = 0; level < 4; level++) {
          let f0 = NaN;
          let g0 = NaN;
          try {
            f0 = numEvaluator(num, scope)({ [v]: a });
            g0 = numEvaluator(den, scope)({ [v]: a });
          } catch {
            break;
          }
          // NaN в точке — тоже след 0/0; выходим, только если точно не 0/0
          const fZero = Number.isNaN(f0) || Math.abs(f0) <= 1e-9;
          const gZero = Number.isNaN(g0) || Math.abs(g0) <= 1e-9;
          if (!fZero || !gZero) break;
          try {
            // math.derivative знает log, а не ln
            num = String(math.derivative(num.replace(/\bln\(/g, 'log('), v));
            den = String(math.derivative(den.replace(/\bln\(/g, 'log('), v));
          } catch {
            break;
          }
          const fl = numEvaluator(num, scope);
          const gl = numEvaluator(den, scope);
          const h = (x: number): number => {
            const gv = gl({ [v]: x });
            if (gv === 0) throw new Error(t('e.calcNoConv'));
            return fl({ [v]: x }) / gv;
          };
          try {
            return converge(h);
          } catch {
            continue;
          }
        }
        throw new Error(t('e.calcNoConv'));
      }
    }),
    // numgrad("x^2+y^2", ["x","y"], [1,2]) → [2, 4]
    numgrad: raw((args, _m, scope) => {
      if (args.length < 3) throw new Error(t('e.calcArgs'));
      const expr = needStr(evNode(args[0], scope));
      const vars = needStrVec(evNode(args[1], scope));
      const pt = needNumVec(evNode(args[2], scope));
      if (!vars.length || vars.length !== pt.length || vars.some((x) => !/^[A-Za-z_]\w*$/.test(x))) {
        throw new Error(t('e.calcArgs'));
      }
      const at = numEvaluator(expr, scope);
      const base: Record<string, number> = {};
      vars.forEach((x, i) => {
        base[x] = pt[i];
      });
      const g = vars.map((x, i) => {
        const h = 1e-8 * Math.max(1, Math.abs(pt[i]));
        const p1 = { ...base, [x]: pt[i] + h };
        const p2 = { ...base, [x]: pt[i] - h };
        return (at(p1) - at(p2)) / (2 * h);
      });
      return math.matrix(g);
    }),
    // ДПФ/ОДПФ (степень двойки — БПФ, иначе прямое ДПФ)
    dft: (v: unknown) => dftImpl(v, false),
    idft: (v: unknown) => dftImpl(v, true),
    dftMag: (v: unknown) => {
      const arr = asArrD(v);
      if (!arr.length || arr.length > 8192) throw new Error(t('e.calcArgs'));
      return math.matrix(fftCore(arr.map(toC), false).map((c) => Math.hypot(c.re, c.im)));
    },
    // eigen([[2,1],[1,2]]) → [3, 1]
    eigen: (A: unknown) => {
      try {
        const ev = (math as unknown as { eigs: (m: unknown) => { values: unknown } }).eigs(A as never);
        const arr = asArrD(ev.values);
        return math.matrix(arr as never);
      } catch {
        throw new Error(t('e.calcNoConv'));
      }
    },
    rankMat: (A: unknown, tol?: unknown) => rankImpl(A, tol),
    condNum: (A: unknown) => {
      const a = to2D(A);
      const n = a.length;
      if (a.some((r) => r.length !== n)) throw new Error(t('e.calcArgs'));
      try {
        // точное 2-нормное число: σmax/σmin через собственные числа AᵀA
        const AtA = a.map((_, i) => a.map((__, j) => {
          let s = 0;
          for (let k = 0; k < n; k++) s += a[k][i] * a[k][j];
          return s;
        }));
        const ev = (math as unknown as { eigs: (m: unknown) => { values: unknown } }).eigs(math.matrix(AtA));
        const lam = asArrD(ev.values).map((z) => {
          const c = toC(z);
          if (Math.abs(c.im) > 1e-9 * Math.max(1, Math.abs(c.re))) throw new Error('complex-eig');
          return c.re;
        });
        if (!lam.length || lam.some((z) => !isFinite(z))) throw new Error('no-eig');
        const mx = Math.max(...lam);
        const mn = Math.min(...lam);
        if (!(mx > 0) || mn <= mx * 1e-15) return Infinity;
        return Math.sqrt(mx / mn);
      } catch {
        return Infinity;
      }
    },
    vecNorm: (v: unknown, p?: unknown) => {
      const f = flat(v).map(Number);
      if (!f.length || f.some((z) => !isFinite(z))) throw new Error(t('e.calcArgs'));
      if (p === undefined) return Math.hypot(...f);
      if (typeof p === 'string' && p.toLowerCase() === 'inf') return Math.max(...f.map(Math.abs));
      const q = Number(p);
      if (!isFinite(q) || q <= 0) throw new Error(t('e.calcArgs'));
      return Math.pow(f.reduce((s, z) => s + Math.abs(z) ** q, 0), 1 / q);
    },
    matNormF: (A: unknown) => frobNorm(to2D(A)),
    cNK: (n: unknown, k: unknown) => {
      const N = truncI(n);
      const K = truncI(k);
      if (N < 0 || N > 10000) throw new Error(t('e.calcArgs'));
      return cNKImpl(N, K);
    },
    pNK: (n: unknown, k: unknown) => {
      const N = truncI(n);
      const K = truncI(k);
      if (N < 0 || N > 10000) throw new Error(t('e.calcArgs'));
      return pNKImpl(N, K);
    },
    erf: (x: unknown) => erfImpl(needNum(x)),
    normpdf: (x: unknown, mu?: unknown, sig?: unknown) => {
      const xv = needNum(x);
      const m = optNum(mu, 0);
      const s = optNum(sig, 1);
      if (!(s > 0)) throw new Error(t('e.calcArgs'));
      const z = (xv - m) / s;
      return Math.exp(-0.5 * z * z) / (s * Math.sqrt(2 * Math.PI));
    },
    normcdf: (x: unknown, mu?: unknown, sig?: unknown) => {
      const xv = needNum(x);
      const m = optNum(mu, 0);
      const s = optNum(sig, 1);
      if (!(s > 0)) throw new Error(t('e.calcArgs'));
      return 0.5 * (1 + erfImpl((xv - m) / (s * Math.SQRT2)));
    },
    binomPmf: (k: unknown, n: unknown, p: unknown) => {
      const K = truncI(k);
      const N = truncI(n);
      const P = needNum(p);
      if (N < 0 || N > 10000 || K < 0 || K > N || !(P >= 0 && P <= 1)) throw new Error(t('e.calcArgs'));
      return cNKImpl(N, K) * P ** K * (1 - P) ** (N - K);
    },
    poissonPmf: (k: unknown, lam: unknown) => {
      const K = truncI(k);
      const L = needNum(lam);
      if (K < 0 || K > 10000 || !(L > 0)) throw new Error(t('e.calcArgs'));
      let fact = 1;
      for (let i = 2; i <= K; i++) fact *= i;
      return (L ** K * Math.exp(-L)) / fact;
    },
    // interpLin([0,1,2],[0,10,40], 1.5) → 25
    interpLin: (xv: unknown, yv: unknown, x: unknown) => {
      const xs = asArrD(xv).map(Number);
      const ys = asArrD(yv).map(Number);
      const q = needNum(x);
      if (xs.length !== ys.length || xs.length < 2 || !xs.every(isFinite) || !ys.every(isFinite)) {
        throw new Error(t('e.calcArgs'));
      }
      for (let i = 1; i < xs.length; i++) {
        if (!(xs[i] > xs[i - 1])) throw new Error(t('e.calcArgs'));
      }
      if (q < xs[0] || q > xs[xs.length - 1]) throw new Error(t('e.calcArgs'));
      for (let i = 0; i + 1 < xs.length; i++) {
        if (q >= xs[i] && q <= xs[i + 1]) {
          const a = (q - xs[i]) / (xs[i + 1] - xs[i]);
          return ys[i] * (1 - a) + ys[i + 1] * a;
        }
      }
      return ys[ys.length - 1];
    },
    // polyvalM([1,2,3], 2) = 1+4+12 = 17 (коэфф. по возрастанию)
    polyvalM: (c: unknown, x: unknown) => {
      const cf = asArrD(c).map(Number);
      const xv = needNum(x);
      if (!cf.length || !cf.every(isFinite)) throw new Error(t('e.calcArgs'));
      let r = 0;
      for (let i = cf.length - 1; i >= 0; i--) r = r * xv + cf[i];
      return r;
    },
    trapzY: (y: unknown, dx?: unknown) => {
      const ys = asArrD(y).map(Number);
      const d = optNum(dx, 1);
      if (ys.length < 2 || !ys.every(isFinite) || !(d > 0)) throw new Error(t('e.calcArgs'));
      let s = 0;
      for (let i = 0; i + 1 < ys.length; i++) s += (ys[i] + ys[i + 1]) / 2;
      return s * d;
    },
    trapzXY: (x: unknown, y: unknown) => {
      const xs = asArrD(x).map(Number);
      const ys = asArrD(y).map(Number);
      if (xs.length !== ys.length || xs.length < 2 || !xs.every(isFinite) || !ys.every(isFinite)) {
        throw new Error(t('e.calcArgs'));
      }
      let s = 0;
      for (let i = 0; i + 1 < xs.length; i++) {
        if (!(xs[i + 1] > xs[i])) throw new Error(t('e.calcArgs'));
        s += ((ys[i] + ys[i + 1]) / 2) * (xs[i + 1] - xs[i]);
      }
      return s;
    },

    // ---------- физика: формулы ----------
    R_gas: R_GAS,
    sigma_sb: SIGMA_SB,
    g_std: G_STD,
    atm_pa: SI_CONSTANTS.atm_pa,
    au_m: SI_CONSTANTS.au_m,
    ly_m: SI_CONSTANTS.ly_m,
    kinE: (m: unknown, v: unknown) => {
      const mm = needNum(m);
      const vv = needNum(v);
      if (!(mm >= 0)) throw new Error(t('e.calcArgs'));
      return 0.5 * mm * vv * vv;
    },
    potE: (m: unknown, h: unknown, g?: unknown) => needNum(m) * needNum(h) * optNum(g, G_STD),
    momP: (m: unknown, v: unknown) => needNum(m) * needNum(v),
    orbitVel: (M: unknown, r: unknown) => {
      const mm = needNum(M);
      const rr = needNum(r);
      if (!(mm > 0 && rr > 0)) throw new Error(t('e.calcArgs'));
      return Math.sqrt(6.6743e-11 * mm / rr);
    },
    escapeVel: (M: unknown, r: unknown) => {
      const mm = needNum(M);
      const rr = needNum(r);
      if (!(mm > 0 && rr > 0)) throw new Error(t('e.calcArgs'));
      return Math.sqrt((2 * 6.6743e-11 * mm) / rr);
    },
    orbitPeriod: (r: unknown, M: unknown) => {
      const rr = needNum(r);
      const mm = needNum(M);
      if (!(rr > 0 && mm > 0)) throw new Error(t('e.calcArgs'));
      return 2 * Math.PI * Math.sqrt((rr ** 3) / (6.6743e-11 * mm));
    },
    dopplerSnd: (f: unknown, vs: unknown, vo?: unknown, c?: unknown) => {
      const ff = needNum(f);
      const s = needNum(vs);
      const o = optNum(vo, 0);
      const cc = optNum(c, 343);
      if (!(ff > 0 && cc > 0 && Math.abs(s) < cc)) throw new Error(t('e.calcArgs'));
      return ff * ((cc + o) / (cc - s));
    },
    gammaRel: (v: unknown) => {
      const vv = Math.abs(needNum(v));
      if (!(vv < C)) throw new Error(t('e.calcArgs'));
      return 1 / Math.sqrt(1 - (vv / C) ** 2);
    },
    deBroglie: (m: unknown, v: unknown) => {
      const mm = needNum(m);
      const vv = needNum(v);
      if (!(mm > 0 && vv !== 0)) throw new Error(t('e.calcArgs'));
      return 6.62607015e-34 / (mm * Math.abs(vv));
    },
    photonE: (lam: unknown) => {
      const l = needNum(lam);
      if (!(l > 0)) throw new Error(t('e.calcArgs'));
      return (6.62607015e-34 * C) / l;
    },
    decayN: (N0: unknown, lam: unknown, tt: unknown) => {
      const n0 = needNum(N0);
      const l = needNum(lam);
      const time = needNum(tt);
      if (!(n0 >= 0 && l >= 0)) throw new Error(t('e.calcArgs'));
      return n0 * Math.exp(-l * time);
    },
    half2lam: (T12: unknown) => {
      const v = needNum(T12);
      if (!(v > 0)) throw new Error(t('e.calcArgs'));
      return Math.LN2 / v;
    },
    blackbodyP: (T: unknown, A: unknown, eps?: unknown) => {
      const tt = needNum(T);
      const aa = needNum(A);
      const e = optNum(eps, 1);
      if (!(tt >= 0 && aa > 0 && e >= 0 && e <= 1)) throw new Error(t('e.calcArgs'));
      return e * SIGMA_SB * aa * tt ** 4;
    },
    rcTau: (R: unknown, Cc: unknown) => {
      const r = needNum(R);
      const c = needNum(Cc);
      if (!(r > 0 && c > 0)) throw new Error(t('e.calcArgs'));
      return r * c;
    },
    lcFreq: (L: unknown, Cc: unknown) => {
      const l = needNum(L);
      const c = needNum(Cc);
      if (!(l > 0 && c > 0)) throw new Error(t('e.calcArgs'));
      return 1 / (2 * Math.PI * Math.sqrt(l * c));
    },
    rlcQ: (R: unknown, L: unknown, Cc: unknown) => {
      const r = needNum(R);
      const l = needNum(L);
      const c = needNum(Cc);
      if (!(r > 0 && l > 0 && c > 0)) throw new Error(t('e.calcArgs'));
      return (1 / r) * Math.sqrt(l / c);
    },

    // ---------- электромагнитные поля ----------
    eta0: ETA0,
    // gammaZL(75, 50) → 0.2; работает и с комплексными Z
    gammaZL: (ZL: unknown, Z0: unknown) => {
      if (cAbs(Z0) === 0) throw new Error(t('e.calcArgs'));
      const m = math as unknown as {
        add: (a: unknown, b: unknown) => unknown;
        subtract: (a: unknown, b: unknown) => unknown;
        divide: (a: unknown, b: unknown) => unknown;
      };
      return m.divide(m.subtract(ZL as never, Z0 as never), m.add(ZL as never, Z0 as never));
    },
    // vswr(0.2) или vswr(75, 50)
    vswr: (a: unknown, b?: unknown) => {
      const g = b === undefined ? cAbs(a) : cAbs((S.gammaZL as (x: unknown, y: unknown) => unknown)(a, b));
      if (!(g >= 0)) throw new Error(t('e.calcArgs'));
      if (g >= 1) return Infinity;
      return (1 + g) / (1 - g);
    },
    reflPow: (g: unknown) => {
      const m = cAbs(g);
      return m * m;
    },
    transPow: (g: unknown) => {
      const m = cAbs(g);
      return 1 - m * m;
    },
    // zinLine(75, 50, pi/4): входное сопротивление отрезка линии
    zinLine: (ZL: unknown, Z0: unknown, betaL: unknown) => zinLineImpl(ZL, Z0, betaL),
    skinDepth: (f: unknown, sigma: unknown, muR?: unknown) => {
      const ff = needNum(f);
      const s = needNum(sigma);
      const mr = optNum(muR, 1);
      if (!(ff > 0 && s > 0 && mr > 0)) throw new Error(t('e.calcArgs'));
      return Math.sqrt(2 / (2 * Math.PI * ff * MU0 * mr * s));
    },
    waveImp: (epsR: unknown, muR?: unknown) => {
      const er = needNum(epsR);
      const mr = optNum(muR, 1);
      if (!(er > 0 && mr > 0)) throw new Error(t('e.calcArgs'));
      return ETA0 * Math.sqrt(mr / er);
    },
    // propConst(3.3, 0.012, 10e9) → [alpha, beta]
    propConst: (epsR: unknown, tanD: unknown, f: unknown, muR?: unknown) => propConstImpl(epsR, tanD, f, muR),
    attenDb: (alpha: unknown, len: unknown) => needNum(alpha) * needNum(len) * 8.686,
    phaseDeg: (beta: unknown, len: unknown) => (needNum(beta) * needNum(len) * 180) / Math.PI,
    // коаксиал: a — внутр. радиус, b — внешний (м); ёмкость/индуктивность на метр
    coaxCap: (epsR: unknown, a: unknown, b: unknown) => {
      const er = needNum(epsR);
      const aa = needNum(a);
      const bb = needNum(b);
      if (!(er > 0 && aa > 0 && bb > aa)) throw new Error(t('e.calcArgs'));
      return ((2 * Math.PI * EPS0 * er) / Math.log(bb / aa));
    },
    coaxInd: (a: unknown, b: unknown) => {
      const aa = needNum(a);
      const bb = needNum(b);
      if (!(aa > 0 && bb > aa)) throw new Error(t('e.calcArgs'));
      return ((MU0 / (2 * Math.PI)) * Math.log(bb / aa));
    },
    coaxZ: (epsR: unknown, a: unknown, b: unknown) => {
      const er = needNum(epsR);
      const aa = needNum(a);
      const bb = needNum(b);
      if (!(er > 0 && aa > 0 && bb > aa)) throw new Error(t('e.calcArgs'));
      return (60 / Math.sqrt(er)) * Math.log(bb / aa);
    },
    plateCap: (epsR: unknown, area: unknown, d: unknown) => {
      const er = needNum(epsR);
      const s = needNum(area);
      const dd = needNum(d);
      if (!(er > 0 && s > 0 && dd > 0)) throw new Error(t('e.calcArgs'));
      return (EPS0 * er * s) / dd;
    },
    solenoidL: (muR: unknown, N: unknown, area: unknown, len: unknown) => {
      const mr = needNum(muR);
      const nn = needNum(N);
      const s = needNum(area);
      const l = needNum(len);
      if (!(mr > 0 && nn > 0 && s > 0 && l > 0)) throw new Error(t('e.calcArgs'));
      return (MU0 * mr * nn * nn * s) / l;
    },
    microstripZ: (W: unknown, H: unknown, epsR: unknown) => microstripImpl(W, H, epsR),
    wgCutoff: (a: unknown) => {
      const aa = needNum(a);
      if (!(aa > 0)) throw new Error(t('e.calcArgs'));
      return C / (2 * aa);
    },
    wgLambda: (f: unknown, a: unknown) => {
      const ff = needNum(f);
      const aa = needNum(a);
      if (!(ff > 0 && aa > 0)) throw new Error(t('e.calcArgs'));
      const fc = C / (2 * aa);
      if (!(ff > fc)) throw new Error(t('e.calcArgs'));
      return C / ff / Math.sqrt(1 - (fc / ff) ** 2);
    },
    coulombF: (q1: unknown, q2: unknown, r: unknown) => {
      const rr = needNum(r);
      if (!(rr > 0)) throw new Error(t('e.calcArgs'));
      return ((needNum(q1) * needNum(q2)) / (4 * Math.PI * EPS0 * rr * rr));
    },
    ePointQ: (q: unknown, r: unknown) => {
      const rr = needNum(r);
      if (!(rr > 0)) throw new Error(t('e.calcArgs'));
      return (needNum(q) / (4 * Math.PI * EPS0 * rr * rr));
    },
    bWire: (I: unknown, r: unknown) => {
      const rr = needNum(r);
      if (!(rr > 0)) throw new Error(t('e.calcArgs'));
      return ((MU0 * needNum(I)) / (2 * Math.PI * rr));
    },
    cycFreq: (q: unknown, B: unknown, m: unknown) => {
      const mm = needNum(m);
      if (!(mm > 0)) throw new Error(t('e.calcArgs'));
      return (Math.abs(needNum(q) * needNum(B)) / (2 * Math.PI * mm));
    },
    // Фриис: Pt — Вт, Gt/Gr — разы, lam/d — м → Pr, Вт
    friisPr: (Pt: unknown, Gt: unknown, Gr: unknown, lam: unknown, d: unknown) => {
      const pt = needNum(Pt);
      const gt = needNum(Gt);
      const gr = needNum(Gr);
      const l = needNum(lam);
      const dd = needNum(d);
      if (!(pt >= 0 && gt > 0 && gr > 0 && l > 0 && dd > 0)) throw new Error(t('e.calcArgs'));
      return pt * gt * gr * ((l / (4 * Math.PI * dd)) ** 2);
    },
    friisDb: (PtDbm: unknown, GtDb: unknown, GrDb: unknown, f: unknown, d: unknown) => {
      const pt = needNum(PtDbm);
      const gt = needNum(GtDb);
      const gr = needNum(GrDb);
      const ff = needNum(f);
      const dd = needNum(d);
      if (!(ff > 0 && dd > 0)) throw new Error(t('e.calcArgs'));
      const fspl = 20 * Math.log10((4 * Math.PI * dd * ff) / C);
      return pt + gt + gr - fspl;
    },
    sMag2db: (s: unknown) => {
      const m = cAbs(s);
      if (!(m > 0)) throw new Error(t('e.calcArgs'));
      return 20 * Math.log10(m);
    },
    db2mag: (db: unknown) => 10 ** (needNum(db) / 20),

    // ---------- САУ / АЧХ-ФЧХ (Bode) ----------
    // Передаточная функция задаётся коэффициентами полиномов (старшая →
    // младшая): H(s) = num/den. Частоты — радиан/с, массив или скаляр.
    bodeH: (num: unknown, den: unknown, w: unknown) => {
      const N = coefArr(num);
      const D = coefArr(den);
      return asArrAny(w, (x0) => {
        const q = pqAt(N, D, x0);
        return math.complex(q.re, q.im);
      });
    },
    bodeMagDb: (num: unknown, den: unknown, w: unknown) => {
      const N = coefArr(num);
      const D = coefArr(den);
      return asArrAny(w, (x) => {
        const m = magAt(N, D, x);
        return m > 0 ? 20 * Math.log10(m) : -Infinity;
      });
    },
    bodePhaseDeg: (num: unknown, den: unknown, w: unknown) => {
      const N = coefArr(num);
      const D = coefArr(den);
      return asArrAny(w, (x) => {
        const { re, im } = pqAt(N, D, x);
        return (Math.atan2(im, re) * 180) / Math.PI; // (−180, 180]
      });
    },
    bodeFreqs: (wmin: unknown, wmax: unknown, n?: unknown) => {
      const lo = needNum(wmin);
      const hi = needNum(wmax);
      const nn = n === undefined ? 200 : needNum(n);
      if (!(lo > 0 && hi > lo && Number.isInteger(nn) && nn >= 3 && nn <= 1000)) throw new Error(t('e.calcArgs'));
      const out: number[] = new Array(nn);
      const llo = Math.log(lo);
      const lhi = Math.log(hi);
      for (let k = 0; k < nn; k++) out[k] = Math.exp(llo + (k / (nn - 1)) * (lhi - llo));
      return math.matrix(out);
    },
    // Сводная таблица Bode: [ω рад/с, |H| в дБ] (n строк × 2 столбца)
    bode: (num: unknown, den: unknown, wmin?: unknown, wmax?: unknown, n?: unknown) => {
      const lo = wmin === undefined ? 1e-2 : needNum(wmin);
      const hi = wmax === undefined ? 1e3 : needNum(wmax);
      const nn = n === undefined ? 200 : needNum(n);
      const N = coefArr(num);
      const D = coefArr(den);
      if (!(lo > 0 && hi > lo && Number.isInteger(nn) && nn >= 3 && nn <= 1000)) throw new Error(t('e.calcArgs'));
      const llo = Math.log(lo);
      const lhi = Math.log(hi);
      const rows: number[][] = [];
      for (let k = 0; k < nn; k++) {
        const x = Math.exp(llo + (k / (nn - 1)) * (lhi - llo));
        const m = magAt(N, D, x);
        rows.push([x, m > 0 ? 20 * Math.log10(m) : -Infinity]);
      }
      return math.matrix(rows);
    },

    // ---------- материалы (справочник) ----------
    // Данные — типичные справочные значения (CRC Handbook, Кей/Лэби) при
    // 20–25 °C. Поиск регистронезависимый: id / формула / EN / RU.
    matlist: () => {
      const rows = MATERIALS.map((m) => [m.id, m.en, m.ru, m.type]);
      return math.matrix(rows as never);
    },
    matType: (m: unknown) => {
      const mat = findMaterial(needStr(m));
      if (!mat) throw new Error(t('e.matNotFound', { name: String(m) }));
      return mat.type;
    },
    matProp: (m: unknown, p: unknown) => {
      const mat = findMaterial(needStr(m));
      if (!mat) throw new Error(t('e.matNotFound', { name: String(m) }));
      const key = matPropKeyOf(needStr(p));
      if (!key) throw new Error(t('e.matPropNotFound', { prop: String(p) }));
      const v = mat.props[key];
      if (v === undefined) throw new Error(t('e.matPropApply', { mat: mat.en, prop: String(p) }));
      return v;
    },
    matProps: (m: unknown) => {
      const mat = findMaterial(needStr(m));
      if (!mat) throw new Error(t('e.matNotFound', { name: String(m) }));
      const rows = MAT_PROP_KEYS.filter((k) => mat.props[k] !== undefined).map((k) => [
        MAT_PROP_NAMES[k].en,
        mat.props[k] as number,
      ]);
      return math.matrix(rows as never);
    },
    matHas: (m: unknown) => findMaterial(needStr(m)) !== null,

    // ---------- неопределённость измерений ----------
    // GUM: JCGM 100:2008 (текст: bipm.org), ГОСТ 34100.3-2017 ≡ ISO/IEC Guide 98-3.
    // МИ-школа: МИ 1317, ГОСТ Р 8.736-2011 (многократные прямые измерения).
    // ПМГ 96-2009, приложение Б (суммирование составляющих, переход к интервалу).
    // prec5725 / repLim / uTopDown — упрощённые схемы по мотивам
    // ГОСТ Р ИСО 5725-2/-6 и ГОСТ Р ИСО 21748; точные формулы — по полному тексту.
    uMean: (v: unknown) => {
      const a = needNumVec(v);
      if (a.length < 2) throw new Error(t('e.calcArgs'));
      const m = a.reduce((s, z) => s + z, 0) / a.length;
      const s2 = a.reduce((s, z) => s + (z - m) ** 2, 0) / (a.length - 1);
      return Math.sqrt(s2 / a.length); // GUM (5): s(x̄) = s/√n, тип A
    },
    nuMean: (v: unknown) => {
      const a = needNumVec(v);
      if (a.length < 2) throw new Error(t('e.calcArgs'));
      return a.length - 1; // GUM 4.2.6
    },
    uRect: (a: unknown) => {
      const A = needNum(a);
      if (!(A >= 0)) throw new Error(t('e.calcArgs'));
      return A / Math.sqrt(3); // GUM (7): прямоугольное, a — полуширина
    },
    uTri: (a: unknown) => {
      const A = needNum(a);
      if (!(A >= 0)) throw new Error(t('e.calcArgs'));
      return A / Math.sqrt(6); // GUM (9b): треугольное
    },
    uNorm: (U: unknown, k?: unknown) => {
      const UU = needNum(U);
      const K = k === undefined ? 2 : needNum(k);
      if (!(UU >= 0) || !(K > 0)) throw new Error(t('e.calcArgs'));
      return UU / K; // GUM 4.3.3–4.3.4: u = U/k
    },
    uUshape: (a: unknown) => {
      const A = needNum(a);
      if (!(A >= 0)) throw new Error(t('e.calcArgs'));
      return A / Math.sqrt(2); // GUM H.1.3.4: арксинусное, a — амплитуда цикла
    },
    uComb: (v: unknown) => {
      const a = needNumVec(v);
      return Math.sqrt(a.reduce((s, z) => s + z * z, 0)); // GUM (10): √(Σu²)
    },
    nuEff: (us: unknown, nus?: unknown) => {
      const u = needNumVec(us);
      const n = nus === undefined ? u.map(() => Infinity) : asArr(nus).map(Number);
      if (n.length !== u.length || n.some((z) => !(z > 0))) throw new Error(t('e.calcArgs'));
      const uc2 = u.reduce((s, z) => s + z * z, 0);
      if (!(uc2 > 0)) return Infinity;
      let den = 0;
      for (let i = 0; i < u.length; i++) {
        if (isFinite(n[i])) den += u[i] ** 4 / n[i]; // ν=∞: вклад 0 (GUM G.4.2)
      }
      if (!(den > 0)) return Infinity;
      return (uc2 * uc2) / den; // GUM (G.2b): Уэлч–Саттертуэйт
    },
    normQuant: (q: unknown) => normInvCdf(needNum(q)), // односторонняя обратная нормальная
    tStud: (q: unknown, nu: unknown) => {
      const N = Number(nu);
      if (typeof nu === 'boolean' || !(N > 0)) throw new Error(t('e.calcArgs'));
      return tStudCdf(needNum(q), N); // односторонняя обратная Стьюдента (ν=∞ → нормальная)
    },
    kCov: (nu: unknown, P?: unknown) => {
      const N = Number(nu);
      const PP = P === undefined ? 0.95 : needNum(P);
      if (typeof nu === 'boolean' || !(N > 0) || !(PP > 0 && PP < 1)) throw new Error(t('e.calcArgs'));
      return tStudCdf((1 + PP) / 2, N); // GUM G.6.4: k = t_p(νeff)
    },
    uExpand: (uc: unknown, k: unknown) => {
      const U = needNum(uc);
      const K = needNum(k);
      if (!(U >= 0) || !(K > 0)) throw new Error(t('e.calcArgs'));
      return U * K; // GUM (18): U = k·u_c
    },
    uncRound: (u: unknown) => uncUp2(needNum(u)), // вверх до 2 зн. цифр (GUM 7.2.6)
    resRound: (y: unknown, u: unknown) => {
      const Y = needNum(y);
      const ru = uncUp2(needNum(u));
      const place = Math.floor(Math.log10(ru)) - 1; // декада 2-й значащей цифры
      return Number((Math.round(Y / 10 ** place) * 10 ** place).toPrecision(12));
    },
    // ── Монте-Карло: GUM Supplement 1 (JCGM 101:2008), воспроизводимый seed.
    // uMC("R1*R2/(R1+R2)", [[R1, 100, 1, "rect"], [R2, 50, 0.5, "norm"]], 200000) →
    //   [y_mean, u_y, U95]
    uMC: raw((args, _m, scope) => {
      const model = needStr(evNode(args[0], scope));
      const N = args.length > 2 && evNode(args[2], scope) !== null ? needNum(evNode(args[2], scope)) : 200000;
      const seed = args.length > 3 && evNode(args[3], scope) !== null ? needNum(evNode(args[3], scope)) : null;
      // Разбор матрицы входов: имена берутся как символы из AST (без вычисления),
      // чтобы запись [[R1, 100, 1, "rect"]] работала без предобъявления R1.
      type Cell = { type: 'name' | 'num' | 'str' | 'other'; value: string | number | null };
      const astCell = (n: MathNode): Cell => {
        if (n.type === 'SymbolNode') return { type: 'name', value: (n as unknown as { name: string }).name };
        const v = (n as { value?: unknown }).value;
        if (n.type === 'ConstantNode' && typeof v === 'number') return { type: 'num', value: v };
        if (n.type === 'ConstantNode' && typeof v === 'string') return { type: 'str', value: v };
        if (n.type === 'OperatorNode' && (n as { isUnary?: boolean }).isUnary) {
          const inner = astCell((n as { args?: MathNode[] }).args?.[0] as MathNode);
          if (inner.type === 'num') return { type: 'num', value: -Number(inner.value) };
        }
        return { type: 'other', value: null };
      };
      const astRowsIn = (n: MathNode): Cell[][] | null => {
        const rows = (n as { items?: MathNode[] }).items;
        if ((n.type !== 'ArrayNode' && n.type !== 'MatrixNode') || !rows) return null;
        const out: Cell[][] = [];
        for (const rn of rows) {
          const cells = (rn as { items?: MathNode[] }).items;
          if ((rn.type !== 'ArrayNode' && rn.type !== 'MatrixNode') || !cells) return null;
          out.push(cells.map(astCell));
        }
        return out.length ? out : null;
      };
      const rowInputs = (r: Cell[]): { name: string; mean: number; u: number; dist: string } => {
        if (r.length < 3) throw new Error(t('e.calcArgs'));
        const name = String(r[0].value ?? '');
        if (r[0].type !== 'name' && r[0].type !== 'str') throw new Error(t('e.calcArgs'));
        if (!/^[A-Za-z_]\w*$/.test(name)) throw new Error(t('e.calcArgs'));
        const numOf = (c: Cell): number => {
          if (c.type === 'num') return Number(c.value);
          if (c.value === null) throw new Error(t('e.calcArgs'));
          return needNum(c.value);
        };
        const mean = numOf(r[1]);
        const u = numOf(r[2]);
        let dist = 'norm';
        if (r.length > 3 && r[3] && r[3].type === 'str') {
          dist = String(r[3].value).toLowerCase();
        } else if (r.length > 3 && r[3] && r[3].type !== 'other') {
          throw new Error(t('e.calcArgs'));
        }
        if (!(u >= 0) || !['norm', 'rect', 'tri', 'ushape'].includes(dist)) throw new Error(t('e.calcArgs'));
        return { name, mean, u, dist };
      };
      let inputs: ReturnType<typeof rowInputs>[];
      const ast = astRowsIn(args[1]);
      if (ast) {
        inputs = ast.map(rowInputs);
      } else {
        // Резервный путь: уже вычисленная матрица (например, из переменной)
        const M0 = evNode(args[1], scope);
        let a: unknown;
        if (M0 !== null && typeof M0 === 'object' && 'toArray' in (M0 as object)) {
          a = ((M0 as { toArray: () => unknown }).toArray() as unknown[]).map((r) => (Array.isArray(r) ? [...r] : [r]));
        } else if (Array.isArray(M0)) {
          a = (M0 as unknown[]).map((r) => (Array.isArray(r) ? [...r] : [r]));
        } else {
          throw new Error(t('e.calcArgs'));
        }
        inputs = (a as unknown[][]).map((r) => {
          const c0 = String(r[0]);
          const cell0: Cell = /^[A-Za-z_]\w*$/.test(c0) ? { type: 'name', value: c0 } : { type: 'str', value: c0 };
          return rowInputs([
            cell0,
            { type: 'other', value: r[1] as number },
            { type: 'other', value: r[2] as number },
            r.length > 3 && r[3] !== undefined ? { type: 'str', value: String(r[3]) } : { type: 'other', value: null },
          ]);
        });
      }
      if (!inputs.length || !Number.isInteger(N) || N < 100 || N > 2000000) throw new Error(t('e.calcArgs'));
      const ev = numEvaluator(model, scope);
      // mulberry32 — детерминированный PRNG; gaussian — Box–Muller на той же ленте
      const makePrng = (): (() => number) => {
        let s = (seed === null ? (Math.random() * 0xffffffff) >>> 0 : (seed >>> 0)) || 0x9e3779b9;
        return () => {
          s = (s + 0x6d2b79f5) >>> 0;
          let x = s;
          x = Math.imul(x ^ (x >>> 15), x | 1);
          x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
          return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
        };
      };
      const prng = makePrng();
      let spare: number | null = null;
      const gauss = (): number => {
        if (spare !== null) {
          const v = spare;
          spare = null;
          return v;
        }
        let u = 0;
        let v = 0;
        do {
          u = prng() * 2 - 1;
          v = prng() * 2 - 1;
        } while (u * u + v * v > 1 || u * u + v * v === 0);
        const s = Math.sqrt((-2 * Math.log(u * u + v * v)) / (u * u + v * v));
        spare = u * s;
        return v * s;
      };
      const sample = (inp: { mean: number; u: number; dist: string }): number => {
        const { mean, u, dist } = inp;
        if (dist === 'rect') return mean + u * (2 * prng() - 1); // GUM-S1 6.4.4.1
        if (dist === 'tri') return mean + u * (prng() + prng() - 1); // 6.4.4.2: треугольная
        if (dist === 'ushape') return mean + u * Math.cos(Math.PI * prng()); // 6.4.4.3: U-образная
        return mean + u * gauss(); // 6.4.3: нормальная
      };
      const ys = new Float64Array(N);
      const bind: Record<string, number> = {};
      for (let i = 0; i < N; i++) {
        for (const inp of inputs) bind[inp.name] = sample(inp);
        let y: number;
        try {
          y = ev(bind);
        } catch {
          throw new Error(t('e.calcArgs'));
        }
        ys[i] = y;
      }
      const mean = ys.reduce((s, y) => s + y, 0) / N;
      let s2 = 0;
      for (let i = 0; i < N; i++) s2 += (ys[i] - mean) * (ys[i] - mean);
      const uy = Math.sqrt(s2 / (N - 1)); // GUM-S1 8.3: стандартная неопределённость
      const sorted = Array.from(ys).sort((p, q) => p - q);
      const pct = (p: number): number => sorted[Math.min(N - 1, Math.max(0, Math.round(p * (N - 1))))];
      const lo = pct(0.025);
      const hi = pct(0.975);
      return math.matrix([mean, uy, (hi - lo) / 2]); // GUM-S1 7.10: 95% интервал
    }),
    confEps: (S: unknown, n: unknown, P?: unknown) => {
      const SS = needNum(S);
      const N = needNum(n);
      const PP = P === undefined ? 0.95 : needNum(P);
      if (!(SS >= 0) || !Number.isInteger(N) || N < 2 || !(PP > 0 && PP < 1)) throw new Error(t('e.calcArgs'));
      return tStudCdf((1 + PP) / 2, N - 1) * (SS / Math.sqrt(N)); // ГОСТ 8.736: ε = t·S(x̄)
    },
    thetaComb: (v: unknown) => {
      const a = needNumVec(v);
      return Math.sqrt(a.reduce((s, z) => s + z * z, 0) / 3); // S_θ = √(Σθᵢ²/3)
    },
    deltaComb: (eps: unknown, theta: unknown, S: unknown, Stheta: unknown) => {
      const E = needNum(eps);
      const T = needNum(theta);
      const SS = needNum(S);
      const ST = needNum(Stheta);
      if (!(E >= 0 && T >= 0 && SS >= 0 && ST >= 0)) throw new Error(t('e.calcArgs'));
      if (!(SS > 0)) return T;
      const r = T / SS; // ГОСТ 8.736, разд. 8–9: пороги θ/S
      if (r < 0.8) return E;
      if (r > 8) return T;
      if (!(SS + ST > 0)) return E + T;
      const K = (E + T) / (SS + ST);
      return K * Math.sqrt(SS * SS + ST * ST); // Δ = K·S_Σ
    },
    pmgSumAbs: (v: unknown) => {
      const a = needNumVec(v);
      return a.reduce((s, z) => s + Math.abs(z), 0); // ПМГ 96-2009, Б.3.1: Σ|Δᵢ|
    },
    pmgRSS: (Ss: unknown, Ds: unknown) => {
      const s = needNumVec(Ss);
      const d = needNumVec(Ds);
      const rss = s.reduce((t, z) => t + z * z, 0) + d.reduce((t, z) => t + (z * z) / 3, 0);
      return Math.sqrt(rss); // ПМГ 96-2009, Б.3.2: √(ΣS² + ΣΔ²/3)
    },
    pmgExpand: (Sc: unknown, Kp?: unknown) => {
      const C = needNum(Sc);
      const K = Kp === undefined ? 2 : needNum(Kp);
      if (!(C >= 0) || !(K > 0)) throw new Error(t('e.calcArgs'));
      return K * C; // ПМГ 96-2009, Б.5: Δ_P = K_P·S_Σ (K_P — по рис. Б.1)
    },
    repLim: (s: unknown) => {
      const S = needNum(s);
      if (!(S >= 0)) throw new Error(t('e.calcArgs'));
      return 2.8 * S; // пределы r/R по схеме ГОСТ Р ИСО 5725-6
    },
    uTopDown: (sR: unknown, uBias: unknown, uAdd?: unknown) => {
      const a = needNum(sR);
      const b = needNum(uBias);
      const c = uAdd === undefined ? 0 : needNum(uAdd);
      if (!(a >= 0 && b >= 0 && c >= 0)) throw new Error(t('e.calcArgs'));
      return Math.sqrt(a * a + b * b + c * c); // упрощённый top-down в духе ИСО 21748
    },
    prec5725: (M: unknown) => {
      // p лабораторий × n параллелей (строки — лаборатории). Схема 5725-2.
      let a: unknown;
      if (M !== null && typeof M === 'object' && 'toArray' in (M as object)) {
        a = ((M as { toArray: () => unknown }).toArray() as unknown[]).map((r) => (Array.isArray(r) ? [...r] : [r]));
      } else if (Array.isArray(M)) {
        a = (M as unknown[]).map((r) => (Array.isArray(r) ? [...r] : [r]));
      } else {
        throw new Error(t('e.calcArgs'));
      }
      const rows = (a as unknown[][]).map((r) => r.map(Number));
      const p = rows.length;
      const n = rows[0]?.length ?? 0;
      if (p < 2 || n < 2 || !rows.every((r) => r.length === n && r.every((z) => isFinite(z)))) {
        throw new Error(t('e.calcArgs'));
      }
      const means = rows.map((r) => r.reduce((s, z) => s + z, 0) / n);
      const grand = means.reduce((s, z) => s + z, 0) / p;
      const MSe = rows.reduce((s, r, i) => s + r.reduce((t, z) => t + (z - means[i]) ** 2, 0), 0) / (p * (n - 1));
      const MSb = (n * means.reduce((s, m) => s + (m - grand) ** 2, 0)) / (p - 1);
      const sr = Math.sqrt(MSe);
      const sL = Math.sqrt(Math.max(0, (MSb - MSe) / n));
      return math.matrix([sr, sL, Math.sqrt(sr * sr + sL * sL)]); // [s_r, s_L, s_R]
    },

    // ---------- программирование: строки / массивы / контрольные суммы ----------
    chrU: (c: unknown) => {
      const v = truncI(c);
      if (v < 0 || v > 0x10ffff) throw new Error(t('e.calcArgs'));
      return String.fromCodePoint(v);
    },
    ordU: (s: unknown) => {
      const str = needStr(s);
      if (![...str].length) throw new Error(t('e.calcArgs'));
      return [...str][0].codePointAt(0) ?? 0;
    },
    strlenU: (s: unknown) => [...needStr(s)].length,
    strUpper: (s: unknown) => needStr(s).toUpperCase(),
    strLower: (s: unknown) => needStr(s).toLowerCase(),
    substrU: (s: unknown, start: unknown, len?: unknown) => {
      const chars = [...needStr(s)];
      const st = truncI(start);
      if (st < 0 || st > chars.length) throw new Error(t('e.calcArgs'));
      if (len === undefined) return chars.slice(st).join('');
      const L = truncI(len);
      if (L < 0) throw new Error(t('e.calcArgs'));
      return chars.slice(st, st + L).join('');
    },
    splitStr: (s: unknown, sep: unknown) => math.matrix(needStr(s).split(needStr(sep))),
    joinStr: (v: unknown, sep: unknown) => asArr(v).map(String).join(needStr(sep)),
    parseNum: (s: unknown) => {
      const n = Number(String(s).trim().replace(',', '.'));
      if (!isFinite(n)) throw new Error(t('e.calcArgs'));
      return n;
    },
    uniqueVals: (v: unknown) => {
      const arr = asArr(v);
      const seen = new Map<string, unknown>();
      for (const item of arr) {
        const k = `${typeof item}:${String(item)}`;
        if (!seen.has(k)) seen.set(k, item);
      }
      return math.matrix([...seen.values()] as never);
    },
    histC: (v: unknown, nbins?: unknown) => {
      const f = asArrD(v).map(Number);
      const nb = optInt(nbins, 10);
      if (!f.length || f.some((z) => !isFinite(z)) || nb < 1 || nb > 1000) throw new Error(t('e.calcArgs'));
      const lo = Math.min(...f);
      const hi = Math.max(...f);
      const counts = new Array<number>(nb).fill(0);
      if (hi === lo) {
        counts[0] = f.length;
        return math.matrix(counts);
      }
      for (const z of f) {
        const idx = Math.min(nb - 1, Math.floor(((z - lo) / (hi - lo)) * nb));
        counts[idx]++;
      }
      return math.matrix(counts);
    },
  };
  // ----- короткие алиасы -----
  // find — то же, что nlsolve; numdiff/numint/numsum/numprod — численные
  // операторы исчисления (производная d/dx, интеграл ∫, суммы Σ, произведения Π)
  S.find = S.nlsolve;
  S.numdiff = S.ndiff;
  S.numint = S.nint;
  S.numsum = S.nsum;
  S.numprod = S.nprod;
  return S;

  function asArrD(v: unknown): unknown[] {
    if (Array.isArray(v)) return v.flat(Infinity);
    if (v !== null && typeof v === 'object' && 'toArray' in (v as object)) {
      return ((v as { toArray: () => unknown }).toArray() as unknown[]).flat(Infinity);
    }
    return [v];
  }

  function sumProdArgs(args: MathNode[], scope: Scope, allowInf = false): [string, string, number, number] {
    const expr = needStr(evNode(args[0], scope));
    const v = needStr(evNode(args[1], scope));
    const numOrInf = (u: unknown): number => {
      if (typeof u === 'boolean') throw new Error(t('e.calcArgs'));
      const n = Number(u);
      if (Number.isNaN(n)) throw new Error(t('e.calcArgs'));
      return n;
    };
    const a = allowInf ? numOrInf(evNode(args[2], scope)) : needNum(evNode(args[2], scope));
    const b = allowInf ? numOrInf(evNode(args[3], scope)) : needNum(evNode(args[3], scope));
    const aOk = Number.isInteger(a) || (allowInf && a === -Infinity);
    const bOk = Number.isInteger(b) || (allowInf && b === Infinity);
    if (!/^[A-Za-z_]\w*$/.test(v) || !aOk || !bOk || !(b >= a)) {
      throw new Error(t('e.calcIntRange'));
    }
    if (!allowInf && b - a > 1000000) {
      throw new Error(t('e.calcIntRange'));
    }
    if (allowInf && Number.isFinite(a) && Number.isFinite(b) && b - a > 1000000) {
      throw new Error(t('e.calcIntRange'));
    }
    if (!Number.isFinite(a) && !Number.isFinite(b)) {
      throw new Error(t('e.calcIntRange'));
    }
    return [expr, v, a, b];
  }
}

/** Имена паков — исключаются из зависимостей (встроенные). */
export const PACK_NAMES = [
  'seq', 'linspace', 'rows', 'cols', 'rms', 'sinc', 'augment', 'zscore',
  'c_light', 'mu_0', 'eps_0', 'h_planck', 'hbar', 'k_B', 'q_e', 'N_A', 'G_const', 'm_e', 'm_p',
  'm_n', 'u_mass', 'alpha', 'alpha_inv', 'mu_B', 'mu_N', 'R_inf', 'a0', 'r_e', 'lam_compton',
  'Z_0', 'F_const',
  'R_gas', 'sigma_sb', 'g_std', 'atm_pa', 'au_m', 'ly_m',
  'dB', 'dBV', 'idB', 'dBm', 'WdBm', 'lambda_f', 'fspl', 'fspl_dB', 'defunit',
  'convertTo', 'inUnits', 'hasUnit',
  'simplify', 'sderiv', 'expand', 'sfactor', 'sint',
  'nlsolve', 'find', 'minerr', 'minimize', 'maximize', 'root', 'bvp',
  'ndiff', 'nint', 'nsum', 'nprod', 'numdiff', 'numint', 'numsum', 'numprod',
  'lsolve', 'polyroots', 'linfit', 'polyfit',
  // вычислительная техника
  'dec2bin', 'dec2hex', 'dec2oct', 'bin2dec', 'hex2dec', 'oct2dec',
  'bitand', 'bitor', 'bitxor', 'bitnot', 'shl', 'shr', 'rol', 'ror',
  'popcount', 'parity', 'hammdist', 'isPow2', 'nextPow2', 'bytesFmt',
  'adcSNR', 'adcLevels', 'quantStep', 'shannonCap', 'thermalNoiseV',
  'fnv1a', 'crc16', 'crc32', 'lfsrSeq',
  // высшая математика
  'taylor', 'limit', 'numgrad', 'dft', 'idft', 'dftMag',
  'eigen', 'rankMat', 'condNum', 'vecNorm', 'matNormF',
  'cNK', 'pNK', 'erf', 'normpdf', 'normcdf', 'binomPmf', 'poissonPmf',
  'interpLin', 'polyvalM', 'trapzY', 'trapzXY',
  // физика
  'kinE', 'potE', 'momP', 'orbitVel', 'escapeVel', 'orbitPeriod',
  'dopplerSnd', 'gammaRel', 'deBroglie', 'photonE', 'decayN', 'half2lam',
  'blackbodyP', 'rcTau', 'lcFreq', 'rlcQ',
  // ЭМ поля
  'eta0', 'gammaZL', 'vswr', 'reflPow', 'transPow', 'zinLine',
  'skinDepth', 'waveImp', 'propConst', 'attenDb', 'phaseDeg',
  'coaxCap', 'coaxInd', 'coaxZ', 'plateCap', 'solenoidL', 'microstripZ',
  'wgCutoff', 'wgLambda', 'coulombF', 'ePointQ', 'bWire', 'cycFreq',
  'friisPr', 'friisDb', 'sMag2db', 'db2mag',
  // САУ / АЧХ-ФЧХ (Bode)
  'bodeH', 'bodeMagDb', 'bodePhaseDeg', 'bodeFreqs', 'bode',
  // материалы (справочник)
  'matlist', 'matType', 'matProp', 'matProps', 'matHas',
  // программирование: строки/массивы
  'chrU', 'ordU', 'strlenU', 'strUpper', 'strLower', 'substrU',
  'splitStr', 'joinStr', 'parseNum', 'uniqueVals', 'histC',
  // неопределённость измерений (GUM / МИ / ПМГ / 5725 / 21748)
  'uMean', 'nuMean', 'uRect', 'uTri', 'uNorm', 'uUshape', 'uComb', 'nuEff',
  'normQuant', 'tStud', 'kCov', 'uExpand', 'uncRound', 'resRound', 'uMC',
  'confEps', 'thetaComb', 'deltaComb', 'pmgSumAbs', 'pmgRSS', 'pmgExpand',
  'repLim', 'uTopDown', 'prec5725',
];

/* ---------------- Палитра вставки ---------------- */

export interface Snippet {
  pack: PackId;
  label: LText;
  hint: LText;
  code: string;
  kind: 'math' | 'plot' | 'program' | 'sim' | 'contour';
  exportName?: string;
  /** Нормативная подпись: ГОСТ/методика, откуда формула (показывается в палитре) */
  doc?: string;
  /**
   * Переменные графика: строки `x := ...` — вставляются мат-блоками ВЫШЕ
   * plot-блока, чтобы график пересчитывался от их значений (порядок сверху-вниз).
   */
  vars?: string;
  /**
   * Готовое выражение 2D-графика для math-сниппета (видит переменные документа).
   * В палитре — кнопка 2D; сам сниппет при этом определяет переменные.
   */
  plot2d?: string;
  /** Преднастройки plot-блока (проекция, стиль, оформление) */
  plot?: {
    plotProj?: 'xy' | 'polar';
    plotTrace?: 'line' | 'bar' | 'stem';
    plotErr?: string;
    plotTitle?: string;
    plotXLabel?: string;
    plotYLabel?: string;
    plotGrid?: boolean;
    plotLegend?: boolean;
    plotXmin?: number;
    plotXmax?: number;
  };
}

export const SNIPPETS: Snippet[] = [
  // матрицы
  { pack: 'matrices', label: { ru: 'Матрица 2×2', en: '2×2 matrix' }, hint: { ru: '[ ; ] — строки', en: '[ ; ] — rows' }, doc: 'A := [a, b; c, d] — ; начинает строку', code: 'A := [1, 2; 3, 4]', kind: 'math', plot2d: 'A' },
  { pack: 'matrices', label: { ru: 'Определитель', en: 'Determinant' }, hint: { ru: 'det(M)', en: 'det(M)' }, doc: 'det(M) — M квадратная', code: 'det(A) =', kind: 'math', plot2d: 'det([[x, 2], [3, 4]])' },
  { pack: 'matrices', label: { ru: 'Обратная', en: 'Inverse' }, hint: { ru: 'inv(M)', en: 'inv(M)' }, doc: 'B := inv(A) — A невырожденная', code: 'B := inv(A)', kind: 'math', plot2d: 'inv([[1, 2], [3, 4]])' },
  { pack: 'matrices', label: { ru: 'Транспонирование', en: 'Transpose' }, hint: { ru: "A' или transpose", en: "A' or transpose" }, doc: 'transpose(M) — строки ↔ столбцы', code: 'transpose(A) =', kind: 'math', plot2d: 'transpose([[1, 2], [3, 4]])' },
  { pack: 'matrices', label: { ru: 'Решение СЛАУ', en: 'Linear system' }, hint: { ru: 'x = A⁻¹·b', en: 'x = A⁻¹·b' }, doc: 'x := inv(A)*b — b столбец', code: 'x := inv(A)*[5; 6]', kind: 'math', plot2d: 'inv([[2, 1], [1, 3]])*[5, 6]' },
  { pack: 'matrices', label: { ru: 'Диапазон 1..n', en: 'Range 1..n' }, hint: { ru: 'вектор-столбец значений', en: 'column vector of values' }, doc: 'v := seq(a, b) — столбец значений', code: 'n := seq(0, 10)', kind: 'math', plot2d: 'n' },
  { pack: 'matrices', label: { ru: 'linspace', en: 'linspace' }, hint: { ru: 'N точек [a,b]', en: 'N points [a,b]' }, doc: 'linspace(a, b, N) — N точек', code: 't := linspace(0, 1, 11)', kind: 'math', plot2d: 't' },
  // статистика
  { pack: 'stats', label: { ru: 'Выборка', en: 'Sample' }, hint: { ru: 'вектор данных', en: 'data vector' }, doc: 'v := [x1, x2, ...] — через запятую', code: 'data := [2.3, 3.1, 2.8, 4.0, 3.5, 2.9]', kind: 'math', plot2d: 'data' },
  { pack: 'stats', label: { ru: 'Среднее', en: 'Mean' }, hint: { ru: 'mean(v)', en: 'mean(v)' }, doc: 'mean(v) — вектор чисел', code: 'mean(data) =', kind: 'math' },
  { pack: 'stats', label: { ru: 'СКО', en: 'Std dev' }, hint: { ru: 'std(v)', en: 'std(v)' }, doc: 'std(v) — выборочное', code: 'std(data) =', kind: 'math' },
  { pack: 'stats', label: { ru: 'RMS', en: 'RMS' }, hint: { ru: 'среднеквадратичное', en: 'root mean square' }, doc: 'rms(v) — корень среднего квадратов', code: 'rms(data) =', kind: 'math' },
  { pack: 'stats', label: { ru: 'Медиана/квантиль', en: 'Median/quantile' }, hint: { ru: 'median, quantileSeq', en: 'median, quantileSeq' }, doc: 'median(v), quantileSeq(v, p)', code: 'median(data) =', kind: 'math' },
  // неопределённость измерений (GUM / МИ / ПМГ / 5725 / 21748)
  { pack: 'uncertainty', label: { ru: 'Бюджет GUM', en: 'GUM budget' }, hint: { ru: 'A + B → суммарная → расширенная', en: 'A + B → combined → expanded' }, doc: 'GUM · ГОСТ 34100.3-2017, разд. 4–6', code: 'x := [10.1, 10.3, 9.9, 10.2, 10.0]\nuA := uMean(x)\nuB := uRect(0.15)\nuC := uComb([uA, uB])\nU := uExpand(uC, 2)\nU =', kind: 'math', plot2d: 'x' },
  { pack: 'uncertainty', label: { ru: 'Тип A (выборка)', en: 'Type A (sample)' }, hint: { ru: 'uMean — СКО среднего', en: 'uMean — std of the mean' }, doc: 'GUM 4.2 · ГОСТ 34100.3-2017', code: 'uMean([2.31, 2.29, 2.33, 2.30]) =', kind: 'math' },
  { pack: 'uncertainty', label: { ru: 'Тип B (распределения)', en: 'Type B (distributions)' }, hint: { ru: 'rect/tri/norm/ushape', en: 'rect/tri/norm/ushape' }, doc: 'GUM 4.3 · ГОСТ 34100.3-2017', code: 'uRect(0.5) =\nuTri(0.5) =\nuNorm(0.3, 2) =', kind: 'math', plot2d: 'uRect(x); uTri(x)' },
  { pack: 'uncertainty', label: { ru: 'Степени свободы + k', en: 'DoF + coverage k' }, hint: { ru: 'Уэлч–Саттертуэйт, Стьюдент', en: 'Welch–Satterthwaite, Student' }, doc: 'GUM G.4, 6.3 · ГОСТ 34100.3-2017', code: 'us := [0.12, 0.23]\nne := nuEff(us, [9, Infinity])\nkCov(ne) =', kind: 'math' },
  { pack: 'uncertainty', label: { ru: 'Округление результата', en: 'Result rounding' }, hint: { ru: '2 значащие цифры (GUM 7)', en: '2 significant digits (GUM 7)' }, doc: 'GUM 7.2 · ГОСТ 34100.3-2017', code: 'u := uncRound(0.02341)\nresRound(10.0613, u) =', kind: 'math' },
  { pack: 'uncertainty', label: { ru: 'Монте-Карло uMC', en: 'Monte-Carlo uMC' }, hint: { ru: 'GUM-S1: модель + распределения входов', en: 'GUM-S1: model + input PDFs' }, doc: 'GUM-S1 JCGM 101:2008 · ГОСТ 54500.1-2011', code: 'uMC("R1*R2/(R1+R2)", [[R1, 100, 1, "rect"], [R2, 50, 0.5, "norm"]], 100000) =', kind: 'math' },
  { pack: 'uncertainty', label: { ru: 'МИ: прямые многократные', en: 'MI: repeated direct' }, hint: { ru: 'ε, θ, Δ по ГОСТ 8.736', en: 'ε, θ, Δ per GOST 8.736' }, doc: 'МИ 1317 · ГОСТ Р 8.736-2011', code: 'e := confEps(0.12, 10)\nt := thetaComb([0.04, 0.03])\ndeltaComb(e, 0.07, 0.038, t) =', kind: 'math' },
  { pack: 'uncertainty', label: { ru: 'ПМГ: суммирование', en: 'PMG: combination' }, hint: { ru: 'Б.3–Б.5: |Δ|, RSS, K_P', en: 'B.3–B.5: |Δ|, RSS, K_P' }, code: 'Sc := pmgRSS([0.1, 0.05], [0.2, 0.1])\npmgExpand(Sc, 2) =', kind: 'math', doc: 'ПМГ 96-2009, прил. Б' },
  { pack: 'uncertainty', label: { ru: 'Прецизионность p×n', en: 'Precision p×n' }, hint: { ru: 's_r, s_L, s_R (схема 5725-2)', en: 's_r, s_L, s_R (5725-2 scheme)' }, doc: 'схема ГОСТ Р ИСО 5725-2', code: 'M := [10.1, 10.3; 9.9, 10.0; 10.2, 10.1]\nprec5725(M) =', kind: 'math' },
  { pack: 'uncertainty', label: { ru: 'Top-down оценка', en: 'Top-down estimate' }, hint: { ru: 'упрощённо по 21748', en: 'simplified per 21748' }, doc: 'подход ГОСТ Р ИСО 21748', code: 'uTopDown(0.15, 0.08) =', kind: 'math' },
  { pack: 'uncertainty', label: { ru: 'Пределы r, R', en: 'Limits r, R' }, hint: { ru: '2.8·s (5725-6)', en: '2.8·s (5725-6)' }, doc: 'ГОСТ Р ИСО 5725-6', code: 'repLim(0.12) =', kind: 'math', plot2d: 'repLim(x)' },
  // физика
  { pack: 'physics', label: { ru: 'Фотон 650 нм', en: '650 nm photon' }, hint: { ru: 'E = h·c/λ', en: 'E = h·c/λ' }, doc: 'E = h·c/λ — λ в метрах', code: 'E_ph := h_planck*c_light/(650*10^-9)', kind: 'math', plot2d: 'h_planck*c_light/x' },
  { pack: 'physics', label: { ru: 'Энергия в эВ', en: 'Energy in eV' }, hint: { ru: '/q_e', en: '/q_e' }, doc: 'E_эВ := E/q_e', code: 'E_eV := E_ph/q_e', kind: 'math', plot2d: 'h_planck*c_light/(x*q_e)' },
  { pack: 'physics', label: { ru: 'Тепловая энергия', en: 'Thermal energy' }, hint: { ru: 'k_B·T', en: 'k_B·T' }, doc: 'E = k_B*T — T в кельвинах', code: 'E_th := k_B*300', kind: 'math', plot2d: 'k_B*x' },
  // телеком
  { pack: 'telecom', label: { ru: 'Мощность в дБм', en: 'Power in dBm' }, hint: { ru: 'Вт → дБм', en: 'W → dBm' }, doc: 'dBm(P) — P в ваттах', code: 'dBm(20*10^-3) =', kind: 'math', plot2d: 'dBm(x)' },
  { pack: 'telecom', label: { ru: 'FSPL', en: 'FSPL' }, hint: { ru: 'потери, d — м, f — Гц', en: 'loss, d — m, f — Hz' }, doc: 'fspl_dB(d_м, f_Гц)', code: 'L := fspl_dB(1000, 2.4*10^9)', kind: 'math', plot2d: 'fspl_dB(x, 2.4*10^9)' },
  { pack: 'telecom', label: { ru: 'Длина волны', en: 'Wavelength' }, hint: { ru: 'λ(f)', en: 'λ(f)' }, doc: 'lambda_f(f_Гц) — метры', code: 'lambda_f(2.4*10^9) =', kind: 'math', plot2d: 'lambda_f(x)' },
  { pack: 'telecom', label: { ru: 'дБм в ватты', en: 'dBm to watts' }, hint: { ru: 'обратно', en: 'reverse' }, doc: 'WdBm(x_дБм)', code: 'WdBm(13) =', kind: 'math', plot2d: 'WdBm(x)' },
  { pack: 'telecom', label: { ru: 'Отношение в дБ', en: 'Ratio in dB' }, hint: { ru: '10·lg', en: '10·lg' }, doc: 'dB(x) — 10·lg', code: 'dB(100) =', kind: 'math', plot2d: 'dB(x)' },
  // программы
  {
    pack: 'programs', label: { ru: 'Факториал (for)', en: 'Factorial (for)' }, hint: { ru: 'цикл, экспорт fact', en: 'loop, exports fact' },
    doc: 'for i in a..b — тело с отступом, end',
    code: 'f := 1\nfor i in 2..n\n  f := f*i\nend\nf', kind: 'program', exportName: 'fact',
  },
  {
    pack: 'programs', label: { ru: 'Оценка (else if)', en: 'Grade (else if)' }, hint: { ru: 'цепочка else if', en: 'else if chain' },
    doc: 'if/else if/else — цепочка, end',
    code: 'g := 85\nif g >= 90\n  mark := 5\nelse if g >= 75\n  mark := 4\nelse if g >= 60\n  mark := 3\nelse\n  mark := 2\nend\nmark', kind: 'program', exportName: 'mark',
  },
  {
    pack: 'programs', label: { ru: 'on error + breakpoint', en: 'on error + breakpoint' }, hint: { ru: 'запасное значение и точка останова', en: 'fallback value and breakpoint' },
    doc: 'expr on error запасное — breakpoint',
    code: 'x := nosuchvar on error -1\nbreakpoint\nx + 10', kind: 'program',
  },
  {
    pack: 'programs', label: { ru: 'Сумма ряда (while+if)', en: 'Series sum (while+if)' }, hint: { ru: 'while, if/else', en: 'while, if/else' },
    doc: 'while условие — if/else внутри, end',
    code: 's := 0\nk := 0\nwhile s < 100\n  k := k + 1\n  if k/2 == round(k/2)\n    s := s + k\n  else\n    s := s + 1\n  end\nend\ns', kind: 'program',
  },
  // графики
  { pack: 'plots', label: { ru: 'sin + cos', en: 'sin + cos' }, hint: { ru: 'две серии через ; · A и w — переменные выше', en: 'two series via ; · A and w are variables above' }, doc: 'f1(x); f2(x) — серии через ;', code: 'A1*sin(w1*x); A2*cos(w2*x)', kind: 'plot', vars: 'A1 := 1\nw1 := 1\nA2 := 1\nw2 := 0.5' },
  { pack: 'plots', label: { ru: 'Затухание', en: 'Damping' }, hint: { ru: 'экспонента × синус · A, tau — переменные выше', en: 'exponential × sine · A, tau are variables above' }, doc: 'A*exp(-x/tau)*sin(x)', code: 'A_m*exp(-x/tau)*sin(x)', kind: 'plot', vars: 'A_m := 1\ntau := 5' },
  { pack: 'plots', label: { ru: 'Полярный: трилистник', en: 'Polar: three petals' }, hint: { ru: 'r(θ), k — число лепестков', en: 'r(θ), k — petal count' }, doc: 'r(θ) — polar-проекция', code: 'cos(k_pt*x)', kind: 'plot', vars: 'k_pt := 3', plot: { plotProj: 'polar', plotXmin: 0, plotXmax: 6.2832 } },
  { pack: 'plots', label: { ru: 'Столбцы', en: 'Bars' }, hint: { ru: 'bar-стиль · A — переменная выше', en: 'bar style · A is a variable above' }, doc: 'bar-стиль: plot: { plotTrace }', code: 'A_m*sin(x)', kind: 'plot', vars: 'A_m := 1', plot: { plotTrace: 'bar' } },
  { pack: 'plots', label: { ru: 'Стебли', en: 'Stem' }, hint: { ru: 'stem-стиль · A, tau — переменные выше', en: 'stem style · A, tau are variables above' }, doc: 'stem-стиль: plot: { plotTrace }', code: 'A_m*exp(-x/tau)*sin(x)', kind: 'plot', vars: 'A_m := 1\ntau := 5', plot: { plotTrace: 'stem' } },
  { pack: 'plots', label: { ru: 'С погрешностями', en: 'With errors' }, hint: { ru: '±err(x) · A — переменная выше', en: '±err(x) · A is a variable above' }, doc: 'plotErr: "±(x)" — полоса ошибки', code: 'A_m*sin(x)', kind: 'plot', vars: 'A_m := 1', plot: { plotErr: '0.1 + 0.05*abs(sin(2*x))' } },
  { pack: 'plots', label: { ru: 'Оформленный', en: 'Titled' }, hint: { ru: 'заголовок и подписи · A, tau — переменные выше', en: 'title and labels · A, tau are variables above' }, doc: 'plot: { title, labels } — оформление', code: 'A_m*sin(x); A_m*exp(-x/tau)*sin(x)', kind: 'plot', vars: 'A_m := 1\ntau := 5', plot: { plotTitle: 'Гармоники', plotXLabel: 'x, рад', plotYLabel: 'y' } },
  { pack: 'plots', label: { ru: 'Изолинии', en: 'Isolines' }, hint: { ru: 'контурный график · k — переменная выше', en: 'contour plot · k is a variable above' }, doc: 'f(x,y) — kind contour', code: 'sin(k_w*sqrt(x^2+y^2))', kind: 'contour', vars: 'k_w := 1' },
  // единицы измерения
  { pack: 'units', label: { ru: 'Длина (SI)', en: 'Length (SI)' }, hint: { ru: 'метры, сантиметры', en: 'meters, centimeters' }, doc: 'L := 5 m — число + единица', code: 'L := 5 m', kind: 'math' },
  { pack: 'units', label: { ru: 'Расстояние в метрах', en: 'Distance in meters' }, hint: { ru: 'g := 10cm = m', en: 'g := 10cm = m' }, doc: 'g := 10 cm = m — показать в', code: 'g := 10 cm = m', kind: 'math' },
  { pack: 'units', label: { ru: 'Показать в единицах', en: 'Show in units' }, hint: { ru: 'L = cm', en: 'L = cm' }, doc: 'L = cm — перевод результата', code: 'L := 5 m\nL = cm', kind: 'math' },
  { pack: 'units', label: { ru: 'Сила (USCS)', en: 'Force (USCS)' }, hint: { ru: 'фунт-сила', en: 'pound-force' }, doc: 'F := 10 lbf', code: 'F := 10 lbf', kind: 'math' },
  { pack: 'units', label: { ru: 'Энергия (эВ)', en: 'Energy (eV)' }, hint: { ru: 'электронвольты', en: 'electronvolts' }, doc: 'E := 3 eV', code: 'E := 3 eV', kind: 'math' },
  { pack: 'units', label: { ru: 'Перевести', en: 'Convert' }, hint: { ru: 'в другие единицы', en: 'into other units' }, doc: 'convertTo(x, "N")', code: 'convertTo(F, "N") =', kind: 'math' },
  { pack: 'units', label: { ru: 'Число в единицах', en: 'Number in units' }, hint: { ru: 'для графиков и программ', en: 'for plots and programs' }, doc: 'inUnits(x, "cm")', code: 'inUnits(L, "cm") =', kind: 'math' },
  { pack: 'units', label: { ru: 'Своя единица', en: 'Custom unit' }, hint: { ru: 'defunit(имя, определение)', en: 'defunit(name, definition)' }, doc: 'defunit("имя", "определение")', code: 'defunit("smoot", "1.7 m")', kind: 'math' },
  // исчисление и решатели
  { pack: 'calc', label: { ru: 'Упростить', en: 'Simplify' }, hint: { ru: 'символьное упрощение', en: 'symbolic simplification' }, doc: 'simplify("выражение") =', code: 'simplify("x^2 + 2*x + 1") =', kind: 'math' },
  { pack: 'calc', label: { ru: 'Раскрыть скобки', en: 'Expand' }, hint: { ru: 'expand', en: 'expand' }, doc: 'expand("выражение") =', code: 'expand("(x + 1)^2") =', kind: 'math' },
  { pack: 'calc', label: { ru: 'На множители', en: 'Factor' }, hint: { ru: 'разложение полинома', en: 'polynomial factoring' }, doc: 'sfactor("выражение", "x") =', code: 'sfactor("x^2 + 3*x + 2", "x") =', kind: 'math' },
  { pack: 'calc', label: { ru: 'Производная (симв.)', en: 'Derivative (sym.)' }, hint: { ru: 'символьное дифференцирование', en: 'symbolic differentiation' }, doc: 'sderiv("f", "x") =', code: 'sderiv("sin(x^2)", "x") =', kind: 'math' },
  { pack: 'calc', label: { ru: 'Интеграл (симв.)', en: 'Integral (sym.)' }, hint: { ru: 'табличный интеграл', en: 'table integral' }, doc: 'sint("f", "x") =', code: 'sint("x^2", "x") =', kind: 'math' },
  { pack: 'calc', label: { ru: 'Производная (числ.)', en: 'Derivative (num.)' }, hint: { ru: 'd/dx в точке', en: 'd/dx at a point' }, doc: 'numdiff("f", "x", точка) =', code: 'numdiff("sin(x)", "x", 1) =', kind: 'math', plot2d: 'numdiff("sin(t)", "t", x)' },
  { pack: 'calc', label: { ru: 'Интеграл (числ.)', en: 'Integral (num.)' }, hint: { ru: '∫ на отрезке', en: '∫ over an interval' }, doc: 'numint("f", "x", a, b) =', code: 'numint("sin(x)", "x", 0, 3.14159) =', kind: 'math', plot2d: 'numint("sin(t)", "t", 0, x)' },
  { pack: 'calc', label: { ru: 'Сумма ряда', en: 'Series sum' }, hint: { ru: 'Σ по целым', en: 'Σ over integers' }, doc: 'numsum("f", "k", a, b) = — предел ∞ тоже можно', code: 'numsum("k^2", "k", 1, 100) =', kind: 'math' },
  { pack: 'calc', label: { ru: 'Раскрытие Σ', en: 'Sigma expansion' }, hint: { ru: 'Σ(2k−1), k=1..4 → 16', en: 'Σ(2k−1), k=1..4 → 16' }, doc: 'numsum("2*k-1", "k", 1, 4) =', code: 'numsum("2*k-1", "k", 1, 4) =', kind: 'math' },
  { pack: 'calc', label: { ru: 'Корень (Брент)', en: 'Root (Brent)' }, hint: { ru: 'на отрезке [a, b]', en: 'on [a, b]' }, doc: 'root("f", "x", a, b) =', code: 'root("x^3 - 2", "x", 0, 2) =', kind: 'math' },
  { pack: 'calc', label: { ru: 'Система (find)', en: 'System (find)' }, hint: { ru: 'Ньютон для системы', en: 'Newton for a system' }, doc: 'find(["f1","f2"], ["x","y"], [x0,y0]) =', code: 'find(["x^2+y^2-4", "x-y-1"], ["x", "y"], [1, 0]) =', kind: 'math' },
  { pack: 'calc', label: { ru: 'Минимум', en: 'Minimum' }, hint: { ru: 'Нелдер–Мид', en: 'Nelder–Mead' }, doc: 'minimize("f", ["x"], [x0]) =', code: 'minimize("(x-2)^2", ["x"], [0]) =', kind: 'math' },
  { pack: 'calc', label: { ru: 'Корни полинома', en: 'Polynomial roots' }, hint: { ru: 'коэфф. по возрастанию степени', en: 'coeffs ascending' }, doc: 'polyroots([коэфф.]) — по возрастанию', code: 'polyroots([2, -3, 1]) =', kind: 'math', plot2d: 'polyroots([2, -3, 1])' },
  { pack: 'calc', label: { ru: 'Аппроксимация', en: 'Polyfit' }, hint: { ru: 'МНК-полином', en: 'least-squares polynomial' }, doc: 'polyfit(xs, ys, степень) =', code: 'polyfit([0, 1, 2, 3], [1, 3, 7, 13], 2) =', kind: 'math', plot2d: 'polyfit([0, 1, 2, 3], [1, 3, 7, 13], 2)' },
  { pack: 'calc', label: { ru: 'Краевая задача', en: 'Boundary value' }, hint: { ru: 'стрельба y"=f', en: 'shooting for y"=f' }, doc: 'bvp("f", "x", a, b, ya, yb) =', code: 'bvp("-y", "x", 0, 1, 0, 1) =', kind: 'math' },
  // симуляции (code = id модели)
  { pack: 'sim', label: { ru: 'Маятник', en: 'Pendulum' }, hint: { ru: 'нелинейные колебания', en: 'nonlinear swings' }, doc: 'sim-блок «pendulum» — параметры внутри', code: 'pendulum', kind: 'sim' },
  { pack: 'sim', label: { ru: 'Бросок тела', en: 'Projectile' }, hint: { ru: 'полёт с сопротивлением', en: 'flight with drag' }, doc: 'sim-блок «projectile» — параметры внутри', code: 'projectile', kind: 'sim' },
  { pack: 'sim', label: { ru: 'Лоренц', en: 'Lorenz' }, hint: { ru: 'хаос-бабочка', en: 'butterfly chaos' }, doc: 'sim-блок «lorenz» — параметры внутри', code: 'lorenz', kind: 'sim' },
  { pack: 'sim', label: { ru: 'RLC-контур', en: 'RLC circuit' }, hint: { ru: 'переходный процесс', en: 'transient' }, doc: 'sim-блок «rlc» — параметры внутри', code: 'rlc', kind: 'sim' },
  { pack: 'sim', label: { ru: 'Орбита', en: 'Orbit' }, hint: { ru: 'спутник, RK45', en: 'satellite, RK45' }, doc: 'sim-блок «orbit» — параметры внутри', code: 'orbit', kind: 'sim' },
  { pack: 'sim', label: { ru: 'Распад A→B→C', en: 'Decay A→B→C' }, hint: { ru: 'ядерная цепочка', en: 'nuclear chain' }, doc: 'sim-блок «decay» — параметры внутри', code: 'decay', kind: 'sim' },
  { pack: 'sim', label: { ru: 'Прыгающий мяч', en: 'Bouncing ball' }, hint: { ru: 'событие удара', en: 'impact event' }, doc: 'sim-блок «bounce» — параметры внутри', code: 'bounce', kind: 'sim' },
  { pack: 'sim', label: { ru: 'Восьмёрка 3 тел', en: 'Three-body figure-8' }, hint: { ru: 'гравитация, хаос', en: 'gravity, chaos' }, doc: 'sim-блок «figure8» — параметры внутри', code: 'figure8', kind: 'sim' },
  { pack: 'sim', label: { ru: 'Импульс через пластину', en: 'Pulse through slab' }, hint: { ru: 'FDTD, волны', en: 'FDTD, waves' }, doc: 'sim-блок «slab» — параметры внутри', code: 'slab', kind: 'sim' },
  { pack: 'sim', label: { ru: 'Зеркало Брэгга', en: 'Bragg mirror' }, hint: { ru: 'FDTD, два слоя', en: 'FDTD, two slabs' }, doc: 'sim-блок «bragg» — параметры внутри', code: 'bragg', kind: 'sim' },
  { pack: 'sim', label: { ru: 'LC-контур', en: 'LC tank' }, hint: { ru: 'свободные колебания', en: 'free oscillations' }, doc: 'sim-блок «lctank» — параметры внутри', code: 'lctank', kind: 'sim' },
  { pack: 'sim', label: { ru: 'RLC под синусом', en: 'Driven RLC' }, hint: { ru: 'вынужденный отклик', en: 'forced response' }, doc: 'sim-блок «drivenRLC» — параметры внутри', code: 'drivenRLC', kind: 'sim' },
  { pack: 'sim', label: { ru: 'Даффинг', en: 'Duffing' }, hint: { ru: 'хаос, двуямный', en: 'chaos, double-well' }, doc: 'sim-блок «duffing» — параметры внутри', code: 'duffing', kind: 'sim' },
  // вычислительная техника
  { pack: 'computing', label: { ru: 'DEC → BIN/HEX', en: 'DEC to BIN/HEX' }, hint: { ru: 'системы счисления', en: 'number bases' }, doc: 'dec2bin(n), dec2hex(n)', code: 'dec2bin(13) =\ndec2hex(255) =', kind: 'math' },
  { pack: 'computing', label: { ru: 'Битовые операции', en: 'Bit operations' }, hint: { ru: 'и/или/искл.или, сдвиги', en: 'and/or/xor, shifts' }, doc: 'bitand/bitor/shl(a, b)', code: 'bitand(12, 10) =\nbitor(12, 10) =\nshl(3, 2) =', kind: 'math', plot2d: 'bitand(x, 10)' },
  { pack: 'computing', label: { ru: 'Популяция битов', en: 'Popcount' }, hint: { ru: 'число единиц, чётность', en: 'ones count, parity' }, doc: 'popcount(n), parity(n), hammdist(a, b)', code: 'popcount(255) =\nparity(13) =\nhammdist(12, 10) =', kind: 'math', plot2d: 'popcount(x)' },
  { pack: 'computing', label: { ru: 'АЦП: SNR и шаг', en: 'ADC: SNR and step' }, hint: { ru: 'разрядность → дБ', en: 'bits → dB' }, doc: 'adcSNR(биты), quantStep(U, биты)', code: 'adcSNR(12) =\nquantStep(3.3, 12) =', kind: 'math', plot2d: 'adcSNR(x)' },
  { pack: 'computing', label: { ru: 'Шеннон', en: 'Shannon' }, hint: { ru: 'пропускная способность', en: 'channel capacity' }, doc: 'shannonCap(полоса_Гц, SNR_дБ)', code: 'shannonCap(20*10^6, 30) =', kind: 'math', plot2d: 'shannonCap(x, 30)' },
  { pack: 'computing', label: { ru: 'CRC / хеш строки', en: 'CRC / string hash' }, hint: { ru: 'контрольные суммы', en: 'checksums' }, doc: 'crc16("..."), crc32("...")', code: 'crc16("123456789") =\ncrc32("123456789") =', kind: 'math' },
  { pack: 'computing', label: { ru: 'LFSR-последовательность', en: 'LFSR sequence' }, hint: { ru: 'псевдослучайные биты', en: 'pseudorandom bits' }, doc: 'lfsrSeq(seed, маска, биты)', code: 'lfsrSeq(31, 27, 16, 5) =', kind: 'math', plot2d: 'lfsrSeq(31, 27, 16, 5)' },
  { pack: 'computing', label: { ru: 'Размер в байтах', en: 'Byte size' }, hint: { ru: 'B/KiB/MiB…', en: 'B/KiB/MiB…' }, doc: 'bytesFmt(байты)', code: 'bytesFmt(1536) =', kind: 'math' },
  // высшая математика
  { pack: 'calc', label: { ru: 'Ряд Тейлора', en: 'Taylor series' }, hint: { ru: 'полином в точке', en: 'polynomial at a point' }, doc: 'taylor("f", "x", точка, порядок) =', code: 'taylor("sin(x)", "x", 0, 5) =', kind: 'math' },
  { pack: 'calc', label: { ru: 'Предел', en: 'Limit' }, hint: { ru: 'численный предел', en: 'numeric limit' }, doc: 'limit("f", "x", точка) =', code: 'limit("sin(x)/x", "x", 0) =', kind: 'math' },
  { pack: 'calc', label: { ru: 'Градиент', en: 'Gradient' }, hint: { ru: 'численные производные', en: 'numeric derivatives' }, doc: 'numgrad("f", ["x","y"], [x0,y0]) =', code: 'numgrad("x^2+y^2", ["x", "y"], [1, 2]) =', kind: 'math' },
  { pack: 'calc', label: { ru: 'ДПФ и спектр', en: 'DFT and spectrum' }, hint: { ru: 'dft, амплитуды', en: 'dft, magnitudes' }, doc: 'dftMag(вектор)', code: 'dftMag([0, 1, 0, -1]) =', kind: 'math', plot2d: 'dftMag([0, 1, 0, -1])' },
  { pack: 'calc', label: { ru: 'Собственные числа', en: 'Eigenvalues' }, hint: { ru: 'спектр матрицы', en: 'matrix spectrum' }, doc: 'eigen(M)', code: 'eigen([2, 1; 1, 2]) =', kind: 'math', plot2d: 'eigen([[2, 1], [1, 2]])' },
  { pack: 'calc', label: { ru: 'Ранг и число обусловленности', en: 'Rank and condition' }, hint: { ru: 'rankMat, condNum', en: 'rankMat, condNum' }, doc: 'rankMat(M), condNum(M)', code: 'rankMat([1, 2; 2, 4]) =\ncondNum([1, 2; 3, 4]) =', kind: 'math' },
  { pack: 'calc', label: { ru: 'Нормальное распределение', en: 'Normal distribution' }, hint: { ru: 'pdf/cdf', en: 'pdf/cdf' }, doc: 'normpdf(x), normcdf(x)', code: 'normpdf(0) =\nnormcdf(1.96) =', kind: 'math', plot2d: 'normpdf(x)' },
  { pack: 'calc', label: { ru: 'Интерполяция и трапеции', en: 'Interp and trapz' }, hint: { ru: 'табличные данные', en: 'tabular data' }, doc: 'interpLin(xs, ys, x), trapzY(ys, шаг)', code: 'interpLin([0, 1, 2], [0, 10, 40], 1.5) =\ntrapzY([0, 10, 40], 1) =', kind: 'math' },
  // физика
  { pack: 'physics', label: { ru: 'Кинетика', en: 'Kinetics' }, hint: { ru: 'энергия и импульс', en: 'energy and momentum' }, doc: 'kinE(m, v), momP(m, v) — СИ', code: 'kinE(2, 10) =\nmomP(2, 10) =', kind: 'math', plot2d: 'kinE(2, x)' },
  { pack: 'physics', label: { ru: 'Орбита', en: 'Orbit' }, hint: { ru: 'скорость и период', en: 'velocity and period' }, doc: 'orbitVel(M, r), escapeVel(M, R)', code: 'orbitVel(5.97*10^24, 6771000) =\nescapeVel(5.97*10^24, 6371000) =', kind: 'math', plot2d: 'orbitVel(5.97*10^24, x)' },
  { pack: 'physics', label: { ru: 'Чёрное тело', en: 'Black body' }, hint: { ru: 'Стефан–Больцман', en: 'Stefan–Boltzmann' }, doc: 'blackbodyP(T, площадь)', code: 'blackbodyP(5800, 1) =', kind: 'math', plot2d: 'blackbodyP(x, 1)' },
  { pack: 'physics', label: { ru: 'Распад', en: 'Decay' }, hint: { ru: 'экспонента, T1/2', en: 'exponential, half-life' }, doc: 'half2lam(T), decayN(N0, λ, t)', code: 'lam := half2lam(10)\ndecayN(1000, lam, 5) =', kind: 'math', plot2d: 'decayN(1000, lam, x)' },
  { pack: 'physics', label: { ru: 'Резонанс LC', en: 'LC resonance' }, hint: { ru: 'частота и добротность', en: 'frequency and Q' }, doc: 'lcFreq(L, C), rlcQ(R, L, C)', code: 'lcFreq(0.1, 10*10^-6) =\nrlcQ(10, 0.1, 10*10^-6) =', kind: 'math', plot2d: 'lcFreq(0.1, x)' },
  // ЭМ поля
  { pack: 'em', label: { ru: 'Гамма и КСВ', en: 'Gamma and VSWR' }, hint: { ru: 'отражение от нагрузки', en: 'load reflection' }, doc: 'gammaZL(Zн, Z0), vswr(Zн, Z0)', code: 'gammaZL(75, 50) =\nvswr(75, 50) =', kind: 'math', plot2d: 'gammaZL(x, 50)' },
  { pack: 'em', label: { ru: 'Входное сопротивление линии', en: 'Line input impedance' }, hint: { ru: 'отрезок βl', en: 'βl section' }, doc: 'zinLine(Z0, Zн, βl)', code: 'zinLine(75, 50, pi/4) =', kind: 'math', plot2d: 'zinLine(75, 50, x)' },
  { pack: 'em', label: { ru: 'Скин-слой', en: 'Skin depth' }, hint: { ru: 'глубина проникновения', en: 'penetration depth' }, doc: 'skinDepth(f_Гц, σ)', code: 'skinDepth(50, 5.8*10^7) =', kind: 'math', plot2d: 'skinDepth(x, 5.8*10^7)' },
  { pack: 'em', label: { ru: 'Потери в диэлектрике', en: 'Dielectric loss' }, hint: { ru: 'alpha, beta', en: 'alpha, beta' }, doc: 'propConst(ε, tgδ, f)', code: 'propConst(3.3, 0.012, 10*10^9) =', kind: 'math' },
  { pack: 'em', label: { ru: 'Коаксиал 50 Ом', en: '50 Ohm coax' }, hint: { ru: 'геометрия по Z', en: 'geometry for Z' }, doc: 'coaxZ(ε, d, D), coaxCap(...)', code: 'coaxZ(2.1, 0.5*10^-3, 1.65*10^-3) =\ncoaxCap(2.1, 0.5*10^-3, 1.65*10^-3) =', kind: 'math', plot2d: 'coaxZ(2.1, 0.5*10^-3, x)' },
  { pack: 'em', label: { ru: 'Микрополосок', en: 'Microstrip' }, hint: { ru: 'Хаммерстад', en: 'Hammerstad' }, doc: 'microstripZ(w, h, ε)', code: 'microstripZ(3*10^-3, 1.5*10^-3, 4.4) =', kind: 'math', plot2d: 'microstripZ(x, 1.5*10^-3, 4.4)' },
  { pack: 'em', label: { ru: 'Волновод', en: 'Waveguide' }, hint: { ru: 'отсечка TE10', en: 'TE10 cutoff' }, doc: 'wgCutoff(a), wgLambda(f, a)', code: 'wgCutoff(23*10^-3) =\nwgLambda(10*10^9, 23*10^-3) =', kind: 'math', plot2d: 'wgLambda(10*10^9, x)' },
  { pack: 'em', label: { ru: 'Линия связи (Фриис)', en: 'Link budget (Friis)' }, hint: { ru: 'дБм на приёмнике', en: 'dBm at receiver' }, doc: 'friisDb(Pt, Gt, Gr, f, d)', code: 'friisDb(20, 2, 2, 2.4*10^9, 1000) =', kind: 'math', plot2d: 'friisDb(20, 2, 2, 2.4*10^9, x)' },
  { pack: 'em', label: { ru: 'Поле заряда и провода', en: 'Charge and wire field' }, hint: { ru: 'Кулон, Био–Савар', en: 'Coulomb, Biot–Savart' }, doc: 'ePointQ(q, r), bWire(I, r)', code: 'ePointQ(1.6*10^-19, 10^-10) =\nbWire(1, 10^-3) =', kind: 'math', plot2d: 'ePointQ(1.6*10^-19, x); bWire(1, x)' },
  { pack: 'control', label: { ru: 'АЧХ по Bode', en: 'Bode magnitude' }, hint: { ru: '|H(jω)| в дБ', en: '|H(jω)| in dB' }, doc: 'Bode·САУ: H(s)=num/den', code: 'bode([1], [1, 2, 10]) =', kind: 'math',
    plot2d: 'bodeMagDb([1], [1, 2, 10], x)' },
  { pack: 'control', label: { ru: 'ФЧХ по Bode', en: 'Bode phase' }, hint: { ru: 'arg H(jω), градусы', en: 'arg H(jω), degrees' }, doc: 'Bode·САУ: сдвиг фазы', code: 'bodePhaseDeg([1], [1, 2, 10], 1) =\nbodePhaseDeg([1], [1, 2, 10], 10) =', kind: 'math',
    plot2d: 'bodePhaseDeg([1], [1, 2, 10], x)' },
  { pack: 'control', label: { ru: 'Лог. сетка частот', en: 'Log freq grid' }, hint: { ru: 'ω рад/с, геом. шаг', en: 'ω rad/s, geometric' }, doc: 'Bode·САУ', code: 'bodeFreqs(10, 10^4, 5) =', kind: 'math' },
  { pack: 'control', label: { ru: 'Комплексный отклик', en: 'Complex response' }, hint: { ru: 'H(jω) как число', en: 'H(jω) complex' }, doc: 'Bode·САУ', code: 'bodeH([1], [1, 2, 10], 1) =\nabs(bodeH([1], [1, 2, 10], 1)) =', kind: 'math' },
  { pack: 'materials', label: { ru: 'Проводимость металла', en: 'Metal conductivity' }, hint: { ru: 'σ в См/м', en: 'σ in S/m' }, doc: 'Материалы: matProp(id, prop)', code: 'matProp("copper", "sigma") =\nmatProp("Cu", "sigma") =', kind: 'math' },
  { pack: 'materials', label: { ru: 'Все свойства материала', en: 'All material properties' }, hint: { ru: 'таблица [параметр, значение]', en: '[prop, value] table' }, doc: 'Материалы', code: 'matProps("FR-4") =', kind: 'math' },
  { pack: 'materials', label: { ru: 'Диэлектрик: εᵣ', en: 'Dielectric: εᵣ' }, hint: { ru: 'материал + свойство', en: 'material + property' }, doc: 'matProp("id", "eps_r")', code: 'matProp("PTFE", "eps_r") =\nmatProp("вода", "eps_r") =', kind: 'math' },
  { pack: 'materials', label: { ru: 'Полупроводник: E_g', en: 'Semiconductor: E_g' }, hint: { ru: 'ширина зоны', en: 'bandgap' }, doc: 'matProp("id", "bandgap")', code: 'matProp("Si", "bandgap") =\nmatProp("GaAs", "bandgap") =', kind: 'math' },
  { pack: 'materials', label: { ru: 'Проверка наличия', en: 'Existence check' }, hint: { ru: 'true/false', en: 'true/false' }, doc: 'matHas("id") — true/false', code: 'matHas("Li") =\nmatHas("медь") =', kind: 'math' },
  // программирование
  {
    pack: 'programs', label: { ru: 'Бинарный поиск', en: 'Binary search' }, hint: { ru: 'деление пополам, assert', en: 'bisection, assert' },
    doc: 'while lo <= hi — mid, break, assert',
    code: 'a := [1, 3, 5, 7, 9, 11]\nkey := 7\nlo := 1\nhi := 6\nwhile lo <= hi\n  mid := floor((lo + hi)/2)\n  if a[mid] == key\n    break\n  end\n  if a[mid] < key\n    lo := mid + 1\n  else\n    hi := mid - 1\n  end\nend\nassert lo <= hi\nmid', kind: 'program', exportName: 'mid',
  },
  {
    pack: 'programs', label: { ru: 'Хорнер (полином)', en: 'Horner (polynomial)' }, hint: { ru: 'коэфф. по возрастанию', en: 'coeffs ascending' },
    doc: 'r := r*x + c[i] — схема Хорнера',
    code: 'c := [1, -3, 2]\nx := 5\nr := 0\ni := 3\nwhile i >= 1\n  r := r*x + c[i]\n  i := i - 1\nend\nr', kind: 'program',
  },
  {
    pack: 'programs', label: { ru: 'CRC16 в цикле', en: 'CRC16 loop' }, hint: { ru: 'Modbus побитово', en: 'bitwise Modbus' },
    doc: 'for b in msg — bitxor/shr по битам',
    code: 'msg := [49, 50, 51]\ncrc := 65535\nfor b in msg\n  crc := bitxor(crc, b)\n  for k in 1..8\n    if bitand(crc, 1) == 1\n      crc := bitxor(shr(crc, 1), 40961)\n    else\n      crc := shr(crc, 1)\n    end\n  end\nend\ncrc', kind: 'program',
  },
  {
    pack: 'programs', label: { ru: ' assert-контракт', en: 'assert contract' }, hint: { ru: 'предусловие функции', en: 'function precondition' },
    doc: 'assert условие — стоп при нарушении',
    code: 'n := 7\nassert n > 0\nf := 1\nfor i in 2..n\n  f := f*i\nend\nf', kind: 'program', exportName: 'fact',
  },
];
