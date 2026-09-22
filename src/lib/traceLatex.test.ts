import { describe, expect, it } from 'vitest';
import katex from 'katex';
import { recalculateAll, type MathBlockData } from '../engine/dependencies';
import { engToLatex, genericTraceLatex, traceLineToLatex } from './traceLatex';

let id = 0;
function block(y: number, patch: Partial<MathBlockData> = {}): MathBlockData {
  return {
    id: `tl${id++}`,
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

/** Строгий рендер: невалидный LaTeX бросит — ловим кривые шаблоны. */
function strictRender(latex: string): string {
  return katex.renderToString(latex, { throwOnError: true, displayMode: false });
}

describe('engToLatex', () => {
  it('нотация листа → \\cdot', () => {
    expect(engToLatex('-9.94·10^-12')).toBe('-9.94\\cdot 10^{-12}');
    expect(engToLatex('0.0666667')).toBe('0.0666667');
  });
});

describe('traceLineToLatex: подписи', () => {
  it('nint — настоящий интеграл с пределами и результатом', () => {
    const latex = traceLineToLatex(
      '∫ (ln(1+x)/(1+x^2)) dx [-9.94·10^-12, 0.0666667]: I=0.00216963',
      true,
    );
    expect(latex).toContain('\\int_');
    expect(latex).toContain('\\cdot 10^{-12}');
    expect(latex).toContain('= 0.00216963');
    expect(latex).not.toContain('"');
    strictRender(latex);
  });

  it('root — уравнение = 0 с интервалом', () => {
    const latex = traceLineToLatex('root (x^3-2) x ∈ [0, 2]: f=4.44·10^-16', true);
    expect(latex).toContain('= 0');
    expect(latex).toContain('\\in');
    strictRender(latex);
  });

  it('root от старта, minimize, bvp, solve', () => {
    strictRender(traceLineToLatex('root (cos(x)-x) x from 0.5: f=0', true));
    strictRender(traceLineToLatex('minimize ((x-2)^2) from [0]: 48 iters, f=0', true));
    strictRender(traceLineToLatex('bvp 0: secant 12 iters, s=1', true));
    strictRender(traceLineToLatex('solve [x, y] from [1, 0]: 5 iters, |F|=1.00·10^-11', true));
    strictRender(traceLineToLatex('solve [x] from [1] (minerr): fallback to guess', true));
  });

  it('no convergence — спокойный текст без падения', () => {
    strictRender(traceLineToLatex('root (x^2+1) x: no convergence', true));
    strictRender(traceLineToLatex('∫ (1/x) dx: no convergence', true));
  });
});

describe('traceLineToLatex: шаги', () => {
  it('итерации — mathtt-ключи', () => {
    const latex = traceLineToLatex('k=3 x=1.25992 f=0.00012', false);
    expect(latex).toContain('\\mathtt{k}');
    expect(latex).toContain('\\mathtt{x}');
    strictRender(latex);
  });

  it('симпсон, маркер обрезки, мусор', () => {
    strictRender(traceLineToLatex('[-9.94·10^-12, 0.0666667] S0=0.00216963', false));
    strictRender(traceLineToLatex('splits=1 f-evals=9 I=0.00216963', false));
    strictRender(traceLineToLatex('… 14 more', false));
    strictRender(genericTraceLatex(''));
  });
});

describe('traceLatex: сквозной прогон живых треков', () => {
  it('все строки реальных решателей — валидный LaTeX', () => {
    const out = recalculateAll([
      block(60, { rawInput: 'a := nint("sin(x)", "x", 0, 3.14159) =' }),
      block(124, { rawInput: 'b := root("x^3-2", "x", 0, 2) =' }),
      block(188, { rawInput: 'c := minimize("(x-2)^2", ["x"], [0]) =' }),
      block(252, { rawInput: 'r := nlsolve(["x^2+y^2-4", "x-y-1"], ["x", "y"], [1, 0]) =' }),
    ]);
    for (const b of Object.values(out.blocks)) {
      const tr = b.solverTrace ?? [];
      expect(tr.length).toBeGreaterThan(0);
      tr.forEach((line, k) => {
        strictRender(traceLineToLatex(line, k === 0));
      });
    }
  });
});
