import { memo, useMemo, useRef } from 'react';
import { createBaseScope } from '../engine/mathEngine';
import { recalculateAll } from '../engine/dependencies';
import { samplePlot3d } from '../engine/plot3dSample';
import { useCanvasStore } from '../store/canvasStore';
import { plotPalettes } from '../theme';
import type { MathBlockData } from '../engine/dependencies';
import { useRegionDrag, useRegionResize } from './useRegionDrag';
import { IResize, ISave, IX } from './Icon';
import { t } from '../i18n';
import { exportSvgElementToPng, safeFilename } from '../lib/exportFiles';

const W = 460;
const H = 300;
const PAD_L = 52;
const PAD_R = 12;
const PAD_T = 10;
const PAD_B = 30;
const LEVELS = 10;

const fmtTick = (v: number) => {
  if (v === 0) return '0';
  const a = Math.abs(v);
  if (a >= 1000 || a < 0.01) return v.toExponential(0).replace('e', 'e');
  return String(Number(v.toPrecision(4)));
};

/** Изолинии уровня методом marching squares → SVG-путь. */
function isolines(
  gx: number[],
  gy: number[],
  zs: (number | null)[][],
  level: number,
  X: (x: number) => number,
  Y: (y: number) => number,
): string {
  let d = '';
  const seg = (x1: number, y1: number, x2: number, y2: number) => {
    d += `M${X(x1).toFixed(1)},${Y(y1).toFixed(1)}L${X(x2).toFixed(1)},${Y(y2).toFixed(1)}`;
  };
  const rows = zs.length;
  const cols = gx.length;
  for (let r = 0; r + 1 < rows; r++) {
    for (let c = 0; c + 1 < cols; c++) {
      const z00 = zs[r]?.[c];
      const z10 = zs[r]?.[c + 1];
      const z01 = zs[r + 1]?.[c];
      const z11 = zs[r + 1]?.[c + 1];
      if (z00 === null || z00 === undefined || z10 === null || z10 === undefined ||
          z01 === null || z01 === undefined || z11 === null || z11 === undefined) continue;
      const x0 = gx[c];
      const x1 = gx[c + 1];
      const y0 = gy[r];
      const y1 = gy[r + 1];
      let idx = 0;
      if (z00 > level) idx |= 1;
      if (z10 > level) idx |= 2;
      if (z11 > level) idx |= 4;
      if (z01 > level) idx |= 8;
      if (idx === 0 || idx === 15) continue;
      const tx = (xa: number, xb: number, za: number, zb: number) =>
        zb === za ? (xa + xb) / 2 : xa + ((level - za) / (zb - za)) * (xb - xa);
      // рёбра: T (y0, x0-x1), R (x1, y0-y1), B (y1), L (x0)
      const T = { x: tx(x0, x1, z00, z10), y: y0 };
      const R = { x: x1, y: tx(y0, y1, z10, z11) };
      const B = { x: tx(x0, x1, z01, z11), y: y1 };
      const L = { x: x0, y: tx(y0, y1, z00, z01) };
      const avg = (z00 + z10 + z11 + z01) / 4 > level;
      switch (idx) {
        case 1: case 14: seg(L.x, L.y, T.x, T.y); break;
        case 2: case 13: seg(T.x, T.y, R.x, R.y); break;
        case 3: case 12: seg(L.x, L.y, R.x, R.y); break;
        case 4: case 11: seg(R.x, R.y, B.x, B.y); break;
        case 5: // неоднозначный
          if (avg) { seg(L.x, L.y, T.x, T.y); seg(R.x, R.y, B.x, B.y); }
          else { seg(T.x, T.y, R.x, R.y); seg(L.x, L.y, B.x, B.y); }
          break;
        case 6: case 9: seg(T.x, T.y, B.x, B.y); break;
        case 7: case 8: seg(L.x, L.y, B.x, B.y); break;
        case 10: // неоднозначный
          if (avg) { seg(T.x, T.y, R.x, R.y); seg(L.x, L.y, B.x, B.y); }
          else { seg(L.x, L.y, T.x, T.y); seg(R.x, R.y, B.x, B.y); }
          break;
      }
    }
  }
  return d;
}

