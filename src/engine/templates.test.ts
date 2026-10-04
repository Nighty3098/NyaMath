import { describe, expect, it } from 'vitest';
import { recalculateAll, type MathBlockData } from './dependencies';
import { getTemplate, listTemplates } from '../lib/db';

let id = 0;
function toBlocks(tplId: string): MathBlockData[] {
  const tpl = getTemplate(tplId);
  if (!tpl) throw new Error(`no template ${tplId}`);
  return tpl.lines.map((ln, k) => ({
    id: `tpl${id++}`,
    x: 80,
    y: 60 + k * 64,
    rawInput: ln.raw,
    displayLatex: '',
    resultStr: '',
    resultLatex: '',
    resultValue: null,
    error: null,
    dependencies: [],
    definedVar: null,
    isOutput: false,
    kind: ln.kind,
    plotPreview: null,
    ...(ln.plotFn
      ? { plotFn: ln.plotFn, plotXmin: ln.plotXmin ?? -10, plotXmax: ln.plotXmax ?? 10 }
      : {}),
    ...(ln.plotLogx ? { plotLogx: true } : {}),
    ...(ln.exportName ? { exportName: ln.exportName } : {}),
  }));
}

function calcAll(tplId: string): Record<string, MathBlockData> {
  const r = recalculateAll(toBlocks(tplId));
  const errs = Object.values(r.blocks).filter((b) => b.error);
  expect(
    errs.map((b) => `${b.rawInput} ⟹ ${b.error}`),
    tplId,
  ).toEqual([]);
  return r.blocks;
}

const byRaw = (blocks: Record<string, MathBlockData>, raw: string): MathBlockData => {
  const hit = Object.values(blocks).find((b) => b.rawInput === raw);
  if (!hit) throw new Error(`no block ${raw}`);
  return hit;
};

/**
 * Библиотека шаблонов по ГОСТ: каждый шаблон из БД считается
 * движком без ошибок, контрольные значения — по ручному расчёту.
 */
