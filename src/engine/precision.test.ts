import { afterEach, describe, expect, it } from 'vitest';
import {
  evaluateLine,
  formatResult,
  math,
  setAngleMode,
  setCalcPrecision,
  setNumFmt,
  createBaseScope,
  compilePlotExpr,
} from './mathEngine';
import { samplePlotBlock } from './plotSample';
import { parseSimDef, runSim } from './simEngine';
import { runProgram } from './program';

afterEach(() => {
  setAngleMode('rad');
  setCalcPrecision({ mode: 'standard', digits: 50 });
  setNumFmt({ mode: 'auto', digits: 6 });
});

describe('arbitrary calculation precision', () => {
  it('supports exact rational arithmetic through mathjs fractions', () => {
    const result = math.evaluate("fraction('1/3') + fraction('1/6')");
    expect(math.isFraction(result)).toBe(true);
    expect(math.format(result)).toBe('1/2');
  });

  it('retains decimal precision in arithmetic and formatting', () => {
    setCalcPrecision({ mode: 'arbitrary', digits: 50 });
    setNumFmt({ mode: 'sig', digits: 50 });
    const result = evaluateLine('1 / 3 =', createBaseScope());
    expect(result.error).toBeNull();
    expect(math.isBigNumber(result.value)).toBe(true);
    expect(formatResult(result.value)).toBe('0.33333333333333333333333333333333333333333333333333');
  });

  it('keeps 180 decimal places through division, powers, roots, and rounding', () => {
    setCalcPrecision({ mode: 'arbitrary', digits: 220 });
    const scope = createBaseScope();

    const third = evaluateLine('1 / 3', scope).value;
    expect(math.isBigNumber(third)).toBe(true);
    expect(String(third)).toMatch(/^0\.3{180,}/);
    expect(String(evaluateLine('10^1000', scope).value)).toBe('1e+1000');

    const sqrtSquared = evaluateLine('sqrt(2)^2', scope).value;
    expect(math.isBigNumber(sqrtSquared)).toBe(true);
    expect(
      (sqrtSquared as { sub(value: string): { abs(): { lt(value: string): boolean } } })
        .sub('2')
        .abs()
        .lt('1e-210'),
    ).toBe(true);

    const rounded = evaluateLine('round(123456.789, 2)', scope).value;
    expect(math.isBigNumber(rounded)).toBe(true);
    expect(String(rounded)).toBe('123456.79');
  });

  it('runs a 100,000-iteration loop with exact BigNumber accumulation', () => {
    const source = 's := 0\nfor i in 1..100000\ns := s + i\nend\ns';
    const standardStarted = performance.now();
    const standard = runProgram(source, createBaseScope());
    const standardMs = performance.now() - standardStarted;

    setCalcPrecision({ mode: 'arbitrary', digits: 100 });
    const started = performance.now();
    const result = runProgram(source, createBaseScope());
    const elapsedMs = performance.now() - started;

    expect(standard.error).toBeNull();
    expect(String(standard.value)).toBe('5000050000');
    expect(result.error).toBeNull();
    expect(math.isBigNumber(result.value)).toBe(true);
    expect(String(result.value)).toBe('5000050000');
    console.info(
      `100k-iteration accumulation: standard ${standardMs.toFixed(1)} ms, BigNumber ${elapsedMs.toFixed(1)} ms`,
    );
  });

  it('preserves a 50,000-by-50,000 sparse matrix without visiting implicit zeros', () => {
    setCalcPrecision({ mode: 'arbitrary', digits: 100 });
    const SparseMatrix = (
      math as unknown as {
        SparseMatrix: new (data: {
          values: number[];
          index: number[];
          ptr: number[];
          size: number[];
        }) => unknown;
      }
    ).SparseMatrix;
    const pointers = Array(50001).fill(1);
    pointers[0] = 0;
    const matrix = new SparseMatrix({
      values: [3.141592653589793],
      index: [49999],
      ptr: pointers,
      size: [50000, 50000],
    });
    const scope = { A: matrix };

    const started = performance.now();
    const expression = compilePlotExpr('A');
    expect(expression).not.toBeNull();
    const result = expression!.code.evaluate(scope);
    const elapsedMs = performance.now() - started;

    expect(math.isSparseMatrix(result)).toBe(true);
    expect((result as { size: () => number[] }).size()).toEqual([50000, 50000]);
    expect(
      math.isBigNumber((result as { get: (index: number[]) => unknown }).get([49999, 0])),
    ).toBe(true);
    console.info(`50k-by-50k sparse matrix precision promotion: ${elapsedMs.toFixed(1)} ms`);
  });

  it('promotes and sums a dense 500-by-500 matrix', () => {
    setCalcPrecision({ mode: 'arbitrary', digits: 220 });
    const scope = createBaseScope();
    scope['A'] = math.ones(500, 500);

    const started = performance.now();
    const result = evaluateLine('sum(A)', scope);
    const elapsedMs = performance.now() - started;

    expect(result.error).toBeNull();
    expect(math.isBigNumber(result.value)).toBe(true);
    expect(String(result.value)).toBe('250000');
    console.info(`BigNumber 500x500 matrix promotion and sum: ${elapsedMs.toFixed(1)} ms`);
  });

  it('promotes numeric scope values before arbitrary-precision evaluation', () => {
    setCalcPrecision({ mode: 'arbitrary', digits: 50 });
    const scope = createBaseScope();
    scope['pi'] = 3.141592653589793;
    const result = evaluateLine('4*pi*10^-7', scope);
    expect(result.error).toBeNull();
    expect(math.isBigNumber(result.value)).toBe(true);
    expect(String(result.value)).toBe('0.0000012566370614359172');
    expect(math.isBigNumber(scope['pi'])).toBe(true);

    const plotScope = createBaseScope();
    plotScope['pi'] = 3.141592653589793;
    const plotExpr = compilePlotExpr('4*pi*10^-7');
    expect(plotExpr).not.toBeNull();
    expect(math.isBigNumber(plotExpr!.code.evaluate(plotScope))).toBe(true);

    plotScope['A'] = math.matrix([[3.141592653589793, 2]]);
    const matrixExpr = compilePlotExpr('sum(A)');
    expect(matrixExpr).not.toBeNull();
    expect(math.isBigNumber(matrixExpr!.code.evaluate(plotScope))).toBe(true);
  });

  it('uses arbitrary-precision mathjs logarithms and trigonometry', () => {
    setCalcPrecision({ mode: 'arbitrary', digits: 50 });
    const scope = createBaseScope();
    const log = evaluateLine('ln(2)', scope).value;
    expect(String(log)).toBe('0.69314718055994530941723212145817656807550013436026');
    const sine = evaluateLine('sin(1)', scope).value;
    expect(String(sine)).toBe('0.84147098480789650665250232163029899962256306079837');
  });

  it('converts BigNumber results at the plotting boundary', () => {
    setCalcPrecision({ mode: 'arbitrary', digits: 50 });
    const scope = createBaseScope();
    expect(evaluateLine('a := 2', scope).error).toBeNull();
    expect(evaluateLine('f(x) := a*x^2', scope).error).toBeNull();
    expect(samplePlotBlock('f(x)', scope, -2, 2, 16)).not.toBeNull();
  });

  it('keeps simulations running by converting BigNumber derivatives at the solver boundary', () => {
    setCalcPrecision({ mode: 'arbitrary', digits: 50 });
    const parsed = parseSimDef({
      states: 'x',
      derivs: '1 / 3',
      init: 'x=0',
      t0: 0,
      t1: 1,
      dt: 0.1,
      solver: 'rk4',
    });
    expect(parsed.error).toBeNull();
    expect(parsed.def).not.toBeNull();
    const result = runSim(parsed.def!, createBaseScope());
    expect(result.error).toBeNull();
    expect(result.final[0]).toBeCloseTo(1 / 3, 10);
  });

  it('converts degree-mode BigNumber trigonometry without rounding to double', () => {
    setCalcPrecision({ mode: 'arbitrary', digits: 50 });
    setAngleMode('deg');
    const result = evaluateLine('sin(30)', createBaseScope()).value;
    expect(math.isBigNumber(result)).toBe(true);
    expect(
      (result as { sub(value: number): { abs(): { lt(value: string): boolean } } })
        .sub(0.5)
        .abs()
        .lt('1e-48'),
    ).toBe(true);
  });
});
