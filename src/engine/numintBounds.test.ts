import { describe, expect, it } from 'vitest';
import { recalculateAll, type MathBlockData } from './dependencies';

let id = 0;
function calc(rawInput: string) {
  const b: MathBlockData = {
    id: `b${id++}`,
    x: 80,
    y: 60,
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
  return recalculateAll([b]).blocks[b.id];
}

/** Перевёрнутые пределы: ∫ₐᵇ = −∫ᵦₐ, при a == b ответ 0. */
describe('numint bounds', () => {
  it('returns 0 for equal bounds', () => {
    const b = calc('numint("sin(x)", "x", 1, 1) =');
    expect(b.error).toBeNull();
    expect(b.resultStr).toBe('0');
  });

  it('negates on reversed bounds', () => {
    const b = calc('numint("sin(x)", "x", 1, 0) =');
    expect(b.error).toBeNull();
    expect(Math.abs(Number(b.resultStr) + 0.4596976941)).toBeLessThan(1e-6);
  });

  it('handles near-zero reversed intervals', () => {
    const b = calc('numint("(ln(1 + x)/(1 + x^2))", "x", 0, -0.0000000000099413) =');
    expect(b.error).toBeNull();
  });
});
