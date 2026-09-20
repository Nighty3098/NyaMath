import type { MathBlockData } from '../engine/dependencies';

/** Шаг сетки в мировых координатах — тот же, что рисует Canvas
 *  (Canvas.tsx: `s = (gridSize === 'fine' ? 11 : 22) * view.k`). */
export const GRID_STEP_STANDARD = 22;
export const GRID_STEP_FINE = 11;

/**
 * Привязка точки к сетке (мировые координаты): ближайший узел.
 * 0 и отрицательные координаты ложатся на узлы симметрично (Math.round).
 */
export function snapToGrid(x: number, y: number, step: number): { x: number; y: number } {
  if (!(step > 0) || !isFinite(x) || !isFinite(y)) return { x, y };
  return { x: Math.round(x / step) * step, y: Math.round(y / step) * step };
}

/**
 * Разнос регионов по вертикали (Separation).
 * Проходит блоки сверху вниз и сдвигает ВНИЗ те, что стоят ближе
 * минимального зазора `gap` к предыдущему. Вверх ничего не тянет —
 * порядок вычислений top-to-bottom сохраняется.
 * Возвращает позиции для dropBlocks; совпадающие координаты не трогает.
 */
export function separateBlocksVertically(
  list: MathBlockData[],
  gap = 72,
): Record<string, { x: number; y: number }> {
  const sorted = [...list].sort((a, b) => (a.y === b.y ? a.x - b.x : a.y - b.y));
  const pos: Record<string, { x: number; y: number }> = {};
  let floor = -Infinity;
  for (const b of sorted) {
    const y = Math.max(b.y, floor);
    pos[b.id] = { x: b.x, y };
    floor = y + gap;
  }
  return pos;
}

/**
 * Набор определения: клавиша `:` сразу даёт `:=`.
 * Заменяет выделение (обычно пустое) на `:=`, повторный `:` на уже
 * готовом `:=` игнорируется. Возвращает null, если вставлять нечего.
 */
export function applyColonShortcut(
  value: string,
  start: number,
  end: number,
): { value: string; cursor: number } | null {
  const s = Math.max(0, Math.min(start, value.length));
  const e = Math.max(s, Math.min(end, value.length));
  // курсор уже на готовом `:=` (перед `:` или перед `=`) — ничего не делаем
  if (value.slice(s, s + 2) === ':=') return null;
  if (value[s] === '=') return null;
  const next = `${value.slice(0, s)}:=${value.slice(e)}`;
  return { value: next, cursor: s + 2 };
}
