import { describe, expect, it } from 'vitest';
import { recalculateAll, type MathBlockData } from './dependencies';
import { createBaseScope, evaluateLine } from './mathEngine';

function block(
  id: string,
  kind: MathBlockData['kind'],
  rawInput: string,
  patch: Partial<MathBlockData> = {},
): MathBlockData {
  return {
    id,
    x: 80,
    y: 60 + Number(id.replace(/\D/g, '') || 0),
    rawInput,
    displayLatex: '',
    resultStr: '',
    resultLatex: '',
    resultValue: null,
    error: null,
    dependencies: [],
    definedVar: null,
    isOutput: false,
    kind,
    plotPreview: null,
    ...patch,
  };
}

describe('Mathcad program compatibility', () => {
  it('program with parameters is exported as a callable function', () => {
    const blocks = [
      block('b1', 'program', 'x * 2', { exportName: 'dbl', programParams: ['x'] }),
      block('b2', 'math', 'dbl(21) ='),
    ];
    const out = recalculateAll(blocks);
    expect(out.blocks['b2']?.error).toBeNull();
    expect(out.blocks['b2']?.resultStr).toBe('42');
  });

  it('indexed assignment works with mathjs 1-based accessors', () => {
    const blocks = [
      block('b1', 'program', 'A[1] := 10\nA[2] := 20\nA', { exportName: 'a' }),
      block('b2', 'math', 'a[1] + a[2] ='),
    ];
    const out = recalculateAll(blocks);
    expect(out.blocks['b2']?.error).toBeNull();
    expect(out.blocks['b2']?.resultStr).toBe('30');
  });

  it('indexed assignment inside a parameterized function does not leak into globals', () => {
    const blocks = [
      block('b1', 'program', 'B[1] := v\nB[2] := v + 1\nB', {
        exportName: 'make',
        programParams: ['v'],
      }),
      block('b2', 'math', 'make(5)[1] + make(5)[2] ='),
    ];
    const out = recalculateAll(blocks);
    expect(out.blocks['b2']?.error).toBeNull();
    expect(out.blocks['b2']?.resultStr).toBe('11');
  });

  it('xor and vectorSum handle vectors elementwise', () => {
    const s = createBaseScope();
    const r = evaluateLine('vectorSum(xor([1, 0, 1], [0, 1, 1])) =', s);
    expect(r.error).toBeNull();
    expect(Number(r.value)).toBe(2);
  });

  it('submatrix with one column returns a vector', () => {
    const s = createBaseScope();
    evaluateLine('m := [[1, 2], [3, 4]]', s);
    const r = evaluateLine('submatrix(m, 0, 1, 0, 0) =', s);
    expect(r.error).toBeNull();
    expect((r.value as { toArray: () => number[] }).toArray()).toEqual([1, 3]);
  });
});