function ContourBlockView({ block, scale }: { block: MathBlockData; scale: number }) {
  const removeBlock = useCanvasStore((s) => s.removeBlock);
  const boxRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
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
  // подписка ради перерендера при смене языка
  useCanvasStore((s) => s.lang);
  const pal = plotPalettes[theme];

  const fnText = block.plotFn ?? 'sin(sqrt(x^2+y^2))';
  const xmin = block.plotXmin ?? -5;
  const xmax = block.plotXmax ?? 5;
  const ymin = block.plotYmin ?? -5;
  const ymax = block.plotYmax ?? 5;
  const res = Math.min(100, Math.max(8, Math.round(block.plotResolution ?? 48)));
  const pw = block.w ?? W;
  const ph = Math.max(180, (block.h ?? H + 132) - 132);
  const showGrid = block.plotGrid ?? true;
  const title = (block.plotTitle ?? '').trim();

  const data = useMemo(() => {
    if (!(xmin < xmax) || !(ymin < ymax)) return { err: t('p2.needRange'), levels: [] as { v: number; d: string; color: string }[], zmin: 0, zmax: 0 };
    try {
      const mathBlocks = Object.values(blocks).filter((b) => b.kind === 'math');
      const { scope } = recalculateAll(mathBlocks);
      const base = { ...createBaseScope(), ...scope };
      const s = samplePlot3d(fnText, base, { xmin, xmax, ymin, ymax, res, mode: 'surface' });
      if (!s || s.mode !== 'surface') return { err: t('p3.noDataHint'), levels: [] as { v: number; d: string; color: string }[], zmin: 0, zmax: 0 };
      let zmin = Infinity;
      let zmax = -Infinity;
      for (const row of s.zs) {
        for (const z of row) {
          if (typeof z === 'number' && isFinite(z)) {
            if (z < zmin) zmin = z;
            if (z > zmax) zmax = z;
          }
        }
      }
      if (!(zmax > zmin)) return { err: t('p3.noData'), levels: [] as { v: number; d: string; color: string }[], zmin, zmax };
      const X = (x: number) => PAD_L + ((x - xmin) / (xmax - xmin)) * (pw - PAD_L - PAD_R);
      const Y = (y: number) => ph - PAD_B - ((y - ymin) / (ymax - ymin)) * (ph - PAD_T - PAD_B);
      const levels = [];
      for (let k = 0; k < LEVELS; k++) {
        const v = zmin + ((zmax - zmin) * (k + 1)) / (LEVELS + 1);
        levels.push({ v, d: isolines(s.gx, s.gy, s.zs, v, X, Y), color: pal.series[k % pal.series.length] });
      }
      return { err: null as string | null, levels, zmin, zmax };
    } catch (e) {
      return { err: e instanceof Error ? e.message : String(e), levels: [] as { v: number; d: string; color: string }[], zmin: 0, zmax: 0 };
    }
  }, [fnText, xmin, xmax, ymin, ymax, res, blocks, pw, ph, pal]);

  const selected = selectedIds.includes(block.id);

  /** PNG снимок отрендеренного SVG (×2) */
  const doExportPng = () => {
    if (!svgRef.current || data.err) {
      alert(t('p3.noData'));
      return;
    }
    const name = safeFilename(title || fnText, 'contour');
    void exportSvgElementToPng(svgRef.current, `${name}.png`).catch(() => alert(t('p3.noData')));
  };

  return (
    <div ref={boxRef} className="absolute z-10" style={{ left: block.x, top: block.y, width: pw, height: ph + 132 }}>
      <div
        data-block-id={block.id}
        className={`nya-block relative w-full h-full rounded-xl border px-3 py-2 flex flex-col bg-[var(--sheet)] shadow-[0_1px_2px_rgba(0,0,0,0.22),0_12px_32px_rgba(0,0,0,0.2)] group ${
          selected ? 'border-[var(--accent-line)]' : 'border-[var(--line)]'
        }`}
        onClick={(e) => {
          e.stopPropagation();
          if (e.shiftKey) toggleSelect(block.id);
          else select(block.id);
        }}
      >
        <div
          className="flex items-center gap-2 mb-1 cursor-grab active:cursor-grabbing select-none print:hidden"
          onPointerDown={onGripDown}
          onPointerMove={onGripMove}
          onPointerUp={onGripUp}
          onPointerCancel={onGripUp}
          onDoubleClick={(e) => e.stopPropagation()}
        >
          <span className="text-[var(--faint)] text-[12px]" aria-hidden="true">⠿</span>
          <span className="text-[11px] uppercase tracking-wider text-[var(--accent-ink)]">contour</span>
          <label htmlFor={`contourfn-${block.id}`} className="sr-only">{t('ctr.fnLabel')}</label>
          <input
            id={`contourfn-${block.id}`}
            className="math-input flex-1 min-h-[32px] bg-[var(--input-bg)] border border-[var(--input-border)] rounded-lg px-2 py-0.5 text-[13px] text-[var(--ink)] outline-none focus:border-[var(--accent-line)] select-text"
            value={fnText}
            onChange={(e) => updatePlot(block.id, { plotFn: e.target.value })}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            spellCheck={false}
            title={t('ctr.fnTitle')}
          />
          <button
            type="button"
            className="p-1.5 text-[var(--faint)] hover:text-[var(--accent-line)] cursor-pointer"
            onClick={(e) => {
              e.stopPropagation();
              doExportPng();
            }}
            onPointerDown={(e) => e.stopPropagation()}
            title={t('p2.png')}
            aria-label={t('p2.png')}
          >
            <ISave />
          </button>
          <button
            type="button"
            className="p-1.5 text-[var(--faint)] hover:text-[var(--danger)] cursor-pointer"
            onClick={() => removeBlock(block.id)}
            onPointerDown={(e) => e.stopPropagation()}
            aria-label={t('ctr.delete')}
          >
            <IX />
          </button>
        </div>
        <div className="flex items-center gap-2 flex-wrap text-[12px] text-[var(--ink-soft)] mb-1 print:hidden">
          <label>xmin <input type="number" aria-label={t('p3.xmin')} className="w-[64px] min-h-[32px] bg-[var(--input-bg)] border border-[var(--input-border)] rounded-lg px-1.5 text-[var(--ink)] select-text" value={xmin} onChange={(e) => updatePlot(block.id, { plotXmin: Number(e.target.value) })} onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()} /></label>
          <label>xmax <input type="number" aria-label={t('p3.xmax')} className="w-[64px] min-h-[32px] bg-[var(--input-bg)] border border-[var(--input-border)] rounded-lg px-1.5 text-[var(--ink)] select-text" value={xmax} onChange={(e) => updatePlot(block.id, { plotXmax: Number(e.target.value) })} onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()} /></label>
          <label>ymin <input type="number" aria-label={t('p3.ymin')} className="w-[64px] min-h-[32px] bg-[var(--input-bg)] border border-[var(--input-border)] rounded-lg px-1.5 text-[var(--ink)] select-text" value={ymin} onChange={(e) => updatePlot(block.id, { plotYmin: Number(e.target.value) })} onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()} /></label>
          <label>ymax <input type="number" aria-label={t('p3.ymax')} className="w-[64px] min-h-[32px] bg-[var(--input-bg)] border border-[var(--input-border)] rounded-lg px-1.5 text-[var(--ink)] select-text" value={ymax} onChange={(e) => updatePlot(block.id, { plotYmax: Number(e.target.value) })} onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()} /></label>
          <span className="ml-auto math-input text-[11px] text-[var(--faint)]">
            z ∈ [{fmtTick(data.zmin)}, {fmtTick(data.zmax)}]
          </span>
        </div>
        {title && <div className="text-center text-[13px] font-medium text-[var(--ink)] mb-1">{title}</div>}
        {data.err ? (
          <div className="text-[var(--danger)] text-[12px]" role="alert">⚠ {data.err}</div>
        ) : (
          <svg
            ref={svgRef}
            width={pw - 24}
            height={ph}
            className="rounded-lg border border-[var(--line)]"
            style={{ background: pal.svgBg }}
            role="img"
            aria-label={t('ctr.aria', { fn: fnText })}
          >
            {showGrid && (
              <g>
                {[0.25, 0.5, 0.75].map((f) => (
                  <g key={f}>
                    <line x1={PAD_L + (pw - PAD_L - PAD_R) * f} y1={PAD_T} x2={PAD_L + (pw - PAD_L - PAD_R) * f} y2={ph - PAD_B} stroke={pal.grid} strokeOpacity={pal.gridOpacity} />
                    <line x1={PAD_L} y1={PAD_T + (ph - PAD_T - PAD_B) * f} x2={pw - PAD_R} y2={PAD_T + (ph - PAD_T - PAD_B) * f} stroke={pal.grid} strokeOpacity={pal.gridOpacity} />
                  </g>
                ))}
              </g>
            )}
            <rect x={PAD_L} y={PAD_T} width={pw - PAD_L - PAD_R} height={ph - PAD_T - PAD_B} fill="none" stroke={pal.frame} />
            {data.levels.map((l, i) =>
              l.d ? <path key={i} d={l.d} fill="none" stroke={l.color} strokeWidth={1.5} /> : null,
            )}
            {/* легенда уровней: min / mid / max */}
            {[0, Math.floor(data.levels.length / 2), data.levels.length - 1].map((li, k) => {
              const l = data.levels[li];
              if (!l || !l.d) return null;
              return (
                <g key={`lg${k}`}>
                  <line x1={PAD_L + 8} y1={PAD_T + 12 + k * 15} x2={PAD_L + 26} y2={PAD_T + 12 + k * 15} stroke={l.color} strokeWidth={2.5} />
                  <text x={PAD_L + 30} y={PAD_T + 15 + k * 15} fontSize={10} fill={pal.legend}>
                    {fmtTick(l.v)}
                  </text>
                </g>
              );
            })}
          </svg>
        )}
        <div className="text-[11px] text-[var(--faint)] mt-1 truncate">
          {t('ctr.footer', { fn: fnText })} • {data.levels.filter((l) => l.d).length}/{LEVELS}
        </div>
        <span
          className="absolute -right-2 -bottom-2 p-1.5 cursor-nwse-resize opacity-0 group-hover:opacity-100 text-[var(--faint)] hover:text-[var(--accent-line)] select-none"
          style={{ opacity: selected ? 1 : undefined }}
          title={t('ctr.resize')}
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

export default memo(ContourBlockView);
