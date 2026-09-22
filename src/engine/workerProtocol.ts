import {
  createBaseScope,
  evaluateLine,
  isValidVarName,
  math,
  parseLine,
  type ComplexFmt,
  type NumFmt,
  type Scope,
  type UnitSys,
} from './mathEngine';
import { sortBlocksTopDown, type MathBlockData } from './dependencies';
import type { Lang } from '../i18n';

/**
 * Протокол пересчёта в Web Worker: сериализация scope/блоков через границу
 * structured clone (mathjs-классы Complex/Unit/Matrix так не ездят).
 *
 * Поток туда: slim-входы (только поля ввода, без derived/resultValue).
 * Поток обратно: готовые блоки (все строки/массивы) + scope снапшот +
 * serValue на блок. Функции и defunit не сериализуемы — их исходники
 * (`f(t) := ...`, `defunit(...)`) собираются сканом и переигрываются
 * на главном потоке (тела ленивые, порядок — сверху-вниз).
 * Модуль без React/DOM: один код в воркере и на клиенте (и в node-тестах).
 */

/* ---------------- сериализованные значения ---------------- */

export interface SerComplex {
  __t: 'c';
  re: number;
  im: number;
}
export interface SerUnit {
  __t: 'u';
  s: string;
}
export interface SerMatrix {
  __t: 'm';
  a: SerNode;
}
export interface SerNonFinite {
  __t: 'n';
  s: string;
}
export type SerVal =
  number | string | boolean | null | SerComplex | SerUnit | SerMatrix | SerNonFinite;
/** Вложенность матриц — обычные массивы (structured clone их умеет). */
export type SerNode = SerVal | SerNode[];

/** Защита от pathological-вложенности/размера. */
const SER_MAX_DEPTH = 8;
const SER_MAX_CELLS = 500000;
const SER_MAX_STRING = 10000;

/** Значение scope → JSON-безопасное. undefined = пропустить ключ. */
export function serializeScopeValue(v: unknown, depth = 0): SerVal | undefined {
  if (v === undefined || typeof v === 'function') return undefined;
  if (v === null) return null;
  if (typeof v === 'number') {
    if (!isFinite(v)) return { __t: 'n', s: String(v) };
    return v;
  }
  if (typeof v === 'string') return v.length > SER_MAX_STRING ? undefined : v;
  if (typeof v === 'boolean') return v;
  if (depth > SER_MAX_DEPTH) return undefined;
  if (typeof v === 'object') {
    if (math.isComplex(v)) {
      const c = v as { re: number; im: number };
      return { __t: 'c', re: c.re, im: c.im };
    }
    if (math.isUnit(v)) {
      try {
        return { __t: 'u', s: (v as { toString: () => string }).toString() };
      } catch {
        return undefined;
      }
    }
    const plain = v as { re?: unknown; im?: unknown };
    if (typeof plain.re === 'number' && typeof plain.im === 'number') {
      return { __t: 'c', re: plain.re, im: plain.im };
    }
    let arr: unknown = null;
    if (math.isMatrix(v)) {
      try {
        arr = (v as { toArray: () => unknown }).toArray();
      } catch {
        return undefined;
      }
    } else if (Array.isArray(v)) {
      arr = v;
    }
    if (arr !== null) {
      const node = serializeNode(arr, depth, { cells: 0 });
      return node === undefined ? undefined : { __t: 'm', a: node };
    }
  }
  return undefined;
}

function serializeNode(v: unknown, depth: number, budget: { cells: number }): SerNode | undefined {
  if (Array.isArray(v)) {
    const out: SerNode[] = [];
    for (const el of v) {
      if (budget.cells > SER_MAX_CELLS) return undefined;
      const s = Array.isArray(el)
        ? serializeNode(el, depth + 1, budget)
        : serializeScopeValue(el, depth + 1);
      if (s === undefined) return undefined;
      budget.cells++;
      out.push(s);
    }
    return out;
  }
  return serializeScopeValue(v, depth);
}

/** JSON-безопасное → живое значение в realm'е вызывающего (свой math-инстанс). */
export function deserializeScopeValue(s: SerNode): unknown {
  if (s === null || s === undefined) return s ?? null;
  if (Array.isArray(s)) return s.map(deserializeScopeValue);
  if (typeof s === 'number' || typeof s === 'string' || typeof s === 'boolean') return s;
  if (typeof s === 'object') {
    const t = (s as { __t?: string }).__t;
    if (t === 'c') {
      const c = s as SerComplex;
      return math.complex(c.re, c.im);
    }
    if (t === 'u') {
      try {
        return math.unit((s as SerUnit).s);
      } catch {
        return undefined;
      }
    }
    if (t === 'm') {
      try {
        return math.matrix(deserializeNode((s as SerMatrix).a) as never);
      } catch {
        return undefined;
      }
    }
    if (t === 'n') {
      const n = Number((s as SerNonFinite).s);
      return n;
    }
  }
  return undefined;
}

