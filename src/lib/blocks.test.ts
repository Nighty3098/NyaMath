import { describe, expect, it } from 'vitest';
import { blankBlock, normalizeBlock, slimBlock, slimBlocks } from './blocks';
import type { MathBlockData } from '../engine/dependencies';

function full(): MathBlockData {
  return {
    ...blankBlock('id1', 10, 20, 'sim'),
    rawInput: 'sim',
    simMode: 'fdtd',
    simSolver: 'rk45',
    simFdtdSrc: 'sine',
    plotProj: 'polar',
    plotTrace: 'stem',
    plotMode: 'surface',
    plotResolution: 40,
    plotWireframe: true,
    plotLogx: true,
    plotGrid: false,
    sliderVar: 'a',
    sliderMin: 0,
    sliderMax: 1,
    sliderStep: 0.1,
    sliderVal: 0.5,
    w: 300,
    h: 200,
    plotPreview: { label: 'x', expr: 'x', xs: [0], ys: [0], xmin: 0, xmax: 1, ymin: 0, ymax: 1 },
    simResult: { ok: true } as never,
  };
}

describe('blankBlock', () => {
  it('канонический пустой блок', () => {
    expect(blankBlock('a', 1, 2)).toMatchObject({ id: 'a', x: 1, y: 2, kind: 'math' });
    expect(blankBlock('b', 1, 2, 'plot').kind).toBe('plot');
  });
});

describe('normalizeBlock', () => {
  it('отбрасывает мусор, чинит id/kind', () => {
    expect(normalizeBlock(null)).toBeNull();
    expect(normalizeBlock({ x: 1, y: 2 })).toBeNull();
    const b = normalizeBlock({ x: 1, y: 2, rawInput: 'x', kind: 'nope' });
    expect(b?.kind).toBe('math');
    expect(typeof b?.id).toBe('string');
  });

  it('сохраняет полный набор sim/slider/plot-полей (регрессия MCP-дрейфа)', () => {
    const b = normalizeBlock(JSON.parse(JSON.stringify(full())));
    expect(b?.simMode).toBe('fdtd');
    expect(b?.simSolver).toBe('rk45');
    expect(b?.simFdtdSrc).toBe('sine');
    expect(b?.plotProj).toBe('polar');
    expect(b?.plotTrace).toBe('stem');
    expect(b?.plotMode).toBe('surface');
    expect(b?.sliderVar).toBe('a');
    expect(b?.w).toBe(300);
    // пересчитываемое всегда сброшено
    expect(b?.plotPreview).toBeNull();
    expect(b?.simResult).toBeNull();
    // disabled строго boolean (иначе эхо в live sync)
    expect(b?.disabled).toBe(false);
  });
});

describe('slimBlock', () => {
  it('убирает plotPreview/simResult, остальное оставляет', () => {
    const b = full();
    const s = slimBlock(b);
    expect(s.plotPreview).toBeUndefined();
    expect(s.simResult).toBeUndefined();
    expect(s.simMode).toBe('fdtd');
    expect(slimBlocks([b])).toHaveLength(1);
  });
});
