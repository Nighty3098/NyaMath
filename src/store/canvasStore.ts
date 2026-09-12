import { create } from 'zustand';
import { v4 as uuid } from 'uuid';
import { recalculateAll, type MathBlockData } from '../engine/dependencies';
import { TEST_SCENARIO_LINES } from '../data/testScenario';
import { ADVANCED_DEMO } from '../data/demoAdvanced';
import { loadTheme, saveTheme, type ThemeName } from '../theme';

const STORAGE_KEY = 'wengineering-doc-v1';

export interface CanvasState {
  blocks: Record<string, MathBlockData>;
  /** Мультивыделение (рамкой, Shift+клик) */
  selectedIds: string[];
  showGrid: boolean;
  theme: ThemeName;
  toggleTheme: () => void;
  recalcCounter: number;
  addBlock: (x: number, y: number, raw?: string) => void;
  addPlotBlock: (x: number, y: number, fn?: string) => void;
  addProgramBlock: (x: number, y: number, raw?: string, exportName?: string) => void;
  updateInput: (id: string, raw: string) => void;
  setExportName: (id: string, name: string) => void;
  moveBlock: (id: string, x: number, y: number) => void;
  /** Живое перетаскивание (без пересчёта); финал — через commitDrag */
  dragTo: (id: string, x: number, y: number) => void;
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
    // plotPreview — пересчитываемые сэмплы, в файл/хранилище не пишем
    const slim = Object.values(blocks).map(({ plotPreview: _pp, ...b }) => b);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(slim));
  } catch { /* ignore */ }
}

/** Привести сырой объект к MathBlockData (миграция старых сохранений и файлов) */
function migrate(raw: unknown): MathBlockData | null {
  if (!raw || typeof raw !== 'object') return null;
  const b = raw as Partial<MathBlockData>;
  if (typeof b.x !== 'number' || typeof b.y !== 'number' || typeof b.rawInput !== 'string') return null;
  const id = typeof b.id === 'string' && b.id ? b.id : uuid();
  const kind = b.kind === 'plot' || b.kind === 'program' || b.kind === 'text' ? b.kind : 'math';
  return {
    ...blank(id, b.x, b.y),
    ...b,
    id,
    kind,
    resultLatex: b.resultLatex ?? '',
    isOutput: b.isOutput ?? false,
    plotPreview: null,
    exportName: typeof b.exportName === 'string' ? b.exportName : undefined,
    w: typeof b.w === 'number' && b.w > 0 ? b.w : null,
    h: typeof b.h === 'number' && b.h > 0 ? b.h : null,
  };
}

function restore(): Record<string, MathBlockData> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
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

type SetFn = (p: Partial<CanvasState> | ((s: CanvasState) => Partial<CanvasState>)) => void;

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
  // чистый лист как в Mathcad — сетка по желанию
  showGrid: false,
  theme: loadTheme(),
  toggleTheme: () =>
    set((s) => {
      const next: ThemeName = s.theme === 'gruvbox' ? 'light' : 'gruvbox';
      saveTheme(next);
      return { theme: next };
    }),
  recalcCounter: 0,

  addBlock: (x, y, raw = '') => {
    const id = uuid();
    const next = withRecalc({ ...get().blocks, [id]: { ...blank(id, x, y), rawInput: raw } });
    persist(next);
    set({ blocks: next, selectedIds: [id] });
  },

  addPlotBlock: (x, y, fn = 'sin(x)') => {
    const id = uuid();
    const b: MathBlockData = {
      ...blank(id, x, y), rawInput: 'plot', kind: 'plot', plotFn: fn, plotXmin: -10, plotXmax: 10,
    };
    const next = withRecalc({ ...get().blocks, [id]: b });
    persist(next);
    set({ blocks: next, selectedIds: [id] });
  },

  addProgramBlock: (x, y, raw = 's := 0\nfor i in 1..n\n  s := s + i\nend\ns', exportName = '') => {
    const id = uuid();
    const b: MathBlockData = {
      ...blank(id, x, y), rawInput: raw, kind: 'program', exportName,
    };
    const next = withRecalc({ ...get().blocks, [id]: b });
    persist(next);
    set({ blocks: next, selectedIds: [id] });
  },

  updateInput: (id, raw) => {
    const cur = get().blocks[id];
    if (!cur) return;
    set({ blocks: { ...get().blocks, [id]: { ...cur, rawInput: raw } } });
    scheduleRecalc(get, set as SetFn, 150);
  },

  setExportName: (id, name) => {
    const cur = get().blocks[id];
    if (!cur) return;
    const next = withRecalc({ ...get().blocks, [id]: { ...cur, exportName: name } });
    persist(next);
    set((s) => ({ blocks: next, recalcCounter: s.recalcCounter + 1 }));
  },

  moveBlock: (id, x, y) => {
    const cur = get().blocks[id];
    if (!cur) return;
    set({ blocks: { ...get().blocks, [id]: { ...cur, x, y } } });
    // порядок сверху-вниз зависит от Y → пересчёт после перемещения
    scheduleRecalc(get, set as SetFn, 250);
  },

  dragTo: (id, x, y) => {
    const cur = get().blocks[id];
    if (!cur) return;
    // только позиция, без пересчёта и persist — для плавного drag регионов
    set({ blocks: { ...get().blocks, [id]: { ...cur, x, y } } });
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
    const next = { ...get().blocks };
    delete next[id];
    const rec = withRecalc(next);
    persist(rec);
    set((s) => ({ blocks: rec, selectedIds: s.selectedIds.filter((s2) => s2 !== id) }));
  },

  removeSelected: () => {
    const sel = get().selectedIds;
    if (!sel.length) return;
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

  toggleGrid: () => set((s) => ({ showGrid: !s.showGrid })),

  recalc: () => {
    const next = withRecalc(get().blocks);
    persist(next);
    set((s) => ({ blocks: next, recalcCounter: s.recalcCounter + 1 }));
  },

  clear: () => {
    persist({});
    set({ blocks: {}, selectedIds: [] });
  },

  loadTestScenario: () => {
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
    if (!Array.isArray(data)) return { ok: false, message: 'Файл не похож на проект Wengineering (ожидается массив блоков)' };
    if (data.length > 5000) return { ok: false, message: 'Слишком много блоков (>5000)' };
    const rec: Record<string, MathBlockData> = {};
    let bad = 0;
    for (const item of data) {
      const b = migrate(item);
      if (b) rec[b.id] = b;
      else bad++;
    }
    if (!Object.keys(rec).length) return { ok: false, message: 'В файле нет корректных блоков' };
    const next = withRecalc(rec);
    persist(next);
    set((s) => ({ blocks: next, selectedIds: [], recalcCounter: s.recalcCounter + 1 }));
    return { ok: true, message: `Загружено блоков: ${Object.keys(rec).length}${bad ? ` (пропущено битых: ${bad})` : ''}` };
  },

  updatePlot: (id, patch) => {
    const cur = get().blocks[id];
    if (!cur) return;
    const next = { ...get().blocks, [id]: { ...cur, ...patch } };
    persist(next);
    set({ blocks: next });
  },
}));
