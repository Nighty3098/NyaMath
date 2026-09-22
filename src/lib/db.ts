/**
 * NyaMath.db — единый источник справочных данных (константы, материалы,
 * формулы, сниппеты, sim-пресеты, демо-наборы, SI-префиксы).
 *
 * Драйверы: sql.js (WASM, браузер) и node:sqlite (Node: тесты, MCP, seed).
 * Все таблицы при init целиком уходят в память — геттеры синхронные,
 * хот-пути движка (buildPackScope) не замечают разницы с бывшими константами.
 *
 * Браузер обязан вызвать `await initDb()` в main.tsx до первого рендера.
 * В Node init синхронный: setup-файл витеста и main() MCP-сервера.
 */
import type { LText, PackId } from '../i18n';
import type { SimModel, SimModelParam } from '../engine/simEngine';
import type { Snippet } from '../engine/packs';

export type Row = Record<string, unknown>;

export interface Driver {
  all(sql: string): Row[];
}

let driver: Driver | null = null;
let dbPathUsed = '';

/* ---------------- кэши таблиц ---------------- */

const constants = new Map<string, ConstantRow>();
const materials: Material[] = [];
const materialById = new Map<string, Material>();
const matPropNames = new Map<string, { ru: string; en: string }>();
const formulaSections: FormulaSection[] = [];
const formulas: Formula[] = [];
const formulaById = new Map<string, Formula>();
const constSections: ConstSection[] = [];
const constEntries: ConstEntry[] = [];
const snippets: Snippet[] = [];
const simModels: SimModel[] = [];
const simById = new Map<string, SimModel>();
const demoBySuite = new Map<string, DemoItem[]>();
const templates: Template[] = [];
const templateById = new Map<string, Template>();
const elements: ElementRow[] = [];
const elementByNumber = new Map<number, ElementRow>();
let prefixes: Array<{ prefix: string; mult: number; len: number }> = [];

export interface ConstantRow {
  name: string;
  value: number;
  unit: string | null;
  kind: string;
  section: string | null;
  label_ru: string | null;
  label_en: string | null;
  hint_ru: string | null;
  hint_en: string | null;
  source: string | null;
}

export interface Material {
  id: string;
  en: string;
  ru: string;
  formula: string;
  type: 'metal' | 'dielectric' | 'semiconductor';
  props: Partial<Record<string, number>>;
}

export type MatPropKey =
  'sigma' | 'rho' | 'eps_r' | 'mu_r' | 'alpha_res' | 'melting' | 'ct' | 'cp' | 'bandgap';

export const MAT_PROP_KEYS: readonly MatPropKey[] = [
  'sigma',
  'rho',
  'eps_r',
  'mu_r',
  'alpha_res',
  'melting',
  'ct',
  'cp',
  'bandgap',
];

export interface FormulaSection {
  id: string;
  label: LText;
}

export interface FormulaSource {
  title: string;
  url: string;
}

export interface FormulaVar {
  name: string;
  label: LText;
}

export interface Formula {
  id: string;
  section: string;
  label: LText;
  hint: LText;
  code: string;
  sources: FormulaSource[];
  vars?: FormulaVar[];
  plot2d?: string;
  plot3d?: string;
  sim?: string;
}

export interface ConstSection {
  id: string;
  label: LText;
}

export interface ConstEntry {
  id: string;
  section: string;
  label: LText;
  hint: LText;
  code: string;
  sources: FormulaSource[];
}

export interface DemoItem {
  kind: 'math' | 'text' | 'plot' | 'program';
  raw: string;
  exportName?: string;
  plotFn?: string;
  plotXmin?: number;
  plotXmax?: number;
}

export interface ElementRow {
  number: number;
  symbol: string;
  name_en: string;
  name_ru: string | null;
  atomic_mass: number | null;
  phase: string | null;
  /** г/л для газов, г/см³ для остальных (как в источнике) */
  density: number | null;
  /** K */
  melt: number | null;
  /** K */
  boil: number | null;
  group_no: number | null;
  period: number;
  electron_config: string | null;
  electronegativity: number | null;
  molar_heat: number | null;
  category: string | null;
  discovered: string | null;
  source: string | null;
}

