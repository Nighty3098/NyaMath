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
 *   breakpoint       точка останова для отладчика (на выполнение не влияет)
 *
 * Диапазоны: `1..10`, `0,0.5..2` (включительно). Читает глобалы документа,
 * пишет только в локалы; наружу уходит result (+ exportName на уровне стора).
 */
import {
  math,
  convertToUnit,
  extractDependencies,
  formatResult,
  humanizeMathError,
  preprocessJ,
  preprocessRanges,
  resolveUnit,
  splitOffUnit,
  splitOnError,
  stripOnError,
  type Scope,
} from './mathEngine';
import { t } from '../i18n';

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
const ELSE_IF_RE = /^else\s+if\s+(.+)$/i;
const WHILE_RE = /^while\s+(.+)$/i;
const RETURN_RE = /^return\b\s*(.*)$/i;
const TRACE_RE = /^trace\s+(.+)$/i;
const BREAKPOINT_RE = /^breakpoint$/i;

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
    if (a) return stripOnError(a[3]);
    const f = t.match(FOR_RE);
    if (f) return rangeToSeq(f[2]);
    const iff = t.match(IF_RE);
    if (iff) return iff[1];
    const eif = t.match(ELSE_IF_RE);
    if (eif) return eif[1];
    const w = t.match(WHILE_RE);
    if (w) return w[1];
    const r = t.match(RETURN_RE);
    if (r) return r[1];
    const tr = t.match(TRACE_RE);
    if (tr) return tr[1];
    if (BREAKPOINT_RE.test(t)) return '';
    if (/^(end|else(\s+if\b.*)?|break|continue)$/i.test(t)) return '';
    return stripOnError(t);
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
  /** Лог trace-операторов (до 50 записей) */
  trace?: string[] | null;
}

/** Один шаг отладчика: выполненный оператор + слепок локалов после него. */
export interface DebugStep {
  /** порядковый номер шага */
  n: number;
  line: number;
  text: string;
  kind: 'assign' | 'expr' | 'return' | 'breakpoint';
  value: string;
  locals: Record<string, string>;
}

export interface DebugResult {
  steps: DebugStep[];
  /** true, если шагов больше лимита и запись оборвана */
  truncated: boolean;
  error: string | null;
  errorLine: number | null;
}

type Signal = null | 'break' | 'continue' | { ret: unknown };

