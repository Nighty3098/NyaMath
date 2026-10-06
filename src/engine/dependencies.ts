import {
  buildSubstitution,
  createBaseScope,
  compilePlotExpr,
  envTag,
  evaluateLine,
  extractDependencies,
  formatResult,
  isValidVarName,
  parseLine,
  preprocessJ,
  preprocessRanges,
  splitOffUnit,
  stripOnError,
  toLatex,
  valueToLatex,
} from './mathEngine';
import type { Scope } from './core';
import { padRange } from './core';
import { resetSolverTrace, takeSolverTrace } from './numeric';
import { analyzeProgram, runProgram } from './program';
import { sampleExpression, type PlotSample } from './plotSample';
import {
  parseSimDef,
  runSim,
  runSimAsync,
  isSimCancel,
  yieldSlice,
  type SimResult,
  type SimSolver,
  type SimMode,
} from './simEngine';
import { t } from '../i18n';

/** Режим видимости блока в отчёте. Вынесен сюда, чтобы его видели движок, стор и экспорт. */
export type BlockVisibility = 'show' | 'hide' | 'input' | 'result';

/** Стиль серии 2D-графика: линия / столбцы / стебли / стрелки / векторное поле. */
export type PlotTrace = 'line' | 'bar' | 'stem' | 'arrow' | 'field';

export interface MathBlockData {
  id: string;
  x: number;
  y: number;
  rawInput: string;
  displayLatex: string;
  resultStr: string;
  /** LaTeX результата (матрицы/bmatrix, комплексные) — рендерится через KaTeX */
  resultLatex: string;
  /** Подстановка значений Calcpad-стиля (`m*a` → `2 * 5`): текст ... */
  substStr?: string | null;
  /** ... и LaTeX подстановки. null/'' = нет подстановки */
  substLatex?: string | null;
  /** Шаговый лог решателей (nlsolve/root/nint/…) — Symbolab-стиль, у нас free */
  solverTrace?: string[] | null;
  resultValue: unknown;
  error: string | null;
  dependencies: string[];
  definedVar: string | null;
  /** true, если последняя строка блока — вывод (expr / expr =): результат показываем инлайн */
  isOutput: boolean;
  kind: 'math' | 'plot' | 'text' | 'program' | 'plot3d' | 'sim' | 'contour' | 'slider';
  /** Disable Evaluation: регион не считается, его имена не видны ниже */
  disabled?: boolean;
  /**
   * Видимость в отчёте/печати (Calcpad-паттерн #hide/#pre/#post):
   * - show: всё как на экране (по умолчанию)
   * - hide: пропустить в Markdown/LaTeX/Word/печати
   * - input: только ввод/код, без результата (промежуточные выкладки)
   * - result: только результат, без ввода (чистый отчёт для экспертизы)
   */
  visibility?: BlockVisibility;
  /** Слайдер: имя переменной, диапазон, шаг и текущее значение */
  sliderVar?: string;
  sliderMin?: number;
  sliderMax?: number;
  sliderStep?: number;
  sliderVal?: number;
  plotFn?: string;
  plotXmin?: number;
  plotXmax?: number;
  /** Проекция/стиль 2D-графика и оформление для публикации */
  plotProj?: 'xy' | 'polar';
  plotTrace?: PlotTrace;
  plotErr?: string;
  plotLogx?: boolean;
  /** Единица оси (масштаб тиков), например «ГГц», «рад/с», «мм» */
  plotXUnit?: string;
  plotYUnit?: string;
  plotTitle?: string;
  plotXLabel?: string;
  plotYLabel?: string;
  plotGrid?: boolean;
  plotLegend?: boolean;
  /**
   * Вторая ось Y (multi-axis, Origin-паттерн): выражение `plotY2Fn(x)` со своей
   * правой шкалой + подпись. Только xy-проекция, рисуется линией поверх.
   */
  plotY2Fn?: string;
  plotY2Label?: string;
  /** Стиль «для статьи»: белый фон, чёрные оси, serif-тики (влияет и на SVG/PNG-экспорт). */
  plotPaper?: boolean;
  /** 3D: диапазон по y, режим, разрешение сетки, каркас поверх поверхности */
  plotYmin?: number;
  plotYmax?: number;
  plotMode?: 'auto' | 'surface' | 'points' | 'matrix';
  plotResolution?: number;
  plotWireframe?: boolean;
  /** Имя переменной, в которую программный блок экспортирует результат */
  exportName?: string;
  /** Лог trace-операторов программного блока */
  programTrace?: string[] | null;
  /** Sim: модель, состояния, производные, параметры, старт, интервал, решатель, оси */
  simMode?: SimMode;
  simModel?: string;
  simStates?: string;
  simDerivs?: string;
  simAux?: string;
  simParams?: string;
  simInit?: string;
  simT0?: number;
  simT1?: number;
  simDt?: number;
  simSolver?: SimSolver;
  simEvents?: string;
  simX?: string;
  simY?: string;
  /** Sim/FDTD: сетка, источник, слои */
  simFdtdN?: number;
  simFdtdL?: number;
  simFdtdSteps?: number;
  simFdtdSrc?: 'gauss' | 'sine';
  simFdtdFreq?: number;
  simFdtdAmp?: number;
  simFdtdSrcX?: number;
  simFdtdDet?: number;
  simFdtdLayers?: string;
  /** Sim: имя переменной для финального вектора состояний */
  simExport?: string;
  /** Sim: предпочтения плеера (скорость, повтор) */
  simSpeed?: number;
  simLoop?: boolean;
  /** Sim: посчитанная траектория (не пишем в файл/хранилище) */
  simResult?: SimResult | null;
  /** Ручной размер: w — ширина региона/графика, h — высота графика. null = авто */
  w?: number | null;
  h?: number | null;
  /** Автографик: превью функции под формулой (f(x) := …, sin(x) = …) */
  plotPreview?: PlotSample | null;
  /**
   * Умная визуализация в один клик (когда автографик неприменим):
   * surface — f(x,y) → 3D-поверхность; vector — числовой вектор → 2D-график
   * по индексу; matrix — числовая матрица → 3D (точки N×3 / высоты M×N).
   * expr — готовое выражение для plot/plot3d-блока.
   */
  visualize?: { kind: 'surface' | 'vector' | 'matrix'; expr: string } | null;
}