export interface TemplateLine {
  kind: 'math' | 'text' | 'program' | 'plot';
  raw: string;
  /** program: имя наружу (exportName); plot: выражение и диапазон */
  exportName?: string;
  plotFn?: string;
  plotXmin?: number;
  plotXmax?: number;
  plotLogx?: boolean;
}

export interface Template {
  id: string;
  section: string;
  title: LText;
  desc: LText;
  lines: TemplateLine[];
  standard: string | null;
}

/* ---------------- lifecycle ---------------- */

export function isDbReady(): boolean {
  return driver !== null;
}

export function dbPath(): string {
  return dbPathUsed;
}

function assertDb(): Driver {
  if (!driver)
    throw new Error(
      'NyaMath.db not initialized (browser: await initDb(); node: setDriver(openNodeDb()))',
    );
  return driver;
}

/** Подключить готовый драйвер (sql.js / node:sqlite) и прогреть кэши. */
export function setDriver(d: Driver, path: string): void {
  driver = d;
  dbPathUsed = path;
  loadAll();
}

const str = (v: unknown): string => String(v ?? '');
const num = (v: unknown): number => Number(v);
const optStr = (v: unknown): string | undefined =>
  v === null || v === undefined || v === '' ? undefined : String(v);
const optNum = (v: unknown): number | undefined =>
  v === null || v === undefined || v === '' ? undefined : Number(v);
const nulStr = (v: unknown): string | null => (v === null || v === undefined ? null : String(v));

/** Сырые строки таблиц — для snapshotDb()/hydrateDb (воркер без sql.js). */
let rawTables: Record<string, Row[]> = {};

function readAllTables(db: Driver): Record<string, Row[]> {
  const tables = [
    'constants',
    'materials',
    'mat_prop_names',
    'formula_sections',
    'formulas',
    'formula_sources',
    'formula_vars',
    'const_sections',
    'const_entries',
    'const_sources',
    'snippets',
    'sim_models',
    'demo_lines',
    'templates',
    'elements',
    'unit_prefixes',
  ];
  return Object.fromEntries(tables.map((t) => [t, db.all(`SELECT * FROM ${t}`)]));
}

function loadAll(): void {
  const db = assertDb();
  ingest(readAllTables(db));
}

