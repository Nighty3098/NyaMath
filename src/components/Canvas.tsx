import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useCanvasStore } from '../store/canvasStore';
import { sortBlocksTopDown } from '../engine/dependencies';
import MathBlockView from './MathBlockView';
import PlotBlockView from './PlotBlockView';
import ContourBlockView from './ContourBlockView';
// three.js едет отдельным чанком — грузится только при первом 3D-блоке
const Plot3dBlockView = lazy(() => import('./Plot3dBlockView'));
import ProgramBlockView from './ProgramBlockView';
import SimBlockView from './SimBlockView';
import SliderBlockView from './SliderBlockView';
import { IPaw } from './Icon';
import { t } from '../i18n';

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

  /** Мгновенно view + target + синхронное зеркало.
   * Без зеркала два move в одном кадре читают stale-базу и теряют дельты (рывки). */
  const applyView = useCallback((n: View) => {
    viewRef.current = n;
    targetRef.current = n;
    setView(n);
  }, []);

  /** Мгновенно и view, и target (панорама должна быть отзывчивой, без инерции) */
  const shiftView = useCallback((dx: number, dy: number) => {
    const v = viewRef.current;
    applyView({ ...v, x: v.x + dx, y: v.y + dy });
  }, [applyView]);

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
    (t as HTMLElement | null)?.closest?.('input, textarea, button, select, .nya-block') ?? null;

  // Рамка выделения (marquee) в экранных координатах контейнера
  const [marquee, setMarquee] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const pressRef = useRef<{ x: number; y: number; button: number; cx: number; cy: number } | null>(null);
  // --- Тач-жесты: один палец — панорама, два — pinch-zoom, дабл-тап — новый блок ---
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  const pinchRef = useRef<{ pd: number; pmx: number; pmy: number } | null>(null);
  const touchRef = useRef<{
    sx: number; sy: number; lx: number; ly: number; cx: number; cy: number;
    t: number; panning: boolean; marquee: boolean;
  } | null>(null);
  const longTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTapRef = useRef<{ t: number; x: number; y: number } | null>(null);
  const touchNewRef = useRef(0);
  const TAP_MOVE = 10;
  const TAP_TIME = 350;
  const DBL_DIST = 28;
  const DBL_TIME = 320;
  const LONG_MS = 550;

  const clearLongTimer = () => {
    if (longTimer.current) {
      clearTimeout(longTimer.current);
      longTimer.current = null;
    }
  };

  /** Скоалесцированная позиция (Android шлёт пачки touchmove — берём свежайшую) */
  const coalescedPos = (e: React.PointerEvent) => {
    try {
      const list = (e.nativeEvent as PointerEvent).getCoalescedEvents?.();
      if (list && list.length) {
        const last = list[list.length - 1];
        return { x: last.clientX, y: last.clientY };
      }
    } catch { /* ignore */ }
    return { x: e.clientX, y: e.clientY };
  };

  const pinchDistMid = () => {
    const pts = [...pointersRef.current.values()];
    const [a, b] = pts as [{ x: number; y: number }, { x: number; y: number }];
    if (!a || !b) return null;
    return {
      d: Math.hypot(a.x - b.x, a.y - b.y),
      mx: (a.x + b.x) / 2,
      my: (a.y + b.y) / 2,
    };
  };

  /** Мгновенный зум+сдвиг для пальцев (без инерции ease — прямой отклик) */
  const pinchView = useCallback((mx: number, my: number, factor: number, dx: number, dy: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    const sx = mx - (rect?.left ?? 0);
    const sy = my - (rect?.top ?? 0);
    const v = viewRef.current;
    // кламп шага: почти сомкнутые пальцы иначе дают взрывной зум
    const k = clamp(v.k * clamp(factor, 0.85, 1.18), MIN_SCALE, MAX_SCALE);
    const f = k / v.k;
    // сначала сдвиг за средней точкой, потом зум вокруг неё
    const px = v.x + dx;
    const py = v.y + dy;
    applyView({ k, x: sx - (sx - px) * f, y: sy - (sy - py) * f });
  }, [applyView]);
  // Курсор-прицел в стиле Mathcad
  const cross = useCanvasStore((s) => s.cross);

  const toLocal = (clientX: number, clientY: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    return { x: clientX - (rect?.left ?? 0), y: clientY - (rect?.top ?? 0) };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    const bg = !isInteractive(e.target);
    const isTouch = e.pointerType !== 'mouse';
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    // Два пальца — переход в pinch (отменяем всё остальное)
    if (pointersRef.current.size === 2) {
      clearLongTimer();
      pressRef.current = null;
      touchRef.current = null;
      panRef.current = null;
      setPanning(false);
      setMarquee(null);
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      const pm = pinchDistMid();
      // почти сомкнутые пальцы — не старт: иначе первый же шаг взрывает зум
      if (pm && pm.d > 24) pinchRef.current = { pd: pm.d, pmx: pm.mx, pmy: pm.my };
      return;
    }
    if (pointersRef.current.size > 2) return;
    const forcePan = spaceRef.current || e.button === 1 || e.button === 2;
    if (isTouch) {
      // Палец по блоку уходит в stopPropagation внутри блока — сюда доходит только фон.
      // Один палец всегда панорама (рамка — по long-press, новый блок — дабл-тап).
      if (forcePan || bg) {
        e.preventDefault();
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        const p = toLocal(e.clientX, e.clientY);
        touchRef.current = {
          sx: p.x, sy: p.y, lx: e.clientX, ly: e.clientY,
          cx: e.clientX, cy: e.clientY, t: Date.now(), panning: false, marquee: false,
        };
        setPanning(true);
        longTimer.current = setTimeout(() => {
          const tr = touchRef.current;
          if (!tr || tr.panning) return;
          tr.marquee = true;
          setMarquee({ x0: tr.sx, y0: tr.sy, x1: tr.sx, y1: tr.sy });
          try {
            navigator.vibrate?.(15);
          } catch { /* ignore */ }
        }, LONG_MS);
      }
      return;
    }
    if (forcePan || (e.button === 0 && bg)) {
      e.preventDefault();
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      if (forcePan) {
        panRef.current = { px: e.clientX, py: e.clientY };
        setPanning(true);
      } else {
        // ЛКМ по фону: ждём — это либо клик, либо рамка выделения
        const p = toLocal(e.clientX, e.clientY);
        pressRef.current = { x: p.x, y: p.y, button: e.button, cx: e.clientX, cy: e.clientY };
      }
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const entry = pointersRef.current.get(e.pointerId);
    if (entry) {
      entry.x = e.clientX;
      entry.y = e.clientY;
    }
    // Pinch двумя пальцами
    const pinch = pinchRef.current;
    if (pinch && pointersRef.current.size >= 2) {
      const pm = pinchDistMid();
      if (pm && pm.d > 0 && pinch.pd > 0) {
        // пальцы сошлись вплотную — только пан, без зума
        const f = pm.d < 12 || pinch.pd < 12 ? 1 : pm.d / pinch.pd;
        pinchView(pm.mx, pm.my, f, pm.mx - pinch.pmx, pm.my - pinch.pmy);
        pinchRef.current = { pd: pm.d, pmx: pm.mx, pmy: pm.my };
      }
      return;
    }
    // Один палец: панорама после порога, иначе ждём тап/long-press
    const tr = touchRef.current;
    if (tr && e.pointerType !== 'mouse') {
      const pos = coalescedPos(e);
      if (tr.marquee) {
        const q = toLocal(pos.x, pos.y);
        setMarquee({ x0: tr.sx, y0: tr.sy, x1: q.x, y1: q.y });
        return;
      }
      const moved = Math.abs(pos.x - tr.cx) + Math.abs(pos.y - tr.cy);
      if (!tr.panning && moved > TAP_MOVE) {
        tr.panning = true;
        tr.lx = pos.x;
        tr.ly = pos.y;
        clearLongTimer();
      }
      if (tr.panning) {
        shiftView(pos.x - tr.lx, pos.y - tr.ly);
        tr.lx = pos.x;
        tr.ly = pos.y;
      }
      return;
    }
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

  const newBlockAt = (clientX: number, clientY: number) => {
    const w = screenToWorld(clientX, clientY);
    addBlock(Math.round(w.x - 40), Math.round(w.y - 20));
    useCanvasStore.getState().setCross(Math.round(w.x - 40), Math.round(w.y - 20));
  };

  const endPointer = (e?: React.PointerEvent) => {
    if (e) pointersRef.current.delete(e.pointerId);
    clearLongTimer();
    // Отпустили один палец из pinch — оставшийся продолжает панораму без прыжка
    if (pinchRef.current) {
      pinchRef.current = null;
      if (pointersRef.current.size === 1) {
        const [[, pt]] = [...pointersRef.current.entries()];
        if (e && e.pointerType !== 'mouse') {
          const p = toLocal(pt.x, pt.y);
          touchRef.current = {
            sx: p.x, sy: p.y, lx: pt.x, ly: pt.y,
            cx: pt.x, cy: pt.y, t: Date.now(), panning: true, marquee: false,
          };
          setPanning(true);
        } else if (e) {
          panRef.current = { px: pt.x, py: pt.y };
          setPanning(true);
        }
      } else {
        setPanning(false);
      }
      return;
    }
    // Тап / дабл-тап одним пальцем
    const tr = touchRef.current;
    if (tr && (!e || e.pointerType !== 'mouse')) {
      touchRef.current = null;
      setPanning(false);
      const quick = Date.now() - tr.t < TAP_TIME;
      if (tr.marquee) {
        // рамка из long-press — как обычное выделение
        if (marquee) {
          selectMarquee();
        } else {
          setMarquee(null);
        }
      } else if (!tr.panning && quick) {
        const last = lastTapRef.current;
        const now = Date.now();
        if (last && now - last.t < DBL_TIME && Math.abs(tr.cx - last.x) + Math.abs(tr.cy - last.y) < DBL_DIST) {
          lastTapRef.current = null;
          touchNewRef.current = now;
          newBlockAt(tr.cx, tr.cy);
        } else {
          lastTapRef.current = { t: now, x: tr.cx, y: tr.cy };
          const w = screenToWorld(tr.cx, tr.cy);
          useCanvasStore.getState().setCross(w.x, w.y);
          select(null);
        }
      }
      return;
    }
    panRef.current = null;
    setPanning(false);
    if (marquee) {
      selectMarquee();
    } else if (pressRef.current) {
      // простой клик по фону — прицел в точку клика, выделение снять
      const w = screenToWorld(pressRef.current.cx, pressRef.current.cy);
      useCanvasStore.getState().setCross(w.x, w.y);
      select(null);
    }
    pressRef.current = null;
    setMarquee(null);
  };

  const selectMarquee = () => {
    if (!marquee) return;
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
    setMarquee(null);
  };

  const onDoubleClick = (e: React.MouseEvent) => {
    // дабл-тап на таче уже создал блок сам — браузерный dblclick игнорируем
    if (Date.now() - touchNewRef.current < 600) return;
    if (isInteractive(e.target)) return;
    // пол бесконечный — клампов нет, блок встаёт ровно под курсор
    newBlockAt(e.clientX, e.clientY);
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

  // Курсор-прицел: стрелки — сдвиг, Enter — вниз, печать — новый блок в точке прицела.
  // Работает, только когда фокус не в поле ввода (редакторы блоков, поиск, меню).
  useEffect(() => {
    const STEP = 16;
    const LINE = 64;
    const down = (e: KeyboardEvent) => {
      const ae = document.activeElement;
      if (
        ae &&
        (ae.tagName === 'INPUT' ||
          ae.tagName === 'TEXTAREA' ||
          ae.tagName === 'SELECT' ||
          ae.tagName === 'BUTTON' ||
          (ae as HTMLElement).isContentEditable)
      ) {
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const st = useCanvasStore.getState();
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();
        const big = e.shiftKey ? LINE : STEP;
        if (e.key === 'ArrowLeft') st.nudgeCross(-big, 0);
        else if (e.key === 'ArrowRight') st.nudgeCross(big, 0);
        else if (e.key === 'ArrowUp') st.nudgeCross(0, -big);
        else st.nudgeCross(0, big);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        st.nudgeCross(0, LINE);
      } else if (e.key.length === 1 && e.key !== ' ') {
        // пробел — панорама, остальная печать — сразу блок с этим символом
        e.preventDefault();
        st.addBlock(st.cross.x, st.cross.y, e.key, true);
      }
    };
    window.addEventListener('keydown', down);
    return () => window.removeEventListener('keydown', down);
  }, []);

  const list = useMemo(() => sortBlocksTopDown(Object.values(blocks)), [blocks]);
  // подписка ради перерендера при смене языка
  useCanvasStore((s) => s.lang);

  // Точечная сетка в экранных координатах (Notion-стиль): шаг следует за камерой
  const mod = (a: number, n: number) => ((a % n) + n) % n;
  const gridStyle: React.CSSProperties = showGrid
    ? (() => {
        const s = 22 * view.k;
        return {
          backgroundImage: 'radial-gradient(circle, var(--grid-dk) 1.2px, transparent 1.3px)',
          backgroundSize: `${s}px ${s}px`,
          backgroundPosition: `${mod(view.x, s)}px ${mod(view.y, s)}px`,
        };
      })()
    : {};

  return (
    <div
      ref={containerRef}
      className="nya-canvas flex-1 relative overflow-hidden bg-[var(--sheet)] select-none"
      role="application"
      aria-label={t('c.aria')}
      style={{
        cursor: panning ? 'grabbing' : spaceDown ? 'grab' : 'crosshair',
        touchAction: 'none',
        ...gridStyle,
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endPointer}
      onPointerCancel={endPointer}
      onDoubleClick={onDoubleClick}
      onContextMenu={(e) => e.preventDefault()}
      title={`${t('c.title')} • ${t('c.crossHint')}`}
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
      {/* слой теней перетаскивания (DOM, без ре-рендеров) */}
      <div className="nya-ghost-layer print:hidden" aria-hidden="true" />
      {/* бесконечный слой блоков (нулевой размер, hit-area только у самих блоков) */}
      <div
        className="absolute left-0 top-0 nya-sheet"
        style={{
          transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})`,
          transformOrigin: '0 0',
        }}
      >
        {/* курсор-прицел в стиле Mathcad */}
        <div
          className="absolute z-0 pointer-events-none print:hidden"
          style={{ left: cross.x, top: cross.y }}
          aria-hidden="true"
        >
          <div
            style={{
              position: 'absolute',
              left: -13 / view.k,
              top: -1 / view.k,
              width: 26 / view.k,
              height: Math.max(1 / view.k, 0.75),
              background: 'var(--danger)',
            }}
          />
          <div
            style={{
              position: 'absolute',
              top: -13 / view.k,
              left: -1 / view.k,
              height: 26 / view.k,
              width: Math.max(1 / view.k, 0.75),
              background: 'var(--danger)',
            }}
          />
        </div>
        {list.map((b) =>
          b.kind === 'plot' ? (
            <PlotBlockView key={b.id} block={b} scale={view.k} />
          ) : b.kind === 'contour' ? (
            <ContourBlockView key={b.id} block={b} scale={view.k} />
          ) : b.kind === 'plot3d' ? (
            <Suspense
              key={b.id}
              fallback={
                <div
                  className="absolute rounded-xl bg-[var(--sheet)] shadow-[0_1px_2px_rgba(0,0,0,0.18),0_8px_24px_rgba(0,0,0,0.16)] animate-pulse"
                  style={{ left: b.x, top: b.y, width: 560, height: 470 }}
                  aria-label="3D"
                />
              }
            >
              <Plot3dBlockView block={b} scale={view.k} />
            </Suspense>
          ) : b.kind === 'program' ? (
            <ProgramBlockView key={b.id} block={b} scale={view.k} />
          ) : b.kind === 'sim' ? (
            <SimBlockView key={b.id} block={b} scale={view.k} />
          ) : b.kind === 'slider' ? (
            <SliderBlockView key={b.id} block={b} scale={view.k} />
          ) : (
            <MathBlockView key={b.id} block={b} scale={view.k} />
          ),
        )}
      </div>

      {/* пустое состояние — в экранных координатах */}
      {list.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none print:hidden">
          <div className="flex flex-col items-center text-center px-6 max-w-[420px]">
            <span className="text-[var(--accent)] inline-flex" aria-hidden="true"><IPaw size={56} /></span>
            <div className="font-semibold tracking-tight text-[19px] leading-7 text-[var(--ink)] mt-3">
              NyaMath
            </div>
          </div>
        </div>
      )}

      {/* controls зума */}
      <div
        className="nya-zoombar absolute right-3 bottom-3 flex items-center gap-0.5 bg-[var(--chrome)]/85 border border-[var(--chrome-line)] px-1.5 py-1 print:hidden"
        role="toolbar"
        aria-label={t('c.zoomBar')}
      >
        <ZoomBtn onClick={() => zoomCenter(1 / 1.25)} label={t('c.zoomOut')}>
          −
        </ZoomBtn>
        <button
          type="button"
          className="text-[12px] math-input tabular-nums text-[var(--chrome-soft)] hover:text-[var(--chrome-ink)] min-w-13 min-h-[32px] px-2 rounded-full transition-colors"
          onClick={() => {
            const n = { x: 80, y: 40, k: 1 };
            targetRef.current = n;
            setView(n);
          }}
          title={t('c.resetView')}
          aria-label={t('c.resetZoom')}
        >
          {Math.round(view.k * 100)}%
        </button>
        <ZoomBtn onClick={() => zoomCenter(1.25)} label={t('c.zoomIn')}>
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
      className="nya-tbtn w-8 h-8 text-[15px]"
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
