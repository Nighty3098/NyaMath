import { useEffect, useMemo, useRef, useState } from 'react';
import { SNIPPETS, type Snippet } from '../engine/packs';
import { savePaletteUi, useCanvasStore } from '../store/canvasStore';
import { lx, packName, t, type PackId } from '../i18n';
import {
  ICalc, IChart, IContour, IFx, IFormula, IGrid,
  IPlot, IProgram, IResize, ISignal, ISim, IUnits, IX, IZap,
} from './Icon';

const PACKS: PackId[] = ['matrices', 'stats', 'physics', 'units', 'calc', 'telecom', 'programs', 'plots', 'sim'];

const PACK_ICONS: Record<PackId, () => React.JSX.Element> = {
  matrices: IGrid,
  stats: IChart,
  physics: IZap,
  units: IUnits,
  calc: ICalc,
  telecom: ISignal,
  programs: IProgram,
  plots: IPlot,
  sim: ISim,
};

const KIND_ICONS: Record<Snippet['kind'], () => React.JSX.Element> = {
  math: IFormula,
  plot: IPlot,
  contour: IContour,
  program: IProgram,
  sim: ISim,
};

const POS_KEY = 'wengineering-palette-pos';
/** Зона прилипания к краям экрана, px */
const SNAP_ZONE = 28;
/** Сдвиг, после которого тяга док-панели превращается в открепление */
const UNDOCK_DIST = 14;

function loadPos(): { x: number; y: number } {
  const fallback = { x: 8, y: 48 };
  try {
    const raw = localStorage.getItem(POS_KEY);
    if (!raw) return fallback;
    const p = JSON.parse(raw) as { x?: unknown; y?: unknown };
    if (typeof p.x !== 'number' || typeof p.y !== 'number') return fallback;
    return {
      x: Math.min(Math.max(0, p.x), Math.max(0, window.innerWidth - 120)),
      y: Math.min(Math.max(0, p.y), Math.max(0, window.innerHeight - 80)),
    };
  } catch {
    return fallback;
  }
}

/**
 * Палитра функций: float — окно поверх всего (перетаскивание + ресайз),
 * left/right — док-панель на всю высоту со сдвигом холста (ресайз ширины).
 * Прилипание — перетаскиванием к левому/правому краю экрана, открепление —
 * тягой за шапку док-панели. Вкл/выкл — через меню «Вид». Не часть canvas.
 */
