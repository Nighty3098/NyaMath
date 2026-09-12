/**
 * Программные блоки в стиле Mathcad.
 *
 * Синтаксис (по одной конструкции на строку, отступы — для читаемости):
 *   x := expr        локальное присваивание (также `x <- expr`)
 *   expr             выражение (значение запоминается; последнее = результат)
 *   return expr      вернуть значение досрочно
 *   if cond          ... [else ...] end
 *   for i in expr    ... end      (expr: вектор, матрица, `a..b`, число n → 1..n)
 *   while cond       ... end      (лимит 100000 итераций)
 *   break / continue
 *
 * Диапазоны: `1..10`, `0,0.5..2` (включительно). Читает глобалы документа,
 * пишет только в локалы; наружу уходит result (+ exportName на уровне стора).
 */
import {
  math,
  extractDependencies,
  humanizeMathError,
  preprocessJ,
  preprocessRanges,
  type Scope,
} from './mathEngine';

const MAX_WHILE = 100000;
const MAX_FOR = 100000;
const MAX_LINES = 2000;

interface CodeLine {
  no: number;
  text: string;
}

function toLines(src: string): CodeLine[] {
  return src
    .split('\n')
    .map((raw, i) => {
      const cut = raw.split('//')[0];
      return { no: i + 1, text: cut.trim() };
    })
    .filter((l) => l.text !== '');
}

const ASSIGN_RE = /^([A-Za-z_]\w*)\s*(:=|<-)\s*(.+)$/;
const FOR_RE = /^for\s+([A-Za-z_]\w*)\s+in\s+(.+)$/i;
const IF_RE = /^if\s+(.+)$/i;
const WHILE_RE = /^while\s+(.+)$/i;
const RETURN_RE = /^return\b\s*(.*)$/i;

export interface ProgramAnalysis {
  dependencies: string[];
  assigned: string[];
}

/** Только разбор: зависимости от глобалей (имена, не покрытые локальными присваиваниями). */
export function analyzeProgram(src: string): ProgramAnalysis {
  const lines = toLines(src).slice(0, MAX_LINES);
  const assigned = new Set<string>();
  for (const l of lines) {
    const a = l.text.match(ASSIGN_RE);
    if (a) assigned.add(a[1]);
    const f = l.text.match(FOR_RE);
    if (f) assigned.add(f[1]);
  }
  const deps = new Set<string>();
  const partOf = (t: string): string => {
    const a = t.match(ASSIGN_RE);
    if (a) return a[3];
    const f = t.match(FOR_RE);
    if (f) return rangeToSeq(f[2]);
    const iff = t.match(IF_RE);
    if (iff) return iff[1];
    const w = t.match(WHILE_RE);
    if (w) return w[1];
    const r = t.match(RETURN_RE);
    if (r) return r[1];
    if (/^(end|else|break|continue)$/i.test(t)) return '';
    return t;
  };
  for (const l of lines) {
    const part = partOf(l.text);
    if (!part) continue;
    for (const d of extractDependencies(part)) {
      if (!assigned.has(d)) deps.add(d);
    }
  }
  return { dependencies: [...deps], assigned: [...assigned] };
}

/** `a..b` / `a,s..b` с произвольными (вычисляемыми) концами → seq-выражение. */
function rangeToSeq(expr: string): string {
  const t = expr.trim();
  const m3 = t.match(/^(.*?),(.*?)\.\.(.*)$/);
  if (m3) return `seq(${m3[1]},${m3[3]},${m3[2]})`;
  const m2 = t.match(/^(.*?)\.\.(.*)$/);
  if (m2) return `seq(${m2[1]},${m2[2]})`;
  return t;
}

export interface ProgramResult {
  value: unknown;
  error: string | null;
  errorLine: number | null;
}

type Signal = null | 'break' | 'continue' | { ret: unknown };

