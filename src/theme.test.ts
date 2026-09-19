import { describe, expect, it } from 'vitest';
import { THEMES, isLightTheme, plotPalettes } from './theme';

describe('themes', () => {
  it('have unique ids with valid kinds', () => {
    const ids = THEMES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const t of THEMES) {
      expect(t.kind === 'light' || t.kind === 'dark').toBe(true);
    }
  });

  it('every theme has a plot palette and a light/dark verdict', () => {
    for (const t of THEMES) {
      expect(plotPalettes[t.id], t.id).toBeTruthy();
      expect(plotPalettes[t.id].series.length).toBeGreaterThan(0);
      expect(typeof isLightTheme(t.id)).toBe('boolean');
    }
  });

  it('ships engineering themes', () => {
    expect(THEMES.some((t) => t.id === 'blueprint')).toBe(true);
    expect(THEMES.some((t) => t.id === 'graph')).toBe(true);
  });
});
