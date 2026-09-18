import { useEffect, useMemo, useRef, useState } from 'react';
import { SNIPPETS, type Snippet } from '../engine/packs';
import { FORMULA_SECTIONS, FORMULAS } from '../data/formulas';
import { savePaletteUi, useCanvasStore } from '../store/canvasStore';
import { lx, packName, t, type PackId } from '../i18n';
import {
  ICalc, IChart, IChip, IContour, IFx, IField, IFormula, IGrid,
  IPlot, IProgram, IResize, IScale, ISignal, ISim, IUnits, IX, IZap,
} from './Icon';

const PACKS: PackId[] = ['matrices', 'stats', 'uncertainty', 'physics', 'em', 'units', 'calc', 'computing', 'telecom', 'programs', 'plots', 'sim'];

const PACK_ICONS: Record<PackId, () => React.JSX.Element> = {
  matrices: IGrid,
  stats: IChart,
  uncertainty: IScale,
  physics: IZap,
  em: IField,
  units: IUnits,
  calc: ICalc,
  computing: IChip,
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

const POS_KEY = 'nyamath-palette-pos';
const POS_KEY_LEGACY = 'wengineering-palette-pos';
const FORMULA_POS_KEY = 'nyamath-formula-palette-pos';
type PaletteVariant = 'functions' | 'formulas';
/** Зона прилипания к краям экрана, px */
const SNAP_ZONE = 28;
/** Сдвиг, после которого тяга док-панели превращается в открепление */
const UNDOCK_DIST = 14;

function loadPos(variant: PaletteVariant): { x: number; y: number } {
  const fallback = variant === 'formulas' ? { x: 48, y: 88 } : { x: 8, y: 48 };
  try {
    const raw = variant === 'formulas'
      ? localStorage.getItem(FORMULA_POS_KEY)
      : localStorage.getItem(POS_KEY) ?? localStorage.getItem(POS_KEY_LEGACY);
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
export default function FunctionPalette({ variant = 'functions' }: { variant?: PaletteVariant }) {
  const formulas = variant === 'formulas';
  const posKey = formulas ? FORMULA_POS_KEY : POS_KEY;
  const searchId = formulas ? 'formula-search' : 'fx-search';
  const addBlock = useCanvasStore((s) => s.addBlock);
  const addBlocks = useCanvasStore((s) => s.addBlocks);
  const addPlotBlock = useCanvasStore((s) => s.addPlotBlock);
  const addPlot3dBlock = useCanvasStore((s) => s.addPlot3dBlock);
  const addContourBlock = useCanvasStore((s) => s.addContourBlock);
  const addProgramBlock = useCanvasStore((s) => s.addProgramBlock);
  const addSimBlock = useCanvasStore((s) => s.addSimBlock);
  const setPaletteOpen = useCanvasStore((s) => (formulas ? s.setFormulaPaletteOpen : s.setPaletteOpen));
  const mode = useCanvasStore((s) => (formulas ? s.formulaPaletteMode : s.paletteMode));
  const setPaletteMode = useCanvasStore((s) => (formulas ? s.setFormulaPaletteMode : s.setPaletteMode));
  const palW = useCanvasStore((s) => (formulas ? s.formulaPaletteW : s.paletteW));
  const palH = useCanvasStore((s) => (formulas ? s.formulaPaletteH : s.paletteH));
  const setPaletteSize = useCanvasStore((s) => (formulas ? s.setFormulaPaletteSize : s.setPaletteSize));
  const dockW = useCanvasStore((s) => (formulas ? s.formulaPaletteDockW : s.paletteDockW));
  const setPaletteDockW = useCanvasStore((s) => (formulas ? s.setFormulaPaletteDockW : s.setPaletteDockW));
  // подписка ради перерендера при смене языка
  const lang = useCanvasStore((s) => s.lang);
  const [q, setQ] = useState('');
  const [pos, setPos] = useState(() => loadPos(variant));
  const [snap, setSnap] = useState<'left' | 'right' | null>(null);
  // жесты: живут в ref'ах, движение/отпускание — на window (переживают смену режима)
  const floatDrag = useRef<{ dx: number; dy: number } | null>(null);
  const dockPend = useRef<{ x: number; y: number } | null>(null);
  const resizeRef = useRef<{ x: number; y: number; w: number; h: number } | null>(null);
  const dockResizeRef = useRef<{ x: number; w: number } | null>(null);

  const docked = mode !== 'float';

  interface FormulaRow {
    id: string;
    section: string;
    label: { ru: string; en: string };
    hint: { ru: string; en: string };
    code: string;
    sources: { title: string; url: string }[];
    vars?: { name: string; label: { ru: string; en: string } }[];
    plot2d?: string;
    plot3d?: string;
    sim?: string;
  }

  interface PalItem {
    key: string;
    section: string;
    label: string;
    hint: string;
    code: string;
    doc?: string;
    sources?: { title: string; url: string }[];
    vars?: { name: string; label: { ru: string; en: string } }[];
    plot2d?: string;
    plot3d?: string;
    sim?: string;
    kind: Snippet['kind'];
    snippet?: Snippet;
  }

  const sections = formulas
    ? FORMULA_SECTIONS.map((sec) => ({ id: sec.id, label: lx(sec.label) }))
    : PACKS.map((pack) => ({ id: pack, label: packName(pack) }));

  const items = useMemo<PalItem[]>(() => {
    const sectionLabel = (id: string): string =>
      formulas
        ? lx(FORMULA_SECTIONS.find((sec) => sec.id === id)?.label ?? { ru: id, en: id })
        : packName(id as PackId);
    const all: PalItem[] = formulas
      ? (FORMULAS as FormulaRow[]).map((f) => ({
          key: f.id,
          section: f.section,
          label: f.label[lang],
          hint: f.hint[lang],
          code: f.code,
          sources: f.sources,
          vars: f.vars,
          plot2d: f.plot2d,
          plot3d: f.plot3d,
          sim: f.sim,
          kind: 'math' as const,
        }))
      : SNIPPETS.map((s, i) => ({
          key: `${s.pack}-${i}`,
          section: s.pack,
          label: s.label[lang],
          hint: s.hint[lang],
          code: s.code,
          doc: s.doc,
          kind: s.kind,
          snippet: s,
          plot2d: s.plot2d,
        }));
    const needle = q.trim().toLowerCase();
    if (!needle) return all;
    return all.filter(
      (it) =>
        it.label.toLowerCase().includes(needle) ||
        it.code.toLowerCase().includes(needle) ||
        it.hint.toLowerCase().includes(needle) ||
        (it.doc ?? '').toLowerCase().includes(needle) ||
        sectionLabel(it.section).toLowerCase().includes(needle) ||
        it.sources?.some((src) => src.title.toLowerCase().includes(needle)) ||
        it.vars?.some(
          (v) =>
            v.name.toLowerCase().includes(needle) ||
            v.label[lang].toLowerCase().includes(needle),
        ),
    );
  }, [q, lang, formulas]);

  const insert = (s: Snippet) => {
    const p = place();
    // plot со своими переменными: сначала блоки переменных выше,
    // затем график ниже — он видит их значения и пересчитывается от них
    const varLines = (s.vars ?? '').split('\n').map((l) => l.trim()).filter((l) => l.length > 0);
    if ((s.kind === 'plot' || s.kind === 'contour') && varLines.length > 0) {
      addBlocks(varLines, p.x, p.y);
      const gy = p.y + 64 * varLines.length;
      if (s.kind === 'plot') addPlotBlock(p.x, gy, s.code, s.plot);
      else addContourBlock(p.x, gy, s.code);
      useCanvasStore.getState().nudgeCross(0, 64 * varLines.length);
      return;
    }
    if (s.kind === 'plot') addPlotBlock(p.x, p.y, s.code, s.plot);
    else if (s.kind === 'contour') addContourBlock(p.x, p.y, s.code);
    else if (s.kind === 'program') addProgramBlock(p.x, p.y, s.code, s.exportName ?? '');
    else if (s.kind === 'sim') addSimBlock(p.x, p.y, s.code);
    else addBlock(p.x, p.y, s.code);
  };

  const insertFormula = (code: string) => {
    // каждую строку — отдельным блоком: так любую строку можно править точечно,
    // а порядок сверху-вниз сохраняет зависимости между строками
    const lines = code.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);
    if (lines.length <= 1) {
      const p = place();
      addBlock(p.x, p.y, code);
      return;
    }
    const p = place();
    addBlocks(lines, p.x, p.y);
    // place() уже увёл прицел на один шаг — дошагнуть под всю лесенку
    useCanvasStore.getState().nudgeCross(0, 140 * (lines.length - 1));
  };

  /** Вставка 2D/3D-графика или симуляции, привязанных к формуле */
  const insertPlot2d = (fn: string) => {
    const p = place();
    addPlotBlock(p.x, p.y, fn);
  };
  const insertPlot3d = (fn: string) => {
    const p = place();
    addPlot3dBlock(p.x, p.y, fn);
  };
  const insertSim = (modelId: string) => {
    const p = place();
    addSimBlock(p.x, p.y, modelId);
  };

  const close = () => setPaletteOpen(false);

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
            localStorage.setItem(posKey, JSON.stringify(np));
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
            savePaletteUi(variant);
          } else {
            setPos((p) => {
              try {
                localStorage.setItem(posKey, JSON.stringify(p));
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
  }, [setPaletteMode, posKey, variant]);

  const place = () => {
    // вставка — в точку прицела, прицел каскадом уходит вниз
    const st = useCanvasStore.getState();
    const p = { x: st.cross.x, y: st.cross.y };
    st.nudgeCross(0, 140);
    return p;
  };

  const header = (
    <div
      className="flex items-center gap-2 px-3 py-2.5 border-b border-[var(--chrome-line)] select-none cursor-grab active:cursor-grabbing touch-none"
      onPointerDown={(e) => {
        if ((e.target as HTMLElement).closest('input,button')) return;
        e.preventDefault();
        if (docked) {
          dockPend.current = { x: e.clientX, y: e.clientY };
        } else {
          floatDrag.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y };
        }
      }}
      title={t(formulas ? 'formulaPal.aria' : 'pal.aria')}
    >
      <span className="text-[var(--accent)] shrink-0" aria-hidden="true">
        {formulas ? <IFormula /> : <IFx />}
      </span>
      <label htmlFor={searchId} className="sr-only">
        {t(formulas ? 'formulaPal.searchLabel' : 'pal.searchLabel')}
      </label>
      <input
        id={searchId}
        className="nya-input flex-1 min-w-0 min-h-[34px] px-2.5 py-1 text-[13px]"
        placeholder={t(formulas ? 'formulaPal.searchPh' : 'pal.searchPh')}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onPointerDown={(e) => e.stopPropagation()}
        autoFocus={!docked}
      />
      <span className="math-input tabular-nums text-[11px] text-[var(--chrome-soft)] shrink-0">{items.length}</span>
      <button
        type="button"
        className="nya-tbtn w-8 h-8 shrink-0"
        onClick={close}
        aria-label={t(formulas ? 'formulaPal.close' : 'pal.close')}
      >
        <IX />
      </button>
    </div>
  );

  const list = (
    <div className="flex-1 min-h-0 overflow-y-auto px-2 pb-2">
      {sections.map((sec) => {
        const rows = items.filter((s) => s.section === sec.id);
        if (!rows.length) return null;
        const SecIcon = formulas ? IFormula : PACK_ICONS[sec.id as PackId];
        return (
          <div key={sec.id} className="mt-1.5">
            <div className="pal-pack flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-[var(--faint)] px-2 py-1.5 rounded-lg">
              <span aria-hidden="true">
                <SecIcon />
              </span>
              {sec.label}
              <span className="math-input normal-case font-normal tracking-normal opacity-70">{rows.length}</span>
            </div>
            {rows.map((s) => {
              const KindIcon = KIND_ICONS[s.kind];
              const pick = () => (s.snippet ? insert(s.snippet) : insertFormula(s.code));
              return (
                <div
                  key={s.key}
                  role="button"
                  tabIndex={0}
                  onClick={pick}
                  onKeyDown={(e) => {
                    // вложенные кнопки/ссылки обрабатывают клавиши сами
                    if ((e.target as HTMLElement).closest('button,a')) return;
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      pick();
                    }
                  }}
                  title={s.hint}
                  aria-label={s.label}
                  className="w-full text-left px-2 py-1.5 rounded-lg border border-transparent hover:border-[var(--chrome-line)] hover:bg-[var(--accent-soft)]/50 group transition-colors duration-120 ease-out cursor-pointer"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-[var(--accent)] shrink-0" aria-hidden="true">
                      <KindIcon />
                    </span>
                    <span className="text-[13px] leading-4 truncate">{s.label}</span>
                    <span className="ml-auto text-[var(--faint)] group-hover:text-[var(--accent)] group-hover:opacity-100 opacity-0 text-[15px] leading-4 shrink-0 transition-opacity" aria-hidden="true">
                      +
                    </span>
                  </div>
                  <div className="math-input text-[11.5px] leading-4 text-[var(--chrome-soft)] truncate pl-6 mt-0.5">
                    {s.code.split('\n')[0]}
                    {s.code.includes('\n') ? ' …' : ''}
                  </div>
                  {(s.doc ?? s.hint) && (
                    <div className="math-input text-[10.5px] leading-4 text-[var(--faint)] truncate pl-6 mt-0.5">
                      {s.doc ?? s.hint}
                    </div>
                  )}
                  {formulas && s.vars && s.vars.length > 0 && (
                    <div className="pl-6 mt-1">
                      <div className="text-[10px] uppercase tracking-[0.08em] text-[var(--faint)]">
                        {t('formulaPal.vars')}
                      </div>
                      {s.vars.map((v) => (
                        <div key={v.name} className="math-input text-[11px] leading-4 text-[var(--chrome-soft)] truncate">
                          <span className="text-[var(--accent)]">{v.name}</span>
                          {' — '}
                          {v.label[lang]}
                        </div>
                      ))}
                    </div>
                  )}
                  {(s.plot2d || s.plot3d || s.sim) && (
                    <div className="flex flex-wrap gap-1.5 pl-6 mt-1.5" onClick={(e) => e.stopPropagation()}>
                      {s.plot2d && (
                        <button
                          type="button"
                          className="text-[11px] px-2 min-h-[28px] rounded-lg border border-[var(--line)] text-[var(--ink-soft)] hover:border-[var(--accent-line)] hover:text-[var(--ink)] cursor-pointer"
                          title={t('formulaPal.plot2d')}
                          onClick={() => insertPlot2d(s.plot2d!)}
                        >
                          2D
                        </button>
                      )}
                      {s.plot3d && (
                        <button
                          type="button"
                          className="text-[11px] px-2 min-h-[28px] rounded-lg border border-[var(--line)] text-[var(--ink-soft)] hover:border-[var(--accent-line)] hover:text-[var(--ink)] cursor-pointer"
                          title={t('formulaPal.plot3d')}
                          onClick={() => insertPlot3d(s.plot3d!)}
                        >
                          3D
                        </button>
                      )}
                      {s.sim && (
                        <button
                          type="button"
                          className="text-[11px] px-2 min-h-[28px] rounded-lg border border-[var(--line)] text-[var(--ink-soft)] hover:border-[var(--accent-line)] hover:text-[var(--ink)] cursor-pointer"
                          title={t('formulaPal.sim')}
                          onClick={() => insertSim(s.sim!)}
                        >
                          ▶
                        </button>
                      )}
                    </div>
                  )}
                  {formulas && s.sources && s.sources.length > 0 && (
                    <div className="flex flex-wrap gap-x-2 gap-y-0.5 pl-6 mt-1">
                      {s.sources.map((src) => (
                        <a
                          key={src.url}
                          href={src.url}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="text-[10.5px] leading-4 text-[var(--accent)] underline truncate max-w-full"
                        >
                          {src.title}
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}
      {items.length === 0 && <div className="text-[13px] text-[var(--chrome-soft)] p-3">{t(formulas ? 'formulaPal.empty' : 'pal.empty')}</div>}
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
          savePaletteUi(variant);
        }}
        onPointerCancel={() => {
          dockResizeRef.current = null;
        }}
      />
    );
    return (
      <div
        className="h-full shrink-0 flex items-stretch bg-[var(--chrome)] text-[var(--chrome-ink)]"
        style={{ width: dockW }}
        role="complementary"
        aria-label={t(formulas ? 'formulaPal.aria' : 'pal.aria')}
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
        className="nya-palette-float fixed z-50 flex flex-col rounded-xl border border-[var(--chrome-line)] bg-[var(--chrome)] text-[var(--chrome-ink)] shadow-2xl"
        style={{ left: pos.x, top: pos.y, width: palW, height: Math.min(palH, window.innerHeight - pos.y - 8) }}
        role="dialog"
        aria-label={t(formulas ? 'formulaPal.aria' : 'pal.aria')}
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
            savePaletteUi(variant);
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
