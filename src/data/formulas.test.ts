import { describe, expect, it } from 'vitest';
import { recalculateAll } from '../engine/dependencies';
import { FORMULAS, FORMULA_SECTIONS } from './formulas';
import { getLang } from '../i18n';

describe('formula catalog', () => {
  it('sections and formulas are consistent', () => {
    const ids = new Set(FORMULA_SECTIONS.map((s) => s.id));
    expect(ids.size).toBe(FORMULA_SECTIONS.length);
    for (const f of FORMULAS) {
      expect(ids.has(f.section), `${f.id}: unknown section ${f.section}`).toBe(true);
      expect(f.sources.length, `${f.id}: no sources`).toBeGreaterThan(0);
      for (const src of f.sources) expect(src.url.startsWith('http'), `${f.id}: bad url`).toBe(true);
    }
    const fid = new Set(FORMULAS.map((f) => f.id));
    expect(fid.size).toBe(FORMULAS.length);
  });

  it('labels are localized', () => {
    for (const f of FORMULAS) {
      expect(f.label.ru.length).toBeGreaterThan(0);
      expect(f.label.en.length).toBeGreaterThan(0);
      expect(f.hint.ru.length).toBeGreaterThan(0);
      expect(f.hint.en.length).toBeGreaterThan(0);
    }
    expect(getLang()).toMatch(/^(ru|en)$/);
  });

  it('every formula evaluates through the real recalc path', () => {
    expect(FORMULAS.length).toBeGreaterThan(0);
    for (const f of FORMULAS) {
      const block = {
        id: `f-${f.id}`, x: 0, y: 0, rawInput: f.code, displayLatex: '', resultStr: '',
        resultLatex: '', resultValue: null, error: null,
        dependencies: [], definedVar: null, isOutput: true, kind: 'math' as const,
      };
      const res = recalculateAll([block]);
      const b = res.blocks[`f-${f.id}`];
      expect(b, f.id).toBeTruthy();
      expect(b.error, `${f.id} [${f.code}]: ${b.error ?? ''}`).toBeNull();
    }
  });

  it('every formula also evaluates split into per-line blocks (palette insert path)', () => {
    for (const f of FORMULAS) {
      const lines = f.code.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);
      if (lines.length <= 1) continue;
      const blocks = lines.map((rawInput, k) => ({
        id: `fs-${f.id}-${k}`, x: 0, y: k * 64, rawInput, displayLatex: '', resultStr: '',
        resultLatex: '', resultValue: null, error: null,
        dependencies: [], definedVar: null, isOutput: true, kind: 'math' as const,
      }));
      const res = recalculateAll(blocks);
      for (const b of Object.values(res.blocks)) {
        expect(b.error, `${f.id} [${b.rawInput}]: ${b.error ?? ''}`).toBeNull();
      }
    }
  });

  it('catalog is non-empty and covers all sections', () => {
    expect(FORMULAS.length).toBeGreaterThan(0);
    for (const sec of FORMULA_SECTIONS) {
      const n = FORMULAS.filter((f) => f.section === sec.id).length;
      expect(n, `section ${sec.id} has ${n} formulas`).toBeGreaterThanOrEqual(20);
    }
  });
});
