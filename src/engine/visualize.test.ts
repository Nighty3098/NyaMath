import { describe, expect, it } from 'vitest';
import { recalculateAll } from './dependencies';
import type { MathBlockData } from './dependencies';

function mathBlock(id: string, rawInput: string, y = 0): MathBlockData {
  return {
    id,
    x: 0,
    y,
    rawInput,
    displayLatex: '',
    resultStr: '',
    resultLatex: '',
    resultValue: null,
    error: null,
    dependencies: [],
    definedVar: null,
    isOutput: true,
    kind: 'math',
  };
}

function vizOf(rawInput: string) {
  const res = recalculateAll([mathBlock('v', rawInput)]);
  const b = res.blocks['v'];
  expect(b.error, rawInput).toBeNull();
  return b.visualize ?? null;
}

function vizOfAny(rawInput: string) {
  const res = recalculateAll([mathBlock('v', rawInput)]);
  return res.blocks['v'].visualize ?? null;
}

describe('smart visualize', () => {
  it('detects f(x, y) definitions as surfaces', () => {
    expect(vizOf('f(x, y) := x^2 + y^2')).toEqual({ kind: 'surface', expr: 'x^2 + y^2' });
  });

  it('ignores one-param definitions (auto-plot covers them)', () => {
    expect(vizOf('f(t) := t^2')).toBeNull();
  });

  it('shows numeric vectors as tables, not plots', () => {
    expect(vizOf('data := [1, 2, 3]')).toBeNull();
    expect(vizOf('c := [1; 2; 3]')).toBeNull();
    const res = recalculateAll([mathBlock('v', 'data := [1, 2, 3]')]);
    expect(res.blocks['v'].resultTable).toMatchObject({ rowCount: 1, colCount: 3 });
  });

  it('shows numeric matrices as tables, not plots', () => {
    expect(vizOf('m := [1, 2, 3; 4, 5, 6]')).toBeNull();
    expect(vizOf('h := [1, 2; 3, 4]')).toBeNull();
    const res = recalculateAll([mathBlock('v', 'm := [1, 2, 3; 4, 5, 6]')]);
    expect(res.blocks['v'].resultTable).toMatchObject({ rowCount: 2, colCount: 3 });
  });

  it('returns null for scalars, strings, errors and anonymous outputs', () => {
    expect(vizOf('x := 5')).toBeNull();
    expect(vizOf('s := "abc"')).toBeNull();
    expect(vizOfAny('nosuchvar + 1')).toBeNull();
    expect(vizOf('[1, 2, 3] =')).toBeNull();
  });
});
