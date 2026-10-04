/**
 * lib/blocks — единый источник правды о блоках документа.
 *
 * Раньше было 5 копий slim (убрать plotPreview/simResult перед
 * persist/live/share/sync) + разъехавшиеся validateBlock (MCP) и
 * migrate (стор): MCP-пуш молча ронял sim-поля и plotProj/plotTrace.
 * Здесь: blank / normalizeBlock / slimBlock / slimBlocks.
 * Зависит только от типа MathBlockData (type-only, без рантайм-цикла).
 */
import { v4 as uuid } from 'uuid';
import type { BlockVisibility, MathBlockData } from '../engine/dependencies';

export type BlockKind = MathBlockData['kind'];

export type { BlockVisibility };

const KINDS: ReadonlySet<string> = new Set([
  'math',
  'plot',
  'text',
  'program',
  'plot3d',
  'sim',
  'contour',
  'slider',
]);

/** Нормализованная видимость (битые значения → show, чтобы не терять блоки). */
export function visibilityOf(b: Pick<MathBlockData, 'visibility'>): BlockVisibility {
  const v = b.visibility;
  return v === 'hide' || v === 'input' || v === 'result' ? v : 'show';
}

/** true — блок попадает в отчёт/печать (всё кроме hide). */
export function isReportVisible(b: Pick<MathBlockData, 'visibility'>): boolean {
  return visibilityOf(b) !== 'hide';
}

/** Пустой блок (канонический blank: стор и MCP используют один и тот же). */
export function blankBlock(id: string, x: number, y: number, kind: BlockKind = 'math'): MathBlockData {
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
  };
}

function numOrUndef(v: unknown): number | undefined {
  return typeof v === 'number' && isFinite(v) ? v : undefined;
}

function numOrNull(v: unknown): number | null {
  return typeof v === 'number' && isFinite(v) ? v : null;
}

function strOrUndef(v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined;
}

function boolOrUndef(v: unknown): boolean | undefined {
  return typeof v === 'boolean' ? v : undefined;
}

/**
 * Привести сырой объект к MathBlockData.
 * Объединение старого migrate (стор, полный набор полей) и
 * validateBlock (MCP): полные sim/slider/plot-поля + w/h.
 * null — не блок (нет x/y/rawInput).
 */