export interface RecalcResult {
  blocks: Record<string, MathBlockData>;
  scope: Scope;
  /** false — ни один блок не пересчитывался; blocks — та же ссылка, что в прошлом прогоне */
  changed: boolean;
  /** Вне области Calculate Now со старыми результатами (пусто при полном пересчёте) */
  staleIds: string[];
}

/**
 * Опции пересчёта (Calculate Now из Prime 11).
 * only: пересчитать только эти блоки + их транзитивный upstream;
 * остальные — reuse из кэша, при расхождении отпечатка — старые результаты
 * + staleIds. Пустой/undefined = полный пересчёт. Циклические — всегда свежие.
 */
export interface RecalcOpts {
  only?: Set<string>;
}

/* ---------- инкрементальный пересчёт: fingerprint-кэш ----------
 * Идея: fingerprint блока = его содержимое + fingerprint'ы блоков-определителей
 * его зависимостей (транзитивно). Изменилась правка ниже по листу — fingerprint'ы
 * выше не меняются, их результаты (включая тяжёлые sim/plotPreview) берём из кэша,
 * а записи в scope переигрываем. Ссылки на объекты при hit сохраняем, поэтому
 * memo-компоненты пропускают ре-рендер. Порядок в fingerprint входит только при
 * дублирующихся определениях (shadowing); иначе перемещения без смены порядка
 * вычислений тоже остаются кэшированными. Циклы и смена языка кэширование сбрасывают
 * (язык — часть ключа: тексты ошибок локализованы).
 */
interface CachedBlock {
  fp: string;
  block: MathBlockData;
  /** записи в scope, сделанные блоком (defined-переменные после вычисления) */
  writes: Record<string, unknown>;
}

const recalcCache = new Map<string, CachedBlock>();
let lastRecord: Record<string, MathBlockData> = {};
let lastIdsKey = '';

/* ---------- последний посчитанный scope (#2) ----------
 * recalculateAll считает scope для всего документа, но стор хранил только
 * blocks и выкидывал scope — поэтому каждый plot/3d/contour/debug делал
 * recalculateAll заново внутри useMemo (P графиков = P полных пересчётов
 * на каждое нажатие клавиши). Теперь scope доступен через getLastScope()
 * без повторного счёта. Включает base scope (константы/паки) и все виды
 * блоков — графики и отладчик видят и program/sim/slider-переменные.
 */
let lastScope: Scope = createBaseScope();

/** Scope последнего recalculateAll (копия не делается — вызывающий код копирует при мутации). */
export function getLastScope(): Scope {
  return lastScope;
}

/**
 * Подменить lastScope снаружи (клиент Web Worker пересобирает scope
 * главного потока из сериализованного снапшота — плоты/отладчик/MCP-скоуп
 * продолжают видеть живые значения без локального пересчёта).
 */
export function setLastScope(scope: Scope): void {
  lastScope = scope;
}

export function sortBlocksTopDown(blocks: MathBlockData[]): MathBlockData[] {
  return [...blocks].sort((a, b) => (a.y === b.y ? a.x - b.x : a.y - b.y));
}

/**
 * Use-before-definition: использование выше определения.
 * Для каждого активного блока — зависимости, чьё ПЕРВОЕ определение
 * находится ниже по листу. Встроенные имена (sin, pi, …) определений
 * не имеют и сюда не попадают. Disabled-регионы не участвуют.
 */
export function findUseBeforeDef(list: MathBlockData[]): Map<string, string[]> {
  const ordered = sortBlocksTopDown(list.filter((b) => !b.disabled));
  const firstDef = new Map<string, number>();
  ordered.forEach((b, i) => {
    for (const d of blockDefs(b)) {
      if (!firstDef.has(d)) firstDef.set(d, i);
    }
  });
  const late = new Map<string, string[]>();
  ordered.forEach((b, i) => {
    const bad = [...new Set(blockDeps(b))].filter((d) => {
      const f = firstDef.get(d);
      return f !== undefined && f > i;
    });
    if (bad.length) late.set(b.id, bad);
  });
  return late;
}

/* ---------- кэши зависимостей/определений блоков (#7) ----------
 * blockDeps/blockDefs вызываются на КАЖДЫЙ пересчёт для КАЖДОГО блока
 * (detectCycles + fingerprint-фаза), хотя зависят только от контента блока.
 * Ключ — контент релевантных полей; наружу отдаём копии массивов.
 */
const BLOCK_CACHE_LIMIT = 1000;
const blockDepsCache = new Map<string, string[]>();
const blockDefsCache = new Map<string, string[]>();

function blockCachePut(m: Map<string, string[]>, k: string, v: string[]): void {
  if (m.has(k)) m.delete(k);
  else if (m.size >= BLOCK_CACHE_LIMIT) {
    const oldest = m.keys().next();
    if (!oldest.done) m.delete(oldest.value);
  }
  m.set(k, v);
}

/** Контентный ключ sim-блока для зависимостей (только dep-релевантные поля). */
function simDepsKey(b: MathBlockData): string {
  return `sim:${b.simMode ?? ''}|${b.simStates ?? ''}|${b.simDerivs ?? ''}|${b.simAux ?? ''}|${b.simParams ?? ''}|${b.simInit ?? ''}|${b.simEvents ?? ''}|${b.simFdtdLayers ?? ''}`;
}

export function blockDeps(b: MathBlockData): string[] {
  let key: string | null;
  switch (b.kind) {
    case 'math':
      key = `m:${b.rawInput}`;
      break;
    case 'program':
      key = `p:${b.rawInput}`;
      break;
    case 'sim':
      key = simDepsKey(b);
      break;
    default:
      return []; // slider/plot/plot3d/contour/text: зависимостей нет
  }
  const hit = blockDepsCache.get(key);
  if (hit) return hit.slice();
  const v = computeBlockDeps(b);
  blockCachePut(blockDepsCache, key, v);
  return v.slice();
}

