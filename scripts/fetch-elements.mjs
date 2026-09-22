/**
 * Выборка химических элементов в db/seed.json из открытого датасета
 * Bowserinator/Periodic-Table-JSON (CC-лицензия, данные из Wikipedia/IUPAC):
 *   https://raw.githubusercontent.com/Bowserinator/Periodic-Table-JSON/master/PeriodicTableJSON.json
 *
 * Использование:
 *   node scripts/fetch-elements.mjs           # dry-run: отчёт (скачает и сравнит)
 *   node scripts/fetch-elements.mjs --write   # записать таблицу "elements" в seed.json
 *   npm run elements [-- --write]
 *
 * В seed.json попадает только curated-подмножество полей (без summary,
 * картинок и спектров — они весят сотни КБ и не нужны калькулятору).
 * Затем: npm run seed && npm run test.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RU_NAMES } from './element-names.mjs';

export const ELEMENTS_URL =
  'https://raw.githubusercontent.com/Bowserinator/Periodic-Table-JSON/master/PeriodicTableJSON.json';

const numOrNull = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const strOrNull = (v) => (typeof v === 'string' && v.length > 0 ? v : null);

/**
 * Нормализация одной upstream-записи → строка таблицы elements.
 * Возвращает null, если запись битая (нет number/symbol).
 */
export function normalizeElement(e) {
  if (!e || typeof e.number !== 'number' || typeof e.symbol !== 'string') return null;
  return {
    number: e.number,
    symbol: e.symbol,
    name_en: strOrNull(e.name) ?? e.symbol,
    name_ru: RU_NAMES[e.symbol] ?? null,
    atomic_mass: numOrNull(e.atomic_mass),
    phase: strOrNull(e.phase),
    density: numOrNull(e.density),
    melt: numOrNull(e.melt),
    boil: numOrNull(e.boil),
    group_no: numOrNull(e.group),
    period: numOrNull(e.period),
    electron_config:
      strOrNull(e.electron_configuration_semantic) ?? strOrNull(e.electron_configuration),
    electronegativity: numOrNull(e.electronegativity_pauling),
    molar_heat: numOrNull(e.molar_heat),
    category: strOrNull(e.category),
    discovered: strOrNull(e.discovered_by),
    source: strOrNull(e.source),
  };
}

/** Весь датасет → отсортированные строки (проверка порядка и дублей — в вызывающем коде). */
export function normalizeAll(elements) {
  const rows = [];
  for (const e of elements ?? []) {
    // гипотетические затабличные (Uue №119+) — не химия, а прогноз: отсекаем
    if (!e || typeof e.number !== 'number' || e.number < 1 || e.number > 118) continue;
    const r = normalizeElement(e);
    if (r) rows.push(r);
  }
  return rows.sort((a, b) => a.number - b.number);
}

/** Заменить (или добавить) ключ верхнего уровня в JSON-тексте без переформатирования. */
export function replaceTopKey(src, key, valueText) {
  const anchor = `"${key}": [`;
  const i = src.indexOf(anchor);
  const block = ` "${key}": [\n${valueText}\n ]`;
  if (i < 0) {
    // добавить перед финальной закрывающей скобкой
    const tail = '\n}';
    if (!src.endsWith(tail)) throw new Error('unexpected seed.json tail');
    return src.slice(0, -tail.length) + ',\n' + block + tail;
  }
  // сбалансированное сканирование существующего массива
  let depth = 0;
  let inStr = false;
  let esc = false;
  let j = i + anchor.length - 1; // на '['
  for (; j < src.length; j++) {
    const c = src[j];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === '[') depth++;
    else if (c === ']') {
      depth--;
      if (depth === 0) break;
    }
  }
  if (depth !== 0) throw new Error(`unbalanced array for key ${key}`);
  return src.slice(0, i) + block + src.slice(j + 1);
}

/** Сериализация строки elements в стиле seed.json (indent 1). */
export function renderRow(r) {
  const v = (x) => (x === null || x === undefined ? 'null' : JSON.stringify(x));
  return (
    '  {\n' +
    `   "number": ${r.number},\n` +
    `   "symbol": ${JSON.stringify(r.symbol)},\n` +
    `   "name_en": ${JSON.stringify(r.name_en)},\n` +
    `   "name_ru": ${JSON.stringify(r.name_ru)},\n` +
    `   "atomic_mass": ${v(r.atomic_mass)},\n` +
    `   "phase": ${v(r.phase)},\n` +
    `   "density": ${v(r.density)},\n` +
    `   "melt": ${v(r.melt)},\n` +
    `   "boil": ${v(r.boil)},\n` +
    `   "group_no": ${v(r.group_no)},\n` +
    `   "period": ${v(r.period)},\n` +
    `   "electron_config": ${v(r.electron_config)},\n` +
    `   "electronegativity": ${v(r.electronegativity)},\n` +
    `   "molar_heat": ${v(r.molar_heat)},\n` +
    `   "category": ${v(r.category)},\n` +
    `   "discovered": ${v(r.discovered)},\n` +
    `   "source": ${v(r.source)}\n` +
    '  }'
  );
}

async function main() {
  const args = process.argv.slice(2);
  const write = args.includes('--write');
  const here = path.dirname(fileURLToPath(import.meta.url));
  const root = path.resolve(here, '..');
  const seedPath = path.join(root, 'db', 'seed.json');

  console.log(`fetch ${ELEMENTS_URL}`);
  const res = await fetch(ELEMENTS_URL);
  if (!res.ok) throw new Error(`dataset responded HTTP ${res.status}`);
  const data = await res.json();
  const rows = normalizeAll(data.elements);
  console.log(`normalized ${rows.length} elements`);

  // валидация полноты: 1..118 без дыр и дублей, у всех есть ru-название и масса
  const problems = [];
  const seen = new Set();
  rows.forEach((r, k) => {
    if (r.number !== k + 1) problems.push(`order gap at index ${k}: number=${r.number}`);
    if (seen.has(r.number)) problems.push(`duplicate number ${r.number}`);
    seen.add(r.number);
    if (!r.name_ru) problems.push(`no ru name: ${r.symbol}`);
  });
  const noMass = rows.filter((r) => r.atomic_mass === null).map((r) => r.symbol);
  console.log(`no atomic mass: ${noMass.length ? noMass.join(', ') : '—'}`);
  if (problems.length) {
    console.log(problems.join('\n'));
    throw new Error('dataset validation failed');
  }

  const seed = JSON.parse(fs.readFileSync(seedPath, 'utf-8'));
  const cur = seed.elements ?? [];
  const same =
    cur.length === rows.length &&
    rows.every((r, k) => JSON.stringify(cur[k]) === JSON.stringify({ ...r }));
  console.log(
    same
      ? 'seed.json elements up to date'
      : `seed.json elements differ (${cur.length} -> ${rows.length})`,
  );
  if (!same) {
    if (!write) {
      process.exitCode = 2;
      console.log('запустите с --write');
      return;
    }
    const src = fs.readFileSync(seedPath, 'utf-8');
    const next = replaceTopKey(src, 'elements', rows.map(renderRow).join(',\n'));
    // проверяем, что результат парсится и содержит все строки
    const check = JSON.parse(next);
    if (check.elements.length !== rows.length) throw new Error('rewrite sanity check failed');
    fs.writeFileSync(seedPath, next);
    console.log(`seed.json updated (${rows.length} elements). Затем: npm run seed && npm run test`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(`fetch-elements: ${e instanceof Error ? e.message : e}`);
    process.exitCode = 1;
  });
}
