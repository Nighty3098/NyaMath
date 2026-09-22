import { useEffect, useRef, type PointerEvent as ReactPointerEvent, type RefObject } from 'react';
import { useCanvasStore } from '../store/canvasStore';
import { hideGhost, measureBlock, moveGhost, showGhost } from './dragGhost';

/** Свежайшая позиция пальца/мыши (тач-пачки схлопываем — иначе дёргание) */
export function coalescedPos(e: ReactPointerEvent<HTMLElement>): { x: number; y: number } {
  try {
    const list = (e.nativeEvent as PointerEvent).getCoalescedEvents?.();
    if (list && list.length) {
      const last = list[list.length - 1];
      return { x: last.clientX, y: last.clientY };
    }
  } catch {
    /* ignore */
  }
  return { x: e.clientX, y: e.clientY };
}

/**
 * Перетаскивание безрамочного региона за ручку.
 * Если блок входит в мультивыделение — едет вся группа.
 * Пока тянем — двигаются только лёгкие DOM-тени (ноль ре-рендеров),
 * оригинал стоит на месте; на отпускании стор разом коммитит финал
 * (пересчёт сверху-вниз — один раз).
 */
export function useRegionDrag(id: string, scale: number, disabled: boolean) {
  const drag = useRef<{
    px: number;
    py: number;
    cx: number;
    cy: number;
    orig: Record<string, { x: number; y: number }>;
    moved: boolean;
  } | null>(null);
  const raf = useRef(0);

  const flush = () => {
    raf.current = 0;
    const d = drag.current;
    if (!d || !d.moved) return;
    // тень едет в экранных px — дёшево, только transform
    moveGhost(d.cx - d.px, d.cy - d.py);
  };

  // размонтирование посреди жеста (блок удалили клавишей) — убрать тень
  useEffect(
    () => () => {
      if (raf.current) cancelAnimationFrame(raf.current);
      raf.current = 0;
      drag.current = null;
      hideGhost();
    },
    [],
  );

  const onGripDown = (e: ReactPointerEvent<HTMLElement>) => {
    if (disabled) return;
    e.preventDefault();
    e.stopPropagation();
    const st = useCanvasStore.getState();
    st.beginGesture();
    const group = st.selectedIds.includes(id) && st.selectedIds.length > 1 ? st.selectedIds : [id];
    const orig: Record<string, { x: number; y: number }> = {};
    for (const gid of group) {
      const b = st.blocks[gid];
      if (b) orig[gid] = { x: b.x, y: b.y };
    }
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = {
      px: e.clientX,
      py: e.clientY,
      cx: e.clientX,
      cy: e.clientY,
      orig,
      moved: false,
    };
  };

  const onGripMove = (e: ReactPointerEvent<HTMLElement>) => {
    const d = drag.current;
    if (!d) return;
    const p = coalescedPos(e);
    d.cx = p.x;
    d.cy = p.y;
    if (!d.moved && Math.abs(d.cx - d.px) + Math.abs(d.cy - d.py) > 3) {
      d.moved = true;
      // тени того же экранного размера, что оригиналы
      const rects = Object.keys(d.orig)
        .map((gid) => measureBlock(gid))
        .filter((r): r is NonNullable<typeof r> => r !== null);
      showGhost(rects);
    }
    if (d.moved && !raf.current) raf.current = requestAnimationFrame(flush);
  };

  const onGripUp = () => {
    if (raf.current) {
      cancelAnimationFrame(raf.current);
      raf.current = 0;
    }
    const d = drag.current;
    drag.current = null;
    hideGhost();
    // телепорт оригинала в финал одним коммитом (пересчёт — один раз)
    if (d?.moved) {
      const dx = (d.cx - d.px) / scale;
      const dy = (d.cy - d.py) / scale;
      const positions: Record<string, { x: number; y: number }> = {};
      for (const [gid, o] of Object.entries(d.orig)) {
        positions[gid] = { x: o.x + dx, y: o.y + dy };
      }
      useCanvasStore.getState().dropBlocks(positions);
    }
  };

  return { onGripDown, onGripMove, onGripUp };
}

/**
 * Ручное изменение размера (юго-восточная ручка).
 * Регионы: только ширина (высота авто). Графики: ширина + высота.
 * w/h пишутся живьём, persist — в конце. Store-обновления — через rAF,
 * иначе пересчёт сэмплов графика на каждый pointermove вешает кадр.
 */
export function useRegionResize(
  id: string,
  scale: number,
  regionRef: RefObject<HTMLDivElement | null>,
  opts?: { height?: boolean; minW?: number; maxW?: number; minH?: number; maxH?: number },
) {
  const withH = opts?.height ?? false;
  const minW = opts?.minW ?? 140;
  const maxW = opts?.maxW ?? 900;
  const minH = opts?.minH ?? 200;
  const maxH = opts?.maxH ?? 1600;
  const rz = useRef<{
    px: number;
    py: number;
    cx: number;
    cy: number;
    startW: number;
    startH: number;
    active: boolean;
  } | null>(null);
  const raf = useRef(0);

  const flush = () => {
    raf.current = 0;
    const r = rz.current;
    if (!r || !r.active) return;
    const w = Math.min(maxW, Math.max(minW, r.startW + (r.cx - r.px) / scale));
    const h = withH ? Math.min(maxH, Math.max(minH, r.startH + (r.cy - r.py) / scale)) : undefined;
    useCanvasStore
      .getState()
      .sizeTo(id, Math.round(w), h === undefined ? undefined : Math.round(h));
  };

  const onResizeDown = (e: ReactPointerEvent<HTMLElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const st = useCanvasStore.getState();
    st.beginGesture();
    const b = st.blocks[id];
    if (!b) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    rz.current = {
      px: e.clientX,
      py: e.clientY,
      cx: e.clientX,
      cy: e.clientY,
      startW: b.w ?? regionRef.current?.offsetWidth ?? 300,
      startH: b.h ?? regionRef.current?.offsetHeight ?? 300,
      active: false,
    };
  };

  const onResizeMove = (e: ReactPointerEvent<HTMLElement>) => {
    const r = rz.current;
    if (!r) return;
    const p = coalescedPos(e);
    r.cx = p.x;
    r.cy = p.y;
    if (!r.active && Math.abs(r.cx - r.px) + Math.abs(r.cy - r.py) > 3) r.active = true;
    if (r.active && !raf.current) raf.current = requestAnimationFrame(flush);
  };

  const onResizeUp = () => {
    if (raf.current) {
      cancelAnimationFrame(raf.current);
      flush();
    }
    if (rz.current?.active) useCanvasStore.getState().commitDrag();
    rz.current = null;
  };

  return { onResizeDown, onResizeMove, onResizeUp };
}
