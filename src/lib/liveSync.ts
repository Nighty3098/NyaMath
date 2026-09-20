import { useCanvasStore } from '../store/canvasStore';
import { t } from '../i18n';
import type { MathBlockData } from '../engine/dependencies';

const URL_KEY = 'nyamath-live-url';
const DEFAULT_URL = 'http://localhost:3777';
const SEND_DEBOUNCE_MS = 400;

/** Блоки без пересчитываемых полей — то же slim-правило, что persist/сервер. */
function slimBlocks(blocks: Record<string, MathBlockData>): MathBlockData[] {
  return Object.values(blocks).map((b) => {
    const { plotPreview: _pp, simResult: _sr, ...rest } = b as MathBlockData & {
      simResult?: unknown;
    };
    void _pp;
    void _sr;
    return rest as MathBlockData;
  });
}

let es: EventSource | null = null;
let unsubscribe: (() => void) | null = null;
let sendTimer: ReturnType<typeof setTimeout> | null = null;
/** true, пока применяем входящий снапшот — свои правки в этот момент не шлём. */
let applying = false;
/** Последний согласованный JSON — подавляет эхо туда-обратно. */
let lastSyncedJson = '';
/** Ревизия сервера, на которой основан lastSyncedJson (-1 — ещё не видели снапшот). */
let lastRev = -1;

export function getLiveUrl(): string {
  try {
    return localStorage.getItem(URL_KEY) ?? DEFAULT_URL;
  } catch {
    return DEFAULT_URL;
  }
}

export function setLiveUrl(url: string): void {
  try {
    localStorage.setItem(URL_KEY, url);
  } catch {
    /* ignore */
  }
  useCanvasStore.getState().setLiveUrl(url);
}

export function isLiveConnected(): boolean {
  return es !== null;
}