export function runProgram(
  src: string,
  globals: Scope,
  onStep?: (s: Omit<DebugStep, 'n'>) => void,
): ProgramResult {
  const lines = toLines(src);
  if (lines.length > MAX_LINES) {
    return { value: null, error: t('e.progTooLong', { n: MAX_LINES }), errorLine: null };
  }
  const local: Scope = {};
  const scopeOf = (): Scope => ({ ...globals, ...local });

  const evalExpr = (expr: string, lineNo: number): unknown => {
    // `expr on error fallback`: при ошибке main считаем fallback
    const [main, fallback] = splitOnError(expr);
    // перевод единиц `x := 10cm = m`
    const [convLhs, convUnit] = splitOffUnit(main.replace(/=+\s*$/, '').trim());
    const convTarget = convUnit ? resolveUnit(convUnit, scopeOf()) : null;
    const pre = preprocessRanges(preprocessJ(convTarget ? convLhs : main, false));
    try {
      const v = math.evaluate(pre, scopeOf());
      if (convUnit && convTarget) return convertToUnit(v, convUnit, main);
      return v;
    } catch (err) {
      if (fallback) {
        try {
          return math.evaluate(preprocessRanges(preprocessJ(fallback, false)), scopeOf());
        } catch (err2) {
          throw { line: lineNo, msg: humanizeMathError(err2) };
        }
      }
      throw { line: lineNo, msg: humanizeMathError(err) };
    }
  };

  const traceLog: string[] = [];
  const snapLocals = (): Record<string, string> => {
    const out: Record<string, string> = {};
    const keys = Object.keys(local).slice(0, 24);
    for (const k of keys) {
      try {
        out[k] = formatResult(local[k]);
      } catch {
        out[k] = '?';
      }
    }
    return out;
  };
  const step = (kind: DebugStep['kind'], lineNo: number, text: string, v: unknown): void => {
    if (!onStep) return;
    let value = '';
    try {
      value = formatResult(v);
    } catch {
      value = '?';
    }
    onStep({ line: lineNo, text, kind, value, locals: snapLocals() });
  };
  const doTrace = (text: string): void => {
    if (traceLog.length >= 50) return;
    const parts = text.split(',').map((s) => s.trim()).filter(Boolean);
    for (const p of parts) {
      let v: unknown = null;
      try {
        v = math.evaluate(preprocessRanges(preprocessJ(p, false)), scopeOf());
      } catch {
        v = '<?>'; // hmm — локализация не нужна, технический маркер
      }
      traceLog.push(`${p} = ${formatResult(v)}`);
    }
  };

  const truthy = (v: unknown, lineNo: number): boolean => {
    if (typeof v === 'boolean') return v;
    if (typeof v === 'number') return v !== 0;
    if (v !== null && typeof v === 'object' && 're' in v && 'im' in v) {
      const c = v as { re: number; im: number };
      return c.re !== 0 || c.im !== 0;
    }
    throw { line: lineNo, msg: t('e.condLogic') };
  };

  const toArray = (v: unknown, lineNo: number): unknown[] => {
    if (typeof v === 'number') {
      const n = Math.floor(v);
      if (!isFinite(n) || n < 0 || n > MAX_FOR) throw { line: lineNo, msg: t('e.forNumber', { max: MAX_FOR }) };
      return Array.from({ length: n }, (_, k) => k + 1);
    }
    if (math.isMatrix(v)) return (v as { toArray: () => unknown[] }).toArray().flat(Infinity);
    if (Array.isArray(v)) return v.flat(Infinity);
    throw { line: lineNo, msg: t('e.forExpect') };
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
        step('assign', no, text, last);
        i++;
        continue;
      }
      // --- return / break / continue / trace / breakpoint ---
      const r = text.match(RETURN_RE);
      if (r) {
        const v = r[1] ? evalExpr(r[1], no) : last;
        step('return', no, text, v);
        return { sig: { ret: v }, last: v };
      }
      if (/^break$/i.test(text)) return { sig: 'break', last };
      if (/^continue$/i.test(text)) return { sig: 'continue', last };
      if (BREAKPOINT_RE.test(text)) {
        step('breakpoint', no, text, last);
        i++;
        continue;
      }
      const tr = text.match(TRACE_RE);
      if (tr) {
        doTrace(tr[1]);
        i++;
        continue;
      }

      // --- if / else if-цепочка ---
      const iff = text.match(IF_RE);
      if (iff) {
        const { elseIdx, endIdx } = findIfBounds(i, end, no);
        if (truthy(evalExpr(iff[1], no), no)) {
          const res = exec(i + 1, elseIdx >= 0 ? elseIdx : endIdx);
          if (res.sig) return res;
          last = res.last;
        } else if (elseIdx >= 0) {
          // цепочка else if … else: идём по else-узлам на той же глубине
          let k = elseIdx;
          for (;;) {
            const lk = lines[k].text;
            const m2 = lk.match(ELSE_IF_RE);
            if (!m2) {
              // голый else
              const res = exec(k + 1, endIdx);
              if (res.sig) return res;
              last = res.last;
              break;
            }
            const b2 = findIfBounds(k, endIdx + 1, lines[k].no);
            const stop2 = b2.elseIdx >= 0 ? b2.elseIdx : b2.endIdx;
            if (truthy(evalExpr(m2[1], lines[k].no), lines[k].no)) {
              const res = exec(k + 1, stop2);
              if (res.sig) return res;
              last = res.last;
              break;
            }
            if (b2.elseIdx < 0) break;
            k = b2.elseIdx;
          }
        }
        i = endIdx + 1;
        continue;
      }

      // --- for ---
      const f = text.match(FOR_RE);
      if (f) {
        const endIdx = findEnd(i, end, no);
        const arr = toArray(evalExpr(rangeToSeq(f[2]), no), no);
        if (arr.length > MAX_FOR) throw { line: no, msg: t('e.forIters', { max: MAX_FOR }) };
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
          if (++iter > MAX_WHILE) throw { line: no, msg: t('e.whileLimit', { max: MAX_WHILE }) };
          const res = exec(i + 1, endIdx);
          if (res.sig === 'break') break;
          if (res.sig === 'continue') continue;
          if (res.sig && typeof res.sig === 'object') return res;
          last = res.last;
        }
        i = endIdx + 1;
        continue;
      }

      if (/^(end|else(\s+if\b.*)?)$/i.test(text)) {
        throw { line: no, msg: t('e.strayEnd', { text }) };
      }

      // --- выражение ---
      last = evalExpr(text, no);
      step('expr', no, text, last);
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
    throw { line: lineNo, msg: t('e.noEnd') };
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
      } else if (/^else(\s+if\b.*)?$/i.test(t) && depth === 0 && elseIdx < 0) {
        // только первый else-узел: дальше цепочку разбирает exec
        elseIdx = k;
      }
    }
    throw { line: lineNo, msg: t('e.noEndIf') };
  };

  try {
    if (!lines.length) return { value: null, error: null, errorLine: null };
    const { sig, last } = exec(0, lines.length);
    const value = sig && typeof sig === 'object' ? sig.ret : last;
    return { value, error: null, errorLine: null, trace: traceLog.length ? [...traceLog] : null };
  } catch (e) {
    const ce = e as { line?: number; msg?: string };
    if (ce && typeof ce.line === 'number') {
      return { value: null, error: t('e.lineErr', { line: ce.line, msg: ce.msg ?? t('e.lineErrDefault') }), errorLine: ce.line, trace: traceLog.length ? [...traceLog] : null };
    }
    return { value: null, error: humanizeMathError(e), errorLine: null, trace: traceLog.length ? [...traceLog] : null };
  }
}

const MAX_DEBUG_STEPS = 500;

/**
 * Пошаговое выполнение для отладчика: все выполненные операторы
 * (включая итерации циклов и ветки) со слепками локалов после каждого шага.
 * `breakpoint` в тексте помечается kind='breakpoint' — UI останавливается на нём.
 */
export function debugProgram(src: string, globals: Scope, maxSteps = MAX_DEBUG_STEPS): DebugResult {
  const steps: DebugStep[] = [];
  let truncated = false;
  let n = 0;
  const r = runProgram(src, globals, (s) => {
    if (n >= maxSteps) {
      truncated = true;
      return;
    }
    n++;
    steps.push({ n, ...s });
  });
  return { steps, truncated, error: r.error, errorLine: r.errorLine };
}
