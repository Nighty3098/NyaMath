import { describe, expect, it } from 'vitest';
import { detectCycles, type MathBlockData } from './dependencies';

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
  it('marks only blocks participating in a dependency cycle', () => {
    const blocks = [
      block('a', 60, 'x := y + 1'),
      block('b', 124, 'y := x + 1'),
      block('c', 188, 'z := x + 2'),
    ];
    expect(detectCycles(blocks)).toEqual(new Set(['a', 'b']));
  });

  it('handles a deep dependency path without scanning the DFS stack per back-edge', () => {
    const blocks = Array.from({ length: 500 }, (_, i) =>
      block(`b${i}`, i * 64, `v${i} := ${i === 0 ? '1' : `v${i - 1} + 1`}`),
    );
    expect(detectCycles(blocks)).toEqual(new Set());
  });
});
