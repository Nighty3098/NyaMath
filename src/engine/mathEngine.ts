/**
 * NyaMath Math Engine — кастомный evaluator на базе mathjs.
 *
 * Поддерживает синтаксис листа:
 *  - `a := expr`        — определение переменной / функции `f(x) := ...`
 *  - `expr =` / `x =`   — вывод результата ( trailing `=` )
 *  - `j` как мнимая единица (алиас `i`), включая `3+4j`, `4*j`
 *  - константы pi, e; функции sqrt/sin/cos/atan/Re/Im/abs/log/ln
 *  - порядок вычислений строго сверху-вниз по Y (см. dependencies.ts)
 */
import { create, all, type EvalFunction, type MathJsInstance, type Unit } from 'mathjs';
import { buildPackScope, PACK_NAMES } from './packs';

import { t } from '../i18n';

export const math: MathJsInstance = create(all, {});

// rawArgs-решатели паков: mathjs решает raw/eager на этапе компиляции
// по math-namespace, поэтому импортируем их туда явно (флаг rawArgs сохраняется).
// Поштучно и в try/catch: часть имён (напр. grad) зарезервирована внутри mathjs —
// тогда остаётся scope-версия из createBaseScope (у неё приоритет при вычислении).
{
  const packScope = buildPackScope(math) as Record<string, unknown>;
  for (const k of [
    'nlsolve', 'find', 'minerr', 'minimize', 'maximize', 'root', 'bvp',
    'ndiff', 'nint', 'nsum', 'nprod', 'numdiff', 'numint', 'numsum', 'numprod',
    'taylor', 'limit', 'numgrad', 'uMC',
  ]) {
    try {
      math.import({ [k]: packScope[k] } as never, { override: false });
    } catch {
      /* уже есть в mathjs — используем scope-версию */
    }
  }
}

// --- Кастомные функции / короткие алиасы ---
// mathjs из коробки: sin cos tan asin acos atan sqrt abs exp re im conj arg ...
// Добавляем регистронезависимые Re/Im, инженерный ln/log.
math.import(
  {
    // Re(z), Im(z) — вещественная / мнимая часть
    Re: (x: unknown) => (math as unknown as { re: (v: unknown) => unknown }).re(x),
    Im: (x: unknown) => (math as unknown as { im: (v: unknown) => unknown }).im(x),
    // ln(x) — натуральный логарифм
    ln: (x: number) => Math.log(Number(x)),
    // log(x) / log(x, base) — если один аргумент, то десятичный (инженерный);
    // с двумя — по основанию base. Перегружаем поверх mathjs.
    log10_: (x: number) => Math.log10(Number(x)),
  },
  { override: false },
);

