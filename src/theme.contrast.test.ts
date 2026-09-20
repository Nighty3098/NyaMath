import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { THEMES, plotPalettes } from './theme';

/**
 * Контрастный аудит тем (DESIGN.md: тёмная тема читаема, уроки Jupyter
 * про низкую контрастность подсветки/текста). WCAG 2.1:
 * - текст и текст в инпутах — AA 4.5 (обычный кегль);
 * - легенда/тики графиков (цифры ~10px) — AA 4.5;
 * - линии серий (тонкая графика) — non-text 3.0.
 * Цвета читаются из src/index.css, чтобы тест ловил рассинхрон CSS/TS.
 */

function lum(hex: string): number {
  const h = hex.trim().toLowerCase();
  const m = /^#([0-9a-f]{6})$/.exec(h);
  if (!m) throw new Error(`not a hex color: ${hex}`);
  const rgb = [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16) / 255);
  const f = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * f(rgb[0]) + 0.7152 * f(rgb[1]) + 0.0722 * f(rgb[2]);
}

function ratio(a: string, b: string): number {
  const la = lum(a);
  const lb = lum(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

function themeVars(): Map<string, Map<string, string>> {
  const css = readFileSync(new URL('./index.css', import.meta.url), 'utf-8');
  const out = new Map<string, Map<string, string>>();
  for (const m of css.matchAll(/\[data-theme="([\w-]+)"\]\s*\{([^}]*)\}/g)) {
    const vars = new Map<string, string>();
    for (const v of m[2].matchAll(/(--[\w-]+)\s*:\s*(#[0-9a-fA-F]{6});/g)) {
      vars.set(v[1], v[2]);
    }
    out.set(m[1], vars);
  }
  return out;
}

const TEXT_AA = 4.5;
const GRAPHIC_AA = 3.0;

describe('themes: text contrast (WCAG AA 4.5)', () => {
  const themes = themeVars();
  for (const t of THEMES) {
    it(`${t.id}: body and secondary text on sheet/input`, () => {
      const v = themes.get(t.id);
      expect(v, `${t.id} vars`).toBeTruthy();
      const get = (k: string) => {
        const c = v!.get(k);
        expect(c, `${t.id} ${k}`).toBeTruthy();
        return c!;
      };
      const sheet = get('--sheet');
      const inputBg = get('--input-bg');
      for (const fg of ['--ink', '--ink-soft', '--faint', '--accent-ink', '--danger', '--ok']) {
        expect(ratio(get(fg), sheet), `${t.id} ${fg}/sheet`).toBeGreaterThanOrEqual(TEXT_AA);
      }
      // текст внутри инпутов лежит на input-bg, а не на sheet
      for (const fg of ['--ink', '--ink-soft', '--faint']) {
        expect(ratio(get(fg), inputBg), `${t.id} ${fg}/input-bg`).toBeGreaterThanOrEqual(TEXT_AA);
      }
      const chrome = get('--chrome');
      for (const fg of ['--chrome-ink', '--chrome-soft']) {
        expect(ratio(get(fg), chrome), `${t.id} ${fg}/chrome`).toBeGreaterThanOrEqual(TEXT_AA);
      }
    });
  }
});

describe('themes: plot legend/ticks/series contrast', () => {
  for (const t of THEMES) {
    it(`${t.id}: legend and ticks are text (AA 4.5), series are graphics (3.0)`, () => {
      const p = plotPalettes[t.id];
      expect(p, `${t.id} palette`).toBeTruthy();
      expect(ratio(p.legend, p.svgBg), `${t.id} legend`).toBeGreaterThanOrEqual(TEXT_AA);
      expect(ratio(p.tick, p.svgBg), `${t.id} tick`).toBeGreaterThanOrEqual(TEXT_AA);
      for (const s of p.series) {
        expect(ratio(s, p.svgBg), `${t.id} series ${s}`).toBeGreaterThanOrEqual(GRAPHIC_AA);
      }
    });
  }
});
