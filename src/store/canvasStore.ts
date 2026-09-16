import { create } from 'zustand';
import { v4 as uuid } from 'uuid';
import { recalculateAll, type MathBlockData } from '../engine/dependencies';
import { TEST_SCENARIO_LINES } from '../data/testScenario';
import { ADVANCED_DEMO } from '../data/demoAdvanced';
import { loadTheme, saveTheme, THEMES, type ThemeName } from '../theme';
import { getSimModel, SIM_MODELS, simModelPatch } from '../engine/simEngine';
import { loadLang, setLangState, t, type Lang } from '../i18n';

const STORAGE_KEY = 'nyamath-doc-v1';
const STORAGE_KEY_LEGACY = 'wengineering-doc-v1';
const GRID_KEY = 'nyamath-show-grid';
const GRID_KEY_LEGACY = 'wengineering-show-grid';

function loadGrid(): boolean {
  try {
    return (localStorage.getItem(GRID_KEY) ?? localStorage.getItem(GRID_KEY_LEGACY)) === '1';
  } catch {
    return false;
  }
}

function saveGrid(v: boolean) {
  try {
    localStorage.setItem(GRID_KEY, v ? '1' : '0');
  } catch { /* ignore */ }
}

export interface CanvasState {
  blocks: Record<string, MathBlockData>;
  /** Мультивыделение (рамкой, Shift+клик) */
  selectedIds: string[];
  showGrid: boolean;
  theme: ThemeName;
  setTheme: (t: ThemeName) => void;
  toggleTheme: () => void;
  lang: Lang;
  setLang: (l: Lang) => void;
  /** Плавающая палитра функций (окно поверх листа, вкл/выкл через меню Вид) */
  paletteOpen: boolean;
  setPaletteOpen: (v: boolean) => void;
  togglePalette: () => void;
  /** Режим палитры: float — окно поверх, left/right — док на всю высоту со сдвигом листа */
  paletteMode: PaletteMode;
  setPaletteMode: (m: PaletteMode) => void;
  /** Размер float-окна */
  paletteW: number;
  paletteH: number;
  setPaletteSize: (w: number, h: number) => void;
  /** Ширина пристыкованной панели */
  paletteDockW: number;
  setPaletteDockW: (w: number) => void;
  recalcCounter: number;
  addBlock: (x: number, y: number, raw?: string, edit?: boolean) => void;
  addPlotBlock: (x: number, y: number, fn?: string, patch?: Partial<MathBlockData>) => void;
  addContourBlock: (x: number, y: number, fn?: string) => void;
  addPlot3dBlock: (x: number, y: number, fn?: string) => void;
  addProgramBlock: (x: number, y: number, raw?: string, exportName?: string) => void;
  addSimBlock: (x: number, y: number, modelId?: string) => void;
  updateSim: (id: string, patch: Partial<MathBlockData>) => void;
  addSliderBlock: (x: number, y: number) => void;
  setSliderValue: (id: string, val: number) => void;
  updateSlider: (id: string, patch: Partial<MathBlockData>) => void;
  updateInput: (id: string, raw: string) => void;
  setExportName: (id: string, name: string) => void;
  moveBlock: (id: string, x: number, y: number) => void;
  /** Финал перетаскивания тени: батч координат + один пересчёт (без push истории) */
  dropBlocks: (positions: Record<string, { x: number; y: number }>) => void;
  commitDrag: () => void;
  /** Ручной размер (без пересчёта формул); persist — через commitDrag */
  sizeTo: (id: string, w: number | null, h?: number | null) => void;
  removeBlock: (id: string) => void;
  removeSelected: () => void;
  select: (id: string | null) => void;
  selectMany: (ids: string[]) => void;
  toggleSelect: (id: string) => void;
  toggleGrid: () => void;
  recalc: () => void;
  clear: () => void;
  loadTestScenario: () => void;
  loadAdvancedDemo: () => void;
  /** Загрузить документ из файла (валидация + миграция) */
  loadDocument: (data: unknown) => { ok: boolean; message: string };
  updatePlot: (id: string, patch: Partial<MathBlockData>) => void;
  /** История undo/redo (снапшоты blocks, без persist) */
  past: Record<string, MathBlockData>[];
  future: Record<string, MathBlockData>[];
  undo: () => void;
  redo: () => void;
  /** Снапшот перед жестом (драг/ресайз): вызывается на pointerdown */
  beginGesture: () => void;
  /** Курсор-прицел в стиле Mathcad (мировые координаты листа) */
  cross: { x: number; y: number };
  setCross: (x: number, y: number) => void;
  nudgeCross: (dx: number, dy: number) => void;
  /** Блок, для которого надо открыть редактор сразу после создания (печать с прицела) */
  pendingEditId: string | null;
  requestEdit: (id: string) => void;
  consumePendingEdit: (id: string) => boolean;
}

