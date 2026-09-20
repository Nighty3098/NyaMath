import { create } from 'zustand';
import { v4 as uuid } from 'uuid';
import type { MathBlockData } from '../engine/dependencies';
import { TEST_SCENARIO_LINES } from '../data/testScenario';
import { ADVANCED_DEMO } from '../data/demoAdvanced';
import { loadTheme, saveTheme, THEMES, type ThemeName } from '../theme';
import { getSimModel, SIM_MODELS, simModelPatch } from '../engine/simEngine';
import { separateBlocksVertically } from '../lib/canvasLayout';
import { getLang, loadLang, setLangState, t, type Lang } from '../i18n';
import { RECALC_TIMEOUT_MS, recalcInWorker } from '../lib/recalcWorker';
import { engineMismatch, parseDocFile } from '../lib/docFile';
import { ENGINE_VERSION } from '../engine/version';

const STORAGE_KEY = 'nyamath-doc-v1';
const STORAGE_KEY_LEGACY = 'wengineering-doc-v1';
const GRID_KEY = 'nyamath-show-grid';
const GRID_KEY_LEGACY = 'wengineering-show-grid';
const GRID_SIZE_KEY = 'nyamath-grid-size';

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

function loadGridSize(): 'standard' | 'fine' {
  try {
    return localStorage.getItem(GRID_SIZE_KEY) === 'fine' ? 'fine' : 'standard';
  } catch {
    return 'standard';
  }
}

function saveGridSize(v: 'standard' | 'fine') {
  try {
    localStorage.setItem(GRID_SIZE_KEY, v);
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
  formulaPaletteOpen: boolean;
  setFormulaPaletteOpen: (v: boolean) => void;
  toggleFormulaPalette: () => void;
  formulaPaletteMode: PaletteMode;
  setFormulaPaletteMode: (m: PaletteMode) => void;
  formulaPaletteW: number;
  formulaPaletteH: number;
  setFormulaPaletteSize: (w: number, h: number) => void;
  formulaPaletteDockW: number;
  setFormulaPaletteDockW: (w: number) => void;
  /** Палитра физических констант (третий источник: константы + их справка) */
  constPaletteOpen: boolean;
  setConstPaletteOpen: (v: boolean) => void;
  toggleConstPalette: () => void;
  constPaletteMode: PaletteMode;
  setConstPaletteMode: (m: PaletteMode) => void;
  constPaletteW: number;
  constPaletteH: number;
  setConstPaletteSize: (w: number, h: number) => void;
  constPaletteDockW: number;
  setConstPaletteDockW: (w: number) => void;
  /** Единое окно палитр: активная вкладка + геометрия окна.
   *  Флаги paletteOpen/formulaPaletteOpen/constPaletteOpen/scopeMonOpen —
   *  какие вкладки включены; окно видно, пока включён хоть один источник. */
  paletteTab: PaletteTab;
  setPaletteTab: (t: PaletteTab) => void;
  unifiedMode: PaletteMode;
  setUnifiedMode: (m: PaletteMode) => void;
  unifiedW: number;
  unifiedH: number;
  setUnifiedSize: (w: number, h: number) => void;
  unifiedDockW: number;
  setUnifiedDockW: (w: number) => void;
  /** Вкладки, вытянутые в отдельные окна (tear-off).
   *  Единое окно показывает только невынесенные; пусто — всё в одном окне. */
  detachedTabs: PaletteTab[];
  detachTab: (t: PaletteTab) => void;
  attachTab: (t: PaletteTab) => void;
  /** Сторона док-панели вынесенной вкладки (нет записи — плавающее окно). */
  detachedSide: Partial<Record<PaletteTab, 'left' | 'right'>>;
  setDetachedSide: (t: PaletteTab, side: 'left' | 'right' | 'float') => void;
  recalcCounter: number;
  /** Длительность последнего пересчёта, мс (телеметрия пульта) */
  calcMs: number;
  /** Асинхронный пересчёт (#6): идёт ли джоба, прогресс симуляции, её блок */
  computeActive: boolean;
  /** 0..1 — детерминированный прогресс, null — идёт, но total неизвестен (rk45) */
  computeProgress: number | null;
  computeSimId: string | null;
  /** Ошибка фоновой джобы (timeout/failed): прошлые результаты сохранены */
  computeError: string | null;
  /** Прервать текущий пересчёт (убивает воркер) */
  cancelRecalc: () => void;
  clearComputeError: () => void;
  /** Режим пересчёта: auto — как раньше, manual — только по Calculate Now */
  calcMode: 'auto' | 'manual';
  setCalcMode: (m: 'auto' | 'manual') => void;
  /** Блоки в вьюпорте (пишет Canvas, троттлинг): область Calculate Now */
  visibleIds: string[];
  setVisibleIds: (ids: string[]) => void;
  /** Вне области последнего пересчёта со старыми результатами */
  staleIds: string[];
  /** В ручном режиме были правки после последнего пересчёта */
  calcStale: boolean;
  /** Calculate Now: пересчитать видимые + их upstream */
  recalcNow: () => void;
  /** Печать: виртуализация выключена, рендерим всё */
  printing: boolean;
  setPrinting: (v: boolean) => void;
  addBlock: (x: number, y: number, raw?: string, edit?: boolean) => void;
  /** Пакетная вставка построчно: каждая строка — отдельный мат-блок лесенкой вниз (один undo-шаг). */
  addBlocks: (lines: string[], x: number, y: number, dy?: number) => void;
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
  /** Шаг сетки (Standard/Fine); showGrid=false — сетка скрыта */
  gridSize: 'standard' | 'fine';
  setGridSize: (s: 'standard' | 'fine') => void;
  setGridVisible: (v: boolean) => void;
  /** Disable Evaluation: исключить/вернуть блок из расчёта */
  toggleBlockDisabled: (id: string) => void;
  /** Инверсия флага для всего выделения одним шагом истории */
  toggleSelectedDisabled: () => void;
  /** Separate Regions → Vertically : разнести наложенные блоки вниз */
  separateRegions: () => void;
  /** Текстовый блок в точке прицела */
  addTextBlock: (x: number, y: number) => void;
  /** Панель телеметрии переменных */
  scopeMonOpen: boolean;
  toggleScopeMon: () => void;
  recalc: () => void;
  clear: () => void;
  loadTestScenario: () => void;
  loadAdvancedDemo: () => void;
  /** Загрузить документ из файла (валидация + миграция) */
  loadDocument: (data: unknown) => { ok: boolean; message: string };
  /** Live-синхронизация с MCP-сервисом */
  liveConnected: boolean;
  liveUrl: string;
  liveError: string | null;
  setLiveConnected: (v: boolean) => void;
  setLiveUrl: (url: string) => void;
  setLiveError: (msg: string | null) => void;
  /** Применить входящий снапшот сервиса (без засорения истории undo) */
  applyRemoteBlocks: (data: unknown) => { ok: boolean; count: number };
  updatePlot: (id: string, patch: Partial<MathBlockData>) => void;
  /** История undo/redo (снапшоты blocks, без persist) */
  past: Record<string, MathBlockData>[];
  future: Record<string, MathBlockData>[];
  undo: () => void;
  redo: () => void;
  /** Снапшот перед жестом (драг/ресайз): вызывается на pointerdown */
  beginGesture: () => void;
  /** Курсор-прицел (мировые координаты листа) */
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

/**
 * Стартовая ширина блока: на узком экране ужимаем под вьюпорт,
 * на десктопе — дефолт как раньше. В тестах (node) window нет → дефолт.
 */
function fitViewportWidth(def: number): number {
  if (typeof window === 'undefined') return def;
  return Math.max(280, Math.min(def, window.innerWidth - 24));
}

/** Замер последнего пересчёта для телеметрии пульта (мс, пишет runRecalcJob). */
export let lastCalcMs = 0;

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
    disabled: b.disabled === true,
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
    plotLogx: typeof b.plotLogx === 'boolean' ? b.plotLogx : undefined,
    plotXUnit: strOrUndef(b.plotXUnit),
    plotYUnit: strOrUndef(b.plotYUnit),
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
    // стартовый пересчёт — тоже в воркере: restore обязан вернуться синхронно
    scheduleRecalcAsync(30);
    return rec;
  } catch {
    return {};
  }
}