// Переопределяем log через import с override, чтобы работало внутри evaluate():
// log(x) = lg (инженерный), log(x, base) — по основанию base.
math.import(
  {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    log: (x: any, base?: any) => {
      const v = Number(x);
      if (base === undefined) return Math.log10(v);
      return Math.log(v) / Math.log(Number(base));
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ln: (x: any) => Math.log(Number(x)),
    log10: (x: number) => Math.log10(Number(x)),
  },
  { override: true },
);

export type Scope = Record<string, unknown>;

/* ---------- LRU-кэши горячего пути (#4) ----------
 * parse / compile / deps / LaTeX одной и той же строки повторяются на каждый
 * пересчёт (печать, слайдер, ресемплинг). Кэшируем по строке с обрезкой размера.
 * Значения немутабельны для вызывающего кода: массивы отдаём копией,
 * EvalFunction делит только код (scope передаётся в evaluate).
 */
const CACHE_LIMIT = 2000;

function lruSet<K, V>(m: Map<K, V>, k: K, v: V): void {
  if (m.has(k)) m.delete(k);
  else if (m.size >= CACHE_LIMIT) {
    const oldest = m.keys().next();
    if (!oldest.done) m.delete(oldest.value);
  }
  m.set(k, v);
}

const compiledPreCache = new Map<string, EvalFunction | null>();
const plotExprCache = new Map<string, CompiledPlotExpr | null>();
const depsCache = new Map<string, string[]>();
const latexCache = new Map<string, string>();

/**
 * Скомпилировать ПРЕДОБРАБОТАННОЕ выражение с кэшем.
 * null — не парсится или содержит присваивания (для таких вызывающий код
 * использует медленный путь math.evaluate, семантика не меняется).
 */
export function getCompiledPre(pre: string): EvalFunction | null {
  const hit = compiledPreCache.get(pre);
  if (hit !== undefined) return hit;
  let out: EvalFunction | null = null;
  try {
    const node = math.parse(pre);
    let assign = false;
    try {
      node.traverse((n: unknown) => {
        if ((n as { isAssignmentNode?: boolean }).isAssignmentNode) assign = true;
      });
    } catch {
      out = null;
      lruSet(compiledPreCache, pre, out);
      return out;
    }
    out = assign ? null : node.compile();
  } catch {
    out = null;
  }
  lruSet(compiledPreCache, pre, out);
  return out;
}

/** Сырое выражение → препроцессинг (j, диапазоны) + кэшированная компиляция. */
export function compileRawExpr(raw: string): EvalFunction | null {
  return getCompiledPre(preprocessRanges(preprocessJ(raw, false)));
}

/** Диапазоны стиля листа: `a..b` и `a,step..b` → seq(a,b,step). Только числовые литералы. */
export function preprocessRanges(expr: string): string {
  return expr
    .replace(
      /(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\.\.\s*(-?\d+(?:\.\d+)?)/g,
      'seq($1,$3,$2)',
    )
    .replace(/(-?\d+(?:\.\d+)?)\s*\.\.\s*(-?\d+(?:\.\d+)?)/g, 'seq($1,$2)');
}

export interface CompiledPlotExpr {
  code: EvalFunction;
  /** свободные переменные выражения */
  freeVars: string[];
}

/**
 * Однократная компиляция выражения для сэмплинга графиков.
 * Старый путь (parse+compile на каждую точку) в ~68 раз медленнее замера;
 * точки гоняем через один scope-объект. null — не парсится или содержит
 * присваивания (для них точечная подстановка неприменима).
 * Предобработку (preprocessJ/preprocessRanges) делает вызывающий код.
 */
export function compilePlotExpr(pre: string): CompiledPlotExpr | null {
  const hit = plotExprCache.get(pre);
  if (hit !== undefined) return hit;
  let out: CompiledPlotExpr | null;
  let node;
  try {
    node = math.parse(pre);
  } catch {
    out = null;
    lruSet(plotExprCache, pre, out);
    return out;
  }
  const free = new Set<string>();
  let assign = false;
  try {
    node.traverse((n: unknown) => {
      const nn = n as { isSymbolNode?: boolean; isAssignmentNode?: boolean; name?: string };
      if (nn.isAssignmentNode) assign = true;
      else if (nn.isSymbolNode && nn.name) free.add(String(nn.name));
    });
    if (assign) out = null;
    else out = { code: node.compile(), freeVars: [...free] };
  } catch {
    out = null;
  }
  lruSet(plotExprCache, pre, out);
  return out;
}

/** Базовый scope: j/i, константы физики и функции паков (статистика, телеком, ...). */
export function createBaseScope(): Scope {
  return {
    // Мнимая единица под двумя именами
    i: math.complex(0, 1),
    j: math.complex(0, 1),
    ...buildPackScope(math),
  };
}

export interface ParsedLine {
  kind: 'assign' | 'output' | 'eval';
  /** имя переменной или сигнатура функции `f(x,y)` для assign */
  lhs: string;
  /** выражение справа (или всё выражение для eval/output) */
  expr: string;
  /** имя определяемой переменной (без параметров), null если функция/вывод */
  definedVar: string | null;
  /** параметры функции, если lhs вида f(x) */
  fnParams: string[];
  isFunctionDef: boolean;
  /** строка кончается на `=`: `delta := atan(x) =` — определить И показать результат */
  show: boolean;
}

/**
 * Предобработка: поддержка `4j`, `3 + 4j`, `j` как мнимой единицы.
 * Аккуратно: не трогаем идентификаторы, содержащие j (например `ej`, `zeta_eq`).
 *  - `(\d)j\b` -> `$1*i`
 *  - отдельный токен `j` -> `i`, КРОМЕ lhs присваивания `j := ...`
 */
export function preprocessJ(input: string, lhsIsJ: boolean): string {
  let s = input;
  // 3j, 4 j, (2)j — число непосредственно перед j
  s = s.replace(/(\d)\s*j\b/g, '$1*i');
  if (!lhsIsJ) {
    s = s.replace(/\bj\b/g, 'i');
  } else {
    // защищаем lhs: временно заменяем первое вхождение `j :=` на маркер
    // проще: заменяем j->i только после `:=` и в eval-части
    const idx = s.indexOf(':=');
    if (idx >= 0) {
      const head = s.slice(0, idx);
      const tail = s.slice(idx).replace(/\bj\b/g, 'i');
      s = head + tail;
    } else {
      s = s.replace(/\bj\b/g, 'i');
    }
  }
  return s;
}

const FN_DEF_RE = /^([A-Za-z_]\w*)\s*\(([^)]*)\)$/;

/**
 * Разбить `expr on error fallback` на [main, fallback] (null если нет).
 * Ищет `on error` на нулевой глубине скобок и вне строк.
 */
export function splitOnError(text: string): [string, string | null] {
  let depth = 0;
  let instr: string | null = null;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (instr) {
      if (c === instr) instr = null;
      else if (c === '\\') i++;
      continue;
    }
    if (c === '"' || c === "'") {
      instr = c;
      continue;
    }
    if (c === '(' || c === '[' || c === '{') depth++;
    else if (c === ')' || c === ']' || c === '}') depth = Math.max(0, depth - 1);
    else if (depth === 0 && (c === 'o' || c === 'O')) {
      const m = text.slice(i).match(/^on\s+error\b/i);
      if (m && (i === 0 || /[\s(=,;+\-*/^<>!]/.test(text[i - 1]))) {
        const main = text.slice(0, i).trim();
        const fb = text.slice(i + m[0].length).trim();
        if (main && fb) return [main, fb];
        return [text, null];
      }
    }
  }
  return [text, null];
}

/** Убрать `on error ...` для анализа зависимостей. */
export function stripOnError(text: string): string {
  return splitOnError(text)[0];
}

/**
 * Правая часть, похожая на единицу измерения: `cm`, `m/s`, `kg*m/s^2`, `degC`.
 * Без `+`/`-` (чтобы `x = 2+2` не путать с переводом) и без сравнений.
 */
const UNIT_RHS_RE = /^[A-Za-z_µΩ°][A-Za-z_0-9µΩ°\s.*/()^*]*$/;

/**
 * Отщепить суффикс перевода единиц `expr = unit` (стиль: `L = cm`,
 * `g := 10cm = m`). Возвращает [lhs, unit] или [text, null].
 * Чисто синтаксический разбор: `==`, `<=`, `>=`, `!=`, `:=` переводом не считаются.
 */
export function splitOffUnit(text: string): [string, string | null] {
  let depth = 0;
  let instr: string | null = null;
  let eqPos = -1;
  let eqCount = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (instr) {
      if (c === instr) instr = null;
      else if (c === '\\') i++;
      continue;
    }
    if (c === '"' || c === "'") {
      instr = c;
      continue;
    }
    if (c === '(' || c === '[' || c === '{') depth++;
    else if (c === ')' || c === ']' || c === '}') depth = Math.max(0, depth - 1);
    else if (c === '=' && depth === 0) {
      const prev = text[i - 1];
      const next = text[i + 1];
      // `:=`, `==`, `<=`, `>=`, `!=` — не перевод
      if (prev === ':' || prev === '=' || prev === '!' || prev === '<' || prev === '>' || next === '=') {
        return [text, null];
      }
      eqPos = i;
      eqCount++;
    }
  }
  if (eqCount !== 1 || eqPos < 0) return [text, null];
  const lhs = text.slice(0, eqPos).trim();
  const rhs = text.slice(eqPos + 1).trim();
  if (!lhs || !rhs || !UNIT_RHS_RE.test(rhs)) return [text, null];
  return [lhs, rhs];
}

