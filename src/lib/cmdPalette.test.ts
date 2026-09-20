import { describe, expect, it } from 'vitest';
import { COMMANDS, cmdLabel, filterCommands, varScore } from './cmdPalette';

describe('cmdPalette: filterCommands', () => {
  it('пустой запрос — все команды по порядку', () => {
    const all = filterCommands('', 'ru', 100);
    expect(all.length).toBe(COMMANDS.length);
    expect(all[0]?.spec.id).toBe('ins-math');
  });

  it('точный префикс находит график', () => {
    const hits = filterCommands('график', 'ru');
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]?.spec.id).toMatch(/ins-plot|ins-contour|ins-3d/);
  });

  it('fuzzy с опечаткой: plt → plot', () => {
    const hits = filterCommands('plt', 'en');
    expect(hits.some((h) => h.spec.id === 'ins-plot')).toBe(true);
  });

  it('fuzzy subsequence: sldr → slider', () => {
    const hits = filterCommands('sldr', 'en');
    expect(hits.some((h) => h.spec.id === 'ins-slider')).toBe(true);
  });

  it('английский синоним работает в русской локали', () => {
    const hits = filterCommands('slider', 'ru');
    expect(hits.some((h) => h.spec.id === 'ins-slider')).toBe(true);
  });

  it('пересчёт находится по «пересч» и по «recalc»', () => {
    expect(filterCommands('пересч', 'ru').some((h) => h.spec.id === 'recalc')).toBe(true);
    expect(filterCommands('recalc', 'ru').some((h) => h.spec.id === 'recalc')).toBe(true);
  });

  it('мусор ничего не находит', () => {
    expect(filterCommands('zzzqqq', 'ru')).toEqual([]);
    expect(filterCommands('zzzqqq', 'en')).toEqual([]);
  });

  it('limit обрезает выдачу', () => {
    expect(filterCommands('н', 'ru', 3).length).toBeLessThanOrEqual(3);
  });
});

describe('cmdPalette: labels', () => {
  it('ru/en подписи различаются', () => {
    const spec = COMMANDS[0]!;
    expect(cmdLabel(spec, 'ru')).toBe(spec.ru);
    expect(cmdLabel(spec, 'en')).toBe(spec.en);
  });
});

describe('cmdPalette: varScore', () => {
  it('имя бьёт сниппет', () => {
    expect(varScore('alph', 'alpha', 'x := 1')).toBeGreaterThan(varScore('alph', 'beta', 'alpha is here'));
  });

  it('подстрока в сниппете — запасной вариант', () => {
    expect(varScore('qqq', 'beta', 'x := 1')).toBe(0);
    expect(varScore('x :=', 'beta', 'x := 1')).toBeGreaterThan(0);
  });
});
