import { useEffect, useRef, useState } from 'react';
import { useCanvasStore, type PaletteTab } from '../store/canvasStore';
import { t } from '../i18n';
import { IConst, IField, IFx, IFormula, IGrip, IResize, ISignal, IX } from './Icon';
import { hideGhostFixed, moveGhostFixed, showGhostFixed } from './dragGhost';
import PaletteContent from './PaletteContent';
import ElementsContent from './ElementsContent';
import VariablesContent from './VariablesContent';
import { loadDetachedDockW, loadDetachedPos, loadDetachedSize, saveDetachedDockW, saveDetachedPos, saveDetachedSize } from '../lib/detachedPos';

/** Зона прилипания к краям экрана, px */
const SNAP_ZONE = 28;
/** Сдвиг, после которого тяга док-панели превращается в открепление */
const UNDOCK_DIST = 14;

const META: Record<PaletteTab, { icon: () => React.JSX.Element; menuKey: 'menu.palette' | 'menu.formulaPalette' | 'menu.constPalette' | 'menu.elemPalette' | 'menu.scopeMon' }> = {
  functions: { icon: IFx, menuKey: 'menu.palette' },
  formulas: { icon: IFormula, menuKey: 'menu.formulaPalette' },
  constants: { icon: IConst, menuKey: 'menu.constPalette' },
  elements: { icon: IField, menuKey: 'menu.elemPalette' },
  variables: { icon: ISignal, menuKey: 'menu.scopeMon' },
};

/**
 * Отдельное окно вынесенной вкладки (tear-off из единого окна).
 * float — окно поверх всего (перетаскивание + ресайз + прилипание к краям),
 * left/right — док-панель на всю высоту стороны (тяга за шапку открепляет).
 * Esc/крестик — закрыть вкладку.
 * Возврат обратно: бросить окно на единое окно палитр или двойной клик по шапке.
 */
