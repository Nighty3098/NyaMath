import { describe, expect, it } from 'vitest';
import { createBaseScope, evaluateLine } from './mathEngine';

function ev(expr: string): unknown {
  const r = evaluateLine(expr, createBaseScope());
  if (r.error) throw new Error(`${expr} → ${r.error}`);
  return r.value;
}

const num = (expr: string): number => Number(ev(expr));
const close = (expr: string, want: number, tol: number) => {
  expect(Math.abs(num(expr) - want)).toBeLessThanOrEqual(tol);
};

const asArr2 = (v: unknown): unknown[][] => (v as { toArray: () => unknown[] }).toArray() as unknown[][];

describe('materials DB (справочник)', () => {
  it('matlist returns rows [id, en, ru, type]', () => {
    const rows = asArr2(ev('matlist()'));
    expect(rows.length).toBeGreaterThanOrEqual(20);
    expect(rows[0].length).toBe(4);
    const ids = rows.map((r) => r[0]);
    expect(ids).toContain('copper');
    expect(ids).toContain('fr4');
    expect(ids).toContain('silicon');
  });

  it('matProp: metal conductivity and aliases (id/formula/RU)', () => {
    close('matProp("copper", "sigma")', 5.96e7, 1e5);
    close('matProp("Cu", "sigma")', 5.96e7, 1e5);
    close('matProp("медь", "sigma")', 5.96e7, 1e5);
    close('matProp("COPPER", "SIGMA")', 5.96e7, 1e5); // регистронезависимо
  });

  it('matProp: dielectric, semiconductor, temperature-independent', () => {
    close('matProp("PTFE", "epsilon_r")', 2.1, 0.01);
    close('matProp("fr-4", "dk")', 4.4, 0.01);
    close('matProp("Si", "bandgap")', 1.12, 0.01);
    close('matProp("GaAs", "Eg")', 1.42, 0.01);
    close('matProp("Al", "melting")', 660.3, 0.05);
  });

  it('matProps returns [param, value] rows', () => {
    const rows = asArr2(ev('matProps("Cu")')) as Array<[string, number]>;
    expect(rows.length).toBeGreaterThanOrEqual(4);
    const sigma = rows.find((r) => r[0].toLowerCase().startsWith('conductivity'));
    expect(sigma).toBeDefined();
    expect(Math.abs((sigma as [string, number])[1] - 5.96e7)).toBeLessThanOrEqual(1e5);
  });

  it('matType returns category', () => {
    expect(ev('matType("Cu")')).toBe('metal');
    expect(ev('matType("Si")')).toBe('semiconductor');
    expect(ev('matType("PTFE")')).toBe('dielectric');
  });

  it('matHas true/false', () => {
    expect(ev('matHas("Li")')).toBe(false);
    expect(ev('matHas("медь")')).toBe(true);
    expect(ev('matHas("xyz")')).toBe(false);
  });

  it('errors: unknown material / property / not applicable', () => {
    expect(evaluateLine('matProp("nope", "sigma") =', createBaseScope()).error).not.toBeNull();
    expect(evaluateLine('matProp("Cu", "foo") =', createBaseScope()).error).not.toBeNull();
    // у меди нет eps_r
    expect(evaluateLine('matProp("Cu", "eps_r") =', createBaseScope()).error).not.toBeNull();
  });

  it('matProp usable in expressions', () => {
    // сопротивление провода: R = l/(σ·S)
    close('(100) / (matProp("Cu", "sigma") * 0.5e-6)', 100 / (5.96e7 * 0.5e-6), 1e-3);
  });
});