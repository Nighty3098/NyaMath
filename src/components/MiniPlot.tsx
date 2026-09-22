import { memo } from 'react';
import type { PlotSample } from '../engine/plotSample';
import { plotPalettes } from '../theme';
import { t } from '../i18n';
import { useCanvasStore } from '../store/canvasStore';

const VW = 400;
const VH = 150;
const PL = 44;
const PR = 8;
const PT = 8;
const PB = 20;

/** Компактное превью автографика под формулой. */
function MiniPlot({ sample }: { sample: PlotSample }) {
  const theme = useCanvasStore((s) => s.theme);
  // подписка ради перерендера при смене языка
  useCanvasStore((s) => s.lang);
  const pal = plotPalettes[theme];
  const color = pal.series[0];

  const X = (x: number) => PL + ((x - sample.xmin) / (sample.xmax - sample.xmin)) * (VW - PL - PR);
  const Y = (y: number) =>
    VH - PB - ((y - sample.ymin) / (sample.ymax - sample.ymin)) * (VH - PT - PB);

  let d = '';
  sample.ys.forEach((y, k) => {
    if (typeof y !== 'number' || !isFinite(y)) return;
    d += `${d ? 'L' : 'M'}${X(sample.xs[k]).toFixed(1)},${Y(y).toFixed(1)}`;
  });

  const zeroY = sample.ymin < 0 && sample.ymax > 0 ? Y(0) : null;
  const f = (v: number) => {
    if (v === 0) return '0';
    const a = Math.abs(v);
    if (a >= 1000 || a < 0.01) return v.toExponential(0);
    return String(Number(v.toPrecision(3)));
  };

  return (
    <svg
      viewBox={`0 0 ${VW} ${VH}`}
      className="w-full max-w-[420px] h-auto rounded-lg border border-[var(--line)]"
      style={{ background: pal.svgBg }}
      role="img"
      aria-label={t('mini.aria', { label: sample.label, lo: f(sample.ymin), hi: f(sample.ymax) })}
    >
      {/* нулевая ось */}
      {zeroY !== null && (
        <line x1={PL} y1={zeroY} x2={VW - PR} y2={zeroY} stroke={pal.axis} strokeWidth={1} />
      )}
      <rect
        x={PL}
        y={PT}
        width={VW - PL - PR}
        height={VH - PT - PB}
        fill="none"
        stroke={pal.frame}
      />
      {d ? <path d={d} fill="none" stroke={color} strokeWidth={2} /> : null}
      {/* подпись серии + диапазон */}
      <circle cx={PL + 8} cy={PT + 10} r={3} fill={color} />
      <text x={PL + 16} y={PT + 13} fontSize={10} fill={pal.legend}>
        {sample.label.length > 30 ? sample.label.slice(0, 30) + '…' : sample.label}
      </text>
      <text x={PL} y={VH - 6} fontSize={9} fill={pal.tick}>
        {f(sample.xmin)}
      </text>
      <text x={VW - PR} y={VH - 6} fontSize={9} fill={pal.tick} textAnchor="end">
        {f(sample.xmax)}
      </text>
      <text x={PL - 4} y={PT + 10} fontSize={9} fill={pal.tick} textAnchor="end">
        {f(sample.ymax)}
      </text>
      <text x={PL - 4} y={VH - PB} fontSize={9} fill={pal.tick} textAnchor="end">
        {f(sample.ymin)}
      </text>
    </svg>
  );
}

export default memo(MiniPlot);
