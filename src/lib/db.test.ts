import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import {
  dbPath,
  findElement,
  findMaterial,
  formulaVars,
  getConstant,
  getDemoItems,
  getDemoLines,
  getElement,
  getFormula,
  getMaterial,
  getSimModelDb,
  getTemplate,
  isDbReady,
  listConstEntries,
  listConstSections,
  listConstants,
  listElements,
  listFormulas,
  listFormulaSections,
  listMaterials,
  listSimModels,
  listSnippets,
  listTemplates,
  matPropName,
  unitPrefixes,
} from './db';

describe('NyaMath.db integrity', () => {
  it('db is ready', () => {
    expect(isDbReady()).toBe(true);
    expect(dbPath().length).toBeGreaterThan(0);
  });

  it('constants: anchors + scope coverage', () => {
    expect(getConstant('c_light')).toBe(299792458);
    expect(getConstant('h_planck')).toBeCloseTo(6.62607015e-34, 40);
    expect(getConstant('mu_0')).toBe(1.25663706127e-6);
    expect(getConstant('eta0')).toBe(getConstant('Z_0'));
    expect(getConstant('hbar')).toBeCloseTo(6.62607015e-34 / (2 * Math.PI), 15);
    expect(() => getConstant('nope')).toThrow();
    expect(listConstants().length).toBeGreaterThanOrEqual(25);
  });

  it('materials: rows, props, lookup', () => {
    expect(listMaterials().length).toBeGreaterThanOrEqual(20);
    const cu = getMaterial('copper');
    expect(cu?.props.sigma).toBe(5.96e7);
    expect(findMaterial('Cu')?.id).toBe('copper');
    expect(findMaterial('медь')?.id).toBe('copper');
    expect(findMaterial('FR-4')?.id).toBe('fr4');
    expect(findMaterial('???')).toBeNull();
    expect(matPropName('sigma', 'ru')).toContain('См/м');
    expect(matPropName('sigma', 'en')).toContain('S/m');
  });

  it('formulas: sections, entries, legends merged', () => {
    expect(listFormulaSections().length).toBeGreaterThanOrEqual(15);
    const all = listFormulas();
    expect(all.length).toBeGreaterThan(50);
    expect(listFormulas('kinematics').length).toBeGreaterThan(0);
    const f = getFormula('vel-uniform');
    expect(f?.code).toContain('v');
    expect(f?.vars?.map((v) => v.name)).toContain('t');
    expect(f?.sources.length).toBeGreaterThan(0);
    expect(formulaVars('vel-uniform').length).toBe((f?.vars ?? []).length);
    expect(getFormula('nope')).toBeNull();
  });

  it('const palette: entries resolve to scope names', () => {
    expect(listConstSections().length).toBeGreaterThan(0);
    expect(listConstEntries().length).toBeGreaterThan(0);
    for (const e of listConstEntries()) {
      expect(e.code.length).toBeGreaterThan(0);
      expect(e.sources.length).toBeGreaterThan(0);
    }
  });

  it('snippets: packs present', () => {
    const sn = listSnippets();
    expect(sn.length).toBeGreaterThan(20);
    expect(sn.some((s) => s.kind === 'plot')).toBe(true);
    expect(sn.some((s) => s.kind === 'program')).toBe(true);
    expect(sn[0]?.label.ru.length).toBeGreaterThan(0);
  });

  it('sim models: presets with params', () => {
    const models = listSimModels();
    expect(models.length).toBeGreaterThan(5);
    const p = getSimModelDb('pendulum');
    expect(p?.solver).toBe('rk4');
    expect(p?.params.length).toBeGreaterThan(0);
    expect(getSimModelDb('nope')).toBeNull();
  });

  it('demo suites', () => {
    const v20 = getDemoLines('variant20');
    expect(v20.length).toBeGreaterThan(30);
    expect(v20[1]).toBe('f := 10*10^9');
    const adv = getDemoItems('advanced');
    expect(adv.length).toBeGreaterThan(10);
    expect(adv[0]?.kind).toBe('text');
  });

  it('checked-in NyaMath.db matches db/seed.json (npm run seed)', () => {
    const root = path.resolve(path.dirname(dbPath()), '..');
    const schema = fs.readFileSync(path.join(root, 'db', 'schema.sql'), 'utf-8');
    const seed = JSON.parse(fs.readFileSync(path.join(root, 'db', 'seed.json'), 'utf-8')) as Record<string, Array<Record<string, unknown>>>;
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nyadb-'));
    const rebuilt = path.join(tmp, 'NyaMath.db');
    try {
      const db = new DatabaseSync(rebuilt);
      db.exec(schema);
      const toSql = (v: unknown): number | string | null => {
        if (v === null || v === undefined) return null;
        if (typeof v === 'number' || typeof v === 'string') return v;
        return JSON.stringify(v);
      };
      for (const [table, rows] of Object.entries(seed)) {
        if (!rows.length) continue;
        const cols = Object.keys(rows[0] ?? {});
        const stmt = db.prepare(`INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`);
        for (const r of rows) stmt.run(...cols.map((k) => toSql(r[k])));
      }
      const live = new DatabaseSync(dbPath(), { readOnly: true });
      for (const table of Object.keys(seed)) {
        const a = (db.prepare(`SELECT COUNT(*) n FROM ${table}`).get() as { n: number }).n;
        const b = (live.prepare(`SELECT COUNT(*) n FROM ${table}`).get() as { n: number }).n;
        expect(a, `table ${table} diverged: rebuild seed.json`).toBe(b);
      }
      live.close();
      db.close();
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('elements: 118 rows, Fe anchors, lookup', () => {
    const all = listElements();
    expect(all.length).toBe(118);
    expect(all.map((e) => e.number)).toEqual(Array.from({ length: 118 }, (_, k) => k + 1));
    const fe = getElement(26);
    expect(fe?.symbol).toBe('Fe');
    expect(fe?.name_ru).toBe('железо');
    expect(fe?.atomic_mass).toBeCloseTo(55.845, 2);
    expect(fe?.electron_config).toContain('3d6');
    expect(getElement(999)).toBeNull();
    expect(findElement('Fe')?.number).toBe(26);
    expect(findElement('26')?.symbol).toBe('Fe');
    expect(findElement('железо')?.number).toBe(26);
    expect(findElement('oxygen')?.symbol).toBe('O');
    expect(findElement('???')).toBeNull();
    // у каждого есть ru-название и масса
    expect(all.every((e) => (e.name_ru ?? '').length > 0)).toBe(true);
    expect(all.every((e) => e.atomic_mass !== null)).toBe(true);
    expect(getTemplate('beam-simply-uniform')?.lines.length).toBeGreaterThan(0);
    expect(listTemplates().length).toBe(6);
  });

  it('unit prefixes ordered longest-first', () => {
    const px = unitPrefixes();
    expect(px.length).toBeGreaterThan(20);
    for (let i = 1; i < px.length; i++) {
      expect(px[i - 1]?.len).toBeGreaterThanOrEqual(px[i]?.len ?? 0);
    }
    expect(px.find((p) => p.prefix === 'к')?.mult).toBe(1e3);
    expect(px.find((p) => p.prefix === 'Тл')?.mult).toBe(1);
  });
});
