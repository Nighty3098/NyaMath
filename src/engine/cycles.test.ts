import { describe, expect, it } from 'vitest';
import { detectCycles, recalculateAll, type MathBlockData } from './dependencies';

function block(id: string, y: number, rawInput: string): MathBlockData {
  return {
    id,
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
  };
}

describe('dependency cycle detection', () => {
  it('resolves repeated definitions using the nearest earlier block', () => {
    const blocks = [
      block('a', 60, 'x := 1'),
      block('b', 124, 'a := x + 1'),
      block('c', 188, 'x := a + 1'),
    ];
    expect(detectCycles(blocks)).toEqual(new Set());
    const result = recalculateAll(blocks);
    expect(result.blocks.a.error).toBeNull();
    expect(result.blocks.b.resultStr).toBe('2');
    expect(result.blocks.c.resultStr).toBe('3');
  });

  it('handles a deep dependency path without scanning the DFS stack per back-edge', () => {
    const blocks = Array.from({ length: 500 }, (_, i) =>
      block(`b${i}`, i * 64, `v${i} := ${i === 0 ? '1' : `v${i - 1} + 1`}`),
    );
    expect(detectCycles(blocks)).toEqual(new Set());
  });
});