/** Проверка сервиса перед подключением: понятная ошибка вместо тишины. */
export async function testLiveConnection(url: string, timeoutMs = 5000): Promise<{ ok: boolean; info?: string; error?: string }> {
  const base = url.replace(/\/$/, '');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${base}/status`, { signal: ctrl.signal });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    const data = (await res.json()) as { rev?: number; blocks?: number };
    return { ok: true, info: `rev=${data.rev ?? '?'} blocks=${data.blocks ?? '?'}` };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const hint = /abort/i.test(msg) ? 'timeout' : msg;
    return { ok: false, error: hint };
  } finally {
    clearTimeout(timer);
  }
}

function scheduleSend(): void {
  if (sendTimer) clearTimeout(sendTimer);
  sendTimer = setTimeout(() => {
    sendTimer = null;
    void sendNow();
  }, SEND_DEBOUNCE_MS);
}

async function sendNow(): Promise<void> {
  const st = useCanvasStore.getState();
  if (es === null || applying) return;
  const slim = slimBlocks(st.blocks);
  const json = JSON.stringify(slim);
  if (json === lastSyncedJson) return;
  try {
    const res = await fetch(`${st.liveUrl.replace(/\/$/, '')}/push`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(lastRev >= 0 ? { blocks: slim, baseRev: lastRev } : { blocks: slim }),
    });
    if (res.status === 409) {
      // Конфликт ревизий. Два случая:
      // - сервер впереди (агент запушил первым): не затираем, тянем снапшот;
      // - сервер позади (рестарт, память сброшена): восстанавливаем его force-пушем.
      try {
        const base = st.liveUrl.replace(/\/$/, '');
        const snap = (await (await fetch(`${base}/snapshot`)).json()) as { rev?: unknown; blocks?: unknown };
        const snapRev = typeof snap.rev === 'number' ? snap.rev : -1;
        if (snapRev >= 0 && snapRev < lastRev) {
          const force = await fetch(`${base}/push`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ blocks: slim }),
          });
          if (force.ok) {
            const fdata = (await force.json()) as { rev?: unknown };
            if (typeof fdata.rev === 'number') lastRev = fdata.rev;
            lastSyncedJson = json;
          }
        } else if (snap && Array.isArray(snap.blocks)) {
          applySnapshot(snapRev, snap.blocks);
        }
      } catch {
        /* следующий кадр SSE или правка повторит */
      }
      return;
    }
    if (!res.ok) return;
    const data = (await res.json()) as { rev?: unknown };
    if (typeof data.rev === 'number') lastRev = data.rev;
    lastSyncedJson = json;
  } catch {
    /* офлайн — следующий снапшот или правка повторит */
  }
}

/** Применить входящий снапшот: только вперёд по rev, lastSyncedJson — уже
 *  нормализованный (после migrate), иначе migrate-добавки вроде
 *  disabled:false дают вечный ping-pong. */
function applySnapshot(rev: number, incoming: unknown): void {
  if (typeof rev === 'number' && rev >= 0 && rev <= lastRev) return;
  applying = true;
  try {
    useCanvasStore.getState().applyRemoteBlocks(incoming);
  } finally {
    applying = false;
  }
  const s = useCanvasStore.getState();
  lastSyncedJson = JSON.stringify(slimBlocks(s.blocks));
  if (typeof rev === 'number' && rev >= 0) lastRev = rev;
  s.setLiveConnected(true);
  s.setLiveError(null);
}

/**
 * Подключиться к live-сервису: входящие снапшоты применяем,
 * локальные правки шлём обратно. Возвращает функцию отключения.
 */
export function connectLive(): () => void {
  disconnectLive();
  const st = useCanvasStore.getState();
  st.setLiveError(null);
  // отмечаем текущее состояние согласованным, чтобы не залить его поверх сервиса
  lastSyncedJson = JSON.stringify(slimBlocks(st.blocks));
  lastRev = -1;
  openStream(st.liveUrl.replace(/\/$/, ''), false);
  // Только блоки: клики/панорама/селект/телеметрия пересчёта не должны
  // пушить документ (иначе любое движение мышью затирает правки агента).
  // ( plain zustand без subscribeWithSelector — сравниваем ссылку вручную.)
  let prevBlocks: unknown = st.blocks;
  unsubscribe = useCanvasStore.subscribe((s) => {
    if (es === null || applying) {
      prevBlocks = s.blocks;
      return;
    }
    if (s.blocks === prevBlocks) return;
    prevBlocks = s.blocks;
    scheduleSend();
  });
  return disconnectLive;
}

/** Firefox иногда не дружит localhost с IPv6 — один раз пробуем зеркальный хост. */
function fallbackUrl(url: string): string | null {
  if (url.includes('://localhost')) return url.replace('://localhost', '://127.0.0.1');
  if (url.includes('://127.0.0.1')) return url.replace('://127.0.0.1', '://localhost');
  return null;
}

function openStream(base: string, isFallback: boolean): void {
  const source = new EventSource(`${base}/events`);
  es = source;
  // Сервер шлёт именованные кадры `event: snapshot` — они НЕ попадают в onmessage,
  // только в addEventListener('snapshot').
  const onSnapshot = (ev: Event) => {
    try {
      const data = JSON.parse((ev as MessageEvent).data) as { rev?: number; blocks?: unknown };
      if (!data || !Array.isArray(data.blocks)) return;
      applySnapshot(typeof data.rev === 'number' ? data.rev : -1, data.blocks);
    } catch {
      /* битый кадр — ждём следующий */
    }
  };
  source.addEventListener('snapshot', onSnapshot);
  source.onerror = () => {
    const s = useCanvasStore.getState();
    s.setLiveConnected(false);
    // EventSource переподключается сам; но если это первая неудача —
    // показываем причину и один раз пробуем зеркальный хост
    if (!isFallback) {
      const alt = fallbackUrl(base);
      if (alt) {
        try {
          source.close();
        } catch {
          /* ignore */
        }
        // маленькая пауза, чтобы не долбить синхронно
        setTimeout(() => {
          if (es === source) {
            // SSE и push должны ходить на один хост, иначе сплит:
            // снапшоты слушаем на alt, а пушим на исходный.
            setLiveUrl(alt);
            openStream(alt, true);
          }
        }, 500);
        return;
      }
    }
    s.setLiveError(t('live.noConn'));
    // EventSource переподключается сам; статус вернётся при первом кадре
  };
}

export function disconnectLive(): void {
  if (sendTimer) {
    clearTimeout(sendTimer);
    sendTimer = null;
  }
  unsubscribe?.();
  unsubscribe = null;
  es?.close();
  es = null;
  try {
    useCanvasStore.getState().setLiveConnected(false);
  } catch {
    /* стор может быть недоступен в тестах */
  }
}