/**
 * Распознать единицу: сначала значение-переменная из scope (если это Unit),
 * иначе разбор строкой через mathjs (`cm`, `m/s`, `kWh`, `degC`, `lbf`, ...).
 */
export function resolveUnit(rhs: string, scope: Scope): Unit | null {
  const t = rhs.trim();
  if (/^[A-Za-z_]\w*$/.test(t)) {
    const v = (scope as Record<string, unknown>)[t];
    if (v !== null && typeof v === 'object' && math.isUnit(v)) return v as Unit;
  }
  try {
    return math.unit(t);
  } catch {
    return null;
  }
}

/** Привести значение к единице: Unit → .to(), число → math.unit(n, unit). */
export function convertToUnit(value: unknown, unitStr: string, exprSlice: string): Unit {
  if (value !== null && typeof value === 'object' && math.isUnit(value)) {
    return (value as Unit).to(unitStr);
  }
  if (typeof value === 'number' && isFinite(value)) {
    return math.unit(value, unitStr);
  }
  throw new Error(t('e.unitConvert', { q: exprSlice.slice(0, 40), u: unitStr }));
}

/** Разобрать одну строку. Многострочный ввод бьётся вызывающим кодом. */
export function parseLine(rawInput: string): ParsedLine {
  const trimmed = rawInput.trim();
  if (trimmed.includes(':=')) {
    const idx = trimmed.indexOf(':=');
    const lhs = trimmed.slice(0, idx).trim();
    const expr = trimmed.slice(idx + 2).trim();
    // висячее `=` в конце: `delta := atan(x) =` — определить и показать
    const show = /=+\s*$/.test(expr);
    const m = lhs.match(FN_DEF_RE);
    if (m) {
      const params = m[2]
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      return { kind: 'assign', lhs, expr, definedVar: m[1], fnParams: params, isFunctionDef: true, show };
    }
    return { kind: 'assign', lhs, expr, definedVar: lhs, fnParams: [], isFunctionDef: false, show };
  }
  // `... =` — запрос на вывод. Обрезаем все висящие `=` справа.
  if (trimmed.includes('=')) {
    // убеждаемся, что это не `==`, `<=`, `>=`, `!=`
    const withoutTrailing = trimmed.replace(/=+\s*$/, '').trim();
    // если после обрезки остался `=` внутри (напр. `x = 2+2`), берём левую часть как запрос?
    // Семантика: `x =` показывает x. `2+2 =` показывает 6.
    // Значит вычисляем именно левую часть до первого `=`.
    const firstEq = withoutTrailing.indexOf('=');
    const expr = firstEq >= 0 ? withoutTrailing.slice(0, firstEq).trim() || withoutTrailing : withoutTrailing;
    // особый случай `x = 2+2` (полное равенство с RHS): если справа что-то было — вычисляем RHS?
    // Для простоты: если исходник вида `name = <expr>` и name — валидный идентификатор,
    // а справа непусто — трактуем как eval всего RHS и НЕ присваиваем (чистый вывод).
    const origEqIdx = trimmed.indexOf('=');
    const rhs = trimmed.slice(origEqIdx + 1).replace(/=+\s*$/, '').trim();
    if (/^[A-Za-z_]\w*$/.test(withoutTrailing.split('=')[0]?.trim() ?? '') && rhs !== '') {
      return { kind: 'output', lhs: '', expr: rhs, definedVar: null, fnParams: [], isFunctionDef: false, show: true };
    }
    return { kind: 'output', lhs: '', expr: expr || withoutTrailing, definedVar: null, fnParams: [], isFunctionDef: false, show: true };
  }
  return { kind: 'eval', lhs: '', expr: trimmed, definedVar: null, fnParams: [], isFunctionDef: false, show: false };
}

