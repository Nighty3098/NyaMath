-- NyaMath.db — единый источник справочных данных.
-- Правки вносятся сюда (db/seed-data.sql), затем `npm run seed`.
-- НЕ путать: i18n-строки интерфейса, код функций паков и PACK_NAMES остаются в TS.

PRAGMA journal_mode = DELETE;

CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Физические константы: name = имя в scope движка.
CREATE TABLE IF NOT EXISTS constants (
  name TEXT PRIMARY KEY,
  value REAL NOT NULL,
  unit TEXT,
  kind TEXT NOT NULL,              -- 'exact' | 'measured' | 'defined'
  section TEXT,                    -- fundamental | measured | standards (для палитры)
  label_ru TEXT,
  label_en TEXT,
  hint_ru TEXT,
  hint_en TEXT,
  source TEXT                      -- URL источника значения
);

-- Материалы: свойства фиксированным набором колонок.
CREATE TABLE IF NOT EXISTS materials (
  id TEXT PRIMARY KEY,
  en TEXT NOT NULL,
  ru TEXT NOT NULL,
  formula TEXT NOT NULL,
  type TEXT NOT NULL,              -- 'metal' | 'dielectric' | 'semiconductor'
  sigma REAL,
  rho REAL,
  eps_r REAL,
  mu_r REAL,
  alpha_res REAL,
  melting REAL,
  ct REAL,
  cp REAL,
  bandgap REAL
);

-- Подписи свойств материалов (UI).
CREATE TABLE IF NOT EXISTS mat_prop_names (
  prop TEXT PRIMARY KEY,
  ru TEXT NOT NULL,
  en TEXT NOT NULL
);

-- Формулы: разделы, записи, источники, легенды переменных.
CREATE TABLE IF NOT EXISTS formula_sections (
  id TEXT PRIMARY KEY,
  ord INTEGER NOT NULL,
  label_ru TEXT NOT NULL,
  label_en TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS formulas (
  id TEXT PRIMARY KEY,
  section TEXT NOT NULL REFERENCES formula_sections(id),
  ord INTEGER NOT NULL,
  label_ru TEXT NOT NULL,
  label_en TEXT NOT NULL,
  hint_ru TEXT NOT NULL,
  hint_en TEXT NOT NULL,
  code TEXT NOT NULL,
  plot2d TEXT,
  plot3d TEXT,
  sim TEXT
);

CREATE TABLE IF NOT EXISTS formula_sources (
  formula_id TEXT NOT NULL REFERENCES formulas(id),
  ord INTEGER NOT NULL,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  PRIMARY KEY (formula_id, ord)
);

CREATE TABLE IF NOT EXISTS formula_vars (
  formula_id TEXT NOT NULL REFERENCES formulas(id),
  ord INTEGER NOT NULL,
  name TEXT NOT NULL,
  label_ru TEXT NOT NULL,
  label_en TEXT NOT NULL,
  PRIMARY KEY (formula_id, ord)
);

-- Константы для палитры (ссылаются на scope-имена из constants.code).
CREATE TABLE IF NOT EXISTS const_sections (
  id TEXT PRIMARY KEY,
  ord INTEGER NOT NULL,
  label_ru TEXT NOT NULL,
  label_en TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS const_entries (
  id TEXT PRIMARY KEY,
  section TEXT NOT NULL REFERENCES const_sections(id),
  ord INTEGER NOT NULL,
  label_ru TEXT NOT NULL,
  label_en TEXT NOT NULL,
  hint_ru TEXT NOT NULL,
  hint_en TEXT NOT NULL,
  code TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS const_sources (
  entry_id TEXT NOT NULL REFERENCES const_entries(id),
  ord INTEGER NOT NULL,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  PRIMARY KEY (entry_id, ord)
);

-- Сниппеты палитры вставки (бывший SNIPPETS из packs.ts).
CREATE TABLE IF NOT EXISTS snippets (
  ord INTEGER PRIMARY KEY,
  pack TEXT NOT NULL,
  kind TEXT NOT NULL,              -- 'math' | 'plot' | 'program' | 'sim' | 'contour'
  label_ru TEXT NOT NULL,
  label_en TEXT NOT NULL,
  hint_ru TEXT NOT NULL,
  hint_en TEXT NOT NULL,
  code TEXT NOT NULL,
  doc TEXT,
  exportName TEXT,
  vars TEXT,
  plot2d TEXT,
  plot_json TEXT                   -- пресет plot-блока (JSON) или NULL
);

-- Пресеты симуляций (бывший SIM_MODELS из simEngine.ts).
CREATE TABLE IF NOT EXISTS sim_models (
  id TEXT PRIMARY KEY,
  domain TEXT NOT NULL,
  ord INTEGER NOT NULL,
  label_ru TEXT NOT NULL,
  label_en TEXT NOT NULL,
  desc_ru TEXT NOT NULL,
  desc_en TEXT NOT NULL,
  mode TEXT,
  events TEXT,
  states TEXT NOT NULL,
  derivs TEXT NOT NULL,
  aux TEXT NOT NULL,
  params_json TEXT NOT NULL,       -- [{name, def}]
  init TEXT NOT NULL,
  t0 REAL NOT NULL,
  t1 REAL NOT NULL,
  dt REAL NOT NULL,
  solver TEXT NOT NULL,
  x TEXT NOT NULL,
  y TEXT NOT NULL,
  fdtd_json TEXT                   -- {...} или NULL
);

-- Демо-наборы (бывшие TEST_SCENARIO_LINES / ADVANCED_DEMO).
CREATE TABLE IF NOT EXISTS demo_lines (
  suite TEXT NOT NULL,             -- 'variant20' | 'advanced'
  ord INTEGER NOT NULL,
  kind TEXT NOT NULL,              -- 'math' | 'text' | 'plot' | 'program'
  raw TEXT NOT NULL,
  exportName TEXT,
  plotFn TEXT,
  plotXmin REAL,
  plotXmax REAL,
  PRIMARY KEY (suite, ord)
);

-- Шаблоны расчётов (fxSolver-библиотека, но версионированная в git):
-- готовые листы по балкам/цепям/допускам, вставка одной командой.
CREATE TABLE IF NOT EXISTS templates (
  id TEXT PRIMARY KEY,
  section TEXT NOT NULL,           -- 'beams' | 'circuits' | 'tolerances'
  ord INTEGER NOT NULL,
  title_ru TEXT NOT NULL,
  title_en TEXT NOT NULL,
  desc_ru TEXT NOT NULL,
  desc_en TEXT NOT NULL,
  lines_json TEXT NOT NULL,        -- [{kind: 'math'|'text', raw: '...'}]
  standard TEXT                    -- ГОСТ/норматив или NULL
);

-- SI-префиксы и точные единицы для подписей осей (бывший unitScale.ts).
CREATE TABLE IF NOT EXISTS unit_prefixes (
  prefix TEXT PRIMARY KEY,
  mult REAL NOT NULL,
  len INTEGER NOT NULL            -- длина префикса: матчить длинные первыми
);
