import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { useCanvasStore } from '../store/canvasStore';
import { plotPalettes } from '../theme';
import { SIM_DOMAINS, SIM_MODELS, SIM_SOLVERS, getSimModel, simModelPatch, type SimMode, type SimResult, type SimSolver } from '../engine/simEngine';
import type { MathBlockData } from '../engine/dependencies';
import { useRegionDrag, useRegionResize } from './useRegionDrag';
import { IGrip, IResize, IWarn, IX } from './Icon';
import { lx, simDomainName, simSolverName, t } from '../i18n';

const W = 560;
const PH = 300;
const PLAY_SECONDS = 6;

const fmtTick = (v: number) => {
  if (!isFinite(v)) return '—';
  if (v === 0) return '0';
  const a = Math.abs(v);
  if (a >= 10000 || a < 0.001) return v.toExponential(0);
  return String(Number(v.toPrecision(4)));
};

const numField = 'w-[64px] min-h-[32px] bg-[var(--input-bg)] border border-[var(--input-border)] rounded-lg px-1.5 text-[var(--ink)] select-text';
const txtField = 'math-input bg-[var(--input-bg)] border border-[var(--input-border)] rounded-lg px-2 py-0.5 text-[13px] text-[var(--ink)] outline-none focus:border-[var(--accent-line)] select-text';