/** Имена встроенных символов, которые НЕ считаются зависимостями. */
const BUILTINS = new Set([
  'sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'atan2', 'sinh', 'cosh', 'tanh',
  'sqrt', 'cbrt', 'abs', 'exp', 'log', 'ln', 'log10', 'log10_', 're', 'im',
  'Re', 'Im', 'conj', 'arg', 'round', 'floor', 'ceil', 'sign', 'min', 'max',
  'sum', 'prod', 'mean', 'median', 'mode', 'std', 'var', 'quantileSeq', 'cumsum',
  'det', 'inv', 'transpose', 'identity', 'concat', 'flatten', 'sort', 'filter',
  'zeros', 'ones', 'eye', 'size', 'length', 'pi', 'e', 'i', 'j', 'true', 'false',
  'null', 'Complex', 'Matrix', 'pi_', 'range', 'round', 'clone', 'to', 'in',
  'convertTo', 'inUnits', 'hasUnit',
  'uMean', 'nuMean', 'uRect', 'uTri', 'uNorm', 'uUshape', 'uComb', 'nuEff',
  'normQuant', 'tStud', 'kCov', 'uExpand', 'uncRound', 'resRound',
  'confEps', 'thetaComb', 'deltaComb', 'pmgSumAbs', 'pmgRSS', 'pmgExpand',
  'repLim', 'uTopDown', 'prec5725',
  'expand', 'sfactor', 'sint', 'simplify', 'sderiv',
  'find', 'numdiff', 'numint', 'numsum', 'numprod',
  ...PACK_NAMES,
]);

/** Извлечь зависимости (имена переменных) из выражения через AST mathjs. */
export function extractDependencies(expr: string, fnParams: string[] = []): string[] {
  const key = fnParams.length ? `${expr}\x00${fnParams.join(',')}` : expr;
  const hit = depsCache.get(key);
  if (hit !== undefined) return hit.slice();
  const deps = extractDependenciesUncached(expr, fnParams);
  lruSet(depsCache, key, deps);
  return deps.slice();
}

function extractDependenciesUncached(expr: string, fnParams: string[] = []): string[] {
  const deps = new Set<string>();
  let node;
  try {
    // висячее `=` показа (`x := 5 =`) — не часть выражения
    const clean = expr.replace(/=+\s*$/, '').trim();
    node = math.parse(preprocessRanges(preprocessJ(clean || expr, false)));
  } catch {
    return [];
  }
  const excluded = new Set([...BUILTINS, ...fnParams]);
  node.traverse((n: unknown) => {
    const nn = n as { isSymbolNode?: boolean; isFunctionNode?: boolean; name?: string; fn?: unknown };
    if (nn.isSymbolNode) {
      const name = String(nn.name ?? '');
      if (name && !excluded.has(name)) deps.add(name);
    } else if (nn.isFunctionNode) {
      const f = nn.fn as { name?: string } | string | undefined;
      const fname = typeof f === 'string' ? f : f?.name;
      if (fname && !excluded.has(fname)) deps.add(fname);
    }
  });
  // имена функций (sin и т.п.) уже исключены; но вызов f(x) где f — пользовательская — остаётся
  return [...deps];
}

/** Проверить, валидно ли имя переменной. */
export function isValidVarName(name: string): boolean {
  return /^[A-Za-z_]\w*$/.test(name);
}

export interface EvalResult {
  value: unknown;
  error: string | null;
}

/** Вычислить одну строку в заданном scope (scope мутируется при `:=`). */
export function evaluateLine(rawInput: string, scope: Scope): EvalResult {
  const input = rawInput.trim();
  if (input === '' || input.startsWith('//') || input.startsWith('#')) {
    return { value: null, error: null };
  }
  // `expr on error fallback`: при ошибке main считаем fallback
  const [main, fallback] = splitOnError(input);
  const r = evaluateMain(main, scope);
  if (r.error && fallback) return evaluateLine(fallback, scope);
  return r;
}

/** Вычислить предобработанное выражение (#C): кэшированная компиляция,
 * fallback — math.evaluate (присваивания внутри, новые юниты после defunit). */
function evalPre(pre: string, scope: Scope): unknown {
  const code = getCompiledPre(pre);
  if (code) return code.evaluate(scope);
  return math.evaluate(pre, scope);
}

