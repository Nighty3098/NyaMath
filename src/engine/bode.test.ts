import { describe, expect, it } from 'vitest';
import { createBaseScope, evaluateLine } from './mathEngine';

function ev(expr: string): unknown {
  const r = evaluateLine(expr, createBaseScope());
  if (r.error) throw new Error(`${expr} → ${r.error}`);
  return r.value;
}

const num = (expr: string): number => Number(ev(expr));
const close = (expr: string, want: number, tol = 1e-6) => {
  expect(Math.abs(num(expr) - want)).toBeLessThanOrEqual(tol);
};

describe('Bode / transfer functions (САУ)', () => {
  it('bodeH: first-order low-pass H=(1)/(1+s)', () => {
    // H(jω)=1/(1+jω): при ω=1 → 0.5 − 0.5j
    const c = ev('bodeH([1], [1, 1], 1)') as { re: number; im: number };
    expect(c.re).toBeCloseTo(0.5, 6);
    expect(c.im).toBeCloseTo(-0.5, 6);
    // модуль через mathjs abs
    close('abs(bodeH([1], [1, 1], 1))', Math.SQRT1_2, 1e-9);
  });

  it('bodeMagDb: |H| in dB', () => {
    // 20·log10(1/√(1+ω²)): ω=1 → −3.0103, ω=10 → −20.043
    close('bodeMagDb([1], [1, 1], 1)', -3.0102999, 1e-3);
    close('bodeMagDb([1], [1, 1], 10)', -20.04315, 1e-3);
  });

  it('bodePhaseDeg: −atan(ω) wrapped to (−180, 180]', () => {
    close('bodePhaseDeg([1], [1, 1], 1)', -45, 1e-6);
    close('bodePhaseDeg([1], [1, 1], 0.1)', -5.7106, 1e-3);
    // резонанс второго порядка ω₀=√10: H=1/(2jω₀), фаза −90°
    close('bodePhaseDeg([1], [1, 2, 10], sqrt(10))', -90, 1e-6);
  });

  it('bodeMagDb second-order resonant peak', () => {
    // H=1/(s²+2s+10); на ω=√10: |H|=1/(2ω₀) → 1/6.324555 = 0.158114 → −16.02 дБ
    close('bodeMagDb([1], [1, 2, 10], sqrt(10))', -16.0206, 1e-3);
  });

  it('bodeFreqs: geometric (log-space) grid', () => {
    const ws = ev('bodeFreqs(10, 1000, 3)') as { toArray: () => number[] };
    const arr = ws.toArray();
    expect(arr.length).toBe(3);
    expect(arr[0]).toBeCloseTo(10, 9);
    expect(arr[1]).toBeCloseTo(100, 9); // геом. среднее
    expect(arr[2]).toBeCloseTo(1000, 9);
    expect(arr[1] / arr[0]).toBeCloseTo(arr[2] / arr[1], 9); // равные отношения
  });

  it('bode table: [ω, dB] rows, n×2', () => {
    const m = ev('bode([1], [1, 1], 1, 10, 3)') as { toArray: () => number[][] };
    const rows = m.toArray();
    expect(rows.length).toBe(3);
    expect(rows.every((r) => r.length === 2)).toBe(true);
    expect(rows[0][0]).toBeCloseTo(1, 6);
    expect(rows[0][1]).toBeCloseTo(-3.0103, 3);
    expect(rows[2][0]).toBeCloseTo(10, 6);
    expect(rows[2][1]).toBeCloseTo(-20.04315, 3);
  });

  it('vectorized over frequency arrays', () => {
    const mags = ev('bodeMagDb([1], [1, 1], [1, 10])') as { toArray: () => number[] };
    const arr = mags.toArray();
    expect(arr.length).toBe(2);
    expect(arr[0]).toBeCloseTo(-3.0103, 3);
    expect(arr[1]).toBeCloseTo(-20.04315, 3);
  });

  it('rejects bad polynomials / ranges', () => {
    expect(evaluateLine('bode([1], [], 1) =', createBaseScope()).error).not.toBeNull();
    expect(evaluateLine('bode([1], [1, 1], -1, 10) =', createBaseScope()).error).not.toBeNull();
    expect(evaluateLine('bode([1], [1, 1], 10, 1) =', createBaseScope()).error).not.toBeNull();
    expect(evaluateLine('bodeFreqs(1, 10, 2) =', createBaseScope()).error).not.toBeNull(); // n<3
    expect(evaluateLine('bodeMagDb([1], [a], 1) =', createBaseScope()).error).not.toBeNull();
  });

  it('exposes constants via scope: c_light still exact, new SI constants present', () => {
    close('c_light', 299792458, 0);
    expect(ev('m_n')).toBeGreaterThan(0);
    expect(ev('R_inf')).toBeGreaterThan(0);
  });
});
