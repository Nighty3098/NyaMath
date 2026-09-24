import type { MathBlockData } from '../engine/dependencies';

/**
 * Видимость блоков на бесконечном canvas (без IntersectionObserver — и вот почему:
 * у canvas нет scroll-контейнера, панорама/зум идут через CSS-transform слоя,
 * поэтому точная математика вьюпорта дешевле и детерминированнее асинхронного IO,
 * а заодно тестируется в node без layout).
 */

export interface Viewport {
  x: number;
  y: number;
  k: number;
}

export interface Size {
  w: number;
  h: number;
}

export interface WorldRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Мировые координаты вьюпорта + overscan долей экрана с каждой стороны. */
export function viewportRect(view: Viewport, size: Size, overscan = 0.5): WorldRect {
  const vw = Math.max(1, size.w) / view.k;
  const vh = Math.max(1, size.h) / view.k;
  // || 0 гасит -0 (иначе toEqual различает -0 и 0)
  const x0 = -view.x / view.k || 0;
  const y0 = -view.y / view.k || 0;
  return {
    x0: x0 - vw * overscan,
    y0: y0 - vh * overscan,
    x1: x0 + vw * (1 + overscan),
    y1: y0 + vh * (1 + overscan),
  };
}

/** Консервативная высота блока (мир. px): недолёт исключён, перелёт дешёвый. */
export function estBlockHeight(b: Pick<MathBlockData, 'kind' | 'h'>): number {
  switch (b.kind) {
    case 'plot':
    case 'contour':
      return b.h ?? 520;
    case 'plot3d':
      return b.h ?? 600;
    case 'sim':
      return b.h ?? 900;
    case 'program':
      return 420;
    default:
      return 140;
  }
}

export function rectHit(r: WorldRect, x: number, y: number, h: number, w: number): boolean {
  return x < r.x1 && x + w > r.x0 && y < r.y1 && y + h > r.y0;
}

/** Id блоков, пересекающих прямоугольник (порядок входа — сверху-вниз при сортированном входе). */
export function visibleIdsOf(blocks: MathBlockData[], rect: WorldRect): string[] {
  const out: string[] = [];
  for (const b of blocks) {
    if (rectHit(rect, b.x, b.y, estBlockHeight(b), b.w ?? 640)) out.push(b.id);
  }
  return out;
}

/** Порог виртуализации: меньше — оверхед не окупается. */
export const VIRTUALIZE_AT = 250;

/** Накопленные за кадр дельты колеса (rAF-коалесцирование, см. Canvas). */
export interface WheelAcc {
  /** суммарный сдвиг панорамы, экранные px */
  dx: number;
  dy: number;
  /** суммарный лог-фактор pinch-зума */
  zoomLog: number;
  /** якорь зума, клиентские координаты последнего события */
  ax: number;
  ay: number;
  hasZoom: boolean;
}

/**
 * Один кадр коалесцированного колеса: чистая математика кадра панорамы/зума.
 * Возвращает тот же объект при нулевых дельтах — вызыватель пропускает setState.
 */
export function applyWheelFrame(
  v: Viewport,
  acc: WheelAcc,
  origin: { left: number; top: number },
  kMin = 0.25,
  kMax = 3,
): Viewport {
  const px = v.x - acc.dx;
  const py = v.y - acc.dy;
  if (!acc.hasZoom) return px === v.x && py === v.y ? v : { ...v, x: px, y: py };
  const sx = acc.ax - origin.left;
  const sy = acc.ay - origin.top;
  const step = Math.max(-0.5, Math.min(0.5, acc.zoomLog));
  const k = Math.max(kMin, Math.min(kMax, v.k * Math.exp(step)));
  const f = k / v.k;
  return { k, x: sx - (sx - px) * f, y: sy - (sy - py) * f };
}