export function blockDefs(b: MathBlockData): string[] {
  let key: string | null;
  switch (b.kind) {
    case 'math':
      key = `m:${b.rawInput}`;
      break;
    case 'program':
      key = `pe:${b.exportName ?? ''}`;
      break;
    case 'sim':
      key = `se:${b.simExport ?? ''}`;
      break;
    case 'slider':
      key = `sl:${b.sliderVar ?? ''}`;
      break;
    default:
      return [];
  }
  const hit = blockDefsCache.get(key);
  if (hit) return hit.slice();
  const v = computeBlockDefs(b);
  blockCachePut(blockDefsCache, key, v);
  return v.slice();
}

function computeBlockDeps(b: MathBlockData): string[] {
  if (b.kind === 'program') {
    try {
      return analyzeProgram(b.rawInput).dependencies;
    } catch {
      return [];
    }
  }
  if (b.kind === 'sim') return simDeps(b);
  if (b.kind === 'slider') return [];
  const deps = new Set<string>();
  for (const line of b.rawInput.split('\n')) {
    const t = stripOnError(line.trim());
    if (!t || t.startsWith('//') || t.startsWith('#')) continue;
    // перевод единиц `L = cm`: зависимости — только из левой части
    const stripped = t.replace(/=+\s*$/, '').trim();
    const [lhsU, unitU] = splitOffUnit(stripped);
    const src = unitU ? lhsU : t;
    try {
      const p = parseLine(src);
      for (const d of extractDependencies(p.expr, p.fnParams)) deps.add(d);
    } catch {
      /* ignore */
    }
  }
  return [...deps];
}

function computeBlockDefs(b: MathBlockData): string[] {
  if (b.kind === 'program') {
    return b.exportName && isValidVarName(b.exportName) ? [b.exportName] : [];
  }
  if (b.kind === 'sim') {
    const exp = (b.simExport ?? '').trim();
    return exp && isValidVarName(exp) ? [exp] : [];
  }
  if (b.kind === 'slider') {
    const v = (b.sliderVar ?? '').trim();
    return v && isValidVarName(v) && v !== 'i' ? [v] : [];
  }
  if (b.kind !== 'math') return [];
  const defs: string[] = [];
  for (const line of b.rawInput.split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('//') || t.startsWith('#')) continue;
    try {
      const p = parseLine(t);
      if (p.kind === 'assign' && p.definedVar) defs.push(p.definedVar);
    } catch {
      /* ignore */
    }
  }
  return defs;
}

export function detectCycles(blocks: MathBlockData[]): Set<string> {
  const defMap = new Map<string, string>();
  for (const b of blocks) {
    for (const d of blockDefs(b)) defMap.set(d, b.id);
  }
  const adj = new Map<string, string[]>();
  for (const b of blocks) {
    if (b.kind !== 'math' && b.kind !== 'program' && b.kind !== 'sim' && b.kind !== 'slider')
      continue;
    const deps = new Set<string>();
    for (const d of blockDeps(b)) {
      const target = defMap.get(d);
      if (target && target !== b.id) deps.add(target);
    }
    adj.set(b.id, [...deps]);
  }
  const visited = new Map<string, number>();
  const cyclic = new Set<string>();
  const stack: string[] = [];
  const dfs = (id: string) => {
    visited.set(id, 1);
    stack.push(id);
    for (const nb of adj.get(id) ?? []) {
      const st = visited.get(nb) ?? 0;
      if (st === 0) dfs(nb);
      else if (st === 1) {
        const i = stack.indexOf(nb);
        for (let k = i; k < stack.length; k++) cyclic.add(stack[k]);
        cyclic.add(nb);
      }
    }
    stack.pop();
    visited.set(id, 2);
  };
  for (const b of blocks) {
    if ((visited.get(b.id) ?? 0) === 0) dfs(b.id);
  }
  return cyclic;
}