function deserializeNode(s: SerNode): unknown {
  if (Array.isArray(s)) return s.map(deserializeNode);
  return deserializeScopeValue(s);
}

/* ---------------- slim-вход (только поля ввода) ---------------- */

const SLIM_KEYS = [
  'id',
  'x',
  'y',
  'rawInput',
  'kind',
  'disabled',
  'w',
  'h',
  'sliderVar',
  'sliderMin',
  'sliderMax',
  'sliderStep',
  'sliderVal',
  'plotFn',
  'plotXmin',
  'plotXmax',
  'plotProj',
  'plotTrace',
  'plotErr',
  'plotLogx',
  'plotXUnit',
  'plotYUnit',
  'plotTitle',
  'plotXLabel',
  'plotYLabel',
  'plotGrid',
  'plotLegend',
  'plotYmin',
  'plotYmax',
  'plotMode',
  'plotResolution',
  'plotWireframe',
  'exportName',
  'simMode',
  'simModel',
  'simStates',
  'simDerivs',
  'simAux',
  'simParams',
  'simInit',
  'simT0',
  'simT1',
  'simDt',
  'simSolver',
  'simEvents',
  'simX',
  'simY',
  'simFdtdN',
  'simFdtdL',
  'simFdtdSteps',
  'simFdtdSrc',
  'simFdtdFreq',
  'simFdtdAmp',
  'simFdtdSrcX',
  'simFdtdDet',
  'simFdtdLayers',
  'simExport',
  'simSpeed',
  'simLoop',
] as const;

export type SlimBlock = Pick<MathBlockData, (typeof SLIM_KEYS)[number]>;

/** Выкинуть derived (resultValue с классами mathjs!) и превью — в worker едет только ввод. */
export function slimWorkerInput(b: MathBlockData): SlimBlock {
  const src = b as unknown as Record<string, unknown>;
  const o: Record<string, unknown> = {};
  for (const k of SLIM_KEYS) {
    const v = src[k];
    if (v !== undefined) o[k] = v;
  }
  return o as SlimBlock;
}

/* ---------------- def-строки для пересборки scope ---------------- */

/**
 * Исходники непередаваемого: определения функций и defunit, сверху-вниз.
 * Отключённые блоки пропускаем (движок их имён не видит).
 */
export function collectDefLines(blocks: MathBlockData[]): string[] {
  const out: string[] = [];
  for (const b of sortBlocksTopDown(blocks)) {
    if (b.kind !== 'math' || b.disabled) continue;
    for (const line of b.rawInput.split('\n')) {
      const t = line.trim();
      if (!t || t.startsWith('//') || t.startsWith('#')) continue;
      let p;
      try {
        p = parseLine(t);
      } catch {
        continue;
      }
      if (p.isFunctionDef) out.push(t);
      else if (/^defunit\s*\(/i.test(t)) out.push(t);
    }
  }
  return out;
}

/**
 * Пересобрать живой scope главного потока: база + def-строки
 * (custom units раньше скаляров — revive Unit их требует; тела функций ленивые).
 */
export function rebuildMainScope(ser: Record<string, SerVal | null>, defLines: string[]): Scope {
  const base = createBaseScope();
  for (const line of defLines) {
    try {
      evaluateLine(line, base);
    } catch {
      /* битая строка в воркере тоже не посчиталась — пропускаем */
    }
  }
  for (const [k, v] of Object.entries(ser)) {
    if (v === null || v === undefined) continue;
    if (!isValidVarName(k)) continue;
    try {
      const rv = deserializeScopeValue(v);
      if (rv !== undefined) base[k] = rv;
    } catch {
      /* экзотика — пропускаем ключ */
    }
  }
  return base;
}

/* ---------------- сообщения воркера ---------------- */

export interface WorkerReq {
  jobId: number;
  lang: Lang;
  /** Формат чисел (опционально — по умолчанию auto/legacy). */
  fmt?: NumFmt;
  /** Система единиц отображения (опционально — по умолчанию none). */
  unitSys?: UnitSys;
  /** Вид комплексных (опционально — по умолчанию rect). */
  complexFmt?: ComplexFmt;
  blocks: SlimBlock[];
  /** Calculate Now: только эти + upstream (пусто/нет = полный пересчёт) */
  only?: string[];
}

/** Блок назад: всё кроме resultValue (классы!) + serValue. */
export type WorkerOutBlock = Omit<MathBlockData, 'resultValue'> & {
  serValue: SerVal | null;
};

export type WorkerMsgToMain =
  | {
      type: 'progress';
      jobId: number;
      done: number;
      total: number;
      simId: string | null;
      simDone: number;
      simTotal: number | null;
    }
  | {
      type: 'result';
      jobId: number;
      ok: true;
      blocks: WorkerOutBlock[];
      scope: Record<string, SerVal | null>;
      changed: boolean;
      calcMs: number;
      staleIds: string[];
    }
  | { type: 'result'; jobId: number; ok: false; error: string };
