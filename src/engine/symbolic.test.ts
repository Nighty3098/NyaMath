import { describe, expect, it } from 'vitest';
import { recalculateAll, type MathBlockData } from './dependencies';
import { createBaseScope, evaluateLine, parseLine, toLatex } from './mathEngine';

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

describe('symbolic calculations', () => {
  it('parses symbolic output without changing numeric output syntax', () => {
    expect(parseLine('1/3 →')).toMatchObject({
      kind: 'output',
      expr: '1/3',
      symbolic: true,
    });
    expect(parseLine('sqrt(2) → float, 100')).toMatchObject({
      kind: 'output',
      expr: 'sqrt(2)',
      symbolic: true,
      floatDigits: 100,
    });
    expect(parseLine('1/3 =')).toMatchObject({ kind: 'output', expr: '1/3' });
    expect(parseLine('1/3 =').symbolic).toBeUndefined();
    expect(toLatex('sqrt(2) → float, 100')).toContain('\\xrightarrow{\\mathrm{float},\\;100}');
  });

  it('keeps exact rational and decimal expressions', () => {
    const scope = createBaseScope();
    expect(evaluateLine('1/3 →', scope)).toEqual({ value: '1/3', error: null });
    expect(evaluateLine('0.1+0.2 →', scope)).toEqual({ value: '0.3', error: null });
    expect(evaluateLine('sin(pi/2) →', scope)).toEqual({ value: '1', error: null });
    expect(evaluateLine('sqrt(2) →', scope)).toEqual({ value: '2^(1/2)', error: null });
  });

  it('retains exact definitions and resolves dependent expressions', () => {
    const scope = createBaseScope();
    evaluateLine('x := 1/3', scope);
    evaluateLine('y := x^2', scope);
    expect(evaluateLine('x →', scope).value).toBe('1/3');
    expect(evaluateLine('y →', scope).value).toBe('1/9');
  });

  it('approximates exact expressions to the requested significant digits', () => {
    const scope = createBaseScope();
    const result = evaluateLine('sqrt(2) → float, 100', scope);
    expect(result.error).toBeNull();
    expect(String(result.value)).toBe(
      '1.414213562373095048801688724209698078569671875376948073176679737990732478462107038850387534327641573',
    );
    expect(evaluateLine('1/3 → float, 100', scope).value).toBe('0.' + '3'.repeat(100));
  });

  it('reports invalid precision rather than falling back to numeric evaluation', () => {
    const result = evaluateLine('sqrt(2) → float, 1001', createBaseScope());
    expect(result.value).toBeNull();
    expect(result.error).toContain('1 to 1000');
  });

  it('reports unsupported functions and units instead of misinterpreting them', () => {
    const scope = createBaseScope();
    expect(evaluateLine('unknownFunction(2) →', scope).error).toContain(
      'unsupported function: unknownFunction',
    );
    expect(evaluateLine('2 m →', scope).error).toContain('units are not supported');

    expect(evaluateLine('f(x) := x^2', scope).error).toBeNull();
    expect(evaluateLine('y := f(1/3)', scope).error).toBeNull();
    expect(evaluateLine('y →', scope).error).toContain('no exact symbolic form');
  });

  it('restores symbolic definitions on incremental cache hits', () => {
    const definitions = block('symbolic-cache-def', 60, 'x := 1/3');
    const output = block('symbolic-cache-output', 124, 'x →');
    const first = recalculateAll([definitions, output]);
    expect(first.blocks[output.id]?.resultStr).toBe('1/3');

    const second = recalculateAll([{ ...definitions }, { ...output }]);
    expect(second.blocks[output.id]?.resultStr).toBe('1/3');
    expect(second.blocks[output.id]?.error).toBeNull();
  });

  it('does not reuse an exact definition after a later numeric definition shadows it', () => {
    const definitions = block('symbolic-shadow-def', 60, 'x := 1/3');
    const slider = {
      ...block('symbolic-shadow-slider', 124, ''),
      kind: 'slider' as const,
      sliderVar: 'x',
      sliderMin: 0,
      sliderMax: 3,
      sliderVal: 2,
    };
    const output = block('symbolic-shadow-output', 188, 'x →');
    const result = recalculateAll([definitions, slider, output]);
    expect(result.blocks[output.id]?.resultStr).toBe('2');
  });
});
