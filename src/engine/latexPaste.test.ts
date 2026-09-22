import { describe, expect, it } from 'vitest';
import { recalculateAll, type MathBlockData } from './dependencies';

let id = 0;
function block(rawInput: string): MathBlockData {
  return {
    id: `p${id++}`,
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
}

function calc(rawInput: string) {
  const b = block(rawInput);
  return recalculateAll([b]).blocks[b.id];
}

/** Вставка LaTeX-мусора из рендера (\textasciicircum) не должна ломать счёт. */
describe('pasted latex escapes', () => {
  it('evaluates limit with pasted \\textasciicircum', () => {
    const b = calc('v := limit("ln((sin(x)/x) + ((x\\textasciicircum2)/6))", "x", 0) =');
    expect(b.error).toBeNull();
    expect(b.resultStr).toBe('0');
  });

  it('evaluates limit with plain ^ as before', () => {
    const b = calc('v := limit("ln((sin(x)/x)+((x^2)/6))", "x", 0) =');
    expect(b.error).toBeNull();
    expect(b.resultStr).toBe('0');
  });
});
