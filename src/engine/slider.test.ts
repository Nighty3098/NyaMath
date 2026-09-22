import { describe, expect, it } from 'vitest';
import { recalculateAll, type MathBlockData } from './dependencies';

let id = 0;
function block(
  kind: MathBlockData['kind'],
  y: number,
  patch: Partial<MathBlockData> = {},
): MathBlockData {
  return {
    id: `s${id++}`,
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

function recalc(list: MathBlockData[]): MathBlockData[] {
  const r = recalculateAll(list);
  return list.map((b) => r.blocks[b.id]);
}

const slider = (y: number, patch: Partial<MathBlockData> = {}) =>
  block('slider', y, {
    rawInput: 'slider',
    sliderVar: 'k',
    sliderMin: 0,
    sliderMax: 10,
    sliderStep: 0.5,
    sliderVal: 3,
    ...patch,
  });

describe('slider blocks', () => {
  it('feeds formulas below', () => {
    const [s, m] = recalc([slider(60), block('math', 124, { rawInput: 'y := 2*k =' })]);
    expect(s.error).toBeNull();
    expect(s.resultStr).toBe('3');
    expect(m.error).toBeNull();
    expect(m.resultStr).toBe('6');
  });

  it('errors on use-before-definition (top-to-bottom order)', () => {
    const [m] = recalc([block('math', 60, { rawInput: 'y := 2*k =' }), slider(124)]);
    expect(m.error).not.toBeNull();
  });

  it('rejects reserved names and empty ranges', () => {
    const [a, b] = recalc([
      slider(60, { sliderVar: 'i' }),
      slider(124, { sliderVar: 'q', sliderMin: 5, sliderMax: 5 }),
    ]);
    expect(a.error).not.toBeNull();
    expect(b.error).not.toBeNull();
  });

  it('clamps the value into range', () => {
    const [s] = recalc([slider(60, { sliderVal: 99 })]);
    expect(s.error).toBeNull();
    expect(s.resultStr).toBe('10');
  });

  it('defines the variable for scope checks', () => {
    const r = recalculateAll([slider(60, { sliderVar: 'eps_r', sliderVal: 3.3 })]);
    expect(r.scope['eps_r']).toBe(3.3);
  });
});
