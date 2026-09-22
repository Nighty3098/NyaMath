/**
 * lib/traceLatex — строки «шагов решателя» → LaTeX для KaTeX-рендера.
 *
 * Сырые строки трека (`∫ (ln(1+x)/(1+x^2)) dx […]: I=…`, `k=3 x=… f=…`)
 * раньше рисовались моноширинным текстом и смотрелись чужеродно рядом
 * с красивой KaTeX-строкой блока. Здесь каждая строка превращается
 * в LaTeX той же математикой, что основная строка (safeTex):
 * - подпись интеграла/корня/минимума/BVP/system — настоящее выражение
 *   с пределами (`\int_{a}^{b}`, `= 0,~x \in […]`);
 * - шаги итераций — аккуратный ряд `\mathtt{ключ} = значение`;
 * - числа листа `·10^exp` — в `\cdot 10^{exp}`, слова — в `\text{}`.
 *
 * Модель данных не меняется (всё те же string[]), только представление.
 * Не бросает: неизвестные строки уходят в generic-ветку, KaTeX при
 * рендере вызывается с throwOnError:false.
 */
import { safeTex } from '../engine/mathEngine';
import { tokenizeTraceLine, type TraceToken } from './traceFormat';

/** `·10^exp` (нотация листа) → `\cdot 10^{exp}`. */
export function engToLatex(s: string): string {
  return s.replace(/·10\^(-?\d+)/g, '\\cdot 10^{$1}');
}

/** Число из трека → инлайн-LaTeX. */
function numToLatex(s: string): string {
  return engToLatex(s);
}

/** Значение kv-пары → LaTeX: числа/векторы инлайн, выражения через safeTex. */
function valueToLatex(v: string): string {
  if (/^[\d\s[\](),.+|\-·^]+$/u.test(v)) return engToLatex(v);
  return safeTex(v);
}

/** Текстовый токен → LaTeX: слова в \text, числа инлайн, математика в safeTex. */
function textTokenToLatex(s: string): string {
  if (/^[A-Za-z…,]+$/u.test(s)) return `\\text{${s}}`;
  if (/^[\d\s[\](),.+|\-·^:]+$/u.test(s)) return engToLatex(s);
  return safeTex(s);
}

function tokenToLatex(t: TraceToken): string {
  if (t.kind === 'kv') return `\\mathtt{${t.key}} = ${valueToLatex(t.value)}`;
  return textTokenToLatex(t.text);
}

/** Произвольная строка трека (шаг, хвост подписи) → инлайн-LaTeX. */
export function genericTraceLatex(line: string): string {
  return tokenizeTraceLine(line).map(tokenToLatex).join('\\;');
}

const NINT_RE = /^∫ (.+?) d([A-Za-z]\w*) \[(.+?), (.+?)\]: I=(.+)$/;
const NINT_FAIL_RE = /^∫ (.+?) d([A-Za-z]\w*): no convergence$/;
const ROOT_BR_RE = /^root (.+?) ([A-Za-z]\w*) ∈ \[(.+?), (.+?)\]: f=(.+)$/;
const ROOT_START_RE = /^root (.+?) ([A-Za-z]\w*) from (.+?): f=(.+)$/;
const ROOT_FAIL_RE = /^root (.+?) ([A-Za-z]\w*): no convergence$/;
const MINMAX_RE = /^(minimize|maximize) (.+?) from (\[.+?\]): (\d+) iters, f=(.+)$/;
const MINMAX_FAIL_RE = /^(minimize|maximize) (.+?): no convergence$/;
const BVP_RE = /^bvp (.+?): secant (\d+) iters, s=(.+)$/;
const BVP_FAIL_RE = /^bvp (.+?): no convergence$/;
const SOLVE_RE = /^solve \[(.+?)\] from (\[.+?\])( \(minerr\))?: (.*)$/;

/**
 * Строка трека → LaTeX. isLabel=true для первой строки блока (подпись
 * вызова решателя): её разбираем по форме и рисуем настоящей математикой.
 * Остальное (и всё неизвестное) — generic-ряд токенов.
 */
export function traceLineToLatex(line: string, isLabel: boolean): string {
  if (isLabel) {
    let m: RegExpMatchArray | null;
    if ((m = line.match(NINT_RE))) {
      const [, expr, v, a, b, r] = m;
      return `\\int_{${numToLatex(a.trim())}}^{${numToLatex(b.trim())}} {${safeTex(expr.trim())}} \\,d${v} = ${numToLatex(r.trim())}`;
    }
    if ((m = line.match(NINT_FAIL_RE))) {
      const [, expr, v] = m;
      return `${safeTex(expr.trim())} \\,d${v}\\quad \\text{(no convergence)}`;
    }
    if ((m = line.match(ROOT_BR_RE))) {
      const [, expr, v, a, b, r] = m;
      return `${safeTex(expr.trim())} = 0,\\quad ${v} \\in [${numToLatex(a.trim())}, ${numToLatex(b.trim())}],\\quad f = ${numToLatex(r.trim())}`;
    }
    if ((m = line.match(ROOT_START_RE))) {
      const [, expr, v, g, r] = m;
      return `${safeTex(expr.trim())} = 0,\\quad ${v}_{0} = ${numToLatex(g.trim())},\\quad f = ${numToLatex(r.trim())}`;
    }
    if ((m = line.match(ROOT_FAIL_RE))) {
      const [, expr] = m;
      return `${safeTex(expr.trim())} = 0\\quad \\text{(no convergence)}`;
    }
    if ((m = line.match(MINMAX_RE))) {
      const [, op, expr, guess, iters, r] = m;
      return `\\text{${op}}~${safeTex(expr.trim())}~\\text{from}~${valueToLatex(guess.trim())}:~${iters}~\\text{iters},~f = ${numToLatex(r.trim())}`;
    }
    if ((m = line.match(MINMAX_FAIL_RE))) {
      const [, op, expr] = m;
      return `\\text{${op}}~${safeTex(expr.trim())}\\quad \\text{(no convergence)}`;
    }
    if ((m = line.match(BVP_RE))) {
      const [, expr, iters, s] = m;
      return `\\text{bvp}~${safeTex(expr.trim())}:~${iters}~\\text{iters},~s = ${numToLatex(s.trim())}`;
    }
    if ((m = line.match(BVP_FAIL_RE))) {
      const [, expr] = m;
      return `\\text{bvp}~${safeTex(expr.trim())}\\quad \\text{(no convergence)}`;
    }
    if ((m = line.match(SOLVE_RE))) {
      const [, vars, guess, minerr, tail] = m;
      return `\\text{solve}~[${vars}]~\\text{from}~${guess}${minerr ? '~(\\text{minerr})' : ''}:~${genericTraceLatex(tail)}`;
    }
  }
  return genericTraceLatex(line);
}
