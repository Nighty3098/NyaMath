import { describe, expect, it } from 'vitest';
import { recalculateAll } from '../engine/dependencies';
import { getLang } from '../i18n';
import { CONSTANTS, CONST_SECTIONS } from './constants';

describe('constants catalog', () => {
  it('sections and constants are consistent', () => {
    const ids = new Set(CONST_SECTIONS.map((s) => s.id));
    expect(ids.size).toBe(CONST_SECTIONS.length);
    for (const c of CONSTANTS) {
      expect(ids.has(c.section), `${c.id}: unknown section ${c.section}`).toBe(true);
      expect(c.sources.length, `${c.id}: no sources`).toBeGreaterThan(0);
      for (const src of c.sources) expect(src.url.startsWith('http'), `${c.id}: bad url`).toBe(true);
      expect(c.code.length, `${c.id}: empty code`).toBeGreaterThan(0);
    }
    const cid = new Set(CONSTANTS.map((c) => c.id));
    expect(cid.size).toBe(CONSTANTS.length);
  });

  it('labels are localized', () => {
    for (const c of CONSTANTS) {
      expect(c.label.ru.length).toBeGreaterThan(0);
      expect(c.label.en.length).toBeGreaterThan(0);
      expect(c.hint.ru.length).toBeGreaterThan(0);
      expect(c.hint.en.length).toBeGreaterThan(0);
    }
    expect(getLang()).toMatch(/^(ru|en)$/);
  });

  it('every constant name is already in the engine scope (insert path)', () => {
    expect(CONSTANTS.length).toBeGreaterThan(0);
    for (const c of CONSTANTS) {
      const block = {
        id: `k-${c.id}`, x: 0, y: 0, rawInput: c.code, displayLatex: '', resultStr: '',
        resultLatex: '', resultValue: null, error: null,
        dependencies: [], definedVar: null, isOutput: true, kind: 'math' as const,
      };
      const res = recalculateAll([block]);
      const b = res.blocks[`k-${c.id}`];
      expect(b, c.id).toBeTruthy();
      expect(b.error, `${c.id} [${c.code}]: ${b.error ?? ''}`).toBeNull();
    }
  });

  it('catalog is non-empty and covers every section', () => {
    expect(CONSTANTS.length).toBeGreaterThan(0);
    for (const sec of CONST_SECTIONS) {
      const n = CONSTANTS.filter((c) => c.section === sec.id).length;
      expect(n, `section ${sec.id} has ${n} constants`).toBeGreaterThan(0);
    }
  });
});