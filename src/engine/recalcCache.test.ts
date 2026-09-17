import { describe, expect, it } from 'vitest';
import { recalculateAll, type MathBlockData } from './dependencies';

function block(suffix: string, kind: MathBlockData['kind'], y: number, patch: Partial<MathBlockData> = {}): MathBlockData {
  return {
    id: `rc-${suffix}`, x: 80, y, rawInput: '', displayLatex: '', resultStr: '',
    resultLatex: '', resultValue: null, error: null, dependencies: [],
    definedVar: null, isOutput: false, kind, plotPreview: null, ...patch,
  };
}

const math = (suffix: string, y: number, raw: string, x = 80) =>
  block(suffix, 'math', y, { rawInput: raw, x });

describe('incremental recalculation', () => {
  it('second identical run changes nothing and reuses the record', () => {
    const list = [math('a1', 60, 'a := 5 ='), math('a2', 124, 'b := a + 1 =')];
    const r1 = recalculateAll(list.map((b) => ({ ...b })));
    expect(r1.changed).toBe(true);
    expect(r1.blocks['rc-a2'].resultStr).toBe('6');
    const r2 = recalculateAll(list.map((b) => ({ ...b })));
    expect(r2.changed).toBe(false);
    expect(r2.blocks).toBe(r1.blocks);
    expect(r2.scope['b']).toBe(6);
  });

  it('edit recomputes only the downstream chain', () => {
    const a = math('b1', 60, 'a := 5 =');
    const b = math('b2', 124, 'b := a + 1 =');
    const c = math('b3', 188, 'c := 100 =');
    const r1 = recalculateAll([a, b, c]);
    expect(r1.blocks['rc-b2'].resultStr).toBe('6');
    // правим только c — a и b должны остаться теми же ссылками
    const r2 = recalculateAll([
      { ...a },
      { ...b },
      { ...c, rawInput: 'c := 200 =' },
    ]);
    expect(r2.changed).toBe(true);
    expect(r2.blocks['rc-b1']).toBe(r1.blocks['rc-b1']);
    expect(r2.blocks['rc-b2']).toBe(r1.blocks['rc-b2']);
    expect(r2.blocks['rc-b3']).not.toBe(r1.blocks['rc-b3']);
    expect(r2.blocks['rc-b3'].resultStr).toBe('200');
    // правим a — b пересчитывается, c untouched
    const r3 = recalculateAll([
      { ...a, rawInput: 'a := 10 =' },
      { ...r2.blocks['rc-b2'] },
      { ...r2.blocks['rc-b3'] },
    ]);
    expect(r3.blocks['rc-b2'].resultStr).toBe('11');
    expect(r3.blocks['rc-b3']).toBe(r2.blocks['rc-b3']);
  });

  it('move without order change keeps results, updates geometry', () => {
    const r1 = recalculateAll([math('c1', 60, 'a := 5 ='), math('c2', 124, 'b := a + 1 =')]);
    const r2 = recalculateAll([
      { ...r1.blocks['rc-c1'], x: 200 },
      { ...r1.blocks['rc-c2'] },
    ]);
    expect(r2.changed).toBe(true); // геометрия поменялась
    expect(r2.blocks['rc-c1'].x).toBe(200);
    expect(r2.blocks['rc-c1'].resultStr).toBe('5');
    expect(r2.blocks['rc-c2']).toBe(r1.blocks['rc-c2']);
    // повтор без изменений — снова тихо
    const r3 = recalculateAll([{ ...r2.blocks['rc-c1'] }, { ...r2.blocks['rc-c2'] }]);
    expect(r3.changed).toBe(false);
  });

  it('caches heavy sim blocks across unrelated edits', () => {
    const sim = block('d1', 'sim', 60, {
      rawInput: 'sim',
      simStates: 'x, v', simDerivs: 'v; -x', simInit: '1, 0',
      simT0: 0, simT1: 5, simDt: 0.05, simSolver: 'rk4',
      simX: 't', simY: 'x',
    });
    const note = math('d2', 200, 'k := 1 =');
    const r1 = recalculateAll([sim, note]);
    expect(r1.blocks['rc-d1'].error).toBeNull();
    const first = r1.blocks['rc-d1'].resultStr;
    // правим текстовый блок ниже — sim обязан взяться из кэша той же ссылкой
    const r2 = recalculateAll([{ ...sim }, { ...note, rawInput: 'k := 2 =' }]);
    expect(r2.changed).toBe(true);
    expect(r2.blocks['rc-d1']).toBe(r1.blocks['rc-d1']);
    expect(r2.blocks['rc-d1'].resultStr).toBe(first);
  });

  it('slider drag recomputes downstream only', () => {
    const s = block('e1', 'slider', 60, {
      rawInput: 'slider', sliderVar: 'k', sliderMin: 0, sliderMax: 10, sliderStep: 1, sliderVal: 2,
    });
    const m = math('e2', 124, 'y := 2*k =');
    const r1 = recalculateAll([s, m]);
    expect(r1.blocks['rc-e2'].resultStr).toBe('4');
    const r2 = recalculateAll([{ ...s, sliderVal: 3 }, { ...m }]);
    expect(r2.blocks['rc-e2'].resultStr).toBe('6');
    expect(r2.blocks['rc-e1']).not.toBe(r1.blocks['rc-e1']);
  });
});
