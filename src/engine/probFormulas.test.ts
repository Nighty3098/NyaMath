import { describe, expect, it } from 'vitest';
import { recalculateAll, type MathBlockData } from './dependencies';
import { getFormula } from '../lib/db';

let id = 0;
function toBlocks(code: string): MathBlockData[] {
  return code.split('\n').map((raw, k) => ({
    id: `pf${id++}`,
    x: 80,
    y: 60 + k * 64,
    rawInput: raw,
    displayLatex: '',
    resultStr: '',
    resultLatex: '',
    resultValue: null,
    error: null,
    dependencies: [],
    definedVar: null,
    isOutput: false,
    kind: 'math',
    plotPreview: null,
  }));
}

function calcFormula(fid: string): Record<string, MathBlockData> {
  const f = getFormula(fid);
  if (!f) throw new Error(`no formula ${fid}`);
  const r = recalculateAll(toBlocks(f.code));
  const errs = Object.values(r.blocks).filter((b) => b.error);
  expect(
    errs.map((b) => `${b.rawInput} ⟹ ${b.error}`),
    fid,
  ).toEqual([]);
  return r.blocks;
}

const last = (blocks: Record<string, MathBlockData>): string => {
  const arr = Object.values(blocks);
  return arr[arr.length - 1]?.resultStr ?? '';
};

/**
 * Комбинации событий: несовместные, зависимые, совместные, XOR.
 * Каждый код из палитры считается движком без ошибок.
 */
describe('probability combos: palette codes evaluate', () => {
  it('несовместные: P(A+B) = P(A) + P(B) = 0.5', () => {
    expect(last(calcFormula('union-incompatible'))).toBe('0.5');
  });

  it('зависимые: P(AB) = P(A)·P(B|A) = 0.2', () => {
    expect(last(calcFormula('intersection-dependent'))).toBe('0.2');
  });

  it('зависимые: P(A+B) = P(A) + P(B) − P(A)·P(B|A) = 0.65', () => {
    expect(last(calcFormula('union-dependent'))).toBe('0.65');
  });

  it('XOR независимых: 0.5 + 0.5 − 2·0.25 = 0.5', () => {
    expect(last(calcFormula('xor-events'))).toBe('0.5');
  });

  it('легенды переменных на месте', () => {
    const f = getFormula('intersection-dependent');
    expect(f?.vars?.map((v) => v.name)).toEqual(['P_a', 'Pb_given_A', 'P_ab']);
  });

  it('базовые: P_n = 40320, A(9,4) = 3024, C(10,4) = 210, повторы = 420', () => {
    expect(last(calcFormula('perm-factorial'))).toBe('40320');
    expect(last(calcFormula('arrange-nk'))).toBe('3024');
    expect(last(calcFormula('comb-basic'))).toBe('210');
    expect(last(calcFormula('perm-repeat'))).toBe('420');
  });
});
