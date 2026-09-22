/**
 * Структурная правка формул, адаптированная
 * под строчный редактор (§20 п.436: группировку Space эмулируем
 * скобками, оператор применяется к выделенной группе целиком).
 */

export interface WrapResult {
  value: string;
  /** новое выделение [start, end) — схлопнуто, если курсор в пустых () */
  start: number;
  end: number;
}

export interface InsertResult {
  value: string;
  /** позиция курсора после вставки */
  cursor: number;
}

/**
 * Вставка сниппета экранной клавиатуры в позицию курсора с заменой
 * выделения (если есть). Чистая функция — UI ставит курсор сам.
 */
export function insertSnippet(
  value: string,
  start: number,
  end: number,
  snippet: string,
): InsertResult {
  const len = value.length;
  const s = Math.max(0, Math.min(start, end, len));
  const e = Math.max(0, Math.min(Math.max(start, end), len));
  const next = value.slice(0, s) + snippet + value.slice(e);
  return { value: next, cursor: s + snippet.length };
}

/**
 * Tab-stop для сниппетов (`sqrt(`, `^()`): курсор перед `)`/`]` —
 * перепрыгнуть за неё и за цепочку (`))`). Иначе null — Tab идёт
 * дальше как навигация фокуса (a11y не ломаем).
 */
export function skipCloser(value: string, pos: number): number | null {
  const p = Math.max(0, Math.min(pos, value.length));
  if (value[p] !== ')' && value[p] !== ']') return null;
  let q = p;
  while (value[q] === ')' || value[q] === ']') q++;
  return q;
}

export type WrapKind = 'parens' | 'fraction' | 'power' | 'sqrt';

/**
 * Обернуть выделение оператором (оператор накрывает группу).
 *  - parens:   `sel` → `(sel)` (выделение сохраняется на группе — чейнинг)
 *  - fraction: `sel` → `(sel)/()` (курсор в пустых скобках знаменателя)
 *  - power:    `sel` → `(sel)^()` (курсор в пустых скобках показателя)
 *  - sqrt:     `sel` → `sqrt(sel)` (выделение на результате — чейнинг)
 * Схлопнутое выделение (без группы) не трогаем — возвращаем null,
 * чтобы сработал обычный ввод символа.
 */
export function wrapSelection(
  value: string,
  start: number,
  end: number,
  kind: WrapKind,
): WrapResult | null {
  const len = value.length;
  const s = Math.max(0, Math.min(start, end, len));
  const e = Math.max(0, Math.min(Math.max(start, end), len));
  if (e <= s) return null;
  const sel = value.slice(s, e);
  const head = value.slice(0, s);
  const tail = value.slice(e);
  switch (kind) {
    case 'parens': {
      const v = `${head}(${sel})${tail}`;
      return { value: v, start: s, end: s + sel.length + 2 };
    }
    case 'fraction': {
      const v = `${head}(${sel})/()${tail}`;
      const cursor = s + sel.length + 4;
      return { value: v, start: cursor, end: cursor };
    }
    case 'power': {
      const v = `${head}(${sel})^()${tail}`;
      const cursor = s + sel.length + 4;
      return { value: v, start: cursor, end: cursor };
    }
    case 'sqrt': {
      const v = `${head}sqrt(${sel})${tail}`;
      return { value: v, start: s, end: s + sel.length + 6 };
    }
  }
}

const OPEN = new Map([
  [')', '('],
  [']', '['],
]);

const isTokChar = (ch: string): boolean => /[A-Za-z0-9_.]/.test(ch);

/** Ближайший токен (имя/число) вокруг позиции; null — рядом нет токена. */
function tokenAround(value: string, pos: number): { start: number; end: number } | null {
  let s = pos;
  let e = pos;
  while (s > 0 && isTokChar(value[s - 1])) s--;
  while (e < value.length && isTokChar(value[e])) e++;
  if (e > s) return { start: s, end: e };
  // курсор на операторе/пробеле — берём соседний токен (справа в приоритете)
  let r = pos;
  while (r < value.length && !isTokChar(value[r])) r++;
  if (r < value.length) {
    let e2 = r;
    while (e2 < value.length && isTokChar(value[e2])) e2++;
    return { start: r, end: e2 };
  }
  let l = pos - 1;
  while (l >= 0 && !isTokChar(value[l])) l--;
  if (l >= 0) {
    let s2 = l;
    while (s2 > 0 && isTokChar(value[s2 - 1])) s2--;
    return { start: s2, end: l + 1 };
  }
  return null;
}

/** Ближайшая скобочная пара, строго содержащая [start, end). */
function enclosingBrackets(
  value: string,
  start: number,
  end: number,
): { open: number; close: number } | null {
  const stack: { ch: string; pos: number }[] = [];
  let best: { open: number; close: number } | null = null;
  for (let i = 0; i < value.length; i++) {
    const ch = value[i];
    if (ch === '(' || ch === '[') {
      stack.push({ ch, pos: i });
    } else if (ch === ')' || ch === ']') {
      const open = OPEN.get(ch);
      // снимаем до парной открывающей
      let found = -1;
      for (let k = stack.length - 1; k >= 0; k--) {
        if (stack[k].ch === open) {
          found = k;
          break;
        }
      }
      if (found < 0) continue;
      const { pos } = stack[found];
      stack.length = found;
      if (pos < start && i >= end) {
        // самая внутренняя — последняя подходящая при сканировании слева
        best = { open: pos, close: i };
      }
    }
  }
  return best;
}

function lineBounds(value: string, pos: number): { start: number; end: number } {
  let s = pos;
  while (s > 0 && value[s - 1] !== '\n') s--;
  let e = pos;
  while (e < value.length && value[e] !== '\n') e++;
  // без висячих пробелов по краям
  while (s < e && value[s] === ' ') s++;
  while (e > s && value[e - 1] === ' ') e--;
  return { start: s, end: e };
}

/**
 * Расширение выделения уровнями (эмуляция Spacebar):
 * токен → содержимое скобок → скобки целиком → строка → null (предел).
 * Повторные вызовы поднимаются на уровень выше.
 */
export function expandSelection(
  value: string,
  start: number,
  end: number,
): { start: number; end: number } | null {
  const len = value.length;
  if (!len) return null;
  let s = Math.max(0, Math.min(start, end, len));
  let e = Math.max(0, Math.min(Math.max(start, end), len));
  if (e < s) [s, e] = [e, s];
  if (e <= s) {
    // уровень 0: токен под курсором
    return tokenAround(value, s);
  }
  // уровень N+1: охватывающие скобки
  const br = enclosingBrackets(value, s, e);
  if (br) {
    const inner = { start: br.open + 1, end: br.close };
    const whole = { start: br.open, end: br.close + 1 };
    const isInner = s === inner.start && e === inner.end;
    const isWhole = s === whole.start && e === whole.end;
    if (!isInner && !isWhole) {
      // выделение внутри скобок, но уже/частично — сначала содержимое
      if (s >= inner.start && e <= inner.end && (s > inner.start || e < inner.end)) return inner;
      return whole;
    }
    if (isInner) return whole;
    // isWhole — идём выше: ищем следующую пару снаружи
    const outer = enclosingBrackets(value, whole.start, whole.end);
    // enclosingBrackets требует pos < start — для whole.start не сработает
    // на той же паре; ищем пару, строго содержащую whole
    if (outer && (outer.open < whole.start || outer.close > whole.end)) {
      return { start: outer.open + 1, end: outer.close };
    }
    // дальше — строка
  }
  const line = lineBounds(value, s);
  if (s !== line.start || e !== line.end) return line;
  return null;
}
