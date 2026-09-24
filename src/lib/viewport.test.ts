import { describe, expect, it } from 'vitest';
import { applyWheelFrame, estBlockHeight, rectHit, viewportRect, visibleIdsOf } from './viewport';
import type { MathBlockData } from '../engine/dependencies';

function block(
  id: string,
  x: number,
  y: number,
  kind: MathBlockData['kind'] = 'math',
  h?: number,
): MathBlockData {
  return {
    id,
    x,
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
    h: h ?? null,
  };
}

describe('viewport: rect', () => {
  it('нулевой вьюпорт без overscan', () => {
    expect(viewportRect({ x: 0, y: 0, k: 1 }, { w: 800, h: 600 }, 0)).toEqual({
      x0: 0,
      y0: 0,
      x1: 800,
      y1: 600,
    });
  });
  it('пан и зум', () => {
    const r = viewportRect({ x: -400, y: -200, k: 2 }, { w: 800, h: 600 }, 0);
    expect(r).toEqual({ x0: 200, y0: 100, x1: 600, y1: 400 });
  });
  it('overscan расширяет симметрично', () => {
    const r = viewportRect({ x: 0, y: 0, k: 1 }, { w: 800, h: 600 }, 0.5);
    expect(r).toEqual({ x0: -400, y0: -300, x1: 1200, y1: 900 });
  });
});

describe('viewport: visibility', () => {
  const rect = viewportRect({ x: 0, y: 0, k: 1 }, { w: 800, h: 600 }, 0);
  it('внутри/снаружи', () => {
    expect(rectHit(rect, 80, 60, 140, 640)).toBe(true);
    expect(rectHit(rect, 80, 700, 140, 640)).toBe(false);
    expect(rectHit(rect, 900, 60, 140, 640)).toBe(false);
  });
  it('высокий плот виден верхом, даже если top выше', () => {
    // top на 1000 выше вьюпорта, высота 2000 → низ в кадре
    expect(rectHit({ x0: 0, y0: 0, x1: 800, y1: 600 }, 80, -1000, 2000, 640)).toBe(true);
    expect(rectHit({ x0: 0, y0: 0, x1: 800, y1: 600 }, 80, -2100, 2000, 640)).toBe(false);
  });
  it('оценки высот по видам', () => {
    expect(estBlockHeight({ kind: 'math', h: null })).toBe(140);
    expect(estBlockHeight({ kind: 'program', h: null })).toBe(420);
    expect(estBlockHeight({ kind: 'plot', h: 700 })).toBe(700);
    expect(estBlockHeight({ kind: 'sim', h: null })).toBe(900);
  });
  it('visibleIdsOf держит порядок входа', () => {
    const bs = [block('c', 80, 500), block('a', 80, 60), block('far', 80, 5000)];
    expect(visibleIdsOf(bs, rect)).toEqual(['c', 'a']);
  });
});

describe('viewport: applyWheelFrame', () => {
  const v = { x: 80, y: 40, k: 1 };
  const origin = { left: 0, top: 0 };
  it('пан копит дельты пачки событий', () => {
    const n = applyWheelFrame(
      v,
      { dx: 5 + 7, dy: 3 + 4, zoomLog: 0, ax: 0, ay: 0, hasZoom: false },
      origin,
    );
    expect(n).toEqual({ x: 68, y: 33, k: 1 });
  });
  it('нулевые дельты возвращают тот же объект (скип setState)', () => {
    expect(
      applyWheelFrame(v, { dx: 0, dy: 0, zoomLog: 0, ax: 0, ay: 0, hasZoom: false }, origin),
    ).toBe(v);
  });
  it('зум к якорю держит точку под курсором', () => {
    const n = applyWheelFrame(
      v,
      { dx: 0, dy: 0, zoomLog: Math.log(1.5), ax: 400, ay: 300, hasZoom: true },
      origin,
    );
    expect(n.k).toBeCloseTo(1.5, 9);
    // мировая точка под якорем не съехала: (s - x) / k invariant
    expect((400 - n.x) / n.k).toBeCloseTo((400 - v.x) / v.k, 9);
    expect((300 - n.y) / n.k).toBeCloseTo((300 - v.y) / v.k, 9);
  });
  it('взрывной шаг клампится, масштаб — в пределах', () => {
    const n = applyWheelFrame(
      v,
      { dx: 0, dy: 0, zoomLog: 10, ax: 0, ay: 0, hasZoom: true },
      origin,
      0.25,
      3,
    );
    expect(n.k).toBeLessThanOrEqual(3);
    const m = applyWheelFrame(
      { x: 0, y: 0, k: 0.25 },
      { dx: 0, dy: 0, zoomLog: -10, ax: 0, ay: 0, hasZoom: true },
      origin,
      0.25,
      3,
    );
    expect(m.k).toBe(0.25);
  });
});
