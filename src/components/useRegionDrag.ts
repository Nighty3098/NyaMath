import { useRef, type PointerEvent as ReactPointerEvent, type RefObject } from 'react';
import { useCanvasStore } from '../store/canvasStore';

/**
 * Перетаскивание безрамочного региона за ручку (как в Mathcad).
 * Если блок входит в мультивыделение — едет вся группа.
 * Позиция обновляется живьём без пересчёта; пересчёт — один раз в конце.
 */
export function useRegionDrag(id: string, scale: number, disabled: boolean) {
  const drag = useRef<{ px: number; py: number; orig: Record<string, { x: number; y: number }>; moved: boolean } | null>(null);

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
    drag.current = { px: e.clientX, py: e.clientY, orig, moved: false };
  };

  const onGripMove = (e: ReactPointerEvent<HTMLElement>) => {
    const d = drag.current;
    if (!d) return;
    if (Math.abs(e.clientX - d.px) + Math.abs(e.clientY - d.py) > 3) d.moved = true;
    if (!d.moved) return;
    const dx = (e.clientX - d.px) / scale;
    const dy = (e.clientY - d.py) / scale;
    const st = useCanvasStore.getState();
    for (const [gid, o] of Object.entries(d.orig)) {
      // пол бесконечный во все стороны — отрицательные координаты разрешены
      if (st.blocks[gid]) st.dragTo(gid, o.x + dx, o.y + dy);
    }
  };

  const onGripUp = () => {
    if (drag.current?.moved) useCanvasStore.getState().commitDrag();
    drag.current = null;
  };

  return { onGripDown, onGripMove, onGripUp };
}

/**
 * Ручное изменение размера (юго-восточная ручка).
 * Регионы: только ширина (высота авто). Графики: ширина + высота.
 * w/h пишутся живьём, persist — в конце.
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
  const rz = useRef<{ px: number; py: number; startW: number; startH: number; active: boolean } | null>(null);

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
      startW: b.w ?? regionRef.current?.offsetWidth ?? 300,
      startH: b.h ?? regionRef.current?.offsetHeight ?? 300,
      active: false,
    };
  };

  const onResizeMove = (e: ReactPointerEvent<HTMLElement>) => {
    const r = rz.current;
    if (!r) return;
    if (Math.abs(e.clientX - r.px) + Math.abs(e.clientY - r.py) > 3) r.active = true;
    if (!r.active) return;
    const w = Math.min(maxW, Math.max(minW, r.startW + (e.clientX - r.px) / scale));
    const h = withH ? Math.min(maxH, Math.max(minH, r.startH + (e.clientY - r.py) / scale)) : undefined;
    useCanvasStore.getState().sizeTo(id, Math.round(w), h === undefined ? undefined : Math.round(h));
  };

  const onResizeUp = () => {
    if (rz.current?.active) useCanvasStore.getState().commitDrag();
    rz.current = null;
  };

  return { onResizeDown, onResizeMove, onResizeUp };
}
