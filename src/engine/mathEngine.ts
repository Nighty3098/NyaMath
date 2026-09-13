/**
 * Wengineering Math Engine — кастомный evaluator на базе mathjs.
 *
 * Поддерживает Mathcad-синтаксис:
 *  - `a := expr`        — определение переменной / функции `f(x) := ...`
 *  - `expr =` / `x =`   — вывод результата ( trailing `=` )
 *  - `j` как мнимая единица (алиас `i`), включая `3+4j`, `4*j`
 *  - константы pi, e; функции sqrt/sin/cos/atan/Re/Im/abs/log/ln
 *  - порядок вычислений строго сверху-вниз по Y (см. dependencies.ts)
 */
import { create, all, type MathJsInstance } from 'mathjs';
import { buildPackScope, PACK_NAMES } from './packs';
import { t } from '../i18n';

export const math: MathJsInstance = create(all, {});

// --- Кастомные функции / алиасы в стиле Mathcad ---
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
// log(x) = lg (инженерный, как в Mathcad), log(x, base) — по основанию base.
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

/** Диапазоны Mathcad-стиля: `a..b` и `a,step..b` → seq(a,b,step). Только числовые литералы. */
export function preprocessRanges(expr: string): string {
  return expr
    .replace(
      /(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\.\.\s*(-?\d+(?:\.\d+)?)/g,
      'seq($1,$3,$2)',
    )
    .replace(/(-?\d+(?:\.\d+)?)\s*\.\.\s*(-?\d+(?:\.\d+)?)/g, 'seq($1,$2)');
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

/** Разобрать одну строку Mathcad-стиля. Многострочный ввод бьётся вызывающим кодом. */
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
    // Mathcad-семантика: `x =` показывает x. `2+2 =` показывает 6.
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
  'null', 'Complex', 'Matrix', 'pi_', 'range', 'round', 'clone',
  ...PACK_NAMES,
]);

/** Извлечь зависимости (имена переменных) из выражения через AST mathjs. */
export function extractDependencies(expr: string, fnParams: string[] = []): string[] {
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
      const value = math.evaluate(rhsPre, scope);
      // math.evaluate с присваиванием `x = ...` внутри уже кладёт в scope,
      // но у нас `:=` — делаем вручную для надёжности:
      scope[parsed.lhs] = value;
      // особый случай `j := sqrt(-1)` — синхронизируем i
      if (parsed.lhs === 'j') {
        scope['i'] = value;
      }
      void pre;
      return { value, error: null };
    }
    // output / eval
    const exprPre = preprocessRanges(preprocessJ(parsed.expr, false));
    if (exprPre === '') return { value: null, error: null };
    const value = math.evaluate(exprPre, scope);
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
  const input = rawInput.trim();
  if (!input) return '';
  // Комментарии и обычный текст (включая кириллицу) — НЕ математика:
  // оборачиваем в \text, иначе KaTeX ругается unicodeTextInMathMode.
  if (input.startsWith('//') || input.startsWith('#') || /[А-Яа-яЁё]/.test(input)) {
    const text = input.replace(/^(\/\/|#)\s?/, '').slice(0, 200);
    return `\\text{${escapeLatex(text)}}`;
  }
  try {
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

function safeTex(expr: string): string {
  try {
    const node = math.parse(expr);
    let tex = node.toTex();
    tex = tex.replace(/\\mathrm\{i\}/g, 'j');
    return tex;
  } catch {
    return escapeLatex(expr);
  }
}

function escapeLatex(s: string): string {
  return s.replace(/([&%$#_{}])/g, '\\$1');
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
  if (typeof value === 'string') return `\\text{${escapeLatex(value).slice(0, 120)}}`;
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
