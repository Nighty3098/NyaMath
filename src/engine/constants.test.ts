import { describe, expect, it } from 'vitest';
import { getConstant } from '../lib/db';
import { recalculateAll } from './dependencies';

/**
 * Привязка констант БД к авторитетным значениям (CODATA-2022, спецвыпуск,
 * https://physics.nist.gov/cuu/Constants/index.html). Любое расхождение —
 * сигнал, что число в NyaMath.db устарело: обновлять ТОЛЬКО по свежему
 * листингу NIST (db/seed.json → npm run seed).
 */
const EXACT: Record<string, number> = {
  c_light: 299792458,
  h_planck: 6.62607015e-34,
  k_B: 1.380649e-23,
  q_e: 1.602176634e-19,
  N_A: 6.02214076e23,
  R_gas: 8.31446261815324,
  sigma_sb: 5.670374419e-8,
  g_std: 9.80665,
  atm_pa: 101325,
  au_m: 1.495978707e11,
  ly_m: 9.4607304725808e15,
};

const CODATA: Record<string, number> = {
  mu_0: 1.25663706127e-6,
  eps_0: 8.8541878188e-12,
  Z_0: 376.730313412,
  alpha: 7.2973525643e-3,
  alpha_inv: 137.035999177,
  G_const: 6.6743e-11,
  m_e: 9.1093837139e-31,
  m_p: 1.67262192595e-27,
  m_n: 1.67492750056e-27,
  u_mass: 1.66053906892e-27,
  mu_B: 9.2740100657e-24,
  mu_N: 5.0507837393e-27,
  R_inf: 10973731.568157,
  a0: 5.29177210544e-11,
  r_e: 2.8179403205e-15,
  lam_compton: 2.42631023538e-12,
};

const rel = (a: number, b: number) => Math.abs(a - b) / Math.max(Math.abs(a), Math.abs(b));

describe('physical constants (CODATA 2022 + SI-2019 exact)', () => {
  it('exact/defined SI constants match the fixed values', () => {
    for (const [name, expected] of Object.entries(EXACT)) {
      expect(getConstant(name)).toBeCloseTo(expected, 14);
    }
  });

  it('measured CODATA 2022 values match NIST to 1e-10 relative', () => {
    for (const [name, expected] of Object.entries(CODATA)) {
      const got = getConstant(name);
      expect(rel(got, expected), `${name}: off the 2022 value`).toBeLessThan(1e-10);
    }
  });

  it('SI-2019 identity: eps_0 · mu_0 · c² ≈ 1 and Z_0 = sqrt(mu_0/eps_0)', () => {
    const mu_0 = getConstant('mu_0');
    const eps_0 = getConstant('eps_0');
    const Z_0 = getConstant('Z_0');
    const c2 = getConstant('c_light') * getConstant('c_light');
    // После SI-2019 соотношение не точное (μ₀ и ε₀ измеряются независимо):
    expect(Math.abs(mu_0 * eps_0 * c2 - 1)).toBeLessThan(5e-10);
    expect(rel(Z_0, Math.sqrt(mu_0 / eps_0))).toBeLessThan(5e-9);
  });

  it('derived R_gas = N_A·k_B and F_const = N_A·e hold', () => {
    // В SI-2019 R и F — точные производные; в IEEE-754 продукты согласуются
    // с литералами до ~1ulp, поэтому сравнение с ослаблением 1e-13.
    const R_gas = getConstant('R_gas');
    const N_A = getConstant('N_A');
    const k_B = getConstant('k_B');
    const F_const = getConstant('F_const');
    const q_e = getConstant('q_e');
    expect(Math.abs(R_gas - N_A * k_B)).toBeLessThan(1e-13 * R_gas);
    expect(Math.abs(F_const - N_A * q_e)).toBeLessThan(1e-13 * F_const);
  });

  it('every constant is exposed to the engine scope via recalc path', () => {
    const { scope } = recalculateAll([]);
    const publicNames = [...Object.keys(EXACT), ...Object.keys(CODATA), 'hbar', 'eta0'];
    for (const name of publicNames) {
      expect(scope[name], `scope lacks ${name}`).not.toBeUndefined();
      expect(scope[name], `${name} wrong value`).toBeCloseTo(getConstant(name === 'eta0' ? 'Z_0' : name), 12);
    }
  });
});