function blank(id: string, x: number, y: number): MathBlockData {
  return {
    id, x, y, rawInput: '', displayLatex: '', resultStr: '', resultLatex: '',
    resultValue: null, error: null, dependencies: [], definedVar: null, isOutput: false, kind: 'math',
    plotPreview: null,
  };
}

function withRecalc(blocks: Record<string, MathBlockData>): Record<string, MathBlockData> {
  const { blocks: out } = recalculateAll(Object.values(blocks));
  return out;
}

function persist(blocks: Record<string, MathBlockData>) {
  try {
    // plotPreview/simResult — пересчитываемые данные, в файл/хранилище не пишем
    const slim = Object.values(blocks).map(({ plotPreview: _pp, simResult: _sr, ...b }) => b);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(slim));
  } catch { /* ignore */ }
}

/** Привести сырой объект к MathBlockData (миграция старых сохранений и файлов) */
function migrate(raw: unknown): MathBlockData | null {
  if (!raw || typeof raw !== 'object') return null;
  const b = raw as Partial<MathBlockData>;
  if (typeof b.x !== 'number' || typeof b.y !== 'number' || typeof b.rawInput !== 'string') return null;
  const id = typeof b.id === 'string' && b.id ? b.id : uuid();
  const kind = b.kind === 'plot' || b.kind === 'plot3d' || b.kind === 'program' || b.kind === 'text' || b.kind === 'sim' || b.kind === 'contour' || b.kind === 'slider' ? b.kind : 'math';
  const numOrNull = (v: unknown): number | null => (typeof v === 'number' && isFinite(v) ? v : null);
  const numOrUndef = (v: unknown): number | undefined => (typeof v === 'number' && isFinite(v) ? v : undefined);
  const strOrUndef = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);
  const plotProj = b.plotProj === 'polar' || b.plotProj === 'xy' ? b.plotProj : undefined;
  const plotTrace = b.plotTrace === 'bar' || b.plotTrace === 'stem' || b.plotTrace === 'line' ? b.plotTrace : undefined;
  const simSolver = b.simSolver === 'euler' || b.simSolver === 'rk4' || b.simSolver === 'rk45' || b.simSolver === 'trbdf2' ? b.simSolver : undefined;
  const simMode = b.simMode === 'fdtd' ? 'fdtd' : undefined;
  const simFdtdSrc = b.simFdtdSrc === 'sine' ? 'sine' : undefined;
  return {
    ...blank(id, b.x, b.y),
    ...b,
    id,
    kind,
    resultLatex: b.resultLatex ?? '',
    isOutput: b.isOutput ?? false,
    plotPreview: null,
    simResult: null,
    exportName: typeof b.exportName === 'string' ? b.exportName : undefined,
    plotYmin: numOrUndef(b.plotYmin),
    plotYmax: numOrUndef(b.plotYmax),
    plotMode: b.plotMode === 'surface' || b.plotMode === 'points' || b.plotMode === 'matrix' ? b.plotMode : undefined,
    plotResolution: numOrUndef(b.plotResolution),
    plotWireframe: typeof b.plotWireframe === 'boolean' ? b.plotWireframe : undefined,
    plotProj,
    plotTrace,
    plotErr: strOrUndef(b.plotErr),
    plotTitle: strOrUndef(b.plotTitle),
    plotXLabel: strOrUndef(b.plotXLabel),
    plotYLabel: strOrUndef(b.plotYLabel),
    plotGrid: typeof b.plotGrid === 'boolean' ? b.plotGrid : undefined,
    plotLegend: typeof b.plotLegend === 'boolean' ? b.plotLegend : undefined,
    simModel: strOrUndef(b.simModel),
    simMode,
    simStates: strOrUndef(b.simStates),
    simDerivs: strOrUndef(b.simDerivs),
    simAux: strOrUndef(b.simAux),
    simParams: strOrUndef(b.simParams),
    simInit: strOrUndef(b.simInit),
    simT0: numOrUndef(b.simT0),
    simT1: numOrUndef(b.simT1),
    simDt: numOrUndef(b.simDt),
    simSolver,
    simEvents: strOrUndef(b.simEvents),
    simX: strOrUndef(b.simX),
    simY: strOrUndef(b.simY),
    simFdtdN: numOrUndef(b.simFdtdN),
    simFdtdL: numOrUndef(b.simFdtdL),
    simFdtdSteps: numOrUndef(b.simFdtdSteps),
    simFdtdSrc,
    simFdtdFreq: numOrUndef(b.simFdtdFreq),
    simFdtdAmp: numOrUndef(b.simFdtdAmp),
    simFdtdSrcX: numOrUndef(b.simFdtdSrcX),
    simFdtdDet: numOrUndef(b.simFdtdDet),
    simFdtdLayers: strOrUndef(b.simFdtdLayers),
    simExport: typeof b.simExport === 'string' ? b.simExport : undefined,
    simSpeed: numOrUndef(b.simSpeed),
    simLoop: typeof b.simLoop === 'boolean' ? b.simLoop : undefined,
    sliderVar: strOrUndef(b.sliderVar),
    sliderMin: numOrUndef(b.sliderMin),
    sliderMax: numOrUndef(b.sliderMax),
    sliderStep: numOrUndef(b.sliderStep),
    sliderVal: numOrUndef(b.sliderVal),
    w: numOrNull(b.w),
    h: numOrNull(b.h),
  };
}

