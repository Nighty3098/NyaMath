import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { compilePlotExpr, evaluateLine, preprocessJ, preprocessRanges } from '../engine/mathEngine';
import { parseUnitScale } from '../engine/unitScale';
import type { EvalFunction } from 'mathjs';
import { useDocScope } from './useDocScope';
import { useCanvasStore } from '../store/canvasStore';
import { plotPalettes } from '../theme';
import { t } from '../i18n';
import type { MathBlockData } from '../engine/dependencies';
import { useRegionDrag, useRegionResize } from './useRegionDrag';
import { IGrip, ISave, ITable, ITune, IWarn, IX } from './Icon';
import {
  columnsToCsv,
  copyTextToClipboard,
  downloadTextFile,
  exportSvgElementToFile,
  exportSvgElementToPng,
  safeFilename,
} from '../lib/exportFiles';
import { plotBlockToCode } from '../lib/plotCode';
import { formatTick as fmtTick, logTicks, niceTicks } from '../lib/plotTicks';
import { arrowsFromValue, fieldArrows, type ArrowDatum } from '../engine/vectorPlot';

const W = 460;
const H = 300;
const PAD_L = 52;
const PAD_R = 12;
const PAD_T = 10;
const PAD_B = 30;
const N_PTS = 240;
const MAX_BARS = 48;
/** Стартовая оценка высоты шапки — точное значение замеряем (см. chromeH ниже) */
const HEAD = 112;

interface Series {
  expr: string;
  color: string;
  d: string;
  dashed?: boolean;
  /** Прямоугольники столбцов (bar) в SVG-координатах */
  bars?: { x: number; y: number; w: number; h: number }[];
  /** Стебли (stem): отрезки от базы до точки + маркеры */
  stems?: { x1: number; y1: number; x2: number; y2: number }[];
  /** Стрелки (arrow/field) в SVG-координатах: из (x1,y1) в (x2,y2) */
  arrows?: { x1: number; y1: number; x2: number; y2: number }[];
  /** Усы погрешностей ±err */
  errs?: { x1: number; y1: number; x2: number; y2: number; cx: number; cy: number }[];
}

interface PolarGrid {
  cx: number;
  cy: number;
  R: number;
  maxR: number;
}

/** Сырые точки серий (для CSV-экспорта) */
interface RawRow {
  expr: string;
  xs: number[];
  ys: number[];
  es: (number | null)[];
}

