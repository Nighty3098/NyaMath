import { afterEach, describe, expect, it } from 'vitest';
import { recalculateAll, type MathBlockData } from './dependencies';
import { setCalcPrecision, setNumFmt } from './mathEngine';

let id = 0;
function block(y: number, rawInput: string): MathBlockData {
  return {
    id: `nf${id++}`,
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

function calc(raw: string): string {
  const r = recalculateAll([block(60, raw)]);
  const b = Object.values(r.blocks)[0];
  expect(b?.error).toBe(null);
  return b?.resultStr ?? '';
}

afterEach(() => {
  setNumFmt({ mode: 'auto', digits: 6 });
  setCalcPrecision({ mode: 'standard', digits: 50 });
});

/**
 * Формат чисел: auto — legacy, sig — значащие цифры (SMath),
 * fixed — знаки после запятой.
 */
describe('numfmt: significant digits', () => {
  it('auto: legacy-поведение (10 знаков, чистка float-мусора)', () => {
    expect(calc('2/3 =')).toBe('0.6666666667');
  });

  it('sig 4: 2/3 → 0.6667', () => {
    setNumFmt({ mode: 'sig', digits: 4 });
    expect(calc('2/3 =')).toBe('0.6667');
  });

  it('sig режет большие и мелкие через ·10^', () => {
    setNumFmt({ mode: 'sig', digits: 3 });
    expect(calc('123456 =')).toBe('123000');
    expect(calc('0.000123456 =')).toBe('1.23·10^-4');
  });

  it('sig действует на юниты и матрицы', () => {
    setNumFmt({ mode: 'sig', digits: 3 });
    expect(calc('10/3 m =')).toBe('3.33 m');
    expect(calc('[1/3, 2/3] =')).toBe('[0.333,0.667]');
  });

  it('смена формата меняет готовый результат (кэш-партиция)', () => {
    setNumFmt({ mode: 'sig', digits: 3 });
    expect(calc('2/3 =')).toBe('0.667');
    setNumFmt({ mode: 'fixed', digits: 1 });
    expect(calc('2/3 =')).toBe('0.7');
  });
});

describe('numfmt: fixed decimals', () => {
  it('fixed 2: 2/3 → 0.67', () => {
    setNumFmt({ mode: 'fixed', digits: 2 });
    expect(calc('2/3 =')).toBe('0.67');
  });

  it('fixed держит нули и не даёт -0.00', () => {
    setNumFmt({ mode: 'fixed', digits: 2 });
    expect(calc('1/4 =')).toBe('0.25');
    expect(calc('2 =')).toBe('2.00');
    expect(calc('-0.001 =')).toBe('0.00');
    expect(calc('-0.0001 =')).toBe('-1.00·10^-4');
  });

  it('невалидный режим падает в auto', () => {
    setNumFmt({ mode: 'oops' as 'sig', digits: 99 });
    expect(calc('2/3 =')).toBe('0.6666666667');
  });
});
