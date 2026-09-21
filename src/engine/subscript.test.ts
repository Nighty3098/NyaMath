import { describe, expect, it } from 'vitest';
import { createBaseScope, evaluateLine, toLatex } from './mathEngine';

/**
 * Сабскрипты в 1 кейстрок (боль Prime: в Prime сабскрипт — 2 клика).
 * У нас `_` — обычный символ имени: V_0 считается и рисуется как V₀.
 */
describe('subscripts: underscore names end-to-end', () => {
  it('V_0 := 5 считается и используется', () => {
    const scope = createBaseScope();
    expect(evaluateLine('V_0 := 5', scope).error).toBe(null);
    const r = evaluateLine('V_0*2 =', scope);
    expect(r.error).toBe(null);
    expect(String(r.value)).toBe('10');
  });

  it('греческие с сабскриптом: eps_r', () => {
    const scope = createBaseScope();
    expect(evaluateLine('eps_r := 4', scope).error).toBe(null);
    expect(evaluateLine('eps_r + 1 =', scope).value).toBe(5);
  });

  it('LaTeX рисует _{…}', () => {
    expect(toLatex('V_0 := 5')).toContain('_{0}');
    expect(toLatex('R_A = q*L/2')).toContain('_{A}');
  });

  it('did-you-mean дружит с сабскриптами', () => {
    const scope = createBaseScope();
    evaluateLine('V_0 := 5', scope);
    const r = evaluateLine('V_1 + 1', scope);
    expect(r.error).toContain('V_0');
  });
});