/** Собственно вычисление строки без on-error (fallback — через evaluateLine). */
function evaluateMain(input: string, scope: Scope): EvalResult {
  try {
    const parsed = parseLine(input);
    const lhsIsJ = parsed.kind === 'assign' && parsed.lhs.trim() === 'j';
    const pre = preprocessJ(input, lhsIsJ);

    if (parsed.kind === 'assign') {
      // висячее `=` (`x := 5 =`) — только флаг показа, в вычислении не участвует
      const rhsClean = parsed.expr.replace(/=+\s*$/, '').trim();
      if (rhsClean === '') {
        return { value: null, error: t('e.emptyRight') };
      }
      if (parsed.isFunctionDef) {
        // f(x) := body  ->  f(x) = body для mathjs
        const mathExpr = `${parsed.lhs} = ${preprocessRanges(preprocessJ(rhsClean, false))}`;
        math.evaluate(mathExpr, scope);
        // значение функции — сама функция
        return { value: scope[parsed.definedVar as string] ?? null, error: null };
      }
      if (!isValidVarName(parsed.lhs)) {
        return { value: null, error: t('e.badVar', { name: parsed.lhs }) };
      }
      if (parsed.lhs === 'i') {
        return { value: null, error: t('e.constI') };
      }
      const rhsPre = preprocessRanges(preprocessJ(rhsClean, false));
      // суффикс перевода `g := 10cm = m`: значение приводим к единице
      const [convLhs, convUnit] = splitOffUnit(rhsClean);
      const convTarget = convUnit ? resolveUnit(convUnit, scope) : null;
      let value: unknown;
      if (convUnit && convTarget) {
        const inner = evalPre(preprocessRanges(preprocessJ(convLhs, false)), scope);
        value = convertToUnit(inner, convUnit, rhsClean);
      } else {
        value = evalPre(rhsPre, scope);
      }
      // math.evaluate с присваиванием `x = ...` внутри уже кладёт в scope,
      // но у нас `:=` — делаем вручную для надёжности:
      scope[parsed.lhs] = value;      // особый случай `j := sqrt(-1)` — синхронизируем i
      if (parsed.lhs === 'j') {
        scope['i'] = value;
      }
      void pre;
      return { value, error: null };
    }
    // output / eval
    // суффикс перевода `L = cm`: показать значение в заданной единице
    // (разбираем исходную строку — parseLine уже отрезал бы RHS)
    const noShow = input.replace(/=+\s*$/, '').trim();
    const [outLhs, outUnit] = splitOffUnit(noShow);
    const outTarget = outUnit && !noShow.includes(':=') ? resolveUnit(outUnit, scope) : null;
    if (outUnit && outTarget) {
      const inner = evalPre(preprocessRanges(preprocessJ(outLhs, false)), scope);
      return { value: convertToUnit(inner, outUnit, noShow), error: null };
    }
    const exprPre = preprocessRanges(preprocessJ(parsed.expr, false));
    if (exprPre === '') return { value: null, error: null };
    const value = evalPre(exprPre, scope);
    return { value, error: null };
  } catch (err) {
    return { value: null, error: humanizeMathError(err) };
  }
}

/** Человекочитаемые сообщения об ошибках mathjs (локализованы через i18n). */
export function humanizeMathError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (/Undefined symbol/i.test(msg)) {
    const m = msg.match(/Undefined symbol\s+(\S+)/i);
    return m ? t('e.undefVar', { name: m[1] }) : t('e.undef');
  }
  if (/Division by zero/i.test(msg)) return t('e.divZero');
  if (/Units do not match/i.test(msg)) return t('e.unitsMismatch', { msg: msg.slice(0, 160) });
  if (/Cannot convert|Unexpected|Value expected|Parenthesis|Syntax/i.test(msg)) return t('e.syntax', { msg });
  if (/cyclic|recursion|stack/i.test(msg)) return t('e.cyclic');
  return msg.slice(0, 220);
}

/** Форматирование результата для отображения (числа, комплексные, матрицы). */
export function formatResult(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'function') return t('e.funcDefined');
  try {
    // mathjs Complex
    if (math.isComplex(value)) {
      const c = value as { re: number; im: number };
      return formatComplex(c.re, c.im);
    }
    if (typeof value === 'number') {
      if (!isFinite(value)) return String(value);
      return formatNumber(value);
    }
    if (typeof value === 'boolean') return value ? 'true' : 'false';
    if (typeof value === 'string') return value;
    // Единицы измерения: «5.3 m», «44.48 N» — с разумной точностью
    if (math.isUnit(value)) {
      try {
        return math.format(value, { precision: 6 });
      } catch {
        return String(value);
      }
    }
    // Matrix / Array
    if (math.isMatrix(value)) {
      const arr = (value as { toArray: () => unknown }).toArray();
      return JSON.stringify(arr, (_, v) => (typeof v === 'number' ? Number(v.toPrecision(6)) : v));
    }
    if (Array.isArray(value)) {
      return JSON.stringify(value.map((v) => (math.isComplex(v) ? formatResult(v) : v)));
    }
    if (typeof value === 'object' && value !== null && 're' in value && 'im' in value) {
      const c = value as { re: number; im: number };
      return formatComplex(Number(c.re), Number(c.im));
    }
    return math.format(value as never, { precision: 6 });
  } catch {
    return String(value);
  }
}

