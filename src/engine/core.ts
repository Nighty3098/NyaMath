/**
 * engine/core — общие примитивы движка без зависимостей.
 *
 * Зачем: mathEngine ↔ packs образовывали цикл
 * (mathEngine → buildPackScope → getCompiledPre/preprocess* → mathEngine).
 * Здесь живут типы и чистые хелперы, от которых зависят все:
 * Scope, LRU-кэш, приведение значений к числу, truthy-предикат.
 * Этот модуль НЕ импортирует mathEngine/packs/simEngine — только так
 * цикл остаётся разорванным.
 */

/** Область видимости документа: имя → значение mathjs. */
export type Scope = Record<string, unknown>;

/** Ограниченный LRU-кэш на Map (вставка = самая свежая). */
export function createLru<K, V>(limit: number) {
  const map = new Map<K, V>();
  const cap = Math.max(1, Math.floor(limit) || 1);
  return {
    get(key: K): V | undefined {
      const v = map.get(key);
      if (v !== undefined) {
        map.delete(key);
        map.set(key, v);
      }
      return v;
    },
    set(key: K, value: V): void {
      if (map.has(key)) map.delete(key);
      else if (map.size >= cap) {
        const oldest = map.keys().next();
        if (!oldest.done) map.delete(oldest.value);
      }
      map.set(key, value);
    },
    has(key: K): boolean {
      return map.has(key);
    },
    clear(): void {
      map.clear();
    },
    get size(): number {
      return map.size;
    },
  };
}

export type LruCache<K, V> = ReturnType<typeof createLru<K, V>>;

export interface BigNumberLike {
  toNumber(): number;
  isFinite(): boolean;
  isZero(): boolean;
}

export function isBigNumberLike(v: unknown): v is BigNumberLike {
  if (v === null || typeof v !== 'object') return false;
  const candidate = v as Partial<BigNumberLike>;
  return (
    typeof candidate.toNumber === 'function' &&
    typeof candidate.isFinite === 'function' &&
    typeof candidate.isZero === 'function'
  );
}

/**
 * Вещественная часть значения (комплексные {re}, массивы не трогаем).
 * Возвращает null, если число недостижимо.
 */
export function complexReOrNull(v: unknown): number | null {
  if (typeof v === 'number') return isFinite(v) ? v : null;
  if (isBigNumberLike(v)) {
    const n = v.toNumber();
    return v.isFinite() && isFinite(n) ? n : null;
  }
  if (v !== null && typeof v === 'object' && 're' in (v as object)) {
    const re = Number((v as { re: unknown }).re);
    return isFinite(re) ? re : null;
  }
  return null;
}

/**
 * Значение → плоский JS-массив (Array или mathjs Matrix с toArray()).
 * null — не массив.
 */
export function flattenValue(v: unknown): unknown[] | null {
  if (Array.isArray(v)) return (v as unknown[]).flat(Infinity);
  if (v !== null && typeof v === 'object' && 'toArray' in (v as object)) {
    try {
      const a = (v as { toArray: () => unknown }).toArray();
      return Array.isArray(a) ? (a as unknown[]).flat(Infinity) : null;
    } catch {
      return null;
    }
  }
  return null;
}

/** Значение → вложенный JS-массив без flatten (для матриц высот). */
export function nestedValue(v: unknown): unknown[] | null {
  if (Array.isArray(v)) return v;
  if (v !== null && typeof v === 'object' && 'toArray' in (v as object)) {
    try {
      const a = (v as { toArray: () => unknown }).toArray();
      return Array.isArray(a) ? a : null;
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Общий truthy-предикат листа (program `if/while`, sim `events`).
 * Раньше: truthy в program.ts и eventTruthy в simEngine.ts — копии.
 */
export function isTruthyValue(v: unknown): boolean {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return isFinite(v) && v !== 0;
  if (typeof v === 'string') return v.length > 0;
  if (v === null || v === undefined) return false;
  if (typeof v === 'object') {
    if (isBigNumberLike(v)) return v.isFinite() && !v.isZero();
    if ('re' in (v as object)) {
      const c = v as { re: unknown; im: unknown };
      return Number(c.re) !== 0 || Number(c.im) !== 0;
    }
    if (Array.isArray(v)) return v.length > 0;
  }
  return true;
}

/** Расширить границы диапазона, если вырожден (lo === hi). */
export function padRange(lo: number, hi: number, frac = 0.12): [number, number] {
  if (lo === hi) {
    lo -= 1;
    hi += 1;
  }
  const span = hi - lo;
  return [lo - span * frac, hi + span * frac];
}
