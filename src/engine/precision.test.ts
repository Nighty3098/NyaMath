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

  it('safely switches between arbitrary precision settings above mathjs constants', () => {
    setCalcPrecision({ mode: 'arbitrary', digits: 1100 });
    expect(evaluateLine('pi', createBaseScope()).error).toBeNull();
    setCalcPrecision({ mode: 'arbitrary', digits: 500 });
    expect(evaluateLine('pi', createBaseScope()).error).toBeNull();
    setCalcPrecision({ mode: 'arbitrary', digits: 1100 });
    expect(evaluateLine('pi', createBaseScope()).error).toBeNull();
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
    setNumFmt({ mode: 'sig', digits: 50 });
    const scope = createBaseScope();
    const log = evaluateLine('ln(2)', scope).value;
    expect(formatResult(log)).toBe('0.69314718055994530941723212145817656807550013436026');
    const sine = evaluateLine('sin(1)', scope).value;
    expect(formatResult(sine)).toBe('0.84147098480789650665250232163029899962256306079837');
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

  it('matches high-precision references for zeta, gamma, and Catalan', () => {
    setCalcPrecision({ mode: 'arbitrary', digits: 80 });
    const scope = createBaseScope();
    const cases = [
      ['zeta(3)', '1.2020569031595942853997381615114499907649862923404988817922715553418382'],
      ['zeta(5)', '1.0369277551433699263313654864570341680570809195019128119741926779038035'],
      [
        'ln(Gamma(10.5))',
        '13.9406252194037636331612378879718494797994528048474955812462859023236712',
      ],
      ['Catalan', '0.9159655941772190150546035149323841107741493742816721342664981196217630'],
    ] as const;

    for (const [expression, reference] of cases) {
      const result = evaluateLine(expression, scope);
      if (result.error) throw new Error(`${expression} failed: ${result.error}`);
      expect(math.isBigNumber(result.value)).toBe(true);
      const decimalDigits = reference.split('.')[1]?.length ?? 0;
      const formatted = (result.value as { toFixed(digits: number): string }).toFixed(
        decimalDigits + 5,
      );
      if (!formatted.startsWith(reference)) {
        throw new Error(`${expression} differed from its MPFR reference: ${String(result.value)}`);
      }
    }
  });

  it('matches MPFR references for the core 1,000-digit tests', () => {
    setCalcPrecision({ mode: 'arbitrary', digits: 1100 });
    const scope = createBaseScope();
    const cases = [
      [
        'exp(pi * sqrt(163))',
        '262537412640768743.9999999999992500725971981856888793538563373369908627075374',
      ],
      [
        'exp(pi^sqrt(2))',
        '155.6324702029295205117182808268921941913014575104846415938167412161067751',
      ],
      [
        'phi^(phi^10)',
        '50556913443893805650069150.48556250687371892791238137950311909500532649449',
      ],
      [
        'sin(e^5) + cos(pi^4)',
        '-1.6874970029951955644544964492172972008946924841973002272646142164448194',
      ],
      [
        'atan(acos(asin(0.5)))',
        '0.7951648887801830089413687520784186619183357826487539192379131566108986',
      ],
      [
        'ln(sqrt(pi^e + e^pi))',
        '1.9099522173708583242493995756814620130007883101030876912384258417093472',
      ],
      [
        'Catalan^(1/10)',
        '0.9912607634846542681986222041881358000739398751233421684157668919809552',
      ],
    ] as const;

    for (const [expression, reference] of cases) {
      const result = evaluateLine(expression, scope);
      if (result.error) throw new Error(`${expression} failed: ${result.error}`);
      expect(math.isBigNumber(result.value)).toBe(true);
      const decimalDigits = reference.split('.')[1]?.length ?? 0;
      const formatted = (result.value as { toFixed(digits: number): string }).toFixed(
        decimalDigits + 5,
      );
      if (!formatted.startsWith(reference)) {
        throw new Error(`${expression} differed from its MPFR reference: ${String(result.value)}`);
      }
    }
  }, 30_000);

  it('retains 1,000 decimal places and high precision through trigonometry', () => {
    setCalcPrecision({ mode: 'arbitrary', digits: 1020 });
    const scope = createBaseScope();
    const third = evaluateLine('1 / 3', scope).value;
    expect(math.isBigNumber(third)).toBe(true);
    setNumFmt({ mode: 'fixed', digits: 1000 });
    expect(formatResult(third)).toBe(`0.${'3'.repeat(1000)}`);
    expect(formatResult(math.bignumber(0))).toBe(`0.${'0'.repeat(1000)}`);
    setNumFmt({ mode: 'auto', digits: 6 });

    const sine = evaluateLine('sin(pi / 6)', scope).value;
    expect(math.isBigNumber(sine)).toBe(true);
    expect(
      (sine as { sub(value: string): { abs(): { lt(value: string): boolean } } })
        .sub('0.5')
        .abs()
        .lt('1e-1005'),
    ).toBe(true);

    const largeArgumentSine = evaluateLine('sin(1e100)', scope).value;
    expect(math.isBigNumber(largeArgumentSine)).toBe(true);
    expect(String(largeArgumentSine)).toMatch(
      /^-0\.3723761236612766882620866955531642957196678835674347023644153882967192/,
    );
  });

  it('evaluates 1,000-digit zeta and Catalan values', () => {
    setCalcPrecision({ mode: 'arbitrary', digits: 1020 });
    const scope = createBaseScope();
    const zeta3 = evaluateLine('zeta(3)', scope).value;
    expect(math.isBigNumber(zeta3)).toBe(true);
    expect(String(zeta3)).toMatch(
      /^1\.2020569031595942853997381615114499907649862923404988817922715553418382/,
    );

    const zeta5 = evaluateLine('zeta(5)', scope).value;
    expect(math.isBigNumber(zeta5)).toBe(true);
    expect(String(zeta5)).toMatch(
      /^1\.0369277551433699263313654864570341680570809195019128119741926779038035/,
    );

    const catalan = evaluateLine('Catalan', scope).value;
    expect(math.isBigNumber(catalan)).toBe(true);
    expect(String(catalan)).toMatch(
      /^0\.9159655941772190150546035149323841107741493742816721342664981196217630/,
    );
    const gamma = evaluateLine('ln(Gamma(10.5))', scope).value;
    expect(math.isBigNumber(gamma)).toBe(true);
    expect(String(gamma)).toMatch(
      /^13\.9406252194037636331612378879718494797994528048474955812462859023236712/,
    );
  }, 180_000);

  it('keeps 1,000 decimal places through a chaotic 150-step recurrence', () => {
    setCalcPrecision({ mode: 'arbitrary', digits: 1000 });
    const source = 'x := 0.7001 + 1/1000\nfor i in 1..150\nx := 4*x*(1-x)\nend\nx';
    const result = runProgram(source, createBaseScope());
    expect(result.error).toBeNull();
    expect(math.isBigNumber(result.value)).toBe(true);
    setNumFmt({ mode: 'fixed', digits: 1000 });
    const formatted = formatResult(result.value);
    expect(formatted).toMatch(
      /^0\.983132220633423784842802828760210388244012776053226696203145446653280138822207/,
    );
    expect(formatted).toHaveLength(1002);
  });

  it('evaluates the stated finite N=100 series and depth-150 continued fraction', () => {
    setCalcPrecision({ mode: 'arbitrary', digits: 1100 });
    setNumFmt({ mode: 'fixed', digits: 181 });
    const scope = createBaseScope();
    const series = runProgram(
      'x := 1\nterm := 1\ns := 0\nfor k in 1..100\nterm := -term*x/k\ns := s+term\nend\ns',
      scope,
    );
    expect(series.error).toBeNull();
    expect(math.isBigNumber(series.value)).toBe(true);
    expect(formatResult(series.value)).toMatch(
      /^-0\.632120558828557678404476229838539132554188868968232165492163198302538504255100196642852725654080356253372674723156004791753024207209870991373346410505901216907700572592543495760280/,
    );

    setNumFmt({ mode: 'fixed', digits: 101 });
    const continuedFraction = runProgram('c := 1\nfor n in 1..150\nc := 1+1/c\nend\nc', scope);
    expect(continuedFraction.error).toBeNull();
    expect(math.isBigNumber(continuedFraction.value)).toBe(true);
    expect(formatResult(continuedFraction.value)).toMatch(
      /^1\.6180339887498948482045868343656381177203091798057628621354486209864909301300435514122830787992515118/,
    );
  });
});