function formatNumber(n: number): string {
  if (n === 0) return '0';
  const abs = Math.abs(n);
  if ((abs >= 1e-3 && abs < 1e6) || n === 0) {
    // убираем мусор float: 0.1+0.2
    const s = Number(n.toPrecision(10)).toString();
    return s;
  }
  return n.toExponential(5).replace('e+', '·10^').replace('e', '·10^');
}

function formatComplex(re: number, im: number): string {
  const r = Math.abs(re) < 1e-12 ? 0 : re;
  const imA = Math.abs(im) < 1e-12 ? 0 : im;
  if (imA === 0) return formatNumber(r);
  if (r === 0) return `${formatNumber(imA)}·j`;
  const sign = imA >= 0 ? '+' : '−';
  return `${formatNumber(r)} ${sign} ${formatNumber(Math.abs(imA))}·j`;
}

/** Сгенерировать LaTeX для отображения через KaTeX (mathjs toTex + инженерные замены). */
export function toLatex(rawInput: string): string {
  const key = rawInput.trim();
  if (!key) return '';
  const hit = latexCache.get(key);
  if (hit !== undefined) return hit;
  const out = toLatexUncached(key);
  lruSet(latexCache, key, out);
  return out;
}

function toLatexUncached(input: string): string {
  // Комментарии и обычный текст (включая кириллицу) — НЕ математика:
  // оборачиваем в \text, иначе KaTeX ругается unicodeTextInMathMode.
  if (input.startsWith('//') || input.startsWith('#') || /[А-Яа-яЁё]/.test(input)) {
    const text = input.replace(/^(\/\/|#)\s?/, '').slice(0, 200);
    return `\\text{${escapeLatex(text)}}`;
  }
  try {
    // перевод единиц `L = cm`, `g := 10cm = m`: единицу — прямым текстом
    const noShowL = input.replace(/=+\s*$/, '').trim();
    const [texLhs, texUnit] = splitOffUnit(noShowL);
    if (texUnit) {
      const unitTex = `\\mathrm{${escapeLatex(texUnit)}}`;
      if (texLhs.includes(':=')) {
        const idx = texLhs.indexOf(':=');
        const l = texLhs.slice(0, idx).trim();
        const r = texLhs.slice(idx + 2).trim();
        const showT = /=+\s*$/.test(input);
        return `${safeTex(l)} := ${safeTex(preprocessJ(r, false))} = ${unitTex}${showT ? ' =' : ''}`;
      }
      return `${safeTex(preprocessJ(texLhs, false))} = ${unitTex}`;
    }
    if (input.includes(':=')) {
      const idx = input.indexOf(':=');
      const lhs = input.slice(0, idx).trim();
      const rhs = input.slice(idx + 2).trim();
      // `delta := atan(x) =` — висячее `=` показываем, но в формулу не парсим
      const showT = /=+\s*$/.test(rhs);
      const rhsClean = rhs.replace(/=+\s*$/, '').trim();
      const texL = safeTex(lhs);
      const texR = safeTex(preprocessJ(rhsClean, false));
      return `${texL} := ${texR}${showT ? ' =' : ''}`;
    }
    if (/=\s*$/.test(input)) {
      const expr = input.replace(/=+\s*$/, '').trim();
      return `${safeTex(preprocessJ(expr, false))} =`;
    }
    return safeTex(preprocessJ(input, false));
  } catch {
    return `\\text{${escapeLatex(input.slice(0, 200))}}`;
  }
}

/** Греческие имена → буквы (показывает α вместо alpha). */
const GREEK_TEX: Record<string, string> = {
  alpha: '\\alpha', beta: '\\beta', gamma: '\\gamma', delta: '\\delta',
  epsilon: '\\epsilon', zeta: '\\zeta', eta: '\\eta', theta: '\\theta',
  iota: '\\iota', kappa: '\\kappa', lambda: '\\lambda', mu: '\\mu',
  nu: '\\nu', xi: '\\xi', pi: '\\pi', rho: '\\rho', sigma: '\\sigma',
  tau: '\\tau', upsilon: '\\upsilon', phi: '\\phi', chi: '\\chi',
  psi: '\\psi', omega: '\\omega',
  Alpha: '\\Alpha', Beta: '\\Beta', Gamma: '\\Gamma', Delta: '\\Delta',
  Epsilon: '\\Epsilon', Zeta: '\\Zeta', Eta: '\\Eta', Theta: '\\Theta',
  Iota: '\\Iota', Kappa: '\\Kappa', Lambda: '\\Lambda', Mu: '\\Mu',
  Nu: '\\Nu', Xi: '\\Xi', Pi: '\\Pi', Rho: '\\Rho', Sigma: '\\Sigma',
  Tau: '\\Tau', Upsilon: '\\Upsilon', Phi: '\\Phi', Chi: '\\Chi',
  Psi: '\\Psi', Omega: '\\Omega',
  // короткие алиасы из конспектов и кода
  eps: '\\epsilon', Eps: '\\Epsilon',
};

/** Отдельное греческое слово: eps → \epsilon (не трогаем \epsilon, eps_r, eps2). */
const GREEK_WORD_RE = new RegExp(
  `(?<![A-Za-z\\\\])(${Object.keys(GREEK_TEX).sort((a, b) => b.length - a.length).join('|')})(?![A-Za-z0-9_])`,
  'g',
);
/** lambda0 → \lambda_{0}: греческое имя + цифровой хвост, без подчёркивания. */
const GREEK_SUFFIX_RE = new RegExp(
  `(?<![A-Za-z\\\\])(${Object.keys(GREEK_TEX).sort((a, b) => b.length - a.length).join('|')})([0-9]+)(?![A-Za-z0-9])`,
  'g',
);

/** numsum("тело", "k", низ, верх) целиком — знак Σ с пределами. */
const NUMSUM_RE = /^numsum\(\s*"((?:[^"\\]|\\.)*)"\s*,\s*"([A-Za-z][A-Za-z0-9]*)"\s*,\s*(.+?)\s*,\s*(.+?)\s*\)$/;

