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

describe('GUM Type A/B', () => {
  it('uMean = s/sqrt(n)', () => {
    // mean 10.1, s = sqrt(0.1/4) = 0.1581138…, u = s/sqrt(5) = 0.0707106…
    close('uMean([10.1, 10.3, 9.9, 10.2, 10.0])', 0.070710678, 1e-6);
  });
  it('nuMean = n-1', () => {
    expect(num('nuMean([1, 2, 3, 4])')).toBe(3);
  });
  it('Type B distributions (GUM 4.3)', () => {
    close('uRect(0.4e-6)', 0.4e-6 / Math.sqrt(3), 1e-12); // GUM: 0.23e-6
    close('uTri(4)', 4 / Math.sqrt(6), 1e-12); // GUM 4.4.6: ≈1.6
    close('uNorm(240e-6, 3)', 80e-6, 1e-12); // GUM: 240 мкг, k=3 → 80 мкг
    close('uNorm(0.3)', 0.15, 1e-12); // default k=2
    close('uUshape(0.5)', 0.5 / Math.sqrt(2), 1e-12); // GUM H.1: ≈0.35
  });
  it('rejects bad inputs', () => {
    expect(evaluateLine('uMean([5]) =', createBaseScope()).error).not.toBeNull();
    expect(evaluateLine('uRect(-1) =', createBaseScope()).error).not.toBeNull();
    expect(evaluateLine('uNorm(1, 0) =', createBaseScope()).error).not.toBeNull();
  });
});

describe('GUM combined / expanded', () => {
  it('uComb is RSS', () => {
    close('uComb([0.1, 0.2])', Math.sqrt(0.05), 1e-12);
  });
  it('nuEff is Welch–Satterthwaite', () => {
    // uc² = 0.05, uc⁴ = 0.0025, den = 0.1⁴/4 = 2.5e-5 → 100
    close('nuEff([0.1, 0.2], [4, Infinity])', 100, 1e-9);
    expect(num('nuEff([0.1, 0.2])')).toBe(Infinity); // всё Type B точно
  });
  it('quantiles match GUM tables', () => {
    // GUM G.1: нормальные k
    close('normQuant(0.975)', 1.959964, 1e-4);
    close('normQuant(0.95)', 1.644854, 1e-4);
    // GUM G.2: Стьюдент t_95 (двусторонняя 95%)
    close('tStud(0.975, 1)', 12.7062, 1e-3);
    close('tStud(0.975, 9)', 2.2622, 5e-3);
    close('tStud(0.975, Infinity)', 1.95996, 1e-4);
    close('kCov(9)', 2.2622, 5e-3);
    close('kCov(Infinity)', 1.959964, 1e-4);
    close('kCov(1000)', 1.962, 5e-3);
  });
  it('uExpand and rounding (GUM 7.2.6)', () => {
    close('uExpand(0.35e-3, 2.26)', 0.35e-3 * 2.26, 1e-12);
    expect(num('uncRound(0.02341)')).toBeCloseTo(0.024, 12);
    expect(num('uncRound(10.47)')).toBeCloseTo(11, 12);
    expect(num('resRound(10.05762, 0.027)')).toBeCloseTo(10.058, 12);
  });
});

describe('МИ / ГОСТ 8.736 school', () => {
  it('confEps = t*S/sqrt(n)', () => {
    // t_95(4) = 2.7764, S(x̄) = 0.158/√5
    close('confEps(0.158, 5)', 2.7764 * (0.158 / Math.sqrt(5)), 1e-3);
  });
  it('thetaComb = sqrt(sum th²/3)', () => {
    close('thetaComb([0.04, 0.03])', Math.sqrt(0.0025 / 3), 1e-12);
  });
  it('deltaComb branch logic (θ/S thresholds)', () => {
    expect(num('deltaComb(0.2, 0.01, 0.1, 0.01)')).toBeCloseTo(0.2, 12); // θ/S=0.1 → ε
    expect(num('deltaComb(0.01, 1.0, 0.1, 0.3)')).toBeCloseTo(1.0, 12); // θ/S=10 → θ
    // mid: K=(0.2+0.3)/0.15=3.333, S_Σ=√0.0125 → 0.372678
    close('deltaComb(0.2, 0.3, 0.1, 0.05)', (0.5 / 0.15) * Math.sqrt(0.0125), 1e-9);
  });
});

describe('ПМГ 96-2009 app. B', () => {
  it('sums and expansion', () => {
    expect(num('pmgSumAbs([0.2, -0.1])')).toBeCloseTo(0.3, 12);
    close('pmgRSS([0.1, 0.05], [0.2, 0.1])', Math.sqrt(0.0291667), 1e-6);
    expect(num('pmgExpand(0.17, 2)')).toBeCloseTo(0.34, 12);
  });
});

