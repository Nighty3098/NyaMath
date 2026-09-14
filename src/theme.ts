/**
 * Темы оформления + палитры графиков.
 *
 * Источники палитр (canonical hex с GitHub):
 * - gruvbox dark/light .... morhetz/gruvbox (colors/gruvbox.vim)
 * - nord dark/light ........ nordtheme.com/docs/colors-and-palettes (nord0..nord15)
 * - solarized dark ......... altercation/vim-colors-solarized (base03..base3 + акценты)
 * - osaka-solarized ........ craftzdog/solarized-osaka.nvim (lua/solarized-osaka/colors.lua, HSL→hex)
 * - nightfly ............... bluz71/vim-nightfly-colors (autoload/nightfly.vim)
 * - github dark/light ...... primer/github-vscode-theme (src/colors.js) + primer/primitives
 */
export type ThemeName =
  | 'gruvbox-dark'
  | 'gruvbox-light'
  | 'nord-dark'
  | 'nord-light'
  | 'solarized-dark'
  | 'osaka-solarized'
  | 'nightfly'
  | 'github-dark'
  | 'github-light';

export interface ThemeMeta {
  id: ThemeName;
  /** kind для иконки в меню (солнце/луна); подпись — через themeLabel() из i18n */
  kind: 'dark' | 'light';
}

export const THEMES: ThemeMeta[] = [
  { id: 'gruvbox-dark', kind: 'dark' },
  { id: 'gruvbox-light', kind: 'light' },
  { id: 'nord-dark', kind: 'dark' },
  { id: 'nord-light', kind: 'light' },
  { id: 'solarized-dark', kind: 'dark' },
  { id: 'osaka-solarized', kind: 'dark' },
  { id: 'nightfly', kind: 'dark' },
  { id: 'github-dark', kind: 'dark' },
  { id: 'github-light', kind: 'light' },
];

const LIGHT: ReadonlySet<ThemeName> = new Set(['gruvbox-light', 'nord-light', 'github-light']);

/** Светлая ли тема (для сетки Canvas и прочих ветвлений «светлое/тёмное»). */
export function isLightTheme(t: ThemeName): boolean {
  return LIGHT.has(t);
}

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
  'gruvbox-dark': {
    svgBg: '#282828',
    grid: '#a89984',
    gridOpacity: 0.18,
    tick: '#a89984',
    axis: '#665c54',
    frame: '#3c3836',
    legend: '#ebdbb2',
    series: ['#83a598', '#b8bb26', '#fabd2f', '#fb4934', '#8ec07c', '#d3869b', '#fe8019'],
  },
  'gruvbox-light': {
    svgBg: '#fbf1c7',
    grid: '#3c3836',
    gridOpacity: 0.1,
    tick: '#665c54',
    axis: '#928374',
    frame: '#d5c4a1',
    legend: '#3c3836',
    series: ['#076678', '#79740e', '#b57614', '#9d0006', '#427b58', '#8f3f71', '#af3a03'],
  },
  'nord-dark': {
    svgBg: '#3b4252',
    grid: '#d8dee9',
    gridOpacity: 0.14,
    tick: '#d8dee9',
    axis: '#4c566a',
    frame: '#434c5e',
    legend: '#eceff4',
    series: ['#88c0d0', '#a3be8c', '#ebcb8b', '#bf616a', '#81a1c1', '#b48ead', '#8fbcbb'],
  },
  'nord-light': {
    svgBg: '#eceff4',
    grid: '#2e3440',
    gridOpacity: 0.1,
    tick: '#4c566a',
    axis: '#9aa4b8',
    frame: '#d8dee9',
    legend: '#2e3440',
    series: ['#5e81ac', '#6a9a4f', '#9a7500', '#bf616a', '#4c9aad', '#9a6fb0', '#c27629'],
  },
  'solarized-dark': {
    svgBg: '#073642',
    grid: '#93a1a1',
    gridOpacity: 0.16,
    tick: '#839496',
    axis: '#586e75',
    frame: '#16414d',
    legend: '#93a1a1',
    series: ['#268bd2', '#859900', '#b58900', '#dc322f', '#2aa198', '#d33682', '#6c71c4'],
  },
  'osaka-solarized': {
    svgBg: '#002d38',
    grid: '#adb8b8',
    gridOpacity: 0.16,
    tick: '#839495',
    axis: '#586e74',
    frame: '#073541',
    legend: '#9fabad',
    series: ['#278bd3', '#859900', '#b28600', '#dc312e', '#2aa298', '#d33682', '#6d72c5'],
  },
  nightfly: {
    svgBg: '#092236',
    grid: '#c3ccdc',
    gridOpacity: 0.14,
    tick: '#a1aab8',
    axis: '#4b6479',
    frame: '#1d3b53',
    legend: '#d6deeb',
    series: ['#82aaff', '#21c7a8', '#ecc48d', '#fc514e', '#7fdbca', '#c792ea', '#e3d18a'],
  },
  'github-dark': {
    svgBg: '#161b22',
    grid: '#e6edf3',
    gridOpacity: 0.12,
    tick: '#7d8590',
    axis: '#3d444d',
    frame: '#30363d',
    legend: '#e6edf3',
    series: ['#4493f8', '#3fb950', '#d29922', '#f85149', '#39c5cf', '#a371f7', '#db61a2'],
  },
  'github-light': {
    svgBg: '#ffffff',
    grid: '#1f2328',
    gridOpacity: 0.08,
    tick: '#656d76',
    axis: '#8c959f',
    frame: '#d0d7de',
    legend: '#1f2328',
    series: ['#0969da', '#1a7f37', '#9a6700', '#cf222e', '#039172', '#8250df', '#cf4797'],
  },
};

const KEY = 'nyamath-theme';
const KEY_LEGACY = 'wengineering-theme';

function isThemeName(v: unknown): v is ThemeName {
  return typeof v === 'string' && (THEMES as { id: string }[]).some((t) => t.id === v);
}

export function loadTheme(): ThemeName {
  try {
    const v = localStorage.getItem(KEY) ?? localStorage.getItem(KEY_LEGACY);
    if (isThemeName(v)) return v;
    // миграция со старых имён
    if (v === 'gruvbox' || v === 'dark') return 'gruvbox-dark';
    if (v === 'light') return 'github-light';
    return 'gruvbox-dark';
  } catch {
    return 'gruvbox-dark';
  }
}

export function saveTheme(t: ThemeName) {
  try {
    localStorage.setItem(KEY, t);
  } catch { /* ignore */ }
}
