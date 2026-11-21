/**
 * Общий мост ImportBlock[] → настоящие блоки документа.
 * Используется и MCP (nya_import), и UI (drag&drop / открытие файла):
 * одинаковая адаптация синтаксиса, одинаковая раскладка по сетке.
 */
import { v4 as uuid } from 'uuid';
import type { MathBlockData } from '../engine/dependencies';
import { blankBlock } from './blocks';
import {
  GRID_STEP_STANDARD,
  separateBlocks,
  snapToGrid,
  type LayoutRect,
} from './canvasLayout';
import type { ImportBlock } from './importDoc';

export interface ImportBuildOptions {
  /** Левый край вставки (по умолчанию 80). */
  x0?: number;
  /** Верх вставки (по умолчанию 60). */
  y0?: number;
  /** Шаг для многострочного текста без координат. */
  dy?: number;
  /** Шаг сетки (по умолчанию стандартные 22). */
  step?: number;
}

/** Примерные габариты для раскладки без наложений (до рендера). */
const EST_SIZE: Record<ImportBlock['kind'], { w: number; h: number }> = {
  math: { w: 400, h: 72 },
  text: { w: 400, h: 44 },
  plot: { w: 460, h: 300 },
  contour: { w: 460, h: 300 },
  program: { w: 440, h: 180 },
};

/** Собрать блоки и разнести их по сетке без наложений. */
export function buildImportedBlocks(items: ImportBlock[], opts: ImportBuildOptions = {}): MathBlockData[] {
  if (!items.length) return [];
  const step = opts.step ?? GRID_STEP_STANDARD;
  const dy = opts.dy ?? 72;
  const x0 = opts.x0 ?? 80;
  const y0 = opts.y0 ?? 60;

  // Многострочный текст Mathcad/SMath → отдельные блоки по строкам.
  const expanded: ImportBlock[] = [];
  for (const ib of items) {
    if (ib.kind === 'text' && ib.body.includes('\n')) {
      ib.body.split('\n').forEach((line, i) => {
        expanded.push({ ...ib, body: line, y: ib.y + i * dy });
      });
    } else {
      expanded.push(ib);
    }
  }

  const minX = Math.min(...expanded.map((b) => (isFinite(b.x) ? b.x : 0)));
  const minY = Math.min(...expanded.map((b) => (isFinite(b.y) ? b.y : 0)));
  const prepared = expanded.map((ib) => {
    const rawX = x0 + ((isFinite(ib.x) ? ib.x : minX) - minX);
    const rawY = y0 + ((isFinite(ib.y) ? ib.y : minY) - minY);
    const p = snapToGrid(rawX, rawY, step);
    return { ib, id: uuid(), x: p.x, y: p.y };
  });

  const rects: LayoutRect[] = prepared.map((p) => ({
    id: p.id,
    x: p.x,
    y: p.y,
    ...EST_SIZE[p.ib.kind],
  }));
  const positions = separateBlocks(rects, { step, gap: step });

  return prepared.map((p) => {
    const pos = positions[p.id] ?? { x: p.x, y: p.y };
    const kind = p.ib.kind as MathBlockData['kind'];
    const base = blankBlock(p.id, pos.x, pos.y, kind);
    if (kind === 'plot' || kind === 'contour') {
      return {
        ...base,
        kind,
        rawInput: kind,
        plotFn: p.ib.body,
        plotXmin: p.ib.plotXmin ?? (kind === 'contour' ? -5 : -10),
        plotXmax: p.ib.plotXmax ?? (kind === 'contour' ? 5 : 10),
        plotYmin: p.ib.plotYmin ?? -5,
        plotYmax: p.ib.plotYmax ?? 5,
        plotResolution: kind === 'contour' ? 48 : base.plotResolution,
        w: EST_SIZE[kind].w,
      };
    }
    return {
      ...base,
      kind,
      rawInput: p.ib.body,
      ...(kind === 'program' && p.ib.exportName ? { exportName: p.ib.exportName } : {}),
      ...(kind === 'program' && p.ib.programParams?.length
        ? { programParams: p.ib.programParams }
        : {}),
    };
  });
}