/** Заполнить кэши из сырых строк (общее для driver/snapshot путей). */
function ingest(t: Record<string, Row[]>): void {
  rawTables = t;
  // сортировка по ord: устойчива и для таблиц без ord (все ключи 0)
  const q = (name: string): Row[] =>
    [...(t[name] ?? [])].sort((a, b) => Number(a['ord'] ?? 0) - Number(b['ord'] ?? 0));
  const rows = q;
  constants.clear();
  for (const r of rows('constants')) {
    constants.set(str(r['name']), {
      name: str(r['name']),
      value: num(r['value']),
      unit: nulStr(r['unit']),
      kind: str(r['kind']),
      section: nulStr(r['section']),
      label_ru: nulStr(r['label_ru']),
      label_en: nulStr(r['label_en']),
      hint_ru: nulStr(r['hint_ru']),
      hint_en: nulStr(r['hint_en']),
      source: nulStr(r['source']),
    });
  }
  materials.length = 0;
  materialById.clear();
  for (const r of rows('materials')) {
    const props: Partial<Record<string, number>> = {};
    for (const k of MAT_PROP_KEYS) {
      if (r[k] !== null && r[k] !== undefined) props[k] = Number(r[k]);
    }
    const m: Material = {
      id: str(r['id']),
      en: str(r['en']),
      ru: str(r['ru']),
      formula: str(r['formula']),
      type: r['type'] as Material['type'],
      props,
    };
    materials.push(m);
    materialById.set(m.id, m);
  }
  matPropNames.clear();
  for (const r of rows('mat_prop_names')) {
    matPropNames.set(str(r['prop']), { ru: str(r['ru']), en: str(r['en']) });
  }
  formulaSections.length = 0;
  for (const r of q('formula_sections')) {
    formulaSections.push({
      id: str(r['id']),
      label: { ru: str(r['label_ru']), en: str(r['label_en']) },
    });
  }
  const sourcesByF = new Map<string, FormulaSource[]>();
  for (const r of q('formula_sources')) {
    const arr = sourcesByF.get(str(r['formula_id'])) ?? [];
    arr.push({ title: str(r['title']), url: str(r['url']) });
    sourcesByF.set(str(r['formula_id']), arr);
  }
  const varsByF = new Map<string, FormulaVar[]>();
  for (const r of q('formula_vars')) {
    const arr = varsByF.get(str(r['formula_id'])) ?? [];
    arr.push({ name: str(r['name']), label: { ru: str(r['label_ru']), en: str(r['label_en']) } });
    varsByF.set(str(r['formula_id']), arr);
  }
  formulas.length = 0;
  formulaById.clear();
  for (const r of q('formulas')) {
    const vars = varsByF.get(str(r['id']));
    const f: Formula = {
      id: str(r['id']),
      section: str(r['section']),
      label: { ru: str(r['label_ru']), en: str(r['label_en']) },
      hint: { ru: str(r['hint_ru']), en: str(r['hint_en']) },
      code: str(r['code']),
      sources: sourcesByF.get(str(r['id'])) ?? [],
      ...(vars?.length ? { vars } : {}),
      ...(optStr(r['plot2d']) !== undefined ? { plot2d: optStr(r['plot2d']) as string } : {}),
      ...(optStr(r['plot3d']) !== undefined ? { plot3d: optStr(r['plot3d']) as string } : {}),
      ...(optStr(r['sim']) !== undefined ? { sim: optStr(r['sim']) as string } : {}),
    };
    formulas.push(f);
    formulaById.set(f.id, f);
  }
  constSections.length = 0;
  for (const r of q('const_sections')) {
    constSections.push({
      id: str(r['id']),
      label: { ru: str(r['label_ru']), en: str(r['label_en']) },
    });
  }
  const srcByE = new Map<string, FormulaSource[]>();
  for (const r of q('const_sources')) {
    const arr = srcByE.get(str(r['entry_id'])) ?? [];
    arr.push({ title: str(r['title']), url: str(r['url']) });
    srcByE.set(str(r['entry_id']), arr);
  }
  constEntries.length = 0;
  for (const r of q('const_entries')) {
    (constEntries as ConstEntry[]).push({
      id: str(r['id']),
      section: str(r['section']),
      label: { ru: str(r['label_ru']), en: str(r['label_en']) },
      hint: { ru: str(r['hint_ru']), en: str(r['hint_en']) },
      code: str(r['code']),
      sources: srcByE.get(str(r['id'])) ?? [],
    });
  }
  snippets.length = 0;
  for (const r of q('snippets')) {
    (snippets as Snippet[]).push({
      pack: str(r['pack']) as PackId,
      kind: str(r['kind']) as Snippet['kind'],
      label: { ru: str(r['label_ru']), en: str(r['label_en']) },
      hint: { ru: str(r['hint_ru']), en: str(r['hint_en']) },
      code: str(r['code']),
      ...(optStr(r['doc']) !== undefined ? { doc: optStr(r['doc']) as string } : {}),
      ...(optStr(r['exportName']) !== undefined
        ? { exportName: optStr(r['exportName']) as string }
        : {}),
      ...(optStr(r['vars']) !== undefined ? { vars: optStr(r['vars']) as string } : {}),
      ...(optStr(r['plot2d']) !== undefined ? { plot2d: optStr(r['plot2d']) as string } : {}),
      ...(optStr(r['plot_json']) !== undefined
        ? { plot: JSON.parse(optStr(r['plot_json']) as string) as Snippet['plot'] }
        : {}),
    });
  }
  simModels.length = 0;
  simById.clear();
  for (const r of q('sim_models')) {
    const m = {
      id: str(r['id']),
      domain: str(r['domain']),
      label: { ru: str(r['label_ru']), en: str(r['label_en']) },
      desc: { ru: str(r['desc_ru']), en: str(r['desc_en']) },
      ...(optStr(r['mode']) !== undefined ? { mode: optStr(r['mode']) } : {}),
      ...(optStr(r['events']) !== undefined ? { events: optStr(r['events']) } : {}),
      states: str(r['states']),
      derivs: str(r['derivs']),
      aux: str(r['aux']),
      params: JSON.parse(str(r['params_json'])) as SimModelParam[],
      init: str(r['init']),
      t0: num(r['t0']),
      t1: num(r['t1']),
      dt: num(r['dt']),
      solver: str(r['solver']),
      x: str(r['x']),
      y: str(r['y']),
      ...(optStr(r['fdtd_json']) !== undefined
        ? { fdtd: JSON.parse(optStr(r['fdtd_json']) as string) }
        : {}),
    } as unknown as SimModel;
    simModels.push(m);
    simById.set(m.id, m);
  }
  demoBySuite.clear();
  for (const r of q('demo_lines')) {
    const arr = demoBySuite.get(str(r['suite'])) ?? [];
    arr.push({
      kind: str(r['kind']) as DemoItem['kind'],
      raw: str(r['raw']),
      ...(optStr(r['exportName']) !== undefined
        ? { exportName: optStr(r['exportName']) as string }
        : {}),
      ...(optStr(r['plotFn']) !== undefined ? { plotFn: optStr(r['plotFn']) as string } : {}),
      ...(optNum(r['plotXmin']) !== undefined ? { plotXmin: optNum(r['plotXmin']) as number } : {}),
      ...(optNum(r['plotXmax']) !== undefined ? { plotXmax: optNum(r['plotXmax']) as number } : {}),
    });
    demoBySuite.set(str(r['suite']), arr);
  }
  templates.length = 0;
  templateById.clear();
  for (const r of q('templates')) {
    let lines: TemplateLine[] = [];
    try {
      const parsed = JSON.parse(str(r['lines_json'])) as Array<Record<string, unknown>>;
      if (Array.isArray(parsed)) {
        lines = parsed
          .filter((l) => typeof l?.raw === 'string')
          .map((l) => {
            const kind =
              l['kind'] === 'text'
                ? 'text'
                : l['kind'] === 'program'
                  ? 'program'
                  : l['kind'] === 'plot'
                    ? 'plot'
                    : 'math';
            const ln: TemplateLine = { kind, raw: String(l['raw']) };
            if (typeof l['exportName'] === 'string' && l['exportName'])
              ln.exportName = l['exportName'];
            if (typeof l['plotFn'] === 'string' && l['plotFn']) ln.plotFn = l['plotFn'];
            if (typeof l['plotXmin'] === 'number' && isFinite(l['plotXmin']))
              ln.plotXmin = l['plotXmin'];
            if (typeof l['plotXmax'] === 'number' && isFinite(l['plotXmax']))
              ln.plotXmax = l['plotXmax'];
            if (l['plotLogx'] === true) ln.plotLogx = true;
            return ln;
          });
      }
    } catch {
      lines = [];
    }
    const tpl: Template = {
      id: str(r['id']),
      section: str(r['section']),
      title: { ru: str(r['title_ru']), en: str(r['title_en']) },
      desc: { ru: str(r['desc_ru']), en: str(r['desc_en']) },
      lines,
      standard: optStr(r['standard']) ?? null,
    };
    templates.push(tpl);
    templateById.set(tpl.id, tpl);
  }
  prefixes = rows('unit_prefixes')
    .map((r) => ({ prefix: String(r['prefix']), mult: Number(r['mult']), len: Number(r['len']) }))
    .sort((a, b) => b.len - a.len || (a.prefix < b.prefix ? -1 : 1));
  elements.length = 0;
  elementByNumber.clear();
  for (const r of q('elements')) {
    const num = (v: unknown): number | null =>
      v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v);
    const el: ElementRow = {
      number: Number(r['number']),
      symbol: str(r['symbol']),
      name_en: str(r['name_en']),
      name_ru: optStr(r['name_ru']) ?? null,
      atomic_mass: num(r['atomic_mass']),
      phase: optStr(r['phase']) ?? null,
      density: num(r['density']),
      melt: num(r['melt']),
      boil: num(r['boil']),
      group_no: num(r['group_no']),
      period: Number(r['period']),
      electron_config: optStr(r['electron_config']) ?? null,
      electronegativity: num(r['electronegativity']),
      molar_heat: num(r['molar_heat']),
      category: optStr(r['category']) ?? null,
      discovered: optStr(r['discovered']) ?? null,
      source: optStr(r['source']) ?? null,
    };
    elements.push(el);
    elementByNumber.set(el.number, el);
  }
}

