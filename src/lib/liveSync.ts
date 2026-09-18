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
      body: JSON.stringify({ blocks: slim }),
    });
    if (!res.ok) return;
    lastSyncedJson = json;
  } catch {
    /* офлайн — следующий снапшот или правка повторит */
  }
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
  openStream(st.liveUrl.replace(/\/$/, ''), false);
  unsubscribe = useCanvasStore.subscribe(() => {
    if (es === null || applying) return;
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
      const json = JSON.stringify(data.blocks);
      lastSyncedJson = json;
      applying = true;
      try {
        useCanvasStore.getState().applyRemoteBlocks(data.blocks);
      } finally {
        applying = false;
      }
      const s = useCanvasStore.getState();
      s.setLiveConnected(true);
      s.setLiveError(null);
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
          if (es === source) openStream(alt, true);
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