function restore(): Record<string, MathBlockData> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem(STORAGE_KEY_LEGACY);
    if (!raw) return {};
    const arr = JSON.parse(raw) as unknown[];
    const rec: Record<string, MathBlockData> = {};
    for (const item of arr) {
      const b = migrate(item);
      if (b) rec[b.id] = b;
    }
    return withRecalc(rec);
  } catch {
    return {};
  }
}

let debounceT: ReturnType<typeof setTimeout> | null = null;

/** Режим и размеры палитры (персист отдельно от документа). */
export type PaletteMode = 'float' | 'left' | 'right';

const PAL_UI_KEY = 'nyamath-palette-ui';
const PAL_UI_KEY_LEGACY = 'wengineering-palette-ui';

interface PaletteUi {
  mode: PaletteMode;
  w: number;
  h: number;
  dockW: number;
  open: boolean;
}

const DEFAULT_PALETTE_UI: PaletteUi = { mode: 'float', w: 400, h: 560, dockW: 400, open: false };

function loadPaletteUi(): PaletteUi {
  try {
    const raw = localStorage.getItem(PAL_UI_KEY) ?? localStorage.getItem(PAL_UI_KEY_LEGACY);
    if (!raw) return DEFAULT_PALETTE_UI;
    const p = JSON.parse(raw) as Partial<PaletteUi>;
    const mode: PaletteMode = p.mode === 'left' || p.mode === 'right' ? p.mode : 'float';
    const num = (v: unknown, lo: number, hi: number, fb: number): number =>
      typeof v === 'number' && isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fb;
    return {
      mode,
      w: num(p.w, 320, 720, DEFAULT_PALETTE_UI.w),
      h: num(p.h, 320, 1200, DEFAULT_PALETTE_UI.h),
      dockW: num(p.dockW, 280, 640, DEFAULT_PALETTE_UI.dockW),
      open: p.open === true,
    };
  } catch {
    return DEFAULT_PALETTE_UI;
  }
}

