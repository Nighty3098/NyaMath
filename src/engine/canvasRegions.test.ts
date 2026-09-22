import { describe, expect, it } from 'vitest';
import { findUseBeforeDef, recalculateAll, type MathBlockData } from './dependencies';
import { applyColonShortcut, separateBlocksVertically } from '../lib/canvasLayout';

let id = 0;
function block(
  kind: MathBlockData['kind'],
  y: number,
  patch: Partial<MathBlockData> = {},
): MathBlockData {
  return {
    id: `c${id++}`,
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

function recalc(list: MathBlockData[]) {
  const r = recalculateAll(list);
  return { out: list.map((b) => r.blocks[b.id]), scope: r.scope };
}

describe('canvas regions: disable evaluation', () => {
  it('skips a disabled math block and hides its names below', () => {
    const a = block('math', 60, { rawInput: 'x := 5', disabled: true });
    const b = block('math', 124, { rawInput: 'y := x + 1 =' });
    const { out, scope } = recalc([a, b]);
    // замороженный регион: формула видна, результата и ошибки нет
    expect(out[0].error).toBeNull();
    expect(out[0].resultStr).toBe('');
    expect(out[0].definedVar).toBeNull();
    expect(scope['x']).toBeUndefined();
    // ниже — имя не видно; движок даёт автографик вместо
    // числа (lenient-режим), но числового результата нет
    expect(out[1].resultStr).toBe('');
    expect(scope['y']).toBeUndefined();
  });

  it('re-enabling restores the definition', () => {
    const a = block('math', 60, { rawInput: 'x := 5' });
    const b = block('math', 124, { rawInput: 'y := x + 1 =' });
    const { out, scope } = recalc([a, b]);
    expect(out[0].definedVar).toBe('x');
    expect(out[1].error).toBeNull();
    expect(out[1].resultStr).toBe('6');
    expect(scope['x']).toBe(5);
  });

  it('does not run disabled program blocks', () => {
    const p = block('program', 60, {
      rawInput: 's := 0\nfor i in 1..3\n  s := s + i\nend\ns',
      exportName: 's',
      disabled: true,
    });
    const { out, scope } = recalc([p]);
    expect(out[0].error).toBeNull();
    expect(out[0].resultStr).toBe('');
    expect(scope['s']).toBeUndefined();
  });
});

describe('canvas regions: use-before-definition', () => {
  it('flags names defined below the block', () => {
    const top = block('math', 60, { rawInput: 'y := x + 1 =' });
    const bottom = block('math', 200, { rawInput: 'x := 5' });
    const late = findUseBeforeDef([top, bottom]);
    expect(late.get(top.id)).toEqual(['x']);
    expect(late.has(bottom.id)).toBe(false);
  });

  it('is empty when definitions come first', () => {
    const top = block('math', 60, { rawInput: 'x := 5' });
    const bottom = block('math', 200, { rawInput: 'y := x + 1 =' });
    expect(findUseBeforeDef([top, bottom]).size).toBe(0);
  });

  it('ignores disabled blocks on both sides', () => {
    const top = block('math', 60, { rawInput: 'y := x + 1 =' });
    const bottom = block('math', 200, { rawInput: 'x := 5', disabled: true });
    // определение отключено — имени нет вовсе, а не «ниже»
    expect(findUseBeforeDef([top, bottom]).size).toBe(0);
  });
});

describe('canvas regions: layout and typing helpers', () => {
  it('separateBlocksVertically pushes overlaps down only', () => {
    const a = block('math', 60, { rawInput: 'x := 1' });
    const b = block('math', 70, { rawInput: 'y := 2' });
    const c = block('math', 400, { rawInput: 'z := 3' });
    const pos = separateBlocksVertically([a, b, c], 72);
    expect(pos[a.id].y).toBe(60);
    expect(pos[b.id].y).toBe(132);
    expect(pos[c.id].y).toBe(400);
  });

  it('applyColonShortcut inserts := once', () => {
    expect(applyColonShortcut('x', 1, 1)).toEqual({ value: 'x:=', cursor: 3 });
    expect(applyColonShortcut('x:=5', 1, 1)).toBeNull();
    expect(applyColonShortcut('x=5', 1, 1)).toBeNull();
    expect(applyColonShortcut('ab', 1, 1)).toEqual({ value: 'a:=b', cursor: 3 });
  });
});
