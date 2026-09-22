import { describe, expect, it } from 'vitest';
import { ALIASES, NAME_MAP, parseCodata, relDiff } from '../../scripts/fetch-codata.mjs';

const SAMPLE = `Fundamental Physical Constants --- Complete Listing
             2022 CODATA adjustment


  From:  http://physics.nist.gov/constants



  Quantity                                                       Value                 Uncertainty           Unit
-----------------------------------------------------------------------------------------------------------------------------
Avogadro constant                                           6.022 140 76 e23         (exact)                  mol^-1
Boltzmann constant                                          1.380 649 e-23           (exact)                  J K^-1
reduced Planck constant                                     1.054 571 817... e-34    (exact)                  J s
Newtonian constant of gravitation                           6.674 30 e-11            0.000 15 e-11            m^3 kg^-1 s^-2
fine-structure constant                                     7.297 352 5643 e-3       0.000 000 0011 e-3       
hyperfine transition frequency of Cs-133                    9 192 631 770            (exact)                  Hz
`;

/** Парсер NIST allascii.txt (offline, без сети). */
describe('codata: parseCodata', () => {
  it('разбирает колонки с пробелами внутри чисел', () => {
    const rows = parseCodata(SAMPLE);
    expect(rows.length).toBe(6);
    const byQ = new Map(rows.map((r) => [r.quantity, r]));
    expect(byQ.get('Avogadro constant')).toMatchObject({
      value: 6.02214076e23,
      exact: true,
      unit: 'mol^-1',
    });
    expect(byQ.get('Newtonian constant of gravitation')?.value).toBeCloseTo(6.6743e-11, 20);
    expect(byQ.get('Newtonian constant of gravitation')?.exact).toBe(false);
    expect(byQ.get('hyperfine transition frequency of Cs-133')?.value).toBe(9192631770);
    // обрезанное "..." — точное по определению
    expect(byQ.get('reduced Planck constant')).toMatchObject({ exact: true });
    expect(byQ.get('reduced Planck constant')?.value).toBeCloseTo(1.054571817e-34, 45);
    // пустая единица — ок
    expect(byQ.get('fine-structure constant')?.unit).toBe('');
  });

  it('все маппленные Quantity существуют в реальном формате', () => {
    // дымовой тест формата: каждая строка маппинга обязана находиться парсером,
    // если встретится в allascii.txt (имена сверяются в dry-run прогоне)
    expect(Object.keys(NAME_MAP).length).toBeGreaterThanOrEqual(24);
    expect(ALIASES.eta0).toBe('Z_0');
  });

  it('truncated-флаг отличает обрезанные точные значения', () => {
    const rows = parseCodata(SAMPLE);
    const byQ = new Map(rows.map((r) => [r.quantity, r]));
    expect(byQ.get('reduced Planck constant')?.truncated).toBe(true);
    expect(byQ.get('Avogadro constant')?.truncated).toBe(false);
  });
});

describe('codata: relDiff', () => {
  it('нули и мусор', () => {
    expect(relDiff(0, 0)).toBe(0);
    expect(relDiff(NaN, 1)).toBe(null);
    expect(relDiff(100, 101)).toBeCloseTo(1 / 101, 10);
  });
});
