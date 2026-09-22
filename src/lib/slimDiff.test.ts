import { describe, expect, it } from 'vitest';
import { diffLine, slimText, unifiedDiff } from './slimDiff';
import type { MathBlockData } from '../engine/dependencies';

let id = 0;
function block(y: number, patch: Partial<MathBlockData> = {}): MathBlockData {
  return {
    id: `d${id++}`,
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

describe('slimDiff: canonical lines', () => {
  it('блок = одна строка JSONL', () => {
    const l = diffLine(block(60, { rawInput: 'x := 5' }));
    expect(l).toBe('{"kind":"math","x":80,"y":60,"body":"x := 5"}');
  });
  it('порядок сверху-вниз независимо от id', () => {
    const a = block(200, { rawInput: 'b' });
    const b = block(60, { rawInput: 'a' });
    expect(slimText([a, b]).map((l) => JSON.parse(l).body)).toEqual(['a', 'b']);
  });
  it('plot/slider/sim сворачиваются компактно', () => {
    expect(
      diffLine(block(60, { kind: 'plot', plotFn: 'sin(x)', plotXmin: -10, plotXmax: 10 })),
    ).toBe('{"kind":"plot","x":80,"y":60,"body":"sin(x) [-10, 10]"}');
    expect(
      diffLine(
        block(60, {
          kind: 'slider',
          sliderVar: 'k',
          sliderMin: 0,
          sliderMax: 10,
          sliderStep: 0.5,
          sliderVal: 5,
        }),
      ),
    ).toContain('"body":"k 0..10/0.5 =5"');
  });
});

describe('slimDiff: unifiedDiff', () => {
  it('пустой diff на одинаковых', () => {
    const d = unifiedDiff(['a', 'b'], ['a', 'b']);
    expect(d).toEqual({ text: '', additions: 0, deletions: 0, truncated: false });
  });
  it('замена/добавление с ханком и контекстом', () => {
    const base = ['l1', 'l2', 'l3', 'l4', 'l5'];
    const cur = ['l1', 'l2!', 'l3', 'l4', 'l5', 'l6'];
    const d = unifiedDiff(base, cur);
    expect(d.additions).toBe(2);
    expect(d.deletions).toBe(1);
    expect(d.text).toContain('-l2');
    expect(d.text).toContain('+l2!');
    expect(d.text).toContain('+l6');
    expect(d.text).toContain(' l1');
    expect(d.text).toMatch(/@@ -\d+,\d+ \+\d+,\d+ @@/);
  });
  it('фолбэк без LCS на больших', () => {
    const base = Array.from({ length: 3000 }, (_, i) => `b${i}`);
    const cur = [...base];
    cur[1500] = 'CHANGED';
    cur.push('tail');
    const d = unifiedDiff(base, cur);
    expect(d.deletions).toBe(1);
    expect(d.additions).toBe(2);
    expect(d.text).toContain('-b1500');
  });
});
