/** Тема оформления + палитры графиков (пары проверены на контраст). */
export type ThemeName = 'light' | 'gruvbox';

export interface PlotPalette {
  svgBg: string;
  grid: string;
  gridOpacity: number;
  tick: string;
  axis: string;
  frame: string;
  legend: string;
  series: string[];
}

export const plotPalettes: Record<ThemeName, PlotPalette> = {
  light: {
    svgBg: '#ffffff',
    grid: '#0f172a',
    gridOpacity: 0.08,
    tick: '#64748b',
    axis: '#94a3b8',
    frame: '#cbd5e1',
    legend: '#334155',
    series: ['#4f46e5', '#059669', '#d97706', '#e11d48', '#0891b2'],
  },
  gruvbox: {
    svgBg: '#282828',
    grid: '#a89984',
    gridOpacity: 0.18,
    tick: '#a89984',
    axis: '#665c54',
    frame: '#3c3836',
    legend: '#ebdbb2',
    series: ['#83a598', '#b8bb26', '#fabd2f', '#fb4934', '#8ec07c', '#d3869b', '#fe8019'],
  },
};

const KEY = 'wengineering-theme';

export function loadTheme(): ThemeName {
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'light') return 'light';
    // миграция со старой тёмной темы
    return 'gruvbox';
  } catch {
    return 'gruvbox';
  }
}

export function saveTheme(t: ThemeName) {
  try {
    localStorage.setItem(KEY, t);
  } catch { /* ignore */ }
}
