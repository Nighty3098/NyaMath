import { describe, expect, it } from 'vitest';
import { CODATA2022, SI_CONSTANTS } from './constants';
import { recalculateAll } from './dependencies';

/**
 * Привязка констант к авторитетным значениям (CODATA-2022, спецвыпуск,
 * https://physics.nist.gov/cuu/Constants/index.html). Любое расхождение —
 * сигнал, что число устарело: обновлять ТОЛЬКО по свежему листингу NIST,
 * выставив относительную неопределённость в 5·10⁻¹⁰ (14+ значащих цифр).
 */
const EXACT: Record<string, number> = {
  c: 299792458,
  h: 6.62607015e-34,
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
      expect(SI_CONSTANTS[name as keyof typeof SI_CONSTANTS]).toBeCloseTo(expected, 14);
    }
  });

  it('measured CODATA 2022 values match NIST to 1e-10 relative', () => {
    for (const [name, expected] of Object.entries(CODATA)) {
      const got = CODATA2022[name as keyof typeof CODATA2022];
      expect(rel(got, expected), `${name}: off the 2022 value`).toBeLessThan(1e-10);
    }
  });

  it('SI-2019 identity: eps_0 · mu_0 · c² ≈ 1 and Z_0 = sqrt(mu_0/eps_0)', () => {
    const { mu_0, eps_0, Z_0 } = CODATA2022;
    const c2 = SI_CONSTANTS.c * SI_CONSTANTS.c;
    // После SI-2019 соотношение не точное (μ₀ и ε₀ измеряются независимо):
    expect(Math.abs(mu_0 * eps_0 * c2 - 1)).toBeLessThan(5e-10);
    expect(rel(Z_0, Math.sqrt(mu_0 / eps_0))).toBeLessThan(5e-9);
  });

  it('derived R_gas = N_A·k_B and F_const = N_A·e hold', () => {
    // В SI-2019 R и F — точные производные; в IEEE-754 продукты согласуются
    // с литералами до ~1ulp, поэтому сравнение с ослаблением 1e-13.
    expect(Math.abs(SI_CONSTANTS.R_gas - SI_CONSTANTS.N_A * SI_CONSTANTS.k_B)).toBeLessThan(1e-13 * SI_CONSTANTS.R_gas);
    expect(Math.abs(SI_CONSTANTS.F_const - SI_CONSTANTS.N_A * SI_CONSTANTS.q_e)).toBeLessThan(1e-13 * SI_CONSTANTS.F_const);
  });

  it('every constant is exposed to the engine scope via recalc path', () => {
    const { scope } = recalculateAll([]);
    const publicNames: Array<[string, number]> = [
      ['c_light', SI_CONSTANTS.c],
      ['h_planck', SI_CONSTANTS.h],
      ['hbar', SI_CONSTANTS.hbar],
      ['k_B', SI_CONSTANTS.k_B],
      ['q_e', SI_CONSTANTS.q_e],
      ['N_A', SI_CONSTANTS.N_A],
      ['R_gas', SI_CONSTANTS.R_gas],
      ['sigma_sb', SI_CONSTANTS.sigma_sb],
      ['g_std', SI_CONSTANTS.g_std],
      ['atm_pa', SI_CONSTANTS.atm_pa],
      ['au_m', SI_CONSTANTS.au_m],
      ['ly_m', SI_CONSTANTS.ly_m],
      ['F_const', SI_CONSTANTS.F_const],
      ...(Object.entries(CODATA2022) as Array<[string, number]>),
    ];
    for (const [name, expected] of publicNames) {
      expect(scope[name], `scope lacks ${name}`).not.toBeUndefined();
      expect(scope[name], `${name} wrong value`).toBeCloseTo(expected, 12);
    }
    expect(scope.eta0).toBeCloseTo(CODATA2022.Z_0, 12);
  });
});