/** Зависимости sim-блока: ODE — из производных/aux/параметров/старта; FDTD — из выражений слоёв. */
function simDeps(b: MathBlockData): string[] {
  const deps = new Set<string>();
  const addExprDeps = (expr: string, skip?: Set<string>) => {
    for (const part of expr.split(';')) {
      try {
        const p = parseLine(part.trim());
        for (const d of extractDependencies(p.expr, p.fnParams)) {
          if (!skip?.has(d) && d !== 't') deps.add(d);
        }
      } catch {
        /* ignore */
      }
    }
  };
  if (b.simMode === 'fdtd') {
    for (const line of (b.simFdtdLayers ?? '').split('\n')) {
      const l = line.trim();
      if (!l || l.startsWith('//') || l.startsWith('#')) continue;
      for (const part of l.split(',')) addExprDeps(part);
    }
    return [...deps];
  }
  const states = new Set(
    (b.simStates ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  );
  const texts = [
    b.simDerivs ?? '',
    (b.simAux ?? '').replace(/^([A-Za-z_]\w*)\s*(:=|=)/gm, ''),
    (b.simParams ?? '').replace(/^([A-Za-z_]\w*)\s*(:=|=)/gm, ''),
    b.simInit ?? '',
  ];
  // события: условия целиком + правые части действий
  for (const line of (b.simEvents ?? '').split('\n')) {
    const l = line.trim();
    if (!l || l.startsWith('//') || l.startsWith('#')) continue;
    const arrow = l.indexOf('=>');
    if (arrow >= 0) {
      texts.push(l.slice(0, arrow));
      texts.push(
        l
          .slice(arrow + 2)
          .split(';')
          .map((a) =>
            a
              .trim()
              .replace(/^([A-Za-z_]\w*)\s*(:=|=)/, '')
              .replace(/^stop$/i, ''),
          )
          .join(';'),
      );
    } else {
      texts.push(l);
    }
  }
  for (const text of texts) {
    for (const line of text.split('\n')) {
      const t = line.trim();
      if (!t || t.startsWith('//') || t.startsWith('#')) continue;
      for (const part of t.split(';')) {
        try {
          const p = parseLine(part.trim());
          for (const d of extractDependencies(p.expr, p.fnParams)) {
            if (!states.has(d) && d !== 't') deps.add(d);
          }
        } catch {
          /* ignore */
        }
      }
    }
  }
  return [...deps];
}

export interface RecalcHooks {
  shouldCancel?: () => boolean;
  onBlock?: (done: number, total: number) => void;
  onSimProgress?: (blockId: string, done: number, total: number | null) => void;
}

export type RecalcAsyncOutcome = { cancelled: true } | { cancelled: false; result: RecalcResult };

interface RecalcCtx {
  ordered: MathBlockData[];
  cyclic: Set<string>;
  langTag: string;
  scope: Scope;
  out: Record<string, MathBlockData>;
  allHit: { v: boolean };
  fpOf: (id: string) => string;
  simConfigFp: (b: MathBlockData) => string;
  reuseHit: (b: MathBlockData, prev: CachedBlock) => MathBlockData;
  snapBlock: (c: MathBlockData, key: string) => void;
  /** null = полный пересчёт; иначе только эти свежие (остальные — reuse/stale) */
  fresh: Set<string> | null;
  stale: string[];
  /** reuse кэша вне fresh-множества (true = блок пропущен, scope протянут из кэша) */
  reuseStale: (b: MathBlockData) => boolean;
}

/** Общая преамбула пересчёта: порядок, циклы, fingerprint-механика, scope. */
function createRecalcCtx(list: MathBlockData[], opts?: RecalcOpts): RecalcCtx {
  const ordered = sortBlocksTopDown(list);
  // Disable Evaluation: отключённые регионы не считаются,
  // их имена не видны ниже — в циклах и цепочках определений не участвуют.
  const active = ordered.filter((b) => !b.disabled);
  const cyclic = detectCycles(active);
  const langTag = envTag();
  const byId = new Map(ordered.map((b) => [b.id, b]));
  // определители имён сверху вниз — точное соответствие threading scope
  const defLists = new Map<string, number[]>();
  ordered.forEach((b, i) => {
    if (b.disabled) return;
    for (const d of blockDefs(b)) {
      const l = defLists.get(d);
      if (l) l.push(i);
      else defLists.set(d, [i]);
    }
  });
  const hasShadow = [...defLists.values()].some((l) => l.length > 1);
  const fpMemo = new Map<string, string>();
  const visiting = new Set<string>();
  // порядок блоков для shadowing: Map вместо findIndex в рекурсии (было O(n²))
  const orderOf = new Map<string, number>();
  ordered.forEach((b, i) => orderOf.set(b.id, i));
  // fingerprint определителя, видимого из позиции order (последний выше по листу)
  const upstreamFp = (name: string, order: number): string => {
    const l = defLists.get(name);
    if (!l) return `${name}:=`;
    let idx = -1;
    for (const k of l) {
      if (k < order) idx = k;
      else break;
    }
    if (idx < 0) return `${name}:=`;
    return `${name}=>${fpOf(ordered[idx].id)}`;
  };
  const simConfigFp = (b: MathBlockData): string =>
    JSON.stringify([
      b.simMode,
      b.simStates,
      b.simDerivs,
      b.simAux,
      b.simParams,
      b.simInit,
      b.simT0,
      b.simT1,
      b.simDt,
      b.simSolver,
      b.simEvents,
      b.simX,
      b.simY,
      b.simFdtdN,
      b.simFdtdL,
      b.simFdtdSteps,
      b.simFdtdSrc,
      b.simFdtdFreq,
      b.simFdtdAmp,
      b.simFdtdSrcX,
      b.simFdtdDet,
      b.simFdtdLayers,
      b.simExport,
      b.simSpeed,
      b.simLoop,
      b.exportName,
    ]);
  const fpOf = (id: string): string => {
    const hit = fpMemo.get(id);
    if (hit !== undefined) return hit;
    const b = byId.get(id);
    if (!b) return `missing:${id}`;
    // циклы всегда пересчитываем свежо, но fingerprint стабилен (rawInput)
    if (cyclic.has(id)) return `cyc:${id}:${b.rawInput}`;
    if (visiting.has(id)) return `loop:${id}:${b.rawInput}`;
    visiting.add(id);
    const order = orderOf.get(id) ?? -1;
    const ordTag = hasShadow ? `#${order}` : '';
    const deps = blockDeps(b).map((d) => upstreamFp(d, order));
    deps.sort();
    const depTag = deps.join(';');
    let fp: string;
    switch (b.kind) {
      case 'slider':
        fp = `sl:${b.sliderVar}|${b.sliderMin}|${b.sliderMax}|${b.sliderStep}|${b.sliderVal}${ordTag}`;
        break;
      case 'program':
        fp = `pr:${b.rawInput}|${b.exportName ?? ''}${ordTag}|${depTag}`;
        break;
      case 'sim':
        fp = `sm:${simConfigFp(b)}${ordTag}|${depTag}`;
        break;
      case 'plot':
      case 'plot3d':
      case 'contour':
      case 'text':
        // pass-блоки не пишут в scope, но их СОДЕРЖИМОЕ — часть результата
        // (displayLatex/plotFn). Без него правка текста/формулы графика даёт
        // тот же fingerprint → cache-hit возвращает stale-объект и правка
        // молча откатывается (видно через MCP/sync: пуш принят, rev вырос,
        // а контент старый). Геометрия (x/y/w/h) по-прежнему не входит —
        // её переносит reuseHit.
        fp = `pass:${b.kind}:${b.rawInput}|${b.plotFn ?? ''}|${b.plotXmin ?? ''}|${b.plotXmax ?? ''}|${b.plotYmin ?? ''}|${b.plotYmax ?? ''}|${b.plotMode ?? ''}|${b.plotResolution ?? ''}|${b.plotTitle ?? ''}|${b.plotXLabel ?? ''}|${b.plotYLabel ?? ''}${ordTag}`;
        break;
      default:
        fp = `m:${b.rawInput}${ordTag}|${depTag}`;
    }
    // переключение Disable меняет смысл блока при том же тексте
    if (b.disabled) fp += '|dis';
    visiting.delete(id);
    fpMemo.set(id, fp);
    return fp;
  };
  // fresh-множество для Calculate Now: only + транзитивный upstream.
  // Upstream намеренно over-approximate (ВСЕ определители имён, не только
  // видимый сверху): лишнее посчитаем, но свежее никогда не возьмёт значение
  // из пропущенного — множество пропущенных downstream-замкнуто.
  let fresh: Set<string> | null = null;
  if (opts?.only && opts.only.size > 0) {
    fresh = new Set<string>();
    for (const id of opts.only) {
      if (byId.has(id)) fresh.add(id);
    }
    for (const id of cyclic) fresh.add(id);
    const nameToIds = new Map<string, Set<string>>();
    ordered.forEach((b) => {
      if (b.disabled) return;
      for (const d of blockDefs(b)) {
        let s = nameToIds.get(d);
        if (!s) {
          s = new Set<string>();
          nameToIds.set(d, s);
        }
        s.add(b.id);
      }
    });
    const queue = [...fresh];
    while (queue.length > 0) {
      const id = queue.pop() as string;
      const b = byId.get(id);
      if (!b) continue;
      for (const dep of blockDeps(b)) {
        const definers = nameToIds.get(dep);
        if (!definers) continue;
        for (const did of definers) {
          if (!fresh.has(did)) {
            fresh.add(did);
            queue.push(did);
          }
        }
      }
    }
  }
  const stale: string[] = [];
  const scope: Scope = createBaseScope();
  const out: Record<string, MathBlockData> = {};
  for (const b of list) out[b.id] = { ...b };
  const allHit = { v: true };
  /**
   * Переиспользование кэша: геометрия (x/y/w/h) в fingerprint не входит,
   * поэтому при hit переносим её с входного блока. Сдвиг/ресайз дают новый
   * объект (и changed), остальные блоки остаются теми же ссылками.
   */
  const reuseHit = (b: MathBlockData, prev: CachedBlock): MathBlockData => {
    const c = prev.block;
    if (
      c.x !== b.x ||
      c.y !== b.y ||
      (c.w ?? null) !== (b.w ?? null) ||
      (c.h ?? null) !== (b.h ?? null)
    ) {
      allHit.v = false;
      const patched = { ...c, x: b.x, y: b.y, w: b.w, h: b.h };
      // кэш тоже двигаем, иначе следующий прогон снова увидит «сдвиг»
      recalcCache.set(b.id, { ...prev, block: patched });
      return patched;
    }
    return c;
  };
  /** Запомнить результат блока в кэше (вызывать после вычисления). */
  const snapBlock = (c: MathBlockData, key: string) => {
    const writes: Record<string, unknown> = {};
    for (const d of blockDefs(c)) {
      if (d in scope) writes[d] = scope[d];
    }
    recalcCache.set(c.id, { fp: key, block: c, writes });
  };
  /**
   * Пропуск вне fresh-множества: reuse кэша + протяжка scope, при расхождении
   * отпечатка — старые результаты и запись в stale. Без кэша — false
   * (вызывающий код считает как обычно: показать нечего).
   * НЕ снимает snap (не врём кэшу свежим отпечатком со старым содержимым).
   */
  const reuseStale = (b: MathBlockData): boolean => {
    if (!fresh || fresh.has(b.id)) return false;
    const prev = recalcCache.get(b.id);
    if (!prev) return false;
    const key = `${langTag}|${fpOf(b.id)}`;
    out[b.id] = reuseHit(b, prev);
    for (const [k, v] of Object.entries(prev.writes)) scope[k] = v;
    if (prev.fp !== key) stale.push(b.id);
    return true;
  };
  return {
    ordered,
    cyclic,
    langTag,
    scope,
    out,
    allHit,
    fpOf,
    simConfigFp,
    reuseHit,
    snapBlock,
    fresh,
    stale,
    reuseStale,
  };
}

/** Финал пересчёта: чистка кэша, ссылка на прошлый прогон при полном hit, lastScope. */
function finishRecalc(ctx: RecalcCtx): RecalcResult {
  const { ordered, out } = ctx;
  // Чистим кэш от удалённых блоков; при полном hit отдаём прошлую ссылку —
  // стор и memo-компоненты пропускают работу.
  for (const id of [...recalcCache.keys()]) {
    if (!out[id]) recalcCache.delete(id);
  }
  const idsKey = ordered
    .map((b) => b.id)
    .sort()
    .join(',');
  let record = out;
  let changed = true;
  if (ctx.allHit.v && idsKey === lastIdsKey) {
    record = lastRecord;
    changed = false;
  }
  lastRecord = record;
  lastIdsKey = idsKey;
  lastScope = ctx.scope;
  return { blocks: record, scope: ctx.scope, changed, staleIds: [...ctx.stale] };
}

export function recalculateAll(list: MathBlockData[], opts?: RecalcOpts): RecalcResult {
  const ctx = createRecalcCtx(list, opts);
  for (const b of ctx.ordered) computeBlockSync(b, ctx);
  return finishRecalc(ctx);
}

/** Плоский массив чисел из значения (mathjs Matrix → toArray), иначе null. */
function toNumberCells(value: unknown): { flat: number[]; rows: number; cols: number } | null {
  let arr: unknown = value;
  if (arr !== null && typeof arr === 'object' && 'toArray' in (arr as object)) {
    try {
      arr = (arr as { toArray: () => unknown }).toArray();
    } catch {
      return null;
    }
  }
  if (!Array.isArray(arr)) return null;
  const rows = arr.length;
  if (!rows) return null;
  const isRow = (r: unknown): r is number[] =>
    Array.isArray(r) && r.every((v) => typeof v === 'number' && isFinite(v));
  if ((arr as unknown[]).every((v) => typeof v === 'number' && isFinite(v))) {
    return { flat: arr as number[], rows, cols: 1 };
  }
  if ((arr as unknown[]).every(isRow)) {
    const cols = (arr as number[][]).every((r) => r.length === (arr as number[][])[0].length)
      ? (arr as number[][])[0].length
      : -1;
    if (cols < 1) return null;
    return { flat: (arr as number[][]).flat(), rows, cols };
  }
  return null;
}

/**
 * Умная визуализация: f(x,y) → surface (только parse-проверка, сэмплит сам
 * plot3d-блок); числовой вектор (включая N×1/1×N) → vector; прочая числовая
 * матрица → matrix. Null — скаляры, строки, ошибки, блоки без переменной.
 */
function detectVisualize(
  lastP: ReturnType<typeof parseLine> | null,
  lastError: string | null,
  definedVar: string | null,
  lastValue: unknown,
): { kind: 'surface' | 'vector' | 'matrix'; expr: string } | null {
  if (lastP?.kind === 'assign' && lastP.isFunctionDef && lastP.fnParams.length === 2) {
    const [px, py] = lastP.fnParams as [string, string];
    const body = lastP.expr
      .replace(new RegExp(`\\b${px}\\b`, 'g'), 'x')
      .replace(new RegExp(`\\b${py}\\b`, 'g'), 'y');
    try {
      if (compilePlotExpr(preprocessRanges(`(${preprocessJ(body, false)})`))) {
        return { kind: 'surface', expr: body };
      }
    } catch {
      /* не парсится — кнопки не будет */
    }
    return null;
  }
  if (lastError !== null || !definedVar || lastValue == null) return null;
  const cells = toNumberCells(lastValue);
  if (!cells || cells.flat.length < 2) return null;
  if (cells.cols === 1 || cells.rows === 1) return { kind: 'vector', expr: definedVar };
  return { kind: 'matrix', expr: definedVar };
}

/** Один блок синхронно: все виды, sim — через runSim (#6: async-близнец computeSimAsync). */
function computeBlockSync(b: MathBlockData, ctx: RecalcCtx): void {
  const { scope, out, cyclic, langTag, fpOf, reuseHit, snapBlock, reuseStale } = ctx;
  // вне области Calculate Now — старые результаты из кэша (scope протянут)
  if (reuseStale(b)) return;
  const cur = out[b.id];
  // подстановка и лог решателей пересчитываются ниже (мат/program-ветки)
  cur.substStr = null;
  cur.substLatex = null;
  cur.solverTrace = null;
  // Disable Evaluation: замороженный регион — формула видна,
  // но не считается и ничего не пишет в scope (как pass-регионы).
  if (b.disabled) {
    const pkey = `${langTag}|${fpOf(b.id)}`;
    const pprev = recalcCache.get(b.id);
    if (pprev && pprev.fp === pkey) {
      out[b.id] = reuseHit(b, pprev);
      return;
    }
    ctx.allHit.v = false;
    cur.error = null;
    cur.dependencies = [];
    cur.definedVar = null;
    cur.isOutput = false;
    cur.resultStr = '';
    cur.resultLatex = '';
    cur.resultValue = null;
    cur.displayLatex = b.rawInput;
    cur.visualize = null;
    cur.programTrace = null;
    snapBlock(cur, pkey);
    return;
  }
  if (b.kind === 'plot' || b.kind === 'plot3d' || b.kind === 'text' || b.kind === 'contour') {
    const pkey = `${langTag}|${fpOf(b.id)}`;
    const pprev = recalcCache.get(b.id);
    if (pprev && pprev.fp === pkey) {
      out[b.id] = reuseHit(b, pprev);
      return;
    }
    ctx.allHit.v = false;
    cur.error = null;
    cur.dependencies = [];
    cur.definedVar = null;
    cur.isOutput = false;
    cur.displayLatex = b.rawInput;
    cur.visualize = null;
    snapBlock(cur, pkey);
    return;
  }
  if (cyclic.has(b.id)) {
    cur.error = t('e.cyclicDep');
    cur.resultStr = '';
    cur.resultLatex = '';
    cur.resultValue = null;
    cur.displayLatex = '';
    cur.dependencies = [];
    cur.definedVar = null;
    cur.isOutput = false;
    cur.visualize = null;
    return;
  }
  const key = `${langTag}|${fpOf(b.id)}`;
  const prev = recalcCache.get(b.id);
  if (prev && prev.fp === key) {
    out[b.id] = reuseHit(b, prev);
    for (const [k, v] of Object.entries(prev.writes)) scope[k] = v;
    return;
  }
  ctx.allHit.v = false;

  // ---------- слайдер: значение ползунка уходит в scope как переменная ----------
  if (b.kind === 'slider') {
    cur.dependencies = [];
    cur.isOutput = true;
    cur.displayLatex = '';
    const v = (b.sliderVar ?? '').trim();
    const lo = b.sliderMin;
    const hi = b.sliderMax;
    const badVar = !v || !isValidVarName(v) || v === 'i';
    if (badVar) {
      cur.error = t('e.sliderVar');
    } else if (
      typeof lo !== 'number' ||
      typeof hi !== 'number' ||
      !isFinite(lo) ||
      !isFinite(hi) ||
      !(hi > lo)
    ) {
      cur.error = t('e.sliderRange');
    } else {
      cur.error = null;
    }
    if (cur.error) {
      cur.resultStr = '';
      cur.resultLatex = '';
      cur.resultValue = null;
      cur.definedVar = null;
      snapBlock(cur, key);
      return;
    }
    const val =
      typeof b.sliderVal === 'number' && isFinite(b.sliderVal)
        ? Math.min(hi as number, Math.max(lo as number, b.sliderVal))
        : (lo as number);
    cur.definedVar = v;
    cur.resultValue = val;
    cur.resultStr = formatResult(val);
    cur.resultLatex = valueToLatex(val);
    scope[v] = val;
    snapBlock(cur, key);
    return;
  }

  // ---------- программный блок ----------
  if (b.kind === 'program') {
    const analysis = analyzeProgram(b.rawInput);
    resetSolverTrace(scope);
    const r = runProgram(b.rawInput, scope);
    const st = takeSolverTrace(scope);
    cur.solverTrace = st.length ? st : null;
    cur.dependencies = analysis.dependencies;
    cur.isOutput = true;
    cur.programTrace = r.trace ?? null;
    const exp = (b.exportName ?? '').trim();
    cur.definedVar = exp && isValidVarName(exp) ? exp : null;
    if (r.error) {
      cur.error = r.error;
      cur.resultStr = '';
      cur.resultLatex = '';
      cur.resultValue = null;
    } else {
      cur.error = null;
      cur.resultValue = r.value;
      cur.resultStr = formatResult(r.value);
      cur.resultLatex = valueToLatex(r.value);
      if (cur.definedVar) scope[cur.definedVar] = r.value;
    }
    cur.displayLatex = '';
    snapBlock(cur, key);
    return;
  }

  // ---------- симуляция (sync: через runSim) ----------
  if (b.kind === 'sim') {
    const parsed = parseSimInput(b);
    simHead(b, cur);
    if (parsed.error || !parsed.def) {
      simFail(cur, parsed.error);
    } else {
      resetSolverTrace(scope);
      simApply(cur, ctx, runSim(parsed.def, scope));
      const sst = takeSolverTrace(scope);
      cur.solverTrace = sst.length ? sst : null;
    }
    cur.displayLatex = '';
    snapBlock(cur, key);
    return;
  }

  // ---------- обычный мат-блок ----------
  const lines = b.rawInput.split('\n');
  // канал лога решателей на этот блок (общий массив в scope — см. numeric.ts)
  resetSolverTrace(scope);
  // индекс последней содержательной строки: scope ДО неё — для подстановки значений
  let lastIdx = -1;
  lines.forEach((ln, i) => {
    const tt = ln.trim();
    if (tt !== '' && !tt.startsWith('//') && !tt.startsWith('#')) lastIdx = i;
  });
  let scopeBeforeLast: Scope | null = null;
  let lastValue: unknown = null;
  let lastError: string | null = null;
  let lastOk = true;
  const allDeps = new Set<string>();
  let definedVar: string | null = null;
  let lastKind: 'assign' | 'output' | 'eval' = 'eval';
  let lastP: ReturnType<typeof parseLine> | null = null;
  const texParts: string[] = [];
  for (let li = 0; li < lines.length; li++) {
    const line = lines[li];
    const t = line.trim();
    if (t === '' || t.startsWith('//') || t.startsWith('#')) continue;
    if (li === lastIdx) scopeBeforeLast = { ...scope };
    try {
      const p = parseLine(t);
      for (const d of extractDependencies(p.expr, p.fnParams)) allDeps.add(d);
      if (p.kind === 'assign' && p.definedVar) definedVar = p.definedVar;
      lastKind = p.kind;
      lastP = p;
      texParts.push(toLatex(t));
    } catch {
      /* ignore */
    }
    const r = evaluateLine(line, scope);
    if (r.error) {
      lastError = r.error;
      lastValue = null;
      lastOk = false;
    } else if (lastError === null) {
      lastValue = r.value;
      lastOk = true;
    }
  }
  cur.dependencies = [...allDeps];
  cur.definedVar = definedVar;
  // `delta := atan(x) =` — присваивание с показом результата
  cur.isOutput =
    lastKind === 'output' || lastKind === 'eval' || (lastP?.kind === 'assign' && lastP.show);
  cur.displayLatex = texParts.join(' \\\\ ');
  cur.plotPreview = null;
  cur.visualize = detectVisualize(lastP, lastError, definedVar, lastValue);

  // ----- Автографик -----
  // 1) определение функции одной переменной: f(t) := t^2 → превью;
  // 2) последняя строка упала, но читается как функция от x: sin(x) = → превью вместо ошибки;
  // 3) значение — числовой вектор: превью компонент столбиками (source: 'vector').
  let sampledParam: string | null = null;
  if (lastP?.kind === 'assign' && lastP.isFunctionDef && lastP.fnParams.length === 1) {
    const param = lastP.fnParams[0];
    const bodyX = lastP.expr.replace(new RegExp(`\\b${param}\\b`, 'g'), 'x');
    const s = sampleExpression(lastP.expr, scope, {
      varName: param,
      label: `${lastP.definedVar}(${param})`,
    });
    if (s) {
      cur.plotPreview = { ...s, expr: bodyX };
      sampledParam = param;
    }
  } else if (!lastOk && lastError && lastP) {
    const cand = lastP.kind === 'assign' ? lastP.expr.replace(/=+\s*$/, '').trim() : lastP.expr;
    if (cand) {
      const s = sampleExpression(cand, scope, { label: cand });
      if (s) {
        cur.plotPreview = s;
        sampledParam = 'x';
        // выражение осмысленно как график — ошибку не показываем
        lastError = null;
        lastValue = null;
      }
    }
  } else if (lastOk && !lastError && lastP) {
    const cells = toNumberCells(lastValue);
    if (cells && (cells.cols === 1 || cells.rows === 1) && cells.flat.length >= 2) {
      const exprV =
        definedVar ??
        (lastP.kind === 'assign' ? lastP.expr.replace(/=+\s*$/, '').trim() : lastP.expr);
      if (exprV) {
        const [lo, hi] = padRange(Math.min(...cells.flat), Math.max(...cells.flat));
        cur.plotPreview = {
          source: 'vector',
          label: definedVar ?? exprV,
          expr: exprV,
          xs: cells.flat.map((_, k) => k),
          ys: cells.flat,
          xmin: -0.5,
          xmax: cells.flat.length - 0.5,
          ymin: lo,
          ymax: hi,
        };
      }
    }
  }
  if (sampledParam) {
    cur.dependencies = cur.dependencies.filter((d) => d !== sampledParam && d !== 'x');
  }
  // лог решателей блока — ПОСЛЕ автографика: сэмплинг тоже считает в этом scope.
  // Забираем и при ошибке сходимости (диагностика вместо тишины).
  const str = takeSolverTrace(scope);
  cur.solverTrace = str.length ? str : null;

  if (lastError) {
    cur.error = lastError;
    cur.resultStr = '';
    cur.resultLatex = '';
    cur.resultValue = null;
  } else {
    cur.error = null;
    cur.resultValue = lastValue;
    cur.resultStr = formatResult(lastValue);
    cur.resultLatex = valueToLatex(lastValue);
    // подстановка Calcpad-стиля для выводимой последней строки
    // (`F := m*a =` → `2 * 5`); определения функций и молчаливые присваивания пропускаем
    if (cur.isOutput && lastP && !lastP.isFunctionDef && scopeBeforeLast) {
      const sub = buildSubstitution(lastP.expr, scopeBeforeLast, lastP.fnParams ?? [], lastValue);
      if (sub) {
        cur.substStr = sub.text;
        cur.substLatex = sub.latex;
      }
    }
  }
  snapBlock(cur, key);
}

/** Разобрать поля sim-блока в SimDef (общее для sync/async, #6). */
function parseSimInput(b: MathBlockData) {
  return parseSimDef({
    mode: b.simMode ?? 'ode',
    states: b.simStates ?? '',
    derivs: b.simDerivs ?? '',
    aux: b.simAux ?? '',
    params: b.simParams ?? '',
    init: b.simInit ?? '',
    t0: b.simT0 ?? 0,
    t1: b.simT1 ?? 10,
    dt: b.simDt ?? 0.01,
    solver: b.simSolver ?? 'rk4',
    events: b.simEvents ?? '',
    fdtd: {
      n: b.simFdtdN ?? 400,
      length: b.simFdtdL ?? 20,
      steps: b.simFdtdSteps ?? 1500,
      src: b.simFdtdSrc ?? 'gauss',
      freq: b.simFdtdFreq ?? 1,
      amp: b.simFdtdAmp ?? 1,
      srcX: b.simFdtdSrcX ?? 4,
      det: b.simFdtdDet ?? null,
      layers: b.simFdtdLayers ?? '',
    },
  });
}

/** Шапка sim-блока: зависимости, вывод, экспортируемое имя (общее, #6). */
function simHead(b: MathBlockData, cur: MathBlockData): void {
  cur.dependencies = blockDeps(b);
  cur.isOutput = true;
  const exp = (b.simExport ?? '').trim();
  // в FDTD-режиме экспортировать нечего — финального вектора нет
  cur.definedVar = b.simMode === 'fdtd' || !exp || !isValidVarName(exp) ? null : exp;
}

/** Ошибка разбора sim-конфига (общее, #6). */
function simFail(cur: MathBlockData, error: string | null): void {
  cur.error = error;
  cur.simResult = null;
  cur.resultStr = '';
  cur.resultLatex = '';
  cur.resultValue = null;
}

/** Применить результат симуляции к блоку и scope (общее, #6). */
function simApply(cur: MathBlockData, ctx: RecalcCtx, r: SimResult): void {
  cur.simResult = r;
  if (r.error) {
    cur.error = r.error;
    cur.resultStr = '';
    cur.resultLatex = '';
    cur.resultValue = null;
  } else {
    cur.error = null;
    cur.resultValue = r.final;
    cur.resultStr = formatResult(r.final);
    cur.resultLatex = valueToLatex(r.final);
    if (cur.definedVar) ctx.scope[cur.definedVar] = r.final;
  }
}

/** Один sim-блок асинхронно: чанки runSimAsync + прогресс (#6). */
async function computeSimAsync(
  b: MathBlockData,
  ctx: RecalcCtx,
  key: string,
  hooks: RecalcHooks,
): Promise<void> {
  if (ctx.reuseStale(b)) return;
  const cur = ctx.out[b.id];
  cur.solverTrace = null;
  const parsed = parseSimInput(b);
  simHead(b, cur);
  if (parsed.error || !parsed.def) {
    simFail(cur, parsed.error);
  } else {
    resetSolverTrace(ctx.scope);
    const r = await runSimAsync(parsed.def, ctx.scope, {
      shouldCancel: hooks.shouldCancel,
      onProgress: (done, total) => hooks.onSimProgress?.(b.id, done, total),
    });
    simApply(cur, ctx, r);
    const sst = takeSolverTrace(ctx.scope);
    cur.solverTrace = sst.length ? sst : null;
  }
  cur.displayLatex = '';
  ctx.snapBlock(cur, key);
}

/** Sim-блок с промахом кэша? Ключ для async-прогона, null — sync-путь (#6). */
function simMissOf(b: MathBlockData, ctx: RecalcCtx): string | null {
  if (b.kind !== 'sim' || b.disabled || ctx.cyclic.has(b.id)) return null;
  const key = `${ctx.langTag}|${ctx.fpOf(b.id)}`;
  const prev = recalcCache.get(b.id);
  if (prev && prev.fp === key) return null;
  return key;
}

/**
 * Асинхронный пересчёт (#6): тот же результат, что recalculateAll, но чанками
 * с yield между блоками + чанкированный runSimAsync с прогрессом/отменой.
 * Отмена — через hooks.shouldCancel или отмену внутри sim (isSimCancel).
 */
export async function recalculateAllAsync(
  list: MathBlockData[],
  hooks: RecalcHooks = {},
  opts?: RecalcOpts,
): Promise<RecalcAsyncOutcome> {
  const ctx = createRecalcCtx(list, opts);
  const total = ctx.ordered.length;
  try {
    let i = 0;
    let sliceStart = performance.now();
    for (const b of ctx.ordered) {
      if (hooks.shouldCancel?.()) return { cancelled: true };
      const simKey = simMissOf(b, ctx);
      if (simKey !== null) await computeSimAsync(b, ctx, simKey, hooks);
      else computeBlockSync(b, ctx);
      hooks.onBlock?.(++i, total);
      if (performance.now() - sliceStart > 8) {
        await yieldSlice();
        sliceStart = performance.now();
      }
    }
  } catch (e) {
    if (isSimCancel(e)) return { cancelled: true };
    throw e;
  }
  return { cancelled: false, result: finishRecalc(ctx) };
}
