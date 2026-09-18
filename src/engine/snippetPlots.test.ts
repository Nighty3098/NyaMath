import { describe, expect, it } from 'vitest';
import { recalculateAll, type MathBlockData } from './dependencies';
import { samplePlotBlock } from './plotSample';
import { samplePlot3d } from './plot3dSample';
import { SNIPPETS } from './packs';

function mathBlock(id: string, rawInput: string, y: number): MathBlockData {
  return {
    id, x: 0, y, rawInput, displayLatex: '', resultStr: '',
    resultLatex: '', resultValue: null, error: null,
    dependencies: [], definedVar: null, isOutput: true, kind: 'math',
  };
}

/** Пересчитать строки как лесенку блоков (порядок сверху-вниз, как вставка из палитры). */
function recalcLines(lines: string[]) {
  const blocks = lines.map((rawInput, k) => mathBlock(`t${k}`, rawInput, k * 64));
  return recalculateAll(blocks);
}

function finiteCount(s: { series: { ys: unknown[]; indexMode?: boolean }[] }): { total: number; indexed: boolean } {
  let n = 0;
  let allIndexed = s.series.length > 0;
  for (const ser of s.series) {
    if (!ser.indexMode) allIndexed = false;
    for (const y of ser.ys) if (typeof y === 'number' && isFinite(y)) n++;
  }
  return { total: n, indexed: allIndexed };
}

const plots = SNIPPETS.filter((s) => s.kind === 'plot');
const contours = SNIPPETS.filter((s) => s.kind === 'contour');
const withPlot2d = SNIPPETS.filter((s) => s.kind === 'math' && s.plot2d);

describe('palette plot snippets carry their variables', () => {
  it('plot snippets define variables without errors', () => {
    expect(plots.length).toBeGreaterThan(0);
    for (const s of plots) {
      const lines = (s.vars ?? '').split('\n').map((l) => l.trim()).filter(Boolean);
      expect(lines.length, `${s.label.en}: no vars`).toBeGreaterThan(0);
      const res = recalcLines(lines);
      for (const b of Object.values(res.blocks)) {
        expect(b.error, `${s.label.en} [${b.rawInput}]`).toBeNull();
      }
    }
  });

  it('plot code samples against its own variables', () => {
    for (const s of plots) {
      const lines = (s.vars ?? '').split('\n').map((l) => l.trim()).filter(Boolean);
      const res = recalcLines(lines);
      const sample = samplePlotBlock(s.code, res.scope, -10, 10, 60);
      expect(sample, `${s.label.en}: no sample`).not.toBeNull();
      // функции — плотная кривая, векторы (index-режим) — хотя бы одна точка
      const { total, indexed } = finiteCount(sample!);
      expect(total, `${s.label.en}: no finite points`).toBeGreaterThanOrEqual(indexed ? 1 : 5);
    }
  });

  it('contour snippet samples as a surface', () => {
    expect(contours.length).toBeGreaterThan(0);
    for (const s of contours) {
      const lines = (s.vars ?? '').split('\n').map((l) => l.trim()).filter(Boolean);
      const res = recalcLines(lines);
      const sample = samplePlot3d(s.code, res.scope, {
        xmin: -5, xmax: 5, ymin: -5, ymax: 5, res: 16, mode: 'surface',
      });
      expect(sample, `${s.label.en}: no sample`).not.toBeNull();
      const zs = (sample as { zs: unknown[][] }).zs.flat(Infinity);
      expect(zs.some((z) => typeof z === 'number' && isFinite(z)), `${s.label.en}: no finite z`).toBe(true);
    }
  });
});

describe('math snippets with 2D buttons sample against their code', () => {
  it('every plot2d samples finite points in its snippet scope', () => {
    expect(withPlot2d.length).toBeGreaterThan(0);
    for (const s of withPlot2d) {
      const lines = s.code.split('\n');
      const res = recalcLines(lines);
      const sample = samplePlotBlock(s.plot2d as string, res.scope, -10, 10, 60);
      expect(sample, `${s.label.en}: no sample`).not.toBeNull();
      const { total, indexed } = finiteCount(sample!);
      expect(total, `${s.label.en}: no finite points`).toBeGreaterThanOrEqual(indexed ? 1 : 5);
    }
  });
});
