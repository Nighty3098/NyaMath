import { afterEach, describe, expect, it } from 'vitest';
import { recalculateAll, type MathBlockData } from './dependencies';
import { setAngleMode } from './mathEngine';

let id = 0;
function block(y: number, rawInput: string): MathBlockData {
  return {
    id: `an${id++}`,
    x: 80,
    y,
    rawInput,
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
  };
}

function calc(raw: string): { str: string; error: string | null } {
  const r = recalculateAll([block(60, raw)]);
  const b = Object.values(r.blocks)[0];
  return { str: b?.resultStr ?? '', error: b?.error ?? null };
}

afterEach(() => {
  setAngleMode('rad');
});

/**
 * Режим углов (калькуляторный DEG/RAD): прямые — вход, обратные — выход.
 * Вещественные asin/acos вне [−1, 1] — ошибка области вместо тихого комплекса.
 */
describe('angle: radians by default', () => {
  it('rad: обычная тригонометрия без изменений', () => {
    expect(calc('sin(pi/2) =')).toEqual({ str: '1', error: null });
    expect(calc('cos(0) =')).toEqual({ str: '1', error: null });
    expect(calc('asin(1/2) =').str).toContain('0.52359');
    expect(calc('atan(1) =').str).toContain('0.785398');
  });
});

describe('angle: degrees', () => {
  it('deg: прямые принимают градусы', () => {
    setAngleMode('deg');
    expect(calc('sin(30) =')).toEqual({ str: '0.5', error: null });
    expect(calc('cos(60) =')).toEqual({ str: '0.5', error: null });
    expect(calc('tan(45) =')).toEqual({ str: '1', error: null });
  });

  it('deg: обратные возвращают градусы', () => {
    setAngleMode('deg');
    expect(calc('asin(1/2) =')).toEqual({ str: '30', error: null });
    expect(calc('acos(0) =')).toEqual({ str: '90', error: null });
    expect(calc('atan(1) =')).toEqual({ str: '45', error: null });
    expect(calc('atan2(1, 1) =')).toEqual({ str: '45', error: null });
  });

  it('deg: туда-обратно без потерь', () => {
    setAngleMode('deg');
    expect(calc('sin(asin(1/2)) =').str).toContain('0.5');
  });
});

describe('angle: domain of real asin/acos', () => {
  it('вне [−1, 1] — ошибка области, а не комплекс', () => {
    for (const mode of ['rad', 'deg'] as const) {
      setAngleMode(mode);
      for (const raw of ['asin(2) =', 'asin(pi/2) =', 'acos(-3/2) =']) {
        const r = calc(raw);
        expect(r.error, `${mode} ${raw}`).not.toBe(null);
      }
    }
  });

  it('границы ±1 считаются', () => {
    expect(calc('asin(1) =').error).toBe(null);
    expect(calc('acos(-1) =').error).toBe(null);
  });

  it('комплексный вход — по-прежнему комплекс (mathjs)', () => {
    const r = calc('asin(2+0j) =');
    expect(r.error).toBe(null);
    expect(r.str).toContain('j');
  });
});

describe('angle: mode switch repartitions cache', () => {
  it('смена режима меняет готовый результат', () => {
    setAngleMode('deg');
    expect(calc('asin(1/2) =').str).toBe('30');
    setAngleMode('rad');
    expect(calc('asin(1/2) =').str).toContain('0.52359');
  });

  it('невалидный режим падает в rad', () => {
    setAngleMode('oops' as 'deg');
    expect(calc('sin(pi/2) =')).toEqual({ str: '1', error: null });
  });
});
