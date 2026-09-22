import { useEffect, useMemo, useRef, useState } from 'react';
import {
  saveUnifiedUi,
  useCanvasStore,
  type PaletteMode,
  type PaletteTab,
} from '../store/canvasStore';
import { t } from '../i18n';
import { IConst, IField, IFx, IFormula, IResize, ISignal, IX } from './Icon';
import { hideGhostFixed, moveGhostFixed, showGhostFixed } from './dragGhost';
import PaletteContent from './PaletteContent';
import ElementsContent from './ElementsContent';
import VariablesContent from './VariablesContent';
import { saveDetachedPos } from '../lib/detachedPos';
import { collectScopeVars } from '../lib/scopeVars';

const POS_KEY = 'nyamath-unified-palette-pos';
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

interface TabDef {
  id: PaletteTab;
  enabled: boolean;
  icon: () => React.JSX.Element;
  label: string;
  title: string;
}

/**
 * Единое окно палитр: функции / формулы / константы / переменные
 * в одном окне с переключением через вкладки.
 * float — окно поверх всего (перетаскивание + ресайз + прилипание к краям),
 * left/right — док-панель на всю высоту стороны. Вкл/выкл вкладок — через меню «Вид».
 */
export default function UnifiedPalette({ onOpenNavigator }: { onOpenNavigator?: () => void }) {
  const paletteOpen = useCanvasStore((s) => s.paletteOpen);
  const formulaPaletteOpen = useCanvasStore((s) => s.formulaPaletteOpen);
  const constPaletteOpen = useCanvasStore((s) => s.constPaletteOpen);
  const elemPaletteOpen = useCanvasStore((s) => s.elemPaletteOpen);
  const scopeMonOpen = useCanvasStore((s) => s.scopeMonOpen);
  const setPaletteOpen = useCanvasStore((s) => s.setPaletteOpen);
  const setFormulaPaletteOpen = useCanvasStore((s) => s.setFormulaPaletteOpen);
  const setConstPaletteOpen = useCanvasStore((s) => s.setConstPaletteOpen);
  const toggleElemPalette = useCanvasStore((s) => s.toggleElemPalette);
  const toggleScopeMon = useCanvasStore((s) => s.toggleScopeMon);
  const tab = useCanvasStore((s) => s.paletteTab);
  const setTab = useCanvasStore((s) => s.setPaletteTab);
  const mode = useCanvasStore((s) => s.unifiedMode);
  const palW = useCanvasStore((s) => s.unifiedW);
  const palH = useCanvasStore((s) => s.unifiedH);
  const setPaletteSize = useCanvasStore((s) => s.setUnifiedSize);
  const dockW = useCanvasStore((s) => s.unifiedDockW);
  const setDockW = useCanvasStore((s) => s.setUnifiedDockW);
  const blocks = useCanvasStore((s) => s.blocks);
  // подписка ради перерендера при смене языка
  useCanvasStore((s) => s.lang);

  const [pos, setPos] = useState(loadPos);
  const [snap, setSnap] = useState<PaletteMode | null>(null);
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
  const resizeRef = useRef<{
    x: number;
    y: number;
    w: number;
    h: number;
  } | null>(null);
  const dockResizeRef = useRef<{ start: number; size: number } | null>(null);
  // вытягивание вкладки в отдельное окно: жест начинается на кнопке вкладки
  const tearRef = useRef<{
    tab: PaletteTab;
    sx: number;
    sy: number;
    x: number;
    y: number;
    w: number;
    h: number;
    dragging: boolean;
  } | null>(null);
  const suppressClickRef = useRef(false);
  const detached = useCanvasStore((s) => s.detachedTabs);

  // единое окно показывает только невынесенные вкладки
  const visible =
    (paletteOpen && !detached.includes('functions')) ||
    (formulaPaletteOpen && !detached.includes('formulas')) ||
    (constPaletteOpen && !detached.includes('constants')) ||
    (elemPaletteOpen && !detached.includes('elements')) ||
    (scopeMonOpen && !detached.includes('variables'));
  const varCount = useMemo(() => collectScopeVars(blocks).length, [blocks]);

  const tabs: TabDef[] = useMemo(
    () => [
      {
        id: 'functions',
        enabled: paletteOpen,
        icon: IFx,
        label: t('palTab.functions'),
        title: t('menu.palette'),
      },
      {
        id: 'formulas',
        enabled: formulaPaletteOpen,
        icon: IFormula,
        label: t('palTab.formulas'),
        title: t('menu.formulaPalette'),
      },
      {
        id: 'constants',
        enabled: constPaletteOpen,
        icon: IConst,
        label: t('palTab.constants'),
        title: t('menu.constPalette'),
      },
      {
        id: 'elements',
        enabled: elemPaletteOpen,
        icon: IField,
        label: t('palTab.elements'),
        title: t('menu.elemPalette'),
      },
      {
        id: 'variables',
        enabled: scopeMonOpen,
        icon: ISignal,
        label: t('palTab.variables'),
        title: t('menu.scopeMon'),
      },
    ],
    [paletteOpen, formulaPaletteOpen, constPaletteOpen, elemPaletteOpen, scopeMonOpen],
  );

  const shown = tabs.filter((x) => !detached.includes(x.id));
  const active: TabDef =
    shown.find((x) => x.id === tab && x.enabled) ?? shown.find((x) => x.enabled) ?? shown[0];

  // Перетаскивание единого окна: оригинал стоит, едет лёгкая тень,
  // финал коммитится разом на отпускании.
  useEffect(() => {
    if (!visible) return;
    const onMove = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const dx = e.clientX - d.px;
      const dy = e.clientY - d.py;
      if (!d.moved) {
        const thresh = d.fromDock ? UNDOCK_DIST : 3;
        if (Math.abs(dx) + Math.abs(dy) <= thresh) return;
        d.moved = true;
        showGhostFixed([{ x: d.ox, y: d.oy, w: d.w, h: d.h }]);
      }
      moveGhostFixed(dx, dy);
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
      const snapped =
        e.clientX <= SNAP_ZONE
          ? 'left'
          : e.clientX >= window.innerWidth - SNAP_ZONE
            ? 'right'
            : null;
      setSnap(null);
      if (snapped) {
        // отпустили у края — пристыковать единое окно на всю сторону
        try {
          localStorage.setItem(POS_KEY, JSON.stringify({ x: nx, y: ny }));
        } catch {
          /* ignore */
        }
        const st = useCanvasStore.getState();
        st.setUnifiedMode(snapped);
        // старые раздельные режимы больше не рисуются, но держим их в синхроне
        st.setPaletteMode(snapped);
        st.setFormulaPaletteMode(snapped);
        st.setConstPaletteMode(snapped);
        saveUnifiedUi();
      } else {
        // в чистом поле — плавающее окно; тянули док — открепляем
        setPos({ x: nx, y: ny });
        try {
          localStorage.setItem(POS_KEY, JSON.stringify({ x: nx, y: ny }));
        } catch {
          /* ignore */
        }
        if (d.fromDock) {
          const st = useCanvasStore.getState();
          st.setUnifiedMode('float');
          saveUnifiedUi();
        }
      }
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
  }, [visible]);

  if (!visible) return null;

  const selectTab = (id: PaletteTab) => {
    if (id === 'functions' && !paletteOpen) {
      setPaletteOpen(true);
      return;
    }
    if (id === 'formulas' && !formulaPaletteOpen) {
      setFormulaPaletteOpen(true);
      return;
    }
    if (id === 'constants' && !constPaletteOpen) {
      setConstPaletteOpen(true);
      return;
    }
    if (id === 'elements' && !elemPaletteOpen) {
      toggleElemPalette();
      return;
    }
    if (id === 'variables' && !scopeMonOpen) {
      toggleScopeMon();
      return;
    }
    setTab(id);
  };

  /** Вытягивание вкладки в отдельное окно: потянули кнопку дальше порога
   *  и отпустили вне единого окна — вкладка отрывается (tear-off). */
  const onTabPointerDown = (e: React.PointerEvent, id: PaletteTab) => {
    if (e.button > 0) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    tearRef.current = {
      tab: id,
      sx: e.clientX,
      sy: e.clientY,
      x: rect.left,
      y: rect.top,
      w: rect.width,
      h: rect.height,
      dragging: false,
    };
    const onMove = (ev: PointerEvent) => {
      const g = tearRef.current;
      if (!g) return;
      const dx = ev.clientX - g.sx;
      const dy = ev.clientY - g.sy;
      if (!g.dragging) {
        if (Math.abs(dx) + Math.abs(dy) <= 10) return;
        g.dragging = true;
        suppressClickRef.current = true;
        showGhostFixed([{ x: g.x, y: g.y, w: g.w, h: g.h }]);
      }
      moveGhostFixed(dx, dy);
    };
    const cleanup = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
    };
    const onCancel = () => {
      tearRef.current = null;
      suppressClickRef.current = false;
      hideGhostFixed();
      cleanup();
    };
    const onUp = (ev: PointerEvent) => {
      const g = tearRef.current;
      tearRef.current = null;
      cleanup();
      if (!g?.dragging) return;
      hideGhostFixed();
      // отпустили внутри единого окна — просто выбор вкладки
      const root = document.querySelector('[data-unified-palette]');
      const r = root?.getBoundingClientRect();
      if (
        r &&
        ev.clientX >= r.left - 8 &&
        ev.clientX <= r.right + 8 &&
        ev.clientY >= r.top - 8 &&
        ev.clientY <= r.bottom + 8
      ) {
        suppressClickRef.current = false;
        selectTab(g.tab);
        return;
      }
      // наружу — вынести в отдельное окно в точке дропа
      const st = useCanvasStore.getState();
      if (g.tab === 'functions' && !st.paletteOpen) st.setPaletteOpen(true);
      else if (g.tab === 'formulas' && !st.formulaPaletteOpen) st.setFormulaPaletteOpen(true);
      else if (g.tab === 'constants' && !st.constPaletteOpen) st.setConstPaletteOpen(true);
      else if (g.tab === 'elements' && !st.elemPaletteOpen) st.toggleElemPalette();
      else if (g.tab === 'variables' && !st.scopeMonOpen) st.toggleScopeMon();
      saveDetachedPos(g.tab, ev.clientX - 60, ev.clientY - 20);
      st.detachTab(g.tab);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
  };

  const onTabClick = (id: PaletteTab) => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    selectTab(id);
  };

  const closeAll = () => {
    if (paletteOpen) setPaletteOpen(false);
    if (formulaPaletteOpen) setFormulaPaletteOpen(false);
    if (constPaletteOpen) setConstPaletteOpen(false);
    if (elemPaletteOpen) toggleElemPalette();
    if (scopeMonOpen) toggleScopeMon();
  };

  const startDrag = (e: React.PointerEvent) => {
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
      fromDock: mode !== 'float',
      moved: false,
    };
  };

  const content =
    active.id === 'functions' ? (
      <PaletteContent variant="functions" />
    ) : active.id === 'formulas' ? (
      <PaletteContent variant="formulas" />
    ) : active.id === 'constants' ? (
      <PaletteContent variant="constants" />
    ) : active.id === 'elements' ? (
      <ElementsContent />
    ) : (
      <VariablesContent onOpenNavigator={onOpenNavigator} />
    );

  // Вертикальный rail вкладок (как activity bar в VS Code): только иконки,
  // тяга окна — за свободное место, отрыв вкладки — жестом с иконки.
  const rail = (
    <div
      className="shrink-0 w-12 flex flex-col items-stretch py-1.5 cursor-grab active:cursor-grabbing touch-none select-none border-r border-[var(--chrome-line)]"
      role="tablist"
      aria-orientation="vertical"
      aria-label={t('palTab.aria')}
      onPointerDown={startDrag}
    >
      {shown.map((tb) => {
        const Icon = tb.icon;
        const isActive = tb.id === active.id;
        return (
          <button
            key={tb.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            title={`${tb.title} · ${t('palTab.tearHint')}`}
            onPointerDown={(e) => onTabPointerDown(e, tb.id)}
            onClick={() => onTabClick(tb.id)}
            className={`relative flex items-center justify-center min-h-[44px] text-[16px] cursor-pointer transition-colors ${
              isActive
                ? 'text-[var(--chrome-ink)]'
                : 'text-[var(--faint)] hover:text-[var(--chrome-soft)]'
            }`}
          >
            <span
              aria-hidden="true"
              className="absolute left-0 top-1/2 -translate-y-1/2 w-[2px] h-6 rounded-full"
              style={{
                background: isActive ? 'var(--accent-line)' : 'transparent',
              }}
            />
            <Icon />
            {tb.id === 'variables' && (
              <span className="math-input tabular-nums text-[9px] opacity-70 absolute bottom-0.5">
                {varCount}
              </span>
            )}
          </button>
        );
      })}
      <div className="flex-1" aria-hidden="true" />
      <button
        type="button"
        className="nya-tbtn w-8 h-8 self-center"
        onClick={closeAll}
        aria-label={t('palTab.closeAll')}
        title={t('palTab.closeAll')}
      >
        <IX />
      </button>
    </div>
  );

  if (mode !== 'float') {
    const side = mode;
    const gutter = (
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label={t('pal.resize')}
        title={t('pal.resize')}
        className="w-[7px] shrink-0 cursor-ew-resize hover:bg-white/10 active:bg-white/15 touch-none"
        onPointerDown={(e) => {
          dockResizeRef.current = { start: e.clientX, size: dockW };
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          const st = dockResizeRef.current;
          if (!st) return;
          const dx = e.clientX - st.start;
          setDockW(st.size + (side === 'left' ? dx : -dx));
        }}
        onPointerUp={() => {
          dockResizeRef.current = null;
          saveUnifiedUi();
        }}
        onPointerCancel={() => {
          dockResizeRef.current = null;
        }}
      />
    );
    return (
      <div
        ref={rootRef}
        data-unified-palette="1"
        className={`h-full shrink-0 flex items-stretch bg-[var(--chrome)] text-[var(--chrome-ink)] ${
          side === 'left' ? 'border-r' : 'border-l'
        } border-[var(--chrome-line)]`}
        style={{ width: dockW, order: side === 'left' ? 1 : 3 }}
        role="complementary"
        aria-label={t('palTab.aria')}
      >
        {side === 'right' && gutter}
        {rail}
        <div className="flex-1 min-w-0 flex flex-col min-h-0">{content}</div>
        {side === 'left' && gutter}
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
        data-unified-palette="1"
        className="nya-palette-float fixed z-50 flex flex-row rounded-xl border border-[var(--chrome-line)] bg-[var(--chrome)] text-[var(--chrome-ink)]"
        style={{
          left: pos.x,
          top: pos.y,
          width: palW,
          height: Math.min(palH, window.innerHeight - pos.y - 8),
        }}
        role="dialog"
        aria-label={t('palTab.aria')}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.stopPropagation();
            closeAll();
          }
        }}
      >
        {rail}
        <div className="flex-1 min-w-0 flex flex-col min-h-0">{content}</div>
        {/* ручка ресайза */}
        <span
          role="separator"
          aria-orientation="horizontal"
          aria-label={t('pal.resize')}
          title={t('pal.resize')}
          className="absolute -right-2 -bottom-2 p-1.5 cursor-nwse-resize text-[var(--faint)] hover:text-[var(--accent-line)] select-none touch-none"
          onPointerDown={(e) => {
            e.stopPropagation();
            resizeRef.current = {
              x: e.clientX,
              y: e.clientY,
              w: palW,
              h: palH,
            };
            (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => {
            const st = resizeRef.current;
            if (!st) return;
            setPaletteSize(st.w + (e.clientX - st.x), st.h + (e.clientY - st.y));
          }}
          onPointerUp={() => {
            resizeRef.current = null;
            saveUnifiedUi();
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