function SimBlockView({ block, scale }: { block: MathBlockData; scale: number }) {
  const removeBlock = useCanvasStore((s) => s.removeBlock);
  const updateSim = useCanvasStore((s) => s.updateSim);
  const updatePlot = useCanvasStore((s) => s.updatePlot);
  const select = useCanvasStore((s) => s.select);
  const toggleSelect = useCanvasStore((s) => s.toggleSelect);
  const selectedIds = useCanvasStore((s) => s.selectedIds);
  const theme = useCanvasStore((s) => s.theme);
  // подписка ради перерендера при смене языка
  useCanvasStore((s) => s.lang);
  const pal = plotPalettes[theme];

  const boxRef = useRef<HTMLDivElement>(null);
  const headRef = useRef<HTMLDivElement>(null);
  const footRef = useRef<HTMLDivElement>(null);
  const { onGripDown, onGripMove, onGripUp } = useRegionDrag(block.id, scale, false);
  const { onResizeDown, onResizeMove, onResizeUp } = useRegionResize(block.id, scale, boxRef, {
    height: true,
    minW: 380,
    maxW: 1200,
    minH: 300,
    maxH: 2200,
  });

  const modelId = block.simModel ?? 'custom';
  const simMode: SimMode = block.simMode ?? 'ode';
  const [open, setOpen] = useState(modelId === 'custom');
  const [headH, setHeadH] = useState(560);

  const pw = block.w ?? W;
  const ph = Math.max(220, (block.h ?? PH + headH) - headH);
  const selected = selectedIds.includes(block.id);

  /** Правка полей = своя система (привязка к пресету сбрасывается). */
  const edit = (patch: Partial<MathBlockData>) => updateSim(block.id, { simModel: 'custom', ...patch });

  const applyPreset = (id: string) => {
    if (id === 'custom') {
      updateSim(block.id, { simModel: 'custom' });
      setOpen(true);
      return;
    }
    const m = getSimModel(id);
    if (m) updateSim(block.id, simModelPatch(m));
  };

  const states = useMemo(
    () => (block.simStates ?? '').split(',').map((s) => s.trim()).filter(Boolean),
    [block.simStates],
  );
  const model = getSimModel(modelId);

  // Данные для плеера: ODE — ось X + кривые Y; FDTD — кадры поля E(x)
  const view = useMemo(() => {
    const r = block.simResult;
    if (!r || r.error) return null;
    if (r.field) {
      if (r.field.snaps.length < 2) return null;
      return {
        ts: r.field.ts, xs: r.field.xs, curves: [], steps: r.steps, xIsT: false,
        field: r.field, tEst: r.tEst, events: [] as { t: number }[], halted: false,
      };
    }
    if (r.ts.length < 2) return null;
    const xName = block.simX ?? 't';
    const xs = xName === 't' ? r.ts : r.series.find((s) => s.name === xName)?.ys;
    if (!xs) return null;
    const yNames = (block.simY ?? '').split(';').map((s) => s.trim()).filter(Boolean);
    const curves = yNames
      .map((name, i) => {
        const s = r.series.find((sg) => sg.name === name);
        return s ? { name, ys: s.ys, color: pal.series[i % pal.series.length] } : null;
      })
      .filter((c): c is { name: string; ys: number[]; color: string } => c !== null);
    if (!curves.length) return null;
    return { ts: r.ts, xs, curves, steps: r.steps, xIsT: xName === 't', field: null, tEst: null as number | null, events: r.events, halted: r.halted };
  }, [block.simResult, block.simX, block.simY, pal]);

  // Высота всего хрома (шапка + панель плеера под графиком) — измеряем,
  // чтобы внешний бокс не рвался: итог = ph + chromeH.
  // +SLACK: offsetHeight не включает схлопнувшиеся наружу маргины (mt/mb),
  // без запаса низ подрезается на несколько пикселей.
  useEffect(() => {
    const head = headRef.current;
    const foot = footRef.current;
    const measure = () => {
      setHeadH((head?.offsetHeight ?? 0) + (foot?.offsetHeight ?? 0) + 12);
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (head) ro.observe(head);
    if (foot) ro.observe(foot);
    return () => ro.disconnect();
  }, [open, theme, block.error, view === null]);

  const stop = (e: React.SyntheticEvent) => e.stopPropagation();

  return (
    <div ref={boxRef} className="absolute z-10 min-h-fit" style={{ left: block.x, top: block.y, width: pw, height: ph + headH }}>
      <div
        data-block-id={block.id}
        className={`nya-block relative w-full h-full rounded-xl px-3 py-2 flex flex-col bg-[var(--sheet)] shadow-[0_1px_2px_rgba(0,0,0,0.18),0_8px_24px_rgba(0,0,0,0.16)] group ${
          selected ? 'outline outline-2 outline-offset-2 outline-[var(--accent-line)]' : ''
        }`}
        onClick={(e) => {
          e.stopPropagation();
          if (e.shiftKey) toggleSelect(block.id);
          else select(block.id);
        }}
      >
        <div ref={headRef}>
          {/* шапка */}
          <div
            className="flex items-center gap-2 mb-1 cursor-grab active:cursor-grabbing select-none"
            onPointerDown={onGripDown}
            onPointerMove={onGripMove}
            onPointerUp={onGripUp}
            onPointerCancel={onGripUp}
            onDoubleClick={(e) => e.stopPropagation()}
          >
            <span className="text-[var(--faint)] inline-flex" aria-hidden="true"><IGrip /></span>
            <span className="text-[11px] uppercase tracking-wider text-[var(--accent-ink)]">sim</span>
            <label htmlFor={`simmodel-${block.id}`} className="sr-only">{t('sim.preset')}</label>
            <select
              id={`simmodel-${block.id}`}
              className="flex-1 min-h-[32px] bg-[var(--input-bg)] border border-[var(--input-border)] rounded-lg px-1.5 text-[13px] text-[var(--ink)] outline-none focus:border-[var(--accent-line)]"
              value={modelId}
              onChange={(e) => applyPreset(e.target.value)}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
              title={model ? lx(model.desc) : undefined}
            >
              <option value="custom">{t('sim.custom')}</option>
              {SIM_DOMAINS.map((d) => (
                <optgroup key={d} label={simDomainName(d)}>
                  {SIM_MODELS.filter((m) => m.domain === d).map((m) => (
                    <option key={m.id} value={m.id} title={lx(m.desc)}>{lx(m.label)}</option>
                  ))}
                </optgroup>
              ))}
            </select>
            <label htmlFor={`simmode-${block.id}`} className="sr-only">{t('sim.mode')}</label>
            <select
              id={`simmode-${block.id}`}
              className="min-h-[32px] bg-[var(--input-bg)] border border-[var(--input-border)] rounded-lg px-1 text-[13px] text-[var(--ink)] outline-none focus:border-[var(--accent-line)]"
              value={simMode}
              title={t('sim.mode')}
              onChange={(e) => updateSim(block.id, { simMode: e.target.value as SimMode, simModel: 'custom' })}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
            >
              <option value="ode">{t('sim.modeOde')}</option>
              <option value="fdtd">{t('sim.modeFdtd')}</option>
            </select>
            <button
              type="button"
              className="min-h-[32px] px-2 rounded-lg border border-[var(--line)] text-[12px] text-[var(--ink-soft)] hover:border-[var(--accent-line)] hover:text-[var(--ink)] cursor-pointer"
              onClick={(e) => {
                e.stopPropagation();
                setOpen((v) => !v);
              }}
              onPointerDown={(e) => e.stopPropagation()}
              aria-expanded={open}
              title={t('sim.setup')}
            >
              {open ? '▾' : '▸'} {t('sim.setup')}
            </button>
            <button
              type="button"
              className="p-1.5 text-[var(--faint)] hover:text-[var(--danger)] cursor-pointer"
              onClick={() => removeBlock(block.id)}
              onPointerDown={(e) => e.stopPropagation()}
              aria-label={t('sim.delete')}
            >
              <IX />
            </button>
          </div>

          {/* редактор */}
          {open && (
            <div className="flex flex-col gap-1.5 mb-2 text-[12px] text-[var(--ink-soft)]" onClick={stop}>
            {simMode === 'ode' ? (<>
              <div className="flex items-center gap-2 flex-wrap">
                <label className="flex items-center gap-1">
                  {t('sim.states')}
                  <input
                    className={`${txtField} w-[130px] min-h-[32px]`}
                    value={block.simStates ?? ''}
                    placeholder={t('sim.statesPh')}
                    spellCheck={false}
                    onChange={(e) => edit({ simStates: e.target.value })}
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => e.stopPropagation()}
                  />
                </label>
                <label className="flex items-center gap-1 flex-1 min-w-[200px]">
                  {t('sim.init')}
                  <input
                    className={`${txtField} flex-1 min-h-[32px]`}
                    value={block.simInit ?? ''}
                    placeholder={t('sim.initPh')}
                    spellCheck={false}
                    onChange={(e) => edit({ simInit: e.target.value })}
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => e.stopPropagation()}
                  />
                </label>
              </div>
              <label className="flex flex-col gap-0.5">
                <span>{t('sim.derivs')}</span>
                <textarea
                  rows={2}
                  className={`${txtField} w-full resize-y`}
                  value={block.simDerivs ?? ''}
                  placeholder={t('sim.derivsPh')}
                  spellCheck={false}
                  onChange={(e) => edit({ simDerivs: e.target.value })}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => e.stopPropagation()}
                />
              </label>
              <div className="flex gap-2">
                <label className="flex flex-col gap-0.5 flex-1">
                  <span>{t('sim.aux')}</span>
                  <textarea
                    rows={2}
                    className={`${txtField} w-full resize-y`}
                    value={block.simAux ?? ''}
                    placeholder={t('sim.auxPh')}
                    spellCheck={false}
                    onChange={(e) => edit({ simAux: e.target.value })}
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => e.stopPropagation()}
                  />
                </label>
                <label className="flex flex-col gap-0.5 flex-1">
                  <span>{t('sim.params')}</span>
                  <textarea
                    rows={2}
                    className={`${txtField} w-full resize-y`}
                    value={block.simParams ?? ''}
                    placeholder={t('sim.paramsPh')}
                    spellCheck={false}
                    onChange={(e) => edit({ simParams: e.target.value })}
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => e.stopPropagation()}
                  />
                </label>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <label>t₀ <input type="number" className={numField} value={block.simT0 ?? 0} onChange={(e) => edit({ simT0: Number(e.target.value) })} onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()} /></label>
                <label>t₁ <input type="number" className={numField} value={block.simT1 ?? 10} onChange={(e) => edit({ simT1: Number(e.target.value) })} onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()} /></label>
                <label>dt <input type="number" step="any" className={numField} value={block.simDt ?? 0.01} onChange={(e) => edit({ simDt: Number(e.target.value) })} onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()} /></label>
                <label>{t('sim.solver')}
                  <select
                    className="ml-1 min-h-[32px] bg-[var(--input-bg)] border border-[var(--input-border)] rounded-lg px-1.5 text-[var(--ink)]"
                    value={block.simSolver ?? 'rk4'}
                    onChange={(e) => edit({ simSolver: e.target.value as SimSolver })}
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => e.stopPropagation()}
                  >
                    {SIM_SOLVERS.map((s) => (
                      <option key={s} value={s}>{simSolverName(s)}</option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <label>{t('sim.xAxis')}
                  <select
                    className="ml-1 min-h-[32px] bg-[var(--input-bg)] border border-[var(--input-border)] rounded-lg px-1.5 text-[var(--ink)]"
                    value={block.simX ?? 't'}
                    onChange={(e) => edit({ simX: e.target.value })}
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <option value="t">t</option>
                    {states.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </label>
                <label className="flex items-center gap-1 flex-1 min-w-[160px]">
                  {t('sim.yAxis')}
                  <input
                    className={`${txtField} flex-1 min-h-[32px]`}
                    value={block.simY ?? ''}
                    spellCheck={false}
                    onChange={(e) => edit({ simY: e.target.value })}
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => e.stopPropagation()}
                  />
                </label>
                <label className="flex items-center gap-1" title={t('sim.exportTitle')}>
                  → <input
                    className={`${txtField} w-20 min-h-[32px]`}
                    value={block.simExport ?? ''}
                    placeholder={t('sim.exportPh')}
                    spellCheck={false}
                    onChange={(e) => edit({ simExport: e.target.value.replace(/[^A-Za-z0-9_]/g, '') })}
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => e.stopPropagation()}
                  />
                </label>
              </div>
              <label className="flex flex-col gap-0.5">
                <span>{t('sim.events')}</span>
                <textarea
                  rows={2}
                  className={`${txtField} w-full resize-y`}
                  value={block.simEvents ?? ''}
                  placeholder={t('sim.eventsPh')}
                  spellCheck={false}
                  onChange={(e) => edit({ simEvents: e.target.value })}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => e.stopPropagation()}
                />
              </label>
              <div className="text-[11px] text-[var(--faint)]">{t('sim.hint')}</div>
            </>) : (<>
              <div className="flex items-center gap-2 flex-wrap">
                <label>{t('sim.cells')} <input type="number" step={1} className={numField} value={block.simFdtdN ?? 400} onChange={(e) => edit({ simFdtdN: Number(e.target.value) })} onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()} /></label>
                <label>{t('sim.flen')} <input type="number" step="any" className={numField} value={block.simFdtdL ?? 20} onChange={(e) => edit({ simFdtdL: Number(e.target.value) })} onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()} /></label>
                <label>{t('sim.fsteps')} <input type="number" step={1} className={numField} value={block.simFdtdSteps ?? 1500} onChange={(e) => edit({ simFdtdSteps: Number(e.target.value) })} onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()} /></label>
                <label>{t('sim.source')}
                  <select
                    className="ml-1 min-h-[32px] bg-[var(--input-bg)] border border-[var(--input-border)] rounded-lg px-1.5 text-[var(--ink)]"
                    value={block.simFdtdSrc ?? 'gauss'}
                    onChange={(e) => edit({ simFdtdSrc: e.target.value as 'gauss' | 'sine' })}
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <option value="gauss">{t('sim.srcGauss')}</option>
                    <option value="sine">{t('sim.srcSine')}</option>
                  </select>
                </label>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <label>{t('sim.freq')} <input type="number" step="any" className={numField} value={block.simFdtdFreq ?? 1} onChange={(e) => edit({ simFdtdFreq: Number(e.target.value) })} onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()} /></label>
                <label>{t('sim.amp')} <input type="number" step="any" className={numField} value={block.simFdtdAmp ?? 1} onChange={(e) => edit({ simFdtdAmp: Number(e.target.value) })} onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()} /></label>
                <label>{t('sim.srcPos')} <input type="number" step="any" className={numField} value={block.simFdtdSrcX ?? 4} onChange={(e) => edit({ simFdtdSrcX: Number(e.target.value) })} onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()} /></label>
                <label>{t('sim.det')} <input type="number" step="any" className={numField} value={block.simFdtdDet ?? ''} placeholder="auto" onChange={(e) => edit({ simFdtdDet: e.target.value === '' ? undefined : Number(e.target.value) })} onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()} /></label>
              </div>
              <label className="flex flex-col gap-0.5">
                <span>{t('sim.layers')}</span>
                <textarea
                  rows={2}
                  className={`${txtField} w-full resize-y`}
                  value={block.simFdtdLayers ?? ''}
                  placeholder={t('sim.layersPh')}
                  spellCheck={false}
                  onChange={(e) => edit({ simFdtdLayers: e.target.value })}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => e.stopPropagation()}
                />
              </label>
            </>)}
            </div>
          )}
        </div>

        {/* график + плеер */}
        {block.error ? (
          <div ref={footRef} className="flex items-center gap-1.5 text-[var(--danger)] text-[12px] mb-1" role="alert"><IWarn /> {block.error}</div>
        ) : view ? (
          <SimPlayer
            result={block.simResult as SimResult}
            xs={view.xs}
            curves={view.curves}
            xIsT={view.xIsT}
            field={view.field}
            tEst={view.tEst}
            events={view.events}
            halted={view.halted}
            pal={pal}
            pw={pw}
            ph={ph}
            speed={block.simSpeed ?? 1}
            loop={block.simLoop ?? true}
            steps={view.steps}
            chromeRef={footRef}
            onSpeed={(v) => updatePlot(block.id, { simSpeed: v })}
            onLoop={(v) => updatePlot(block.id, { simLoop: v })}
          />
        ) : (
          <div ref={footRef} className="text-[var(--faint)] text-[12px] mb-1">{t('sim.noData')}</div>
        )}

        {/* ручка размера */}
        <span
          className="absolute -right-2 -bottom-2 p-1.5 cursor-nwse-resize opacity-0 group-hover:opacity-100 text-[var(--faint)] hover:text-[var(--accent-line)] select-none"
          style={{ opacity: selected ? 1 : undefined }}
          title={t('sim.resize')}
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

