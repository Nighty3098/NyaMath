import { describe, expect, it } from 'vitest';
import { recalculateAll, type MathBlockData } from './dependencies';

let id = 0;
function block(y: number, rawInput: string): MathBlockData {
  return {
    id: `i${id++}`, x: 80, y, rawInput, displayLatex: '', resultStr: '',
    resultLatex: '', resultValue: null, error: null, dependencies: [],
    definedVar: null, isOutput: false, kind: 'math', plotPreview: null,
  };
}

function calc(rawInput: string) {
  const b = block(60, rawInput);
  const r = recalculateAll([b]);
  return r.blocks[b.id];
}

describe('infinite sums', () => {
  it('sums 1/k^2 to pi^2/6', () => {
    const b = calc('numsum("1/k^2", "k", 1, Infinity) =');
    expect(b.error).toBeNull();
    expect(Math.abs(Number(b.resultStr) - Math.PI ** 2 / 6)).toBeLessThan(1e-3);
  });

  it('sums a geometric series to 2', () => {
    const b = calc('numsum("0.5^k", "k", 0, Infinity) =');
    expect(b.error).toBeNull();
    expect(Math.abs(Number(b.resultStr) - 2)).toBeLessThan(1e-6);
  });

  it('sums from -Infinity upward', () => {
    const b = calc('numsum("2^k", "k", -Infinity, 0) =');
    expect(b.error).toBeNull();
    expect(Math.abs(Number(b.resultStr) - 2)).toBeLessThan(1e-6);
  });

  it('reports divergence instead of hanging', () => {
    const b = calc('numsum("1/k", "k", 1, Infinity) =');
    expect(b.error).not.toBeNull();
  });

  it('keeps finite ranges and limits working', () => {
    const b = calc('numsum("k^2", "k", 1, 100) =');
    expect(b.error).toBeNull();
    expect(b.resultStr).toBe('338350');
    expect(calc('numsum("k", "k", 1, 2000000) =').error).not.toBeNull();
  });
});
