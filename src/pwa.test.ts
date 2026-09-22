import { describe, expect, it } from 'vitest';
import { SW_CACHE, swUrl } from './pwa';

/** PWA-хелперы: имя кэша и URL воркера (без DOM). */
describe('pwa', () => {
  it('кэш совпадает с public/sw.js', async () => {
    const sw = await import('node:fs').then((fs) => fs.readFileSync('public/sw.js', 'utf-8'));
    expect(sw).toContain(`'${SW_CACHE}'`);
  });

  it('swUrl уважает BASE_URL', () => {
    expect(swUrl('/')).toBe('/sw.js');
    expect(swUrl('/app/')).toBe('/app/sw.js');
    expect(swUrl('/app')).toBe('/app/sw.js');
  });

  it('манифест валиден и ссылается на иконку', async () => {
    const fs = await import('node:fs');
    const m = JSON.parse(fs.readFileSync('public/manifest.webmanifest', 'utf-8'));
    expect(m.short_name).toBe('NyaMath');
    expect(m.display).toBe('standalone');
    expect(m.start_url).toBe('.');
    expect(m.icons.length).toBeGreaterThan(0);
    for (const ic of m.icons) {
      expect(fs.existsSync(`public/${ic.src}`)).toBe(true);
    }
  });
});
