import { afterEach, describe, expect, it } from 'vitest';
import { recalculateAll, type MathBlockData } from './dependencies';
import { formatResult, math, setComplexFmt, valueToLatex } from './mathEngine';

let id = 0;
function block(y: number, rawInput: string): MathBlockData {
  return {
    id: `ph${id++}`, x: 80, y, rawInput, displayLatex: '', resultStr: '',
    resultLatex: '', resultValue: null, error: null, dependencies: [],
    definedVar: null, isOutput: false, kind: 'math', plotPreview: null,
  };
}

function calc(raw: string): { str: string; tex: string } {
  const r = recalculateAll([block(60, raw)]);
  const b = Object.values(r.blocks)[0];
  expect(b?.error).toBe(null);
  return { str: b?.resultStr ?? '', tex: b?.resultLatex ?? '' };
}

afterEach(() => {
  setComplexFmt('rect');
});

/**
 * Phasor-вид комплексных (Maple Flow-паттерн):
 * rect — legacy, polar — `|Z| ∠ φ°`, both — обе формы.
 */
describe('phasor: отображение комплексных', () => {
  it('rect: legacy без изменений', () => {
    expect(calc('3+4j =').str).toBe('3 + 4·j');
    expect(calc('4j =').str).toBe('4·j');
    expect(calc('5 =').str).toBe('5');
  });

  it('polar: модуль и фаза в градусах', () => {
    setComplexFmt('polar');
    expect(calc('3+4j =').str).toBe('5 ∠ 53.13010235°');
    // чисто мнимое — фаза 90°, чисто вещественное — без угла
    expect(calc('4j =').str).toBe('4 ∠ 90°');
    expect(calc('5 =').str).toBe('5');
    // отрицательная фаза
    expect(calc('1-1j =').str).toBe('1.414213562 ∠ −45°');
  });

  it('both: алгебра + фазор в скобках', () => {
    setComplexFmt('both');
    expect(calc('3+4j =').str).toBe('3 + 4·j (5 ∠ 53.13010235°)');
    expect(calc('5 =').str).toBe('5');
  });

  it('polar: LaTeX через \\angle', () => {
    setComplexFmt('polar');
    const tex = valueToLatex(math.complex(3, 4));
    expect(tex).toContain('\\angle');
    expect(tex).toContain('^{\\circ}');
  });

  it('formatResult напрямую уважает режим', () => {
    const z = math.complex(1, 1);
    setComplexFmt('rect');
    expect(formatResult(z)).toBe('1 + 1·j');
    setComplexFmt('polar');
    expect(formatResult(z)).toContain('∠');
    setComplexFmt('both');
    expect(formatResult(z)).toContain('1 + 1·j');
    expect(formatResult(z)).toContain('∠');
  });

  it('невалидный режим падает в rect', () => {
    setComplexFmt('oops' as 'polar');
    expect(calc('3+4j =').str).toBe('3 + 4·j');
  });
});
