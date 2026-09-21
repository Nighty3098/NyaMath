import { describe, expect, it } from 'vitest';
import { normalizeAll, normalizeElement, renderRow, replaceTopKey } from '../../scripts/fetch-elements.mjs';
import { RU_NAMES } from '../../scripts/element-names.mjs';

const FE = {
  name: 'Iron', atomic_mass: 55.845, boil: 3134, category: 'transition metal',
  density: 7.874, discovered_by: 'Ancient', melt: 1811, molar_heat: 25.1,
  number: 26, period: 4, group: 8, phase: 'Solid',
  source: 'https://en.wikipedia.org/wiki/Iron',
  electron_configuration: '1s2 2s2 2p6 3s2 3p6 4s2 3d6',
  electron_configuration_semantic: '[Ar] 3d6 4s2',
  electronegativity_pauling: 1.83, symbol: 'Fe',
};

/** Нормализация датасета элементов (offline, без сети). */
describe('elements: normalizeElement', () => {
  it('железо: все поля + русское название', () => {
    expect(normalizeElement(FE)).toEqual({
      number: 26, symbol: 'Fe', name_en: 'Iron', name_ru: 'железо',
      atomic_mass: 55.845, phase: 'Solid', density: 7.874, melt: 1811,
      boil: 3134, group_no: 8, period: 4, electron_config: '[Ar] 3d6 4s2',
      electronegativity: 1.83, molar_heat: 25.1, category: 'transition metal',
      discovered: 'Ancient', source: 'https://en.wikipedia.org/wiki/Iron',
    });
  });

  it('null-поля проходят как null, битые записи отбрасываются', () => {
    const r = normalizeElement({ ...FE, melt: null, electronegativity_pauling: null, group: null });
    expect(r?.melt).toBe(null);
    expect(r?.electronegativity).toBe(null);
    expect(r?.group_no).toBe(null);
    expect(normalizeElement(null)).toBe(null);
    expect(normalizeElement({ symbol: 'Xx' })).toBe(null);
  });

  it('normalizeAll сортирует по номеру', () => {
    const rows = normalizeAll([{ ...FE, number: 26 }, { ...FE, number: 1, symbol: 'H', name: 'Hydrogen' }]);
    expect(rows.map((r) => r.number)).toEqual([1, 26]);
  });

  it('ru-названия покрывают 118 символов', () => {
    expect(Object.keys(RU_NAMES).length).toBe(118);
    expect(RU_NAMES.Fe).toBe('железо');
    expect(RU_NAMES.Og).toBe('оганесон');
  });
});

describe('elements: replaceTopKey', () => {
  const SRC = '{\n "a": [\n  {"x": 1}\n ],\n "b": 2\n}';

  it('добавляет новый ключ перед концом', () => {
    const out = replaceTopKey(SRC, 'elements', '  {"n": 1}');
    expect(JSON.parse(out).elements).toEqual([{ n: 1 }]);
    expect(JSON.parse(out).a).toEqual([{ x: 1 }]);
  });

  it('заменяет существующий массив целиком', () => {
    const src = '{\n "elements": [\n  {"n": 1, "s": "[a]"}\n ],\n "b": 2\n}';
    const out = replaceTopKey(src, 'elements', '  {"n": 2}');
    expect(JSON.parse(out).elements).toEqual([{ n: 2 }]);
  });

  it('renderRow — валидный JSON-объект', () => {
    const row = normalizeElement(FE);
    expect(row).not.toBe(null);
    expect(JSON.parse(`[${renderRow(row!)}]`).length).toBe(1);
  });
});