const initialPaletteUi = loadPaletteUi();

/** История: лимит глубины и троттлинг снапшотов при печати (leading edge). */
const HISTORY_LIMIT = 100;
const SNAPSHOT_WINDOW_MS = 2000;
let lastPushAt = 0;

type SetFn = (p: Partial<CanvasState> | ((s: CanvasState) => Partial<CanvasState>)) => void;
type GetFn = () => CanvasState;

/**
 * Положить текущие blocks в past (ветка future сбрасывается).
 * force — дискретные действия (add/remove/load...); без force — троттлинг для печати.
 */
function pushHistory(get: GetFn, set: SetFn, force = false): void {
  const now = Date.now();
  if (!force) {
    if (now - lastPushAt < SNAPSHOT_WINDOW_MS) return;
  }
  lastPushAt = now;
  const past = [...get().past, get().blocks];
  if (past.length > HISTORY_LIMIT) past.splice(0, past.length - HISTORY_LIMIT);
  set({ past, future: [] });
}

/** Одинаковые ли снапшоты (только редактируемые поля; результаты/превью игнорируем). */
function sameSnapshots(a: Record<string, MathBlockData>, b: Record<string, MathBlockData>): boolean {
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  for (const id of ka) {
    const x = a[id];
    const y = b[id];
    if (!x || !y) return false;
    if (
      x.kind !== y.kind || x.x !== y.x || x.y !== y.y || x.rawInput !== y.rawInput ||
      x.plotFn !== y.plotFn || x.plotXmin !== y.plotXmin || x.plotXmax !== y.plotXmax ||
      x.plotYmin !== y.plotYmin || x.plotYmax !== y.plotYmax || x.plotMode !== y.plotMode ||
      x.plotResolution !== y.plotResolution || x.plotWireframe !== y.plotWireframe ||
      x.plotProj !== y.plotProj || x.plotTrace !== y.plotTrace || x.plotErr !== y.plotErr ||
      x.plotTitle !== y.plotTitle || x.plotXLabel !== y.plotXLabel || x.plotYLabel !== y.plotYLabel ||
      x.plotGrid !== y.plotGrid || x.plotLegend !== y.plotLegend ||
      x.exportName !== y.exportName || x.w !== y.w || x.h !== y.h ||
      x.simModel !== y.simModel || x.simStates !== y.simStates || x.simDerivs !== y.simDerivs ||
      x.simAux !== y.simAux || x.simParams !== y.simParams || x.simInit !== y.simInit ||
      x.simT0 !== y.simT0 || x.simT1 !== y.simT1 || x.simDt !== y.simDt ||
      x.simSolver !== y.simSolver || x.simX !== y.simX || x.simY !== y.simY ||
      x.simMode !== y.simMode || x.simEvents !== y.simEvents ||
      x.simFdtdN !== y.simFdtdN || x.simFdtdL !== y.simFdtdL || x.simFdtdSteps !== y.simFdtdSteps ||
      x.simFdtdSrc !== y.simFdtdSrc || x.simFdtdFreq !== y.simFdtdFreq || x.simFdtdAmp !== y.simFdtdAmp ||
      x.simFdtdSrcX !== y.simFdtdSrcX || x.simFdtdDet !== y.simFdtdDet || x.simFdtdLayers !== y.simFdtdLayers ||
      x.simExport !== y.simExport || x.simSpeed !== y.simSpeed || x.simLoop !== y.simLoop ||
      x.sliderVar !== y.sliderVar || x.sliderMin !== y.sliderMin || x.sliderMax !== y.sliderMax ||
      x.sliderStep !== y.sliderStep || x.sliderVal !== y.sliderVal
    ) return false;
  }
  return true;
}