export function runProgram(src: string, globals: Scope): ProgramResult {
  const lines = toLines(src);
  if (lines.length > MAX_LINES) {
    return { value: null, error: `Слишком длинная программа (>${MAX_LINES} строк)`, errorLine: null };
  }
  const local: Scope = {};
  const scopeOf = (): Scope => ({ ...globals, ...local });

  const evalExpr = (expr: string, lineNo: number): unknown => {
    const pre = preprocessRanges(preprocessJ(expr, false));
    try {
      return math.evaluate(pre, scopeOf());
    } catch (err) {
      throw { line: lineNo, msg: humanizeMathError(err) };
    }
  };

  const truthy = (v: unknown, lineNo: number): boolean => {
    if (typeof v === 'boolean') return v;
    if (typeof v === 'number') return v !== 0;
    if (v !== null && typeof v === 'object' && 're' in v && 'im' in v) {
      const c = v as { re: number; im: number };
      return c.re !== 0 || c.im !== 0;
    }
    throw { line: lineNo, msg: 'Условие должно быть логическим (сравнения: ==, !=, <, >, <=, >=, and/or/not)' };
  };

  const toArray = (v: unknown, lineNo: number): unknown[] => {
    if (typeof v === 'number') {
      const n = Math.floor(v);
      if (!isFinite(n) || n < 0 || n > MAX_FOR) throw { line: lineNo, msg: `for: число должно быть 0..${MAX_FOR}` };
      return Array.from({ length: n }, (_, k) => k + 1);
    }
    if (math.isMatrix(v)) return (v as { toArray: () => unknown[] }).toArray().flat(Infinity);
    if (Array.isArray(v)) return v.flat(Infinity);
    throw { line: lineNo, msg: 'for ожидает вектор, диапазон a..b или число n (→ 1..n)' };
  };

  // exec(start, end) — выполнить lines[start..end), вернуть сигнал
  const exec = (start: number, end: number): { sig: Signal; last: unknown } => {
    let last: unknown = null;
    let i = start;
    while (i < end) {
      const { no, text } = lines[i];

      // --- присваивание ---
      const a = text.match(ASSIGN_RE);
      if (a) {
        last = evalExpr(a[3], no);
        local[a[1]] = last;
        i++;
        continue;
      }
      // --- return / break / continue ---
      const r = text.match(RETURN_RE);
      if (r) {
        const v = r[1] ? evalExpr(r[1], no) : last;
        return { sig: { ret: v }, last: v };
      }
      if (/^break$/i.test(text)) return { sig: 'break', last };
      if (/^continue$/i.test(text)) return { sig: 'continue', last };

      // --- if ---
      const iff = text.match(IF_RE);
      if (iff) {
        const { elseIdx, endIdx } = findIfBounds(i, end, no);
        if (truthy(evalExpr(iff[1], no), no)) {
          const res = exec(i + 1, elseIdx >= 0 ? elseIdx : endIdx);
          if (res.sig) return res;
          last = res.last;
        } else if (elseIdx >= 0) {
          const res = exec(elseIdx + 1, endIdx);
          if (res.sig) return res;
          last = res.last;
        }
        i = endIdx + 1;
        continue;
      }

      // --- for ---
      const f = text.match(FOR_RE);
      if (f) {
        const endIdx = findEnd(i, end, no);
        const arr = toArray(evalExpr(rangeToSeq(f[2]), no), no);
        if (arr.length > MAX_FOR) throw { line: no, msg: `for: слишком много итераций (>${MAX_FOR})` };
        for (const item of arr) {
          local[f[1]] = item;
          const res = exec(i + 1, endIdx);
          if (res.sig === 'break') break;
          if (res.sig === 'continue') continue;
          if (res.sig && typeof res.sig === 'object') return res;
          last = res.last;
        }
        i = endIdx + 1;
        continue;
      }

      // --- while ---
      const w = text.match(WHILE_RE);
      if (w) {
        const endIdx = findEnd(i, end, no);
        let iter = 0;
        while (truthy(evalExpr(w[1], no), no)) {
          if (++iter > MAX_WHILE) throw { line: no, msg: `while: превышен лимит ${MAX_WHILE} итераций (бесконечный цикл?)` };
          const res = exec(i + 1, endIdx);
          if (res.sig === 'break') break;
          if (res.sig === 'continue') continue;
          if (res.sig && typeof res.sig === 'object') return res;
          last = res.last;
        }
        i = endIdx + 1;
        continue;
      }

      if (/^(end|else)$/i.test(text)) {
        throw { line: no, msg: `"${text}" без открывающей конструкции (if/for/while)` };
      }

      // --- выражение ---
      last = evalExpr(text, no);
      i++;
    }
    return { sig: null, last };
  };

  /** Найти парный end (и else для if) с учётом вложенности. */
  const blockEnd = (from: number, end: number, lineNo: number): number => {
    let depth = 0;
    for (let k = from + 1; k < end; k++) {
      const t = lines[k].text;
      if (IF_RE.test(t) || FOR_RE.test(t) || WHILE_RE.test(t)) depth++;
      else if (/^end$/i.test(t)) {
        if (depth === 0) return k;
        depth--;
      }
    }
    throw { line: lineNo, msg: 'Нет закрывающего "end" для конструкции' };
  };
  const findEnd = blockEnd;
  const findIfBounds = (from: number, end: number, lineNo: number): { elseIdx: number; endIdx: number } => {
    let depth = 0;
    let elseIdx = -1;
    for (let k = from + 1; k < end; k++) {
      const t = lines[k].text;
      if (IF_RE.test(t) || FOR_RE.test(t) || WHILE_RE.test(t)) depth++;
      else if (/^end$/i.test(t)) {
        if (depth === 0) return { elseIdx, endIdx: k };
        depth--;
      } else if (/^else$/i.test(t) && depth === 0) {
        elseIdx = k;
      }
    }
    throw { line: lineNo, msg: 'Нет закрывающего "end" для if' };
  };

  try {
    if (!lines.length) return { value: null, error: null, errorLine: null };
    const { sig, last } = exec(0, lines.length);
    const value = sig && typeof sig === 'object' ? sig.ret : last;
    return { value, error: null, errorLine: null };
  } catch (e) {
    const ce = e as { line?: number; msg?: string };
    if (ce && typeof ce.line === 'number') {
      return { value: null, error: `Строка ${ce.line}: ${ce.msg ?? 'ошибка'}`, errorLine: ce.line };
    }
    return { value: null, error: humanizeMathError(e), errorLine: null };
  }
}
