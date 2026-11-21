/**
 * Программные блоки.
 *
 * Синтаксис (по одной конструкции на строку, отступы — для читаемости):
 *   x := expr        локальное присваивание (также `x <- expr`)
 *   expr             выражение (значение запоминается; последнее = результат)
 *   return expr      вернуть значение досрочно
 *   assert cond      контракт: ошибка с номером строки, если условие ложно
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
  getCompiledPre,
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
} from './mathEngine';
import { isBigNumberLike, type Scope } from './core';
import type { EvalFunction } from 'mathjs';
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
/** Mathcad-программы пишут элементы массива как `A[i] := …` / `M[i,j] := …`. */
const INDEX_ASSIGN_RE = /^([A-Za-z_]\w*)\s*\[([^\]]+)\]\s*(:=|<-)\s*(.+)$/;
const FOR_RE = /^for\s+([A-Za-z_]\w*)\s+in\s+(.+)$/i;
const IF_RE = /^if\s+(.+)$/i;
const ELSE_IF_RE = /^else\s+if\s+(.+)$/i;
const WHILE_RE = /^while\s+(.+)$/i;
const RETURN_RE = /^return\b\s*(.*)$/i;
const ASSERT_RE = /^assert\s+(.+)$/i;
const TRACE_RE = /^trace\s+(.+)$/i;
const BREAKPOINT_RE = /^breakpoint$/i;

export interface ProgramAnalysis {
  dependencies: string[];
  assigned: string[];
}

/* ---------- кэш разбора программ (#7) ----------
 * analyzeProgram дёргается на каждый пересчёт для каждого program-блока
 * (fingerprint + выполнение). Ключ — исходник целиком; наружу отдаём копии.
 */
const ANALYSIS_CACHE_LIMIT = 500;
const analysisCache = new Map<string, ProgramAnalysis>();

function analysisPut(key: string, v: ProgramAnalysis): void {
  if (analysisCache.has(key)) analysisCache.delete(key);
  else if (analysisCache.size >= ANALYSIS_CACHE_LIMIT) {
    const oldest = analysisCache.keys().next();
    if (!oldest.done) analysisCache.delete(oldest.value);
  }
  analysisCache.set(key, v);
}

/** Только разбор: зависимости от глобалей (имена, не покрытые локальными присваиваниями).
 *  `skip` — параметры функции: они задаются вызовом, а не документом. */
export function analyzeProgram(src: string, skip?: ReadonlySet<string>): ProgramAnalysis {
  const skipKey = skip?.size ? `|skip:${[...skip].sort().join(',')}` : '';
  const hit = analysisCache.get(src + skipKey);
  if (hit) return { dependencies: hit.dependencies.slice(), assigned: hit.assigned.slice() };
  const out = analyzeProgramUncached(src, skip);
  analysisPut(src + skipKey, out);
  return { dependencies: out.dependencies.slice(), assigned: out.assigned.slice() };
}

