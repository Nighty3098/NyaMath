import { describe, expect, it } from 'vitest';
import { evaluateLine, createBaseScope } from './mathEngine';

const scopeWith = (lines: string[]): Record<string, unknown> => {
  const scope = createBaseScope();
  for (const line of lines) {
    const r = evaluateLine(line, scope);
    expect(r.error, line).toBeNull();
  }
  return scope;
};

const evalLine = (line: string, scope: Record<string, unknown> = {}): unknown => {
  const r = evaluateLine(line, { ...createBaseScope(), ...scope });
  expect(r.error, line).toBeNull();
  return r.value;
};

describe('mathcad: functions imported from Mathcad worksheets', () => {
  it('rawArgs function keeps its flag when imported into the math namespace', () => {
    const f = (createBaseScope() as Record<string, unknown>)['vectorize'] as {
      rawArgs?: boolean;
    };
    expect(f?.rawArgs).toBe(true);
  });
  it('vector length/last and inclusive submatrix (0-based Mathcad indices)', () => {
    const s = scopeWith(['A := [1, 2, 3, 4]']);
    expect(evalLine('length(A) =', s)).toBe(4);
    expect(evalLine('last(A) =', s)).toBe(3);
    const m = scopeWith(['m := [[1, 2, 3], [4, 5, 6]]']);
    const sub = evalLine('submatrix(m, 0, 1, 1, 2) =', m) as { toArray: () => number[][] };
    expect(sub.toArray()).toEqual([[2, 3], [5, 6]]);
  });

  it('distribution CDF/quantile and seeded random streams', () => {
    expect(Number(evalLine('pnorm(0) ='))).toBeCloseTo(0.5, 6);
    expect(Number(evalLine('qnorm(0.975) ='))).toBeCloseTo(1.959963985, 6);
    expect(Number(evalLine('pchisq(3.841459, 1) ='))).toBeCloseTo(0.95, 5);
    expect(evalLine('rnorm(3, 0, 1) =', scopeWith(['Seed(42)']))).toEqual(
      evalLine('rnorm(3, 0, 1) =', scopeWith(['Seed(42)'])),
    );
    const r = evalLine('rbinom(1, 10, 0.5) =', scopeWith(['Seed(7)'])) as {
      toArray: () => number[];
    };
    expect(r.toArray()[0]).toBeGreaterThanOrEqual(0);
    expect(r.toArray()[0]).toBeLessThanOrEqual(10);
  });

  it('finance and string helpers use Mathcad names', () => {
    expect(Number(evalLine('pmt(0.1, 10, 1000) ='))).toBeCloseTo(-162.745, 3);
    expect(evalLine('str2num("1,5") =')).toBe(1.5);
  });

  it('Mathcad matrix ordering helpers use rows/columns, not flattening', () => {
    const s = scopeWith(['m := [[4, 5, 6], [1, 2, 3]]']);
    expect((evalLine('reverse(m) =', s) as { toArray: () => number[][] }).toArray()).toEqual([
      [1, 2, 3],
      [4, 5, 6],
    ]);
    expect((evalLine('csort(m, 0) =', s) as { toArray: () => number[][] }).toArray()).toEqual([
      [1, 2, 3],
      [4, 5, 6],
    ]);
    const r = scopeWith(['n := [[4, 2, 6], [40, 20, 60]]']);
    expect((evalLine('rsort(n, 0) =', r) as { toArray: () => number[][] }).toArray()).toEqual([
      [2, 4, 6],
      [20, 40, 60],
    ]);
  });

  it('vectorize is elementwise, and Mathcad-only elementary names work', () => {
    const s = scopeWith(['v := [0, pi / 2]']);
    const out = evalLine('vectorize(sin(v)) =', s) as { toArray: () => number[] };
    expect(out.toArray()[0]).toBeCloseTo(0, 6);
    expect(out.toArray()[1]).toBeCloseTo(1, 6);
    expect(Number(evalLine('cnorm(0) ='))).toBeCloseTo(0.5, 6);
    expect(evalLine('trunc(-1.7) =')).toBe(-1);
    expect(Number(evalLine('ln0(0) ='))).toBeLessThan(-1e306);
    expect(Number(evalLine('mcAtan2(1, 1) ='))).toBeCloseTo(Math.PI / 4, 6);
    expect(Number(evalLine('mcAngle(-1, 0) ='))).toBeCloseTo(Math.PI, 6);
    expect(Number(evalLine('nthRoot(-8, 3) ='))).toBeCloseTo(-2, 6);
  });

  it('statistics catalog functions have Mathcad semantics', () => {
    const s = scopeWith(['x := [1, 2, 3, 4]']);
    expect(Number(evalLine('mcVar(x) =', s))).toBeCloseTo(1.25, 6);
    expect(Number(evalLine('mcStdev(x) =', s))).toBeCloseTo(Math.sqrt(1.25), 6);
    expect(Number(evalLine('mcGMean([1, 4]) ='))).toBeCloseTo(2, 6);
    expect(Number(evalLine('mcHMean([1, 4]) ='))).toBeCloseTo(1.6, 6);
  });
});
