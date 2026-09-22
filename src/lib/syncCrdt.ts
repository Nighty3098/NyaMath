/**
 * CRDT-лайт для Live Sync: per-block LWW-Map + tombstones, three-way merge.
 *
 * Проблема: whole-document last-writer-wins затирал правки — агент двигал
 * один блок, пользователь печатал в другом, чей-то push побеждал целиком.
 * Решение: слияние на уровне блоков с векторными метками (clock, actor):
 * - правки РАЗНЫХ блоков сливаются без потерь (CalcTree/CoCalc-паттерн);
 * - правки ОДНОГО блока — побеждает больший (clock, actor), детерминировано;
 * - удаление — tombstone: выигрывает у concurrent-правки, только если новее;
 * - клиенты без меток (legacy) — старое поведение: их push без meta при
 *   stale baseRev по-прежнему получает 409, их snapshot применяется заменой.
 *
 * Зеркало для MCP-сервера НЕ нужно: mcp-бандл (esbuild) импортирует
 * этот модуль напрямую из ../../src (как движок) — единый источник правды.
 */

export interface BlockMeta {
  clock: number;
  actor: string;
}

export type MetaMap = Record<string, BlockMeta>;

/** Slim-блок на проводе: главное — строковый id. */
export interface WireBlock {
  id: string;
  [k: string]: unknown;
}

export interface MergeResult {
  blocks: WireBlock[];
  meta: MetaMap;
  deleted: MetaMap;
}

const ACTOR_KEY = 'nyamath-actor';
let actorCache: string | null = null;

/** Стабильный id актора (браузер/агент) — для tie-break в LWW. */
export function getActor(): string {
  if (actorCache) return actorCache;
  try {
    let a = localStorage.getItem(ACTOR_KEY);
    if (!a) {
      a = `web-${Math.random().toString(36).slice(2, 10)}`;
      localStorage.setItem(ACTOR_KEY, a);
    }
    actorCache = a;
    return a;
  } catch {
    // node-тесты / приватный режим: кэш модуля держит стабильность сессии
    actorCache = `web-${Math.random().toString(36).slice(2, 10)}`;
    return actorCache;
  }
}

/** Канонический JSON: ключи отсортированы — одинаковое содержимое = одна строка
 *  независимо от порядка ключей у отправителей. */
export function canon(v: unknown): string {
  if (v === null || v === undefined) return 'null';
  if (Array.isArray(v)) return `[${v.map(canon).join(',')}]`;
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canon(o[k])}`)
      .join(',')}}`;
  }
  const s = JSON.stringify(v);
  return s === undefined ? 'null' : s;
}

/** a новее b? Сравнение (clock, actor), отсутствие метки = самое старое. */
export function isNewer(a: BlockMeta | undefined, b: BlockMeta | undefined): boolean {
  if (!a) return false;
  if (!b) return true;
  if (a.clock !== b.clock) return a.clock > b.clock;
  return a.actor > b.actor;
}

/** Новейший tombstone id из двух карт (или undefined). */
export function newerTomb(id: string, a: MetaMap, b: MetaMap): BlockMeta | undefined {
  const ta = a[id];
  const tb = b[id];
  if (!ta) return tb;
  if (!tb) return ta;
  return isNewer(ta, tb) ? ta : tb;
}

function byId(list: WireBlock[] | unknown): Map<string, WireBlock> {
  const out = new Map<string, WireBlock>();
  if (!Array.isArray(list)) return out;
  for (const item of list) {
    if (item && typeof item === 'object' && typeof (item as { id?: unknown }).id === 'string') {
      out.set((item as WireBlock).id, item as WireBlock);
    }
  }
  return out;
}

export function saneMeta(m: unknown): MetaMap {
  const out: MetaMap = {};
  if (!m || typeof m !== 'object') return out;
  for (const [k, v] of Object.entries(m as Record<string, unknown>)) {
    if (v && typeof v === 'object') {
      const c = (v as { clock?: unknown }).clock;
      const a = (v as { actor?: unknown }).actor;
      if (typeof c === 'number' && isFinite(c) && typeof a === 'string')
        out[k] = { clock: c, actor: a };
    }
  }
  return out;
}

const TOMB_CAP = 500;

/**
 * Three-way merge: base — последнее согласованное, local/remote — стороны.
 * Возвращает объединённые блоки + метки + tombstones (пригодно и серверу,
 * и браузеру: роли симметричны, tie отдаём remote — детерминизм обеих сторон).
 */
