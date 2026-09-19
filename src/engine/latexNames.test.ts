import { describe, expect, it } from 'vitest';
import { toLatex } from './mathEngine';

/** Имя в редакторе — буква с индексом в рендере . */
describe('latex names', () => {
  it('renders greek names with subscripts', () => {
    expect(toLatex('alpha_10 := 5')).toContain('\\alpha_{10}');
    expect(toLatex('omega := 2*pi')).toContain('\\omega');
    expect(toLatex('Beta_1 =')).toContain('\\Beta_{1}');
  });

  it('renders plain subscripts', () => {
    expect(toLatex('x_1 := 2')).toContain('x_{1}');
    expect(toLatex('a_pt := 3')).toContain('a_{pt}');
  });

  it('maps greek names inside the subscript too', () => {
    expect(toLatex('tg_delta := 1')).toContain('tg_{\\delta}');
    expect(toLatex('alpha_beta =')).toContain('\\alpha_{\\beta}');
  });

  it('escapes ^ inside text fallback (no textasciicircum error)', () => {
    const tex = toLatex('^^');
    expect(tex).toContain('\\^{}');
    expect(tex).not.toMatch(/\{[^}]*\^[^}]*\}/);
  });

  it('renders expression string args as real math (limit)', () => {
    const tex = toLatex('v := limit("ln((sin(x)/x)+((x^2)/6))", "x", 0) =');
    expect(tex).not.toContain('textasciicircum');
    expect(tex).toContain('{ x}^{2}');
  });
  it('renders numsum calls as Σ with limits', () => {
    expect(toLatex('numsum("2*k-1", "k", 1, 4) =')).toContain('\\sum_{k=1}^{4}');
    expect(toLatex('S_sig := numsum("2*k-1", "k", 1, 4)')).toContain('\\sum_{k=1}^{4}');
    expect(toLatex('numsum("1/k^2", "k", 1, 100) =')).toContain('\\sum_{k=1}^{100}');
    expect(toLatex('numsum("1/k^2", "k", 1, Infinity) =')).toContain('\\sum_{k=1}^{\\infty}');
  });

  it('renders numint as ∫ and limit as lim with transition', () => {
    expect(toLatex('numint("(ln(1 + x)/(1 + x^2))", "x", v, d) =')).toContain('\\int_{v}^{d}');
    expect(toLatex('v := limit("ln((sin(x)/x)+((x^2)/6))", "x", 0) =')).toContain('\\lim_{x \\to 0}');
  });
  it('supports the eps shorthand', () => {
    expect(toLatex('eps_r := 1')).toContain('\\epsilon_{r}');
    expect(toLatex('eps := 8.85*10^-12')).toContain('\\epsilon');
    expect(toLatex('eps := 8.85*10^-12')).not.toContain('eps_');
  });

  it('does not touch names that merely start with greek', () => {
    expect(toLatex('alphax := 1')).toContain('alphax');
    expect(toLatex('alphax := 1')).not.toContain('\\alpha');
  });

  it('renders greek names with digit suffix and no underscore', () => {
    expect(toLatex('lambda0 := 1')).toContain('\\lambda_{0}');
    expect(toLatex('alpha10 =')).toContain('\\alpha_{10}');
    expect(toLatex('Omega3 := 1')).toContain('\\Omega_{3}');
  });

  it('leaves non-greek digit names alone', () => {
    expect(toLatex('q1 := 2')).toContain('q1');
    expect(toLatex('v0 := 1')).not.toContain('_{');
    // \log_{10} рисует сам mathjs (основание логарифма) — это не наш суффикс
    expect(toLatex('log10(x) =')).toContain('\\log_{10}');
  });
});
