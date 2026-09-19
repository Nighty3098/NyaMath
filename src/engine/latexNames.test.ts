import { describe, expect, it } from 'vitest';
import { toLatex } from './mathEngine';

/** Имя в редакторе — буква с индексом в рендере (как в Mathcad). */
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

  it('does not touch names that merely start with greek', () => {
    expect(toLatex('alphax := 1')).toContain('alphax');
    expect(toLatex('alphax := 1')).not.toContain('\\alpha');
  });

  it('keeps names without underscore as-is', () => {
    expect(toLatex('q1 := 2')).toContain('q1');
  });
});
