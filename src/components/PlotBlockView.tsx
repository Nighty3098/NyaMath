import { memo, useMemo, useRef } from 'react';
import { evaluateLine, createBaseScope, preprocessJ } from '../engine/mathEngine';
import { recalculateAll } from '../engine/dependencies';
import { useCanvasStore } from '../store/canvasStore';
import { plotPalettes } from '../theme';
import { t } from '../i18n';
import type { MathBlockData } from '../engine/dependencies';
import { useRegionDrag, useRegionResize } from './useRegionDrag';
import { IResize, IX } from './Icon';

const W = 460;
const H = 300;
const PAD_L = 52;
const PAD_R = 12;
const PAD_T = 10;
const PAD_B = 30;
const N_PTS = 240;
const MAX_BARS = 48;
/** Высота шапки (контролы + подписи) — вычитается из ручной высоты блока */
const HEAD = 200;

/** "Красивые" тики для оси */
function niceTicks(lo: number, hi: number, count = 5): number[] {
  if (!isFinite(lo) || !isFinite(hi) || lo === hi) return [lo];
  const span = hi - lo;
  const step0 = span / count;
  const mag = 10 ** Math.floor(Math.log10(step0));
  const norm = step0 / mag;
  const step = (norm >= 5 ? 5 : norm >= 2 ? 2 : 1) * mag;
  const ticks: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-12; v += step) {
    ticks.push(Number(v.toPrecision(10)));
  }
  return ticks;
}

const fmtTick = (v: number) => {
  if (v === 0) return '0';
  const a = Math.abs(v);
  if (a >= 1000 || a < 0.01) return v.toExponential(0).replace('e', 'e');
  return String(Number(v.toPrecision(4)));
};

interface Series {
  expr: string;
  color: string;
  d: string;
  dashed?: boolean;
  /** Прямоугольники столбцов (bar) в SVG-координатах */
  bars?: { x: number; y: number; w: number; h: number }[];
  /** Стебли (stem): отрезки от базы до точки + маркеры */
  stems?: { x1: number; y1: number; x2: number; y2: number }[];
  /** Усы погрешностей ±err */
  errs?: { x1: number; y1: number; x2: number; y2: number; cx: number; cy: number }[];
}

interface PolarGrid {
  cx: number;
  cy: number;
  R: number;
  maxR: number;
}

