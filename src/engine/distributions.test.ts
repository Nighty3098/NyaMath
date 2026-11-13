import { describe, expect, it } from 'vitest';
import { createBaseScope, evaluateLine } from './mathEngine';

function ev(expr: string): unknown {
  const r = evaluateLine(expr, createBaseScope());
  if (r.error) throw new Error(`${expr} → ${r.error}`);
  return r.value;
}

const num = (expr: string): number => ev(expr) as number;
const close = (expr: string, want: number, tol = 1e-9) => {
  expect(Math.abs(num(expr) - want)).toBeLessThanOrEqual(tol);
};

describe('continuous distributions', () => {
  it('uniform pdf/cdf/quantile', () => {
    expect(num('unifpdf(0.5, 0, 1)')).toBe(1);
    expect(num('unifpdf(2, 0, 1)')).toBe(0);
    close('unifcdf(0.25, 0, 1)', 0.25);
    expect(num('unifcdf(-1, 0, 1)')).toBe(0);
    expect(num('unifcdf(2, 0, 1)')).toBe(1);
    expect(num('unifQuant(0.5, 0, 10)')).toBe(5);
    expect(evaluateLine('unifcdf(0.5, 1, 1)', createBaseScope()).error).not.toBeNull();
  });

  it('exponential pdf/cdf/quantile, with shift', () => {
    expect(num('exppdf(0, 2)')).toBe(2);
    expect(num('exppdf(0, 2, 1)')).toBe(0);
    close('expcdf(1, 2)', 1 - Math.exp(-2));
    close('expcdf(2, 1, 1)', 1 - Math.exp(-1));
    close('expQuant(0.5, 2)', Math.log(2) / 2);
    expect(evaluateLine('exppdf(1, 0)', createBaseScope()).error).not.toBeNull();
  });

  it('Pareto pdf/cdf/moments', () => {
    expect(num('paretocdf(4, 3, 2)')).toBe(7 / 16);
    expect(num('paretopdf(4, 3, 2)')).toBe(18 / 64);
    expect(num('paretoMean(3, 3)')).toBe(4.5);
    expect(num('paretoVar(3, 3)')).toBe(6.75);
    expect(num('paretoMean(3, 2)')).toBe(6);
    expect(num('paretoMean(3, 1)')).toBe(Infinity);
    expect(num('paretoVar(3, 2)')).toBe(Infinity);
    expect(evaluateLine('paretocdf(4, 0, 2)', createBaseScope()).error).not.toBeNull();
  });

  it('Laplace Φ₀ and its inverse', () => {
    close('Phi0(2)', 0.47724986805182085, 1e-7);
    close('Phi0(0)', 0);
    close('invPhi0(0.4)', 1.2815515655446004, 1e-5);
    close('Phi0(invPhi0(0.4))', 0.4, 1e-5);
    expect(evaluateLine('invPhi0(0.5)', createBaseScope()).error).not.toBeNull();
  });

  it('normal quantile supports mean and sigma', () => {
    close('normQuant(0.975)', 1.959963984540054, 1e-5);
    close('normQuant(0.975, 180, 10)', 180 + 10 * 1.959963984540054, 1e-4);
    close('normcdf(200, 180, 10)', 0.9772498680518208, 1e-4);
    close('1 - normcdf(200, 180, 10)', 0.02275013194817921, 1e-4);
    expect(evaluateLine('normQuant(0.5, 0, 0)', createBaseScope()).error).not.toBeNull();
  });
});