export default function DetachedTabWindow({ tab, onOpenNavigator }: { tab: PaletteTab; onOpenNavigator?: () => void }) {
  const Icon = META[tab].icon;
  const title = t(META[tab].menuKey);
  // подписка ради перерендера при смене языка
  useCanvasStore((s) => s.lang);
  const side = useCanvasStore((s) => s.detachedSide[tab]);
  const docked = side === 'left' || side === 'right';
  const [pos, setPos] = useState(() => loadDetachedPos(tab));
  const [size, setSize] = useState(() => loadDetachedSize(tab));
  const [dockW, setDockW] = useState(() => loadDetachedDockW(tab));
  const [snap, setSnap] = useState<'left' | 'right' | null>(null);
  const dragRef = useRef<{
    px: number; py: number;
    ox: number; oy: number;
    gx: number; gy: number;
    w: number; h: number;
    fromDock: boolean; moved: boolean;
  } | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const resizeRef = useRef<{ x: number; y: number; w: number; h: number } | null>(null);
  const dockResizeRef = useRef<{ start: number; size: number } | null>(null);

  const close = () => {
    const st = useCanvasStore.getState();
    if (tab === 'functions') st.setPaletteOpen(false);
    else if (tab === 'formulas') st.setFormulaPaletteOpen(false);
    else if (tab === 'constants') st.setConstPaletteOpen(false);
    else if (tab === 'elements') st.toggleElemPalette();
    else if (st.scopeMonOpen) st.toggleScopeMon();
  };

  const dockBack = () => useCanvasStore.getState().attachTab(tab);

  // Перетаскивание: едет лёгкая тень, финал — разом на отпускании.
  // Край экрана — стыковка док-панелью, единое окно палитр — возврат вкладки.
  useEffect(() => {
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
        e.clientX <= SNAP_ZONE ? 'left'
        : e.clientX >= window.innerWidth - SNAP_ZONE ? 'right'
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
      const snapped = e.clientX <= SNAP_ZONE ? 'left' : e.clientX >= window.innerWidth - SNAP_ZONE ? 'right' : null;
      setSnap(null);
      const st = useCanvasStore.getState();
      if (snapped) {
        // отпустили у края — пристыковать на всю сторону (позицию помним для открепления)
        setPos({ x: nx, y: ny });
        saveDetachedPos(tab, nx, ny);
        st.setDetachedSide(tab, snapped);
        return;
      }
      // бросили на единое окно — вернуть вкладку в общий ряд
      const root = document.querySelector('[data-unified-palette]');
      const r = root?.getBoundingClientRect();
      if (r && e.clientX >= r.left - 8 && e.clientX <= r.right + 8 && e.clientY >= r.top - 8 && e.clientY <= r.bottom + 8) {
        st.attachTab(tab);
        return;
      }
      // в чистом поле — плавающее окно; тянули док — открепляем
      setPos({ x: nx, y: ny });
      saveDetachedPos(tab, nx, ny);
      st.setDetachedSide(tab, 'float');
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
  }, [tab]);

  const startDrag = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;
    e.preventDefault();
    const rect = rootRef.current?.getBoundingClientRect();
    if (!rect) return;
    dragRef.current = {
      px: e.clientX, py: e.clientY,
      ox: rect.left, oy: rect.top,
      gx: e.clientX - rect.left, gy: e.clientY - rect.top,
      w: rect.width, h: rect.height,
      fromDock: docked,
      moved: false,
    };
  };

  const closeBtn = (
    <button
      type="button"
      className="nya-tbtn w-8 h-8 shrink-0"
      onClick={close}
      aria-label={t('palTab.closeAll')}
      title={t('palTab.closeAll')}
    >
      <IX />
    </button>
  );

  const header = (
    <div
      className="flex items-center gap-2 px-3 py-2.5 select-none cursor-grab active:cursor-grabbing touch-none"
      onPointerDown={startDrag}
      onDoubleClick={dockBack}
      title={`${title} · ${t('detached.backHint')}`}
    >
        <span className="text-[var(--faint)] text-[13px] leading-none tracking-tighter shrink-0" aria-hidden="true">
          <IGrip />
        </span>
      <span className="text-[var(--accent)] shrink-0" aria-hidden="true">
        <Icon />
      </span>
      <span className="flex-1 min-w-0 truncate text-[13px] font-medium">{title}</span>
      {closeBtn}
    </div>
  );

  const content = tab === 'variables'
    ? <VariablesContent onOpenNavigator={onOpenNavigator} />
    : tab === 'elements'
    ? <ElementsContent />
    : <PaletteContent variant={tab} />;

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      close();
    }
  };

  if (docked) {
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
          setDockW(Math.min(640, Math.max(280, Math.round(st.size + (side === 'left' ? dx : -dx)))));
        }}
        onPointerUp={() => {
          dockResizeRef.current = null;
          saveDetachedDockW(tab, dockW);
        }}
        onPointerCancel={() => {
          dockResizeRef.current = null;
        }}
      />
    );
    return (
      <div
        ref={rootRef}
        className={`h-full shrink-0 flex items-stretch bg-[var(--chrome)] text-[var(--chrome-ink)] ${
          side === 'left' ? 'border-r' : 'border-l'
        } border-[var(--chrome-line)]`}
        style={{ width: dockW, order: side === 'left' ? 1 : 3 }}
        role="complementary"
        aria-label={title}
        onKeyDown={onKey}
      >
        {side === 'right' && gutter}
        <div className="flex-1 min-w-0 flex flex-col min-h-0">
          {header}
          {content}
        </div>
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
            snap === 'left' ? 'left-0 top-11 bottom-0 w-[300px] max-w-[40vw] rounded-r-xl'
            : 'right-0 top-11 bottom-0 w-[300px] max-w-[40vw] rounded-l-xl'
          }`}
        />
      )}
      <div
        ref={rootRef}
        className="nya-palette-float fixed z-50 flex flex-col rounded-xl border border-[var(--chrome-line)] bg-[var(--chrome)] text-[var(--chrome-ink)]"
        style={{ left: pos.x, top: pos.y, width: size.w, height: Math.min(size.h, window.innerHeight - pos.y - 8) }}
        role="dialog"
        aria-label={title}
        onKeyDown={onKey}
      >
        {header}
        {content}
        {/* ручка ресайза */}
        <span
          role="separator"
          aria-orientation="horizontal"
          aria-label={t('pal.resize')}
          title={t('pal.resize')}
          className="absolute -right-2 -bottom-2 p-1.5 cursor-nwse-resize text-[var(--faint)] hover:text-[var(--accent-line)] select-none touch-none"
          onPointerDown={(e) => {
            e.stopPropagation();
            resizeRef.current = { x: e.clientX, y: e.clientY, w: size.w, h: size.h };
            (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => {
            const st = resizeRef.current;
            if (!st) return;
            setSize({
              w: Math.min(720, Math.max(320, Math.round(st.w + (e.clientX - st.x)))),
              h: Math.min(1200, Math.max(320, Math.round(st.h + (e.clientY - st.y)))),
            });
          }}
          onPointerUp={() => {
            resizeRef.current = null;
            saveDetachedSize(tab, size.w, size.h);
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
