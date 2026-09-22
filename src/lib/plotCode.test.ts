import { describe, expect, it } from 'vitest';
import type { MathBlockData } from '../engine/dependencies';
import { plotBlockPatch, plotBlockToCode } from './plotCode';

let n = 0;
function plotBlock(patch: Partial<MathBlockData> = {}): MathBlockData {
  return {
    id: `pc${n++}`, x: 80, y: 60, rawInput: 'plot', displayLatex: '', resultStr: '',
    resultLatex: '', resultValue: null, error: null, dependencies: [],
    definedVar: null, isOutput: false, kind: 'plot', plotPreview: null,
    plotFn: 'sin(x); cos(x/2)', plotXmin: -10, plotXmax: 10, ...patch,
  };
}

/** Show Code: настройки графика текстом 1:1 + патч дублирования. */
describe('plotCode', () => {
  it('код содержит выражение, диапазон и опции', () => {
    const code = plotBlockToCode(plotBlock({
      plotTitle: 'Demo', plotXLabel: 't', plotXUnit: 's', plotErr: '0.1',
    }));
    expect(code).toContain('expression: sin(x); cos(x/2)');
    expect(code).toContain('x: [-10, 10]');
    expect(code).toContain('projection: xy | trace: line | logx: off');
    expect(code).toContain('grid: on | legend: on');
    expect(code).toContain('title: Demo');
    expect(code).toContain('xlabel: t [s]');
    expect(code).toContain('0.1');
  });

  it('polar/bar/logx отражаются в коде', () => {
    const code = plotBlockToCode(plotBlock({
      plotProj: 'polar', plotTrace: 'bar', plotLogx: true, plotGrid: false,
    }));
    expect(code).toContain('projection: polar | trace: bar | logx: on');
    expect(code).toContain('grid: off');
  });

  it('пустое выражение падает в sin(x)', () => {
    expect(plotBlockToCode(plotBlock({ plotFn: '   ' }))).toContain('expression: sin(x)');
  });

  it('en-вариант без русского', () => {
    const code = plotBlockToCode(plotBlock(), 'en');
    expect(code).toContain('// NyaMath plot: paste');
    expect(code).not.toContain('вставь');
  });

  it('plotBlockPatch: только заполненные поля', () => {
    const p = plotBlockPatch(plotBlock({ plotTitle: 'T', w: 500 }));
    expect(p.plotFn).toBe('sin(x); cos(x/2)');
    expect(p.plotTitle).toBe('T');
    expect(p.w).toBe(500);
    expect(p.plotErr).toBeUndefined();
    expect(p.plotYmin).toBeUndefined();
  });
});
