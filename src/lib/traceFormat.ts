/**
 * lib/traceFormat — токенизатор строк «шагов решателя».
 *
 * Сырые строки трека (`k=3 x=[1, 2] |F|=1.00·10^-9`) в моноширинном
 * blob'е сливались в кашу. Токенизатор режет строку на чипы `ключ=значение`
 * и plain-фрагменты; пробелы внутри [...] не разделяют, поэтому векторы
 * (`[x, y]`, `[1, 0]:`) остаются целыми. Рендер — в TraceLine.tsx.
 */

export type TraceToken =
  | { kind: 'kv'; key: string; value: string }
  | { kind: 'text'; text: string };

/** Ключ чипа: `k`, `x`, `f`, `I`, `splits`, `f-evals`, `|F|`, `S0`, … */
const KEY_RE = /^\|?[\w-]+\|?$/u;

/**
 * Разбить строку трека на токены. Скобки без пары — как есть,
 * `key=` без значения или с плохим ключом — plain-текст.
 */
export function tokenizeTraceLine(line: string): TraceToken[] {
  const chunks: string[] = [];
  let depth = 0;
  let cur = '';
  for (const ch of line) {
    if (ch === '[') depth++;
    else if (ch === ']' && depth > 0) depth--;
    if (/\s/.test(ch) && depth === 0) {
      if (cur) {
        chunks.push(cur);
        cur = '';
      }
      continue;
    }
    cur += ch;
  }
  if (cur) chunks.push(cur);

  return chunks.map((c) => {
    const eq = c.indexOf('=');
    if (eq > 0) {
      const key = c.slice(0, eq);
      const value = c.slice(eq + 1);
      if (KEY_RE.test(key) && value) return { kind: 'kv', key, value };
    }
    return { kind: 'text', text: c };
  });
}
