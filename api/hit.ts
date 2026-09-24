// POST /api/hit — приём факта визита и пересылка в Telegram.
//
// ПРИВАТНОСТЬ СЕКРЕТОВ:
// - TELEGRAM_BOT_TOKEN и TELEGRAM_CHAT_ID читаются ТОЛЬКО здесь,
//   из env серверной функции (Vercel → Settings → Environment Variables).
// - Этот файл никогда не попадает в клиентский бандл Vite (он вне /src,
//   выполняется только на стороне Vercel), а ответ клиенту всегда
//   одинаковый `{ok:true}` — ни токен, ни chat_id наружу не утекают.
// - Гео (страна/город) и IP берём из заголовков, которые бесплатно
//   проставляет сам Vercel — отдельного GeoIP-сервиса не нужно.

export const config = { runtime: 'edge' };

// Best-effort антиспам: один IP — одно сообщение в TG раз в 30 минут.
// (память живёт только пока тёплый инстанс, для MVP этого достаточно;
//  персистентный лимит — отдельным шагом через KV/БД при желании).
const THROTTLE_MS = 30 * 60 * 1000;
const lastHitByIp = new Map<string, number>();

function readEnv(name: string): string {
  const proc = (globalThis as unknown as { process?: { env?: Record<string, string | undefined> } })
    .process;
  return proc?.env?.[name] ?? '';
}

function ok(): Response {
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}

/** Экранирование для Telegram parse_mode=HTML. */
export function escapeHtml(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function str(v: unknown, max: number): string {
  return String(v ?? '').slice(0, max);
}

/** Первый IP из x-forwarded-for (его ставит Vercel) либо x-real-ip. */
export function clientIpFromHeaders(h: Headers): string {
  const fwd = h.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0]!.trim().slice(0, 45);
  return (h.get('x-real-ip') ?? 'unknown').slice(0, 45);
}

/** Vercel кодирует не-ASCII гео (напр. город) в latin1 — чиним при наличии. */
function geo(h: Headers, name: string): string {
  const raw = h.get(name) ?? '';
  if (!raw) return '';
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

function prune(now: number): void {
  if (lastHitByIp.size < 500) return;
  for (const [k, t] of lastHitByIp) if (now - t > THROTTLE_MS) lastHitByIp.delete(k);
}

interface VisitBody {
  tz?: unknown;
  tz_offset_min?: unknown;
  locale?: unknown;
  screen?: unknown;
  viewport?: unknown;
  dpr?: unknown;
  platform?: unknown;
  landing?: unknown;
  referrer?: unknown;
  utm_source?: unknown;
  utm_medium?: unknown;
  utm_campaign?: unknown;
  ts_client?: unknown;
  session_id?: unknown;
  returning?: unknown;
}

/** Текст сообщения в TG. Чистый форматтер — без секретов и без fetch. */
export function formatVisitMessage(h: Headers, b: VisitBody): string {
  const ip = clientIpFromHeaders(h);
  const country = geo(h, 'x-vercel-ip-country');
  const region = geo(h, 'x-vercel-ip-country-region');
  const city = geo(h, 'x-vercel-ip-city');
  const lat = geo(h, 'x-vercel-ip-latitude');
  const lon = geo(h, 'x-vercel-ip-longitude');
  const ua = str(h.get('user-agent') ?? '', 140);

  const place = [city, region, country].filter(Boolean).join(', ') || 'unknown';
  const coords = lat && lon ? ` (${lat}, ${lon})` : '';
  const tzRaw = str(b.tz ?? '', 60);
  const tzOff =
    b.tz_offset_min === undefined
      ? ''
      : ` (UTC${Number(b.tz_offset_min) <= 0 ? '+' : ''}${-Number(b.tz_offset_min) / 60})`;
  const utm = [b.utm_source, b.utm_medium, b.utm_campaign].filter(Boolean).map(String).join(' / ');

  const lines = [
    '🟢 <b>NyaMath visit</b>',
    `🕒 server: ${escapeHtml(new Date().toISOString())}`,
    `🕒 client: ${escapeHtml(str(b.ts_client ?? '', 32))}`,
    `🌍 ${escapeHtml(place)}${escapeHtml(coords)}`,
    `🌐 IP: <code>${escapeHtml(ip)}</code>`,
    `🕓 TZ: ${escapeHtml(tzRaw || 'unknown')}${escapeHtml(tzRaw ? tzOff : '')}`,
    `🖥 ${escapeHtml(str(b.screen ?? '', 24))} · viewport ${escapeHtml(str(b.viewport ?? '', 24))} · dpr ${escapeHtml(str(b.dpr ?? '', 8))}`,
    `🗣 ${escapeHtml(str(b.locale ?? '', 24))} · ${escapeHtml(str(b.platform ?? '', 40))}`,
    `🔗 ${escapeHtml(str(b.landing ?? '', 200))}`,
    `↩️ ref: ${escapeHtml(str(b.referrer ?? '', 200) || '—')}`,
  ];
  if (utm) lines.push(`📌 utm: ${escapeHtml(str(utm, 120))}`);
  lines.push(
    `🆔 sid: <code>${escapeHtml(str(b.session_id ?? '', 40))}</code> · ${b.returning ? 'returning' : 'new'}`,
    `🤖 ${escapeHtml(ua)}`,
  );
  return lines.join('\n').slice(0, 3800);
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') return ok();

  let body: VisitBody = {};
  try {
    body = (await req.json()) as VisitBody;
  } catch {
    body = {};
  }

  const h = req.headers;
  const ip = clientIpFromHeaders(h);
  const now = Date.now();
  prune(now);
  const last = lastHitByIp.get(ip) ?? 0;
  if (now - last < THROTTLE_MS) return ok(); // тихо: ответ неотличим от успешной отправки
  lastHitByIp.set(ip, now);

  const token = readEnv('TELEGRAM_BOT_TOKEN');
  const chatId = readEnv('TELEGRAM_CHAT_ID');
  if (!token || !chatId) return ok(); // env не задан (напр. локально) — клиенту всё равно ok

  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    try {
      await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: formatVisitMessage(h, body),
          parse_mode: 'HTML',
          disable_web_page_preview: true,
        }),
        signal: ctrl.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  } catch {
    // глушим: наружу — всегда одинаковый ok, без деталей ошибки
  }
  return ok();
}
