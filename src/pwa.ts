/**
 * PWA-регистрация: service worker — только в production-сборке
 * (в dev он бы отдавал stale-чанки). Чистые хелперы — под тестами.
 */

/** Имя кэша офлайн-оболочки (совпадает с CACHE в public/sw.js). */
export const SW_CACHE = 'nyamath-v1';

/** URL воркера с учётом BASE_URL (сабпуть-деплой). */
export function swUrl(base: string = import.meta.env.BASE_URL): string {
  const b = base.endsWith('/') ? base : `${base}/`;
  return `${b}sw.js`;
}

export type SwStatus = 'registered' | 'skipped' | 'unsupported';

/** Зарегистрировать SW один раз (идемпотентно, ошибки — молча). */
export function registerSW(): SwStatus {
  try {
    if (!import.meta.env.PROD) return 'skipped';
    if (typeof location !== 'undefined' && location.protocol === 'app:') return 'skipped';
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return 'unsupported';
    void navigator.serviceWorker.register(swUrl()).catch(() => {
      /* приватный режим / запрет SW — работаем без офлайна */
    });
    return 'registered';
  } catch {
    return 'unsupported';
  }
}