export function normalizeBlock(raw: unknown): MathBlockData | null {
  if (!raw || typeof raw !== 'object') return null;
  const b = raw as Partial<MathBlockData>;
  if (typeof b.x !== 'number' || typeof b.y !== 'number' || typeof b.rawInput !== 'string')
    return null;
  const id = typeof b.id === 'string' && b.id ? b.id : uuid();
  const kind: BlockKind = typeof b.kind === 'string' && KINDS.has(b.kind) ? b.kind : 'math';
  const plotProj = b.plotProj === 'polar' || b.plotProj === 'xy' ? b.plotProj : undefined;
  const plotTrace =
    b.plotTrace === 'bar' || b.plotTrace === 'stem' || b.plotTrace === 'line'
      ? b.plotTrace
      : undefined;
  const simSolver =
    b.simSolver === 'euler' ||
    b.simSolver === 'rk4' ||
    b.simSolver === 'rk45' ||
    b.simSolver === 'trbdf2'
      ? b.simSolver
      : undefined;
  const visibility: BlockVisibility | undefined =
    b.visibility === 'hide' ||
    b.visibility === 'input' ||
    b.visibility === 'result' ||
    b.visibility === 'show'
      ? b.visibility
      : undefined;
  return {
    ...blankBlock(id, b.x, b.y),
    ...b,
    id,
    kind,
    resultLatex: b.resultLatex ?? '',
    isOutput: b.isOutput ?? false,
    // boolean без эха: slim без disabled vs slim с disabled:false
    // иначе давал вечный push-loop в live sync
    disabled: b.disabled === true,
    visibility,
    plotPreview: null,
    simResult: null,
    exportName: strOrUndef(b.exportName),
    plotYmin: numOrUndef(b.plotYmin),
    plotYmax: numOrUndef(b.plotYmax),
    plotMode:
      b.plotMode === 'surface' || b.plotMode === 'points' || b.plotMode === 'matrix'
        ? b.plotMode
        : b.plotMode === 'auto'
          ? 'auto'
          : undefined,
    plotResolution: numOrUndef(b.plotResolution),
    plotWireframe: boolOrUndef(b.plotWireframe),
    plotProj,
    plotTrace,
    plotErr: strOrUndef(b.plotErr),
    plotLogx: boolOrUndef(b.plotLogx),
    plotXUnit: strOrUndef(b.plotXUnit),
    plotYUnit: strOrUndef(b.plotYUnit),
    plotTitle: strOrUndef(b.plotTitle),
    plotXLabel: strOrUndef(b.plotXLabel),
    plotYLabel: strOrUndef(b.plotYLabel),
    plotGrid: boolOrUndef(b.plotGrid),
    plotLegend: boolOrUndef(b.plotLegend),
    plotY2Fn: strOrUndef(b.plotY2Fn),
    plotY2Label: strOrUndef(b.plotY2Label),
    plotPaper: boolOrUndef(b.plotPaper),
    simModel: strOrUndef(b.simModel),
    simMode: b.simMode === 'fdtd' ? 'fdtd' : undefined,
    simStates: strOrUndef(b.simStates),
    simDerivs: strOrUndef(b.simDerivs),
    simAux: strOrUndef(b.simAux),
    simParams: strOrUndef(b.simParams),
    simInit: strOrUndef(b.simInit),
    simT0: numOrUndef(b.simT0),
    simT1: numOrUndef(b.simT1),
    simDt: numOrUndef(b.simDt),
    simSolver,
    simEvents: strOrUndef(b.simEvents),
    simX: strOrUndef(b.simX),
    simY: strOrUndef(b.simY),
    simFdtdN: numOrUndef(b.simFdtdN),
    simFdtdL: numOrUndef(b.simFdtdL),
    simFdtdSteps: numOrUndef(b.simFdtdSteps),
    simFdtdSrc: b.simFdtdSrc === 'sine' ? 'sine' : b.simFdtdSrc === 'gauss' ? 'gauss' : undefined,
    simFdtdFreq: numOrUndef(b.simFdtdFreq),
    simFdtdAmp: numOrUndef(b.simFdtdAmp),
    simFdtdSrcX: numOrUndef(b.simFdtdSrcX),
    simFdtdDet: numOrUndef(b.simFdtdDet),
    simFdtdLayers: strOrUndef(b.simFdtdLayers),
    simExport: strOrUndef(b.simExport),
    simSpeed: numOrUndef(b.simSpeed),
    simLoop: boolOrUndef(b.simLoop),
    sliderVar: strOrUndef(b.sliderVar),
    sliderMin: numOrUndef(b.sliderMin),
    sliderMax: numOrUndef(b.sliderMax),
    sliderStep: numOrUndef(b.sliderStep),
    sliderVal: numOrUndef(b.sliderVal),
    w: numOrNull(b.w),
    h: numOrNull(b.h),
  };
}

/** Убрать пересчитываемые поля (plotPreview/simResult) — для файла и sync. */
export function slimBlock<T extends MathBlockData>(b: T): T {
  const { plotPreview: _pp, simResult: _sr, ...rest } = b as T & {
    plotPreview?: unknown;
    simResult?: unknown;
  };
  void _pp;
  void _sr;
  return rest as T;
}

/** Массив блоков → slim (для файла, snapshot, SSE). */
export function slimBlocks(arr: MathBlockData[]): MathBlockData[] {
  return arr.map(slimBlock);
}

/** Record<string, блок> → slim-массив (стор, liveSync). */
export function slimBlockRecord(rec: Record<string, MathBlockData>): MathBlockData[] {
  return Object.values(rec).map(slimBlock);
}
