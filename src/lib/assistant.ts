import { math } from '../engine/mathEngine';
import { listFuncDocs } from './funcDoc';
import type { ScopeVar } from './scopeVars';
import type { Lang } from '../i18n';

/**
 * Dynamic Assistant в духе SMath: autocomplete по scope + fuzzy-поиск
 * по функциям/единицам. Чистый модуль без React: UI — AssistantPopup,
 * данные scope — через collectScopeVars снаружи (без подписки на стор).
 */

export type AssistKind = 'var' | 'fn' | 'unit' | 'const';

export interface AssistItem {
  /** вставляемое имя */
  name: string;
  kind: AssistKind;
  /** значение переменной / каноническая единица / подпись константы */
  detail: string;
  /** синтаксис для активной строки */
  doc: string;
}

export interface AssistResult {
  items: AssistItem[];
  /** всего совпадений до обрезки limit */
  total: number;
}

/** Сколько показывать при наборе; F12 (весь список) — больше. */
export const ASSIST_LIMIT = 9;
export const ASSIST_ALL_LIMIT = 60;

/* ---------------- префикс и вставка ---------------- */

/** Фрагмент имени перед курсором или null. */
export function prefixAt(text: string, pos: number): { start: number; word: string } | null {
  const p = Math.max(0, Math.min(pos, text.length));
  let s = p;
  while (s > 0 && /[A-Za-z0-9_]/.test(text[s - 1])) s--;
  if (s >= p) return null;
  const word = text.slice(s, p);
  if (!/^[A-Za-z_]/.test(word)) return null;
  return { start: s, word };
}

/** Вставить вариант вместо префикса; функциям добавляем `(`. */
export function applyCompletion(
  text: string,
  pos: number,
  item: AssistItem,
): { value: string; cursor: number } {
  const p = prefixAt(text, pos);
  const start = p ? p.start : pos;
  let ins = item.name;
  if (item.kind === 'fn' && text[pos] !== '(') ins += '(';
  const value = text.slice(0, start) + ins + text.slice(pos);
  return { value, cursor: start + ins.length };
}

/* ---------------- fuzzy-оценка ---------------- */

/** 0 = не совпало; больше = точнее (префикс > подстрока > подпоследовательность). */
export function fuzzyScore(query: string, name: string): number {
  if (!query) return 1;
  const n = name.toLowerCase();
  const q = query.toLowerCase();
  if (n.startsWith(q)) return 300 - name.length + (name.startsWith(query) ? 5 : 0);
  const idx = n.indexOf(q);
  if (idx >= 0) return 150 - idx - name.length / 100;
  let qi = 0;
  let gaps = 0;
  let last = -1;
  for (let i = 0; i < n.length && qi < q.length; i++) {
    if (n[i] === q[qi]) {
      if (last >= 0) gaps += i - last - 1;
      last = i;
      qi++;
    }
  }
  if (qi < q.length) return 0;
  return Math.max(1, 60 - gaps * 4 - name.length);
}

/* ---------------- источники вариантов ---------------- */

const CONST_ITEMS: { name: string; ru: string; en: string }[] = [
  { name: 'pi', ru: '3.14159…', en: '3.14159…' },
  { name: 'e', ru: '2.71828…', en: '2.71828…' },
  { name: 'j', ru: 'мнимая единица', en: 'imaginary unit' },
];

/** Ходовые единицы с префиксами (их нет в mathjs UNITS-ключах) — валидируем парсом. */
const EXTRA_UNITS = [
  'mm', 'cm', 'dm', 'km', 'um', 'nm', 'pm',
  'mg', 'ug', 'ng', 't',
  'ms', 'us', 'ns', 'ps', 'fs',
  'kHz', 'MHz', 'GHz', 'THz',
  'mV', 'kV', 'MV', 'uV',
  'mA', 'kA', 'uA', 'nA',
  'mW', 'kW', 'MW', 'GW',
  'kJ', 'MJ', 'GJ', 'kWh', 'MWh', 'keV', 'MeV', 'cal', 'kcal',
  'kPa', 'MPa', 'GPa', 'hPa', 'mbar',
  'kN', 'MN', 'mN',
  'mOhm', 'kOhm', 'MOhm',
  'pF', 'nF', 'uF', 'mF',
  'uH', 'mH',
  'mT', 'uT',
  'deg',
  'ml', 'ul',
];

interface UnitEntry {
  name: string;
  canonical: string;
}

