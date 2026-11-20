import { listMathcadFunctions, listSnippets } from './db';
import type { Lang } from '../i18n';

export interface FuncDoc {
  /** имя функции */
  name: string;
  /** заголовок (название из палитры) */
  title: string;
  /** строка синтаксиса/подсказки */
  syntax: string;
}

/** Встроенные математические функции и константы (нет в сниппетах). */
const BUILTIN: { name: string; ru: string; en: string }[] = [
  { name: 'sin', ru: 'sin(x) — синус, x в радианах', en: 'sin(x) — sine, x in radians' },
  { name: 'cos', ru: 'cos(x) — косинус, x в радианах', en: 'cos(x) — cosine, x in radians' },
  { name: 'tan', ru: 'tan(x) — тангенс', en: 'tan(x) — tangent' },
  { name: 'asin', ru: 'asin(x) — арксинус → радианы', en: 'asin(x) — arcsine → radians' },
  { name: 'acos', ru: 'acos(x) — арккосинус → радианы', en: 'acos(x) — arccosine → radians' },
  { name: 'atan', ru: 'atan(x) — арктангенс → радианы', en: 'atan(x) — arctangent → radians' },
  { name: 'sqrt', ru: 'sqrt(x) — квадратный корень', en: 'sqrt(x) — square root' },
  { name: 'cbrt', ru: 'cbrt(x) — кубический корень', en: 'cbrt(x) — cube root' },
  { name: 'exp', ru: 'exp(x) — e в степени x', en: 'exp(x) — e to the x' },
  { name: 'ln', ru: 'ln(x) — натуральный логарифм', en: 'ln(x) — natural log' },
  { name: 'log', ru: 'log(x) — десятичный логарифм (как в Mathcad)', en: 'log(x) — base-10 log (as in Mathcad)' },
  { name: 'log10', ru: 'log10(x) — десятичный логарифм', en: 'log10(x) — base-10 log' },
  { name: 'abs', ru: 'abs(x) — модуль', en: 'abs(x) — absolute value' },
  { name: 'sign', ru: 'sign(x) — знак: −1, 0, 1', en: 'sign(x) — sign: −1, 0, 1' },
  { name: 'floor', ru: 'floor(x) — вниз до целого', en: 'floor(x) — round down' },
  { name: 'ceil', ru: 'ceil(x) — вверх до целого', en: 'ceil(x) — round up' },
  { name: 'round', ru: 'round(x) — ближайшее целое', en: 'round(x) — nearest integer' },
  { name: 'min', ru: 'min(a, b, ...) — минимум', en: 'min(a, b, ...) — minimum' },
  { name: 'max', ru: 'max(a, b, ...) — максимум', en: 'max(a, b, ...) — maximum' },
  { name: 'sum', ru: 'sum(v) — сумма элементов', en: 'sum(v) — element sum' },
  { name: 'prod', ru: 'prod(v) — произведение', en: 'prod(v) — product' },
  { name: 'mean', ru: 'mean(v) — среднее', en: 'mean(v) — mean' },
  { name: 'det', ru: 'det(M) — определитель', en: 'det(M) — determinant' },
  { name: 'inv', ru: 'inv(M) — обратная матрица', en: 'inv(M) — inverse matrix' },
  { name: 'transpose', ru: 'transpose(M) — строки ↔ столбцы', en: 'transpose(M) — rows ↔ columns' },
  { name: 'pi', ru: 'pi — число π', en: 'pi — the number π' },
];

