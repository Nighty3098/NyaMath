/**
 * Show Code для 2D-графика (MATLAB-паттерн «покрутил мышью → получил код»):
 * текущие настройки plot-блока — копируемым текстом + дублирование блока.
 * Чистые функции поверх MathBlockData — тестируются без DOM.
 */
import type { MathBlockData } from '../engine/dependencies';

/** Настройки plot-блока текстом: вставить в новый plot-блок — получишь тот же график. */
export function plotBlockToCode(b: MathBlockData, lang: 'ru' | 'en' = 'ru'): string {
  const L = lang === 'ru';
  const fn = (b.plotFn ?? 'sin(x)').trim() || 'sin(x)';
  const xmin = b.plotXmin ?? -10;
  const xmax = b.plotXmax ?? 10;
  const lines = [
    L
      ? '// NyaMath plot: вставь выражение в новый plot-блок, выставь диапазон'
      : '// NyaMath plot: paste into a new plot block, set the range',
    `expression: ${fn}`,
    `x: [${xmin}, ${xmax}]`,
    ...(traceOf(b) === 'field'
      ? [`y: [${b.plotYmin ?? -5}, ${b.plotYmax ?? 5}]`]
      : []),
    `projection: ${b.plotProj === 'polar' ? 'polar' : 'xy'} | trace: ${traceOf(b)} | logx: ${b.plotLogx === true ? 'on' : 'off'}`,
    `grid: ${(b.plotGrid ?? true) ? 'on' : 'off'} | legend: ${(b.plotLegend ?? true) ? 'on' : 'off'}`,
  ];
  const title = (b.plotTitle ?? '').trim();
  if (title) lines.push(`title: ${title}`);
  const xl = axisLabel(b.plotXLabel, b.plotXUnit);
  const yl = axisLabel(b.plotYLabel, b.plotYUnit);
  if (xl) lines.push(`xlabel: ${xl}`);
  if (yl) lines.push(`ylabel: ${yl}`);
  const err = (b.plotErr ?? '').trim();
  if (err) lines.push(`${L ? 'погрешности' : 'error bars'}: ${err}`);
  const y2 = (b.plotY2Fn ?? '').trim();
  if (y2) {
    const y2l = (b.plotY2Label ?? '').trim();
    lines.push(`y2: ${y2}${y2l ? ` (${y2l})` : ''}`);
  }
  if (b.plotPaper === true) lines.push(L ? 'стиль: для статьи (paper)' : 'style: paper');
  return lines.join('\n') + '\n';
}

function traceOf(b: MathBlockData): string {
  return b.plotTrace === 'bar' ||
    b.plotTrace === 'stem' ||
    b.plotTrace === 'arrow' ||
    b.plotTrace === 'field'
    ? b.plotTrace
    : 'line';
}

function axisLabel(label: string | undefined, unit: string | undefined): string {
  const l = (label ?? '').trim();
  const u = (unit ?? '').trim();
  if (l && u) return `${l} [${u}]`;
  return l || u;
}

/** Поля plot-блока для дублирования (всё кроме id/позиции/результатов). */
export function plotBlockPatch(b: MathBlockData): Partial<MathBlockData> {
  const patch: Partial<MathBlockData> = {
    rawInput: 'plot',
    kind: 'plot',
    plotFn: b.plotFn,
    plotXmin: b.plotXmin,
    plotXmax: b.plotXmax,
    plotYmin: b.plotYmin,
    plotYmax: b.plotYmax,
    plotProj: b.plotProj,
    plotTrace: b.plotTrace,
    plotErr: b.plotErr,
    plotLogx: b.plotLogx,
    plotXUnit: b.plotXUnit,
    plotYUnit: b.plotYUnit,
    plotTitle: b.plotTitle,
    plotXLabel: b.plotXLabel,
    plotYLabel: b.plotYLabel,
    plotGrid: b.plotGrid,
    plotLegend: b.plotLegend,
    plotY2Fn: b.plotY2Fn,
    plotY2Label: b.plotY2Label,
    plotPaper: b.plotPaper,
    w: b.w ?? null,
    h: b.h ?? null,
  };
  // undefined и null не тащим — addPlotBlock зальёт дефолты
  for (const k of Object.keys(patch) as (keyof typeof patch)[]) {
    if (patch[k] === undefined || patch[k] === null) delete patch[k];
  }
  return patch;
}