/** Первый строковый аргумент численных функций — тело выражения: рисуем
 * настоящей математикой, а не печатным \mathtt (иначе ^2 там плоское). */
const MATH_STR_FUNCS = [
  'limit', 'numint', 'numdiff', 'numprod', 'root', 'taylor',
  'sderiv', 'sint', 'expand', 'sfactor', 'bvp', 'minimize', 'find', 'numgrad',
];
const MATH_STR_ARG_RE = new RegExp(
  `\\\\mathrm\\{(${MATH_STR_FUNCS.join('|')})\\}\\\\left\\(\\\\mathtt\\{"((?:[^"\\\\]|\\\\.)*)"\\}`,
);

function sigmaTex(expr: string): string | null {
  const m = expr.trim().match(NUMSUM_RE);
  if (!m) return null;
  const [, body, v, lo, hi] = m;
  return `\\sum_{${v}=${safeTex(lo.trim())}}^{${safeTex(hi.trim())}}{${safeTex(body.replace(/\\"/g, '"'))}}`;
}

/** numint("тело", "x", a, b) целиком — знак ∫ с пределами. */
const NUMINT_RE = /^numint\(\s*"((?:[^"\\]|\\.)*)"\s*,\s*"([A-Za-z][A-Za-z0-9]*)"\s*,\s*(.+?)\s*,\s*(.+?)\s*\)$/;

function intTex(expr: string): string | null {
  const m = expr.trim().match(NUMINT_RE);
  if (!m) return null;
  const [, body, v, lo, hi] = m;
  return `\\int_{${safeTex(lo.trim()).trim()}}^{${safeTex(hi.trim()).trim()}}{${safeTex(body.replace(/\\"/g, '"'))}}\\,d${v}`;
}

/** limit("тело", "x", a[, dir]) целиком — lim с переходом. */
const LIMIT_RE = /^limit\(\s*"((?:[^"\\]|\\.)*)"\s*,\s*"([A-Za-z][A-Za-z0-9]*)"\s*,\s*(.+?)\s*(?:,\s*[^()]+\s*)?\)$/;

function limitTex(expr: string): string | null {
  const m = expr.trim().match(LIMIT_RE);
  if (!m) return null;
  const [, body, v, to] = m;
  return `\\lim_{${v} \\to ${safeTex(to.trim())}}{${safeTex(body.replace(/\\"/g, '"'))}}`;
}