/** Первичная функция сниппета: `mean(data) =`, `x := inv(A)*...` → имя до `(`. */
function primaryName(code: string): string | null {
  const first = code.split('\n')[0].trim();
  const m = first.match(/^(?:[A-Za-z_][A-Za-z0-9_]*\s*:=\s*)?([A-Za-z][A-Za-z0-9]*)\s*\(/);
  return m ? m[1] : null;
}

export interface SnippetDoc {
  title: { ru: string; en: string };
  syntax: string;
}

let snippetDocs: Map<string, SnippetDoc> | null = null;
let mathcadDocs: Map<string, FuncDoc> | null = null;

/** Каталог поддерживаемых функций Mathcad/Prime из БД. */
function mathcadDocIndex(): Map<string, FuncDoc> {
  if (!mathcadDocs) {
    mathcadDocs = new Map<string, FuncDoc>();
    for (const f of listMathcadFunctions()) {
      if (f.status === 'unsupported' || !f.description) continue;
      const syntax = f.params ? `${f.name}(${f.params})` : f.name;
      const doc: FuncDoc = { name: f.name, title: f.name, syntax: `${syntax} — ${f.description}` };
      mathcadDocs.set(f.name.toLowerCase(), doc);
      if (f.nyamath_name && f.nyamath_name !== f.name) {
        if (!mathcadDocs.has(f.nyamath_name.toLowerCase())) {
          mathcadDocs.set(f.nyamath_name.toLowerCase(), { ...doc, name: f.nyamath_name });
        }
      }
    }
  }
  return mathcadDocs;
}

/** Ленивый индекс по сниппетам из БД (после initDb; до этого — пусто). */
function docsIndex(): Map<string, SnippetDoc> {
  if (!snippetDocs) {
    snippetDocs = new Map<string, SnippetDoc>();
    for (const s of listSnippets()) {
      if (s.kind === 'program' || s.kind === 'sim') continue;
      const name = primaryName(s.code);
      if (!name || snippetDocs.has(name)) continue;
      snippetDocs.set(name, { title: s.label, syntax: s.doc ?? `${s.hint.ru} / ${s.hint.en}` });
    }
  }
  return snippetDocs;
}

/** Документация по имени функции: сначала встроенные, затем сниппеты. */
export function lookupFuncDoc(name: string, lang: Lang): FuncDoc | null {
  const b = BUILTIN.find((x) => x.name === name);
  if (b) return { name, title: name, syntax: lang === 'ru' ? b.ru : b.en };
  const s = docsIndex().get(name);
  if (s) return { name, title: s.title[lang], syntax: s.syntax };
  return mathcadDocIndex().get(name.toLowerCase()) ?? null;
}

/** Полный список функций со сигнатурами (для Dynamic Assistant). */
export function listFuncDocs(lang: Lang): FuncDoc[] {
  const out: FuncDoc[] = BUILTIN.map((b) => ({
    name: b.name,
    title: b.name,
    syntax: lang === 'ru' ? b.ru : b.en,
  }));
  for (const [name, s] of docsIndex()) {
    out.push({ name, title: s.title[lang], syntax: s.syntax });
  }
  const seen = new Set(out.map((d) => d.name.toLowerCase()));
  for (const d of mathcadDocIndex().values()) {
    if (seen.has(d.name.toLowerCase())) continue;
    seen.add(d.name.toLowerCase());
    out.push(d);
  }
  return out;
}

/** Слово под курсором (имя функции/переменной) или null. */
export function wordAt(text: string, pos: number): string | null {
  const p = Math.max(0, Math.min(pos, text.length));
  const isTok = (ch: string): boolean => /[A-Za-z0-9_]/.test(ch);
  let s = p;
  while (s > 0 && isTok(text[s - 1])) s--;
  let e = p;
  while (e < text.length && isTok(text[e])) e++;
  if (e > s) {
    const w = text.slice(s, e);
    return /^[A-Za-z]/.test(w) ? w : null;
  }
  // курсор на пробеле — берём слово, заканчивающееся перед ним
  let q = p;
  while (q > 0 && text[q - 1] === ' ') q--;
  if (q === p) return null;
  let s2 = q;
  while (s2 > 0 && isTok(text[s2 - 1])) s2--;
  if (s2 >= q) return null;
  const w = text.slice(s2, q);
  return /^[A-Za-z]/.test(w) ? w : null;
}
