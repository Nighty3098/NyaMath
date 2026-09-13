import { useCallback, useEffect, useRef, useState } from 'react';
import { useCanvasStore } from '../store/canvasStore';
import MathBlockView from './MathBlockView';
import PlotBlockView from './PlotBlockView';
import Plot3dBlockView from './Plot3dBlockView';
import ProgramBlockView from './ProgramBlockView';

const MIN_SCALE = 0.25;
const MAX_SCALE = 3;
// Скорость догоняющей анимации зума (меньше — плавнее)
const ZOOM_EASE = 0.16;

interface View {
  x: number;
  y: number;
  k: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export default function Canvas() {
  const blocks = useCanvasStore((s) => s.blocks);
  const showGrid = useCanvasStore((s) => s.showGrid);
  const addBlock = useCanvasStore((s) => s.addBlock);
  const recalc = useCanvasStore((s) => s.recalc);
  const removeSelected = useCanvasStore((s) => s.removeSelected);
  const selectedIds = useCanvasStore((s) => s.selectedIds);
  const select = useCanvasStore((s) => s.select);
  const selectMany = useCanvasStore((s) => s.selectMany);

  const [view, setView] = useState<View>({ x: 80, y: 40, k: 1 });
  // Цель анимации: колесо меняет target, rAF плавно догоняет view -> target
  const targetRef = useRef<View>({ x: 80, y: 40, k: 1 });
  const viewRef = useRef<View>({ x: 80, y: 40, k: 1 });

  const containerRef = useRef<HTMLDivElement>(null);
  const panRef = useRef<{ px: number; py: number } | null>(null);
  const [panning, setPanning] = useState(false);
  const [spaceDown, setSpaceDown] = useState(false);
  const spaceRef = useRef(false);

  // Плавное догоняние цели (только зум/панорама от колеса и кнопок).
  // При prefers-reduced-motion — мгновенно, без анимации.
  const reducedRef = useRef(
    typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
  );
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const t = targetRef.current;
      const ease = reducedRef.current ? 1 : ZOOM_EASE;
      setView((v) => {
        const dx = t.x - v.x;
        const dy = t.y - v.y;
        const dk = t.k - v.k;
        if (Math.abs(dx) < 0.05 && Math.abs(dy) < 0.05 && Math.abs(dk) < 0.0004) {
          return v.x === t.x && v.y === t.y && v.k === t.k ? v : { ...t };
        }
        return { x: v.x + dx * ease, y: v.y + dy * ease, k: v.k + dk * ease };
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    viewRef.current = view;
  }, [view]);

  const screenToWorld = useCallback((clientX: number, clientY: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    const v = viewRef.current;
    return {
      x: (clientX - (rect?.left ?? 0) - v.x) / v.k,
      y: (clientY - (rect?.top ?? 0) - v.y) / v.k,
    };
  }, []);

  /** Мгновенно и view, и target (панорама должна быть отзывчивой, без инерции) */
  const shiftView = useCallback((dx: number, dy: number) => {
    const v = viewRef.current;
    const n = { ...v, x: v.x + dx, y: v.y + dy };
    targetRef.current = n;
    setView(n);
  }, []);

  const zoomAt = useCallback((clientX: number, clientY: number, factor: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    const sx = clientX - (rect?.left ?? 0);
    const sy = clientY - (rect?.top ?? 0);
    const t = targetRef.current;
    const k = clamp(t.k * factor, MIN_SCALE, MAX_SCALE);
    const f = k / t.k;
    targetRef.current = { k, x: sx - (sx - t.x) * f, y: sy - (sy - t.y) * f };
  }, []);

  // Колесо: обычный скролл = панорама (мгновенно), Ctrl/Cmd+колесо (pinch) = плавный зум к курсору.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        // Нормируем дельту: трекпад шлёт мелкие значения, мышь с Ctrl — крупные.
        // Ограничиваем шаг, чтобы не было прыжков.
        const unit = e.deltaMode === 1 ? 16 : 1;
        const step = clamp(-e.deltaY * unit * 0.0032, -0.16, 0.16);
        zoomAt(e.clientX, e.clientY, Math.exp(step));
      } else {
        const unit = e.deltaMode === 1 ? 16 : 1;
        const v = viewRef.current;
        const n = { ...v, x: v.x - e.deltaX * unit, y: v.y - e.deltaY * unit };
        targetRef.current = n;
        setView(n);
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoomAt]);

  const isInteractive = (t: EventTarget | null) =>
    (t as HTMLElement | null)?.closest?.('input, textarea, button, select, .weng-block') ?? null;

  // Рамка выделения (marquee) в экранных координатах контейнера
  const [marquee, setMarquee] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const pressRef = useRef<{ x: number; y: number; button: number } | null>(null);

  const toLocal = (clientX: number, clientY: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    return { x: clientX - (rect?.left ?? 0), y: clientY - (rect?.top ?? 0) };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    const bg = !isInteractive(e.target);
    const forcePan = spaceRef.current || e.button === 1 || e.button === 2;
    if (forcePan || (e.button === 0 && bg)) {
      e.preventDefault();
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      if (forcePan) {
        panRef.current = { px: e.clientX, py: e.clientY };
        setPanning(true);
      } else {
        // ЛКМ по фону: ждём — это либо клик, либо рамка выделения
        const p = toLocal(e.clientX, e.clientY);
        pressRef.current = { x: p.x, y: p.y, button: e.button };
      }
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const p = panRef.current;
    if (p) {
      shiftView(e.clientX - p.px, e.clientY - p.py);
      p.px = e.clientX;
      p.py = e.clientY;
      return;
    }
    const pr = pressRef.current;
    if (!pr) return;
    const q = toLocal(e.clientX, e.clientY);
    if (!marquee && Math.abs(q.x - pr.x) + Math.abs(q.y - pr.y) > 5) {
      setMarquee({ x0: pr.x, y0: pr.y, x1: q.x, y1: q.y });
    } else if (marquee) {
      setMarquee({ x0: pr.x, y0: pr.y, x1: q.x, y1: q.y });
    }
  };

  const endPointer = () => {
    panRef.current = null;
    setPanning(false);
    if (marquee) {
      // какие регионы попали в рамку (в экранных координатах — меряем DOM)
      const x0 = Math.min(marquee.x0, marquee.x1);
      const x1 = Math.max(marquee.x0, marquee.x1);
      const y0 = Math.min(marquee.y0, marquee.y1);
      const y1 = Math.max(marquee.y0, marquee.y1);
      const cRect = containerRef.current?.getBoundingClientRect();
      const ids: string[] = [];
      containerRef.current
        ?.querySelectorAll('[data-block-id]')
        .forEach((el) => {
          const r = (el as HTMLElement).getBoundingClientRect();
          const ex0 = r.left - (cRect?.left ?? 0);
          const ex1 = r.right - (cRect?.left ?? 0);
          const ey0 = r.top - (cRect?.top ?? 0);
          const ey1 = r.bottom - (cRect?.top ?? 0);
          if (ex0 < x1 && ex1 > x0 && ey0 < y1 && ey1 > y0) {
            const id = (el as HTMLElement).dataset.blockId;
            if (id) ids.push(id);
          }
        });
      selectMany(ids);
    } else if (pressRef.current) {
      // простой клик по фону — снять выделение
      select(null);
    }
    pressRef.current = null;
    setMarquee(null);
  };

  const onDoubleClick = (e: React.MouseEvent) => {
    if (isInteractive(e.target)) return;
    const w = screenToWorld(e.clientX, e.clientY);
    // пол бесконечный — клампов нет, блок встаёт ровно под курсор
    addBlock(Math.round(w.x - 40), Math.round(w.y - 20));
  };

  const zoomCenter = useCallback(
    (factor: number) => {
      const rect = containerRef.current?.getBoundingClientRect();
      zoomAt(
        (rect?.left ?? 0) + (rect?.width ?? 800) / 2,
        (rect?.top ?? 0) + (rect?.height ?? 600) / 2,
        factor,
      );
    },
    [zoomAt],
  );

  // Горячие клавиши
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLTextAreaElement)) {
        spaceRef.current = true;
        setSpaceDown(true);
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        recalc();
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedIds.length) {
        const ae = document.activeElement;
        if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA')) return;
        e.preventDefault();
        removeSelected();
      }
      // Esc на пустом месте — снять выделение (в редакторах Esc обрабатывается локально)
      if (e.key === 'Escape') select(null);
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        spaceRef.current = false;
        setSpaceDown(false);
      }
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, [recalc, removeSelected, selectedIds.length, select]);

  const list = Object.values(blocks);
  const theme = useCanvasStore((s) => s.theme);

  // Бесконечная сетка в экранных координатах: шаг и сдвиг следуют за камерой
  const mod = (a: number, n: number) => ((a % n) + n) % n;
  const gridStyle: React.CSSProperties = showGrid
    ? (() => {
        const minor = theme === 'light' ? 'rgba(15,23,42,0.07)' : 'rgba(235,219,178,0.05)';
        const major = theme === 'light' ? 'rgba(15,23,42,0.13)' : 'rgba(235,219,178,0.11)';
        const s1 = 14 * view.k;
        const s2 = 140 * view.k;
        return {
          backgroundImage: [
            `linear-gradient(to right, ${minor} 1px, transparent 1px)`,
            `linear-gradient(to bottom, ${minor} 1px, transparent 1px)`,
            `linear-gradient(to right, ${major} 1px, transparent 1px)`,
            `linear-gradient(to bottom, ${major} 1px, transparent 1px)`,
          ].join(','),
          backgroundSize: `${s1}px ${s1}px, ${s1}px ${s1}px, ${s2}px ${s2}px, ${s2}px ${s2}px`,
          backgroundPosition: `${mod(view.x, s1)}px ${mod(view.y, s1)}px, ${mod(view.x, s1)}px ${mod(view.y, s1)}px, ${mod(view.x, s2)}px ${mod(view.y, s2)}px, ${mod(view.x, s2)}px ${mod(view.y, s2)}px`,
        };
      })()
    : {};

  return (
    <div
      ref={containerRef}
      className="flex-1 relative overflow-hidden bg-[var(--sheet)] select-none"
      role="application"
      aria-label="Бесконечный рабочий лист: двойной клик создаёт блок, перетаскивание с зажатой кнопкой выделяет"
      style={{
        cursor: panning ? 'grabbing' : spaceDown ? 'grab' : 'default',
        touchAction: 'none',
        ...gridStyle,
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endPointer}
      onPointerCancel={endPointer}
      onDoubleClick={onDoubleClick}
      onContextMenu={(e) => e.preventDefault()}
      title="ЛКМ-drag — выделение • Space/MMB/RMB — панорама • колесо — панорама • Ctrl+колесо — зум • двойной клик — новый блок"
    >
      {/* рамка выделения */}
      {marquee && (
        <div
          className="absolute z-40 border border-[var(--accent-line)] bg-[var(--accent-soft)] pointer-events-none"
          aria-hidden="true"
          style={{
            left: Math.min(marquee.x0, marquee.x1),
            top: Math.min(marquee.y0, marquee.y1),
            width: Math.abs(marquee.x1 - marquee.x0),
            height: Math.abs(marquee.y1 - marquee.y0),
          }}
        />
      )}
      {/* бесконечный слой блоков (нулевой размер, hit-area только у самих блоков) */}
      <div
        className="absolute left-0 top-0 weng-sheet"
        style={{
          transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})`,
          transformOrigin: '0 0',
        }}
      >
        {list.map((b) =>
          b.kind === 'plot' ? (
            <PlotBlockView key={b.id} block={b} scale={view.k} />
          ) : b.kind === 'plot3d' ? (
            <Plot3dBlockView key={b.id} block={b} scale={view.k} />
          ) : b.kind === 'program' ? (
            <ProgramBlockView key={b.id} block={b} scale={view.k} />
          ) : (
            <MathBlockView key={b.id} block={b} scale={view.k} />
          ),
        )}
      </div>

      {/* пустое состояние — в экранных координатах */}
      {list.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="text-center">
            <div className="text-2xl text-slate-200 font-semibold">Wengineering</div>
            <div className="text-sm text-slate-400 mt-1">
              Двойной клик — новый блок • <span className="math-input">:=</span> присваивание •{' '}
              <span className="math-input">=</span> вывод
            </div>
          </div>
        </div>
      )}

      {/* controls зума */}
      <div
        className="absolute right-3 bottom-3 flex items-center gap-1 bg-[var(--chrome)]/95 border border-[var(--chrome-line)] rounded-lg p-1"
        role="toolbar"
        aria-label="Масштаб листа"
      >
        <ZoomBtn onClick={() => zoomCenter(1 / 1.25)} label="Уменьшить масштаб">
          −
        </ZoomBtn>
        <button
          type="button"
          className="text-[12px] math-input text-[var(--chrome-ink)] min-w-14 min-h-[36px] px-1 rounded-md hover:bg-white/5"
          onClick={() => {
            const n = { x: 80, y: 40, k: 1 };
            targetRef.current = n;
            setView(n);
          }}
          title="Сбросить вид (100%)"
          aria-label="Сбросить масштаб к 100 процентам"
        >
          {Math.round(view.k * 100)}%
        </button>
        <ZoomBtn onClick={() => zoomCenter(1.25)} label="Увеличить масштаб">
          +
        </ZoomBtn>
      </div>
    </div>
  );
}

function ZoomBtn({
  children,
  onClick,
  label,
}: {
  children: React.ReactNode;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      className="w-9 h-9 text-[16px] text-[var(--chrome-ink)] rounded-md hover:bg-white/10 border border-transparent hover:border-[var(--chrome-line)] cursor-pointer active:scale-95"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      onPointerDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
    >
      {children}
    </button>
  );
}
