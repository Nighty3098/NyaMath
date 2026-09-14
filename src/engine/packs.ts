/**
 * Доменные паки Wengineering: статистика, физика, телекоммуникации, математика.
 * Все функции/константы — чистый клиентский JS поверх mathjs, zero-latency.
 */
import type { MathJsInstance, MathNode } from 'mathjs';
import { t, type LText, type PackId } from '../i18n';
import { preprocessJ, preprocessRanges } from './mathEngine';
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

  const C = 299792458;
  const MU0 = 4 * Math.PI * 1e-7;
  const EPS0 = 1 / (MU0 * C * C);

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
  /** Вычислить выражение-строку в scope с подстановками; строго число. */
  const evExpr = (expr: string, scope: Scope, bind: Record<string, number>): number => {
    let v: unknown;
    try {
      v = math.evaluate(preprocessRanges(preprocessJ(expr, false)), { ...plainScope(scope), ...bind });
    } catch {
      throw new Error(t('e.simEval', { expr: expr.slice(0, 60) }));
    }
    if (typeof v !== 'number' || !isFinite(v)) throw new Error(t('e.simNotNum', { expr: expr.slice(0, 60) }));
    return v;
  };
  /** Ньютон для системы строк; strict=false → minerr (вернуть последнее). */
  const solveEqs = (eqs: string[], vars: string[], guess: number[], scope: Scope, strict: boolean): number[] => {
    if (!eqs.length || eqs.length !== vars.length || guess.length !== vars.length) throw new Error(t('e.calcArgs'));
    if (vars.some((v) => !/^[A-Za-z_]\w*$/.test(v))) throw new Error(t('e.calcArgs'));
    const F = (x: number[]): number[] => {
      const bind: Record<string, number> = {};
      vars.forEach((v, i) => {
        bind[v] = x[i];
      });
      return eqs.map((e) => evExpr(e, scope, bind));
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
    const f = (x: number): number => {
      const r = node.compile().evaluate({ [v]: x });
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

    // ---------- физика: константы SI ----------
    c_light: C,
    mu_0: MU0,
    eps_0: EPS0,
    h_planck: 6.62607015e-34,
    hbar: 6.62607015e-34 / (2 * Math.PI),
    k_B: 1.380649e-23,
    q_e: 1.602176634e-19,
    N_A: 6.02214076e23,
    G_const: 6.6743e-11,
    m_e: 9.1093837015e-31,
    m_p: 1.67262192369e-27,

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
      const f = (x: number[]): number => {
        const bind: Record<string, number> = {};
        vars.forEach((v, i) => {
          bind[v] = x[i];
        });
        return evExpr(expr, scope, bind);
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
      const f = (x: number[]): number => {
        const bind: Record<string, number> = {};
        vars.forEach((v, i) => {
          bind[v] = x[i];
        });
        return -evExpr(expr, scope, bind);
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
      const f = (x: number): number => evExpr(expr, scope, { [v]: x });
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
      const rhs = (tt: number, y: number[]): number[] => {
        const yp = evExpr(expr, scope, { [vx]: tt, y: y[0], yp: y[1] });
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
      const f = (x: number): number => evExpr(expr, scope, { [v]: x });
      try {
        return (-f(at + 2 * h) + 8 * f(at + h) - 8 * f(at - h) + f(at - 2 * h)) / (12 * h);
      } catch (e) {
        if (e instanceof Error && e.message.startsWith('Симуляция:')) throw e;
        throw new Error(t('e.calcArgs'));
      }
    }),
    // nint("sin(x)", "x", 0, pi) — адаптивный Симпсон
    nint: raw((args, _m, scope) => {
      const expr = needStr(evNode(args[0], scope));
      const v = needStr(evNode(args[1], scope));
      const a = needNum(evNode(args[2], scope));
      const b = needNum(evNode(args[3], scope));
      if (!/^[A-Za-z_]\w*$/.test(v) || !(b > a)) throw new Error(t('e.calcArgs'));
      const f = (x: number): number => evExpr(expr, scope, { [v]: x });
      try {
        return adaptiveSimpson(f, a, b);
      } catch {
        throw new Error(t('e.calcNoConv'));
      }
    }),
    // nsum("k^2", "k", 1, 100), nprod — целочисленные суммы/произведения
    nsum: raw((args, _m, scope) => {
      const [expr, v, a, b] = sumProdArgs(args, scope);
      let s = 0;
      for (let k = a; k <= b; k++) s += evExpr(expr, scope, { [v]: k });
      return s;
    }),
    nprod: raw((args, _m, scope) => {
      const [expr, v, a, b] = sumProdArgs(args, scope);
      let p = 1;
      for (let k = a; k <= b; k++) p *= evExpr(expr, scope, { [v]: k });
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
  };
  // ----- алиасы в стиле Mathcad -----
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

  function sumProdArgs(args: MathNode[], scope: Scope): [string, string, number, number] {
    const expr = needStr(evNode(args[0], scope));
    const v = needStr(evNode(args[1], scope));
    const a = needNum(evNode(args[2], scope));
    const b = needNum(evNode(args[3], scope));
    if (!/^[A-Za-z_]\w*$/.test(v) || !Number.isInteger(a) || !Number.isInteger(b) || !(b >= a) || b - a > 1000000) {
      throw new Error(t('e.calcIntRange'));
    }
    return [expr, v, a, b];
  }
}

/** Имена паков — исключаются из зависимостей (встроенные). */
export const PACK_NAMES = [
  'seq', 'linspace', 'rows', 'cols', 'rms', 'sinc', 'augment', 'zscore',
  'c_light', 'mu_0', 'eps_0', 'h_planck', 'hbar', 'k_B', 'q_e', 'N_A', 'G_const', 'm_e', 'm_p',
  'dB', 'dBV', 'idB', 'dBm', 'WdBm', 'lambda_f', 'fspl', 'fspl_dB', 'defunit',
  'convertTo', 'inUnits', 'hasUnit',
  'simplify', 'sderiv', 'expand', 'sfactor', 'sint',
  'nlsolve', 'find', 'minerr', 'minimize', 'maximize', 'root', 'bvp',
  'ndiff', 'nint', 'nsum', 'nprod', 'numdiff', 'numint', 'numsum', 'numprod',
  'lsolve', 'polyroots', 'linfit', 'polyfit',
];

/* ---------------- Палитра вставки ---------------- */

export interface Snippet {
  pack: PackId;
  label: LText;
  hint: LText;
  code: string;
  kind: 'math' | 'plot' | 'program' | 'sim' | 'contour';
  exportName?: string;
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
  { pack: 'matrices', label: { ru: 'Матрица 2×2', en: '2×2 matrix' }, hint: { ru: '[ ; ] — строки', en: '[ ; ] — rows' }, code: 'A := [1, 2; 3, 4]', kind: 'math' },
  { pack: 'matrices', label: { ru: 'Определитель', en: 'Determinant' }, hint: { ru: 'det(M)', en: 'det(M)' }, code: 'det(A) =', kind: 'math' },
  { pack: 'matrices', label: { ru: 'Обратная', en: 'Inverse' }, hint: { ru: 'inv(M)', en: 'inv(M)' }, code: 'B := inv(A)', kind: 'math' },
  { pack: 'matrices', label: { ru: 'Транспонирование', en: 'Transpose' }, hint: { ru: "A' или transpose", en: "A' or transpose" }, code: 'transpose(A) =', kind: 'math' },
  { pack: 'matrices', label: { ru: 'Решение СЛАУ', en: 'Linear system' }, hint: { ru: 'x = A⁻¹·b', en: 'x = A⁻¹·b' }, code: 'x := inv(A)*[5; 6]', kind: 'math' },
  { pack: 'matrices', label: { ru: 'Диапазон 1..n', en: 'Range 1..n' }, hint: { ru: 'вектор-столбец значений', en: 'column vector of values' }, code: 'n := seq(0, 10)', kind: 'math' },
  { pack: 'matrices', label: { ru: 'linspace', en: 'linspace' }, hint: { ru: 'N точек [a,b]', en: 'N points [a,b]' }, code: 't := linspace(0, 1, 11)', kind: 'math' },
  // статистика
  { pack: 'stats', label: { ru: 'Выборка', en: 'Sample' }, hint: { ru: 'вектор данных', en: 'data vector' }, code: 'data := [2.3, 3.1, 2.8, 4.0, 3.5, 2.9]', kind: 'math' },
  { pack: 'stats', label: { ru: 'Среднее', en: 'Mean' }, hint: { ru: 'mean(v)', en: 'mean(v)' }, code: 'mean(data) =', kind: 'math' },
  { pack: 'stats', label: { ru: 'СКО', en: 'Std dev' }, hint: { ru: 'std(v)', en: 'std(v)' }, code: 'std(data) =', kind: 'math' },
  { pack: 'stats', label: { ru: 'RMS', en: 'RMS' }, hint: { ru: 'среднеквадратичное', en: 'root mean square' }, code: 'rms(data) =', kind: 'math' },
  { pack: 'stats', label: { ru: 'Медиана/квантиль', en: 'Median/quantile' }, hint: { ru: 'median, quantileSeq', en: 'median, quantileSeq' }, code: 'median(data) =', kind: 'math' },
  // физика
  { pack: 'physics', label: { ru: 'Фотон 650 нм', en: '650 nm photon' }, hint: { ru: 'E = h·c/λ', en: 'E = h·c/λ' }, code: 'E_ph := h_planck*c_light/(650*10^-9)', kind: 'math' },
  { pack: 'physics', label: { ru: 'Энергия в эВ', en: 'Energy in eV' }, hint: { ru: '/q_e', en: '/q_e' }, code: 'E_eV := E_ph/q_e', kind: 'math' },
  { pack: 'physics', label: { ru: 'Тепловая энергия', en: 'Thermal energy' }, hint: { ru: 'k_B·T', en: 'k_B·T' }, code: 'E_th := k_B*300', kind: 'math' },
  // телеком
  { pack: 'telecom', label: { ru: 'Мощность в дБм', en: 'Power in dBm' }, hint: { ru: 'Вт → дБм', en: 'W → dBm' }, code: 'dBm(20*10^-3) =', kind: 'math' },
  { pack: 'telecom', label: { ru: 'дБм в ватты', en: 'dBm to watts' }, hint: { ru: 'обратно', en: 'reverse' }, code: 'WdBm(13) =', kind: 'math' },
  { pack: 'telecom', label: { ru: 'FSPL', en: 'FSPL' }, hint: { ru: 'потери, d — м, f — Гц', en: 'loss, d — m, f — Hz' }, code: 'L := fspl_dB(1000, 2.4*10^9)', kind: 'math' },
  { pack: 'telecom', label: { ru: 'Длина волны', en: 'Wavelength' }, hint: { ru: 'λ(f)', en: 'λ(f)' }, code: 'lambda_f(2.4*10^9) =', kind: 'math' },
  { pack: 'telecom', label: { ru: 'Отношение в дБ', en: 'Ratio in dB' }, hint: { ru: '10·lg', en: '10·lg' }, code: 'dB(100) =', kind: 'math' },
  // программы
  {
    pack: 'programs', label: { ru: 'Факториал (for)', en: 'Factorial (for)' }, hint: { ru: 'цикл, экспорт fact', en: 'loop, exports fact' },
    code: 'f := 1\nfor i in 2..n\n  f := f*i\nend\nf', kind: 'program', exportName: 'fact',
  },
  {
    pack: 'programs', label: { ru: 'Оценка (else if)', en: 'Grade (else if)' }, hint: { ru: 'цепочка else if', en: 'else if chain' },
    code: 'g := 85\nif g >= 90\n  mark := 5\nelse if g >= 75\n  mark := 4\nelse if g >= 60\n  mark := 3\nelse\n  mark := 2\nend\nmark', kind: 'program', exportName: 'mark',
  },
  {
    pack: 'programs', label: { ru: 'on error + breakpoint', en: 'on error + breakpoint' }, hint: { ru: 'запасное значение и точка останова', en: 'fallback value and breakpoint' },
    code: 'x := nosuchvar on error -1\nbreakpoint\nx + 10', kind: 'program',
  },
  {
    pack: 'programs', label: { ru: 'Сумма ряда (while+if)', en: 'Series sum (while+if)' }, hint: { ru: 'while, if/else', en: 'while, if/else' },
    code: 's := 0\nk := 0\nwhile s < 100\n  k := k + 1\n  if k/2 == round(k/2)\n    s := s + k\n  else\n    s := s + 1\n  end\nend\ns', kind: 'program',
  },
  // графики
  { pack: 'plots', label: { ru: 'sin + cos', en: 'sin + cos' }, hint: { ru: 'две серии через ;', en: 'two series via ;' }, code: 'sin(x); cos(x/2)', kind: 'plot' },
  { pack: 'plots', label: { ru: 'Затухание', en: 'Damping' }, hint: { ru: 'экспонента × синус', en: 'exponential × sine' }, code: 'exp(-x/5)*sin(x)', kind: 'plot' },
  { pack: 'plots', label: { ru: 'Полярный: трилистник', en: 'Polar: three petals' }, hint: { ru: 'r(θ), θ — радианы', en: 'r(θ), θ in radians' }, code: 'cos(3*x)', kind: 'plot', plot: { plotProj: 'polar', plotXmin: 0, plotXmax: 6.2832 } },
  { pack: 'plots', label: { ru: 'Столбцы', en: 'Bars' }, hint: { ru: 'bar-стиль', en: 'bar style' }, code: 'sin(x)', kind: 'plot', plot: { plotTrace: 'bar' } },
  { pack: 'plots', label: { ru: 'Стебли', en: 'Stem' }, hint: { ru: 'stem-стиль', en: 'stem style' }, code: 'exp(-x/5)*sin(x)', kind: 'plot', plot: { plotTrace: 'stem' } },
  { pack: 'plots', label: { ru: 'С погрешностями', en: 'With errors' }, hint: { ru: '±err(x)', en: '±err(x)' }, code: 'sin(x)', kind: 'plot', plot: { plotErr: '0.1 + 0.05*abs(sin(2*x))' } },
  { pack: 'plots', label: { ru: 'Оформленный', en: 'Titled' }, hint: { ru: 'заголовок и подписи осей', en: 'title and axis labels' }, code: 'sin(x); cos(x/2)', kind: 'plot', plot: { plotTitle: 'Гармоники', plotXLabel: 'x, рад', plotYLabel: 'y' } },
  { pack: 'plots', label: { ru: 'Изолинии', en: 'Isolines' }, hint: { ru: 'контурный график f(x,y)', en: 'contour plot of f(x,y)' }, code: 'sin(sqrt(x^2+y^2))', kind: 'contour' },
  // единицы измерения
  { pack: 'units', label: { ru: 'Длина (SI)', en: 'Length (SI)' }, hint: { ru: 'метры, сантиметры', en: 'meters, centimeters' }, code: 'L := 5 m', kind: 'math' },
  { pack: 'units', label: { ru: 'Расстояние в метрах', en: 'Distance in meters' }, hint: { ru: 'g := 10cm = m', en: 'g := 10cm = m' }, code: 'g := 10 cm = m', kind: 'math' },
  { pack: 'units', label: { ru: 'Показать в единицах', en: 'Show in units' }, hint: { ru: 'L = cm', en: 'L = cm' }, code: 'L := 5 m\nL = cm', kind: 'math' },
  { pack: 'units', label: { ru: 'Сила (USCS)', en: 'Force (USCS)' }, hint: { ru: 'фунт-сила', en: 'pound-force' }, code: 'F := 10 lbf', kind: 'math' },
  { pack: 'units', label: { ru: 'Энергия (эВ)', en: 'Energy (eV)' }, hint: { ru: 'электронвольты', en: 'electronvolts' }, code: 'E := 3 eV', kind: 'math' },
  { pack: 'units', label: { ru: 'Перевести', en: 'Convert' }, hint: { ru: 'в другие единицы', en: 'into other units' }, code: 'convertTo(F, "N") =', kind: 'math' },
  { pack: 'units', label: { ru: 'Число в единицах', en: 'Number in units' }, hint: { ru: 'для графиков и программ', en: 'for plots and programs' }, code: 'inUnits(L, "cm") =', kind: 'math' },
  { pack: 'units', label: { ru: 'Своя единица', en: 'Custom unit' }, hint: { ru: 'defunit(имя, определение)', en: 'defunit(name, definition)' }, code: 'defunit("smoot", "1.7 m")', kind: 'math' },
  // исчисление и решатели
  { pack: 'calc', label: { ru: 'Упростить', en: 'Simplify' }, hint: { ru: 'символьное упрощение', en: 'symbolic simplification' }, code: 'simplify("x^2 + 2*x + 1") =', kind: 'math' },
  { pack: 'calc', label: { ru: 'Раскрыть скобки', en: 'Expand' }, hint: { ru: 'expand', en: 'expand' }, code: 'expand("(x + 1)^2") =', kind: 'math' },
  { pack: 'calc', label: { ru: 'На множители', en: 'Factor' }, hint: { ru: 'разложение полинома', en: 'polynomial factoring' }, code: 'sfactor("x^2 + 3*x + 2", "x") =', kind: 'math' },
  { pack: 'calc', label: { ru: 'Производная (симв.)', en: 'Derivative (sym.)' }, hint: { ru: 'символьное дифференцирование', en: 'symbolic differentiation' }, code: 'sderiv("sin(x^2)", "x") =', kind: 'math' },
  { pack: 'calc', label: { ru: 'Интеграл (симв.)', en: 'Integral (sym.)' }, hint: { ru: 'табличный интеграл', en: 'table integral' }, code: 'sint("x^2", "x") =', kind: 'math' },
  { pack: 'calc', label: { ru: 'Производная (числ.)', en: 'Derivative (num.)' }, hint: { ru: 'd/dx в точке', en: 'd/dx at a point' }, code: 'numdiff("sin(x)", "x", 1) =', kind: 'math' },
  { pack: 'calc', label: { ru: 'Интеграл (числ.)', en: 'Integral (num.)' }, hint: { ru: '∫ на отрезке', en: '∫ over an interval' }, code: 'numint("sin(x)", "x", 0, 3.14159) =', kind: 'math' },
  { pack: 'calc', label: { ru: 'Сумма ряда', en: 'Series sum' }, hint: { ru: 'Σ по целым', en: 'Σ over integers' }, code: 'numsum("k^2", "k", 1, 100) =', kind: 'math' },
  { pack: 'calc', label: { ru: 'Корень (Брент)', en: 'Root (Brent)' }, hint: { ru: 'на отрезке [a, b]', en: 'on [a, b]' }, code: 'root("x^3 - 2", "x", 0, 2) =', kind: 'math' },
  { pack: 'calc', label: { ru: 'Система (find)', en: 'System (find)' }, hint: { ru: 'Ньютон для системы', en: 'Newton for a system' }, code: 'find(["x^2+y^2-4", "x-y-1"], ["x", "y"], [1, 0]) =', kind: 'math' },
  { pack: 'calc', label: { ru: 'Минимум', en: 'Minimum' }, hint: { ru: 'Нелдер–Мид', en: 'Nelder–Mead' }, code: 'minimize("(x-2)^2", ["x"], [0]) =', kind: 'math' },
  { pack: 'calc', label: { ru: 'Корни полинома', en: 'Polynomial roots' }, hint: { ru: 'коэфф. по возрастанию степени', en: 'coeffs ascending' }, code: 'polyroots([2, -3, 1]) =', kind: 'math' },
  { pack: 'calc', label: { ru: 'Аппроксимация', en: 'Polyfit' }, hint: { ru: 'МНК-полином', en: 'least-squares polynomial' }, code: 'polyfit([0, 1, 2, 3], [1, 3, 7, 13], 2) =', kind: 'math' },
  { pack: 'calc', label: { ru: 'Краевая задача', en: 'Boundary value' }, hint: { ru: 'стрельба y"=f', en: 'shooting for y"=f' }, code: 'bvp("-y", "x", 0, 1, 0, 1) =', kind: 'math' },
  // симуляции (code = id модели)
  { pack: 'sim', label: { ru: 'Маятник', en: 'Pendulum' }, hint: { ru: 'нелинейные колебания', en: 'nonlinear swings' }, code: 'pendulum', kind: 'sim' },
  { pack: 'sim', label: { ru: 'Бросок тела', en: 'Projectile' }, hint: { ru: 'полёт с сопротивлением', en: 'flight with drag' }, code: 'projectile', kind: 'sim' },
  { pack: 'sim', label: { ru: 'Лоренц', en: 'Lorenz' }, hint: { ru: 'хаос-бабочка', en: 'butterfly chaos' }, code: 'lorenz', kind: 'sim' },
  { pack: 'sim', label: { ru: 'RLC-контур', en: 'RLC circuit' }, hint: { ru: 'переходный процесс', en: 'transient' }, code: 'rlc', kind: 'sim' },
  { pack: 'sim', label: { ru: 'Орбита', en: 'Orbit' }, hint: { ru: 'спутник, RK45', en: 'satellite, RK45' }, code: 'orbit', kind: 'sim' },
  { pack: 'sim', label: { ru: 'Распад A→B→C', en: 'Decay A→B→C' }, hint: { ru: 'ядерная цепочка', en: 'nuclear chain' }, code: 'decay', kind: 'sim' },
  { pack: 'sim', label: { ru: 'Прыгающий мяч', en: 'Bouncing ball' }, hint: { ru: 'событие удара', en: 'impact event' }, code: 'bounce', kind: 'sim' },
  { pack: 'sim', label: { ru: 'Восьмёрка 3 тел', en: 'Three-body figure-8' }, hint: { ru: 'гравитация, хаос', en: 'gravity, chaos' }, code: 'figure8', kind: 'sim' },
  { pack: 'sim', label: { ru: 'Импульс через пластину', en: 'Pulse through slab' }, hint: { ru: 'FDTD, волны', en: 'FDTD, waves' }, code: 'slab', kind: 'sim' },
];
