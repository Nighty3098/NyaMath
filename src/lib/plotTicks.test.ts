import { describe, expect, it } from 'vitest';
import { formatTick, logTicks, niceTicks } from './plotTicks';

describe('formatTick', () => {
  it('дефолт = старое поведение Plot/Contour', () => {
    expect(formatTick(0)).toBe('0');
    expect(formatTick(2.5)).toBe('2.5');
    expect(formatTick(1500)).toBe((1500).toExponential(0));
    expect(formatTick(0.001)).toBe((0.001).toExponential(0));
  });

  it('опции Plot3d (exp 1 знак) и Sim (пороги 10000/0.001)', () => {
    expect(formatTick(1500, { expDigits: 1 })).toBe((1500).toExponential(1));
    expect(formatTick(5000, { hi: 10000, lo: 0.001 })).toBe('5000');
    expect(formatTick(5000)).toBe((5000).toExponential(0));
    expect(formatTick(NaN)).toBe('—');
  });
});

describe('niceTicks / logTicks', () => {
  it('красивые тики покрывают диапазон', () => {
    const ts = niceTicks(0, 100);
    expect(ts[0]).toBeLessThanOrEqual(0);
    expect(ts[ts.length - 1]).toBeGreaterThanOrEqual(100);
    expect(niceTicks(5, 5)).toEqual([5]);
  });

  it('логарифмические тики 1-2-5', () => {
    expect(logTicks(1, 100)).toContain(50);
    expect(logTicks(1, 100)).toContain(1);
  });
});
