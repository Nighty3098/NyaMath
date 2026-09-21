import { describe, expect, it } from 'vitest';
import { recalculateAll, type MathBlockData } from './dependencies';
import { getTemplate, listTemplates } from '../lib/db';

let id = 0;
function toBlocks(tplId: string): MathBlockData[] {
  const tpl = getTemplate(tplId);
  if (!tpl) throw new Error(`no template ${tplId}`);
  return tpl.lines.map((ln, k) => ({
    id: `tpl${id++}`, x: 80, y: 60 + k * 64, rawInput: ln.raw,
    displayLatex: '', resultStr: '', resultLatex: '', resultValue: null,
    error: null, dependencies: [], definedVar: null, isOutput: false,
    kind: ln.kind, plotPreview: null,
  }));
}

function calcAll(tplId: string): Record<string, MathBlockData> {
  const r = recalculateAll(toBlocks(tplId));
  const errs = Object.values(r.blocks).filter((b) => b.error);
  expect(errs.map((b) => `${b.rawInput} ⟹ ${b.error}`), tplId).toEqual([]);
  return r.blocks;
}

const byRaw = (blocks: Record<string, MathBlockData>, raw: string): MathBlockData => {
  const hit = Object.values(blocks).find((b) => b.rawInput === raw);
  if (!hit) throw new Error(`no block ${raw}`);
  return hit;
};

/**
 * Библиотека шаблонов по ГОСТ: каждый шаблон из БД считается
 * движком без ошибок, контрольные значения — по ручному расчёту.
 */
describe('templates: library integrity', () => {
  it('6 шаблонов в 3 разделах с описаниями', () => {
    const all = listTemplates();
    expect(all.length).toBe(6);
    expect(new Set(all.map((t) => t.section))).toEqual(new Set(['beams', 'circuits', 'tolerances']));
    for (const t of all) {
      expect(t.title.ru.length).toBeGreaterThan(0);
      expect(t.title.en.length).toBeGreaterThan(0);
      expect(t.lines.length).toBeGreaterThanOrEqual(5);
    }
    expect(getTemplate('nope')).toBeNull();
  });

  it('tolerance-шаблоны ссылаются на ГОСТ 25346', () => {
    expect(getTemplate('tolerance-rss')?.standard).toContain('25346');
    expect(getTemplate('tolerance-chain')?.standard).toContain('25346');
  });

  it('балка на двух опорах: R=30 кН, M=45 кДж', () => {
    const b = calcAll('beam-simply-uniform');
    expect(byRaw(b, 'R_A = q*L/2').resultStr).toBe('30 kN');
    expect(byRaw(b, 'M_max = q*L^2/8').resultStr).toBe('45 kJ');
  });

  it('консоль: заделка 1000 Дж, прогиб ≈ 80 мм', () => {
    const b = calcAll('beam-cantilever-point');
    expect(byRaw(b, 'M_fix = F*L').resultStr).toBe('1000 J');
    expect(byRaw(b, 'delta = F*L^3/(3*E*J)').resultStr).toBe('8.0032 cm');
  });

  it('закон Ома: 3 А, 36 Вт', () => {
    const b = calcAll('circuit-ohm');
    expect(byRaw(b, 'I =').resultStr).toBe('3 A');
    expect(byRaw(b, 'P =').resultStr).toBe('36 W');
  });

  it('резисторы: 30 Ом последовательно, 6.667 параллельно', () => {
    const b = calcAll('circuit-series-parallel');
    expect(byRaw(b, 'R_s = R1+R2').resultStr).toBe('30 ohm');
    expect(byRaw(b, 'R_p = R1*R2/(R1+R2)').resultStr).toContain('6.666');
  });

  it('RSS: √(0.1²+0.2²+0.15²) ≈ 0.269 мм', () => {
    const b = calcAll('tolerance-rss');
    expect(byRaw(b, 't_rss = sqrt(t1^2+t2^2+t3^2)').resultStr).toContain('0.269');
  });

  it('размерная цепь: 40 / 40.3 / 39.7 мм', () => {
    const b = calcAll('tolerance-chain');
    expect(byRaw(b, 'A_nom = A1-A2').resultStr).toBe('40 mm');
    expect(byRaw(b, 'A_max = (A1+t1)-(A2-t2)').resultStr).toBe('40.3 mm');
    expect(byRaw(b, 'A_min = (A1-t1)-(A2+t2)').resultStr).toBe('39.7 mm');
  });
});
