import { describe, expect, it } from 'vitest';
import { findUseBeforeDef, recalculateAll, type MathBlockData } from './dependencies';
import {
  applyColonShortcut,
  GRID_STEP_STANDARD,
  separateBlocks,
  type LayoutRect,
} from '../lib/canvasLayout';

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
  function rect(id: string, x: number, y: number, w = 300, h = 44): LayoutRect {
    return { id, x, y, w, h };
  }

  function placed(list: LayoutRect[], pos: Record<string, { x: number; y: number }>) {
    return list.map((r) => ({ ...r, ...pos[r.id] }));
  }

  /** Порядок решения: сверху вниз, при равном y — слева направо. */
  function readingOrder(
    list: LayoutRect[],
    pos: Record<string, { x: number; y: number }> = {},
  ): string[] {
    return [...list]
      .map((r) => ({ ...r, ...pos[r.id] }))
      .sort((a, b) => a.y - b.y || a.x - b.x)
      .map((r) => r.id);
  }

  function expectNoOverlap(list: LayoutRect[]): void {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i];
        const b = list[j];
        const overlapping =
          a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
        expect(overlapping, `${a.id} overlaps ${b.id}`).toBe(false);
      }
    }
  }

  function expectOnGrid(list: LayoutRect[], step = GRID_STEP_STANDARD): void {
    for (const r of list) {
      // Math.abs: у отрицательных координат остаток в JS равен -0, это не сдвиг.
      expect(Math.abs(r.x % step), `${r.id}.x`).toBe(0);
      expect(Math.abs(r.y % step), `${r.id}.y`).toBe(0);
    }
  }

  it('separates overlapping blocks with a gap and snaps them to the grid', () => {
    const a = rect('a', 80, 60, 300, 44);
    const b = rect('b', 80, 70, 300, 44);
    const c = rect('c', 80, 80, 300, 44);
    const list = [a, b, c];
    const pos = separateBlocks(list, { step: GRID_STEP_STANDARD });
    const out = placed(list, pos);
    expectNoOverlap(out);
    expectOnGrid(out);
    // верхний блок остаётся на месте (привязан к сетке)
    expect(pos.a).toEqual({ x: 88, y: 66 });
  });

  it('snaps already separated blocks without moving them across the sheet', () => {
    const a = rect('a', 88, 66, 100, 44);
    const b = rect('b', 250, 66, 100, 44);
    const list = [a, b];
    const pos = separateBlocks(list, { step: GRID_STEP_STANDARD });
    expect(pos.a).toEqual({ x: 88, y: 66 });
    expect(pos.b).toEqual({ x: 242, y: 66 });
    expectNoOverlap(placed(list, pos));
  });

  it('accounts for real block height, not just the y-step', () => {
    const a = rect('a', 0, 0, 460, 300);
    const b = rect('b', 0, 100, 460, 300);
    const list = [a, b];
    const pos = separateBlocks(list, { step: GRID_STEP_STANDARD });
    const out = placed(list, pos);
    expectNoOverlap(out);
    expect(pos.b.x).toBe(0);
    expect(pos.b.y).toBeGreaterThanOrEqual(322);
  });

  it('moves sideways when that is closer than moving below', () => {
    const a = rect('a', 0, 0, 100, 400);
    const b = rect('b', 0, 0, 100, 400);
    const list = [a, b];
    const pos = separateBlocks(list, { step: GRID_STEP_STANDARD });
    expectNoOverlap(placed(list, pos));
    expect(pos.b).toEqual({ x: 132, y: 0 });
  });

  it('stacks a dense pile downward without jumping above the first block', () => {
    const list = Array.from({ length: 6 }, (_, i) => rect(`p${i}`, 80, 60, 300, 44));
    const pos = separateBlocks(list, { step: GRID_STEP_STANDARD });
    const out = placed(list, pos);
    expectNoOverlap(out);
    expectOnGrid(out);
    // ни один блок не ушёл выше первого: порядок пересчёта top-to-bottom цел
    expect(Math.min(...out.map((r) => r.y))).toBe(pos.p0.y);
    const byY = [...out].sort((a, b) => a.y - b.y || a.x - b.x);
    expect(byY.map((r) => r.id)).toEqual(list.map((r) => r.id));
  });

  it('keeps input order for blocks with identical coordinates', () => {
    // При равных y/x порядок задаёт входной массив (Object.values),
    // как и в sortBlocksTopDown; сортировка по id его бы сломала.
    const a = rect('z', 0, 0, 100, 44);
    const b = rect('a', 0, 0, 100, 44);
    const list = [a, b];
    const pos = separateBlocks(list, { step: GRID_STEP_STANDARD });
    expectNoOverlap(placed(list, pos));
    expect(readingOrder(list, pos)).toEqual(['z', 'a']);
  });

  it('keeps solution order when a tall block forces a neighbor to move', () => {
    // b не может остаться под высоким a и ищет место; главное — итоговый
    // порядок a, b, c не должен превратиться в a, c, b.
    const a = rect('a', 80, 60, 300, 300);
    const b = rect('b', 80, 100, 300, 44);
    const c = rect('c', 500, 160, 300, 44);
    const list = [a, b, c];
    const pos = separateBlocks(list, { step: GRID_STEP_STANDARD });
    expectNoOverlap(placed(list, pos));
    expect(readingOrder(list, pos)).toEqual(['a', 'b', 'c']);
  });

  it('pushes the column below a tall plot instead of overtaking it', () => {
    // График чуть перекрывает широкую формулу. Уйти вниз дешевле, чем вбок;
    // следующие формулы сдвигаются за ним, сохраняя порядок f1, plot, f2, f3.
    const f1 = rect('f1', 80, 60, 640, 44);
    const plot = rect('plot', 600, 60, 460, 380);
    const f2 = rect('f2', 80, 124, 640, 44);
    const f3 = rect('f3', 80, 188, 640, 44);
    const list = [f1, plot, f2, f3];
    const pos = separateBlocks(list, { step: GRID_STEP_STANDARD });
    expectNoOverlap(placed(list, pos));
    expect(readingOrder(list, pos)).toEqual(['f1', 'plot', 'f2', 'f3']);
    expect(pos.plot.y).toBeGreaterThan(66);
    expect(pos.f2.y).toBeGreaterThan(pos.plot.y);
    expect(pos.f3.y).toBeGreaterThan(pos.f2.y);
  });

  it('keeps a single column from drifting left around a tall plot', () => {
    // Сценарий демо «матрицы»: колонка формул с автопревью и график справа.
    // Разнесение не должно уводить формулы в отрицательные x — они остаются
    // в своей колонке и просто сдвигаются вниз.
    const list = [
      rect('plot', 560, 140, 460, 380),
      rect('b', 80, 188, 318, 208),
      rect('xdef', 80, 252, 318, 191),
      rect('x', 80, 316, 318, 208),
      rect('det', 80, 380, 130, 40),
      rect('stats', 80, 444, 158, 32),
      rect('data', 80, 508, 318, 331),
      rect('mean', 80, 572, 270, 40),
      rect('std', 80, 636, 259, 40),
    ];
    const pos = separateBlocks(list, { step: GRID_STEP_STANDARD });
    const out = placed(list, pos);
    expectNoOverlap(out);
    expect(readingOrder(list, pos)).toEqual(list.map((r) => r.id));
    expect(Math.min(...out.map((r) => r.x))).toBeGreaterThanOrEqual(88);
  });

  it('keeps use-before-definition diagnostics after separation', () => {
    // x определяется ниже, чем используется: это ошибка решения.
    // Разнесение не должно ни «починить» её перестановкой, ни добавить новую.
    const top = block('math', 60, { rawInput: 'y := x + 2 =' });
    const bottom = block('math', 90, { rawInput: 'x := 5' });
    const list = [top, bottom];
    const rects: LayoutRect[] = list.map((b) => ({
      id: b.id,
      x: b.x,
      y: b.y,
      w: 640,
      h: 44,
    }));
    const before = findUseBeforeDef(list);
    const pos = separateBlocks(rects, { step: GRID_STEP_STANDARD });
    // блок действительно сдвинулся, иначе проверка ниже была бы пустой
    expect(pos[bottom.id].y).toBeGreaterThan(bottom.y);
    const moved = list.map((b) => ({ ...b, ...pos[b.id] }));
    expect(findUseBeforeDef(moved)).toEqual(before);
    expect(before.get(top.id)).toEqual(['x']);
    expect(readingOrder(rects, pos)).toEqual([top.id, bottom.id]);
  });

  it('leaves no overlaps in a dense random pile', () => {
    let seed = 42;
    const rnd = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };
    const list: LayoutRect[] = Array.from({ length: 30 }, (_, i) =>
      rect(
        `r${i}`,
        Math.round(rnd() * 600),
        Math.round(rnd() * 600),
        60 + Math.round(rnd() * 340),
        30 + Math.round(rnd() * 270),
      ),
    );
    const expected = readingOrder(list);
    const pos = separateBlocks(list, { step: GRID_STEP_STANDARD });
    const out = placed(list, pos);
    expectNoOverlap(out);
    expectOnGrid(out);
    expect(readingOrder(list, pos)).toEqual(expected);
  });

  it('applyColonShortcut inserts := once', () => {
    expect(applyColonShortcut('x', 1, 1)).toEqual({ value: 'x:=', cursor: 3 });
    expect(applyColonShortcut('x:=5', 1, 1)).toBeNull();
    expect(applyColonShortcut('x=5', 1, 1)).toBeNull();
    expect(applyColonShortcut('ab', 1, 1)).toEqual({ value: 'a:=b', cursor: 3 });
  });
});