/* ---------------- геттеры (синхронно, из кэша) ---------------- */

function ready(): void {
  if (!driver)
    throw new Error(
      'NyaMath.db not initialized (browser: await initDb(); node: setDriver(openNodeDb()))',
    );
}

/** Значение константы по имени в scope (c_light, mu_0, ...). */
export function getConstant(name: string): number {
  ready();
  const c = constants.get(name);
  if (!c) throw new Error(`unknown constant: ${name}`);
  return c.value;
}

/** Единица константы из БД (строка seed.json: «m/s», «J·s», «N/A²») или null. */
export function getConstantUnit(name: string): string | null {
  ready();
  const c = constants.get(name);
  if (!c) throw new Error(`unknown constant: ${name}`);
  const u = (c.unit ?? '').trim();
  return u ? u : null;
}

const SUPERSCRIPT: Record<string, string> = {
  '⁰': '0',
  '¹': '1',
  '²': '2',
  '³': '3',
  '⁴': '4',
  '⁵': '5',
  '⁶': '6',
  '⁷': '7',
  '⁸': '8',
  '⁹': '9',
  '⁻': '-',
  '⁺': '+',
};

/**
 * Единица seed.json → синтаксис mathjs: «·» → «*», суперскрипты → ^n,
 * обратные («mol⁻¹») → «1/mol».
 * Важно: БЕЗ скобок вокруг показателя («m^2», а не «m^(2)») — двухаргументный
 * math.unit(value, unit) не парсит `^(...)`, только голую степень.
 * «J·s» → «J*s», «m⁻¹» → «1/m», «N/A²» → «N/A^2».
 */
