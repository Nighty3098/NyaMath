import type { PaletteTab } from '../store/canvasStore';

const POS_PREFIX = 'nyamath-detached-pos-';
const SIZE_PREFIX = 'nyamath-detached-size-';

/** Позиция отдельного окна вкладки (персист отдельно от документа). */
export function saveDetachedPos(tab: PaletteTab, x: number, y: number) {
  try {
    const nx = Math.min(Math.max(-320, Math.round(x)), Math.max(0, window.innerWidth - 80));
    const ny = Math.min(Math.max(0, Math.round(y)), Math.max(0, window.innerHeight - 60));
    localStorage.setItem(POS_PREFIX + tab, JSON.stringify({ x: nx, y: ny }));
  } catch { /* ignore */ }
}

export function loadDetachedPos(tab: PaletteTab): { x: number; y: number } {
  const order: PaletteTab[] = ['functions', 'formulas', 'constants', 'variables'];
  const i = Math.max(0, order.indexOf(tab));
  const fallback = { x: 120 + i * 44, y: 90 + i * 36 };
  try {
    const raw = localStorage.getItem(POS_PREFIX + tab);
    if (!raw) return fallback;
    const p = JSON.parse(raw) as { x?: unknown; y?: unknown };
    if (typeof p.x !== 'number' || typeof p.y !== 'number') return fallback;
    return {
      x: Math.min(Math.max(-320, p.x), Math.max(0, window.innerWidth - 80)),
      y: Math.min(Math.max(0, p.y), Math.max(0, window.innerHeight - 60)),
    };
  } catch {
    return fallback;
  }
}

export function loadDetachedSize(tab: PaletteTab): { w: number; h: number } {
  const fallback = { w: 400, h: 540 };
  try {
    const raw = localStorage.getItem(SIZE_PREFIX + tab);
    if (!raw) return fallback;
    const p = JSON.parse(raw) as { w?: unknown; h?: unknown };
    return {
      w: typeof p.w === 'number' && isFinite(p.w) ? Math.min(720, Math.max(320, Math.round(p.w))) : fallback.w,
      h: typeof p.h === 'number' && isFinite(p.h) ? Math.min(1200, Math.max(320, Math.round(p.h))) : fallback.h,
    };
  } catch {
    return fallback;
  }
}

export function saveDetachedSize(tab: PaletteTab, w: number, h: number) {
  try {
    localStorage.setItem(SIZE_PREFIX + tab, JSON.stringify({ w: Math.round(w), h: Math.round(h) }));
  } catch { /* ignore */ }
}

const DOCKW_PREFIX = 'nyamath-detached-dockw-';

/** Ширина пристыкованной панели вынесенной вкладки. */
export function loadDetachedDockW(tab: PaletteTab): number {
  const fallback = 400;
  try {
    const raw = localStorage.getItem(DOCKW_PREFIX + tab);
    if (!raw) return fallback;
    const v = JSON.parse(raw) as unknown;
    return typeof v === 'number' && isFinite(v) ? Math.min(640, Math.max(280, Math.round(v))) : fallback;
  } catch {
    return fallback;
  }
}

export function saveDetachedDockW(tab: PaletteTab, w: number) {
  try {
    localStorage.setItem(DOCKW_PREFIX + tab, JSON.stringify(Math.min(640, Math.max(280, Math.round(w)))));
  } catch { /* ignore */ }
}