describe('templates: library integrity', () => {
  it('26 шаблонов в 8 разделах с описаниями', () => {
    const all = listTemplates();
    expect(all.length).toBe(26);
    expect(new Set(all.map((t) => t.section))).toEqual(
      new Set([
        'beams',
        'circuits',
        'tolerances',
        'thermal',
        'vibration',
        'hydro',
        'fea',
        'signal',
      ]),
    );
    for (const t of all) {
      expect(t.title.ru.length).toBeGreaterThan(0);
      expect(t.title.en.length).toBeGreaterThan(0);
      expect(t.lines.length).toBeGreaterThanOrEqual(5);
    }
    expect(getTemplate('nope')).toBeNull();
  });

  it('tolerance-шаблоны ссылаются на ГОСТ 25346', () => {
    expect(getTemplate('tolerance-rss')?.standard).toContain('25346');
    expect(getTemplate('tolerance-chain')?.standard).toContain('25346');
  });

  it('балка на двух опорах: R=30 кН, M=45 кДж', () => {
    const b = calcAll('beam-simply-uniform');
    expect(byRaw(b, 'R_A = q*L/2').resultStr).toBe('30 kN');
    expect(byRaw(b, 'M_max = q*L^2/8').resultStr).toBe('45 kJ');
  });

  it('консоль: заделка 1000 Дж, прогиб ≈ 80 мм', () => {
    const b = calcAll('beam-cantilever-point');
    expect(byRaw(b, 'M_fix = F*L').resultStr).toBe('1000 J');
    expect(byRaw(b, 'delta = F*L^3/(3*E*J)').resultStr).toBe('8.0032 cm');
  });

  it('закон Ома: 3 А, 36 Вт', () => {
    const b = calcAll('circuit-ohm');
    expect(byRaw(b, 'I =').resultStr).toBe('3 A');
    expect(byRaw(b, 'P =').resultStr).toBe('36 W');
  });

  it('резисторы: 30 Ом последовательно, 6.667 параллельно', () => {
    const b = calcAll('circuit-series-parallel');
    expect(byRaw(b, 'R_s = R1+R2').resultStr).toBe('30 ohm');
    expect(byRaw(b, 'R_p = R1*R2/(R1+R2)').resultStr).toContain('6.666');
  });

  it('RSS: √(0.1²+0.2²+0.15²) ≈ 0.269 мм', () => {
    const b = calcAll('tolerance-rss');
    expect(byRaw(b, 't_rss = sqrt(t1^2+t2^2+t3^2)').resultStr).toContain('0.269');
  });

  it('размерная цепь: 40 / 40.3 / 39.7 мм', () => {
    const b = calcAll('tolerance-chain');
    expect(byRaw(b, 'A_nom = A1-A2').resultStr).toBe('40 mm');
    expect(byRaw(b, 'A_max = (A1+t1)-(A2-t2)').resultStr).toBe('40.3 mm');
    expect(byRaw(b, 'A_min = (A1-t1)-(A2+t2)').resultStr).toBe('39.7 mm');
  });

  it('консоль q: R=6 кН, M=9 кДж, δ≈12.66 мм', () => {
    const b = calcAll('beam-cantilever-uniform');
    expect(byRaw(b, 'R = q*L').resultStr).toBe('6 kN');
    expect(byRaw(b, 'M_fix = q*L^2/2').resultStr).toBe('9 kJ');
    expect(byRaw(b, 'delta = q*L^4/(8*E*J)').resultStr).toBe('1.26563 cm');
  });

  it('шарнирная P в середине: R=4 кН, M=8 кДж, δ≈6.67 мм', () => {
    const b = calcAll('beam-simply-central');
    expect(byRaw(b, 'R_A = P/2').resultStr).toBe('4 kN');
    expect(byRaw(b, 'M_max = P*L/4').resultStr).toBe('8 kJ');
    expect(byRaw(b, 'delta = P*L^3/(48*E*J)').resultStr).toBe('0.666667 cm');
  });

  it('делитель: 4 мА, 4 В, 16 мВт', () => {
    const b = calcAll('circuit-divider');
    expect(byRaw(b, 'I = U/(R1+R2)').resultStr).toBe('4 mA');
    expect(byRaw(b, 'U2 := U*R2/(R1+R2) =').resultStr).toBe('4 V');
    expect(byRaw(b, 'P2 = U2^2/R2').resultStr).toBe('16 mW');
  });

  it('RC-заряд: τ=0.1 с, U(5τ)≈4.966 В', () => {
    const b = calcAll('circuit-rc-transient');
    expect(byRaw(b, 'tau := R*C =').resultStr).toBe('0.1 s');
    expect(byRaw(b, 'U = U0*(1-exp(-t5/tau))').resultStr).toContain('4.966');
  });

  it('RLC: f0≈159.155 Гц, Q=10, полоса ≈15.9 Гц', () => {
    const b = calcAll('circuit-rlc-resonance');
    expect(byRaw(b, 'f0 := 1/(2*pi*sqrt(L*C)) =').resultStr).toContain('159.155');
    expect(byRaw(b, 'Q := w0*L/R =').resultStr).toBe('10');
    expect(byRaw(b, 'BW = f0/Q').resultStr).toContain('15.9155');
  });

  it('стенка Фурье: 40 кВт, Rт=0.002 К/Вт', () => {
    const b = calcAll('thermal-conduction');
    expect(byRaw(b, 'Q = lam*A*delta_T/d').resultStr).toBe('40 kW');
    expect(byRaw(b, 'R_t = K/W').resultStr).toBe('0.002 K / W');
  });

  it('осциллятор: f0≈3.183 Гц, T0≈0.314 с, статика 25 мм', () => {
    const b = calcAll('vib-sdof');
    expect(byRaw(b, 'f0 := sqrt(k/M)/(2*pi) =').resultStr).toContain('3.1831');
    expect(byRaw(b, 'T0 = 1/f0').resultStr).toContain('0.314159');
    expect(byRaw(b, 'x_st = F/k').resultStr).toBe('25 mm');
  });

  it('труба: Re=150000, Δp=22.5 кПа, мощность ≈265 Вт', () => {
    const b = calcAll('hydro-pipe');
    expect(byRaw(b, 'Re = rho*v*D/mu').resultStr).toBe('150000');
    expect(byRaw(b, 'dp := lam*(L/D)*rho*v^2/2 =').resultStr).toBe('22.5 kPa');
    expect(byRaw(b, 'Qv := v*pi*D^2/4 =').resultStr).toContain('0.011781');
    expect(byRaw(b, 'P = dp*Qv').resultStr).toContain('265.07');
  });

  it('МКЭ-консоль: невязка с −FL³/3EJ < 1e-9', () => {
    const b = calcAll('fea-cantilever-1el');
    const rel = byRaw(b, '(w_fem-w_exact)/w_exact =').resultStr;
    expect(Math.abs(Number(rel))).toBeLessThan(1e-9);
  });

  it('RC-ФНЧ: fc≈994.7 Гц, H(fc)≈−3.01 дБ', () => {
    const b = calcAll('signal-rc-lowpass');
    expect(byRaw(b, 'fc := 1/(2*pi*RC) =').resultStr).toContain('994.718');
    expect(
      byRaw(b, 'Hfc = bodeMagDb([1], [inUnits(RC, "s"), 1], inUnits(2*pi*fc, "Hz"))').resultStr,
    ).toContain('-3.01');
  });

  it('конвекция: Q=40 кВт, R=0.001 К/Вт', () => {
    const b = calcAll('thermal-convection');
    expect(byRaw(b, 'Q = h*A*delta_T').resultStr).toBe('40 kW');
    expect(byRaw(b, 'R = K/W').resultStr).toBe('0.001 K / W');
  });

  it('стенка: R1=R2=0.5, Q=100 Вт', () => {
    const b = calcAll('thermal-composite-wall');
    expect(byRaw(b, 'R1 := d1/lam1').resultStr).toContain('0.5');
    expect(byRaw(b, 'R2 := d2/lam2').resultStr).toContain('0.5');
    expect(byRaw(b, 'Q = A*delta_T/R').resultStr).toBe('100 W');
  });

  it('маятник 1 м: T≈2.006 с, f≈0.4985 Гц', () => {
    const b = calcAll('vib-pendulum');
    expect(byRaw(b, 'T := 2*pi*sqrt(l/g) =').resultStr).toContain('2.006');
    expect(byRaw(b, 'f = 1/T').resultStr).toContain('0.498');
  });

  it('демпфирование: ζ=0.2, ωd≈9.798 Гц', () => {
    const b = calcAll('vib-damped');
    expect(byRaw(b, 'zeta := c/(2*sqrt(k*M)) =').resultStr).toBe('0.2');
    expect(byRaw(b, 'wd := sqrt(k/M)*sqrt(1-zeta^2)').resultStr).toContain('9.797');
  });

  it('слив бака: v≈9.905 м/с, t≈171 с', () => {
    const b = calcAll('hydro-tank-drain');
    expect(byRaw(b, 'v := sqrt(2*g*h) =').resultStr).toContain('9.9045');
    expect(byRaw(b, 'Q := Cd*pi*D^2/4*v').resultStr).toContain('0.0116');
    expect(byRaw(b, 't = V/Q').resultStr).toContain('171.4');
  });

  it('насос: P=7.848 кВт', () => {
    const b = calcAll('hydro-pump');
    expect(byRaw(b, 'P = rho*g*Qv*H/eta').resultStr).toBe('7.848 kW');
  });

  it('тевенен: 8 В, 2.667 Ом, 0.75 А', () => {
    const b = calcAll('circuit-thevenin');
    expect(byRaw(b, 'Uth := U*R2/(R1+R2)').resultStr).toBe('8 V');
    expect(byRaw(b, 'Rth := R1*R2/(R1+R2)').resultStr).toContain('2.666');
    expect(byRaw(b, 'IL = Uth/(Rth+RL)').resultStr).toBe('0.75 A');
  });

  it('реактансы: XL≈31.416, XC≈31.831, Z≈10.009 Ом', () => {
    const b = calcAll('circuit-reactance');
    expect(byRaw(b, 'XL := w*L').resultStr).toContain('31.415');
    expect(byRaw(b, 'XC := 1/(w*C)').resultStr).toContain('31.831');
    expect(byRaw(b, 'Z = sqrt(R^2+(XL-XC)^2)').resultStr).toContain('10.008');
  });

  it('неинвертирующий ОУ: G=11, Uout=5.5 В', () => {
    const b = calcAll('signal-noninv-amp');
    expect(byRaw(b, 'G := 1+Rf/R1').resultStr).toBe('11');
    expect(byRaw(b, 'Uout = G*Uin').resultStr).toBe('5.5 V');
  });

  it('зазор: Smax=90 мкм, Smin=30 мкм', () => {
    const b = calcAll('tolerance-clearance');
    expect(byRaw(b, 'Smax = Dmax-dmin').resultStr).toBe('90 um');
    expect(byRaw(b, 'Smin = Dmin-dmax').resultStr).toBe('30 um');
  });
});