export default function FunctionPalette() {
  const addBlock = useCanvasStore((s) => s.addBlock);
  const addPlotBlock = useCanvasStore((s) => s.addPlotBlock);
  const addContourBlock = useCanvasStore((s) => s.addContourBlock);
  const addProgramBlock = useCanvasStore((s) => s.addProgramBlock);
  const addSimBlock = useCanvasStore((s) => s.addSimBlock);
  const setPaletteOpen = useCanvasStore((s) => s.setPaletteOpen);
  const mode = useCanvasStore((s) => s.paletteMode);
  const setPaletteMode = useCanvasStore((s) => s.setPaletteMode);
  const palW = useCanvasStore((s) => s.paletteW);
  const palH = useCanvasStore((s) => s.paletteH);
  const setPaletteSize = useCanvasStore((s) => s.setPaletteSize);
  const dockW = useCanvasStore((s) => s.paletteDockW);
  const setPaletteDockW = useCanvasStore((s) => s.setPaletteDockW);
  // подписка ради перерендера при смене языка
  useCanvasStore((s) => s.lang);
  const [q, setQ] = useState('');
  const [pos, setPos] = useState(loadPos);
  const [snap, setSnap] = useState<'left' | 'right' | null>(null);
  // жесты: живут в ref'ах, движение/отпускание — на window (переживают смену режима)
  const floatDrag = useRef<{ dx: number; dy: number } | null>(null);
  const dockPend = useRef<{ x: number; y: number } | null>(null);
  const resizeRef = useRef<{ x: number; y: number; w: number; h: number } | null>(null);
  const dockResizeRef = useRef<{ x: number; w: number } | null>(null);

  const docked = mode !== 'float';

  const items = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return SNIPPETS;
    return SNIPPETS.filter(
      (s) =>
        lx(s.label).toLowerCase().includes(needle) ||
        s.code.toLowerCase().includes(needle) ||
        lx(s.hint).toLowerCase().includes(needle),
    );
  }, [q]);

  // Единый цикл перетаскивания на window: переживает undock (смену дерева)
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      // тяга док-панели: превысили порог — открепляем в окно у курсора
      if (dockPend.current && !floatDrag.current) {
        const dx = e.clientX - dockPend.current.x;
        const dy = e.clientY - dockPend.current.y;
        if (dx * dx + dy * dy > UNDOCK_DIST * UNDOCK_DIST) {
          dockPend.current = null;
          setPaletteMode('float');
          const np = { x: e.clientX - 200, y: Math.max(0, e.clientY - 16) };
          setPos(np);
          try {
            localStorage.setItem(POS_KEY, JSON.stringify(np));
          } catch { /* ignore */ }
          floatDrag.current = { dx: 200, dy: 16 };
          setSnap(null);
          return;
        }
      }
      if (floatDrag.current) {
        const nx = Math.min(Math.max(-320, e.clientX - floatDrag.current.dx), window.innerWidth - 80);
        const ny = Math.min(Math.max(0, e.clientY - floatDrag.current.dy), window.innerHeight - 60);
        setPos({ x: nx, y: ny });
        // подсветка зоны прилипания у краёв
        setSnap(e.clientX <= SNAP_ZONE ? 'left' : e.clientX >= window.innerWidth - SNAP_ZONE ? 'right' : null);
      }
    };
    const onUp = () => {
      if (dockPend.current) {
        dockPend.current = null;
        return;
      }
      if (floatDrag.current) {
        floatDrag.current = null;
        // отпустили в зоне края — пристыковать, иначе запомнить позицию окна
        setSnap((s) => {
          if (s) {
            setPaletteMode(s);
            savePaletteUi();
          } else {
            setPos((p) => {
              try {
                localStorage.setItem(POS_KEY, JSON.stringify(p));
              } catch { /* ignore */ }
              return p;
            });
          }
          return null;
        });
      }
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [setPaletteMode]);

  const place = () => {
    // вставка — в точку прицела, прицел каскадом уходит вниз
    const st = useCanvasStore.getState();
    const p = { x: st.cross.x, y: st.cross.y };
    st.nudgeCross(0, 140);
    return p;
  };

  const insert = (s: Snippet) => {
    const p = place();
    if (s.kind === 'plot') addPlotBlock(p.x, p.y, s.code, s.plot);
    else if (s.kind === 'contour') addContourBlock(p.x, p.y, s.code);
    else if (s.kind === 'program') addProgramBlock(p.x, p.y, s.code, s.exportName ?? '');
    else if (s.kind === 'sim') addSimBlock(p.x, p.y, s.code);
    else addBlock(p.x, p.y, s.code);
  };

  const close = () => setPaletteOpen(false);

  const header = (
    <div
      className="flex items-center gap-1.5 px-3 py-2 border-b border-[var(--chrome-line)] select-none cursor-grab active:cursor-grabbing touch-none"
      onPointerDown={(e) => {
        if ((e.target as HTMLElement).closest('input,button')) return;
        e.preventDefault();
        if (docked) {
          dockPend.current = { x: e.clientX, y: e.clientY };
        } else {
          floatDrag.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y };
        }
      }}
      title={t('pal.aria')}
    >
      <span className="text-[var(--accent)] shrink-0" aria-hidden="true">
        <IFx />
      </span>
      <span className="text-[13px] font-semibold whitespace-nowrap">{t('pal.insert')}</span>
      <span className="math-input text-[11px] text-[var(--chrome-soft)]">{items.length}</span>
      <label htmlFor="fx-search" className="sr-only">
        {t('pal.searchLabel')}
      </label>
      <input
        id="fx-search"
        className="flex-1 min-w-0 min-h-[36px] bg-[var(--input-bg)] border border-[var(--input-border)] rounded-lg px-2 py-1 text-[13px] outline-none focus:border-[var(--accent-line)] cursor-text"
        placeholder={t('pal.searchPh')}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onPointerDown={(e) => e.stopPropagation()}
        autoFocus={!docked}
      />
      <button
        type="button"
        className="min-w-[36px] min-h-[36px] inline-flex items-center justify-center rounded-lg text-[var(--chrome-soft)] hover:text-[var(--chrome-ink)] hover:bg-white/5 cursor-pointer"
        onClick={close}
        aria-label={t('pal.close')}
      >
        <IX />
      </button>
    </div>
  );

  const list = (
    <div className="flex-1 min-h-0 overflow-y-auto p-2">
      {PACKS.map((pack) => {
        const rows = items.filter((s) => s.pack === pack);
        if (!rows.length) return null;
        const PackIcon = PACK_ICONS[pack];
        return (
          <div key={pack} className="mb-2">
            <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-[var(--chrome-soft)] px-1 mb-1">
              <span aria-hidden="true">
                <PackIcon />
              </span>
              {packName(pack)}
              <span className="math-input normal-case tracking-normal opacity-70">{rows.length}</span>
            </div>
            {rows.map((s) => {
              const KindIcon = KIND_ICONS[s.kind];
              return (
                <button
                  key={pack + lx(s.label)}
                  type="button"
                  className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-white/5 border border-transparent hover:border-[var(--hover-line)] group cursor-pointer"
                  onClick={() => insert(s)}
                  title={lx(s.hint)}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-[var(--accent)] shrink-0" aria-hidden="true">
                      <KindIcon />
                    </span>
                    <span className="text-[13px]">{lx(s.label)}</span>
                    <span className="text-[11px] text-[var(--chrome-soft)] truncate">{lx(s.hint)}</span>
                    <span className="ml-auto text-[var(--accent)] opacity-0 group-hover:opacity-100 text-[16px]" aria-hidden="true">
                      +
                    </span>
                  </div>
                  <div className="math-input text-[12px] text-[var(--accent-ink)]/80 truncate pl-6">
                    {s.code.split('\n')[0]}
                    {s.code.includes('\n') ? ' …' : ''}
                  </div>
                </button>
              );
            })}
          </div>
        );
      })}
      {items.length === 0 && <div className="text-[13px] text-[var(--chrome-soft)] p-3">{t('pal.empty')}</div>}
    </div>
  );

  if (docked) {
    const gutter = (
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label={t('pal.resize')}
        title={t('pal.resize')}
        className="w-[7px] shrink-0 cursor-ew-resize hover:bg-white/10 active:bg-white/15 touch-none"
        onPointerDown={(e) => {
          dockResizeRef.current = { x: e.clientX, w: dockW };
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          const st = dockResizeRef.current;
          if (!st) return;
          const dx = e.clientX - st.x;
          setPaletteDockW(st.w + (mode === 'left' ? dx : -dx));
        }}
        onPointerUp={() => {
          dockResizeRef.current = null;
          savePaletteUi();
        }}
        onPointerCancel={() => {
          dockResizeRef.current = null;
        }}
      />
    );
    return (
      <div
        className={`h-full shrink-0 flex items-stretch bg-[var(--chrome)] text-[var(--chrome-ink)] ${
          mode === 'left' ? 'border-r' : 'border-l'
        } border-[var(--chrome-line)]`}
        style={{ width: dockW }}
        role="complementary"
        aria-label={t('pal.aria')}
      >
        {mode === 'right' && gutter}
        <div className="flex-1 min-w-0 flex flex-col">
          {header}
          {list}
        </div>
        {mode === 'left' && gutter}
      </div>
    );
  }

  return (
    <>
      {/* подсветка зоны прилипания */}
      {snap && (
        <div
          aria-hidden="true"
          className={`fixed top-10 bottom-0 z-40 w-[300px] max-w-[40vw] pointer-events-none border-2 border-dashed border-[var(--accent-line)] bg-[var(--accent-soft)] ${
            snap === 'left' ? 'left-0 rounded-r-xl' : 'right-0 rounded-l-xl'
          }`}
        />
      )}
      <div
        className="fixed z-50 flex flex-col rounded-xl border border-[var(--chrome-line)] bg-[var(--chrome)] text-[var(--chrome-ink)] shadow-2xl"
        style={{ left: pos.x, top: pos.y, width: palW, height: Math.min(palH, window.innerHeight - pos.y - 8) }}
        role="dialog"
        aria-label={t('pal.aria')}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.stopPropagation();
            close();
          }
        }}
      >
        {header}
        {list}
        {/* ручка ресайза */}
        <span
          role="separator"
          aria-orientation="horizontal"
          aria-label={t('pal.resize')}
          title={t('pal.resize')}
          className="absolute -right-2 -bottom-2 p-1.5 cursor-nwse-resize text-[var(--faint)] hover:text-[var(--accent-line)] select-none touch-none"
          onPointerDown={(e) => {
            e.stopPropagation();
            resizeRef.current = { x: e.clientX, y: e.clientY, w: palW, h: palH };
            (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => {
            const st = resizeRef.current;
            if (!st) return;
            setPaletteSize(st.w + (e.clientX - st.x), st.h + (e.clientY - st.y));
          }}
          onPointerUp={() => {
            resizeRef.current = null;
            savePaletteUi();
          }}
          onPointerCancel={() => {
            resizeRef.current = null;
          }}
          onClick={(e) => e.stopPropagation()}
          onDoubleClick={(e) => e.stopPropagation()}
        >
          <IResize />
        </span>
      </div>
    </>
  );
}
