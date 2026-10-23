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
  const sx = Math.round(x / step) * step;
  const sy = Math.round(y / step) * step;
  // нормализуем -0: иначе координата «-0» уезжает в JSON/сравнения
  return { x: sx === 0 ? 0 : sx, y: sy === 0 ? 0 : sy };
}

/** Прямоугольник региона в мировых координатах (позиция + реальный размер). */
export interface LayoutRect {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface SeparateOptions {
  /** Минимальный зазор между границами регионов (мировые px). */
  gap?: number;
  /** Шаг сетки для выравнивания; 0 — не привязывать. */
  step?: number;
}

/** Предел перебора кандидатов на один регион — защита от патологического layout. */
const MAX_CANDIDATES = 4000;

/** Снап в заданную сторону: вправо/вниз — ceil, влево/вверх — floor.
 *  Так сгенерированный зазор не «съедается» округлением к ближайшему узлу. */
function snapToward(v: number, step: number, dir: -1 | 0 | 1): number {
  if (!(step > 0) || !isFinite(v)) return v;
  const q = v / step;
  const out = (dir > 0 ? Math.ceil(q) : dir < 0 ? Math.floor(q) : Math.round(q)) * step;
  return out === 0 ? 0 : out;
}

/**
 * Пересечение с учётом зазора: регионы считаются мешающими, если между
 * их границами по обеим осям меньше `gap`. Проверка «с запасом» не даёт
 * блокам вставать вплотную и налезать углами.
 */
function collides(a: LayoutRect, b: LayoutRect, gap: number): boolean {
  return (
    a.x < b.x + b.w + gap && a.x + a.w + gap > b.x && a.y < b.y + b.h + gap && a.y + a.h + gap > b.y
  );
}

function spotKey(x: number, y: number): string {
  return `${x},${y}`;
}

/**
 * Стоимость сдвига от желаемой позиции (квадрат расстояния, без sqrt).
 * Горизонталь дороже вертикали: лист читается сверху вниз, поэтому при
 * наложении блок сначала уходит вниз, а не расползается влево/вправо.
 */
const HORIZONTAL_COST = 8;

function cost(rect: LayoutRect, preferred: { x: number; y: number }): number {
  const dx = rect.x - preferred.x;
  const dy = rect.y - preferred.y;
  return dx * dx * HORIZONTAL_COST + dy * dy;
}

/** При равной стоимости: ниже, затем правее — чтобы стопка оставалась стопкой. */
function tieWins(a: LayoutRect, b: LayoutRect): boolean {
  if (a.y !== b.y) return a.y > b.y;
  return a.x > b.x;
}

/**
 * Строгий порядок решения: сверху вниз, при равном y — слева направо.
 * Это тот же порядок, в котором считает sortBlocksTopDown/recalculateAll
 * и в котором findUseBeforeDef ищет «использование раньше определения».
 */
function follows(a: { x: number; y: number }, b: { x: number; y: number }): boolean {
  return a.y > b.y || (a.y === b.y && a.x > b.x);
}

/**
 * Первое препятствие для позиции: наложение на уже поставленный регион
 * или нарушение последовательности относительно предыдущего. Порядок
 * проверяется раньше свободного места: блок не должен обгонять сосед.
 */
function blocker(
  rect: LayoutRect,
  placed: LayoutRect[],
  gap: number,
  prev: LayoutRect | null,
): LayoutRect | null {
  const hit = placed.find((p) => collides(rect, p, gap));
  if (hit) return hit;
  return prev && !follows(rect, prev) ? prev : null;
}

/**
 * Ближайшее свободное место для региона: поиск в ширину по позициям,
 * «выталкивающим» блок из каждого пересечения вниз/вправо/влево.
 * Дополнительно место должно идти ПОСЛЕ предыдущего региона в порядке
 * решения, иначе разнесение перемешало бы строки и определения.
 * Блок может уйти вниз за ещё не поставленный регион — тот при своей
 * очереди тоже сдвинется ниже, поэтому итоговый порядок не меняется.
 * Возвращает позицию, уже выровненную по сетке.
 */
function findFreeSpot(
  rect: LayoutRect,
  placed: LayoutRect[],
  gap: number,
  step: number,
  preferred: { x: number; y: number },
  prev: LayoutRect | null,
): { x: number; y: number } {
  if (!blocker(rect, placed, gap, prev)) return { x: rect.x, y: rect.y };

  const queue: LayoutRect[] = [rect];
  const seen = new Set<string>([spotKey(rect.x, rect.y)]);
  let popped = 0;

  while (queue.length > 0 && popped < MAX_CANDIDATES) {
    // Достаём кандидата с минимальным сдвигом от исходной позиции.
    let best = 0;
    let bestCost = cost(queue[0], preferred);
    for (let i = 1; i < queue.length; i++) {
      const c = cost(queue[i], preferred);
      if (c < bestCost || (c === bestCost && tieWins(queue[i], queue[best]))) {
        best = i;
        bestCost = c;
      }
    }
    const cur = queue.splice(best, 1)[0];
    popped++;

    const colliding = placed.find((p) => collides(cur, p, gap));
    const orderHit = prev && !follows(cur, prev) ? prev : null;
    if (!colliding && !orderHit) return { x: cur.x, y: cur.y };

    // Нарушен порядок: двигаем только вниз под предыдущий регион или
    // вправо от него. Остальные направления оставили бы блок «раньше»
    // предыдущего и снова сломали последовательность решения.
    // Позиция по y не уменьшается — верхний блок никогда не обгоняем.
    let candidates: { x: number; y: number }[];
    if (orderHit) {
      candidates = [
        { x: cur.x, y: snapToward(orderHit.y + orderHit.h + gap, step, 1) },
        { x: snapToward(orderHit.x + orderHit.w + gap, step, 1), y: orderHit.y },
      ];
    } else if (colliding) {
      candidates = [
        // Вниз/вправо/влево от первого мешающего региона. Снап — «наружу»,
        // чтобы после округления зазор остался не меньше заданного.
        // Вверх не двигаем: это поменяло бы порядок пересчёта top-to-bottom.
        // При равной стоимости вниз идёт первым — так вертикальная стопка
        // остаётся стопкой, а не расползается в строку.
        { x: cur.x, y: snapToward(colliding.y + colliding.h + gap, step, 1) },
        { x: snapToward(colliding.x + colliding.w + gap, step, 1), y: cur.y },
        { x: snapToward(colliding.x - cur.w - gap, step, -1), y: cur.y },
      ];
    } else {
      return { x: cur.x, y: cur.y };
    }
    for (const c of candidates) {
      const key = spotKey(c.x, c.y);
      if (seen.has(key)) continue;
      seen.add(key);
      queue.push({ ...cur, x: c.x, y: c.y });
    }
  }

  // Гарантированный выход: под всеми уже поставленными регионами.
  // Это всегда и ниже предыдущего, поэтому последовательность не рвётся.
  const bottom = placed.reduce((m, p) => Math.max(m, p.y + p.h), preferred.y) + gap;
  return { x: preferred.x, y: snapToward(bottom, step, 1) };
}

/**
 * Разнести регионы (Separation): выровнять по сетке, убрать наложения
 * и раздвинуть блоки, сохраняя последовательность решения.
 *
 * Порядок обхода — сверху вниз/слева направо, ровно как в
 * sortBlocksTopDown/recalculateAll (стабильно, при равных координатах —
 * порядок входного массива). Каждый следующий регион ставится строго
 * после предыдущего по этому же порядку, поэтому итоговая сортировка
 * не меняется, а проверка «использование раньше определения» видит те
 * же блоки в том же порядке.
 *
 * Желаемая позиция — исходная, привязанная к сетке. Если она занята,
 * берётся ближайшая свободная позиция вниз/вправо/влево; вверх не
 * двигаем. Вниз/вправо — безопасно, влево — только если блок не обгоняет
 * предыдущий (остаётся ниже или правее него). Если места рядом нет —
 * сброс под всеми регионами.
 *
 * Возвращает новые координаты; размеры не меняются.
 */
export function separateBlocks(
  list: LayoutRect[],
  opts: SeparateOptions = {},
): Record<string, { x: number; y: number }> {
  const step = opts.step ?? GRID_STEP_STANDARD;
  const gap = opts.gap ?? Math.max(step, GRID_STEP_STANDARD);
  // Стабильная сортировка: при равных y/x сохраняем порядок входного
  // массива, иначе порядок решения «поедет» ещё до раскладки.
  const sorted = list
    .map((r, i) => ({ r, i }))
    .sort((a, b) => a.r.y - b.r.y || a.r.x - b.r.x || a.i - b.i)
    .map(({ r }) => r);

  const placed: LayoutRect[] = [];
  const pos: Record<string, { x: number; y: number }> = {};
  let prev: LayoutRect | null = null;

  for (const b of sorted) {
    const preferred = step > 0 ? snapToGrid(b.x, b.y, step) : { x: b.x, y: b.y };
    const spot = findFreeSpot({ ...b, ...preferred }, placed, gap, step, preferred, prev);
    const out = { ...b, x: spot.x, y: spot.y };
    placed.push(out);
    pos[b.id] = spot;
    prev = out;
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
