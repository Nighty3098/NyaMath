import type { MathBlockData } from '../engine/dependencies';

/**
 * Separate Regions → Vertically (Mathcad, Document tab).
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
 * Mathcad-набор определения: клавиша `:` сразу даёт `:=`.
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