function PlotBlockView({ block, scale }: { block: MathBlockData; scale: number }) {
  const removeBlock = useCanvasStore((s) => s.removeBlock);
  const boxRef = useRef<HTMLDivElement>(null);
  const { onGripDown, onGripMove, onGripUp } = useRegionDrag(block.id, scale, false);
  const { onResizeDown, onResizeMove, onResizeUp } = useRegionResize(block.id, scale, boxRef, {
    height: true,
    minW: 320,
    maxW: 1200,
    minH: 300,
    maxH: 1400,
  });
  const updatePlot = useCanvasStore((s) => s.updatePlot);
  const select = useCanvasStore((s) => s.select);
  const toggleSelect = useCanvasStore((s) => s.toggleSelect);
  const selectedIds = useCanvasStore((s) => s.selectedIds);
  const blocks = useCanvasStore((s) => s.blocks);
  const theme = useCanvasStore((s) => s.theme);
  const pal = plotPalettes[theme];
  // подписка ради перерендера при смене языка
  useCanvasStore((s) => s.lang);

  const fnText = block.plotFn ?? 'sin(x)';
  const xmin = block.plotXmin ?? -10;
  const xmax = block.plotXmax ?? 10;
  const proj = block.plotProj === 'polar' ? 'polar' : 'xy';
  const trace = block.plotTrace === 'bar' || block.plotTrace === 'stem' ? block.plotTrace : 'line';
  const errText = (block.plotErr ?? '').trim();
  const title = (block.plotTitle ?? '').trim();
  const xLabel = (block.plotXLabel ?? '').trim();
  const yLabel = (block.plotYLabel ?? '').trim();
  const showGrid = block.plotGrid ?? true;
  const showLegend = block.plotLegend ?? true;
  const padT = title ? 26 : PAD_T;
  // Ручной размер: ширина/высота области графика (шапка +HEAD)
  const pw = block.w ?? W;
  const ph = Math.max(180, (block.h ?? H + HEAD) - HEAD);

  const { series, ymin, ymax, err, xticks, yticks, polar } = useMemo(() => {
    const fail = (e: string) => ({ series: [] as Series[], ymin: -1, ymax: 1, err: e, xticks: [] as number[], yticks: [] as number[], polar: null as PolarGrid | null });
    try {
      const exprs = fnText
        .split(/[;\n]/)
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 5);
      if (!exprs.length) return fail(t('p2.empty'));
      if (!(xmin < xmax)) return fail(t('p2.needRange'));

      const mathBlocks = Object.values(blocks).filter((b) => b.kind === 'math');
      const { scope } = recalculateAll(mathBlocks);
      const base = { ...createBaseScope(), ...scope };

      const evalAt = (expr: string, x: number): unknown => {
        const withX = `(${preprocessJ(expr, false)})`.replace(/\bx\b/g, `(${x})`);
        return evaluateLine(withX, base).value;
      };
      const numOf = (v: unknown): number | null => {
        if (typeof v === 'number' && isFinite(v)) return v;
        if (v !== null && typeof v === 'object' && 're' in (v as object)) {
          const re = Number((v as { re: number }).re);
          return isFinite(re) ? re : null;
        }
        return null;
      };

      const allY: number[] = [];
      const raw: { expr: string; xs: number[]; ys: number[]; es: (number | null)[] }[] = [];
      exprs.forEach((expr) => {
        const hasX = /\bx\b/.test(preprocessJ(expr, false));
        const xs: number[] = [];
        const ys: number[] = [];
        if (!hasX) {
          // вектор из документа → по индексу; скаляр → горизонтальная линия
          let v: unknown = null;
          try {
            v = evaluateLine(`(${preprocessJ(expr, false)})`, base).value;
          } catch {
            v = null;
          }
          const arr = Array.isArray(v)
            ? (v as unknown[]).flat(Infinity)
            : v !== null && typeof v === 'object' && 'toArray' in (v as object)
              ? ((v as { toArray: () => unknown }).toArray() as unknown[]).flat(Infinity)
              : null;
          if (arr && arr.length > 1) {
            arr.forEach((item, k) => {
              const y = numOf(item);
              xs.push(k);
              ys.push(y ?? NaN);
            });
          } else {
            const y0 = numOf(v);
            if (y0 === null) {
              raw.push({ expr, xs: [], ys: [], es: [] });
              return;
            }
            for (let k = 0; k < N_PTS; k++) {
              xs.push(xmin + ((xmax - xmin) * k) / (N_PTS - 1));
              ys.push(y0);
            }
          }
        } else {
          for (let k = 0; k < N_PTS; k++) {
            const x = xmin + ((xmax - xmin) * k) / (N_PTS - 1);
            let y: number | null = null;
            try {
              y = numOf(evalAt(expr, x));
            } catch {
              y = null;
            }
            xs.push(x);
            ys.push(y ?? NaN);
          }
        }
        // погрешности ±err(x): то же выражение x, видит переменные документа
        const es: (number | null)[] = xs.map((x) => {
          if (!errText) return null;
          try {
            const e = numOf(evalAt(errText, x));
            return e === null || e < 0 ? null : e;
          } catch {
            return null;
          }
        });
        ys.forEach((y) => {
          if (isFinite(y)) allY.push(y);
        });
        raw.push({ expr, xs, ys, es });
      });

      if (!allY.length) return { ...fail(t('p2.noData')), series: raw.map((r): Series => ({ expr: r.expr, color: '', d: '', dashed: true })) };
      let lo = Math.min(...allY);
      let hi = Math.max(...allY);
      if (lo === hi) {
        lo -= 1;
        hi += 1;
      }
      const span = hi - lo;
      lo -= span * 0.12;
      hi += span * 0.12;

      const X = (x: number) => PAD_L + ((x - xmin) / (xmax - xmin)) * (pw - PAD_L - PAD_R);
      const Y = (y: number) => ph - PAD_B - ((y - lo) / (hi - lo)) * (ph - padT - PAD_B);
      const out: Series[] = [];
      let polarInfo: PolarGrid | null = null;

      if (proj === 'polar') {
        // r(θ): θ = x в радианах; отрицательный r — стандартное отражение
        let maxR = 0;
        for (const r of raw) {
          for (const y of r.ys) {
            if (isFinite(y)) maxR = Math.max(maxR, Math.abs(y));
          }
        }
        if (!(maxR > 0)) return { ...fail(t('p2.noData')), series: raw.map((r): Series => ({ expr: r.expr, color: '', d: '', dashed: true })) };
        const cx = PAD_L + (pw - PAD_L - PAD_R) / 2;
        const cy = padT + (ph - padT - PAD_B) / 2;
        const R = (Math.min(pw - PAD_L - PAD_R, ph - padT - PAD_B) / 2 - 8) / maxR;
        polarInfo = { cx, cy, R, maxR };
        const P = (th: number, r: number): [number, number] => [cx + r * Math.cos(th) * R, cy - r * Math.sin(th) * R];
        raw.forEach((r, si) => {
          let d = '';
          const errs: Series['errs'] = [];
          r.ys.forEach((y, k) => {
            if (!isFinite(y)) return;
            const [px, py] = P(r.xs[k], y);
            d += `${d ? 'L' : 'M'}${px.toFixed(1)},${py.toFixed(1)}`;
            const e = r.es[k];
            if (e !== null && isFinite(e) && e > 0) {
              const [ax, ay] = P(r.xs[k], y - e);
              const [bx, by] = P(r.xs[k], y + e);
              errs.push({ x1: ax, y1: ay, x2: bx, y2: by, cx: px, cy: py });
            }
          });
          out.push({ expr: r.expr, color: pal.series[si % pal.series.length], d, errs });
        });
        return { series: out, ymin: -maxR, ymax: maxR, err: null as string | null, xticks: [], yticks: [], polar: polarInfo };
      }

      // декартова проекция
      const baseY = lo < 0 && hi > 0 ? 0 : lo >= 0 ? lo : hi;
      raw.forEach((r, si) => {
        const color = pal.series[si % pal.series.length];
        if (!r.xs.length) {
          out.push({ expr: r.expr, color, d: '', dashed: true });
          return;
        }
        const idxMode = r.xs[0] === 0 && r.xs[r.xs.length - 1] === r.xs.length - 1 && r.xs.length !== N_PTS;
        const XX = idxMode
          ? (x: number) => PAD_L + (x / Math.max(1, r.xs[r.xs.length - 1])) * (pw - PAD_L - PAD_R)
          : X;
        if (trace === 'bar') {
          // прореживание до MAX_BARS столбцов, группы серий рядом
          const n = r.xs.length;
          const take = Math.min(n, MAX_BARS);
          const stepI = n / take;
          const slot = (pw - PAD_L - PAD_R) / take;
          const bw = (slot / raw.length) * 0.8;
          const bars: NonNullable<Series['bars']> = [];
          const errs: Series['errs'] = [];
          for (let k = 0; k < take; k++) {
            const idx = Math.min(n - 1, Math.floor(k * stepI));
            const y = r.ys[idx];
            if (!isFinite(y)) continue;
            const cx = XX(r.xs[idx]) - slot / 2 + (si + 0.5) * (slot / raw.length);
            const yBase = Y(baseY);
            const yTop = Y(y);
            bars.push({ x: cx - bw / 2, y: Math.min(yBase, yTop), w: bw, h: Math.abs(yTop - yBase) });
            const e = r.es[idx];
            if (e !== null && e > 0) {
              const y1 = Y(y - e);
              const y2 = Y(y + e);
              errs.push({ x1: cx, y1, x2: cx, y2, cx, cy: yTop });
            }
          }
          out.push({ expr: r.expr, color, d: '', bars, errs });
        } else if (trace === 'stem') {
          const stems: NonNullable<Series['stems']> = [];
          const errs: Series['errs'] = [];
          r.ys.forEach((y, k) => {
            if (!isFinite(y)) return;
            const px = XX(r.xs[k]);
            stems.push({ x1: px, y1: Y(baseY), x2: px, y2: Y(y) });
            const e = r.es[k];
            if (e !== null && e > 0) {
              errs.push({ x1: px, y1: Y(y - e), x2: px, y2: Y(y + e), cx: px, cy: Y(y) });
            }
          });
          out.push({ expr: r.expr, color, d: '', stems, errs });
        } else {
          let d = '';
          r.ys.forEach((y, k) => {
            if (!isFinite(y)) return;
            d += `${d ? 'L' : 'M'}${XX(r.xs[k]).toFixed(1)},${Y(y).toFixed(1)}`;
          });
          const errs: Series['errs'] = [];
          r.ys.forEach((y, k) => {
            const e = r.es[k];
            if (!isFinite(y) || e === null || e <= 0) return;
            // усы не на каждой точке, а прореженно — иначе каша
            if (k % Math.ceil(r.ys.length / 60) !== 0) return;
            const px = XX(r.xs[k]);
            errs.push({ x1: px, y1: Y(y - e), x2: px, y2: Y(y + e), cx: px, cy: Y(y) });
          });
          out.push({ expr: r.expr, color, d, errs });
        }
      });
      return { series: out, ymin: lo, ymax: hi, err: null as string | null, xticks: niceTicks(xmin, xmax), yticks: niceTicks(lo, hi), polar: null };
    } catch (e) {
      return fail(e instanceof Error ? e.message : String(e));
    }
  }, [fnText, xmin, xmax, proj, trace, errText, blocks, pw, ph, padT, pal]);

  const X = (x: number) => PAD_L + ((x - xmin) / (xmax - xmin)) * (pw - PAD_L - PAD_R);
  const Y = (y: number) => ph - PAD_B - ((y - ymin) / (ymax - ymin)) * (ph - padT - PAD_B);
  const selected = selectedIds.includes(block.id);
  const zeroY = proj === 'xy' && ymin < 0 && ymax > 0 ? Y(0) : null;
  const zeroX = proj === 'xy' && xmin < 0 && xmax > 0 ? X(0) : null;
  const svgW = pw - 24;
  const legY = padT + 12;

  const renderErrors = (list: NonNullable<Series['errs']> | undefined, color: string, key: string | number) => {
    if (!list?.length) return null;
    return (
      <g key={`e${key}`} stroke={color} strokeWidth={1} opacity={0.75}>
        {list.map((e, k) => (
          <g key={k}>
            <line x1={e.x1} y1={e.y1} x2={e.x2} y2={e.y2} />
            <line x1={e.cx - 3} y1={e.y1} x2={e.cx + 3} y2={e.y1} />
            <line x1={e.cx - 3} y1={e.y2} x2={e.cx + 3} y2={e.y2} />
          </g>
        ))}
      </g>
    );
  };

  return (
    <div ref={boxRef} className="absolute z-10" style={{ left: block.x, top: block.y, width: pw, height: ph + HEAD }}>
      <div
        data-block-id={block.id}
        className={`weng-block relative w-full h-full rounded-xl border px-3 py-2 flex flex-col bg-[var(--sheet)] shadow-[0_8px_30px_rgba(0,0,0,0.35)] group ${
          selected ? 'border-[var(--accent-line)]' : 'border-[var(--line)]'
        }`}
        onClick={(e) => {
          e.stopPropagation();
          if (e.shiftKey) toggleSelect(block.id);
          else select(block.id);
        }}
      >
        <div
          className="flex items-center gap-2 mb-1 cursor-grab active:cursor-grabbing select-none"
          onPointerDown={onGripDown}
          onPointerMove={onGripMove}
          onPointerUp={onGripUp}
          onPointerCancel={onGripUp}
          onDoubleClick={(e) => e.stopPropagation()}
        >
          <span className="text-[var(--faint)] text-[12px]" aria-hidden="true">
            ⠿
          </span>
          <span className="text-[11px] uppercase tracking-wider text-[var(--accent-ink)]">plot</span>
          <label htmlFor={`plotfn-${block.id}`} className="sr-only">
            {t('p2.fnLabel')}
          </label>
          <input
            id={`plotfn-${block.id}`}
            className="math-input flex-1 min-h-[32px] bg-[var(--input-bg)] border border-[var(--input-border)] rounded-lg px-2 py-0.5 text-[13px] text-[var(--ink)] outline-none focus:border-[var(--accent-line)] select-text"
            value={fnText}
            onChange={(e) => updatePlot(block.id, { plotFn: e.target.value })}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            spellCheck={false}
            title={t('p2.fnTitle')}
          />
          <button
            type="button"
            className="p-1.5 text-[var(--faint)] hover:text-[var(--danger)] cursor-pointer"
            onClick={() => removeBlock(block.id)}
            onPointerDown={(e) => e.stopPropagation()}
            aria-label={t('p2.delete')}
          >
            <IX />
          </button>
        </div>
        <div className="flex items-center gap-2 text-[12px] text-[var(--ink-soft)] mb-1 flex-wrap">
          <label>
            xmin{' '}
            <input
              type="number"
              aria-label={t('p2.xmin')}
              className="w-[70px] min-h-[32px] bg-[var(--input-bg)] border border-[var(--input-border)] rounded-lg px-1.5 text-[var(--ink)] select-text"
              value={xmin}
              onChange={(e) => updatePlot(block.id, { plotXmin: Number(e.target.value) })}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
            />
          </label>
          <label>
            xmax{' '}
            <input
              type="number"
              aria-label={t('p2.xmax')}
              className="w-[70px] min-h-[32px] bg-[var(--input-bg)] border border-[var(--input-border)] rounded-lg px-1.5 text-[var(--ink)] select-text"
              value={xmax}
              onChange={(e) => updatePlot(block.id, { plotXmax: Number(e.target.value) })}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
            />
          </label>
          <label title={t('p2.proj')}>
            {t('p2.proj')}{' '}
            <select
              aria-label={t('p2.proj')}
              className="min-h-[32px] bg-[var(--input-bg)] border border-[var(--input-border)] rounded-lg px-1 text-[var(--ink)]"
              value={proj}
              onChange={(e) => updatePlot(block.id, { plotProj: e.target.value as 'xy' | 'polar' })}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
            >
              <option value="xy">{t('p2.projXy')}</option>
              <option value="polar">{t('p2.projPolar')}</option>
            </select>
          </label>
          {proj === 'xy' && (
            <label title={t('p2.trace')}>
              {t('p2.trace')}{' '}
              <select
                aria-label={t('p2.trace')}
                className="min-h-[32px] bg-[var(--input-bg)] border border-[var(--input-border)] rounded-lg px-1 text-[var(--ink)]"
                value={trace}
                onChange={(e) => updatePlot(block.id, { plotTrace: e.target.value as 'line' | 'bar' | 'stem' })}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
              >
                <option value="line">{t('p2.traceLine')}</option>
                <option value="bar">{t('p2.traceBar')}</option>
                <option value="stem">{t('p2.traceStem')}</option>
              </select>
            </label>
          )}
          {proj === 'xy' && (
            <label title={t('p2.errTitle')}>
              ±{' '}
              <input
                className="w-[110px] min-h-[32px] bg-[var(--input-bg)] border border-[var(--input-border)] rounded-lg px-1.5 text-[var(--ink)] select-text"
                value={block.plotErr ?? ''}
                placeholder={t('p2.errPh')}
                aria-label={t('p2.errExpr')}
                onChange={(e) => updatePlot(block.id, { plotErr: e.target.value })}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
                spellCheck={false}
              />
            </label>
          )}
          <label className="inline-flex items-center gap-1 cursor-pointer">
            <input
              type="checkbox"
              className="w-4 h-4 accent-current"
              checked={showGrid}
              aria-label={t('p2.grid')}
              onChange={(e) => updatePlot(block.id, { plotGrid: e.target.checked })}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
            />
            {t('p2.grid')}
          </label>
          <label className="inline-flex items-center gap-1 cursor-pointer">
            <input
              type="checkbox"
              className="w-4 h-4 accent-current"
              checked={showLegend}
              aria-label={t('p2.legend')}
              onChange={(e) => updatePlot(block.id, { plotLegend: e.target.checked })}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
            />
            {t('p2.legend')}
          </label>
          <span className="ml-auto math-input text-[11px] text-[var(--faint)]">
            {proj === 'polar' ? `r ≤ ${fmtTick(polar?.maxR ?? ymax)}` : `y ∈ [${fmtTick(ymin)}, ${fmtTick(ymax)}]`}
          </span>
        </div>
        <div className="flex items-center gap-2 text-[12px] text-[var(--ink-soft)] mb-1 flex-wrap">
          <label className="flex-1 min-w-[120px]">
            {t('p2.title')}{' '}
            <input
              className="w-full max-w-[220px] min-h-[32px] bg-[var(--input-bg)] border border-[var(--input-border)] rounded-lg px-1.5 text-[var(--ink)] select-text"
              value={block.plotTitle ?? ''}
              placeholder={t('p2.titlePh')}
              aria-label={t('p2.title')}
              onChange={(e) => updatePlot(block.id, { plotTitle: e.target.value })}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
              spellCheck={false}
            />
          </label>
          <label>
            X{' '}
            <input
              className="w-[80px] min-h-[32px] bg-[var(--input-bg)] border border-[var(--input-border)] rounded-lg px-1.5 text-[var(--ink)] select-text"
              value={block.plotXLabel ?? ''}
              placeholder="x"
              aria-label={t('p2.xLabel')}
              onChange={(e) => updatePlot(block.id, { plotXLabel: e.target.value })}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
              spellCheck={false}
            />
          </label>
          <label>
            Y{' '}
            <input
              className="w-[80px] min-h-[32px] bg-[var(--input-bg)] border border-[var(--input-border)] rounded-lg px-1.5 text-[var(--ink)] select-text"
              value={block.plotYLabel ?? ''}
              placeholder="y"
              aria-label={t('p2.yLabel')}
              onChange={(e) => updatePlot(block.id, { plotYLabel: e.target.value })}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
              spellCheck={false}
            />
          </label>
        </div>
        {err ? (
          <div className="text-[var(--danger)] text-[12px]" role="alert">
            ⚠ {err}
          </div>
        ) : proj === 'polar' && polar ? (
          <svg
            width={svgW}
            height={ph}
            className="rounded-lg border border-[var(--line)]"
            style={{ background: pal.svgBg }}
            role="img"
            aria-label={t('p2.aria', { fn: fnText, lo: fmtTick(-polar.maxR), hi: fmtTick(polar.maxR), x0: xmin, x1: xmax })}
          >
            {title && (
              <text x={svgW / 2} y={15} fontSize={13} fontWeight={600} fill={pal.legend} textAnchor="middle">
                {title}
              </text>
            )}
            {/* полярная сетка: окружности + спицы каждые 30° */}
            {[0.25, 0.5, 0.75, 1].map((f) => (
              <g key={f}>
                <circle cx={polar.cx} cy={polar.cy} r={polar.R * polar.maxR * f} fill="none" stroke={pal.grid} strokeOpacity={pal.gridOpacity} />
                <text x={polar.cx + 3} y={polar.cy - polar.R * polar.maxR * f + 10} fontSize={9} fill={pal.tick}>
                  {fmtTick(polar.maxR * f)}
                </text>
              </g>
            ))}
            {showGrid &&
              Array.from({ length: 12 }, (_, k) => k * 30).map((deg) => {
                const a = (deg * Math.PI) / 180;
                const x2 = polar.cx + Math.cos(a) * polar.R * polar.maxR;
                const y2 = polar.cy - Math.sin(a) * polar.R * polar.maxR;
                return (
                  <g key={deg}>
                    <line x1={polar.cx} y1={polar.cy} x2={x2} y2={y2} stroke={pal.grid} strokeOpacity={pal.gridOpacity} />
                    <text x={polar.cx + Math.cos(a) * (polar.R * polar.maxR + 10)} y={polar.cy - Math.sin(a) * (polar.R * polar.maxR + 10) + 3} fontSize={9} fill={pal.tick} textAnchor="middle">
                      {deg}°
                    </text>
                  </g>
                );
              })}
            {series.map((s, i) =>
              s.d ? <path key={i} d={s.d} fill="none" stroke={s.color} strokeWidth={2} /> : null,
            )}
            {series.map((s, i) => renderErrors(s.errs, s.color, i))}
            {showLegend &&
              series.map((s, i) => (
                <g key={`l${i}`}>
                  <line x1={PAD_L + 8} y1={legY + i * 15} x2={PAD_L + 26} y2={legY + i * 15} stroke={s.color} strokeWidth={2.5} />
                  <text x={PAD_L + 30} y={legY + 3 + i * 15} fontSize={10} fill={pal.legend}>
                    {s.expr.length > 34 ? s.expr.slice(0, 34) + '…' : s.expr}
                  </text>
                </g>
              ))}
          </svg>
        ) : (
          <svg
            width={svgW}
            height={ph}
            className="rounded-lg border border-[var(--line)]"
            style={{ background: pal.svgBg }}
            role="img"
            aria-label={t('p2.aria', { fn: fnText, lo: fmtTick(ymin), hi: fmtTick(ymax), x0: xmin, x1: xmax })}
          >
            {title && (
              <text x={svgW / 2} y={15} fontSize={13} fontWeight={600} fill={pal.legend} textAnchor="middle">
                {title}
              </text>
            )}
            {/* сетка + тики */}
            {showGrid &&
              xticks.map((t) => (
                <g key={`x${t}`}>
                  <line x1={X(t)} y1={padT} x2={X(t)} y2={ph - PAD_B} stroke={pal.grid} strokeOpacity={pal.gridOpacity} />
                  <text x={X(t)} y={ph - PAD_B + 14} fontSize={9} fill={pal.tick} textAnchor="middle">
                    {fmtTick(t)}
                  </text>
                </g>
              ))}
            {showGrid &&
              yticks.map((t) => (
                <g key={`y${t}`}>
                  <line x1={PAD_L} y1={Y(t)} x2={pw - PAD_R} y2={Y(t)} stroke={pal.grid} strokeOpacity={pal.gridOpacity} />
                  <text x={PAD_L - 5} y={Y(t) + 3} fontSize={9} fill={pal.tick} textAnchor="end">
                    {fmtTick(t)}
                  </text>
                </g>
              ))}
            {/* нулевые оси */}
            {zeroY !== null && <line x1={PAD_L} y1={zeroY} x2={pw - PAD_R} y2={zeroY} stroke={pal.axis} strokeWidth={1.2} />}
            {zeroX !== null && <line x1={zeroX} y1={padT} x2={zeroX} y2={ph - PAD_B} stroke={pal.axis} strokeWidth={1.2} />}
            {/* рамка */}
            <rect x={PAD_L} y={padT} width={pw - PAD_L - PAD_R} height={ph - padT - PAD_B} fill="none" stroke={pal.frame} />
            {series.map((s, i) =>
              s.d ? <path key={i} d={s.d} fill="none" stroke={s.color} strokeWidth={2} /> : null,
            )}
            {series.map((s, i) =>
              s.bars?.length ? (
                <g key={`b${i}`} fill={s.color} opacity={0.85}>
                  {s.bars.map((b, k) => (
                    <rect key={k} x={b.x} y={b.y} width={Math.max(1, b.w)} height={Math.max(1, b.h)} />
                  ))}
                </g>
              ) : null,
            )}
            {series.map((s, i) =>
              s.stems?.length ? (
                <g key={`s${i}`} stroke={s.color} strokeWidth={1.5}>
                  {s.stems.map((st, k) => (
                    <line key={k} x1={st.x1} y1={st.y1} x2={st.x2} y2={st.y2} />
                  ))}
                  {s.stems.map((st, k) => (
                    <circle key={`m${k}`} cx={st.x2} cy={st.y2} r={2.5} fill={s.color} stroke="none" />
                  ))}
                </g>
              ) : null,
            )}
            {series.map((s, i) => renderErrors(s.errs, s.color, i))}
            {/* подписи осей */}
            {xLabel && (
              <text x={pw - PAD_R} y={ph - 4} fontSize={10} fill={pal.tick} textAnchor="end">
                {xLabel}
              </text>
            )}
            {yLabel && (
              <text x={12} y={padT + 4} fontSize={10} fill={pal.tick} textAnchor="start" transform={`rotate(-90 12 ${padT + 4})`}>
                {yLabel}
              </text>
            )}
            {/* легенда */}
            {showLegend &&
              series.map((s, i) => (
                <g key={`l${i}`}>
                  <line x1={PAD_L + 8} y1={legY + i * 15} x2={PAD_L + 26} y2={legY + i * 15} stroke={s.color} strokeWidth={2.5} />
                  <text x={PAD_L + 30} y={legY + 3 + i * 15} fontSize={10} fill={pal.legend}>
                    {s.expr.length > 34 ? s.expr.slice(0, 34) + '…' : s.expr}
                  </text>
                </g>
              ))}
          </svg>
        )}
        <div className="text-[11px] text-[var(--faint)] mt-1 truncate">
          {t('p2.footer', { fn: fnText, x0: xmin, x1: xmax })}
        </div>
        {/* ручка размера */}
        <span
          className="absolute -right-2 -bottom-2 p-1.5 cursor-nwse-resize opacity-0 group-hover:opacity-100 text-[var(--faint)] hover:text-[var(--accent-line)] select-none"
          style={{ opacity: selected ? 1 : undefined }}
          title={t('p2.resize')}
          onPointerDown={onResizeDown}
          onPointerMove={onResizeMove}
          onPointerUp={onResizeUp}
          onPointerCancel={onResizeUp}
          onDoubleClick={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <IResize />
        </span>
      </div>
    </div>
  );
}

export default memo(PlotBlockView);
