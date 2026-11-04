import { describe, expect, it } from 'vitest';
import { recalculateAll, type MathBlockData } from './dependencies';

let id = 0;
function calc(rawInput: string) {
  const b: MathBlockData = {
    id: `l${id++}`,
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

/** 0/0 высокого порядка: сетка тонет, спасают Ричардсон и Лопиталь. */
describe('limit 0/0', () => {
  it('takes a 4th-order 0/0 (§ user case → −0.1)', () => {
    const b = calc('v := limit("(ln((sin(x)/x)+((x^2)/6)))/(cos(x)-exp((-x^2)/2))", "x", 0) =');
    expect(b.error).toBeNull();
    expect(Math.abs(Number(b.resultStr) + 0.1)).toBeLessThan(1e-3);
  });

  it('keeps simple limits intact', () => {
    const b = calc('limit("sin(x)/x", "x", 0) =');
    expect(b.error).toBeNull();
    expect(b.resultStr).toBe('1');
  });

  it('does not collapse to a false zero', () => {
    const b = calc('limit("(1-cos(x))/x^2", "x", 0) =');
    expect(b.error).toBeNull();
    expect(Math.abs(Number(b.resultStr) - 0.5)).toBeLessThan(1e-3);
  });

  it('keeps a true zero', () => {
    const b = calc('limit("x^2", "x", 0) =');
    expect(b.error).toBeNull();
    expect(b.resultStr).toContain('10^-24');
  });

  it('rejects a two-sided limit when the one-sided limits differ', () => {
    expect(calc('limit("sign(x)", "x", 0) =').error).not.toBeNull();
  });
});
