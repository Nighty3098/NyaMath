import { describe, expect, it } from 'vitest';
import { elementBlocks, molarMassCode } from './elements';
import { recalculateAll, type MathBlockData } from '../engine/dependencies';
import type { ElementRow } from './db';

const fe = (patch: Partial<ElementRow> = {}): ElementRow => ({
  number: 26, symbol: 'Fe', name_en: 'Iron', name_ru: 'железо',
  atomic_mass: 55.845, phase: 'Solid', density: 7.874, melt: 1811,
  boil: 3134, group_no: 8, period: 4, electron_config: '[Ar] 3d6 4s2',
  electronegativity: 1.83, molar_heat: 25.1, category: 'transition metal',
  discovered: 'Ancient', source: 'https://en.wikipedia.org/wiki/Iron',
  ...patch,
});

/** Вставка элемента: молярная масса определяемым блоком. */
describe('elements: molarMassCode', () => {
  it('железо → M_Fe := 55.845 g/mol', () => {
    expect(molarMassCode(fe())).toBe('M_Fe := 55.845 g/mol');
  });

  it('без массы — null (вставлять нечего)', () => {
    expect(molarMassCode(fe({ atomic_mass: null }))).toBe(null);
  });

  it('подозрительный символ — null', () => {
    expect(molarMassCode(fe({ symbol: 'X1' }))).toBe(null);
  });
});

let bid = 0;
function toBlocks(lines: string[]): MathBlockData[] {
  return lines.map((raw, k) => ({
    id: `elb${bid++}`, x: 80, y: 60 + k * 64, rawInput: raw,
    displayLatex: '', resultStr: '', resultLatex: '', resultValue: null,
    error: null, dependencies: [], definedVar: null, isOutput: false,
    kind: 'math', plotPreview: null,
  }));
}

/** Вставка всех значений: набор блоков без ошибок движка. */
describe('elements: elementBlocks', () => {
  it('железо — 6 блоков с единицами', () => {
    expect(elementBlocks(fe())).toEqual([
      'M_Fe := 55.845 g/mol',
      'rho_Fe := 7.874 g/cm^3',
      'Tm_Fe := 1811 K',
      'Tb_Fe := 3134 K',
      'EN_Fe := 1.83',
      'Cp_Fe := 25.1 J/mol/K',
    ]);
  });

  it('газ — плотность в г/л', () => {
    expect(elementBlocks(fe({ symbol: 'He', phase: 'Gas', density: 0.1786 }))[1]).toBe(
      'rho_He := 0.1786 g/L',
    );
  });

  it('пустые значения пропускаются', () => {
    expect(
      elementBlocks(fe({ melt: null, boil: null, electronegativity: null, molar_heat: null, density: null })),
    ).toEqual(['M_Fe := 55.845 g/mol']);
  });

  it('все строки считаются движком без ошибок', () => {
    const r = recalculateAll(toBlocks(elementBlocks(fe())));
    const errs = Object.values(r.blocks).filter((b) => b.error);
    expect(errs.map((b) => `${b.rawInput} ⟹ ${b.error}`)).toEqual([]);
    const byRaw = (raw: string) =>
      Object.values(r.blocks).find((b) => b.rawInput === raw)?.resultStr;
    expect(byRaw('M_Fe := 55.845 g/mol')).toBe('55.845 g / mol');
    expect(byRaw('Tm_Fe := 1811 K')).toBe('1.811 kK');
    expect(byRaw('EN_Fe := 1.83')).toBe('1.83');
  });
});