export function normalizeUnitString(u: string): string {
  // обратные единицы разбираем до суперскриптов: «mol⁻¹» → «1/mol»
  const inv = /^(.+)⁻¹$/.exec(u.replaceAll('·', '*'));
  if (inv) return `1/${inv[1]}`;
  return u.replaceAll('·', '*').replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]/g, (ch) => `^${SUPERSCRIPT[ch]}`);
}

/** Все константы имя → значение (для buildPackScope). */
export function constantsMap(): Record<string, number> {
  ready();
  const o: Record<string, number> = {};
  for (const [k, v] of constants) o[k] = v.value;
  return o;
}

export function listConstants(): ConstantRow[] {
  ready();
  return [...constants.values()];
}

export function listMaterials(): Material[] {
  ready();
  return materials;
}

export function getMaterial(id: string): Material | null {
  ready();
  return materialById.get(id) ?? null;
}

const normKey = (s: string): string => s.toLowerCase().replace(/[^a-zа-я0-9]/gi, '');

/** Поиск материала по id/en/ru/формуле (как раньше в materials.ts). */
export function findMaterial(q: string): Material | null {
  ready();
  const nq = normKey(q);
  if (!nq) return null;
  let partial: Material | null = null;
  for (const m of materials) {
    const keys = [m.id, m.en, m.ru, m.formula].map(normKey);
    for (const k of keys) {
      if (!k) continue;
      if (k === nq) return m;
      if (!partial && k.startsWith(nq)) partial = m;
    }
  }
  return partial;
}