let unitCache: UnitEntry[] | null = null;

/** Все единицы: UNITS-ключи mathjs + ходовые с префиксами (+ custom defunit — тот же инстанс). */
function getUnitEntries(): UnitEntry[] {
  if (unitCache) return unitCache;
  const seen = new Set<string>();
  const out: UnitEntry[] = [];
  const push = (name: string) => {
    if (!name || seen.has(name)) return;
    seen.add(name);
    try {
      const canonical = math.unit(name).formatUnits();
      out.push({ name, canonical });
    } catch {
      /* неизвестная единица — пропускаем */
    }
  };
  for (const u of EXTRA_UNITS) push(u);
  try {
    const keys = Object.keys(
      (math.Unit as unknown as { UNITS?: Record<string, unknown> }).UNITS ?? {},
    );
    for (const k of keys) push(k);
  } catch {
    /* без единиц — только EXTRA */
  }
  unitCache = out;
  return out;
}

let funcCache: Record<Lang, AssistItem[]> | null = null;

function getFuncItems(lang: Lang): AssistItem[] {
  funcCache ??= {} as Record<Lang, AssistItem[]>;
  const hit = funcCache[lang];
  if (hit) return hit;
  const items = listFuncDocs(lang).map((f) => ({
    name: f.name,
    kind: 'fn' as const,
    detail: f.syntax.length > 64 ? `${f.syntax.slice(0, 64)}…` : f.syntax,
    doc: f.title === f.name ? f.syntax : `${f.title} · ${f.syntax}`,
  }));
  funcCache[lang] = items;
  return items;
}

/* ---------------- запрос ---------------- */

/**
 * Варианты для префикса. Пустой префикс (F12) — всё по порядку:
 * переменные → константы → функции → единицы.
 */
export function queryAssistant(
  prefix: string,
  vars: ScopeVar[],
  lang: Lang,
  limit: number = ASSIST_LIMIT,
): AssistResult {
  const q = prefix.trim();
  if (!q) {
    const items: AssistItem[] = [
      ...vars.map((v) => ({
        name: v.name,
        kind: 'var' as const,
        detail: v.value.length > 28 ? `${v.value.slice(0, 28)}…` : v.value,
        doc: `${v.name} = ${v.value}`,
      })),
      ...CONST_ITEMS.map((c) => ({
        name: c.name,
        kind: 'const' as const,
        detail: lang === 'ru' ? c.ru : c.en,
        doc: lang === 'ru' ? c.ru : c.en,
      })),
      ...[...getFuncItems(lang)].sort((a, b) => (a.name < b.name ? -1 : 1)),
      ...getUnitEntries()
        .map((u) => ({
          name: u.name,
          kind: 'unit' as const,
          detail: u.canonical,
          doc: lang === 'ru' ? `единица: ${u.canonical}` : `unit: ${u.canonical}`,
        }))
        .sort((a, b) => (a.name < b.name ? -1 : 1)),
    ];
    return { items: items.slice(0, limit), total: items.length };
  }
  const seen = new Set<string>();
  const scored: { item: AssistItem; score: number; tier: number }[] = [];
  const consider = (item: AssistItem, tier: number) => {
    if (seen.has(item.name)) return;
    const score = fuzzyScore(q, item.name);
    if (score <= 0) return;
    seen.add(item.name);
    scored.push({ item, score, tier });
  };
  for (const v of vars) {
    consider(
      {
        name: v.name,
        kind: 'var',
        detail: v.value.length > 28 ? `${v.value.slice(0, 28)}…` : v.value,
        doc: `${v.name} = ${v.value}`,
      },
      3,
    );
  }
  for (const c of CONST_ITEMS) {
    consider({ name: c.name, kind: 'const', detail: lang === 'ru' ? c.ru : c.en, doc: lang === 'ru' ? c.ru : c.en }, 2);
  }
  for (const f of getFuncItems(lang)) consider(f, 1);
  for (const u of getUnitEntries()) {
    consider(
      {
        name: u.name,
        kind: 'unit',
        detail: u.canonical,
        doc: lang === 'ru' ? `единица: ${u.canonical}` : `unit: ${u.canonical}`,
      },
      0,
    );
  }
  scored.sort(
    (a, b) => b.score - a.score || b.tier - a.tier || a.item.name.length - b.item.name.length,
  );
  return { items: scored.slice(0, limit).map((s) => s.item), total: scored.length };
}
