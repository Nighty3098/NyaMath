import { describe, expect, it } from 'vitest';
import { buildVisitPayload } from './analytics';

const base = {
  sessionId: 'sid-1',
  returning: false,
  tsClient: '2026-09-24T10:00:00.000Z',
};

describe('buildVisitPayload', () => {
  it('отрезает #d= с содержимым листа из share-ссылки', () => {
    const p = buildVisitPayload({
      ...base,
      href: 'https://nyamath.vercel.app/?utm_source=tg#d=HUGEDOCDATA'.replace(
        'HUGEDOCDATA',
        'x'.repeat(5000),
      ),
      tz: 'Europe/Moscow',
      tzOffsetMin: -180,
    });
    expect(p.landing).toBe('https://nyamath.vercel.app/?utm_source=tg');
    expect(p.landing!.length).toBeLessThanOrEqual(300);
    expect(p.utm_source).toBe('tg');
    expect(p.tz).toBe('Europe/Moscow');
    expect(p.tz_offset_min).toBe(-180);
  });

  it('режет длинные referrer и проставляет returning', () => {
    const p = buildVisitPayload({
      ...base,
      href: 'https://nyamath.vercel.app/',
      referrer: `https://example.com/${'y'.repeat(1000)}`,
      returning: true,
    });
    expect(p.referrer!.length).toBeLessThanOrEqual(300);
    expect(p.returning).toBe(true);
  });

  it('терпит битый href без исключений', () => {
    const p = buildVisitPayload({ ...base, href: 'not a url at all' });
    expect(p.v).toBe(1);
    expect(typeof p.landing).toBe('string');
  });
});