function analyzeProgramUncached(src: string, skip?: ReadonlySet<string>): ProgramAnalysis {
  const lines = toLines(src).slice(0, MAX_LINES);
  const definitelyAssigned = new Set<string>();
  const allAssigned = new Set<string>();
  for (const l of lines) {
    const a = l.text.match(ASSIGN_RE) ?? l.text.match(INDEX_ASSIGN_RE);
    if (a) allAssigned.add(a[1]);
    const f = l.text.match(FOR_RE);
    if (f) allAssigned.add(f[1]);
  }
  const deps = new Set<string>();
  const partOf = (t: string): string => {
    const ia = t.match(INDEX_ASSIGN_RE);
    if (ia) return `${ia[2]}, ${stripOnError(ia[4])}`;
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
    const am = t.match(ASSERT_RE);
    if (am) return am[1];
    const tr = t.match(TRACE_RE);
    if (tr) return tr[1];
    if (BREAKPOINT_RE.test(t)) return '';
    if (/^(end|else(\s+if\b.*)?|break|continue)$/i.test(t)) return '';
    return stripOnError(t);
  };
  const frames: { kind: 'if' | 'loop'; parent: Set<string> }[] = [];
  for (const l of lines) {
    if (/^end$/i.test(l.text)) {
      const frame = frames.pop();
      if (frame) {
        definitelyAssigned.clear();
        for (const name of frame.parent) definitelyAssigned.add(name);
      }
      continue;
    }
    if (/^else(?:\s+if\b.*)?$/i.test(l.text)) {
      const frame = frames[frames.length - 1];
      if (frame?.kind === 'if') {
        definitelyAssigned.clear();
        for (const name of frame.parent) definitelyAssigned.add(name);
      }
    }
    const part = partOf(l.text);
    if (part) {
      for (const d of extractDependencies(part)) {
        if (!definitelyAssigned.has(d) && !skip?.has(d)) deps.add(d);
      }
    }
    const assignment = l.text.match(ASSIGN_RE) ?? l.text.match(INDEX_ASSIGN_RE);
    if (assignment) definitelyAssigned.add(assignment[1]);
    const loop = l.text.match(FOR_RE);
    if (loop) {
      frames.push({ kind: 'loop', parent: new Set(definitelyAssigned) });
      definitelyAssigned.add(loop[1]);
    } else if (IF_RE.test(l.text)) {
      frames.push({ kind: 'if', parent: new Set(definitelyAssigned) });
    } else if (WHILE_RE.test(l.text)) {
      frames.push({ kind: 'loop', parent: new Set(definitelyAssigned) });
    }
  }
  return { dependencies: [...deps], assigned: [...allAssigned] };
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

/** Неглубоко скопировать значение в обычный изменяемый массив (не трогаем аргумент функции). */
function toMutableArray(v: unknown): unknown[] {
  if (Array.isArray(v)) return v.map((x) => (Array.isArray(x) ? x.slice() : x));
  if (v !== null && typeof v === 'object' && 'toArray' in (v as object)) {
    const a = (v as { toArray: () => unknown }).toArray();
    return Array.isArray(a) ? a.map((x) => (Array.isArray(x) ? x.slice() : x)) : [];
  }
  return [];
}

/** Записать значение по индексам (1 или 2) в массив, создавая строки при необходимости.
 *  Индексы приходят из mathjs-выражений (1-based), внутренний массив — 0-based. */
function setIndexed(target: unknown[], indices: number[], value: unknown): void {
  if (!indices.length) return;
  const zero = indices.map((i) => i - 1);
  let cur = target;
  for (let k = 0; k < zero.length - 1; k++) {
    const idx = zero[k];
    if (!Array.isArray(cur[idx])) cur[idx] = [];
    cur = cur[idx] as unknown[];
  }
  cur[zero[zero.length - 1]] = value;
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
  // Единый мутабельный scope на весь прогон (#3): копия глобалей + локалы.
  // Раньше scopeOf() делал {...globals, ...local} на КАЖДОЕ вычисление —
  // в цикле на 100k итераций это 100k спредов + 100k parse внутри evaluate.
  const local: Scope = {};
  const scope: Scope = { ...globals };

  /** Предобработка без on-error/unit-разбора (для trace: часть считается целиком, как раньше). */
  interface PlainPrep {
    pre: string;
    code: EvalFunction | null;
  }
  const plainCache = new Map<string, PlainPrep>();
  const getPlain = (raw: string): PlainPrep => {
    const hit = plainCache.get(raw);
    if (hit) return hit;
    const pre = preprocessRanges(preprocessJ(raw, false));
    const p: PlainPrep = { pre, code: getCompiledPre(pre) };
    plainCache.set(raw, p);
    return p;
  };
  /** Предразбор выражения (#B): on-error/unit-границы + pre + код — один раз на текст. */
  interface ExprPrep {
    main: string;
    fallback: string | null;
    convLhs: string;
    convUnit: string | null;
    /** pre/код полной main-строки и отдельно convLhs (выбор — по факту резолва юнита, как раньше) */
    preMain: string;
    codeMain: EvalFunction | null;
    preConv: string;
    codeConv: EvalFunction | null;
    fbPre: string;
    fbCode: EvalFunction | null;
  }
  const prepCache = new Map<string, ExprPrep>();
  const getPrep = (expr: string): ExprPrep => {
    const hit = prepCache.get(expr);
    if (hit) return hit;
    // `expr on error fallback`: при ошибке main считаем fallback
    const [main, fallback] = splitOnError(expr);
    // перевод единиц `x := 10cm = m`
    const [convLhs, convUnit] = splitOffUnit(main.replace(/=+\s*$/, '').trim());
    const preMain = preprocessRanges(preprocessJ(main, false));
    const preConv = convUnit ? preprocessRanges(preprocessJ(convLhs, false)) : '';
    const fbPre = fallback ? preprocessRanges(preprocessJ(fallback, false)) : '';
    const p: ExprPrep = {
      main,
      fallback,
      convLhs,
      convUnit,
      preMain,
      codeMain: getCompiledPre(preMain),
      preConv,
      codeConv: convUnit ? getCompiledPre(preConv) : null,
      fbPre,
      fbCode: fallback ? getCompiledPre(fbPre) : null,
    };
    prepCache.set(expr, p);
    return p;
  };

  /**
   * Быстрое вычисление с кэшированной компиляцией (#1 + #4).
   * Экзотика (присваивания `=` внутри выражений) идёт медленным путём
   * math.evaluate в КОПИИ scope — как раньше (присваивание теряется).
   */
  const evalFast = (pre: string, code: EvalFunction | null): unknown => {
    if (code) return code.evaluate(scope);
    return math.evaluate(pre, { ...scope });
  };

  const evalExpr = (expr: string, lineNo: number): unknown => {
    const p = getPrep(expr);
    // цель перевода зависит от scope (переменная может держать Unit) — не кэшируем;
    // pre выбираем по факту резолва, как раньше (неизвестный юнит → вычисляем main целиком).
    const convTarget = p.convUnit ? resolveUnit(p.convUnit, scope) : null;
    const useConv = p.convUnit !== null && convTarget !== null;
    const pre = useConv ? p.preConv : p.preMain;
    const code = useConv ? p.codeConv : p.codeMain;
    try {
      const v = evalFast(pre, code);
      if (useConv) return convertToUnit(v, p.convUnit as string, p.main);
      return v;
    } catch (err) {
      if (p.fallback) {
        try {
          return evalFast(p.fbPre, p.fbCode);
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
    const parts = text
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    for (const p of parts) {
      let v: unknown = null;
      try {
        const gp = getPlain(p);
        v = gp.code ? gp.code.evaluate(scope) : math.evaluate(gp.pre, { ...scope });
      } catch {
        v = '<?>'; // hmm — локализация не нужна, технический маркер
      }
      traceLog.push(`${p} = ${formatResult(v)}`);
    }
  };

  const truthy = (v: unknown, lineNo: number): boolean => {
    if (typeof v === 'boolean') return v;
    if (typeof v === 'number') return v !== 0;
    if (isBigNumberLike(v)) return v.isFinite() && !v.isZero();
    if (v !== null && typeof v === 'object' && 're' in v && 'im' in v) {
      const c = v as { re: number; im: number };
      return c.re !== 0 || c.im !== 0;
    }
    throw { line: lineNo, msg: t('e.condLogic') };
  };

  const toArray = (v: unknown, lineNo: number): unknown[] => {
    if (typeof v === 'number' || isBigNumberLike(v)) {
      const value = typeof v === 'number' ? v : v.toNumber();
      const n = Math.floor(value);
      if (!isFinite(n) || n < 0 || n > MAX_FOR)
        throw { line: lineNo, msg: t('e.forNumber', { max: MAX_FOR }) };
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

      // --- присваивание элемента массива: A[i] := … / M[i,j] := … ---
      const ia = text.match(INDEX_ASSIGN_RE);
      if (ia) {
        // Mathcad-индексы целочисленные; Td/T в циклах даёт 0.999999… из-за
        // плавающей точки — округляем, иначе в массиве остаются дыры (null).
        const indices = ia[2]
          .split(',')
          .map((s) => Math.round(Number(evalExpr(s.trim(), no))))
          .filter((v) => Number.isFinite(v));
        const value = evalExpr(ia[4], no);
        const base = scope[ia[1]] ?? local[ia[1]];
        const arr = toMutableArray(base);
        setIndexed(arr, indices, value);
        local[ia[1]] = arr;
        scope[ia[1]] = arr;
        last = value;
        step('assign', no, text, value);
        i++;
        continue;
      }
      // --- присваивание ---
      const a = text.match(ASSIGN_RE);
      if (a) {
        last = evalExpr(a[3], no);
        local[a[1]] = last;
        scope[a[1]] = last;
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
      // --- assert: контракт, ложь = ошибка с номером строки ---
      const am = text.match(ASSERT_RE);
      if (am) {
        const ok = truthy(evalExpr(am[1], no), no);
        if (!ok) throw { line: no, msg: t('e.assertFail', { cond: am[1].slice(0, 80) }) };
        i++;
        continue;
      }
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
          scope[f[1]] = item;
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
  const findIfBounds = (
    from: number,
    end: number,
    lineNo: number,
  ): { elseIdx: number; endIdx: number } => {
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
      return {
        value: null,
        error: t('e.lineErr', { line: ce.line, msg: ce.msg ?? t('e.lineErrDefault') }),
        errorLine: ce.line,
        trace: traceLog.length ? [...traceLog] : null,
      };
    }
    return {
      value: null,
      error: humanizeMathError(e),
      errorLine: null,
      trace: traceLog.length ? [...traceLog] : null,
    };
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
