import { describe, expect, it } from 'vitest';
import { formatCompact, formatNumberWith, normalizeNumFmt } from './format';

describe('normalizeNumFmt', () => {
  it('clamp и fallback', () => {
    expect(normalizeNumFmt(null)).toEqual({ mode: 'auto', digits: 6 });
    expect(normalizeNumFmt({ mode: 'sig', digits: 99 })).toEqual({ mode: 'sig', digits: 99 });
    expect(normalizeNumFmt({ mode: 'fixed', digits: 1000 })).toEqual({
      mode: 'fixed',
      digits: 1000,
    });
    expect(normalizeNumFmt({ mode: 'weird' as never, digits: 3 })).toEqual({
      mode: 'auto',
      digits: 3,
    });
  });
});

describe('formatNumberWith', () => {
  it('auto — legacy-поведение', () => {
    const auto = { mode: 'auto' as const, digits: 6 };
    expect(formatNumberWith(0, auto)).toBe('0');
    expect(formatNumberWith(0.1 + 0.2, auto)).toBe('0.3');
    expect(formatNumberWith(1e7, auto)).toContain('·10^');
  });

  it('sig и fixed', () => {
    expect(formatNumberWith(123.456, { mode: 'sig', digits: 4 })).toBe('123.5');
    expect(formatNumberWith(0.5, { mode: 'fixed', digits: 2 })).toBe('0.50');
    // -0 после округления → 0.00
    expect(formatNumberWith(-0.001, { mode: 'fixed', digits: 2 })).toBe('0.00');
  });

  it('не-числа проходят строкой', () => {
    const auto = { mode: 'auto' as const, digits: 6 };
    expect(formatNumberWith(Infinity, auto)).toBe('Infinity');
  });
});

describe('formatCompact', () => {
  it('совпадает со старым fmtTrace/fmtT, но с нотацией листа ·10^', () => {
    expect(formatCompact(0)).toBe('0');
    expect(formatCompact(123.456789)).toBe('123.457');
    expect(formatCompact(0.00001)).toBe('1.00·10^-5');
    expect(formatCompact(-9.94e-12)).toBe('-9.94·10^-12');
    expect(formatCompact(Infinity)).toBe('Infinity');
  });
});