export function mergeBlockMaps(
  base: WireBlock[] | unknown,
  baseMeta: unknown,
  local: WireBlock[] | unknown,
  localMeta: unknown,
  remote: WireBlock[] | unknown,
  remoteMeta: unknown,
  localTomb: unknown,
  remoteTomb: unknown,
): MergeResult {
  const bM = byId(base);
  const lM = byId(local);
  const rM = byId(remote);
  const bMeta = saneMeta(baseMeta);
  const lMeta = saneMeta(localMeta);
  const rMeta = saneMeta(remoteMeta);
  const lT = saneMeta(localTomb);
  const rT = saneMeta(remoteTomb);

  const out = new Map<string, WireBlock>();
  const outMeta: MetaMap = {};
  const tomb: MetaMap = {};

  // tombstones: объединение, побеждает новейший; чистим те, чей id вернулся
  for (const [id, t] of Object.entries(lT)) tomb[id] = t;
  for (const [id, t] of Object.entries(rT)) {
    if (!tomb[id] || isNewer(t, tomb[id])) tomb[id] = t;
  }

  const ids = new Set([...bM.keys(), ...lM.keys(), ...rM.keys()]);
  for (const id of ids) {
    const b = bM.get(id);
    const l = lM.get(id);
    const r = rM.get(id);
    const cb = b ? canon(b) : null;
    const lCh = (l ? canon(l) : null) !== cb;
    const rCh = (r ? canon(r) : null) !== cb;
    const t = newerTomb(id, lT, rT);

    if (!l && !r) {
      if (!t) delete tomb[id];
      continue; // нет нигде — нечего сливать
    }
    if (t) {
      // удаление против concurrent-правок: tombstone выигрывает, только если новее
      const lEdit = l && lCh ? (lMeta[id] ?? bMeta[id]) : undefined;
      const rEdit = r && rCh ? (rMeta[id] ?? bMeta[id]) : undefined;
      const winner =
        lEdit && isNewer(lEdit, t) && (!rEdit || !isNewer(rEdit, lEdit))
          ? { b: l as WireBlock, m: lEdit }
          : rEdit && isNewer(rEdit, t)
            ? { b: r as WireBlock, m: rEdit }
            : null;
      if (winner) {
        out.set(id, winner.b);
        outMeta[id] = winner.m;
        delete tomb[id];
      }
      continue;
    }
    if (!lCh && !rCh) {
      const keep = (l ?? r) as WireBlock;
      out.set(id, keep);
      const m = isNewer(rMeta[id], lMeta[id]) ? rMeta[id] : lMeta[id];
      if (m) outMeta[id] = m;
      continue;
    }
    if (lCh && !rCh && l) {
      out.set(id, l);
      if (lMeta[id]) outMeta[id] = lMeta[id];
      continue;
    }
    if (!lCh && rCh && r) {
      out.set(id, r);
      if (rMeta[id]) outMeta[id] = rMeta[id];
      continue;
    }
    if (lCh && rCh) {
      // обе стороны правили: LWW по (clock, actor), tie — remote (детерминизм:
      // сервер и браузер выбирают одинаково, расхождения не бывает)
      const lm = lMeta[id];
      const rm = rMeta[id];
      const useR = !l ? true : !r ? false : isNewer(rm, lm) ? true : isNewer(lm, rm) ? false : true;
      const win = useR ? (r as WireBlock) : (l as WireBlock);
      out.set(id, win);
      const wm = useR ? rm : lm;
      if (wm) outMeta[id] = wm;
      continue;
    }
    // одностороннее удаление без tombstone (legacy-сторона): удаление = изменение
    if (!l && rCh && r) {
      out.set(id, r);
      if (rMeta[id]) outMeta[id] = rMeta[id];
    } else if (!r && lCh && l) {
      out.set(id, l);
      if (lMeta[id]) outMeta[id] = lMeta[id];
    } else if (!l || !r) {
      // удалено одной стороной, вторая не меняла — уважаем удаление
      // и фиксируем его tombstone'ом с часами изменившейся стороны
      const m = (!l ? rMeta : lMeta)[id] ?? { clock: Date.now(), actor: 'merge' };
      tomb[id] = m;
    }
  }

  // кап tombstones: самые старые — вон (живые id уже вычищены выше)
  const tombIds = Object.entries(tomb).sort(
    (a, b) => a[1].clock - b[1].clock || (a[1].actor < b[1].actor ? -1 : 1),
  );
  while (tombIds.length > TOMB_CAP) {
    const drop = tombIds.shift();
    if (drop) delete tomb[drop[0]];
  }

  return { blocks: [...out.values()], meta: outMeta, deleted: tomb };
}

/**
 * Штамп исходящего состояния: что изменилось относительно base —
 * свежие часы, что пропало — tombstones. Вызывать перед каждым push.
 */
export function stampOutgoing(
  base: WireBlock[] | unknown,
  baseMeta: MetaMap,
  current: WireBlock[],
  prevMeta: MetaMap,
  prevDeleted: MetaMap,
  actor: string,
  now: number = Date.now(),
): { meta: MetaMap; deleted: MetaMap } {
  const bM = byId(base);
  const meta: MetaMap = { ...prevMeta };
  const deleted: MetaMap = { ...prevDeleted };
  const seen = new Set<string>();
  for (const blk of current) {
    if (!blk || typeof blk.id !== 'string') continue;
    seen.add(blk.id);
    const b = bM.get(blk.id);
    if (!b || canon(b) !== canon(blk)) meta[blk.id] = { clock: now, actor };
    else if (!meta[blk.id] && baseMeta[blk.id]) meta[blk.id] = baseMeta[blk.id];
    if (deleted[blk.id]) delete deleted[blk.id]; // воскрес — tombstone долой
  }
  for (const id of bM.keys()) {
    if (!seen.has(id) && !deleted[id]) deleted[id] = { clock: now, actor };
  }
  return { meta, deleted };
}
