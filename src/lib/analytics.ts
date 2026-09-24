// Лёгкий учёт визитов: один POST /api/hit на вкладку-сессию.
//
// СЕКРЕТОВ ЗДЕСЬ НЕТ И БЫТЬ НЕ ДОЛЖНО: токен Telegram-бота и chat_id
// живут только в env серверной функции /api/hit (см. api/hit.ts).
// В клиентском бандле есть лишь строка '/api/hit' — по ней нельзя
// узнать ни токен, ни получателя сообщений.

const SENT_KEY = 'nya_visit_sent';
const SEEN_KEY = 'nya_seen';
const SID_KEY = 'nya_sid';
const ENDPOINT = '/api/hit';

export interface VisitPayload {
  v: 1;
  tz?: string;
  tz_offset_min?: number;
  locale?: string;
  screen?: string;
  viewport?: string;
  dpr?: number;
  platform?: string;
  landing?: string;
  referrer?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  ts_client?: string;
  session_id?: string;
  returning?: boolean;
}

/** Окружение, собранное из window/document — отдельным типом ради тестов. */
export interface VisitEnv {
  href: string;
  referrer?: string;
  tz?: string;
  tzOffsetMin?: number;
  locale?: string;
  screenW?: number;
  screenH?: number;
  viewportW?: number;
  viewportH?: number;
  dpr?: number;
  platform?: string;
  sessionId: string;
  returning: boolean;
  tsClient: string;
}

function clip(s: string | undefined, max: number): string | undefined {
  if (!s) return undefined;
  const t = s.slice(0, max);
  return t ? t : undefined;
}

/**
 * Чистый конструктор payload. ВАЖНО: location.hash («#d=…» с содержимым
 * листа из Share link) отрезается и никогда не отправляется.
 */
export function buildVisitPayload(e: VisitEnv): VisitPayload {
  let landing = e.href.split('#')[0] ?? e.href;
  let utm_source: string | undefined;
  let utm_medium: string | undefined;
  let utm_campaign: string | undefined;
  try {
    const u = new URL(e.href);
    u.hash = '';
    landing = u.toString();
    utm_source = u.searchParams.get('utm_source') ?? undefined;
    utm_medium = u.searchParams.get('utm_medium') ?? undefined;
    utm_campaign = u.searchParams.get('utm_campaign') ?? undefined;
  } catch {
    // относительный/битый href — остаётся обрезанный вариант выше
  }
  const p: VisitPayload = { v: 1 };
  if (e.tz) p.tz = e.tz.slice(0, 60);
  if (e.tzOffsetMin !== undefined && Number.isFinite(e.tzOffsetMin))
    p.tz_offset_min = e.tzOffsetMin;
  if (e.locale) p.locale = e.locale.slice(0, 24);
  if (e.screenW && e.screenH) p.screen = `${e.screenW}x${e.screenH}`;
  if (e.viewportW && e.viewportH) p.viewport = `${e.viewportW}x${e.viewportH}`;
  if (e.dpr && Number.isFinite(e.dpr)) p.dpr = Math.min(e.dpr, 8);
  if (e.platform) p.platform = e.platform.slice(0, 40);
  p.landing = clip(landing, 300);
  p.referrer = clip(e.referrer?.split('#')[0], 300);
  p.utm_source = clip(utm_source, 60);
  p.utm_medium = clip(utm_medium, 60);
  p.utm_campaign = clip(utm_campaign, 60);
  p.ts_client = e.tsClient;
  p.session_id = e.sessionId.slice(0, 40);
  p.returning = e.returning;
  return p;
}

function newSid(): string {
  try {
    const c = globalThis.crypto;
    if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  } catch {
    // ниже fallback
  }
  return `r-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`;
}

/**
 * Debug-режим для проверки в браузере: `?nya_debug=1` в URL или
 * `localStorage.nya_debug = '1'`. Трекер пишет в консоль, что решил
 * (скип с причиной / отправка / ответ сервера), в проде по умолчанию тихо.
 */
function isDebug(): boolean {
  try {
    if (typeof window === 'undefined') return false;
    if (window.location.search.includes('nya_debug=1')) return true;
    return localStorage.getItem('nya_debug') === '1';
  } catch {
    return false;
  }
}

function mark(status: string, debug: boolean, ...args: unknown[]): void {
  try {
    (window as unknown as { __nyaHit?: string }).__nyaHit = status;
  } catch {
    // ignore
  }
  if (debug) console.info('[nya-analytics]', status, ...args);
}

/**
 * Отправить один хит за сессию вкладки. Молча игнорирует localhost,
 * file://, DNT=1 и повторные вызовы. Не тормозит старт: шлёт после load.
 */
export function trackVisitOnce(): void {
  let debug = false;
  try {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    debug = isDebug();
    const { hostname, href } = window.location;
    if (
      hostname === '' ||
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '[::1]' ||
      hostname.endsWith('.local') ||
      window.location.protocol === 'file:'
    ) {
      mark('skipped:local-host', debug, hostname); // dev/локальные файлы — не спамим в Telegram
      return;
    }
    if (window.navigator?.doNotTrack === '1') {
      mark('skipped:dnt', debug); // уважаем DNT
      return;
    }
    if (sessionStorage.getItem(SENT_KEY)) {
      mark('skipped:already-sent-this-tab', debug);
      return;
    }
    sessionStorage.setItem(SENT_KEY, '1');

    let sid = sessionStorage.getItem(SID_KEY);
    if (!sid) {
      sid = newSid();
      try {
        sessionStorage.setItem(SID_KEY, sid);
      } catch {
        // приватный режим — sid просто не сохранится
      }
    }
    let returning = false;
    try {
      returning = localStorage.getItem(SEEN_KEY) === '1';
      localStorage.setItem(SEEN_KEY, '1');
    } catch {
      // приватный режим — считаем новым визитом
    }

    let tz: string | undefined;
    try {
      tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch {
      tz = undefined;
    }
    const payload = buildVisitPayload({
      href,
      referrer: document.referrer || undefined,
      tz,
      tzOffsetMin: new Date().getTimezoneOffset(),
      locale: window.navigator?.language,
      screenW: window.screen?.width,
      screenH: window.screen?.height,
      viewportW: window.innerWidth,
      viewportH: window.innerHeight,
      dpr: window.devicePixelRatio,
      platform: (window.navigator as Navigator & { userAgentData?: { platform?: string } })
        ?.userAgentData?.platform,
      sessionId: sid,
      returning,
      tsClient: new Date().toISOString(),
    });
    const body = JSON.stringify(payload);

    const send = (): void => {
      mark('sending', debug, payload);
      try {
        if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
          const blob = new Blob([body], { type: 'application/json' });
          if (navigator.sendBeacon(ENDPOINT, blob)) {
            mark('sent:beacon', debug);
            return;
          }
          mark('beacon-rejected:fetch-fallback', debug);
        }
        void fetch(ENDPOINT, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body,
          keepalive: true,
        })
          .then((r) => mark(`sent:fetch-${r.status}`, debug))
          .catch((e) => mark('failed:fetch', debug, String(e)));
      } catch (e) {
        mark('failed:exception', debug, String(e));
        // аналитика никогда не должна ронять приложение
      }
    };

    if (document.readyState === 'complete') window.setTimeout(send, 2500);
    else window.addEventListener('load', () => window.setTimeout(send, 2500), { once: true });
  } catch {
    // аналитика никогда не должна ронять приложение
  }
}
