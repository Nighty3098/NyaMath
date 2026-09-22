import { useEffect, useRef, useState } from 'react';
import { savePaletteUi, useCanvasStore, type PaletteMode } from '../store/canvasStore';
import { t } from '../i18n';
import { IConst, IFx, IFormula, IResize, IX } from './Icon';
import { hideGhostFixed, moveGhostFixed, showGhostFixed } from './dragGhost';
import PaletteContent, { type PaletteVariant } from './PaletteContent';

export type { PaletteVariant };

const POS_KEY = 'nyamath-palette-pos';
const POS_KEY_LEGACY = 'wengineering-palette-pos';
const FORMULA_POS_KEY = 'nyamath-formula-palette-pos';
const CONST_POS_KEY = 'nyamath-const-palette-pos';

/** Зона прилипания к краям экрана, px */
const SNAP_ZONE = 28;
/** Сдвиг, после которого тяга док-панели превращается в открепление */
const UNDOCK_DIST = 14;

function loadPos(variant: PaletteVariant): { x: number; y: number } {
  const fallback =
    variant === 'formulas'
      ? { x: 48, y: 88 }
      : variant === 'constants'
        ? { x: 128, y: 48 }
        : { x: 8, y: 48 };
  try {
    const raw =
      variant === 'formulas'
        ? localStorage.getItem(FORMULA_POS_KEY)
        : variant === 'constants'
          ? localStorage.getItem(CONST_POS_KEY)
          : (localStorage.getItem(POS_KEY) ?? localStorage.getItem(POS_KEY_LEGACY));
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
 * Раздельная палитра (legacy): float — окно поверх всего, left/right — док.
 * Новое единое окно с вкладками — UnifiedPalette; этот компонент оставлен
 * для совместимости и переиспользует PaletteContent.
 */
export default function FunctionPalette({ variant = 'functions' }: { variant?: PaletteVariant }) {
  const formulas = variant === 'formulas';
  const consts = variant === 'constants';
  const posKey = formulas ? FORMULA_POS_KEY : consts ? CONST_POS_KEY : POS_KEY;
  const setPaletteOpen = useCanvasStore((s) =>
    formulas ? s.setFormulaPaletteOpen : consts ? s.setConstPaletteOpen : s.setPaletteOpen,
  );
  const mode = useCanvasStore((s) =>
    formulas ? s.formulaPaletteMode : consts ? s.constPaletteMode : s.paletteMode,
  );
  const setPaletteMode = useCanvasStore((s) =>
    formulas ? s.setFormulaPaletteMode : consts ? s.setConstPaletteMode : s.setPaletteMode,
  );
  const palW = useCanvasStore((s) =>
    formulas ? s.formulaPaletteW : consts ? s.constPaletteW : s.paletteW,
  );
  const palH = useCanvasStore((s) =>
    formulas ? s.formulaPaletteH : consts ? s.constPaletteH : s.paletteH,
  );
  const setPaletteSize = useCanvasStore((s) =>
    formulas ? s.setFormulaPaletteSize : consts ? s.setConstPaletteSize : s.setPaletteSize,
  );
  // подписка ради перерендера при смене языка
  useCanvasStore((s) => s.lang);
  const [pos, setPos] = useState(() => loadPos(variant));
  const [snap, setSnap] = useState<PaletteMode | null>(null);
  // перетаскивание окна: живёт в ref'е, едет только лёгкая тень (как у блоков),
  // оригинал стоит на месте до отпускания — ноль ре-рендеров в ходе жеста
  const dragRef = useRef<{
    px: number;
    py: number;
    ox: number;
    oy: number;
    gx: number;
    gy: number;
    w: number;
    h: number;
    fromDock: boolean;
    moved: boolean;
  } | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const resizeRef = useRef<{ x: number; y: number; w: number; h: number } | null>(null);

  const docked = mode !== 'float';

  const close = () => setPaletteOpen(false);

  // Единый цикл перетаскивания на window: оригинал стоит, едет лёгкая тень
  // (как у блоков), финал коммитится разом на отпускании.
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const dx = e.clientX - d.px;
      const dy = e.clientY - d.py;
      if (!d.moved) {
        // док-панель: толчок до UNDOCK_DIST; окно — порог 3px
        const thresh = d.fromDock ? UNDOCK_DIST : 3;
        if (Math.abs(dx) + Math.abs(dy) <= thresh) return;
        d.moved = true;
        showGhostFixed([{ x: d.ox, y: d.oy, w: d.w, h: d.h }]);
      }
      moveGhostFixed(dx, dy);
      // подсветка зоны прилипания: ближе к левому краю → left, правому → right
      setSnap(
        e.clientX <= SNAP_ZONE
          ? 'left'
          : e.clientX >= window.innerWidth - SNAP_ZONE
            ? 'right'
            : null,
      );
    };
    const onUp = (e: PointerEvent) => {
      const d = dragRef.current;
      dragRef.current = null;
      if (!d?.moved) return;
      hideGhostFixed();
      const nx = Math.min(Math.max(-320, e.clientX - d.gx), window.innerWidth - 80);
      const ny = Math.min(Math.max(0, e.clientY - d.gy), window.innerHeight - 60);
      setSnap((s) => {
        if (s) {
          // отпустили у края — пристыковать на всю сторону
          // если место уже занято другой палитрой — пересадить её на противоположную
          const st = useCanvasStore.getState();
          const paired = s === 'left' ? 'right' : 'left';
          const others: { mode: PaletteMode; set: (m: PaletteMode) => void }[] =
            variant === 'functions'
              ? [
                  { mode: st.formulaPaletteMode, set: st.setFormulaPaletteMode },
                  { mode: st.constPaletteMode, set: st.setConstPaletteMode },
                ]
              : variant === 'formulas'
                ? [
                    { mode: st.paletteMode, set: st.setPaletteMode },
                    { mode: st.constPaletteMode, set: st.setConstPaletteMode },
                  ]
                : [
                    { mode: st.paletteMode, set: st.setPaletteMode },
                    { mode: st.formulaPaletteMode, set: st.setFormulaPaletteMode },
                  ];
          for (const o of others) {
            if (o.mode === s) o.set(paired);
          }
          setPaletteMode(s);
          savePaletteUi(variant);
        } else {
          // тянули док-панель — открепляем в плавающее окно
          if (d.fromDock) setPaletteMode('float');
          setPos({ x: nx, y: ny });
          try {
            localStorage.setItem(posKey, JSON.stringify({ x: nx, y: ny }));
          } catch {
            /* ignore */
          }
        }
        return null;
      });
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      hideGhostFixed();
    };
  }, [setPaletteMode, posKey, variant]);

  const header = (
    <div
      className="flex items-center gap-2 px-3 py-2.5 border-b border-[var(--chrome-line)] select-none cursor-grab active:cursor-grabbing touch-none"
      onPointerDown={(e) => {
        if ((e.target as HTMLElement).closest('input,button')) return;
        e.preventDefault();
        const rect = rootRef.current?.getBoundingClientRect();
        if (!rect) return;
        dragRef.current = {
          px: e.clientX,
          py: e.clientY,
          ox: rect.left,
          oy: rect.top,
          gx: e.clientX - rect.left,
          gy: e.clientY - rect.top,
          w: rect.width,
          h: rect.height,
          fromDock: docked,
          moved: false,
        };
      }}
      title={t(formulas ? 'formulaPal.aria' : consts ? 'constPal.aria' : 'pal.aria')}
    >
      <span className="text-[var(--accent)] shrink-0" aria-hidden="true">
        {formulas ? <IFormula /> : consts ? <IConst /> : <IFx />}
      </span>
      <span className="flex-1 min-w-0 truncate text-[13px] font-medium">
        {t(formulas ? 'formulaPal.aria' : consts ? 'constPal.aria' : 'pal.aria')}
      </span>
      <button
        type="button"
        className="nya-tbtn w-8 h-8 shrink-0"
        onClick={close}
        aria-label={t(formulas ? 'formulaPal.close' : consts ? 'constPal.close' : 'pal.close')}
      >
        <IX />
      </button>
    </div>
  );

  if (docked) {
    // пристыкованный режим: зону (ширина, рамка, ручка ресайза) строит App.zone,
    // палитра лишь занимает выделенное место и тянется на всю высоту
    return (
      <div
        ref={rootRef}
        className="flex-1 min-h-0 min-w-0 flex flex-col bg-[var(--chrome)] text-[var(--chrome-ink)]"
      >
        {header}
        <PaletteContent variant={variant} />
      </div>
    );
  }

  return (
    <>
      {/* подсветка зоны прилипания */}
      {snap && (
        <div
          aria-hidden="true"
          className={`fixed z-40 pointer-events-none border-2 border-dashed border-[var(--accent-line)] bg-[var(--accent-soft)] ${
            snap === 'left'
              ? 'left-0 top-11 bottom-0 w-[300px] max-w-[40vw] rounded-r-xl'
              : 'right-0 top-11 bottom-0 w-[300px] max-w-[40vw] rounded-l-xl'
          }`}
        />
      )}
      <div
        ref={rootRef}
        className="nya-palette-float fixed z-50 flex flex-col rounded-xl border border-[var(--chrome-line)] bg-[var(--chrome)] text-[var(--chrome-ink)]"
        style={{
          left: pos.x,
          top: pos.y,
          width: palW,
          height: Math.min(palH, window.innerHeight - pos.y - 8),
        }}
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
        <PaletteContent variant={variant} autoFocus={!docked} />
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
          <span className="inline-block rotate-90" aria-hidden="true">
            <IResize />
          </span>
        </span>
      </div>
    </>
  );
}
