/**
 * Призрак перетаскивания: пока палец/курсор едет — двигается только лёгкий
 * DOM-прямоугольник (GPU-трансформ, ноль ре-рендеров React), оригинал стоит
 * на месте. На отпускании стор разом коммитит финальные координаты.
 *
 * Слой `.nya-ghost-layer` рисует Canvas поверх блоков (screen-координаты).
 */

interface GhostRect {
  el: HTMLDivElement;
  x: number;
  y: number;
}

let ghosts: GhostRect[] = [];

function layer(): HTMLElement | null {
  return document.querySelector('.nya-ghost-layer');
}

/** Показать тени для блоков (замеры в экранных координатах контейнера). */
export function showGhost(rects: { x: number; y: number; w: number; h: number }[]): void {
  hideGhost();
  const host = layer();
  if (!host) return;
  ghosts = rects.map((r) => {
    const el = document.createElement('div');
    el.className = 'nya-ghost';
    el.style.width = `${Math.max(24, r.w)}px`;
    el.style.height = `${Math.max(24, r.h)}px`;
    // позиция — только через transform: сдвиг дальше без reflow
    el.style.transform = `translate(${r.x}px, ${r.y}px)`;
    host.append(el);
    return { el, x: r.x, y: r.y };
  });
}

/** Сдвинуть все тени (экранные px, дёшево — только transform). */
export function moveGhost(dx: number, dy: number): void {
  for (const g of ghosts) {
    g.el.style.transform = `translate(${g.x + dx}px, ${g.y + dy}px)`;
  }
}

/** Убрать тени. */
export function hideGhost(): void {
  for (const g of ghosts) g.el.remove();
  ghosts = [];
}

/** Замер блока в экранных координатах холста (для тени того же размера). */
export function measureBlock(id: string): { x: number; y: number; w: number; h: number } | null {
  const inner = document.querySelector(`[data-block-id="${id}"]`);
  const region = inner?.closest('.nya-region') ?? inner;
  const canvas = inner?.closest('.nya-canvas');
  if (!(region instanceof HTMLElement) || !(canvas instanceof HTMLElement)) return null;
  const r = region.getBoundingClientRect();
  const c = canvas.getBoundingClientRect();
  return { x: r.left - c.left, y: r.top - c.top, w: r.width, h: r.height };
}

// ── Тень для окон поверх экрана (палитры, диалоги и т.п.) ──

let fixedGhosts: GhostRect[] = [];

function fixedLayer(): HTMLElement | null {
  let host = document.querySelector('.nya-ghost-layer-fixed');
  if (!host) {
    host = document.createElement('div');
    host.className = 'nya-ghost-layer-fixed';
    document.body.append(host);
  }
  return host as HTMLElement;
}

/** Показать тень окна в экранных координатах: ориг стоит, едет только тень. */
export function showGhostFixed(rects: { x: number; y: number; w: number; h: number }[]): void {
  hideGhostFixed();
  const host = fixedLayer();
  if (!host) return;
  fixedGhosts = rects.map((r) => {
    const el = document.createElement('div');
    el.className = 'nya-ghost';
    el.style.width = `${Math.max(24, r.w)}px`;
    el.style.height = `${Math.max(24, r.h)}px`;
    el.style.transform = `translate(${r.x}px, ${r.y}px)`;
    host.append(el);
    return { el, x: r.x, y: r.y };
  });
}

/** Сдвинуть все тени окон (экранные px, дёшево — только transform). */
export function moveGhostFixed(dx: number, dy: number): void {
  for (const g of fixedGhosts) {
    g.el.style.transform = `translate(${g.x + dx}px, ${g.y + dy}px)`;
  }
}

/** Убрать тени окон. */
export function hideGhostFixed(): void {
  for (const g of fixedGhosts) g.el.remove();
  fixedGhosts = [];
}