export function matPropName(prop: string, lang: 'ru' | 'en'): string {
  ready();
  return matPropNames.get(prop)?.[lang] ?? prop;
}

export function listFormulaSections(): FormulaSection[] {
  ready();
  return formulaSections;
}

export function listFormulas(section?: string): Formula[] {
  ready();
  return section ? formulas.filter((f) => f.section === section) : formulas;
}

export function getFormula(id: string): Formula | null {
  ready();
  return formulaById.get(id) ?? null;
}

export function formulaVars(formulaId: string): FormulaVar[] {
  ready();
  return formulaById.get(formulaId)?.vars ?? [];
}

export function listConstSections(): ConstSection[] {
  ready();
  return constSections;
}

export function listConstEntries(section?: string): ConstEntry[] {
  ready();
  return section ? constEntries.filter((e) => e.section === section) : constEntries;
}

export function listSnippets(): Snippet[] {
  ready();
  return snippets;
}

export function listSimModels(): SimModel[] {
  ready();
  return simModels;
}

export function getSimModelDb(id: string): SimModel | null {
  ready();
  return simById.get(id) ?? null;
}

export function getDemoLines(suite: 'variant20'): string[] {
  ready();
  return (demoBySuite.get(suite) ?? []).map((d) => d.raw);
}

export function getDemoItems(suite: 'advanced'): DemoItem[] {
  ready();
  return demoBySuite.get(suite) ?? [];
}

/** Шаблоны расчётов (балки/цепи/допуски/тепло/МКЭ/…), порядок — по ord. */
export function listTemplates(): Template[] {
  ready();
  return [...templates];
}

/** Разделы шаблонов в порядке первого появления (для группировки в меню). */
export function listTemplateSections(): string[] {
  ready();
  const out: string[] = [];
  for (const t of templates) {
    if (!out.includes(t.section)) out.push(t.section);
  }
  return out;
}

export function getTemplate(id: string): Template | null {
  ready();
  return templateById.get(id) ?? null;
}

/** Все химические элементы 1..118 по номеру. */
export function listElements(): ElementRow[] {
  ready();
  return [...elements];
}

export function getElement(number: number): ElementRow | null {
  ready();
  return elementByNumber.get(number) ?? null;
}

/** Поиск: символ (Fe), номер (26) или подстрока ru/en-названия. */
export function findElement(q: string): ElementRow | null {
  ready();
  const nq = q.trim().toLowerCase();
  if (!nq) return null;
  const byNum = Number(nq);
  if (Number.isInteger(byNum) && elementByNumber.has(byNum))
    return elementByNumber.get(byNum) ?? null;
  for (const el of elements) {
    if (el.symbol.toLowerCase() === nq) return el;
  }
  for (const el of elements) {
    if (el.name_en.toLowerCase().includes(nq) || (el.name_ru ?? '').toLowerCase().includes(nq))
      return el;
  }
  return null;
}

export function unitPrefixes(): Array<{ prefix: string; mult: number; len: number }> {
  ready();
  return prefixes;
}

/* ---------------- snapshot для Web Worker (без sql.js в чанке) ---------------- */

export type DbSnapshot = Record<string, Row[]>;

/** Сырые строки таблиц — structured-cloneable, едут в воркер одним сообщением. */
export function snapshotDb(): DbSnapshot {
  ready();
  return rawTables;
}

/** Заполнить кэши из снапшота (воркер; sql.js не нужен). */
export function hydrateDb(snap: DbSnapshot): void {
  ingest(snap);
}

/* ---------------- init (см. db-browser.ts / db-node.ts) ---------------- */

/** Подключить драйвер sql.js как Driver для setDriver(). */
export function sqlJsDriver(db: {
  exec(sql: string): Array<{ columns: string[]; values: unknown[][] }>;
}): Driver {
  return {
    all: (sql: string): Row[] =>
      db
        .exec(sql)
        .flatMap((t) =>
          t.values.map((vals) => Object.fromEntries(t.columns.map((c, i) => [c, vals[i]]))),
        ),
  };
}
