import { describe, expect, it } from 'vitest';
import { recalculateAll, type MathBlockData } from './dependencies';

let id = 0;
function block(y: number, rawInput: string): MathBlockData {
  return {
    id: `kb${id++}`, x: 80, y, rawInput, displayLatex: '', resultStr: '',
    resultLatex: '', resultValue: null, error: null, dependencies: [],
    definedVar: null, isOutput: false, kind: 'math', plotPreview: null,
  };
}

function calc(raw: string): { str: string; error: string | null } {
  const r = recalculateAll([block(60, raw)]);
  const b = Object.values(r.blocks)[0];
  return { str: b?.resultStr ?? '', error: b?.error ?? null };
}

function ok(raw: string): string {
  const r = calc(raw);
  expect(r.error, raw).toBe(null);
  return r.str;
}

/**
 * Каждая клавиша экранной клавиатуры поддерживается движком:
 * `:=` `=` `pi` `sqrt(` `<=` `>=` `!=` `,` `*` `/` `(` `)` `;` `deg`
 * `^2` `^()` `j` `e` `_` (`_` — см. subscript.test.ts).
 */
describe('keyboard: every key evaluates in the engine', () => {
  it(':= присваивает, = показывает', () => {
    const r = recalculateAll([block(60, 'x := 5'), block(124, 'x =')]);
    const out = Object.values(r.blocks).find((b) => b.rawInput === 'x =');
    expect(out?.error).toBe(null);
    expect(out?.resultStr).toBe('5');
  });

  it('pi и e — константы', () => {
    expect(ok('2*pi =')).toBe('6.283185307');
    expect(ok('e =')).toBe('2.718281828');
  });

  it('sqrt( считает корень', () => {
    expect(ok('sqrt(16) =')).toBe('4');
  });

  it('сравнения <= >= != дают bool', () => {
    expect(ok('2 <= 3 =')).toBe('true');
    expect(ok('3 >= 5 =')).toBe('false');
    expect(ok('2 != 3 =')).toBe('true');
    expect(ok('5 m <= 6 m =')).toBe('true');
    expect(ok('1+1 == 2 =')).toBe('true');
  });

  it(', разделяет аргументы и столбцы', () => {
    expect(ok('max(1, 5) =')).toBe('5');
    expect(ok('[1, 2] =')).toBe('[1,2]');
  });

  it('* / — арифметика', () => {
    expect(ok('6*7 =')).toBe('42');
    expect(ok('7/2 =')).toBe('3.5');
  });

  it('скобки группируют', () => {
    expect(ok('(2+3)*4 =')).toBe('20');
  });

  it('; разделяет строки матрицы', () => {
    expect(ok('[1, 2; 3, 4] =')).toBe('[[1,2],[3,4]]');
  });

  it('deg — градусы в тригонометрии', () => {
    expect(ok('90 deg =')).toBe('90 deg');
    expect(ok('sin(30 deg) =')).toBe('0.5');
  });

  it('^2 и ^() — степени', () => {
    expect(ok('3^2 =')).toBe('9');
    expect(ok('(2+1)^2 =')).toBe('9');
  });

  it('j — мнимая единица', () => {
    expect(ok('sqrt(-4) =')).toBe('2·j');
    expect(ok('(3+4j) =')).toBe('3 + 4·j');
  });
});
