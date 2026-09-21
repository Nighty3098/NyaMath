import { describe, expect, it } from 'vitest';
import { molarMassCode } from './elements';
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