function PlotBlockView({ block, scale }: { block: MathBlockData; scale: number }) {
  const removeBlock = useCanvasStore((s) => s.removeBlock);
  const boxRef = useRef<HTMLDivElement>(null);
  const headRef = useRef<HTMLDivElement>(null);
  const footRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [optsOpen, setOptsOpen] = useState(false);
  // Show Code (MATLAB-паттерн): настройки графика текстом + дублирование 1:1
  const [codeOpen, setCodeOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  // Высота всего хрома (шапка + подпись под графиком) — измеряем, как в SimBlockView:
  // магическая константа врала, и между графиком и низом блока оставался зазор.
  // +12: offsetHeight не включает схлопнувшиеся наружу маргины.
  const [chromeH, setChromeH] = useState(HEAD);
  const { onGripDown, onGripMove, onGripUp } = useRegionDrag(block.id, scale, false);
  const { onResizeDown, onResizeMove, onResizeUp } = useRegionResize(block.id, scale, boxRef, {
    height: true,
    minW: 320,
    maxW: 1200,
    minH: 300,
    maxH: 1400,
  });
  const updatePlot = useCanvasStore((s) => s.updatePlot);
  const duplicatePlot = useCanvasStore((s) => s.duplicatePlot);
  const select = useCanvasStore((s) => s.select);
  const toggleSelect = useCanvasStore((s) => s.toggleSelect);
  const selectedIds = useCanvasStore((s) => s.selectedIds);
  const blocks = useCanvasStore((s) => s.blocks);
  const theme = useCanvasStore((s) => s.theme);
  const palBase = plotPalettes[theme];
  // подписка ради перерендера при смене языка
  useCanvasStore((s) => s.lang);

  const fnText = block.plotFn ?? 'sin(x)';
  const xmin = block.plotXmin ?? -10;
  const xmax = block.plotXmax ?? 10;
  const proj = block.plotProj === 'polar' ? 'polar' : 'xy';
  const trace =
    block.plotTrace === 'bar' ||
    block.plotTrace === 'stem' ||
    block.plotTrace === 'arrow' ||
    block.plotTrace === 'field'
      ? block.plotTrace
      : 'line';
  const isField = trace === 'field' && proj === 'xy';
  const isArrow = trace === 'arrow' && proj === 'xy';
  const fieldYmin = block.plotYmin ?? -5;
  const fieldYmax = block.plotYmax ?? 5;
  const logx = block.plotLogx === true;
  const errText = (block.plotErr ?? '').trim();
  const title = (block.plotTitle ?? '').trim();
  const xLabel = (block.plotXLabel ?? '').trim();
  const yLabel = (block.plotYLabel ?? '').trim();
  // Единицы оси: значение = тик / scale; подпись оси дополняется единицей.
  const xU = parseUnitScale(block.plotXUnit ?? '');
  const yU = parseUnitScale(block.plotYUnit ?? '');
  const xUnitRaw = (block.plotXUnit ?? '').trim();
  const yUnitRaw = (block.plotYUnit ?? '').trim();
  const xAxisLabel = xUnitRaw ? (xLabel ? `${xLabel}, ${xUnitRaw}` : xUnitRaw) : xLabel;
  const yAxisLabel = yUnitRaw ? (yLabel ? `${yLabel}, ${yUnitRaw}` : yUnitRaw) : yLabel;
  const unitBad = (!xU.ok && xUnitRaw !== '') || (!yU.ok && yUnitRaw !== '');
  const showGrid = block.plotGrid ?? true;
  const showLegend = block.plotLegend ?? true;
  const paper = block.plotPaper === true;
  // Вторая ось Y: только xy; в polar места под правую шкалу нет — игнорируем.
  const y2Text = proj === 'xy' ? (block.plotY2Fn ?? '').trim() : '';
  const y2Label = (block.plotY2Label ?? '').trim();
  // Публикационный стиль: своя палитра поверх темы (белый фон, чёрные оси).
  const pal = paper
    ? {
        ...palBase,
        svgBg: '#ffffff',
        grid: '#d4d4d4',
        tick: '#111111',
        axis: '#000000',
        frame: '#000000',
        legend: '#000000',
      }
    : palBase;
  const tickFont = paper ? 'Georgia, "Times New Roman", serif' : undefined;
  // При активной Y2 расширяем правое поле под тики второй шкалы.
  const padR = y2Text ? 46 : PAD_R;
  const padT = title ? 26 : PAD_T;
  // Ручной размер: ширина/высота области графика (шапка +chromeH)
  const pw = block.w ?? W;
  const ph = Math.max(180, (block.h ?? H + chromeH) - chromeH);
  // Координата X: линейная или логарифмическая (Bode). Для logx xmin>0.
  const geom = useMemo(
    () => ({
      X: (x: number) =>
        logx
          ? PAD_L + (Math.log(x / xmin) / Math.log(xmax / xmin)) * (pw - PAD_L - padR)
          : PAD_L + ((x - xmin) / (xmax - xmin)) * (pw - PAD_L - padR),
      xAt: (k: number): number => {
        const tt = k / (N_PTS - 1);
        return logx ? xmin * Math.pow(xmax / xmin, tt) : xmin + (xmax - xmin) * tt;
      },
    }),
    [xmin, xmax, pw, logx, padR],
  );
  const X = geom.X;
  const xAt = geom.xAt;
  // Scope последнего пересчёта стора (#2): без повторного recalculateAll.
  const base = useDocScope(blocks);

  const {
    series,
    ymin,
    ymax,
    err,
    xticks,
    yticks,
    polar,
    raw: table,
  } = useMemo(() => {
    const fail = (e: string) => ({
      series: [] as Series[],
      ymin: -1,
      ymax: 1,
      err: e,
      xticks: [] as number[],
      yticks: [] as number[],
      polar: null as PolarGrid | null,
      raw: [] as RawRow[],
    });
    try {
      const exprs = fnText
        .split(/[;\n]/)
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 5);
      if (!exprs.length) return fail(t('p2.empty'));
      if (!(xmin < xmax)) return fail(t('p2.needRange'));
      if (logx && !(xmin > 0)) return fail(t('p2.logxRange'));

      // Выражения компилируем один раз (а не parse на каждую из 240 точек);
      // точки гоняем через общий scope-объект. Некомпилируемое → null-точки.
      const compiledCache = new Map<string, EvalFunction | null>();
      const evalScope = { ...base };
      const evalAt = (expr: string, x: number): unknown => {
        let code = compiledCache.get(expr);
        if (code === undefined) {
          const cc = compilePlotExpr(preprocessRanges(`(${preprocessJ(expr, false)})`));
          code = cc ? cc.code : null;
          compiledCache.set(expr, code);
        }
        if (!code) throw new Error('no-data');
        evalScope.x = x;
        return code.evaluate(evalScope);
      };
      const numOf = (v: unknown): number | null => {
        if (typeof v === 'number' && isFinite(v)) return v;
        if (v !== null && typeof v === 'object' && 're' in (v as object)) {
          const re = Number((v as { re: number }).re);
          return isFinite(re) ? re : null;
        }
        return null;
      };

      // Векторные стили: стрелки из начала координат (arrow) и векторное поле (field).
      if (isArrow || isField) {
        const yMap = (lo: number, hi: number) => (y: number) =>
          ph - PAD_B - ((y - lo) / (hi - lo)) * (ph - padT - PAD_B);

        if (isField) {
          if (!(fieldYmin < fieldYmax)) return fail(t('p2.needRange'));
          const outF: Series[] = [];
          const rawF: RawRow[] = [];
          exprs.forEach((expr, si) => {
            const arr = fieldArrows(
              expr,
              base,
              { xmin, xmax, ymin: fieldYmin, ymax: fieldYmax },
              numOf,
            );
            if (!arr) return;
            const Y = yMap(fieldYmin, fieldYmax);
            const arrows = arr.map((a) => ({
              x1: X(a.x),
              y1: Y(a.y),
              x2: X(a.x + a.dx),
              y2: Y(a.y + a.dy),
            }));
            outF.push({
              expr,
              color: pal.series[si % pal.series.length],
              d: '',
              arrows,
            });
            rawF.push({
              expr,
              xs: arr.map((a) => a.x),
              ys: arr.map((a) => Math.hypot(a.dx, a.dy)),
              es: arr.map(() => null),
            });
          });
          if (!outF.length) return fail(t('p2.noData'));
          return {
            series: outF,
            ymin: fieldYmin,
            ymax: fieldYmax,
            err: null as string | null,
            xticks: niceTicks(xmin, xmax),
            yticks: niceTicks(fieldYmin, fieldYmax),
            polar: null as PolarGrid | null,
            raw: rawF,
          };
        }

        const dsets: { expr: string; arrows: ArrowDatum[] }[] = [];
        let ok = true;
        for (const expr of exprs) {
          let v: unknown = null;
          try {
            v = evaluateLine(`(${preprocessJ(expr, false)})`, base).value;
          } catch {
            v = null;
          }
          const arr = arrowsFromValue(v, numOf);
          if (!arr) {
            ok = false;
            break;
          }
          dsets.push({ expr, arrows: arr });
        }
        if (ok && dsets.length) {
          const pts = dsets.flatMap((d) => d.arrows);
          let lo = Math.min(0, ...pts.map((a) => Math.min(0, a.dy)));
          let hi = Math.max(0, ...pts.map((a) => Math.max(0, a.dy)));
          if (lo === hi) {
            lo -= 1;
            hi += 1;
          }
          const span = hi - lo;
          lo -= span * 0.12;
          hi += span * 0.12;
          const Y = yMap(lo, hi);
          const outA: Series[] = [];
          const rawA: RawRow[] = [];
          dsets.forEach((dset, si) => {
            const arrows = dset.arrows.map((a) => ({
              x1: X(a.x),
              y1: Y(a.y),
              x2: X(a.x + a.dx),
              y2: Y(a.y + a.dy),
            }));
            outA.push({
              expr: dset.expr,
              color: pal.series[si % pal.series.length],
              d: '',
              arrows,
            });
            rawA.push({
              expr: dset.expr,
              xs: dset.arrows.map((a) => a.dx),
              ys: dset.arrows.map((a) => a.dy),
              es: dset.arrows.map(() => null),
            });
          });
          return {
            series: outA,
            ymin: lo,
            ymax: hi,
            err: null as string | null,
            xticks: niceTicks(xmin, xmax),
            yticks: niceTicks(lo, hi),
            polar: null as PolarGrid | null,
            raw: rawA,
          };
        }
        // значение не подходит под вектор → обычная линия ниже
      }

      const allY: number[] = [];
      const raw: RawRow[] = [];
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
              xs.push(xAt(k));
              ys.push(y0);
            }
          }
        } else {
          for (let k = 0; k < N_PTS; k++) {
            const x = xAt(k);
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

      if (!allY.length)
        return {
          ...fail(t('p2.noData')),
          series: raw.map((r): Series => ({ expr: r.expr, color: '', d: '', dashed: true })),
          raw,
        };
      let lo = Math.min(...allY);
      let hi = Math.max(...allY);
      if (lo === hi) {
        lo -= 1;
        hi += 1;
      }
      const span = hi - lo;
      lo -= span * 0.12;
      hi += span * 0.12;

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
        if (!(maxR > 0))
          return {
            ...fail(t('p2.noData')),
            series: raw.map((r): Series => ({ expr: r.expr, color: '', d: '', dashed: true })),
            raw,
          };
        const cx = PAD_L + (pw - PAD_L - PAD_R) / 2;
        const cy = padT + (ph - padT - PAD_B) / 2;
        const R = (Math.min(pw - PAD_L - PAD_R, ph - padT - PAD_B) / 2 - 8) / maxR;
        polarInfo = { cx, cy, R, maxR };
        const P = (th: number, r: number): [number, number] => [
          cx + r * Math.cos(th) * R,
          cy - r * Math.sin(th) * R,
        ];
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
        return {
          series: out,
          ymin: -maxR,
          ymax: maxR,
          err: null as string | null,
          xticks: [],
          yticks: [],
          polar: polarInfo,
          raw,
        };
      }

      // декартова проекция
      const baseY = lo < 0 && hi > 0 ? 0 : lo >= 0 ? lo : hi;
      raw.forEach((r, si) => {
        const color = pal.series[si % pal.series.length];
        if (!r.xs.length) {
          out.push({ expr: r.expr, color, d: '', dashed: true });
          return;
        }
        const idxMode =
          r.xs[0] === 0 && r.xs[r.xs.length - 1] === r.xs.length - 1 && r.xs.length !== N_PTS;
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
            bars.push({
              x: cx - bw / 2,
              y: Math.min(yBase, yTop),
              w: bw,
              h: Math.abs(yTop - yBase),
            });
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
      return {
        series: out,
        ymin: lo,
        ymax: hi,
        err: null as string | null,
        xticks: logx ? logTicks(xmin, xmax) : niceTicks(xmin, xmax),
        yticks: niceTicks(lo, hi),
        polar: null,
        raw,
      };
    } catch (e) {
      return fail(e instanceof Error ? e.message : String(e));
    }
  }, [fnText, xmin, xmax, proj, trace, errText, logx, base, pw, ph, padT, pal, X, xAt, isArrow, isField, fieldYmin, fieldYmax]);

  const Y = (y: number) => ph - PAD_B - ((y - ymin) / (ymax - ymin)) * (ph - padT - PAD_B);

  /**
   * Вторая ось Y (P1 multi-axis): `plotY2Fn(x)` со своей правой шкалой.
   * Семплируем тем же шагом xAt; пунктир отличает серию визуально.
   */
  const y2 = useMemo(() => {
    if (!y2Text) return null;
    try {
      const compiled = compilePlotExpr(preprocessRanges(`(${preprocessJ(y2Text, false)})`));
      if (!compiled?.code) return null;
      const evalScope: Record<string, unknown> = { ...base };
      const xs: number[] = [];
      const ys: number[] = [];
      const hasX = /\bx\b/.test(preprocessJ(y2Text, false));
      if (!hasX) {
        let v: unknown = null;
        try {
          v = evaluateLine(`(${preprocessJ(y2Text, false)})`, base).value;
        } catch {
          v = null;
        }
        const y0 = typeof v === 'number' && isFinite(v) ? v : null;
        if (y0 === null) return null;
        for (let k = 0; k < N_PTS; k++) {
          xs.push(xAt(k));
          ys.push(y0);
        }
      } else {
        for (let k = 0; k < N_PTS; k++) {
          const x = xAt(k);
          let y: number | null = null;
          try {
            evalScope.x = x;
            const vv = compiled.code.evaluate(evalScope) as unknown;
            if (typeof vv === 'number' && isFinite(vv)) y = vv;
            else if (vv !== null && typeof vv === 'object' && 're' in (vv as object)) {
              const re = Number((vv as { re: number }).re);
              if (isFinite(re)) y = re;
            }
          } catch {
            y = null;
          }
          xs.push(x);
          ys.push(y ?? NaN);
        }
      }
      const fin = ys.filter((v) => isFinite(v));
      if (!fin.length) return null;
      let lo = Math.min(...fin);
      let hi = Math.max(...fin);
      if (lo === hi) {
        lo -= 1;
        hi += 1;
      }
      const span = hi - lo;
      lo -= span * 0.12;
      hi += span * 0.12;
      const Y2 = (y: number) => ph - PAD_B - ((y - lo) / (hi - lo)) * (ph - padT - PAD_B);
      let d = '';
      xs.forEach((x, k) => {
        const y = ys[k];
        if (!isFinite(y)) return;
        d += `${d ? 'L' : 'M'}${X(x).toFixed(1)},${Y2(y as number).toFixed(1)}`;
      });
      if (!d) return null;
      return {
        d,
        ticks: niceTicks(lo, hi),
        Y2,
        color: pal.series[series.length % pal.series.length] ?? '#c026d3',
      };
    } catch {
      return null;
    }
  }, [y2Text, base, xAt, X, ph, padT, pal, series.length]);

  useEffect(() => {
    const measure = () => {
      setChromeH((headRef.current?.offsetHeight ?? 0) + (footRef.current?.offsetHeight ?? 0) + 12);
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (headRef.current) ro.observe(headRef.current);
    if (footRef.current) ro.observe(footRef.current);
    return () => ro.disconnect();
  }, [optsOpen, theme, title, err]);
  const selected = selectedIds.includes(block.id);
  const baseName = safeFilename(title || fnText, 'plot');

  /** PNG снимок отрендеренного SVG (×2) */
  const doExportPng = () => {
    if (!svgRef.current) {
      alert(t('p2.noData'));
      return;
    }
    void exportSvgElementToPng(svgRef.current, `${baseName}.png`).catch(() =>
      alert(t('p2.noData')),
    );
  };

  /** CSV: x + по колонке y на серию (дырки — пустые ячейки) */
  const doExportCsv = () => {
    if (!table.length) {
      alert(t('p2.noData'));
      return;
    }
    const headers = ['x', ...table.map((s) => `y(${s.expr})`)];
    const num = (v: number | undefined): number | null =>
      typeof v === 'number' && isFinite(v) ? v : null;
    const columns: (number | null)[][] = [table[0]?.xs.map(num) ?? []];
    for (const s of table) columns.push(s.ys.map(num));
    downloadTextFile(`${baseName}.csv`, columnsToCsv(headers, columns), 'text/csv;charset=utf-8');
  };

  /** SVG для статьи: standalone-вектор без артефактов (вставка в LaTeX/Word). */
  const doExportSvg = () => {
    if (!svgRef.current) {
      alert(t('p2.noData'));
      return;
    }
    try {
      exportSvgElementToFile(svgRef.current, `${baseName}.svg`);
    } catch {
      alert(t('p2.noData'));
    }
  };
  const zeroY = proj === 'xy' && ymin < 0 && ymax > 0 ? Y(0) : null;
  const zeroX = proj === 'xy' && xmin < 0 && xmax > 0 ? X(0) : null;
  const svgW = pw - 24;
  const legY = padT + 12;

  const renderErrors = (
    list: NonNullable<Series['errs']> | undefined,
    color: string,
    key: string | number,
  ) => {
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
    <div
      ref={boxRef}
      className="absolute z-10"
      style={{ left: block.x, top: block.y, width: pw, height: err ? 'auto' : ph + chromeH }}
      data-visibility={block.visibility ?? 'show'}
    >
      <div
        data-block-id={block.id}
        className={`nya-block relative w-full h-full rounded-xl px-3 py-2 flex flex-col bg-[var(--sheet)] group ${
          selected ? 'outline outline-2 outline-offset-2 outline-[var(--accent-line)]' : ''
        }`}
        onClick={(e) => {
          e.stopPropagation();
          if (e.shiftKey) toggleSelect(block.id);
          else select(block.id);
        }}
      >
        <div ref={headRef}>
          <div
            className="flex items-center gap-2 mb-1 cursor-grab active:cursor-grabbing select-none print:hidden"
            onPointerDown={onGripDown}
            onPointerMove={onGripMove}
            onPointerUp={onGripUp}
            onPointerCancel={onGripUp}
            onDoubleClick={(e) => e.stopPropagation()}
          >
            <span className="text-[var(--faint)] inline-flex" aria-hidden="true">
              <IGrip />
            </span>
            <span className="text-[11px] uppercase tracking-wider text-[var(--accent-ink)]">
              plot
            </span>
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
              className="p-1.5 text-[var(--faint)] hover:text-[var(--accent-line)] cursor-pointer"
              onClick={(e) => {
                e.stopPropagation();
                doExportCsv();
              }}
              onPointerDown={(e) => e.stopPropagation()}
              title={t('p2.csv')}
              aria-label={t('p2.csv')}
            >
              <ITable />
            </button>
            <button
              type="button"
              className="p-1.5 text-[var(--faint)] hover:text-[var(--accent-line)] cursor-pointer"
              onClick={(e) => {
                e.stopPropagation();
                doExportSvg();
              }}
              onPointerDown={(e) => e.stopPropagation()}
              title={t('p2.svg')}
              aria-label={t('p2.svg')}
            >
              <ITune />
            </button>
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
          <div className="flex items-center gap-1.5 text-[12px] text-[var(--ink-soft)] mb-1 flex-wrap print:hidden">
            <button
              type="button"
              className="inline-flex items-center gap-1 min-h-[28px] px-2 rounded-lg cursor-pointer transition-colors duration-150 ease-out active:scale-[0.97]"
              style={{
                background: optsOpen ? 'var(--accent-soft)' : 'transparent',
                color: optsOpen ? 'var(--accent-ink)' : 'inherit',
              }}
              aria-expanded={optsOpen}
              aria-controls={`plot-opts-${block.id}`}
              onClick={(e) => {
                e.stopPropagation();
                setOptsOpen((v) => !v);
              }}
              onPointerDown={(e) => e.stopPropagation()}
              title={t('p2.moreOptions')}
            >
              <ITune />
              <span className="hidden sm:inline">{t('p2.options')}</span>
            </button>
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
              {proj === 'polar'
                ? `r ≤ ${fmtTick(polar?.maxR ?? ymax)}`
                : `y ∈ [${fmtTick(ymin)}, ${fmtTick(ymax)}]`}
            </span>
          </div>
          {optsOpen && (
            <div
              id={`plot-opts-${block.id}`}
              className="flex items-center gap-2 text-[12px] text-[var(--ink-soft)] mb-1 flex-wrap print:hidden"
            >
              <label title={t('p2.proj')}>
                {t('p2.proj')}{' '}
                <select
                  aria-label={t('p2.proj')}
                  className="min-h-[32px] bg-[var(--input-bg)] border border-[var(--input-border)] rounded-lg px-1 text-[var(--ink)]"
                  value={proj}
                  onChange={(e) =>
                    updatePlot(block.id, { plotProj: e.target.value as 'xy' | 'polar' })
                  }
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
                    onChange={(e) =>
                      updatePlot(block.id, {
                        plotTrace: e.target.value as 'line' | 'bar' | 'stem' | 'arrow' | 'field',
                      })
                    }
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <option value="line">{t('p2.traceLine')}</option>
                    <option value="bar">{t('p2.traceBar')}</option>
                    <option value="stem">{t('p2.traceStem')}</option>
                    <option value="arrow">{t('p2.traceArrow')}</option>
                    <option value="field">{t('p2.traceField')}</option>
                  </select>
                </label>
              )}
              {isField && (
                <>
                  <label title={t('p2.fieldY')}>
                    ymin{' '}
                    <input
                      type="number"
                      aria-label={t('p2.fieldY')}
                      className="w-[70px] min-h-[32px] bg-[var(--input-bg)] border border-[var(--input-border)] rounded-lg px-1.5 text-[var(--ink)] select-text"
                      value={fieldYmin}
                      onChange={(e) => updatePlot(block.id, { plotYmin: Number(e.target.value) })}
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </label>
                  <label title={t('p2.fieldY')}>
                    ymax{' '}
                    <input
                      type="number"
                      aria-label={t('p2.fieldY')}
                      className="w-[70px] min-h-[32px] bg-[var(--input-bg)] border border-[var(--input-border)] rounded-lg px-1.5 text-[var(--ink)] select-text"
                      value={fieldYmax}
                      onChange={(e) => updatePlot(block.id, { plotYmax: Number(e.target.value) })}
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </label>
                </>
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
              {proj === 'xy' && (
                <label
                  title={t('p2.logx')}
                  className="inline-flex items-center gap-1 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    className="w-4 h-4 accent-current"
                    checked={logx}
                    aria-label={t('p2.logx')}
                    onChange={(e) => updatePlot(block.id, { plotLogx: e.target.checked })}
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => e.stopPropagation()}
                  />
                  {t('p2.logx')}
                </label>
              )}
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
              <label className="inline-flex items-center gap-1 cursor-pointer">
                <input
                  type="checkbox"
                  className="w-4 h-4 accent-current"
                  checked={paper}
                  aria-label={t('p2.paper')}
                  onChange={(e) => updatePlot(block.id, { plotPaper: e.target.checked })}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => e.stopPropagation()}
                />
                {t('p2.paper')}
              </label>
              <label className="flex-1 min-w-[160px]" title={t('p2.y2Title')}>
                {t('p2.y2')}{' '}
                <input
                  className="w-full max-w-[220px] min-h-[32px] bg-[var(--input-bg)] border border-[var(--input-border)] rounded-lg px-1.5 text-[var(--ink)] select-text"
                  value={block.plotY2Fn ?? ''}
                  placeholder="0.001*sin(x)"
                  aria-label={t('p2.y2')}
                  onChange={(e) => updatePlot(block.id, { plotY2Fn: e.target.value })}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => e.stopPropagation()}
                  spellCheck={false}
                />
              </label>
              <label title={t('p2.y2labelTitle')}>
                {t('p2.y2label')}{' '}
                <input
                  className="w-[80px] min-h-[32px] bg-[var(--input-bg)] border border-[var(--input-border)] rounded-lg px-1.5 text-[var(--ink)] select-text"
                  value={block.plotY2Label ?? ''}
                  placeholder="y2"
                  aria-label={t('p2.y2label')}
                  onChange={(e) => updatePlot(block.id, { plotY2Label: e.target.value })}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => e.stopPropagation()}
                  spellCheck={false}
                />
              </label>
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
              <label title={t('p2.xUnit')}>
                <input
                  className="w-[64px] min-h-[32px] bg-[var(--input-bg)] border border-[var(--input-border)] rounded-lg px-1.5 text-[var(--ink)] select-text"
                  value={xUnitRaw}
                  placeholder={t('p2.xUnit')}
                  aria-label={t('p2.xUnit')}
                  onChange={(e) => updatePlot(block.id, { plotXUnit: e.target.value })}
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
              <label title={t('p2.yUnit')}>
                <input
                  className="w-[64px] min-h-[32px] bg-[var(--input-bg)] border border-[var(--input-border)] rounded-lg px-1.5 text-[var(--ink)] select-text"
                  value={yUnitRaw}
                  placeholder={t('p2.yUnit')}
                  aria-label={t('p2.yUnit')}
                  onChange={(e) => updatePlot(block.id, { plotYUnit: e.target.value })}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => e.stopPropagation()}
                  spellCheck={false}
                />
              </label>
              <button
                type="button"
                className="inline-flex items-center gap-1 min-h-[32px] px-2 rounded-lg cursor-pointer"
                style={{
                  background: codeOpen ? 'var(--accent-soft)' : 'transparent',
                  color: codeOpen ? 'var(--accent-ink)' : 'inherit',
                }}
                aria-expanded={codeOpen}
                onClick={(e) => {
                  e.stopPropagation();
                  setCodeOpen((v) => !v);
                }}
                onPointerDown={(e) => e.stopPropagation()}
                title={t('p2.codeHint')}
              >
                {'</>'}
                <span className="hidden sm:inline">{t('p2.showCode')}</span>
              </button>
            </div>
          )}
          {codeOpen && (
            <div className="mb-1 rounded-lg border border-[var(--line)] bg-[var(--input-bg)] p-2 print:hidden">
              <pre
                className="max-h-[140px] overflow-auto whitespace-pre-wrap text-[11px] leading-5 text-[var(--ink)] select-text"
                title={t('p2.codeHint')}
              >
                {plotBlockToCode(block, useCanvasStore.getState().lang)}
              </pre>
              <div className="mt-1.5 flex items-center gap-2">
                <button
                  type="button"
                  className="min-h-[32px] px-2.5 rounded-lg bg-[var(--accent-soft)] text-[var(--accent-ink)] text-[12px] cursor-pointer"
                  onClick={(e) => {
                    e.stopPropagation();
                    void copyTextToClipboard(
                      plotBlockToCode(block, useCanvasStore.getState().lang),
                    ).then((ok) => {
                      if (ok) {
                        setCopied(true);
                        setTimeout(() => setCopied(false), 1600);
                      }
                    });
                  }}
                  onPointerDown={(e) => e.stopPropagation()}
                >
                  {copied ? t('p2.copied') : t('p2.copyCode')}
                </button>
                <button
                  type="button"
                  className="min-h-[32px] px-2.5 rounded-lg border border-[var(--line)] text-[12px] text-[var(--ink-soft)] cursor-pointer"
                  onClick={(e) => {
                    e.stopPropagation();
                    duplicatePlot(block.id);
                  }}
                  onPointerDown={(e) => e.stopPropagation()}
                  title={t('p2.duplicate')}
                >
                  {t('p2.duplicate')}
                </button>
              </div>
            </div>
          )}
          {/* заголовок для печати (контролы выше скрыты в print) */}
          <div className="hidden print:block text-[13px] font-medium text-[var(--ink)] mb-1">
            {title || fnText}
          </div>
        </div>
        {err ? (
          <div className="flex items-center gap-1.5 text-[var(--danger)] text-[12px]" role="alert">
            <IWarn /> {err}
          </div>
        ) : proj === 'polar' && polar ? (
          <svg
            ref={svgRef}
            width={svgW}
            height={ph}
            className="rounded-lg border border-[var(--line)]"
            style={{ background: pal.svgBg }}
            fontFamily={tickFont}
            role="img"
            aria-label={t('p2.aria', {
              fn: fnText,
              lo: fmtTick(-polar.maxR),
              hi: fmtTick(polar.maxR),
              x0: xmin,
              x1: xmax,
            })}
          >
            {title && (
              <text
                x={svgW / 2}
                y={15}
                fontSize={13}
                fontWeight={600}
                fill={pal.legend}
                textAnchor="middle"
              >
                {title}
              </text>
            )}
            {/* полярная сетка: окружности + спицы каждые 30° */}
            {[0.25, 0.5, 0.75, 1].map((f) => (
              <g key={f}>
                <circle
                  cx={polar.cx}
                  cy={polar.cy}
                  r={polar.R * polar.maxR * f}
                  fill="none"
                  stroke={pal.grid}
                  strokeOpacity={pal.gridOpacity}
                />
                <text
                  x={polar.cx + 3}
                  y={polar.cy - polar.R * polar.maxR * f + 10}
                  fontSize={9}
                  fill={pal.tick}
                >
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
                    <line
                      x1={polar.cx}
                      y1={polar.cy}
                      x2={x2}
                      y2={y2}
                      stroke={pal.grid}
                      strokeOpacity={pal.gridOpacity}
                    />
                    <text
                      x={polar.cx + Math.cos(a) * (polar.R * polar.maxR + 10)}
                      y={polar.cy - Math.sin(a) * (polar.R * polar.maxR + 10) + 3}
                      fontSize={9}
                      fill={pal.tick}
                      textAnchor="middle"
                    >
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
                  <line
                    x1={PAD_L + 8}
                    y1={legY + i * 15}
                    x2={PAD_L + 26}
                    y2={legY + i * 15}
                    stroke={s.color}
                    strokeWidth={2.5}
                  />
                  <text x={PAD_L + 30} y={legY + 3 + i * 15} fontSize={10} fill={pal.legend}>
                    {s.expr.length > 34 ? s.expr.slice(0, 34) + '…' : s.expr}
                  </text>
                </g>
              ))}
          </svg>
        ) : (
          <svg
            ref={svgRef}
            width={svgW}
            height={ph}
            className="rounded-lg border border-[var(--line)]"
            style={{ background: pal.svgBg }}
            fontFamily={tickFont}
            role="img"
            aria-label={t('p2.aria', {
              fn: y2 ? `${fnText} | y2: ${y2Text}` : fnText,
              lo: fmtTick(ymin),
              hi: fmtTick(ymax),
              x0: xmin,
              x1: xmax,
            })}
          >
            {title && (
              <text
                x={svgW / 2}
                y={15}
                fontSize={13}
                fontWeight={600}
                fill={pal.legend}
                textAnchor="middle"
              >
                {title}
              </text>
            )}
            {/* сетка + тики */}
            {showGrid &&
              xticks.map((v) => (
                <g key={`x${v}`}>
                  <line
                    x1={X(v)}
                    y1={padT}
                    x2={X(v)}
                    y2={ph - PAD_B}
                    stroke={pal.grid}
                    strokeOpacity={pal.gridOpacity}
                  />
                  <text
                    x={X(v)}
                    y={ph - PAD_B + 14}
                    fontSize={9}
                    fill={pal.tick}
                    textAnchor="middle"
                  >
                    {fmtTick(v / xU.scale)}
                  </text>
                </g>
              ))}
            {showGrid &&
              yticks.map((v) => (
                <g key={`y${v}`}>
                  <line
                    x1={PAD_L}
                    y1={Y(v)}
                    x2={pw - padR}
                    y2={Y(v)}
                    stroke={pal.grid}
                    strokeOpacity={pal.gridOpacity}
                  />
                  <text x={PAD_L - 5} y={Y(v) + 3} fontSize={9} fill={pal.tick} textAnchor="end">
                    {fmtTick(v / yU.scale)}
                  </text>
                </g>
              ))}
            {/* нулевые оси */}
            {zeroY !== null && (
              <line
                x1={PAD_L}
                y1={zeroY}
                x2={pw - padR}
                y2={zeroY}
                stroke={pal.axis}
                strokeWidth={1.2}
              />
            )}
            {zeroX !== null && (
              <line
                x1={zeroX}
                y1={padT}
                x2={zeroX}
                y2={ph - PAD_B}
                stroke={pal.axis}
                strokeWidth={1.2}
              />
            )}
            {/* рамка */}
            <rect
              x={PAD_L}
              y={padT}
              width={pw - PAD_L - padR}
              height={ph - padT - PAD_B}
              fill="none"
              stroke={pal.frame}
            />
            {/* вторая ось Y: пунктирная серия + правая шкала */}
            {y2 && (
              <g>
                <line
                  x1={pw - padR}
                  y1={padT}
                  x2={pw - padR}
                  y2={ph - PAD_B}
                  stroke={pal.axis}
                  strokeWidth={1.2}
                />
                {y2.ticks.map((v) => (
                  <g key={`y2-${v}`}>
                    <line
                      x1={pw - padR}
                      y1={y2.Y2(v)}
                      x2={pw - padR + 4}
                      y2={y2.Y2(v)}
                      stroke={pal.axis}
                    />
                    <text
                      x={pw - padR + 6}
                      y={y2.Y2(v) + 3}
                      fontSize={9}
                      fill={y2.color}
                      textAnchor="start"
                    >
                      {fmtTick(v)}
                    </text>
                  </g>
                ))}
                <path d={y2.d} fill="none" stroke={y2.color} strokeWidth={2} strokeDasharray="6 3" />
              </g>
            )}
            {series.map((s, i) =>
              s.d ? <path key={i} d={s.d} fill="none" stroke={s.color} strokeWidth={2} /> : null,
            )}
            {series.map((s, i) =>
              s.bars?.length ? (
                <g key={`b${i}`} fill={s.color} opacity={0.85}>
                  {s.bars.map((b, k) => (
                    <rect
                      key={k}
                      x={b.x}
                      y={b.y}
                      width={Math.max(1, b.w)}
                      height={Math.max(1, b.h)}
                    />
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
                    <circle
                      key={`m${k}`}
                      cx={st.x2}
                      cy={st.y2}
                      r={2.5}
                      fill={s.color}
                      stroke="none"
                    />
                  ))}
                </g>
              ) : null,
            )}
            {series.map((s, i) =>
              s.arrows?.length ? (
                <g key={`a${i}`} stroke={s.color} strokeWidth={1.6} fill={s.color}>
                  {s.arrows.map((a, k) => {
                    const ang = Math.atan2(a.y2 - a.y1, a.x2 - a.x1);
                    const h = 7;
                    const p2 = `${a.x2 - h * Math.cos(ang - 0.4)},${a.y2 - h * Math.sin(ang - 0.4)}`;
                    const p3 = `${a.x2 - h * Math.cos(ang + 0.4)},${a.y2 - h * Math.sin(ang + 0.4)}`;
                    return (
                      <g key={k}>
                        <line x1={a.x1} y1={a.y1} x2={a.x2} y2={a.y2} />
                        <polygon points={`${a.x2},${a.y2} ${p2} ${p3}`} stroke="none" />
                      </g>
                    );
                  })}
                </g>
              ) : null,
            )}
            {series.map((s, i) => renderErrors(s.errs, s.color, i))}
            {/* подписи осей */}
            {xAxisLabel && (
              <text x={pw - padR} y={ph - 4} fontSize={10} fill={pal.tick} textAnchor="end">
                {xAxisLabel}
              </text>
            )}
            {yAxisLabel && (
              <text
                x={12}
                y={padT + 4}
                fontSize={10}
                fill={pal.tick}
                textAnchor="start"
                transform={`rotate(-90 12 ${padT + 4})`}
              >
                {yAxisLabel}
              </text>
            )}
            {y2 && (y2Label || y2Text) && (
              <text
                x={pw - 4}
                y={padT + 4}
                fontSize={10}
                fill={y2.color}
                textAnchor="end"
                transform={`rotate(90 ${pw - 4} ${padT + 4})`}
              >
                {(y2Label || y2Text).slice(0, 40)}
              </text>
            )}
            {/* легенда */}
            {showLegend &&
              series.map((s, i) => (
                <g key={`l${i}`}>
                  <line
                    x1={PAD_L + 8}
                    y1={legY + i * 15}
                    x2={PAD_L + 26}
                    y2={legY + i * 15}
                    stroke={s.color}
                    strokeWidth={2.5}
                  />
                  <text x={PAD_L + 30} y={legY + 3 + i * 15} fontSize={10} fill={pal.legend}>
                    {s.expr.length > 34 ? s.expr.slice(0, 34) + '…' : s.expr}
                  </text>
                </g>
              ))}
            {showLegend && y2 && (
              <g>
                <line
                  x1={PAD_L + 8}
                  y1={legY + series.length * 15}
                  x2={PAD_L + 26}
                  y2={legY + series.length * 15}
                  stroke={y2.color}
                  strokeWidth={2.5}
                  strokeDasharray="6 3"
                />
                <text
                  x={PAD_L + 30}
                  y={legY + 3 + series.length * 15}
                  fontSize={10}
                  fill={pal.legend}
                >
                  {(y2Label ? `${y2Text} (${y2Label})` : y2Text).slice(0, 34)}
                </text>
              </g>
            )}
          </svg>
        )}
        <div ref={footRef} className="text-[11px] text-[var(--faint)] mt-1 truncate">
          {t('p2.footer', { fn: fnText, x0: xmin, x1: xmax })}
        </div>
        {unitBad && (
          <div
            className="text-[10px] text-[var(--danger)]/80 truncate flex items-center gap-1"
            title={t('p2.badUnit', { u: !xU.ok ? xUnitRaw : yUnitRaw })}
          >
            <IWarn /> {t('p2.badUnit', { u: !xU.ok ? xUnitRaw : yUnitRaw })}
          </div>
        )}
        {/* ручка размера */}
        <span
          className="absolute -right-3 -bottom-3 w-7 h-7 cursor-nwse-resize touch-none select-none"
          title={t('p2.resize')}
          onPointerDown={onResizeDown}
          onPointerMove={onResizeMove}
          onPointerUp={onResizeUp}
          onPointerCancel={onResizeUp}
          onDoubleClick={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        />
      </div>
    </div>
  );
}

export default memo(PlotBlockView);