/** Режим и размеры палитры (персист отдельно от документа).
 *  Док — универсально: left/right — на всю сторону (верх-низ).
 *  Единое окно с вкладками: функции / формулы / константы / переменные. */
export type PaletteMode = 'float' | 'left' | 'right';
/** Активная вкладка единого окна палитр. */
export type PaletteTab = 'functions' | 'formulas' | 'constants' | 'variables';

const PAL_UI_KEY = 'nyamath-palette-ui';
const PAL_UI_KEY_LEGACY = 'wengineering-palette-ui';
const FORMULA_PAL_UI_KEY = 'nyamath-formula-palette-ui';
const CONST_PAL_UI_KEY = 'nyamath-const-palette-ui';

interface PaletteUi {
  mode: PaletteMode;
  w: number;
  h: number;
  dockW: number;
  open: boolean;
}

const DEFAULT_PALETTE_UI: PaletteUi = { mode: 'float', w: 400, h: 560, dockW: 400, open: false };

function loadPaletteUi(variant: 'functions' | 'formulas' | 'constants' = 'functions'): PaletteUi {
  try {
    const raw = variant === 'formulas'
      ? localStorage.getItem(FORMULA_PAL_UI_KEY)
      : variant === 'constants'
      ? localStorage.getItem(CONST_PAL_UI_KEY)
      : localStorage.getItem(PAL_UI_KEY) ?? localStorage.getItem(PAL_UI_KEY_LEGACY);
    if (!raw) return DEFAULT_PALETTE_UI;
    const p = JSON.parse(raw) as Partial<PaletteUi>;
    // миграция старых угловых режимов: lt/lb → left, rt/rb → right
    const m = p.mode as unknown;
    const mode: PaletteMode =
      m === 'lt' || m === 'lb' || m === 'left' ? 'left'
      : m === 'rt' || m === 'rb' || m === 'right' ? 'right'
      : 'float';
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
const initialFormulaPaletteUi = loadPaletteUi('formulas');
const initialConstPaletteUi = loadPaletteUi('constants');

/** Единое окно палитр: режим/размеры/вкладка (персист отдельно от документа).
 *  Миграция со старых раздельных палитр: если unified-ключа ещё нет —
 *  забираем геометрию палитры функций, режим — первый пристыкованный
 *  среди старых, открытость — если хоть одна старая палитра открыта,
 *  вкладка — первая открытая. */
const UNIFIED_UI_KEY = 'nyamath-unified-palette-ui';

interface UnifiedUi {
  mode: PaletteMode;
  w: number;
  h: number;
  dockW: number;
  open: boolean;
  tab: PaletteTab;
}

const DEFAULT_UNIFIED_UI: UnifiedUi = { mode: 'float', w: 400, h: 560, dockW: 400, open: false, tab: 'functions' };

function loadUnifiedUi(): UnifiedUi {
  const num = (v: unknown, lo: number, hi: number, fb: number): number =>
    typeof v === 'number' && isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fb;
  try {
    const raw = localStorage.getItem(UNIFIED_UI_KEY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<UnifiedUi>;
      const m = p.mode as unknown;
      const mode: PaletteMode = m === 'left' ? 'left' : m === 'right' ? 'right' : 'float';
      const tab: PaletteTab =
        p.tab === 'formulas' || p.tab === 'constants' || p.tab === 'variables' ? p.tab : 'functions';
      return {
        mode,
        w: num(p.w, 320, 720, DEFAULT_UNIFIED_UI.w),
        h: num(p.h, 320, 1200, DEFAULT_UNIFIED_UI.h),
        dockW: num(p.dockW, 280, 640, DEFAULT_UNIFIED_UI.dockW),
        open: p.open === true,
        tab,
      };
    }
  } catch { /* ignore — упадём в миграцию ниже */ }
  // миграция: ни разу не сохраняли unified — смотрим старые ключи
  const anyOpen = initialPaletteUi.open || initialFormulaPaletteUi.open || initialConstPaletteUi.open;
  if (!anyOpen) return DEFAULT_UNIFIED_UI;
  const mode: PaletteMode =
    initialPaletteUi.mode !== 'float' ? initialPaletteUi.mode
    : initialFormulaPaletteUi.mode !== 'float' ? initialFormulaPaletteUi.mode
    : initialConstPaletteUi.mode;
  const tab: PaletteTab =
    initialPaletteUi.open ? 'functions'
    : initialFormulaPaletteUi.open ? 'formulas'
    : initialConstPaletteUi.open ? 'constants'
    : 'functions';
  return {
    mode,
    w: num(initialPaletteUi.w, 320, 720, DEFAULT_UNIFIED_UI.w),
    h: num(initialPaletteUi.h, 320, 1200, DEFAULT_UNIFIED_UI.h),
    dockW: Math.max(
      initialPaletteUi.open ? initialPaletteUi.dockW : 0,
      initialFormulaPaletteUi.open ? initialFormulaPaletteUi.dockW : 0,
      initialConstPaletteUi.open ? initialConstPaletteUi.dockW : 0,
      DEFAULT_UNIFIED_UI.dockW,
    ),
    open: true,
    tab,
  };
}

const initialUnifiedUi = loadUnifiedUi();

/** Вынесенные в отдельные окна вкладки (персист отдельно от документа). */
const DETACHED_KEY = 'nyamath-palette-detached';
const ALL_TABS: PaletteTab[] = ['functions', 'formulas', 'constants', 'variables'];

function loadDetachedTabs(): PaletteTab[] {
  try {
    const raw = localStorage.getItem(DETACHED_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return [];
    return arr.filter((x): x is PaletteTab => ALL_TABS.includes(x as PaletteTab));
  } catch {
    return [];
  }
}

const initialDetachedTabs = loadDetachedTabs();

/** Стороны док-панелей вынесенных вкладок (персист отдельно от документа). */
const DETACHED_SIDE_KEY = 'nyamath-detached-side';

function loadDetachedSide(): Partial<Record<PaletteTab, 'left' | 'right'>> {
  try {
    const raw = localStorage.getItem(DETACHED_SIDE_KEY);
    if (!raw) return {};
    const p = JSON.parse(raw) as Partial<Record<PaletteTab, unknown>>;
    const out: Partial<Record<PaletteTab, 'left' | 'right'>> = {};
    for (const k of ALL_TABS) {
      if (p[k] === 'left' || p[k] === 'right') out[k] = p[k];
    }
    return out;
  } catch {
    return {};
  }
}

const initialDetachedSide = loadDetachedSide();

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
      x.plotLogx !== y.plotLogx || x.plotXUnit !== y.plotXUnit || x.plotYUnit !== y.plotYUnit ||
      x.plotTitle !== y.plotTitle || x.plotXLabel !== y.plotXLabel || x.plotYLabel !== y.plotYLabel ||
      x.plotGrid !== y.plotGrid || x.plotLegend !== y.plotLegend ||
      (x.disabled ?? false) !== (y.disabled ?? false) ||
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

/* ---------- асинхронный конвейер пересчёта (worker) ----------
 * Все мутации идут оптимистично (set + persist входов), тяжёлый пересчёт —
 * в Web Worker через recalcInWorker: UI-поток не фризит даже на одном
 * зависшем блоке (чему чанки #6 не помогали). Джоба убивается terminate()
 * по AbortController (отмена следующим изменением/rev или кнопкой) и по
 * таймауту RECALC_TIMEOUT_MS — прошлые результаты сохраняются, ошибка —
 * в computeError. Джобы сериализованы (jobRunning/rerunRequested):
 * перекрытия нет, stale-результаты не применяются. Нет Worker (node-тесты,
 * старые браузеры) — честный фолбэк на main-thread recalculateAllAsync.
 */
let recalcTimer: ReturnType<typeof setTimeout> | null = null;
let jobRunning = false;
let rerunRequested = false;
let recalcRev = 0;
/** Контроллер текущей джобы: cancelRecalc убивает даже зависший воркер. */
let currentAbort: AbortController | null = null;

function scheduleRecalcAsync(ms: number) {
  if (recalcTimer) clearTimeout(recalcTimer);
  recalcTimer = setTimeout(() => {
    recalcTimer = null;
    // ручной режим (Calculate Now): джобы не едут, входы сохраняем, ставим флаг
    if (useCanvasStore.getState().calcMode === 'manual') {
      persist(useCanvasStore.getState().blocks);
      useCanvasStore.setState({ calcStale: true });
      return;
    }
    void runRecalcJob();
  }, ms);
}

/** Замер джобы в state + модуль для обратной совместимости телеметрии. */
function stampMs(t0: number): number {
  lastCalcMs = performance.now() - t0;
  return lastCalcMs;
}

async function runRecalcJob(only?: Set<string>): Promise<void> {
  if (jobRunning) {
    rerunRequested = true;
    return;
  }
  jobRunning = true;
  try {
    for (;;) {
      rerunRequested = false;
      const rev = ++recalcRev;
      const st0 = useCanvasStore.getState();
      const list = Object.values(st0.blocks);
      // only фиксируем на входе попытки (видимость могла уже сдвинуться)
      const attemptOnly = only && only.size > 0 ? new Set(only) : undefined;
      useCanvasStore.setState({ computeActive: true, computeError: null });
      const t0 = performance.now();
      const ctrl = new AbortController();
      currentAbort = ctrl;
      const outcome = await recalcInWorker(list, {
        lang: getLang(),
        timeoutMs: RECALC_TIMEOUT_MS,
        signal: ctrl.signal,
        only: attemptOnly ? [...attemptOnly] : undefined,
        onSimProgress: (id, done, total) => {
          if (rev !== recalcRev) return;
          useCanvasStore.setState({
            computeSimId: id,
            computeProgress: total === null || total <= 0 ? null : Math.min(1, done / total),
          });
        },
      });
      if (currentAbort === ctrl) currentAbort = null;
      if (outcome.status === 'cancelled') {
        if (!rerunRequested && rev === recalcRev) break;
        continue;
      }
      if (rev !== recalcRev) continue;
      if (outcome.status === 'timeout') {
        useCanvasStore.setState({
          computeError: t('job.timeout', { s: Math.round(RECALC_TIMEOUT_MS / 1000) }),
          calcMs: stampMs(t0),
        });
        if (!rerunRequested) break;
        continue;
      }
      if (outcome.status === 'failed') {
        useCanvasStore.setState({ computeError: outcome.error, calcMs: stampMs(t0) });
        if (!rerunRequested) break;
        continue;
      }
      if (outcome.changed) {
        persist(outcome.blocks);
        const s = useCanvasStore.getState();
        useCanvasStore.setState({ blocks: outcome.blocks, recalcCounter: s.recalcCounter + 1, calcMs: stampMs(t0) });
      }
      // staleIds — всегда (даже при changed=false: видимое свежо, вне экрана старо),
      // но без лишнего ре-рендера при том же наборе
      {
        const sNow = useCanvasStore.getState();
        const same = sNow.staleIds.length === outcome.staleIds.length &&
          sNow.staleIds.every((id, i) => id === outcome.staleIds[i]);
        if (!same || sNow.calcStale) {
          useCanvasStore.setState({ staleIds: outcome.staleIds, calcStale: false });
        }
      }
      if (!rerunRequested) break;
    }
  } finally {
    jobRunning = false;
    const st = useCanvasStore.getState();
    if (st.computeActive) {
      useCanvasStore.setState({ computeActive: false, computeProgress: null, computeSimId: null });
    }
  }
}

/**
 * Дождаться тишины конвейера (тесты; стор при этом дёргают напрямую).
 * Сбрасывает pending-дебаунс и прогоняет джобу до конца.
 */
export async function flushRecalc(): Promise<void> {
  if (recalcTimer) {
    clearTimeout(recalcTimer);
    recalcTimer = null;
  }
  for (let k = 0; k < 500; k++) {
    if (!jobRunning) {
      await runRecalcJob();
      return;
    }
    await new Promise((r) => setTimeout(r, 10));
  }
}

export const useCanvasStore = create<CanvasState>((set, get) => ({
  blocks: restore(),
  selectedIds: [],
  // чистый лист — сетка по желанию (выбор хранится в localStorage)
  showGrid: loadGrid(),
  gridSize: loadGridSize(),
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
    set((s) => ({
      paletteOpen: v,
      paletteTab: v ? 'functions' : s.paletteTab,
      detachedTabs: v ? s.detachedTabs : s.detachedTabs.filter((x) => x !== 'functions'),
    }));
    savePaletteUi();
    saveUnifiedUi();
    if (!v) saveDetachedTabs();
  },
  togglePalette: () => {
    const open = !get().paletteOpen;
    set((s) => ({
      paletteOpen: open,
      paletteTab: open ? 'functions' : s.paletteTab,
      detachedTabs: open ? s.detachedTabs : s.detachedTabs.filter((x) => x !== 'functions'),
    }));
    savePaletteUi();
    saveUnifiedUi();
    if (!open) saveDetachedTabs();
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
  formulaPaletteOpen: initialFormulaPaletteUi.open,
  setFormulaPaletteOpen: (v) => {
    set((s) => ({
      formulaPaletteOpen: v,
      paletteTab: v ? 'formulas' : s.paletteTab,
      detachedTabs: v ? s.detachedTabs : s.detachedTabs.filter((x) => x !== 'formulas'),
    }));
    savePaletteUi('formulas');
    saveUnifiedUi();
    if (!v) saveDetachedTabs();
  },
  toggleFormulaPalette: () => {
    const open = !get().formulaPaletteOpen;
    set((s) => ({
      formulaPaletteOpen: open,
      paletteTab: open ? 'formulas' : s.paletteTab,
      detachedTabs: open ? s.detachedTabs : s.detachedTabs.filter((x) => x !== 'formulas'),
    }));
    savePaletteUi('formulas');
    saveUnifiedUi();
    if (!open) saveDetachedTabs();
  },
  formulaPaletteMode: initialFormulaPaletteUi.mode,
  setFormulaPaletteMode: (m) => {
    set({ formulaPaletteMode: m });
    savePaletteUi('formulas');
  },
  formulaPaletteW: initialFormulaPaletteUi.w,
  formulaPaletteH: initialFormulaPaletteUi.h,
  setFormulaPaletteSize: (w, h) =>
    set({
      formulaPaletteW: Math.min(720, Math.max(320, Math.round(w))),
      formulaPaletteH: Math.min(1200, Math.max(320, Math.round(h))),
    }),
  formulaPaletteDockW: initialFormulaPaletteUi.dockW,
  setFormulaPaletteDockW: (w) =>
    set({ formulaPaletteDockW: Math.min(640, Math.max(280, Math.round(w))) }),
  constPaletteOpen: initialConstPaletteUi.open,
  setConstPaletteOpen: (v) => {
    set((s) => ({
      constPaletteOpen: v,
      paletteTab: v ? 'constants' : s.paletteTab,
      detachedTabs: v ? s.detachedTabs : s.detachedTabs.filter((x) => x !== 'constants'),
    }));
    savePaletteUi('constants');
    saveUnifiedUi();
    if (!v) saveDetachedTabs();
  },
  toggleConstPalette: () => {
    const open = !get().constPaletteOpen;
    set((s) => ({
      constPaletteOpen: open,
      paletteTab: open ? 'constants' : s.paletteTab,
      detachedTabs: open ? s.detachedTabs : s.detachedTabs.filter((x) => x !== 'constants'),
    }));
    savePaletteUi('constants');
    saveUnifiedUi();
    if (!open) saveDetachedTabs();
  },
  constPaletteMode: initialConstPaletteUi.mode,
  setConstPaletteMode: (m) => {
    set({ constPaletteMode: m });
    savePaletteUi('constants');
  },
  constPaletteW: initialConstPaletteUi.w,
  constPaletteH: initialConstPaletteUi.h,
  setConstPaletteSize: (w, h) =>
    set({
      constPaletteW: Math.min(720, Math.max(320, Math.round(w))),
      constPaletteH: Math.min(1200, Math.max(320, Math.round(h))),
    }),
  constPaletteDockW: initialConstPaletteUi.dockW,
  setConstPaletteDockW: (w) =>
    set({ constPaletteDockW: Math.min(640, Math.max(280, Math.round(w))) }),
  paletteTab: initialUnifiedUi.tab,
  setPaletteTab: (t) => {
    set({ paletteTab: t });
    saveUnifiedUi();
  },
  unifiedMode: initialUnifiedUi.mode,
  setUnifiedMode: (m) => {
    set({ unifiedMode: m });
    saveUnifiedUi();
  },
  unifiedW: initialUnifiedUi.w,
  unifiedH: initialUnifiedUi.h,
  setUnifiedSize: (w, h) =>
    set({
      unifiedW: Math.min(720, Math.max(320, Math.round(w))),
      unifiedH: Math.min(1200, Math.max(320, Math.round(h))),
    }),
  unifiedDockW: initialUnifiedUi.dockW,
  setUnifiedDockW: (w) =>
    set({ unifiedDockW: Math.min(640, Math.max(280, Math.round(w))) }),
  detachedTabs: initialDetachedTabs,
  detachTab: (t) => {
    // вынос — всегда плавающим окном в точке дропа (сторону сбрасываем)
    set((s) => {
      const next = { ...s.detachedSide };
      delete next[t];
      return {
        detachedTabs: s.detachedTabs.includes(t) ? s.detachedTabs : [...s.detachedTabs, t],
        detachedSide: next,
      };
    });
    saveDetachedTabs();
    saveDetachedSide();
  },
  attachTab: (t) => {
    set((s) => ({ detachedTabs: s.detachedTabs.filter((x) => x !== t), paletteTab: t }));
    saveDetachedTabs();
    saveUnifiedUi();
  },
  detachedSide: initialDetachedSide,
  setDetachedSide: (t, side) => {
    set((s) => {
      const next = { ...s.detachedSide };
      if (side === 'float') delete next[t];
      else next[t] = side;
      return { detachedSide: next };
    });
    saveDetachedSide();
  },
  setLang: (l) => {
    setLangState(l);
    // ошибки движка хранятся готовыми строками — пересчитать на новом языке в воркере
    set({ lang: l });
    scheduleRecalcAsync(60);
  },
  recalcCounter: 0,
  calcMs: 0,
  computeActive: false,
  computeProgress: null,
  computeSimId: null,
  computeError: null,
  cancelRecalc: () => {
    // rev гасит кооперативные проверки, abort — убивает зависший воркер сразу
    recalcRev++;
    currentAbort?.abort();
    if (recalcTimer) {
      clearTimeout(recalcTimer);
      recalcTimer = null;
    }
  },
  clearComputeError: () => set({ computeError: null }),
  calcMode: 'auto',
  setCalcMode: (m) => {
    set({ calcMode: m, calcStale: false });
    // переход в auto — сразу дотянуть всё; в manual правки ждут Calculate Now
    if (m === 'auto') scheduleRecalcAsync(60);
  },
  visibleIds: [],
  setVisibleIds: (ids) => {
    const prev = get().visibleIds;
    if (prev.length === ids.length && prev.every((id, i) => id === ids[i])) return;
    set({ visibleIds: ids });
  },
  staleIds: [],
  calcStale: false,
  recalcNow: () => {
    const vis = get().visibleIds;
    void runRecalcJob(vis.length ? new Set(vis) : undefined);
  },
  printing: false,
  setPrinting: (v) => {
    if (get().printing !== v) set({ printing: v });
  },
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
    // снапшот истории уже с результатами — показываем сразу, свежесть дотянет джоба
    persist(target);
    set((s) => ({
      blocks: target,
      past,
      future: [cur, ...s.future].slice(0, HISTORY_LIMIT),
      recalcCounter: s.recalcCounter + 1,
      selectedIds: s.selectedIds.filter((id) => target[id]),
      staleIds: [],
    }));
    scheduleRecalcAsync(60);
  },

  redo: () => {
    const st = get();
    if (!st.future.length) return;
    const cur = st.blocks;
    const [target, ...future] = st.future;
    persist(target);
    set((s) => ({
      blocks: target,
      past: [...s.past, cur].slice(-HISTORY_LIMIT),
      future,
      recalcCounter: s.recalcCounter + 1,
      selectedIds: s.selectedIds.filter((id) => target[id]),
      staleIds: [],
    }));
    scheduleRecalcAsync(60);
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
    const next = { ...get().blocks, [id]: { ...blank(id, x, y), rawInput: raw } };
    persist(next);
    set({ blocks: next, selectedIds: [id], pendingEditId: edit ? id : get().pendingEditId });
    scheduleRecalcAsync(60);
  },

  addTextBlock: (x, y) => {
    pushHistory(get, set as SetFn, true);
    const id = uuid();
    const next: Record<string, MathBlockData> = { ...get().blocks, [id]: { ...blank(id, x, y), kind: 'text', rawInput: '// ' } };
    persist(next);
    set({ blocks: next, selectedIds: [id], pendingEditId: id });
    scheduleRecalcAsync(60);
  },

  scopeMonOpen: false,
  toggleScopeMon: () => {
    const open = !get().scopeMonOpen;
    set((s) => ({
      scopeMonOpen: open,
      paletteTab: open ? 'variables' : s.paletteTab,
      detachedTabs: open ? s.detachedTabs : s.detachedTabs.filter((x) => x !== 'variables'),
    }));
    saveUnifiedUi();
    if (!open) saveDetachedTabs();
  },

  addBlocks: (lines, x, y, dy = 64) => {
    const clean = lines.map((l) => l.trim()).filter((l) => l.length > 0);
    if (!clean.length) return;
    pushHistory(get, set as SetFn, true);
    const next = { ...get().blocks };
    const ids: string[] = [];
    clean.forEach((raw, k) => {
      const id = uuid();
      ids.push(id);
      next[id] = { ...blank(id, x, y + k * dy), rawInput: raw };
    });
    persist(next);
    set({ blocks: next, selectedIds: ids });
    scheduleRecalcAsync(60);
  },

  addPlotBlock: (x, y, fn = 'sin(x)', patch) => {
    pushHistory(get, set as SetFn, true);
    const id = uuid();
    const b: MathBlockData = {
      ...blank(id, x, y), rawInput: 'plot', kind: 'plot', plotFn: fn, plotXmin: -10, plotXmax: 10,
      w: fitViewportWidth(460),
      ...patch,
    };
    const next = { ...get().blocks, [id]: b };
    persist(next);
    set({ blocks: next, selectedIds: [id] });
    scheduleRecalcAsync(60);
  },

  addContourBlock: (x, y, fn = 'sin(sqrt(x^2+y^2))') => {
    pushHistory(get, set as SetFn, true);
    const id = uuid();
    const b: MathBlockData = {
      ...blank(id, x, y), rawInput: 'contour', kind: 'contour', plotFn: fn,
      plotXmin: -5, plotXmax: 5, plotYmin: -5, plotYmax: 5, plotResolution: 48,
      w: fitViewportWidth(460),
    };
    const next = { ...get().blocks, [id]: b };
    persist(next);
    set({ blocks: next, selectedIds: [id] });
    scheduleRecalcAsync(60);
  },

  addPlot3dBlock: (x, y, fn = 'sin(sqrt(x^2+y^2))') => {
    pushHistory(get, set as SetFn, true);
    const id = uuid();
    const b: MathBlockData = {
      ...blank(id, x, y), rawInput: 'plot3d', kind: 'plot3d', plotFn: fn,
      plotXmin: -5, plotXmax: 5, plotYmin: -5, plotYmax: 5,
      plotMode: 'auto', plotResolution: 48, plotWireframe: false,
      w: fitViewportWidth(560),
    };
    const next = { ...get().blocks, [id]: b };
    persist(next);
    set({ blocks: next, selectedIds: [id] });
    scheduleRecalcAsync(60);
  },

  addProgramBlock: (x, y, raw = 's := 0\nfor i in 1..n\n  s := s + i\nend\ns', exportName = '') => {
    pushHistory(get, set as SetFn, true);
    const id = uuid();
    const b: MathBlockData = {
      ...blank(id, x, y), rawInput: raw, kind: 'program', exportName,
    };
    const next = { ...get().blocks, [id]: b };
    persist(next);
    set({ blocks: next, selectedIds: [id] });
    scheduleRecalcAsync(60);
  },

  addSimBlock: (x, y, modelId = 'pendulum') => {
    pushHistory(get, set as SetFn, true);
    const id = uuid();
    const m = getSimModel(modelId) ?? getSimModel('pendulum') ?? SIM_MODELS[0];
    const b: MathBlockData = {
      ...blank(id, x, y), rawInput: 'sim', kind: 'sim', simExport: '', simSpeed: 1, simLoop: true,
      w: fitViewportWidth(560),
      ...simModelPatch(m),
    };
    const next = { ...get().blocks, [id]: b };
    persist(next);
    set({ blocks: next, selectedIds: [id] });
    scheduleRecalcAsync(60);
  },

  updateSim: (id, patch) => {
    const cur = get().blocks[id];
    if (!cur || cur.kind !== 'sim') return;
    pushHistory(get, set as SetFn);
    // если сменили модель на custom вручную — сбросить привязку (чтобы селект показал Custom)
    set({ blocks: { ...get().blocks, [id]: { ...cur, ...patch } } });
  scheduleRecalcAsync(200);
  },

  addSliderBlock: (x, y) => {
    pushHistory(get, set as SetFn, true);
    const id = uuid();
    const b: MathBlockData = {
      ...blank(id, x, y), rawInput: 'slider', kind: 'slider',
      sliderVar: 'k', sliderMin: 0, sliderMax: 10, sliderStep: 0.5, sliderVal: 5,
    };
    const next = { ...get().blocks, [id]: b };
    persist(next);
    set({ blocks: next, selectedIds: [id] });
    scheduleRecalcAsync(60);
  },

  /** Живое движение ползунка: без истории (история — один снапшот на жест, см. beginGesture). */
  setSliderValue: (id, val) => {
    const cur = get().blocks[id];
    if (!cur || cur.kind !== 'slider') return;
    set({ blocks: { ...get().blocks, [id]: { ...cur, sliderVal: val } } });
  scheduleRecalcAsync(120);
  },

  updateSlider: (id, patch) => {
    const cur = get().blocks[id];
    if (!cur || cur.kind !== 'slider') return;
    pushHistory(get, set as SetFn);
    // оптимистично показываем правку сразу, тяжёлый пересчёт — асинхронно (#6)
    set({ blocks: { ...get().blocks, [id]: { ...cur, ...patch } } });
    scheduleRecalcAsync(150);
  },

  updateInput: (id, raw) => {
    const cur = get().blocks[id];
    if (!cur) return;
    pushHistory(get, set as SetFn);
    set({ blocks: { ...get().blocks, [id]: { ...cur, rawInput: raw } } });
  scheduleRecalcAsync(150);
  },

  setExportName: (id, name) => {
    const cur = get().blocks[id];
    if (!cur) return;
    pushHistory(get, set as SetFn);
    // оптимистично показываем правку сразу, тяжёлый пересчёт — асинхронно (#6)
    set({ blocks: { ...get().blocks, [id]: { ...cur, exportName: name } } });
    scheduleRecalcAsync(150);
  },

  moveBlock: (id, x, y) => {
    const cur = get().blocks[id];
    if (!cur) return;
    pushHistory(get, set as SetFn, true);
    set({ blocks: { ...get().blocks, [id]: { ...cur, x, y } } });
    // порядок сверху-вниз зависит от Y → пересчёт после перемещения
  scheduleRecalcAsync(250);
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
    // порядок сверху-вниз зависит от Y → пересчёт в воркере без задержки
    persist(next);
    set((s) => ({ blocks: next, recalcCounter: s.recalcCounter + 1 }));
    scheduleRecalcAsync(60);
  },

  commitDrag: () => {
    // координаты/размеры могли измениться → финальный пересчёт + сохранение
  scheduleRecalcAsync(60);
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
    persist(next);
    set((s) => ({ blocks: next, selectedIds: s.selectedIds.filter((s2) => s2 !== id) }));
    scheduleRecalcAsync(60);
  },

  removeSelected: () => {
    const sel = get().selectedIds;
    if (!sel.length) return;
    pushHistory(get, set as SetFn, true);
    const next = { ...get().blocks };
    for (const id of sel) delete next[id];
    persist(next);
    set({ blocks: next, selectedIds: [] });
    scheduleRecalcAsync(60);
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

  setGridSize: (size) => {
    saveGridSize(size);
    // выбор шага включает сетку (как Show Grid в Document tab)
    if (!get().showGrid) saveGrid(true);
    set({ gridSize: size, showGrid: true });
  },

  setGridVisible: (v) => {
    saveGrid(v);
    set({ showGrid: v });
  },

  toggleBlockDisabled: (id) => {
    const cur = get().blocks[id];
    if (!cur) return;
    pushHistory(get, set as SetFn, true);
    const next = { ...get().blocks, [id]: { ...cur, disabled: !cur.disabled } };
    persist(next);
    set((s) => ({ blocks: next, recalcCounter: s.recalcCounter + 1 }));
    scheduleRecalcAsync(60);
  },

  toggleSelectedDisabled: () => {
    const st = get();
    const ids = st.selectedIds.filter((id) => st.blocks[id]);
    if (!ids.length) return;
    // все уже отключены → включаем всех, иначе отключаем всех
    const enable = ids.every((id) => st.blocks[id].disabled);
    pushHistory(get, set as SetFn, true);
    const next = { ...get().blocks };
    for (const id of ids) next[id] = { ...next[id], disabled: !enable };
    persist(next);
    set((s) => ({ blocks: next, recalcCounter: s.recalcCounter + 1 }));
    scheduleRecalcAsync(60);
  },

  separateRegions: () => {
    const list = Object.values(get().blocks);
    if (list.length < 2) return;
    const pos = separateBlocksVertically(list);
    const changed = list.some((b) => pos[b.id] && (pos[b.id].x !== b.x || pos[b.id].y !== b.y));
    if (!changed) return;
    pushHistory(get, set as SetFn, true);
    get().dropBlocks(pos);
  },

  recalc: () => {
    // явный пересчёт по кнопке — тоже неблокирующий (#6)
    void runRecalcJob();
  },

  clear: () => {
    pushHistory(get, set as SetFn, true);
    persist({});
    set({ blocks: {}, selectedIds: [], staleIds: [] });
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
    persist(rec);
    set((s) => ({ blocks: rec, selectedIds: [], recalcCounter: s.recalcCounter + 1, staleIds: [] }));
    scheduleRecalcAsync(60);
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
    persist(rec);
    set((s) => ({ blocks: rec, selectedIds: [], recalcCounter: s.recalcCounter + 1, staleIds: [] }));
    scheduleRecalcAsync(60);
  },

  loadDocument: (data) => {
    let parsed;
    try {
      parsed = parseDocFile(data);
    } catch {
      return { ok: false, message: t('doc.notArray') };
    }
    if (parsed.blocks.length > 5000) return { ok: false, message: t('doc.tooMany') };
    const rec: Record<string, MathBlockData> = {};
    let bad = 0;
    for (const item of parsed.blocks) {
      const b = migrate(item);
      if (b) rec[b.id] = b;
      else bad++;
    }
    if (!Object.keys(rec).length) return { ok: false, message: t('doc.noBlocks') };
    pushHistory(get, set as SetFn, true);
    persist(rec);
    set((s) => ({ blocks: rec, selectedIds: [], recalcCounter: s.recalcCounter + 1, staleIds: [] }));
    scheduleRecalcAsync(60);
    // major-расхождение — предупреждение; minor — тихая пометка версии файла
    const mismatch = engineMismatch(parsed.engine);
    const warn = mismatch ?? (parsed.engine && parsed.engine !== ENGINE_VERSION
      ? t('doc.engineWarn', { v: parsed.engine })
      : '');
    return { ok: true, message: t('doc.loaded', { n: Object.keys(rec).length, bad: bad ? t('doc.loadedBad', { bad }) : '', warn }) };
  },

  liveConnected: false,
  liveUrl: (() => {
    try {
      return localStorage.getItem('nyamath-live-url') ?? 'http://localhost:3777';
    } catch {
      return 'http://localhost:3777';
    }
  })(),
  liveError: null,
  setLiveConnected: (v) => set({ liveConnected: v }),
  setLiveUrl: (url) => set({ liveUrl: url }),
  setLiveError: (msg) => set({ liveError: msg }),

  applyRemoteBlocks: (data) => {
    if (!Array.isArray(data)) return { ok: false, count: 0 };
    if (data.length > 5000) return { ok: false, count: 0 };
    const rec: Record<string, MathBlockData> = {};
    for (const item of data) {
      const b = migrate(item);
      if (b) rec[b.id] = b;
    }
    persist(rec);
    set((s) => ({
      blocks: rec,
      selectedIds: s.selectedIds.filter((id) => rec[id]),
      recalcCounter: s.recalcCounter + 1,
      staleIds: [],
    }));
    scheduleRecalcAsync(60);
    return { ok: true, count: Object.keys(rec).length };
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

// Стартовый пересчёт восстановленного документа — тоже в воркере:
// restore обязан вернуться синхронно, сохранённые результаты видны сразу,
// джоба дотягивает свежесть следом.
scheduleRecalcAsync(30);

/** Сохранить режим/размеры/показ палитры (вызывать по окончании жеста ресайза/дока). */
export function savePaletteUi(variant: 'functions' | 'formulas' | 'constants' = 'functions') {
  try {
    const s = useCanvasStore.getState();
    const ui: PaletteUi = variant === 'formulas'
      ? { mode: s.formulaPaletteMode, w: s.formulaPaletteW, h: s.formulaPaletteH, dockW: s.formulaPaletteDockW, open: s.formulaPaletteOpen }
      : variant === 'constants'
      ? { mode: s.constPaletteMode, w: s.constPaletteW, h: s.constPaletteH, dockW: s.constPaletteDockW, open: s.constPaletteOpen }
      : { mode: s.paletteMode, w: s.paletteW, h: s.paletteH, dockW: s.paletteDockW, open: s.paletteOpen };
    localStorage.setItem(
      variant === 'formulas' ? FORMULA_PAL_UI_KEY : variant === 'constants' ? CONST_PAL_UI_KEY : PAL_UI_KEY,
      JSON.stringify(ui),
    );
  } catch { /* ignore */ }
}

/** Сохранить вынесенные вкладки (по окончании tear-off/attach/закрытия). */
export function saveDetachedTabs() {
  try {
    localStorage.setItem(DETACHED_KEY, JSON.stringify(useCanvasStore.getState().detachedTabs));
  } catch { /* ignore */ }
}

/** Сохранить стороны док-панелей вынесенных вкладок. */
export function saveDetachedSide() {
  try {
    localStorage.setItem(DETACHED_SIDE_KEY, JSON.stringify(useCanvasStore.getState().detachedSide));
  } catch { /* ignore */ }
}
export function isUnifiedPaletteOpen(s: {
  paletteOpen: boolean;
  formulaPaletteOpen: boolean;
  constPaletteOpen: boolean;
  scopeMonOpen: boolean;
}): boolean {
  return s.paletteOpen || s.formulaPaletteOpen || s.constPaletteOpen || s.scopeMonOpen;
}

/** Сохранить геометрию и вкладку единого окна (по окончании жеста + при смене вкладок). */
export function saveUnifiedUi() {
  try {
    const s = useCanvasStore.getState();
    const ui: UnifiedUi = {
      mode: s.unifiedMode,
      w: s.unifiedW,
      h: s.unifiedH,
      dockW: s.unifiedDockW,
      open: isUnifiedPaletteOpen(s),
      tab: s.paletteTab,
    };
    localStorage.setItem(UNIFIED_UI_KEY, JSON.stringify(ui));
  } catch { /* ignore */ }
}
