import { listMathcadFunctions, listSnippets } from './db';
import { MATHCAD_COMPAT_NAMES } from '../engine/mathcadCompat';
import { MATHCAD_RENAMES } from './mathcadNames';
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
const mathcadDocs: Partial<Record<Lang, Map<string, FuncDoc>>> = {};

/** Документация по встроенной функции (без обращения к каталогу БД). */
function builtinDoc(name: string, lang: Lang): FuncDoc | null {
  const b = BUILTIN.find((x) => x.name === name);
  return b ? { name, title: name, syntax: lang === 'ru' ? b.ru : b.en } : null;
}

/** Подсказка о статусе функции Mathcad/Prime в NyaMath. */
function mathcadStatusNote(
  f: ReturnType<typeof listMathcadFunctions>[number],
  lang: Lang,
): string {
  const target = f.nyamath_name && f.nyamath_name !== f.name ? ` → ${f.nyamath_name}` : '';
  switch (f.status) {
    case 'alias':
      return lang === 'ru' ? `${target} (алиас NyaMath)` : `${target} (NyaMath alias)`;
    case 'implemented':
      return lang === 'ru' ? `${target} (реализовано в NyaMath)` : `${target} (implemented in NyaMath)`;
    case 'unsupported':
      return lang === 'ru' ? '• не поддерживается в NyaMath' : '• not supported in NyaMath';
    case 'native':
      return lang === 'ru' ? '• встроена в NyaMath' : '• native in NyaMath';
  }
}

/** Весь каталог функций Mathcad/Prime из БД, включая неподдерживаемые. */
function mathcadDocIndex(lang: Lang): Map<string, FuncDoc> {
  const cached = mathcadDocs[lang];
  if (cached) return cached;
  const index = new Map<string, FuncDoc>();
  for (const f of listMathcadFunctions()) {
    const signature = f.params ? `${f.name}(${f.params})` : f.name;
    const description = f.description ?? '';
    const note = mathcadStatusNote(f, lang);
    const syntax = description ? `${signature} — ${description} ${note}` : `${signature} ${note}`;
    const doc: FuncDoc = { name: f.name, title: f.name, syntax };
    // Точный регистр важен для Mathcad (Ceil/ceil, Rank/rank); lowercase — запасной.
    index.set(f.name, doc);
    if (!index.has(f.name.toLowerCase())) index.set(f.name.toLowerCase(), doc);
    if (f.nyamath_name && f.nyamath_name !== f.name) {
      if (!index.has(f.nyamath_name)) {
        index.set(f.nyamath_name, { ...doc, name: f.nyamath_name, title: f.name });
      }
      if (!index.has(f.nyamath_name.toLowerCase())) {
        index.set(f.nyamath_name.toLowerCase(), {
          ...doc,
          name: f.nyamath_name,
          title: f.name,
        });
      }
    }
  }
  // Часть имён есть в маппинге импорта/слое совместимости, но отсутствует в
  // выгрузке funcdoc (например, lg → log10). Добавляем их как алиасы, чтобы
  // подсказка появлялась и для «родного» Mathcad-имени, и для имени NyaMath.
  const addSynthetic = (doc: FuncDoc): void => {
    index.set(doc.name, doc);
    if (!index.has(doc.name.toLowerCase())) index.set(doc.name.toLowerCase(), doc);
  };
  for (const [name, target] of Object.entries(MATHCAD_RENAMES)) {
    if (index.has(name) || index.has(name.toLowerCase())) continue;
    const targetDoc =
      builtinDoc(target, lang) ?? index.get(target) ?? index.get(target.toLowerCase());
    const note =
      lang === 'ru' ? `алиас Mathcad → ${target}` : `Mathcad alias → ${target}`;
    addSynthetic({
      name,
      title: targetDoc?.title ?? target,
      syntax: targetDoc ? `${name} → ${target}: ${targetDoc.syntax}` : `${name} → ${target} · ${note}`,
    });
  }
  for (const name of MATHCAD_COMPAT_NAMES) {
    if (index.has(name) || index.has(name.toLowerCase())) continue;
    addSynthetic({
      name,
      title: name,
      syntax:
        lang === 'ru'
          ? `${name} — функция совместимости Mathcad в NyaMath`
          : `${name} — Mathcad compatibility function in NyaMath`,
    });
  }

  mathcadDocs[lang] = index;
  return index;
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
  const b = builtinDoc(name, lang);
  if (b) return b;
  const s = docsIndex().get(name);
  if (s) return { name, title: s.title[lang], syntax: s.syntax };
  const mc = mathcadDocIndex(lang);
  return mc.get(name) ?? mc.get(name.toLowerCase()) ?? null;
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
  for (const d of mathcadDocIndex(lang).values()) {
    if (seen.has(d.name.toLowerCase())) continue;
    seen.add(d.name.toLowerCase());
    out.push(d);
  }
  return out;
}

/** Слово под курсором (имя функции/переменной) или null. */
export function wordAt(text: string, pos: number): string | null {
  const p = Math.max(0, Math.min(pos, text.length));
  const isTok = (ch: string): boolean => /[\p{L}\p{N}_]/u.test(ch);
  let s = p;
  while (s > 0 && isTok(text[s - 1])) s--;
  let e = p;
  while (e < text.length && isTok(text[e])) e++;
  if (e > s) {
    const w = text.slice(s, e);
    return /^\p{L}/u.test(w) ? w : null;
  }
  // курсор на пробеле — берём слово, заканчивающееся перед ним
  let q = p;
  while (q > 0 && text[q - 1] === ' ') q--;
  if (q === p) return null;
  let s2 = q;
  while (s2 > 0 && isTok(text[s2 - 1])) s2--;
  if (s2 >= q) return null;
  const w = text.slice(s2, q);
  return /^\p{L}/u.test(w) ? w : null;
}
