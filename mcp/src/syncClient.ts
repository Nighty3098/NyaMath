/**
 * HTTP-клиент realtime-шины NyaMath (для nya_sync_pull / nya_sync_push).
 * Чистые функции поверх fetch — мост между stdio-сессией агента и документом,
 * который видит пользователь в браузере (процесс с --port, обычно из npm run dev).
 * Тестируется живым сервером в mcp/test/syncTools.mjs.
 */

export interface SyncSnapshot {
  rev: number;
  blocks: unknown[];
}

/** URL sync-сервиса: явный параметр → NYAMATH_SYNC_URL → дефолт dev-режима. */
export function resolveSyncUrl(explicit?: string): string {
  const raw = (explicit ?? process.env['NYAMATH_SYNC_URL'] ?? 'http://localhost:3777').trim();
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
  const d = data as { rev?: unknown; blocks: unknown[] };
  return { rev: typeof d.rev === 'number' ? d.rev : -1, blocks: d.blocks };
}

/** Отправить холст на sync-сервис (там пересчёт + рассылка в браузер). Возвращает rev. */
export async function pushSnapshot(url: string, blocks: unknown[], timeoutMs = 15000): Promise<number> {
  let data: unknown;
  try {
    data = await fetchJson(
      `${url}/push`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blocks }),
      },
      timeoutMs,
    );
  } catch (e) {
    throw new Error(`sync-сервис недоступен (${url}): ${e instanceof Error ? e.message : String(e)}`);
  }
  if (!data || typeof data !== 'object' || (data as { ok?: unknown }).ok !== true) {
    const err = (data as { error?: unknown })?.error;
    throw new Error(typeof err === 'string' ? err : 'push отклонён');
  }
  const rev = (data as { rev?: unknown }).rev;
  return typeof rev === 'number' ? rev : -1;
}