function safeTex(expr: string): string {
  try {
    const sig = sigmaTex(expr);
    if (sig) return sig;
    const int = intTex(expr);
    if (int) return int;
    const lim = limitTex(expr);
    if (lim) return lim;
    const node = math.parse(expr);
    let tex = node.toTex();
    tex = tex.replace(/\\mathrm\{i\}/g, 'j');
    // тело выражения в строковом аргументе — настоящей математикой
    tex = tex.replace(MATH_STR_ARG_RE, (_, fn: string, inner: string) => {
      try {
        // mathjs уже превратил ^ в \textasciicircum{} внутри \mathtt — вернуть назад
        const clean = inner
          .replace(/\\"/g, '"')
          .replace(/\\textasciicircum\{\}/g, '^')
          .replace(/\\textasciitilde\{\}/g, '');
        return `\\mathrm{${fn}}\\left(${safeTex(clean)}`;
      } catch {
        return _;
      }
    });
    // alpha_10 → \alpha_{10}, tg_delta → tg_{\delta}, x_1 → x_{1}:
    // имя и суффикс после _ маппятся в греческие независимо
    // (имя в scope не меняется)
    tex = tex.replace(
      /([A-Za-z]+)\\_([A-Za-z0-9]+)/g,
      (_, name: string, sub: string) =>
        `${GREEK_TEX[name] ?? name}_{${GREEK_TEX[sub] ?? sub}}`,
    );
    // lambda0 → \lambda_{0}: греческое имя с цифровым хвостом без _.
    // Только греческие (q1, v0, log10 не трогаем) и только целый хвост.
    tex = tex.replace(
      GREEK_SUFFIX_RE,
      (_, name: string, sub: string) => `${GREEK_TEX[name]}_{${sub}}`,
    );
    // отдельное слово: eps → \epsilon (уже готовые \epsilon, eps_r, eps2 не трогаем)
    tex = tex.replace(
      GREEK_WORD_RE,
      (_, name: string) => GREEK_TEX[name],
    );
    // сырой ^ внутри \text{...} (строковые аргументы limit/nsum) — экранировать,
    // иначе KaTeX падает с textasciicircum
    tex = tex.replace(
      /\\text\{([^{}]*)\}/g,
      (_, inner: string) => `\\text{${escapeLatex(inner)}}`,
    );
    // mathjs сам кладёт \textasciicircum{}/\textasciitilde{} внутрь \mathtt{...} —
    // старый KaTeX их не знает, меняем на \^ / \~
    tex = tex.replace(/\\textasciicircum\{\}/g, '\\^{}').replace(/\\textasciitilde\{\}/g, '\\~{}');
    return tex;
  } catch {
    return escapeLatex(expr);
  }
}

function escapeLatex(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/([&%$#_{}])/g, '\\$1')
    .replace(/\^/g, '\\^{}')
    .replace(/~/g, '\\~{}');
}

/* ---------------- LaTeX для РЕЗУЛЬТАТОВ (матрицы, векторы, комплексные) ---------------- */

/** Число в LaTeX: 0.5 → 0.5, 1.2e-7 → 1.2\cdot 10^{-7} */
function numLatex(n: number): string {
  if (!isFinite(n)) return `\\text{${String(n)}}`;
  if (n === 0) return '0';
  const abs = Math.abs(n);
  if (abs >= 1e-3 && abs < 1e6) return String(Number(n.toPrecision(10)));
  const [m, e] = n.toExponential(4).split('e');
  const exp = Number(e);
  const mant = String(Number(m));
  if (mant === '1') return `10^{${exp}}`;
  return `${mant}\\cdot 10^{${exp}}`;
}

function complexLatex(re: number, im: number): string {
  const r = Math.abs(re) < 1e-12 ? 0 : re;
  const imA = Math.abs(im) < 1e-12 ? 0 : im;
  if (imA === 0) return numLatex(r);
  if (r === 0) return `${numLatex(imA)}j`;
  return imA >= 0 ? `${numLatex(r)}+${numLatex(imA)}j` : `${numLatex(r)}-${numLatex(Math.abs(imA))}j`;
}

function entryLatex(v: unknown): string {
  if (typeof v === 'number') return numLatex(v);
  if (typeof v === 'boolean') return `\\text{${v}}`;
  if (v !== null && typeof v === 'object' && 're' in v && 'im' in v) {
    return complexLatex(Number((v as { re: number }).re), Number((v as { im: number }).im));
  }
  if (typeof v === 'string') return `\\text{${escapeLatex(v).slice(0, 24)}}`;
  return `\\text{${escapeLatex(String(v)).slice(0, 24)}}`;
}

/** Значение → LaTeX для красивого вывода результата (KaTeX). '' = нечего показать. */
export function valueToLatex(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'function') return t('e.funcDefinedTex');
  if (typeof value === 'number') return numLatex(value);
  if (typeof value === 'boolean') return `\\text{${value}}`;
  if (typeof value === 'string') {
    // строка может быть символьным результатом (simplify/deriv): пробуем как математику
    try {
      const tex = math.parse(value).toTex();
      if (tex && !/\\mathrm\{\\text/.test(tex)) return tex;
    } catch { /* не математика — ниже как текст */ }
    return `\\text{${escapeLatex(value).slice(0, 120)}}`;
  }
  if (typeof value === 'object' && value !== null && math.isUnit(value)) {
    try {
      return math.parse(math.format(value)).toTex();
    } catch {
      return `\\text{${escapeLatex(math.format(value)).slice(0, 60)}}`;
    }
  }
  if (math.isComplex(value)) {
    const c = value as { re: number; im: number };
    return complexLatex(c.re, c.im);
  }
  let arr: unknown = null;
  if (math.isMatrix(value)) {
    arr = (value as { toArray: () => unknown }).toArray();
  } else if (Array.isArray(value)) {
    arr = value;
  }
  if (arr !== null) {
    const a = arr as unknown[];
    const is2D = a.length > 0 && Array.isArray(a[0]);
    const rowsArr: unknown[][] = is2D ? (a as unknown[][]) : [a];
    const total = rowsArr.reduce((s, r) => s + r.length, 0);
    if (total === 0) return '\\text{[] }';
    if (total > 24) {
      const preview = rowsArr
        .flat()
        .slice(0, 6)
        .map(entryLatex)
        .join(',\\;');
      return `\\text{[${rowsArr.length}\\times${rowsArr[0]?.length ?? total}]: }${preview},\\;\\dots`;
    }
    const body = rowsArr.map((r) => r.map(entryLatex).join(' & ')).join(' \\\\ ');
    return `\\begin{bmatrix}${body}\\end{bmatrix}`;
  }
  if (typeof value === 'object' && value !== null && 're' in value && 'im' in value) {
    const c = value as { re: number; im: number };
    return complexLatex(Number(c.re), Number(c.im));
  }
  return `\\text{${escapeLatex(String(value)).slice(0, 120)}}`;
}