function scheduleRecalc(get: () => CanvasState, set: SetFn, ms: number) {
  if (debounceT) clearTimeout(debounceT);
  debounceT = setTimeout(() => {
    const next = withRecalc(get().blocks);
    persist(next);
    set((s) => ({ blocks: next, recalcCounter: s.recalcCounter + 1 }));
  }, ms);
}

export const useCanvasStore = create<CanvasState>((set, get) => ({
  blocks: restore(),
  selectedIds: [],
  // чистый лист как в Mathcad — сетка по желанию (выбор хранится в localStorage)
  showGrid: loadGrid(),
  theme: loadTheme(),
  setTheme: (t) =>
    set(() => {
      saveTheme(t);
      return { theme: t };
    }),
  toggleTheme: () =>
    set((s) => {
      const i = THEMES.findIndex((t) => t.id === s.theme);
      const next = THEMES[(i + 1) % THEMES.length].id;
      saveTheme(next);
      return { theme: next };
    }),
  lang: loadLang(),
  paletteOpen: initialPaletteUi.open,
  setPaletteOpen: (v) => {
    set({ paletteOpen: v });
    savePaletteUi();
  },
  togglePalette: () => {
    set((s) => ({ paletteOpen: !s.paletteOpen }));
    savePaletteUi();
  },
  paletteMode: initialPaletteUi.mode,
  setPaletteMode: (m) => {
    set({ paletteMode: m });
    savePaletteUi();
  },
  paletteW: initialPaletteUi.w,
  paletteH: initialPaletteUi.h,
  setPaletteSize: (w, h) =>
    set({
      paletteW: Math.min(720, Math.max(320, Math.round(w))),
      paletteH: Math.min(1200, Math.max(320, Math.round(h))),
    }),
  paletteDockW: initialPaletteUi.dockW,
  setPaletteDockW: (w) =>
    set({ paletteDockW: Math.min(640, Math.max(280, Math.round(w))) }),
  setLang: (l) =>
    set((s) => {
      setLangState(l);
      // ошибки движка хранятся готовыми строками — пересчитать на новом языке
      const next = withRecalc(get().blocks);
      persist(next);
      return { lang: l, blocks: next, recalcCounter: s.recalcCounter + 1 };
    }),
  recalcCounter: 0,
  past: [],
  future: [],

  undo: () => {
    const st = get();
    if (!st.past.length) return;
    const cur = st.blocks;
    // пропускаем снапшоты, идентичные текущему (клик без движения и т.п.)
    const past = [...st.past];
    let target = past.pop();
    while (target && sameSnapshots(target, cur)) target = past.pop();
    if (!target) {
      set({ past: [] });
      return;
    }
    const next = withRecalc(target);
    persist(next);
    set((s) => ({
      blocks: next,
      past,
      future: [cur, ...s.future].slice(0, HISTORY_LIMIT),
      recalcCounter: s.recalcCounter + 1,
      selectedIds: s.selectedIds.filter((id) => next[id]),
    }));
  },

  redo: () => {
    const st = get();
    if (!st.future.length) return;
    const cur = st.blocks;
    const [target, ...future] = st.future;
    const next = withRecalc(target);
    persist(next);
    set((s) => ({
      blocks: next,
      past: [...s.past, cur].slice(-HISTORY_LIMIT),
      future,
      recalcCounter: s.recalcCounter + 1,
      selectedIds: s.selectedIds.filter((id) => next[id]),
    }));
  },

  beginGesture: () => {
    pushHistory(get, set as SetFn, true);
  },

  cross: { x: 80, y: 60 },
  setCross: (x, y) => set({ cross: { x: Math.round(x), y: Math.round(y) } }),
  nudgeCross: (dx, dy) =>
    set((s) => ({ cross: { x: Math.round(s.cross.x + dx), y: Math.round(s.cross.y + dy) } })),
  pendingEditId: null,
  requestEdit: (id) => set({ pendingEditId: id }),
  consumePendingEdit: (id) => {
    if (get().pendingEditId !== id) return false;
    set({ pendingEditId: null });
    return true;
  },

  addBlock: (x, y, raw = '', edit = false) => {
    pushHistory(get, set as SetFn, true);
    const id = uuid();
    const next = withRecalc({ ...get().blocks, [id]: { ...blank(id, x, y), rawInput: raw } });
    persist(next);
    set({ blocks: next, selectedIds: [id], pendingEditId: edit ? id : get().pendingEditId });
  },

  addPlotBlock: (x, y, fn = 'sin(x)', patch) => {
    pushHistory(get, set as SetFn, true);
    const id = uuid();
    const b: MathBlockData = {
      ...blank(id, x, y), rawInput: 'plot', kind: 'plot', plotFn: fn, plotXmin: -10, plotXmax: 10,
      ...patch,
    };
    const next = withRecalc({ ...get().blocks, [id]: b });
    persist(next);
    set({ blocks: next, selectedIds: [id] });
  },

  addContourBlock: (x, y, fn = 'sin(sqrt(x^2+y^2))') => {
    pushHistory(get, set as SetFn, true);
    const id = uuid();
    const b: MathBlockData = {
      ...blank(id, x, y), rawInput: 'contour', kind: 'contour', plotFn: fn,
      plotXmin: -5, plotXmax: 5, plotYmin: -5, plotYmax: 5, plotResolution: 48,
    };
    const next = withRecalc({ ...get().blocks, [id]: b });
    persist(next);
    set({ blocks: next, selectedIds: [id] });
  },

  addPlot3dBlock: (x, y, fn = 'sin(sqrt(x^2+y^2))') => {
    pushHistory(get, set as SetFn, true);
    const id = uuid();
    const b: MathBlockData = {
      ...blank(id, x, y), rawInput: 'plot3d', kind: 'plot3d', plotFn: fn,
      plotXmin: -5, plotXmax: 5, plotYmin: -5, plotYmax: 5,
      plotMode: 'auto', plotResolution: 48, plotWireframe: false,
    };
    const next = withRecalc({ ...get().blocks, [id]: b });
    persist(next);
    set({ blocks: next, selectedIds: [id] });
  },

  addProgramBlock: (x, y, raw = 's := 0\nfor i in 1..n\n  s := s + i\nend\ns', exportName = '') => {
    pushHistory(get, set as SetFn, true);
    const id = uuid();
    const b: MathBlockData = {
      ...blank(id, x, y), rawInput: raw, kind: 'program', exportName,
    };
    const next = withRecalc({ ...get().blocks, [id]: b });
    persist(next);
    set({ blocks: next, selectedIds: [id] });
  },

  addSimBlock: (x, y, modelId = 'pendulum') => {
    pushHistory(get, set as SetFn, true);
    const id = uuid();
    const m = getSimModel(modelId) ?? getSimModel('pendulum') ?? SIM_MODELS[0];
    const b: MathBlockData = {
      ...blank(id, x, y), rawInput: 'sim', kind: 'sim', simExport: '', simSpeed: 1, simLoop: true,
      ...simModelPatch(m),
    };
    const next = withRecalc({ ...get().blocks, [id]: b });
    persist(next);
    set({ blocks: next, selectedIds: [id] });
  },

  updateSim: (id, patch) => {
    const cur = get().blocks[id];
    if (!cur || cur.kind !== 'sim') return;
    pushHistory(get, set as SetFn);
    // если сменили модель на custom вручную — сбросить привязку (чтобы селект показал Custom)
    set({ blocks: { ...get().blocks, [id]: { ...cur, ...patch } } });
    scheduleRecalc(get, set as SetFn, 200);
  },

  addSliderBlock: (x, y) => {
    pushHistory(get, set as SetFn, true);
    const id = uuid();
    const b: MathBlockData = {
      ...blank(id, x, y), rawInput: 'slider', kind: 'slider',
      sliderVar: 'k', sliderMin: 0, sliderMax: 10, sliderStep: 0.5, sliderVal: 5,
    };
    const next = withRecalc({ ...get().blocks, [id]: b });
    persist(next);
    set({ blocks: next, selectedIds: [id] });
  },

  /** Живое движение ползунка: без истории (история — один снапшот на жест, см. beginGesture). */
  setSliderValue: (id, val) => {
    const cur = get().blocks[id];
    if (!cur || cur.kind !== 'slider') return;
    set({ blocks: { ...get().blocks, [id]: { ...cur, sliderVal: val } } });
    scheduleRecalc(get, set as SetFn, 120);
  },

  updateSlider: (id, patch) => {
    const cur = get().blocks[id];
    if (!cur || cur.kind !== 'slider') return;
    pushHistory(get, set as SetFn);
    const next = withRecalc({ ...get().blocks, [id]: { ...cur, ...patch } });
    persist(next);
    set((s) => ({ blocks: next, recalcCounter: s.recalcCounter + 1 }));
  },

  updateInput: (id, raw) => {
    const cur = get().blocks[id];
    if (!cur) return;
    pushHistory(get, set as SetFn);
    set({ blocks: { ...get().blocks, [id]: { ...cur, rawInput: raw } } });
    scheduleRecalc(get, set as SetFn, 150);
  },

  setExportName: (id, name) => {
    const cur = get().blocks[id];
    if (!cur) return;
    pushHistory(get, set as SetFn);
    const next = withRecalc({ ...get().blocks, [id]: { ...cur, exportName: name } });
    persist(next);
    set((s) => ({ blocks: next, recalcCounter: s.recalcCounter + 1 }));
  },

  moveBlock: (id, x, y) => {
    const cur = get().blocks[id];
    if (!cur) return;
    pushHistory(get, set as SetFn, true);
    set({ blocks: { ...get().blocks, [id]: { ...cur, x, y } } });
    // порядок сверху-вниз зависит от Y → пересчёт после перемещения
    scheduleRecalc(get, set as SetFn, 250);
  },

  /** Финал перетаскивания тени: разом ставим координаты, один пересчёт + persist.
   * История уже снята в beginGesture на pointerdown — сюда без push. */
  dropBlocks: (positions: Record<string, { x: number; y: number }>) => {
    const cur = get().blocks;
    let changed = false;
    const next = { ...cur };
    for (const [gid, p] of Object.entries(positions)) {
      const b = next[gid];
      if (b && (b.x !== p.x || b.y !== p.y)) {
        next[gid] = { ...b, x: p.x, y: p.y };
        changed = true;
      }
    }
    if (!changed) return;
    // порядок сверху-вниз зависит от Y → пересчёт сразу (телепорт без задержки)
    const rec = withRecalc(next);
    persist(rec);
    set((s) => ({ blocks: rec, recalcCounter: s.recalcCounter + 1 }));
  },

  commitDrag: () => {
    // координаты/размеры могли измениться → финальный пересчёт + сохранение
    scheduleRecalc(get, set as SetFn, 60);
  },

  sizeTo: (id, w, h) => {
    const cur = get().blocks[id];
    if (!cur) return;
    set({ blocks: { ...get().blocks, [id]: { ...cur, w, h: h ?? cur.h ?? null } } });
  },

  removeBlock: (id) => {
    pushHistory(get, set as SetFn, true);
    const next = { ...get().blocks };
    delete next[id];
    const rec = withRecalc(next);
    persist(rec);
    set((s) => ({ blocks: rec, selectedIds: s.selectedIds.filter((s2) => s2 !== id) }));
  },

  removeSelected: () => {
    const sel = get().selectedIds;
    if (!sel.length) return;
    pushHistory(get, set as SetFn, true);
    const next = { ...get().blocks };
    for (const id of sel) delete next[id];
    const rec = withRecalc(next);
    persist(rec);
    set({ blocks: rec, selectedIds: [] });
  },

  select: (id) => set({ selectedIds: id ? [id] : [] }),
  selectMany: (ids) => set({ selectedIds: [...new Set(ids)].filter((id) => get().blocks[id]) }),
  toggleSelect: (id) =>
    set((s) => ({
      selectedIds: s.selectedIds.includes(id) ? s.selectedIds.filter((s2) => s2 !== id) : [...s.selectedIds, id],
    })),

  toggleGrid: () =>
    set((s) => {
      const showGrid = !s.showGrid;
      saveGrid(showGrid);
      return { showGrid };
    }),

  recalc: () => {
    const next = withRecalc(get().blocks);
    persist(next);
    set((s) => ({ blocks: next, recalcCounter: s.recalcCounter + 1 }));
  },

  clear: () => {
    pushHistory(get, set as SetFn, true);
    persist({});
    set({ blocks: {}, selectedIds: [] });
  },

  loadTestScenario: () => {
    pushHistory(get, set as SetFn, true);
    const rec: Record<string, MathBlockData> = {};
    let y = 60;
    for (const line of TEST_SCENARIO_LINES) {
      const id = uuid();
      rec[id] = {
        ...blank(id, 80, y),
        rawInput: line,
        kind: line.startsWith('//') ? 'text' : 'math',
      };
      y += 64;
    }
    const pid = uuid();
    rec[pid] = {
      ...blank(pid, 560, 120), rawInput: 'plot', kind: 'plot', plotFn: 'sin(x)', plotXmin: -10, plotXmax: 10,
    };
    const next = withRecalc(rec);
    persist(next);
    set((s) => ({ blocks: next, selectedIds: [], recalcCounter: s.recalcCounter + 1 }));
  },

  loadAdvancedDemo: () => {
    pushHistory(get, set as SetFn, true);
    const rec: Record<string, MathBlockData> = {};
    let y = 60;
    for (const item of ADVANCED_DEMO) {
      const id = uuid();
      rec[id] = {
        ...blank(id, 80, y),
        rawInput: item.raw,
        kind: item.kind,
        exportName: item.exportName ?? '',
      };
      y += item.kind === 'program' ? 210 : 64;
    }
    const pid = uuid();
    rec[pid] = {
      ...blank(pid, 560, 140), rawInput: 'plot', kind: 'plot',
      plotFn: 'sin(w*x); cos(x)', plotXmin: -10, plotXmax: 10,
    };
    const next = withRecalc(rec);
    persist(next);
    set((s) => ({ blocks: next, selectedIds: [], recalcCounter: s.recalcCounter + 1 }));
  },

  loadDocument: (data) => {
    if (!Array.isArray(data)) return { ok: false, message: t('doc.notArray') };
    if (data.length > 5000) return { ok: false, message: t('doc.tooMany') };
    const rec: Record<string, MathBlockData> = {};
    let bad = 0;
    for (const item of data) {
      const b = migrate(item);
      if (b) rec[b.id] = b;
      else bad++;
    }
    if (!Object.keys(rec).length) return { ok: false, message: t('doc.noBlocks') };
    pushHistory(get, set as SetFn, true);
    const next = withRecalc(rec);
    persist(next);
    set((s) => ({ blocks: next, selectedIds: [], recalcCounter: s.recalcCounter + 1 }));
    return { ok: true, message: t('doc.loaded', { n: Object.keys(rec).length, bad: bad ? t('doc.loadedBad', { bad }) : '' }) };
  },

  updatePlot: (id, patch) => {
    const cur = get().blocks[id];
    if (!cur) return;
    pushHistory(get, set as SetFn);
    const next = { ...get().blocks, [id]: { ...cur, ...patch } };
    persist(next);
    set({ blocks: next });
  },
}));

/** Сохранить режим/размеры/показ палитры (вызывать по окончании жеста ресайза/дока). */
export function savePaletteUi() {
  try {
    const s = useCanvasStore.getState();
    const ui: PaletteUi = { mode: s.paletteMode, w: s.paletteW, h: s.paletteH, dockW: s.paletteDockW, open: s.paletteOpen };
    localStorage.setItem(PAL_UI_KEY, JSON.stringify(ui));
  } catch { /* ignore */ }
}
