import { afterEach, describe, expect, it } from 'vitest';
import { recalculateAll, type MathBlockData } from './dependencies';
import { convertToUnit, math, setCalcPrecision } from './mathEngine';
import { adaptiveSimpson, nelderMead } from './numeric';
import { analyzeProgram, runProgram } from './program';
import { parseSimDef, runSim } from './simEngine';

let id = 0;

function block(rawInput: string): MathBlockData {
  return {
    id: `audit${id++}`,
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

function calc(rawInput: string): MathBlockData {
  const b = block(rawInput);
  return recalculateAll([b]).blocks[b.id];
}

afterEach(() => {
  setCalcPrecision({ mode: 'standard', digits: 50 });
});

describe('engine audit regressions', () => {
  it('keeps global dependencies read before a program-local assignment', () => {
    const source = 'result := coefficient * 2\ncoefficient := 5\nreturn result';
    expect(analyzeProgram(source)).toEqual({
      dependencies: ['coefficient'],
      assigned: ['result', 'coefficient'],
    });
    expect(runProgram(source, { coefficient: 3 })).toMatchObject({ value: 6, error: null });
  });

  it('does not assume assignments in optional branches always execute', () => {
    const source = 'if flag\ncoefficient := 5\nend\nresult := coefficient * 2\nreturn result';
    expect(analyzeProgram(source).dependencies).toEqual(['flag', 'coefficient']);
    expect(runProgram(source, { flag: 0, coefficient: 3 })).toMatchObject({
      value: 6,
      error: null,
    });
  });

  it('accepts BigNumber values in program conditions and loop counts', () => {
    setCalcPrecision({ mode: 'arbitrary', digits: 50 });
    const condition = runProgram('if n\nreturn 1\nelse\nreturn 0\nend', {
      n: math.bignumber(2),
    });
    const loop = runProgram('for i in count\nlast := i\nend\nreturn last', {
      count: math.bignumber(3),
    });
    expect(Number(condition.value)).toBe(1);
    expect(condition.error).toBeNull();
    expect(Number(loop.value)).toBe(3);
    expect(loop.error).toBeNull();
  });

  it('converts BigNumber values to units and supports numeric solvers in arbitrary mode', () => {
    setCalcPrecision({ mode: 'arbitrary', digits: 50 });
    const converted = convertToUnit(math.bignumber('1.234567890123456789'), 'm', 'length');
    expect(math.isUnit(converted)).toBe(true);
    expect(math.isBigNumber(converted.value)).toBe(true);
    expect(String(converted.value)).toBe('1.234567890123456789');

    const result = calc('root("x - 1", "x", 0) =');
    expect(result.error).toBeNull();
    expect(Number(result.resultStr)).toBeCloseTo(1, 12);
  });

  it('does not accept a small Newton step without a small residual', () => {
    expect(calc('root("exp(1e9*x)", "x", 0) =').error).not.toBeNull();
  });

  it('does not infer convergence from isolated small terms in an infinite sum', () => {
    expect(calc('nsum("sin(pi*k/2)", "k", 1, Infinity) =').error).not.toBeNull();
  });

  it('preserves Taylor coefficients below the former absolute cutoff', () => {
    const result = calc('taylor("1e-13*x", "x", 0, 1) =');
    expect(result.error).toBeNull();
    expect(result.resultStr).toContain('1e-13');
  });

  it('rejects NaN counts and non-finite linspace endpoints', () => {
    expect(calc('linspace(0, 1, 0/0) =').error).not.toBeNull();
    expect(calc('linspace(1/0, 1, 2) =').error).not.toBeNull();
  });

  it('returns a BVP trajectory on the same RK4 grid used for shooting', () => {
    const result = calc('S := bvp("0", "x", 0, 1, 0, 1) =');
    expect(result.error).toBeNull();
    const rows = (result.resultValue as { toArray: () => number[][] }).toArray();
    expect(rows).toHaveLength(101);
    expect(rows.at(-1)?.[1]).toBeCloseTo(1, 9);
  });

  it('rejects a BVP whose shooting evaluation is invalid', () => {
    expect(calc('bvp("sqrt(-1)", "x", 0, 1, 0, 1) =').error).not.toBeNull();
  });

  it('does not return a BVP trajectory when the boundary condition is unreachable', () => {
    expect(calc('bvp("exp(yp)", "x", 0, 1, 0, 2, -1) =').error).not.toBeNull();
  });

  it('rejects adaptive integration when maxDepth cannot meet tolerance', () => {
    expect(() => adaptiveSimpson((x) => (x < 0.123 ? 0 : 1), 0, 1, 1e-14, 1)).toThrow(
      'did not converge',
    );
  });

  it('requires both objective and simplex convergence from Nelder-Mead', () => {
    const result = nelderMead(() => 1, [10], 1, 1e-8);
    expect(result.converged).toBe(false);
    expect(nelderMead((x) => (x[0] - 2) ** 2, [0], 500, 1e-8).converged).toBe(true);
  });

  it('refreshes auxiliary values between sequential simulation events', () => {
    const parsed = parseSimDef({
      states: 'x',
      derivs: '1',
      aux: 'aux = x^2',
      init: '0',
      t0: 0,
      t1: 3,
      dt: 0.1,
      solver: 'rk4',
      events: 'x >= 2 => x := 0\naux > 3.9 => stop',
    });
    expect(parsed.error).toBeNull();
    if (!parsed.def) throw new Error('Expected a valid simulation definition');
    const result = runSim(parsed.def, {});
    expect(result.halted, JSON.stringify(result)).toBe(false);
    expect(result.events).toHaveLength(1);
  });
});