describe('5725 / 21748 schemes', () => {
  it('prec5725 one-way ANOVA [s_r, s_L, s_R]', () => {
    const v = ev('prec5725([10.1, 10.3; 9.9, 10.0; 10.2, 10.1])') as {
      toArray: () => number[];
    };
    const [sr, sL, sR] = v.toArray();
    expect(sr).toBeCloseTo(0.1, 6);
    expect(sL).toBeCloseTo(Math.sqrt(0.0125), 6);
    expect(sR).toBeCloseTo(0.15, 6);
  });
  it('repLim and uTopDown', () => {
    expect(num('repLim(0.12)')).toBeCloseTo(0.336, 12);
    expect(num('uTopDown(0.15, 0.08)')).toBeCloseTo(0.17, 12);
  });
});

describe('GUM-S1 Monte-Carlo (uMC)', () => {
  const vec = (expr: string): number[] => {
    const r = evaluateLine(expr, createBaseScope());
    if (r.error) throw new Error(`${expr} → ${r.error}`);
    const v = r.value as { toArray?: () => number[] } | number;
    if (v !== null && typeof v === 'object' && typeof v.toArray === 'function') return v.toArray();
    return [v as number];
  };

  it('single normal input: mean/u/U match GUM-S1', () => {
    // x ~ N(10, 0.5)² формально; u(x)=0.5, U95=1.95996·0.5
    const [mean, u, U] = vec('uMC("x", [[x, 10, 0.5, "norm"]], 200000, 42)');
    expect(Math.abs(mean - 10)).toBeLessThan(0.005);
    expect(Math.abs(u - 0.5)).toBeLessThan(0.5 * 0.02);
    expect(Math.abs(U - 0.5 * 1.959964)).toBeLessThan(0.5 * 1.959964 * 0.02);
  });

  it('propagates via RSS for independent normals (GUM-S1 9.4)', () => {
    // модель a+b-c с a=N(100,1), b=N(50,0.5), c=N(2,0.2):
    // y=148, u=√(1²+0.5²+0.2²)=1.135782
    const [mean, u] = vec(
      'uMC("a+b-c", [[a, 100, 1, "norm"], [b, 50, 0.5, "norm"], [c, 2, 0.2, "norm"]], 200000, 7)',
    );
    expect(Math.abs(mean - 148)).toBeLessThan(0.01);
    const wantU = Math.sqrt(1 + 0.25 + 0.04);
    expect(Math.abs(u - wantU)).toBeLessThan(wantU * 0.02);
  });

  it('rect/tri/ushape stds match GUM 4.3', () => {
    // a/√3, a/√6, a/√2
    const [m1, u1] = vec('uMC("x", [[x, 0, 1, "rect"]], 200000, 1)');
    expect(Math.abs(m1)).toBeLessThan(0.005);
    expect(Math.abs(u1 - 1 / Math.sqrt(3))).toBeLessThan((1 / Math.sqrt(3)) * 0.02);
    const [, u2] = vec('uMC("x", [[x, 0, 1, "tri"]], 200000, 1)');
    expect(Math.abs(u2 - 1 / Math.sqrt(6))).toBeLessThan((1 / Math.sqrt(6)) * 0.02);
    const [, u3] = vec('uMC("x", [[x, 0, 1, "ushape"]], 200000, 1)');
    expect(Math.abs(u3 - 1 / Math.sqrt(2))).toBeLessThan((1 / Math.sqrt(2)) * 0.02);
  });

  it('deterministic under the same seed; differs without it', () => {
    const a = vec('uMC("sqrt(x)", [[x, 4, 0.1, "norm"]], 50000, 123)');
    const b = vec('uMC("sqrt(x)", [[x, 4, 0.1, "norm"]], 50000, 123)');
    const c = vec('uMC("sqrt(x)", [[x, 4, 0.1, "norm"]], 50000, 124)');
    expect(a).toEqual(b);
    expect(a[0]).not.toBe(c[0]);
  });

  it('95% interval brackets the analytic value', () => {
    const [mean, , U] = vec('uMC("x", [[x, 0, 1, "norm"]], 200000, 9)');
    expect(Math.abs(mean)).toBeLessThan(0.005);
    // эмпирические квантили 200k норм. шумят ~±0.01: допуск 0.05 (≈2.5σ)
    expect(Math.abs(U - 1.959964)).toBeLessThan(0.05);
  });

  it('rejects bad stub inputs', () => {
    expect(evaluateLine('uMC("x", [] , 100) =', createBaseScope()).error).not.toBeNull();
    expect(evaluateLine('uMC("x", [[x, 1, -1]], 100) =', createBaseScope()).error).not.toBeNull();
    expect(evaluateLine('uMC("x", [[x, 1]], 100) =', createBaseScope()).error).not.toBeNull();
    expect(evaluateLine('uMC("x", [[1, 2, 0.1]], 100) =', createBaseScope()).error).not.toBeNull();
    expect(
      evaluateLine('uMC("x", [[x, 1, 0.1, "cauchy"]], 100) =', createBaseScope()).error,
    ).not.toBeNull();
    expect(evaluateLine('uMC("x", [[x, 1, 0.1]], 50) =', createBaseScope()).error).not.toBeNull();
  });
});
