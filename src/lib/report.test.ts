import { describe, expect, it } from 'vitest';
import { blocksToLatex, blocksToMarkdown } from './report';
import type { MathBlockData } from '../engine/dependencies';

let id = 0;
function block(
  kind: MathBlockData['kind'],
  y: number,
  patch: Partial<MathBlockData> = {},
): MathBlockData {
  return {
    id: `r${id++}`,
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
    kind,
    plotPreview: null,
    ...patch,
  };
}

function liveDoc(): Record<string, MathBlockData> {
  // уже посчитанные блоки (как после recalculateAll)
  const t = block('text', 60, { rawInput: '// Проверка' });
  const m = block('math', 124, {
    rawInput: 'y := 2*3 =',
    displayLatex: 'y := 2\\cdot 3 =',
    resultStr: '6',
    resultLatex: '6',
    resultValue: 6,
    isOutput: true,
    definedVar: 'y',
  });
  const s = block('slider', 188, {
    rawInput: 'slider',
    sliderVar: 'k',
    sliderMin: 0,
    sliderMax: 10,
    sliderStep: 1,
    sliderVal: 3,
    resultStr: '3',
    resultLatex: '3',
    resultValue: 3,
    isOutput: true,
    definedVar: 'k',
  });
  return { [t.id]: t, [m.id]: m, [s.id]: s };
}

describe('report export', () => {
  it('markdown has sections, formulas and slider values', () => {
    const md = blocksToMarkdown(liveDoc());
    expect(md).toContain('## Проверка');
    expect(md).toContain('$$y :=');
    expect(md).toContain('$$k = 3$$');
  });

  it('respects visibility: hide skipped, input/result partial', () => {
    const doc = liveDoc();
    const ids = Object.keys(doc);
    const hidden = doc[ids[1]];
    const mdHide = blocksToMarkdown({ ...doc, [hidden.id]: { ...hidden, visibility: 'hide' } });
    expect(mdHide).not.toContain('$$y :=');
    expect(mdHide).toContain('## Проверка');

    const mdInput = blocksToMarkdown({
      ...doc,
      [hidden.id]: { ...hidden, visibility: 'input' },
    });
    expect(mdInput).toContain('$$y :=');
    expect(mdInput).not.toContain('Result: `6`');

    const mdResult = blocksToMarkdown({
      ...doc,
      [hidden.id]: { ...hidden, visibility: 'result' },
    });
    expect(mdResult).not.toContain('$$y :=');
    expect(mdResult).toContain('$$6$$');
  });

  it('plot caption uses title and units, sim lists solver', () => {
    const p = block('plot', 10, { plotFn: 'sin(x)', plotTitle: 'Sine', plotYUnit: 'V' });
    const s = block('sim', 20, { simStates: 'x, v', simSolver: 'rk4', simT0: 0, simT1: 10 });
    const md = blocksToMarkdown({ [p.id]: p, [s.id]: s });
    expect(md).toContain('Sine');
    expect(md).toContain('rk4');
  });

  it('latex is a standalone document', () => {
    const tex = blocksToLatex(liveDoc());
    expect(tex).toContain('\\documentclass');
    expect(tex).toContain('\\section*{Проверка}');
    expect(tex).toContain('\\[');
    expect(tex.trimEnd().endsWith('\\end{document}')).toBe(true);
  });

  it('skips errored blocks without crashing', () => {
    const b = block('math', 60, { rawInput: 'y := z +', error: 'boom' });
    const md = blocksToMarkdown({ [b.id]: b });
    expect(md).toContain('⚠');
  });
});
