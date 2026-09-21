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
  | 'github-light'
  | 'blueprint'
  | 'graph'
  | 'mathcad15';

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
  { id: 'blueprint', kind: 'dark' },
  { id: 'graph', kind: 'light' },
  { id: 'mathcad15', kind: 'light' },
];

const LIGHT: ReadonlySet<ThemeName> = new Set(['gruvbox-light', 'nord-light', 'github-light', 'graph', 'mathcad15']);

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
    series: ['#88c0d0', '#a3be8c', '#ebcb8b', '#d18f98', '#81a1c1', '#b48ead', '#8fbcbb'],
  },
  'nord-light': {
    svgBg: '#eceff4',
    grid: '#2e3440',
    gridOpacity: 0.1,
    tick: '#4c566a',
    axis: '#9aa4b8',
    frame: '#d8dee9',
    legend: '#2e3440',
    series: ['#5e81ac', '#4a7a33', '#9a7500', '#bf616a', '#35718a', '#9a6fb0', '#c27629'],
  },
  'solarized-dark': {
    svgBg: '#073642',
    grid: '#93a1a1',
    gridOpacity: 0.16,
    tick: '#93a1a1',
    axis: '#586e75',
    frame: '#16414d',
    legend: '#93a1a1',
    series: ['#268bd2', '#859900', '#b58900', '#e86a5a', '#2aa198', '#e06ba0', '#8a90d8'],
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
    svgBg: '#262422',
    grid: '#ede9e2',
    gridOpacity: 0.12,
    tick: '#a39e96',
    axis: '#4b4440',
    frame: '#38342f',
    legend: '#ede9e2',
    series: ['#d97757', '#7db383', '#e8c468', '#e4685e', '#7dc4c4', '#a88bd4', '#e08bb0'],
  },
  'github-light': {
    svgBg: '#ffffff',
    grid: '#1f1e1d',
    gridOpacity: 0.08,
    tick: '#6f6e69',
    axis: '#9b9993',
    frame: '#e8e6e1',
    legend: '#1f1e1d',
    series: ['#c15f3c', '#3e7c43', '#1c6fb8', '#b7791f', '#2a7f7f', '#7c5cbf', '#c44b7a'],
  },
  blueprint: {
    svgBg: '#14325c',
    grid: '#f4f7fb',
    gridOpacity: 0.16,
    tick: '#c9d6e8',
    axis: '#5b7bab',
    frame: '#0e2547',
    legend: '#f4f7fb',
    series: ['#ffffff', '#ffb020', '#5fd0ff', '#7fd08a', '#ff7a6b', '#c9a6ff', '#ffd97a'],
  },
  graph: {
    svgBg: '#ffffff',
    grid: '#1e6c3c',
    gridOpacity: 0.12,
    tick: '#3f5a52',
    axis: '#9db8ad',
    frame: '#d7e2dc',
    legend: '#1c3d5a',
    series: ['#1c3d5a', '#c0392b', '#1e7c43', '#8a5a00', '#0e6e6e', '#6a3fb5', '#b5477a'],
  },
  mathcad15: {
    svgBg: '#ffffff',
    grid: '#000000',
    gridOpacity: 0.12,
    tick: '#404040',
    axis: '#000000',
    frame: '#808080',
    legend: '#000000',
    series: ['#0000ff', '#ff0000', '#008000', '#000000', '#ff00ff', '#008080', '#808080'],
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
    if (v === 'gruvbox' || v === 'dark') return 'github-dark';
    if (v === 'light') return 'github-light';
    // по умолчанию — инженерная синька
    return 'blueprint';
  } catch {
    return 'blueprint';
  }
}

export function saveTheme(t: ThemeName) {
  try {
    localStorage.setItem(KEY, t);
  } catch { /* ignore */ }
}