/* ================= Плеер анимации ================= */

interface Curve {
  name: string;
  ys: number[];
  color: string;
}

function SimPlayer({
  result, xs, curves, xIsT, field, tEst, events, halted, pal, pw, ph, speed, loop, steps, chromeRef, onSpeed, onLoop,
}: {
  result: SimResult;
  xs: number[];
  curves: Curve[];
  xIsT: boolean;
  field: { xs: number[]; snaps: number[][]; ts: number[] } | null;
  tEst: number | null;
  events: { t: number }[];
  halted: boolean;
  pal: { svgBg: string; grid: string; gridOpacity: number; tick: string; axis: string; frame: string; legend: string; series: string[] };
  pw: number;
  ph: number;
  speed: number;
  loop: boolean;
  steps: number;
  chromeRef: React.RefObject<HTMLDivElement | null>;
  onSpeed: (v: number) => void;
  onLoop: (v: boolean) => void;
}) {
  const isField = !!field;
  const M = isField ? field.snaps.length : 0;
  const N = isField ? M : result.ts.length;
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(false);
  const frameRef = useRef(0);
  const ctl = useRef({ speed, loop, n: N, playing: false });
  // синхронизация изменяющихся контролов с rAF-циклом (вне рендера)
  useEffect(() => {
    ctl.current.speed = speed;
    ctl.current.loop = loop;
    ctl.current.n = N;
  });

  // новый расчёт — сначала
  useEffect(() => {
    frameRef.current = 0;
    setFrame(0);
  }, [result]);

  useEffect(() => {
    if (!playing) return;
    ctl.current.playing = true;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      const c = ctl.current;
      let nf = frameRef.current + dt * (c.n / PLAY_SECONDS) * c.speed;
      if (nf >= c.n - 1) {
        if (c.loop && c.n > 1) {
          nf = nf % (c.n - 1);
        } else {
          nf = c.n - 1;
          setPlaying(false);
        }
      }
      frameRef.current = nf;
      setFrame(nf);
      if (ctl.current.playing) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      ctl.current.playing = false;
      cancelAnimationFrame(raf);
    };
  }, [playing]);

  const geo = useMemo(() => {
    const PAD_L = 52;
    const PAD_R = 12;
    const PAD_T = 10;
    const PAD_B = 26;
    const Wpx = pw - 24;
    const gxs = isField ? (field as { xs: number[] }).xs : xs;
    let x0 = Math.min(...gxs);
    let x1 = Math.max(...gxs);
    if (!(x1 > x0)) {
      x0 -= 1;
      x1 += 1;
    }
    let y0 = Infinity;
    let y1 = -Infinity;
    if (isField) {
      const fl = field as { snaps: number[][] };
      for (const snap of fl.snaps) {
        for (const v of snap) {
          if (isFinite(v)) {
            if (v < y0) y0 = v;
            if (v > y1) y1 = v;
          }
        }
      }
    } else {
      for (const c of curves) {
        for (const v of c.ys) {
          if (isFinite(v)) {
            if (v < y0) y0 = v;
            if (v > y1) y1 = v;
          }
        }
      }
    }
    if (!(y1 > y0)) {
      y0 -= 1;
      y1 += 1;
    }
    const px = (x: number) => PAD_L + ((x - x0) / (x1 - x0)) * (Wpx - PAD_L - PAD_R);
    const py = (y: number) => ph - PAD_B - ((y - y0) / (y1 - y0)) * (ph - PAD_T - PAD_B);
    const full = curves.map((c) => {
      let d = '';
      for (let k = 0; k < N; k++) {
        const y = c.ys[k];
        if (!isFinite(y)) continue;
        d += `${d ? 'L' : 'M'}${px(xs[k]).toFixed(1)},${py(y).toFixed(1)}`;
      }
      return d;
    });
    const ticks = (lo: number, hi: number) => {
      const out: number[] = [];
      for (let i = 0; i <= 4; i++) out.push(lo + ((hi - lo) * i) / 4);
      return out;
    };
    return { Wpx, PAD_L, PAD_R, PAD_T, PAD_B, x0, x1, y0, y1, px, py, full, xt: ticks(x0, x1), yt: ticks(y0, y1) };
  }, [xs, curves, field, isField, pw, ph, N]);

  const at = (arr: number[], f: number): number => {
    const i = Math.max(0, Math.min(N - 2, Math.floor(f)));
    const fr = Math.max(0, Math.min(1, f - i));
    const a = arr[i];
    const b = arr[i + 1] ?? a;
    return a + (b - a) * fr;
  };
  const fi = Math.max(0, Math.min(N - 1, Math.floor(frame)));
  const tsEff = isField ? (field as { ts: number[] }).ts : result.ts;
  const xsEff = isField ? (field as { xs: number[] }).xs : xs;
  const tNow = at(tsEff, frame);
  // FDTD: интерполированный снимок поля на текущем кадре
  const snap: number[] = useMemo(() => {
    if (!isField || !field) return [];
    const i = Math.max(0, Math.min(field.snaps.length - 2, Math.floor(frame)));
    const fr = Math.max(0, Math.min(1, frame - i));
    const a = field.snaps[i];
    const b = field.snaps[i + 1] ?? a;
    return a.map((v, k) => v + ((b[k] ?? v) - v) * fr);
  }, [isField, field, frame]);
  const curvesEff: Curve[] = isField ? [{ name: 'E', ys: snap, color: pal.series[0] }] : curves;
  const TRAIL = Math.max(2, Math.floor(N / 50));
  const trails = isField
    ? [
        (() => {
          let d = '';
          for (let k = 0; k < snap.length; k++) {
            const y = snap[k];
            if (!isFinite(y)) continue;
            d += `${d ? 'L' : 'M'}${geo.px(xsEff[k]).toFixed(1)},${geo.py(y).toFixed(1)}`;
          }
          return d;
        })(),
      ]
    : curves.map((c) => {
        let d = '';
        const from = Math.max(0, fi - TRAIL);
        for (let k = from; k <= fi; k++) {
          const y = c.ys[k];
          if (!isFinite(y)) continue;
          d += `${d ? 'L' : 'M'}${geo.px(xs[k]).toFixed(1)},${geo.py(y).toFixed(1)}`;
        }
        const cx = at(xs, frame);
        const cy = at(c.ys, frame);
        if (isFinite(cx) && isFinite(cy)) d += `${d ? 'L' : 'M'}${geo.px(cx).toFixed(1)},${geo.py(cy).toFixed(1)}`;
        return d;
      });

  const toggle = () => {
    if (!playing && frame >= N - 1) {
      frameRef.current = 0;
      setFrame(0);
    }
    setPlaying((v) => !v);
  };

  return (
    <div onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
      <svg
        width={geo.Wpx}
        height={ph}
        className="rounded-lg border border-[var(--line)]"
        style={{ background: pal.svgBg }}
        role="img"
        aria-label={`sim: ${curvesEff.map((c) => c.name).join(', ')}`}
      >
        {geo.xt.map((v, i) => (
          <g key={`x${i}`}>
            <line x1={geo.px(v)} y1={geo.PAD_T} x2={geo.px(v)} y2={ph - geo.PAD_B} stroke={pal.grid} strokeOpacity={pal.gridOpacity} />
            <text x={geo.px(v)} y={ph - geo.PAD_B + 14} fontSize={9} fill={pal.tick} textAnchor="middle">
              {fmtTick(v)}
            </text>
          </g>
        ))}
        {geo.yt.map((v, i) => (
          <g key={`y${i}`}>
            <line x1={geo.PAD_L} y1={geo.py(v)} x2={geo.Wpx - geo.PAD_R} y2={geo.py(v)} stroke={pal.grid} strokeOpacity={pal.gridOpacity} />
            <text x={geo.PAD_L - 5} y={geo.py(v) + 3} fontSize={9} fill={pal.tick} textAnchor="end">
              {fmtTick(v)}
            </text>
          </g>
        ))}
        <rect x={geo.PAD_L} y={geo.PAD_T} width={geo.Wpx - geo.PAD_L - geo.PAD_R} height={ph - geo.PAD_T - geo.PAD_B} fill="none" stroke={pal.frame} />
        {curvesEff.map((c, i) =>
          geo.full[i] ? <path key={`f${i}`} d={geo.full[i]} fill="none" stroke={c.color} strokeOpacity={0.3} strokeWidth={1.5} /> : null,
        )}
        {xIsT && <line x1={geo.px(at(xsEff, frame))} y1={geo.PAD_T} x2={geo.px(at(xsEff, frame))} y2={ph - geo.PAD_B} stroke={pal.axis} strokeWidth={1} strokeDasharray="3 3" />}
        {/* маркеры событий на оси времени */}
        {xIsT &&
          events.slice(0, 200).map((ev, i) => {
            if (ev.t < geo.x0 || ev.t > geo.x1) return null;
            const ex = geo.px(ev.t);
            return <path key={`e${i}`} d={`M${ex},${geo.PAD_T} l3.5,6 h-7 Z`} fill={pal.axis} opacity={0.8} />;
          })}
        {curvesEff.map((c, i) =>
          trails[i] ? <path key={`t${i}`} d={trails[i]} fill="none" stroke={c.color} strokeWidth={2} strokeLinejoin="round" /> : null,
        )}
        {!isField &&
          curvesEff.map((c, i) => {
            const cx = at(xsEff, frame);
            const cy = at(c.ys, frame);
            if (!isFinite(cx) || !isFinite(cy)) return null;
            return <circle key={`m${i}`} cx={geo.px(cx)} cy={geo.py(cy)} r={4} fill={c.color} stroke={pal.svgBg} strokeWidth={1.5} />;
          })}
        {curvesEff.map((c, i) => (
          <g key={`l${i}`}>
            <line x1={geo.PAD_L + 8} y1={geo.PAD_T + 12 + i * 15} x2={geo.PAD_L + 26} y2={geo.PAD_T + 12 + i * 15} stroke={c.color} strokeWidth={2.5} />
            <text x={geo.PAD_L + 30} y={geo.PAD_T + 15 + i * 15} fontSize={10} fill={pal.legend}>
              {c.name.length > 30 ? c.name.slice(0, 30) + '…' : c.name}
            </text>
          </g>
        ))}
      </svg>
      {/* плеер */}
      <div ref={chromeRef}>
      <div className="flex items-center gap-2 mt-1.5 text-[12px] text-[var(--ink-soft)] flex-wrap">
        <button
          type="button"
          onClick={toggle}
          aria-label={playing ? t('sim.pause') : t('sim.play')}
          title={playing ? t('sim.pause') : t('sim.play')}
          className="min-w-[36px] min-h-[32px] px-2 rounded-lg border border-[var(--accent-line)]/60 bg-[var(--accent-soft)] text-[13px] cursor-pointer hover:brightness-125 active:scale-[0.96]"
        >
          {playing ? '❚❚' : '▶'}
        </button>
        <input
          type="range"
          min={0}
          max={N - 1}
          step={1}
          value={fi}
          aria-label="t"
          className="flex-1 accent-[var(--accent-line)]"
          onChange={(e) => {
            frameRef.current = Number(e.target.value);
            setFrame(Number(e.target.value));
            setPlaying(false);
          }}
        />
        <span className="math-input text-[11px] whitespace-nowrap">t = {fmtTick(tNow)}</span>
        <label className="flex items-center gap-1 whitespace-nowrap">
          {t('sim.speed')}
          <select
            className="min-h-[32px] bg-[var(--input-bg)] border border-[var(--input-border)] rounded-lg px-1 text-[var(--ink)]"
            value={speed}
            onChange={(e) => onSpeed(Number(e.target.value))}
          >
            {[0.25, 0.5, 1, 2, 4].map((s) => (
              <option key={s} value={s}>{s}×</option>
            ))}
          </select>
        </label>
        <label className="inline-flex items-center gap-1 cursor-pointer whitespace-nowrap">
          <input type="checkbox" className="w-4 h-4 accent-[var(--accent-line)]" checked={loop} onChange={(e) => onLoop(e.target.checked)} />
          {t('sim.loop')}
        </label>
      </div>
      <div className="text-[11px] text-[var(--faint)] mt-1">
        {t('sim.stats', { steps, pts: N })}
        {events.length > 0 && <> • {t('sim.eventsN', { n: events.length })}</>}
        {halted && <> • {t('sim.halted')}</>}
        {tEst != null && <> • {t('sim.transmission', { v: tEst })}</>}
      </div>
      </div>
    </div>
  );
}

export default memo(SimBlockView);
