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
  // Ручной размер: ширина/высота области графика (шапка +132)
  const pw = block.w ?? W;
  const ph = Math.max(180, (block.h ?? H + 132) - 132);

  const { series, ymin, ymax, err, xticks, yticks } = useMemo(() => {
    const fail = (e: string) => ({ series: [] as Series[], ymin: -1, ymax: 1, err: e, xticks: [] as number[], yticks: [] as number[] });
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
      const out: Series[] = [];
      exprs.forEach((expr, si) => {
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
              out.push({ expr, color: pal.series[si % pal.series.length], d: '', dashed: true });
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
        ys.forEach((y) => {
          if (isFinite(y)) allY.push(y);
        });
        out.push({ expr, color: pal.series[si % pal.series.length], d: '', _xs: xs, _ys: ys } as Series & { _xs: number[]; _ys: number[] });
      });

      if (!allY.length) return { ...fail(t('p2.noData')), series: out };
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
      const Y = (y: number) => ph - PAD_B - ((y - lo) / (hi - lo)) * (ph - PAD_T - PAD_B);
      for (const s of out) {
        const { _xs, _ys } = s as Series & { _xs?: number[]; _ys?: number[] };
        if (!_xs || !_ys) continue;
        // для индексного режима x-диапазон свой
        const x0 = _xs[0];
        const x1 = _xs[_xs.length - 1];
        const useIdx = x0 === 0 && x1 === _xs.length - 1 && _xs.length !== N_PTS;
        const XX = useIdx
          ? (x: number) => PAD_L + (x / Math.max(1, x1)) * (pw - PAD_L - PAD_R)
          : X;
        let d = '';
        _ys.forEach((y, k) => {
          if (!isFinite(y)) return;
          d += `${d ? 'L' : 'M'}${XX(_xs[k]).toFixed(1)},${Y(y).toFixed(1)}`;
        });
        s.d = d;
        delete (s as Partial<Series & { _xs?: number[]; _ys?: number[] }>)._xs;
        delete (s as Partial<Series & { _xs?: number[]; _ys?: number[] }>)._ys;
      }
      return { series: out, ymin: lo, ymax: hi, err: null as string | null, xticks: niceTicks(xmin, xmax), yticks: niceTicks(lo, hi) };
    } catch (e) {
      return fail(e instanceof Error ? e.message : String(e));
    }
  }, [fnText, xmin, xmax, blocks, pw, ph, pal]);

  const X = (x: number) => PAD_L + ((x - xmin) / (xmax - xmin)) * (pw - PAD_L - PAD_R);
  const Y = (y: number) => ph - PAD_B - ((y - ymin) / (ymax - ymin)) * (ph - PAD_T - PAD_B);
  const selected = selectedIds.includes(block.id);
  const zeroY = ymin < 0 && ymax > 0 ? Y(0) : null;
  const zeroX = xmin < 0 && xmax > 0 ? X(0) : null;

  return (
    <div ref={boxRef} className="absolute z-10" style={{ left: block.x, top: block.y, width: pw, height: ph + 132 }}>
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
        <div className="flex items-center gap-2 text-[12px] text-[var(--ink-soft)] mb-1">
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
          <span className="ml-auto math-input text-[11px] text-[var(--faint)]">
            y ∈ [{fmtTick(ymin)}, {fmtTick(ymax)}]
          </span>
        </div>
        {err ? (
          <div className="text-[var(--danger)] text-[12px]" role="alert">
            ⚠ {err}
          </div>
        ) : (
          <svg
            width={pw - 24}
            height={ph}
            className="rounded-lg border border-[var(--line)]"
            style={{ background: pal.svgBg }}
            role="img"
            aria-label={t('p2.aria', { fn: fnText, lo: fmtTick(ymin), hi: fmtTick(ymax), x0: xmin, x1: xmax })}
          >
            {/* сетка + тики */}
            {xticks.map((t) => (
              <g key={`x${t}`}>
                <line x1={X(t)} y1={PAD_T} x2={X(t)} y2={ph - PAD_B} stroke={pal.grid} strokeOpacity={pal.gridOpacity} />
                <text x={X(t)} y={ph - PAD_B + 14} fontSize={9} fill={pal.tick} textAnchor="middle">
                  {fmtTick(t)}
                </text>
              </g>
            ))}
            {yticks.map((t) => (
              <g key={`y${t}`}>
                <line x1={PAD_L} y1={Y(t)} x2={pw - PAD_R} y2={Y(t)} stroke={pal.grid} strokeOpacity={pal.gridOpacity} />
                <text x={PAD_L - 5} y={Y(t) + 3} fontSize={9} fill={pal.tick} textAnchor="end">
                  {fmtTick(t)}
                </text>
              </g>
            ))}
            {/* нулевые оси */}
            {zeroY !== null && <line x1={PAD_L} y1={zeroY} x2={pw - PAD_R} y2={zeroY} stroke={pal.axis} strokeWidth={1.2} />}
            {zeroX !== null && <line x1={zeroX} y1={PAD_T} x2={zeroX} y2={ph - PAD_B} stroke={pal.axis} strokeWidth={1.2} />}
            {/* рамка */}
            <rect x={PAD_L} y={PAD_T} width={pw - PAD_L - PAD_R} height={ph - PAD_T - PAD_B} fill="none" stroke={pal.frame} />
            {series.map((s, i) =>
              s.d ? <path key={i} d={s.d} fill="none" stroke={s.color} strokeWidth={2} /> : null,
            )}
            {/* легенда */}
            {series.map((s, i) => (
              <g key={`l${i}`}>
                <line x1={PAD_L + 8} y1={PAD_T + 12 + i * 15} x2={PAD_L + 26} y2={PAD_T + 12 + i * 15} stroke={s.color} strokeWidth={2.5} />
                <text x={PAD_L + 30} y={PAD_T + 15 + i * 15} fontSize={10} fill={pal.legend}>
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
