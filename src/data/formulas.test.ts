import { describe, expect, it } from 'vitest';
import { recalculateAll } from '../engine/dependencies';
import { compilePlotExpr, preprocessJ, preprocessRanges } from '../engine/mathEngine';
import { samplePlotBlock } from '../engine/plotSample';
import { samplePlot3d } from '../engine/plot3dSample';
import { getSimModel } from '../engine/simEngine';
import { formulaVars, listFormulas, listFormulaSections } from '../lib/db';
import { getLang } from '../i18n';

describe('formula catalog', () => {
  it('sections and formulas are consistent', () => {
    const ids = new Set(listFormulaSections().map((s) => s.id));
    expect(ids.size).toBe(listFormulaSections().length);
    for (const f of listFormulas()) {
      expect(ids.has(f.section), `${f.id}: unknown section ${f.section}`).toBe(true);
      expect(f.sources.length, `${f.id}: no sources`).toBeGreaterThan(0);
      for (const src of f.sources)
        expect(src.url.startsWith('http'), `${f.id}: bad url`).toBe(true);
    }
    const fid = new Set(listFormulas().map((f) => f.id));
    expect(fid.size).toBe(listFormulas().length);
  });

  it('labels are localized', () => {
    for (const f of listFormulas()) {
      expect(f.label.ru.length).toBeGreaterThan(0);
      expect(f.label.en.length).toBeGreaterThan(0);
      expect(f.hint.ru.length).toBeGreaterThan(0);
      expect(f.hint.en.length).toBeGreaterThan(0);
    }
    expect(getLang()).toMatch(/^(ru|en)$/);
  });

  it('every formula evaluates through the real recalc path', () => {
    expect(listFormulas().length).toBeGreaterThan(0);
    for (const f of listFormulas()) {
      const block = {
        id: `f-${f.id}`,
        x: 0,
        y: 0,
        rawInput: f.code,
        displayLatex: '',
        resultStr: '',
        resultLatex: '',
        resultValue: null,
        error: null,
        dependencies: [],
        definedVar: null,
        isOutput: true,
        kind: 'math' as const,
      };
      const res = recalculateAll([block]);
      const b = res.blocks[`f-${f.id}`];
      expect(b, f.id).toBeTruthy();
      expect(b.error, `${f.id} [${f.code}]: ${b.error ?? ''}`).toBeNull();
    }
  });

  it('every formula also evaluates split into per-line blocks (palette insert path)', () => {
    for (const f of listFormulas()) {
      const lines = f.code
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l.length > 0);
      if (lines.length <= 1) continue;
      const blocks = lines.map((rawInput, k) => ({
        id: `fs-${f.id}-${k}`,
        x: 0,
        y: k * 64,
        rawInput,
        displayLatex: '',
        resultStr: '',
        resultLatex: '',
        resultValue: null,
        error: null,
        dependencies: [],
        definedVar: null,
        isOutput: true,
        kind: 'math' as const,
      }));
      const res = recalculateAll(blocks);
      for (const b of Object.values(res.blocks)) {
        expect(b.error, `${f.id} [${b.rawInput}]: ${b.error ?? ''}`).toBeNull();
      }
    }
  });

  it('variable legends cover every formula with assignments', () => {
    const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    for (const f of listFormulas()) {
      const vars = formulaVars(f.id);
      // легенда обязана быть ровно у формул с присваиваниями
      expect(Boolean(vars?.length), `${f.id}: legend presence mismatch`).toBe(
        f.code.includes(':='),
      );
      expect(f.vars, `${f.id}: vars not merged`).toEqual(vars.length ? vars : undefined);
      const seen = new Set<string>();
      for (const v of vars ?? []) {
        expect(v.name.length, `${f.id}: empty var name`).toBeGreaterThan(0);
        expect(seen.has(v.name), `${f.id}: duplicate var ${v.name}`).toBe(false);
        seen.add(v.name);
        expect(v.label.ru.length, `${f.id}/${v.name}: empty ru`).toBeGreaterThan(0);
        expect(v.label.en.length, `${f.id}/${v.name}: empty en`).toBeGreaterThan(0);
        const re = new RegExp(`(?<![A-Za-z0-9_])${esc(v.name)}(?![A-Za-z0-9_])`);
        expect(re.test(f.code), `${f.id}: var ${v.name} not found in code`).toBe(true);
      }
    }
  });

  it('plot and sim attachments are valid', () => {
    let plots = 0;
    let sims = 0;
    for (const f of listFormulas()) {
      for (const key of ['plot2d', 'plot3d'] as const) {
        const expr = f[key];
        if (expr === undefined) continue;
        expect(expr.trim().length, `${f.id}: empty ${key}`).toBeGreaterThan(0);
        for (const part of expr.split(';')) {
          const compiled = compilePlotExpr(
            preprocessRanges(`(${preprocessJ(part.trim(), false)})`),
          );
          expect(compiled, `${f.id}: ${key} does not compile [${part.trim()}]`).not.toBeNull();
        }
        plots++;
      }
      if (f.sim !== undefined) {
        expect(getSimModel(f.sim), `${f.id}: unknown sim model ${f.sim}`).toBeTruthy();
        sims++;
      }
    }
    expect(plots, 'no plot attachments').toBeGreaterThan(0);
    expect(sims, 'no sim attachments').toBeGreaterThan(0);
  });

  it('every attached plot renders points in its formula scope', () => {
    for (const f of listFormulas()) {
      if (f.plot2d === undefined && f.plot3d === undefined) continue;
      const block = {
        id: `p-${f.id}`,
        x: 0,
        y: 0,
        rawInput: f.code,
        displayLatex: '',
        resultStr: '',
        resultLatex: '',
        resultValue: null,
        error: null,
        dependencies: [],
        definedVar: null,
        isOutput: true,
        kind: 'math' as const,
      };
      const res = recalculateAll([block]);
      if (f.plot2d !== undefined) {
        const s = samplePlotBlock(f.plot2d, res.scope, -10, 10, 60);
        const n = (s?.series ?? [])
          .flatMap((ser) => ser.ys)
          .filter((y) => typeof y === 'number' && isFinite(y)).length;
        expect(n, `${f.id}: plot2d is empty on default range`).toBeGreaterThanOrEqual(1);
      }
      if (f.plot3d !== undefined) {
        const s = samplePlot3d(f.plot3d, res.scope, {
          xmin: -5,
          xmax: 5,
          ymin: -5,
          ymax: 5,
          res: 12,
          mode: 'auto',
        });
        const zs = ((s as { zs?: unknown[][] } | null)?.zs ?? []).flat(Infinity);
        expect(
          zs.some((z) => typeof z === 'number' && isFinite(z)),
          `${f.id}: plot3d is empty`,
        ).toBe(true);
      }
    }
  });

  it('catalog is non-empty and covers all sections', () => {
    expect(listFormulas().length).toBeGreaterThan(0);
    for (const sec of listFormulaSections()) {
      const n = listFormulas().filter((f) => f.section === sec.id).length;
      expect(n, `section ${sec.id} has ${n} formulas`).toBeGreaterThanOrEqual(20);
    }
  });
});
