import { afterEach, describe, expect, it } from 'vitest';
import { recalculateAll, type MathBlockData } from './dependencies';
import { setNumFmt, setUnitSys } from './mathEngine';

let id = 0;
function block(y: number, rawInput: string): MathBlockData {
  return {
    id: `un${id++}`, x: 80, y, rawInput, displayLatex: '', resultStr: '',
    resultLatex: '', resultValue: null, error: null, dependencies: [],
    definedVar: null, isOutput: false, kind: 'math', plotPreview: null,
  };
}

function calc(raw: string): { str: string; error: string | null } {
  const r = recalculateAll([block(60, raw)]);
  const b = Object.values(r.blocks)[0];
  return { str: b?.resultStr ?? '', error: b?.error ?? null };
}

afterEach(() => {
  setUnitSys('none');
  setNumFmt({ mode: 'auto', digits: 6 });
});

/**
 * Пресеты систем единиц (Prime 11-паттерн): отображение результатов
 * в SI/US/CGS + строгий размерный контроль (m + kg — ошибка).
 */
describe('unitsys: display presets', () => {
  it('none: как введено', () => {
    expect(calc('10 N =').str).toBe('10 N');
    expect(calc('100 cm =').str).toBe('100 cm');
  });

  it('SI: к базовым (100 см → 1 м)', () => {
    setUnitSys('SI');
    expect(calc('100 cm =').str).toBe('1 m');
    expect(calc('10 N =').str).toBe('10 N');
  });

  it('US: ньютоны → фунт-сила, градусы → Фаренгейт', () => {
    setUnitSys('US');
    expect(calc('10 N =').str).toBe('2.24809 lbf');
    expect(calc('20 degC =').str).toBe('68 degF');
  });

  it('CGS: ньютоны → дины', () => {
    setUnitSys('CGS');
    expect(calc('10 N =').str).toContain('dyn');
    expect(calc('100 kPa =').str).toContain('dyn');
  });

  it('смена системы меняет готовый результат (кэш-партиция)', () => {
    setUnitSys('US');
    const us = calc('10 N =').str;
    setUnitSys('none');
    expect(calc('10 N =').str).toBe('10 N');
    expect(us).not.toBe('10 N');
  });
});

describe('unitsys: strict dimensional control', () => {
  it('сложение несовместимого — ошибка', () => {
    const r = calc('5 m + 3 kg');
    expect(r.error).not.toBe(null);
    expect(r.error).toContain('Несовместим');
  });

  it('сравнения и агрегаты несовместимого — ошибка', () => {
    expect(calc('5 m < 3 s').error).not.toBe(null);
    expect(calc('max(5 m, 3 s)').error).not.toBe(null);
  });

  it('совместимое складывается и конвертируется', () => {
    const r = calc('5 m + 30 cm =');
    expect(r.error).toBe(null);
    expect(r.str).toBe('5.3 m');
  });
});
