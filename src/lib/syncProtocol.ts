/**
 * lib/syncProtocol — единый протокол Live Sync (браузер ↔ MCP-сервер).
 *
 * Раньше SyncSnapshot/BlockMeta были определены дважды:
 * mcp/syncServer.ts и mcp/syncClient.ts — копипаста с дрейфом.
 * Канонические BlockMeta/MetaMap/WireBlock уже живут в syncCrdt.ts —
 * здесь только транспортные типы + resolveSyncUrl + fetch-хелперы,
 * общие для веба и MCP. Без DOM/node-специфики в типах.
 */
import type { BlockMeta, MetaMap, WireBlock } from './syncCrdt';

export type { BlockMeta, MetaMap, WireBlock };

/** Снапшот документа на проводе. */
export interface SyncSnapshot {
  rev: number;
  blocks: WireBlock[];
  /** Per-block LWW-метки (CRDT-лайт); нет — legacy. */
  meta?: MetaMap;
  /** Tombstones удалённых блоков. */
  deleted?: MetaMap;
}

/** Тело POST /push. */
export interface PushBody {
  blocks: WireBlock[];
  baseRev?: number;
  meta?: MetaMap;
  deleted?: MetaMap;
}

/** Результат applyPush на сервере. */
export interface PushResult {
  rev: number;
  merged?: SyncSnapshot;
}

export const DEFAULT_SYNC_URL = 'http://localhost:3777';

/**
 * URL sync-сервиса: явный параметр → env (node) → дефолт.
 * Работает и в браузере (explicit), и в node (process.env).
 */
export function resolveSyncUrl(explicit?: string): string {
  let raw = (explicit ?? '').trim();
  if (!raw) {
    try {
      const env =
        typeof process !== 'undefined'
          ? (process.env?.['NYAMATH_SYNC_URL'] as string | undefined)
          : undefined;
      raw = (env ?? DEFAULT_SYNC_URL).trim();
    } catch {
      raw = DEFAULT_SYNC_URL;
    }
  }
  if (!raw) throw new Error('Пустой URL sync-сервиса');
  return raw.replace(/\/$/, '');
}

async function fetchJson(url: string, init?: RequestInit, timeoutMs = 10000): Promise<unknown> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as unknown;
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') throw new Error('timeout');
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

/** Забрать текущий холст с sync-сервиса. */
export async function pullSnapshot(url: string, timeoutMs = 10000): Promise<SyncSnapshot> {
  let data: unknown;
  try {
    data = await fetchJson(`${url}/snapshot`, undefined, timeoutMs);
  } catch (e) {
    throw new Error(`sync-сервис недоступен (${url}): ${e instanceof Error ? e.message : String(e)}`);
  }
  if (!data || typeof data !== 'object' || !Array.isArray((data as { blocks?: unknown }).blocks)) {
    throw new Error('Некорректный snapshot');
  }
  const d = data as { rev?: unknown; blocks: WireBlock[]; meta?: MetaMap; deleted?: MetaMap };
  return {
    rev: typeof d.rev === 'number' ? d.rev : -1,
    blocks: d.blocks,
    ...(d.meta && typeof d.meta === 'object' ? { meta: d.meta } : {}),
    ...(d.deleted && typeof d.deleted === 'object' ? { deleted: d.deleted } : {}),
  };
}

/**
 * Отправить холст на sync-сервис. Возвращает rev.
 * baseRev — optimistic concurrency: stale baseRev без meta → CONFLICT;
 * с meta — сервер смёржит (CRDT-лайт).
 */
export async function pushSnapshot(
  url: string,
  blocks: WireBlock[],
  baseRev?: number,
  timeoutMs = 15000,
  extra?: { meta?: unknown; deleted?: unknown },
): Promise<number> {
  let res: Response;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const body: Record<string, unknown> =
        baseRev === undefined ? { blocks } : { blocks, baseRev };
      if (extra?.meta !== undefined) body['meta'] = extra.meta;
      if (extra?.deleted !== undefined) body['deleted'] = extra.deleted;
      res = await fetch(`${url}/push`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') throw new Error('timeout');
    throw new Error(`sync-сервис недоступен (${url}): ${e instanceof Error ? e.message : String(e)}`);
  }
  let data: unknown = null;
  try {
    data = (await res.json()) as unknown;
  } catch {
    /* не-JSON ответ */
  }
  if (res.status === 409) {
    const err = (data as { error?: unknown })?.error;
    const rev = (data as { rev?: unknown })?.rev;
    throw new Error(
      typeof err === 'string' ? err : `CONFLICT: сервер новее (rev=${typeof rev === 'number' ? rev : '?'})`,
    );
  }
  if (!res.ok) {
    const err = (data as { error?: unknown })?.error;
    throw new Error(typeof err === 'string' ? err : `HTTP ${res.status}`);
  }
  if (!data || typeof data !== 'object' || (data as { ok?: unknown }).ok !== true) {
    const err = (data as { error?: unknown })?.error;
    throw new Error(typeof err === 'string' ? err : 'push отклонён');
  }
  const rev = (data as { rev?: unknown }).rev;
  return typeof rev === 'number' ? rev : -1;
}
