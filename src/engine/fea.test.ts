import { describe, expect, it } from 'vitest';
import { recalculateAll, type MathBlockData } from './dependencies';

let id = 0;
function block(y: number, patch: Partial<MathBlockData> = {}): MathBlockData {
  return {
    id: `fe${id++}`,
    x: 80,
    y,
    rawInput: '',
    displayLatex: '',
    resultStr: '',
    resultLatex: '',
    resultValue: null,
    error: null,
    dependencies: [],
    definedVar: null,
    isOutput: false,
    kind: 'math',
    plotPreview: null,
    ...patch,
  };
}

function mathBlock(y: number, raw: string): MathBlockData {
  return block(y, { rawInput: raw });
}

/** Лист построчно → карта id→блок после пересчёта (порядок = порядок массива). */
function sheet(lines: string[]): MathBlockData[] {
  const list = lines.map((raw, k) => mathBlock(60 + k * 64, raw));
  const r = recalculateAll(list);
  return list.map((b) => r.blocks[b.id]);
}

function numOf(b: MathBlockData | undefined): number {
  expect(b?.error).toBe(null);
  return parseNum(b?.resultStr ?? 'NaN');
}

/** Инженерная нотация движка `1.99920·10^7` → число. */
function parseNum(s: string): number {
  const t = s.replace(/·10\^(-?\d+)/g, (_m, e) => `e${e}`).replace(/−/g, '-');
  const v = Number(t);
  expect(Number.isNaN(v)).toBe(false);
  return v;
}

describe('phasor helpers: argDeg/fromPolar', () => {
  it('argDeg: фазы в градусах', () => {
    const [a, b, c] = sheet(['argDeg(3+4j) =', 'argDeg(1-1j) =', 'argDeg(-1) =']);
    expect(Math.abs(numOf(a) - 53.13010235)).toBeLessThan(1e-6);
    expect(Math.abs(numOf(b) + 45)).toBeLessThan(1e-9);
    expect(Math.abs(numOf(c) - 180)).toBeLessThan(1e-9);
  });

  it('fromPolar: сборка фазора', () => {
    const [z] = sheet(['Z := fromPolar(5, 53.13010235)', 'Re(Z) =', 'Im(Z) =']);
    void z;
    const out = sheet(['Z := fromPolar(5, 53.13010235)', 'Re(Z) =', 'Im(Z) =']);
    expect(Math.abs(numOf(out[1]) - 3)).toBeLessThan(1e-6);
    expect(Math.abs(numOf(out[2]) - 4)).toBeLessThan(1e-6);
  });
});

describe('fem: beamKe/beamFe/barKe', () => {
  it('beamKe: симметрия и 12EJ/L³', () => {
    const out = sheet([
      'Ke := beamKe(200*10^9, 8.33*10^-6, 1)',
      'Ke[1,1] =',
      'Ke[1,2] =',
      'Ke[2,1] =',
    ]);
    const k11 = 12 * 200e9 * 8.33e-6;
    expect(Math.abs(numOf(out[1]) - k11) / k11).toBeLessThan(1e-12);
    expect(Math.abs(numOf(out[2]) - numOf(out[3]))).toBeLessThan(1e-6);
  });

  it('beamFe: сумма = qL, моменты ±qL²/12', () => {
    const out = sheet(['Fe := beamFe(1000, 2)', 'Fe[1]+Fe[3] =', 'Fe[2] =', 'Fe[4] =']);
    expect(Math.abs(numOf(out[1]) - 2000)).toBeLessThan(1e-6);
    expect(Math.abs(numOf(out[2]) - (1000 * 4) / 12) / ((1000 * 4) / 12)).toBeLessThan(1e-9);
    expect(Math.abs(numOf(out[3]) + (1000 * 4) / 12) / ((1000 * 4) / 12)).toBeLessThan(1e-9);
  });

  it('консоль из 1 элемента: МКЭ = аналитике F·L³/3EJ', () => {
    const out = sheet([
      'E := 200*10^9',
      'J := 8.33*10^-6',
      'L := 2',
      'F := 1000',
      'Ke := beamKe(E, J, L)',
      'Kr := Ke[3:4, 3:4]',
      '// свободные DOF: w2 (сила −F вниз), th2 (момент 0)',
      'Fr := [-F; 0]',
      'Ur := lsolve(Kr, Fr)',
      'w_fem := Ur[1]',
      '// эталон со знаком: нагрузка вниз → прогиб отрицательный',
      'w_exact := -F*L^3/(3*E*J)',
      'w_fem =',
      'w_exact =',
      '(w_fem-w_exact)/w_exact =',
    ]);
    for (const b of out) expect(b.error).toBe(null);
    // индексы: 12 → `w_fem =`, 14 → относительная невязка
    const rel = Math.abs(numOf(out[14]));
    expect(rel).toBeLessThan(1e-9);
    // контроль самого числа: −1000·8/(3·200e9·8.33e-6) ≈ −1.6 мм
    expect(Math.abs(numOf(out[12]) + 0.0016006)).toBeLessThan(1e-5);
  });
});
