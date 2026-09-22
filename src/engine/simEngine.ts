/**
 * Движок симуляций NyaMath: численное интегрирование систем ОДУ
 * (Эйлер / RK4 / адаптивный Дорман–Принс RK45) + реестр готовых моделей
 * по разделам физики (механика, цепи, колебания, термо, оптика, хаос,
 * ядерная, молекулярная, астрофизика).
 *
 * Выражения производных/параметров/начальных условий — обычный синтаксис
 * mathEngine (mathjs): видят все переменные документа выше блока,
 * плюс `t` (независимая переменная) и имена состояний. Вспомогательные
 * выражения `aux` пересчитываются на каждом шаге (напр. r := sqrt(x^2+y^2)).
 */
import { math, compileRawExpr, preprocessJ, preprocessRanges } from './mathEngine';
import type { EvalFunction } from 'mathjs';
import type { Scope } from './packs';
import { solveLinear } from './numeric';
import { t, type LText } from '../i18n';
import { getSimModelDb as dbGetSimModel, listSimModels as dbListSimModels } from '../lib/db';

export type SimSolver = 'euler' | 'rk4' | 'rk45' | 'trbdf2';

export const SIM_SOLVERS: SimSolver[] = ['euler', 'rk4', 'rk45', 'trbdf2'];

export type SimMode = 'ode' | 'fdtd';

/** Ограничения: честность вместо молчаливой деградации. */
const MAX_FIXED_STEPS = 200000;
const MAX_PTS = 20000;
const MAX_ITERS = 2000000;
const MAX_FDTD_CELLS = 1000;
const MAX_FDTD_STEPS = 8000;
const MAX_FDTD_SNAPS = 800;

export interface SimEventAction {
  name: string;
  expr: string;
  stop: boolean;
}

export interface SimEvent {
  cond: string;
  actions: SimEventAction[];
}

export interface SimFdtdLayer {
  x0: string;
  x1: string;
  eps: string;
}

export interface SimFdtd {
  n: number;
  length: number;
  steps: number;
  src: 'gauss' | 'sine';
  freq: number;
  amp: number;
  srcX: number;
  det: number;
  layers: SimFdtdLayer[];
}

export interface SimDef {
  mode: SimMode;
  states: string[];
  derivs: string[];
  aux: { name: string; expr: string }[];
  params: { name: string; expr: string }[];
  init: string[];
  t0: number;
  t1: number;
  dt: number;
  solver: SimSolver;
  events: SimEvent[];
  fdtd: SimFdtd | null;
}

export interface SimSeries {
  name: string;
  ys: number[];
}

export interface SimField {
  xs: number[];
  snaps: number[][];
  ts: number[];
}

export interface SimResult {
  ts: number[];
  series: SimSeries[];
  /** значение состояний в конце (для экспорта в документ) */
  final: number[];
  steps: number;
  error: string | null;
  /** сработавшие события (время) + останов событием */
  events: { t: number }[];
  halted: boolean;
  /** FDTD: поле E(x) по кадрам + оценка прохождения */
  field: SimField | null;
  tEst: number | null;
}

const VAR_RE = /^[A-Za-z_]\w*$/;

/** Разобрать текстовые поля sim-блока в SimDef (проверки, без вычисления). */
export function parseSimDef(raw: {
  mode?: SimMode;
  states: string;
  derivs: string;
  aux?: string;
  params?: string;
  init: string;
  t0: number;
  t1: number;
  dt: number;
  solver: SimSolver;
  events?: string;
  fdtd?: {
    n: number;
    length: number;
    steps: number;
    src: string;
    freq: number;
    amp: number;
    srcX: number;
    det: number | null;
    layers: string;
  };
}): { def: SimDef | null; error: string | null } {
  const mode: SimMode = raw.mode === 'fdtd' ? 'fdtd' : 'ode';
  if (mode === 'fdtd') return parseFdtdDef(raw);
  const states = raw.states
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (!states.length) return { def: null, error: t('e.simNoStates') };
  for (const s of states) {
    if (!VAR_RE.test(s) || s === 't') return { def: null, error: t('e.simBadState', { name: s }) };
  }
  if (new Set(states).size !== states.length) return { def: null, error: t('e.simDupState') };
  const derivsClean = raw.derivs
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s !== '');
  if (derivsClean.length !== states.length) {
    return { def: null, error: t('e.simCount', { n: states.length, m: derivsClean.length }) };
  }
  const init = raw.init.split(',').map((s) => s.trim());
  if (init.length !== states.length || init.some((s) => s === '')) {
    return { def: null, error: t('e.simInitCount', { n: states.length }) };
  }
  const parseAssign = (text: string): { name: string; expr: string }[] | null => {
    const out: { name: string; expr: string }[] = [];
    for (const line of text.split('\n')) {
      const l = line.trim();
      if (!l || l.startsWith('//') || l.startsWith('#')) continue;
      const m = l.match(/^([A-Za-z_]\w*)\s*(:=|=)\s*(.+)$/);
      if (!m) return null;
      out.push({ name: m[1], expr: m[3].trim() });
    }
    return out;
  };
  const aux = parseAssign(raw.aux ?? '');
  if (!aux) return { def: null, error: t('e.simBadAux') };
  const params = parseAssign(raw.params ?? '');
  if (!params) return { def: null, error: t('e.simBadParams') };
  for (const a of [...aux, ...params]) {
    if (states.includes(a.name) || a.name === 't')
      return { def: null, error: t('e.simShadow', { name: a.name }) };
  }
  const { t0, t1, dt } = raw;
  if (![t0, t1, dt].every((v) => typeof v === 'number' && isFinite(v))) {
    return { def: null, error: t('e.simBadSpan') };
  }
  if (!(t1 > t0)) return { def: null, error: t('e.simSpanOrder') };
  if (!(dt > 0)) return { def: null, error: t('e.simBadDt') };
  if (!SIM_SOLVERS.includes(raw.solver)) return { def: null, error: t('e.simBadSolver') };
  const events = parseSimEvents(raw.events ?? '', states);
  if (!events) return { def: null, error: t('e.simBadEvents') };
  if (!events) return { def: null, error: t('e.simBadEvents') };
  return {
    def: {
      mode: 'ode',
      states,
      derivs: derivsClean,
      aux,
      params,
      init,
      t0,
      t1,
      dt,
      solver: raw.solver,
      events,
      fdtd: null,
    },
    error: null,
  };
}

/**
 * События: строки «условие => действие; действие», действие — «имя := expr» или «stop».
 * Срабатывание по фронту false→true. Цели присваиваний — только состояния.
 */
function parseSimEvents(text: string, states: string[]): SimEvent[] | null {
  const out: SimEvent[] = [];
  for (const line of text.split('\n')) {
    const l = line.trim();
    if (!l || l.startsWith('//') || l.startsWith('#')) continue;
    const arrow = l.indexOf('=>');
    if (arrow < 0) return null;
    const cond = l.slice(0, arrow).trim();
    const actions: SimEventAction[] = [];
    for (const part of l.slice(arrow + 2).split(';')) {
      const a = part.trim();
      if (!a) continue;
      if (/^stop$/i.test(a)) {
        actions.push({ name: '', expr: '', stop: true });
        continue;
      }
      const m = a.match(/^([A-Za-z_]\w*)\s*(:=|=)\s*(.+)$/);
      if (!m || !states.includes(m[1])) return null;
      actions.push({ name: m[1], expr: m[3].trim(), stop: false });
    }
    if (!cond || !actions.length) return null;
    out.push({ cond, actions });
  }
  return out;
}

/** Разбор FDTD-конфигурации (числа уже проверены как числа; слои — выражениями). */
function parseFdtdDef(raw: Parameters<typeof parseSimDef>[0]): {
  def: SimDef | null;
  error: string | null;
} {
  const f = raw.fdtd;
  const num = (v: unknown): number | null => (typeof v === 'number' && isFinite(v) ? v : null);
  const n = num(f?.n);
  const length = num(f?.length);
  const steps = num(f?.steps);
  const freq = num(f?.freq);
  const amp = num(f?.amp);
  const srcX = num(f?.srcX);
  const det = f?.det == null ? null : num(f.det);
  if (n === null || !Number.isInteger(n) || n < 50 || n > MAX_FDTD_CELLS) {
    return { def: null, error: t('e.simFdtdCells', { max: MAX_FDTD_CELLS }) };
  }
  if (length === null || !(length > 0))
    return { def: null, error: t('e.simFdtdNum', { name: 'length' }) };
  if (steps === null || !Number.isInteger(steps) || steps < 100 || steps > MAX_FDTD_STEPS) {
    return { def: null, error: t('e.simFdtdSteps', { max: MAX_FDTD_STEPS }) };
  }
  const src = f?.src === 'sine' ? 'sine' : 'gauss';
  if (src === 'sine' && (freq === null || !(freq > 0)))
    return { def: null, error: t('e.simFdtdNum', { name: 'freq' }) };
  if (amp === null || amp === 0) return { def: null, error: t('e.simFdtdNum', { name: 'amp' }) };
  if (srcX === null || srcX < 0 || srcX > length)
    return { def: null, error: t('e.simFdtdRange', { name: 'srcX' }) };
  const detV = det ?? 0.85 * length;
  if (!(detV >= 0 && detV <= length))
    return { def: null, error: t('e.simFdtdRange', { name: 'det' }) };
  const layers: SimFdtdLayer[] = [];
  for (const line of (f?.layers ?? '').split('\n')) {
    const l = line.trim();
    if (!l || l.startsWith('//') || l.startsWith('#')) continue;
    const parts = l.split(',').map((s) => s.trim());
    if (parts.length !== 3 || parts.some((p) => !p))
      return { def: null, error: t('e.simFdtdLayers') };
    layers.push({ x0: parts[0], x1: parts[1], eps: parts[2] });
  }
  return {
    def: {
      mode: 'fdtd',
      states: [],
      derivs: [],
      aux: [],
      params: [],
      init: [],
      t0: 0,
      t1: 0,
      dt: 0,
      solver: 'rk4',
      events: [],
      fdtd: { n, length, steps, src, freq: freq ?? 1, amp, srcX, det: detV, layers },
    },
    error: null,
  };
}

/** Строгое число из значения mathjs (комплексные/матрицы — не число). */
function toNum(v: unknown): number | null {
  if (typeof v === 'number' && isFinite(v)) return v;
  return null;
}

/**
 * Однократная компиляция выражения симуляции (derivs/aux/params/init/события).
 * Медленный путь math.evaluate остаётся только для экзотики (присваивания
 * внутри выражений): семантика не меняется, быстрый путь — для всего остального.
 */
function reqCode(expr: string): EvalFunction | null {
  return compileRawExpr(expr);
}

/** Вычислить скомпилированное выражение в scratch-scope; строго число. */
function evalCodeNum(code: EvalFunction | null, expr: string, s: Scope): number {
  let v: unknown;
  try {
    v = code
      ? code.evaluate(s)
      : math.evaluate(preprocessRanges(preprocessJ(expr, false)), { ...s });
  } catch {
    throw { msg: t('e.simEval', { expr: expr.slice(0, 60) }) };
  }
  const n = toNum(v);
  if (n === null) throw { msg: t('e.simNotNum', { expr: expr.slice(0, 60) }) };
  return n;
}

/** Вычислить скомпилированное выражение; произвольное значение (условия событий). */
function evalCodeAny(code: EvalFunction | null, expr: string, s: Scope): unknown {
  try {
    return code
      ? code.evaluate(s)
      : math.evaluate(preprocessRanges(preprocessJ(expr, false)), { ...s });
  } catch {
    throw { msg: t('e.simEval', { expr: expr.slice(0, 60) }) };
  }
}

function evalExpr(expr: string, scope: Scope): number {
  return evalCodeNum(reqCode(expr), expr, scope);
}

/**
 * Проинтегрировать систему. docScope — переменные документа (только чтение).
 * Возвращает траекторию или ошибку (без исключений наружу).
 */
export function runSim(def: SimDef, docScope: Scope): SimResult {
  if (def.mode === 'fdtd' && def.fdtd) return runFdtd(def.fdtd, docScope);
  return runOde(def, docScope);
}

/** Логика условия события: boolean/число/комплексное, иначе — ошибка. */
function eventTruthy(code: EvalFunction | null, expr: string, s: Scope): boolean {
  const v: unknown = evalCodeAny(code, expr, s);
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number' && isFinite(v)) return v !== 0;
  if (v !== null && typeof v === 'object' && 're' in v && 'im' in v) {
    const c = v as { re: number; im: number };
    return c.re !== 0 || c.im !== 0;
  }
  throw { msg: t('e.simEventCond', { expr: expr.slice(0, 60) }) };
}

/* ---------- плоский аккумулятор траектории (#5) ----------
 * Вместо `traj: number[][]` с push/slice на каждом шаге пишем строки в
 * предвыделенный Float64Array (row-major). Для фиксированного шага ёмкость
 * точная (total+1), для rk45 — рост ×2 с тем же лимитом MAX_PTS*4, что и раньше.
 * Порядок арифметики не меняем — результаты бит-идентичны старым.
 */
const RK45_MAX_PTS = MAX_PTS * 4;

class TrajBuf {
  ts: Float64Array;
  data: Float64Array;
  readonly n: number;
  len = 0;
  constructor(n: number, capRows: number) {
    const cap = Math.max(1, capRows);
    this.n = Math.max(1, n);
    this.ts = new Float64Array(cap);
    this.data = new Float64Array(cap * this.n);
  }
  push(t: number, y: ArrayLike<number>): void {
    if (this.len >= this.ts.length) this.grow();
    this.ts[this.len] = t;
    const off = this.len * this.n;
    for (let i = 0; i < this.n; i++) this.data[off + i] = y[i] ?? NaN;
    this.len++;
  }
  /** Перезаписать последнюю строку (событие мутировало y после записи). */
  setLast(y: ArrayLike<number>): void {
    const off = (this.len - 1) * this.n;
    for (let i = 0; i < this.n; i++) this.data[off + i] = y[i] ?? NaN;
  }
  row(k: number, out: number[]): void {
    const off = k * this.n;
    for (let i = 0; i < this.n; i++) out[i] = this.data[off + i];
  }
  /** Точная ёмкость для фиксированного шага (total известен заранее). */
  reserve(rows: number): void {
    if (rows <= this.ts.length) return;
    const nts = new Float64Array(rows);
    nts.set(this.ts.subarray(0, this.len));
    const ndata = new Float64Array(rows * this.n);
    ndata.set(this.data.subarray(0, this.len * this.n));
    this.ts = nts;
    this.data = ndata;
  }
  private grow(): void {
    // тот же лимит, что раньше: ts.length > MAX_PTS*4 → e.simPts
    if (this.len > RK45_MAX_PTS) throw { msg: t('e.simPts', { max: MAX_PTS }) };
    const ncap = Math.min(this.ts.length * 2, RK45_MAX_PTS + 1);
    const nts = new Float64Array(ncap);
    nts.set(this.ts.subarray(0, this.len));
    const ndata = new Float64Array(ncap * this.n);
    ndata.set(this.data.subarray(0, this.len * this.n));
    this.ts = nts;
    this.data = ndata;
  }
}

/** Правая часть ОДУ с записью в переиспользуемый буфер (без аллокаций). */
type RhsInto = (tt: number, y: ArrayLike<number>, out: number[]) => void;

/* ---------- кооперативная асинхронность (#6) ----------
 * Тяжёлая симуляция фризила главный поток на секунды. Вместо Worker
 * (scope содержит несериализуемые замыкания функций + getLastScope живёт
 * в main-потоке) — возобновляемые раннеры: тот же численный код работает
 * чанками с yield между ними. Sync-путь (тесты/MCP/стор) — тот же код,
 * чанком бесконечного размера, поведение бит-идентично.
 */
export interface SimHooks {
  /** done шагов/итераций из total (null — total неизвестен, rk45) */
  onProgress?: (done: number, total: number | null) => void;
  shouldCancel?: () => boolean;
}

/** Маркер отмены кооперативного прогона. */
export function isSimCancel(e: unknown): boolean {
  return !!e && typeof e === 'object' && (e as { cancel?: unknown }).cancel === true;
}

function throwIfCancel(hooks?: SimHooks): void {
  if (hooks?.shouldCancel?.()) throw { cancel: true };
}

/** Уступить event loop между чанками (#6): MessageChannel (~десятки мкс),
 * fallback — setTimeout (мс). queueMicrotask не подходит: не даёт отрисовки. */
export function yieldSlice(): Promise<void> {
  return new Promise<void>((resolve) => {
    try {
      const MC = globalThis.MessageChannel;
      if (typeof MC === 'function') {
        const ch = new MC();
        ch.port1.onmessage = () => {
          ch.port1.close();
          resolve();
        };
        ch.port2.postMessage(0);
        return;
      }
    } catch {
      /* ниже fallback */
    }
    setTimeout(resolve, 0);
  });
}

interface CompiledExpr {
  code: EvalFunction | null;
  expr: string;
}

interface OdeRun {
  def: SimDef;
  n: number;
  s: Scope;
  cAux: { name: string; code: EvalFunction | null; expr: string }[];
  cDerivs: CompiledExpr[];
  cEvents: { cond: CompiledExpr; actions: (SimEventAction & { code: EvalFunction | null })[] }[];
  traj: TrajBuf;
  fired: { t: number }[];
  prev: boolean[];
  y0: number[];
  pool: OdePool;
  refresh: (tt: number, y: ArrayLike<number>) => void;
  rhsInto: RhsInto;
  fireEvents: (tt: number, y: number[]) => boolean;
  checkFinite: (y: number[], t: number) => void;
  halted: boolean;
  // fixed-режим:
  total: number;
  h: number;
  y: number[];
  yNext: number[];
  tt: number;
  k: number;
  // rk45-режим:
  rkh: number;
  rkIters: number;
  ks: number[][];
  yt: number[];
  y5: number[];
  y4: number[];
}

/** Подготовка прогона: компиляция, scratch-scope, начальные фронты событий. */
function beginOde(def: SimDef, docScope: Scope): { fail: SimResult } | { run: OdeRun } {
  const failOf = (error: string): SimResult => ({
    ts: [],
    series: [],
    final: [],
    steps: 0,
    error,
    events: [],
    halted: false,
    field: null,
    tEst: null,
  });
  try {
    // Прекомпиляция всех выражений (#1): дальше только code.evaluate(scratch).
    const cParams = def.params.map((p) => ({ name: p.name, code: reqCode(p.expr), expr: p.expr }));
    const cInit = def.init.map((e) => ({ code: reqCode(e), expr: e }));
    const cAux = def.aux.map((a) => ({ name: a.name, code: reqCode(a.expr), expr: a.expr }));
    const cDerivs = def.derivs.map((d) => ({ code: reqCode(d), expr: d }));
    const cEvents = def.events.map((ev) => ({
      cond: { code: reqCode(ev.cond), expr: ev.cond },
      actions: ev.actions.map((a): SimEventAction & { code: EvalFunction | null } =>
        a.stop ? { ...a, code: null } : { ...a, code: reqCode(a.expr) },
      ),
    }));
    // Один мутабельный scratch-scope на весь прогон (#3): вместо
    // `{...base, t, ...states}` на каждый шаг пишем поля в тот же объект.
    const s: Scope = { ...docScope };
    for (const p of cParams) s[p.name] = evalCodeNum(p.code, p.expr, s);
    const y0 = cInit.map((e) => evalCodeNum(e.code, e.expr, s));
    const n = def.states.length;

    /** Обновить t/состояния/aux в scratch-scope (общее для rhs и событий). */
    const refresh = (tt: number, y: ArrayLike<number>): void => {
      s.t = tt;
      for (let i = 0; i < n; i++) s[def.states[i]] = y[i];
      for (const a of cAux) s[a.name] = evalCodeNum(a.code, a.expr, s);
    };

    const rhsInto: RhsInto = (tt, y, out) => {
      refresh(tt, y);
      for (let k = 0; k < n; k++) out[k] = evalCodeNum(cDerivs[k].code, cDerivs[k].expr, s);
    };

    const traj = new TrajBuf(n, def.solver === 'rk45' ? 1024 : 1);
    traj.push(def.t0, y0);
    const fired: { t: number }[] = [];
    // фронты: начальные значения условий (без срабатывания на старте)
    refresh(def.t0, y0);
    const prev = cEvents.map((ev) => eventTruthy(ev.cond.code, ev.cond.expr, s));

    /** Проверить события после шага; true = останов. Мутирует y на месте. */
    const fireEvents = (tt: number, y: number[]): boolean => {
      refresh(tt, y);
      for (let e = 0; e < cEvents.length; e++) {
        const ev = cEvents[e];
        const now = eventTruthy(ev.cond.code, ev.cond.expr, s);
        if (now && !prev[e]) {
          fired.push({ t: tt });
          let stop = false;
          for (const a of ev.actions) {
            if (a.stop) {
              stop = true;
              continue;
            }
            const idx = def.states.indexOf(a.name);
            const v = evalCodeNum(a.code, a.expr, s);
            y[idx] = v;
            s[a.name] = v;
          }
          if (stop) return true;
        }
        prev[e] = now;
      }
      return false;
    };

    const checkFinite = (y: number[], tt: number) => {
      for (let i = 0; i < n; i++) {
        if (!isFinite(y[i])) throw { msg: t('e.simNan', { state: def.states[i], t: fmtT(tt) }) };
      }
    };
    checkFinite(y0, def.t0);

    // Пул переиспользуемых векторов (#5): стадии и временные — без аллокаций на шаг.
    const mkVec = (): number[] => new Array<number>(n).fill(0);
    const pool = {
      k1: mkVec(),
      k2: mkVec(),
      k3: mkVec(),
      k4: mkVec(),
      yt: mkVec(),
      fy: mkVec(),
      fz: mkVec(),
    };

    const run: OdeRun = {
      def,
      n,
      s,
      cAux,
      cDerivs,
      cEvents,
      traj,
      fired,
      prev,
      y0,
      pool,
      refresh,
      rhsInto,
      fireEvents,
      checkFinite,
      halted: false,
      total: 0,
      h: 0,
      y: y0.slice(),
      yNext: mkVec(),
      tt: def.t0,
      k: 0,
      rkh: 0,
      rkIters: 0,
      ks: Array.from({ length: 7 }, () => new Array<number>(n).fill(0)),
      yt: mkVec(),
      y5: mkVec(),
      y4: mkVec(),
    };
    if (def.solver === 'rk45') {
      run.rkh = Math.min(def.dt, (def.t1 - def.t0) / 1000);
    } else {
      const total = Math.ceil((def.t1 - def.t0) / def.dt);
      if (total > MAX_FIXED_STEPS) throw { msg: t('e.simSteps', { max: MAX_FIXED_STEPS }) };
      run.total = total;
      run.h = (def.t1 - def.t0) / total;
      traj.reserve(total + 1);
    }
    return { run };
  } catch (e) {
    const ce = e as { msg?: string };
    return { fail: failOf(typeof ce?.msg === 'string' ? ce.msg : t('e.lineErrDefault')) };
  }
}

/** Чанк fixed-режима (euler/rk4/trbdf2): до budget шагов или sliceMs — что раньше.
 * Проверка часов раз в 256 шагов (~десятки нс амортизированно). true = готов/останов. */
function odeFixedChunk(run: OdeRun, budget: number, sliceMs = Infinity, t0 = 0): boolean {
  const { def, pool } = run;
  let done = 0;
  while (run.k < run.total) {
    if (done >= budget) return false;
    if (def.solver === 'trbdf2') stepTRBDF2(run.rhsInto, run.tt, run.y, run.h, run.yNext, pool);
    else if (def.solver === 'euler')
      stepEuler(run.rhsInto, run.tt, run.y, run.h, run.yNext, pool.k1);
    else stepRK4(run.rhsInto, run.tt, run.y, run.h, run.yNext, pool);
    run.tt = run.k === run.total - 1 ? def.t1 : run.tt + run.h;
    run.checkFinite(run.yNext, run.tt);
    run.traj.push(run.tt, run.yNext);
    if (def.events.length && run.fireEvents(run.tt, run.yNext)) {
      run.halted = true;
      run.traj.setLast(run.yNext);
      return true;
    }
    const tmp = run.y;
    run.y = run.yNext;
    run.yNext = tmp;
    run.k++;
    done++;
    if ((done & 255) === 0 && performance.now() - t0 > sliceMs) return false;
  }
  return true;
}

/** Финал ODE: прореживание + серии + SimResult (общее для sync/async). */
function odeFinish(run: OdeRun): SimResult {
  const { def, n, traj, fired } = run;
  const steps = traj.len - 1;
  // Прореживание для отображения/анимации (интеграция уже точная)
  const stride = Math.max(1, Math.ceil(traj.len / MAX_PTS));
  const rts: number[] = [];
  const rtraj: number[][] = [];
  const rowTmp = new Array<number>(n);
  for (let k = 0; k < traj.len; k += stride) {
    rts.push(traj.ts[k]);
    traj.row(k, rowTmp);
    rtraj.push(rowTmp.slice());
  }
  if (rts[rts.length - 1] !== traj.ts[traj.len - 1]) {
    rts.push(traj.ts[traj.len - 1]);
    traj.row(traj.len - 1, rowTmp);
    rtraj.push(rowTmp.slice());
  }
  const series: SimSeries[] = def.states.map((name, i) => ({
    name,
    ys: rtraj.map((row) => row[i]),
  }));
  traj.row(traj.len - 1, rowTmp);
  const last = rowTmp.slice();
  return {
    ts: rts,
    series,
    final: last,
    steps,
    error: null,
    events: fired,
    halted: run.halted,
    field: null,
    tEst: null,
  };
}

function runOde(def: SimDef, docScope: Scope): SimResult {
  const fail = (error: string): SimResult => ({
    ts: [],
    series: [],
    final: [],
    steps: 0,
    error,
    events: [],
    halted: false,
    field: null,
    tEst: null,
  });
  const started = beginOde(def, docScope);
  if ('fail' in started) return started.fail;
  const run = started.run;
  try {
    if (def.solver === 'rk45') {
      while (!odeRk45Chunk(run, Infinity));
    } else {
      while (!odeFixedChunk(run, Infinity));
    }
  } catch (e) {
    const ce = e as { msg?: string };
    return fail(typeof ce?.msg === 'string' ? ce.msg : t('e.lineErrDefault'));
  }
  return odeFinish(run);
}

/** Асинхронный прогон ODE чанками с прогрессом/отменой (#6). */
export async function runOdeAsync(
  def: SimDef,
  docScope: Scope,
  hooks: SimHooks = {},
): Promise<SimResult> {
  const started = beginOde(def, docScope);
  if ('fail' in started) return started.fail;
  const run = started.run;
  const adaptive = def.solver === 'rk45';
  try {
    for (;;) {
      throwIfCancel(hooks);
      // time-бокс ~8мс: чанки сами останавливаются, прогресс — после каждого
      const t0 = performance.now();
      const done = adaptive
        ? odeRk45Chunk(run, Infinity, 8, t0)
        : odeFixedChunk(run, Infinity, 8, t0);
      if (adaptive) hooks.onProgress?.(run.traj.len, null);
      else hooks.onProgress?.(run.k, run.total);
      if (done) break;
      await yieldSlice();
    }
  } catch (e) {
    if (isSimCancel(e)) throw e;
    const ce = e as { msg?: string };
    const fail = (error: string): SimResult => ({
      ts: [],
      series: [],
      final: [],
      steps: 0,
      error,
      events: [],
      halted: false,
      field: null,
      tEst: null,
    });
    return fail(typeof ce?.msg === 'string' ? ce.msg : t('e.lineErrDefault'));
  }
  return odeFinish(run);
}

/**
 * 1D FDTD для уравнений Максвелла (Ey, Hz), нормировка c = 1.
 * Слоистая среда eps(x), источник (гауссов импульс / синус), Mur-ABC по краям.
 * Возвращает кадры поля E(x) + оценку прохождения T по детектору.
 */
interface FdtdRun {
  f: SimFdtd;
  N: number;
  dx: number;
  dt: number;
  steps: number;
  eps: number[];
  E: number[];
  H: number[];
  Eprev: number[];
  mur: number;
  is: number;
  id: number;
  iInc: number;
  iIncH: number;
  idH: number;
  tRefl: number;
  tArr: number;
  srcAt: (tt: number) => number;
  stride: number;
  snaps: number[][];
  sts: number[];
  incFlux: number;
  detFlux: number;
  tt: number;
  k: number;
}

/** Подготовка FDTD: сетка, слои, источник (ошибки слоёв — сразу fail). */
function beginFdtd(f: SimFdtd, docScope: Scope): { fail: SimResult } | { run: FdtdRun } {
  const failOf = (error: string): SimResult => ({
    ts: [],
    series: [],
    final: [],
    steps: 0,
    error,
    events: [],
    halted: false,
    field: null,
    tEst: null,
  });
  try {
    const N = f.n;
    const L = f.length;
    const dx = L / N;
    const dt = 0.5 * dx; // CFL = 0.5
    const steps = f.steps;
    const eps = new Array<number>(N + 1).fill(1);
    for (const lay of f.layers) {
      const x0 = evalExpr(lay.x0, { ...docScope });
      const x1 = evalExpr(lay.x1, { ...docScope });
      const e = evalExpr(lay.eps, { ...docScope });
      if (!(x0 >= 0 && x1 > x0 && x1 <= L))
        throw {
          msg: t('e.simFdtdLayer', { expr: `${lay.x0}, ${lay.x1}, ${lay.eps}`.slice(0, 60) }),
        };
      if (!(e >= 1))
        throw {
          msg: t('e.simFdtdLayer', { expr: `${lay.x0}, ${lay.x1}, ${lay.eps}`.slice(0, 60) }),
        };
      for (let i = 0; i <= N; i++) {
        const x = i * dx;
        if (x >= x0 && x < x1) eps[i] = e;
      }
    }
    const E = new Array<number>(N + 1).fill(0);
    const H = new Array<number>(N).fill(0);
    const Eprev = new Array<number>(N + 1).fill(0);
    // Mur ABC первого порядка (c = 1): coef = (c*dt - dx)/(c*dt + dx)
    const mur = (dt - dx) / (dt + dx);
    const is = Math.max(0, Math.min(N, Math.round(f.srcX / dx)));
    const id = Math.max(0, Math.min(N, Math.round(f.det / dx)));
    // Зонд падающей волны (правее источника) + окна: инцидент — до возврата
    // отражений, прохождение — после прихода фронта к детектору.
    const iInc = Math.min(N, is + 2);
    let xLayer = L;
    {
      const xs0: number[] = [];
      for (const lay of f.layers) {
        try {
          const x0 = evalExpr(lay.x0, { ...docScope });
          if (x0 > f.srcX) xs0.push(x0);
        } catch {
          /* ignore */
        }
      }
      if (xs0.length) xLayer = Math.min(...xs0);
    }
    const tRefl = 2 * (xLayer - f.srcX);
    const tArr = Math.abs(f.det - f.srcX);
    const w = 0.3;
    const tc = 1.5;
    const srcAt = (tt: number): number => {
      if (f.src === 'sine') {
        const ramp = Math.min(1, tt / (2 / f.freq));
        return f.amp * Math.sin(2 * Math.PI * f.freq * tt) * ramp;
      }
      return f.amp * Math.exp(-(((tt - tc) / w) ** 2));
    };
    const stride = Math.max(1, Math.ceil(steps / MAX_FDTD_SNAPS));
    return {
      run: {
        f,
        N,
        dx,
        dt,
        steps,
        eps,
        E,
        H,
        Eprev,
        mur,
        is,
        id,
        iInc,
        iIncH: Math.min(iInc, N - 1),
        idH: Math.min(id, N - 1),
        tRefl,
        tArr,
        srcAt,
        stride,
        snaps: [],
        sts: [],
        incFlux: 0,
        detFlux: 0,
        tt: 0,
        k: 0,
      },
    };
  } catch (e) {
    const ce = e as { msg?: string };
    return { fail: failOf(typeof ce?.msg === 'string' ? ce.msg : t('e.lineErrDefault')) };
  }
}

/** Чанк FDTD: до budget шагов или sliceMs. true = готов. Тело шага — как раньше. */
function fdtdChunk(run: FdtdRun, budget: number, sliceMs = Infinity, t0 = 0): boolean {
  const {
    N,
    dx,
    dt,
    steps,
    eps,
    E,
    H,
    Eprev,
    mur,
    is,
    id,
    iInc,
    iIncH,
    idH,
    tRefl,
    tArr,
    srcAt,
    stride,
  } = run;
  let done = 0;
  for (; run.k < steps; run.k++) {
    if (done >= budget) return false;
    const k = run.k;
    const tt = (k + 1) * dt;
    run.tt = tt;
    for (let i = 0; i < N; i++) {
      H[i] -= (dt / dx) * (E[i + 1] - E[i]);
      if (!isFinite(H[i])) throw { msg: t('e.simNan', { state: 'E', t: fmtT(tt) }) };
    }
    Eprev[0] = E[0];
    Eprev[N] = E[N];
    const E1old = E[1];
    const EN1old = E[N - 1];
    for (let i = 1; i < N; i++) {
      E[i] -= (dt / (eps[i] * dx)) * (H[i] - H[i - 1]);
      if (!isFinite(E[i])) throw { msg: t('e.simNan', { state: 'E', t: fmtT(tt) }) };
    }
    E[0] = E1old + mur * (E[1] - Eprev[0]);
    E[N] = EN1old + mur * (E[N - 1] - Eprev[N]);
    if (!isFinite(E[0]) || !isFinite(E[N]))
      throw { msg: t('e.simNan', { state: 'E', t: fmtT(tt) }) };
    E[is] += srcAt(tt);
    if (!isFinite(E[is])) throw { msg: t('e.simNan', { state: 'E', t: fmtT(tt) }) };
    if (tRefl <= 0 || tt < tRefl) run.incFlux += E[iInc] * H[iIncH] * dt;
    if (tt > tArr) run.detFlux += E[id] * H[idH] * dt;
    if (k % stride === 0 || k === steps - 1) {
      run.snaps.push(E.slice());
      run.sts.push(tt);
    }
    done++;
    if ((done & 127) === 0 && performance.now() - t0 > sliceMs) return false;
  }
  return true;
}

/** Финал FDTD: оценка прохождения + поле (общее для sync/async). */
function fdtdFinish(run: FdtdRun): SimResult {
  const { N, dx, steps, snaps, sts } = run;
  // Оценка прохождения T = поток у детектора / падающий поток
  const tEst =
    run.incFlux > 0 ? Number(Math.min(1.5, run.detFlux / run.incFlux).toPrecision(4)) : null;
  const xs = Array.from({ length: N + 1 }, (_, i) => Number((i * dx).toPrecision(6)));
  return {
    ts: sts,
    series: [],
    final: [],
    steps,
    error: null,
    events: [],
    halted: false,
    field: { xs, snaps, ts: sts },
    tEst,
  };
}

function runFdtd(f: SimFdtd, docScope: Scope): SimResult {
  const fail = (error: string): SimResult => ({
    ts: [],
    series: [],
    final: [],
    steps: 0,
    error,
    events: [],
    halted: false,
    field: null,
    tEst: null,
  });
  const started = beginFdtd(f, docScope);
  if ('fail' in started) return started.fail;
  try {
    while (!fdtdChunk(started.run, Infinity));
  } catch (e) {
    const ce = e as { msg?: string };
    return fail(typeof ce?.msg === 'string' ? ce.msg : t('e.lineErrDefault'));
  }
  return fdtdFinish(started.run);
}

/** Асинхронный прогон FDTD чанками с прогрессом/отменой (#6). */
export async function runFdtdAsync(
  f: SimFdtd,
  docScope: Scope,
  hooks: SimHooks = {},
): Promise<SimResult> {
  const started = beginFdtd(f, docScope);
  if ('fail' in started) return started.fail;
  const run = started.run;
  try {
    for (;;) {
      throwIfCancel(hooks);
      const t0 = performance.now();
      const done = fdtdChunk(run, Infinity, 8, t0);
      hooks.onProgress?.(run.k, run.steps);
      if (done) break;
      await yieldSlice();
    }
  } catch (e) {
    if (isSimCancel(e)) throw e;
    const ce = e as { msg?: string };
    const fail = (error: string): SimResult => ({
      ts: [],
      series: [],
      final: [],
      steps: 0,
      error,
      events: [],
      halted: false,
      field: null,
      tEst: null,
    });
    return fail(typeof ce?.msg === 'string' ? ce.msg : t('e.lineErrDefault'));
  }
  return fdtdFinish(run);
}

/** Асинхронный runSim: чанки + прогресс + отмена (#6). */
export async function runSimAsync(
  def: SimDef,
  docScope: Scope,
  hooks: SimHooks = {},
): Promise<SimResult> {
  if (def.mode === 'fdtd' && def.fdtd) return runFdtdAsync(def.fdtd, docScope, hooks);
  return runOdeAsync(def, docScope, hooks);
}

function fmtT(v: number): string {
  if (v === 0) return '0';
  const a = Math.abs(v);
  if (a >= 1000 || a < 0.01) return v.toExponential(2);
  return String(Number(v.toPrecision(6)));
}

function stepEuler(
  rhs: RhsInto,
  tt: number,
  y: ArrayLike<number>,
  h: number,
  out: number[],
  f: number[],
): void {
  rhs(tt, y, f);
  for (let i = 0; i < out.length; i++) out[i] = y[i] + h * f[i];
}

/** Пул векторов одного прогона (стадии + временные), чтобы не аллоцировать на шаг. */
interface OdePool {
  k1: number[];
  k2: number[];
  k3: number[];
  k4: number[];
  yt: number[];
  fy: number[];
  fz: number[];
}

/**
 * TR-BDF2: L-устойчивый неявный метод 2-го порядка для жёстких систем.
 * Стадия 1 — трапеции на γh, стадия 2 — BDF2; γ = 2−√2.
 * Нелинейности — Ньютоном с численной якобианой.
 */
function stepTRBDF2(
  rhs: RhsInto,
  tt: number,
  y: number[],
  h: number,
  out: number[],
  pool: OdePool,
): void {
  const n = y.length;
  const gamma = 2 - Math.sqrt(2);
  // Ньютон внутри — как раньше на свежих массивах (итераций мало, доминируют
  // вычисления rhs); пул используем только для снапшотов fy/fz.
  const newton = (G: (z: number[]) => number[], z0: number[]): number[] => {
    let z = z0.slice();
    for (let k = 0; k < 200; k++) {
      const g = G(z);
      const norm = Math.sqrt(g.reduce((s, v) => s + v * v, 0));
      const scale = 1 + Math.sqrt(z.reduce((s, v) => s + v * v, 0));
      if (norm < 1e-10 * scale) return z;
      const J: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(0));
      for (let j = 0; j < n; j++) {
        const hh = 1e-8 * Math.max(1, Math.abs(z[j]));
        const zp = z.slice();
        zp[j] += hh;
        const gp = G(zp);
        for (let i = 0; i < n; i++) J[i][j] = (gp[i] - g[i]) / hh;
      }
      let dz: number[];
      try {
        dz = solveLinear(
          J,
          g.map((v) => -v),
        );
      } catch {
        throw { msg: t('e.simStiffFail') };
      }
      let lam = 1;
      let zn = z;
      let ok = false;
      for (let d = 0; d < 12; d++) {
        zn = z.map((v, i) => v + lam * dz[i]);
        const gn = G(zn);
        const nn = Math.sqrt(gn.reduce((s, v) => s + v * v, 0));
        if (nn < norm) {
          ok = true;
          break;
        }
        lam /= 2;
      }
      if (!ok) throw { msg: t('e.simStiffFail') };
      z = zn;
    }
    throw { msg: t('e.simStiffFail') };
  };
  // стадия 1: трапеции z = y + (γh/2)(f(y) + f(z))
  // fy/fz — выделенные буферы пула: снапшоты живут через итерации Ньютона.
  const { fy, fz } = pool;
  rhs(tt, y, fy);
  const c1 = (gamma * h) / 2;
  const t1 = tt + gamma * h;
  const z = newton(
    (zz) => {
      rhs(t1, zz, fz);
      return zz.map((v, i) => v - y[i] - c1 * (fy[i] + fz[i]));
    },
    y.map((v, i) => v + gamma * h * fy[i]),
  );
  // стадия 2: BDF2 с шагами h1=γh, h2=(1−γ)h
  const h1 = gamma * h;
  const h2 = (1 - gamma) * h;
  const r = h2 / h1;
  const cA = (1 + r) ** 2 / (1 + 2 * r);
  const cB = -(r ** 2) / (1 + 2 * r);
  const cC = ((1 + r) / (1 + 2 * r)) * h2;
  const t2 = tt + h;
  const w = newton(
    (ww) => {
      rhs(t2, ww, fz);
      return ww.map((v, i) => v - cA * z[i] - cB * y[i] - cC * fz[i]);
    },
    z.map((v, i) => v + (h2 * (v - y[i])) / h1),
  );
  for (let i = 0; i < n; i++) out[i] = w[i];
}

function stepRK4(
  rhs: RhsInto,
  tt: number,
  y: ArrayLike<number>,
  h: number,
  out: number[],
  pool: OdePool,
): void {
  const n = out.length;
  const { k1, k2, k3, k4, yt } = pool;
  rhs(tt, y, k1);
  for (let i = 0; i < n; i++) yt[i] = y[i] + (h / 2) * k1[i];
  rhs(tt + h / 2, yt, k2);
  for (let i = 0; i < n; i++) yt[i] = y[i] + (h / 2) * k2[i];
  rhs(tt + h / 2, yt, k3);
  for (let i = 0; i < n; i++) yt[i] = y[i] + h * k3[i];
  rhs(tt + h, yt, k4);
  for (let i = 0; i < n; i++) out[i] = y[i] + (h / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]);
}

/**
 * Чанк адаптивного Дормана–Принса RK45 (rtol 1e-6): до budget итераций или sliceMs.
 * true = дошли до t1/останов. Тело итерации — как раньше, бит-идентично.
 * Бросает {msg} при превышении лимитов (как раньше).
 */
function odeRk45Chunk(run: OdeRun, budget: number, sliceMs = Infinity, t0 = 0): boolean {
  const { def, n } = run;
  const RTOL = 1e-6;
  const ATOL = 1e-9;
  // Макс. шаг ограничен span/1000: адаптивность сохраняется вниз,
  // а recorded-точек всегда достаточно для плавной анимации.
  const hMax = (def.t1 - def.t0) / 1000;
  const { ks, yt, y5, y4, y } = run;
  const C = [0, 1 / 5, 3 / 10, 4 / 5, 8 / 9, 1, 1];
  const A: number[][] = [
    [],
    [1 / 5],
    [3 / 40, 9 / 40],
    [44 / 45, -56 / 15, 32 / 9],
    [19372 / 6561, -25360 / 2187, 64448 / 6561, -212 / 729],
    [9017 / 3168, -355 / 33, 46732 / 5247, 49 / 176, -5103 / 18656],
    [35 / 384, 0, 500 / 1113, 125 / 192, -2187 / 6784, 11 / 84],
  ];
  const B5 = [35 / 384, 0, 500 / 1113, 125 / 192, -2187 / 6784, 11 / 84, 0];
  const B4 = [5179 / 57600, 0, 7571 / 16695, 393 / 640, -92097 / 339200, 187 / 2100, 1 / 40];
  // Тот же порядок операций, что раньше (yi.slice + накопление): бит-идентично.
  const addScaled = (a: number[], hh: number): void => {
    for (let i = 0; i < n; i++) yt[i] = y[i];
    for (let j = 0; j < a.length; j++) {
      const c = a[j] * hh;
      const kj = ks[j];
      for (let i = 0; i < n; i++) yt[i] += c * kj[i];
    }
  };
  let done = 0;
  while (run.tt < def.t1) {
    if (done >= budget) return false;
    if (++run.rkIters > MAX_ITERS) throw { msg: t('e.simStuck') };
    if (run.traj.len > RK45_MAX_PTS) throw { msg: t('e.simPts', { max: MAX_PTS }) };
    run.rkh = Math.min(run.rkh, def.t1 - run.tt);
    const h = run.rkh;
    for (let s = 0; s < 7; s++) {
      if (s > 0) addScaled(A[s], h);
      run.rhsInto(run.tt + C[s] * h, s === 0 ? y : yt, ks[s]);
    }
    for (let i = 0; i < n; i++) {
      let s5 = 0;
      let s4 = 0;
      for (let j = 0; j < 7; j++) {
        s5 += B5[j] * ks[j][i];
        s4 += B4[j] * ks[j][i];
      }
      y5[i] = y[i] + h * s5;
      y4[i] = y[i] + h * s4;
    }
    let err = 0;
    for (let i = 0; i < n; i++) {
      const sc = ATOL + RTOL * Math.max(Math.abs(y[i]), Math.abs(y5[i]));
      const d = (y5[i] - y4[i]) / sc;
      err += d * d;
    }
    err = Math.sqrt(err / n);
    const hNew = err === 0 ? h * 4 : h * Math.min(4, Math.max(0.2, 0.9 * Math.pow(1 / err, 0.2)));
    if (err <= 1) {
      run.tt += h;
      if (run.tt > def.t1) run.tt = def.t1;
      for (let i = 0; i < n; i++) y[i] = y5[i];
      run.checkFinite(y, run.tt);
      run.traj.push(run.tt, y);
      if (def.events.length && run.fireEvents(run.tt, y)) {
        run.traj.setLast(y);
        run.halted = true;
        return true;
      }
    }
    run.rkh = Math.max(1e-12, Math.min(hNew, hMax));
    done++;
    if ((done & 255) === 0 && performance.now() - t0 > sliceMs) return false;
  }
  return true;
}

/* ---------------- Реестр готовых моделей ---------------- */

export type SimDomain =
  | 'mechanics'
  | 'osc'
  | 'circuits'
  | 'thermo'
  | 'optics'
  | 'chaos'
  | 'nuclear'
  | 'molecular'
  | 'astro';

export const SIM_DOMAINS: SimDomain[] = [
  'mechanics',
  'osc',
  'circuits',
  'thermo',
  'optics',
  'chaos',
  'nuclear',
  'molecular',
  'astro',
];

export interface SimModelParam {
  name: string;
  def: string;
}

export interface SimModel {
  id: string;
  domain: SimDomain;
  /** режим (по умолчанию 'ode'); события — текст (по умолчанию '') */
  mode?: SimMode;
  events?: string;
  label: LText;
  desc: LText;
  states: string;
  derivs: string;
  aux: string;
  params: SimModelParam[];
  init: string;
  t0: number;
  t1: number;
  dt: number;
  solver: SimSolver;
  x: string;
  y: string;
  fdtd?: {
    n: number;
    length: number;
    steps: number;
    src: 'gauss' | 'sine';
    freq: number;
    amp: number;
    srcX: number;
    det: number;
    layers: string;
  };
}
/** Пресеты моделей живут в NyaMath.db (таблица sim_models). */
export function listSimModels(): SimModel[] {
  return dbListSimModels();
}

export function getSimModel(id: string): SimModel | undefined {
  return dbGetSimModel(id) ?? undefined;
}

/** Патч полей блока для применения модели (label локализуется через lx). */
export function simModelPatch(m: SimModel): {
  simMode: SimMode;
  simModel: string;
  simStates: string;
  simDerivs: string;
  simAux: string;
  simParams: string;
  simInit: string;
  simT0: number;
  simT1: number;
  simDt: number;
  simSolver: SimSolver;
  simEvents: string;
  simX: string;
  simY: string;
  simFdtdN?: number;
  simFdtdL?: number;
  simFdtdSteps?: number;
  simFdtdSrc?: 'gauss' | 'sine';
  simFdtdFreq?: number;
  simFdtdAmp?: number;
  simFdtdSrcX?: number;
  simFdtdDet?: number;
  simFdtdLayers?: string;
} {
  return {
    simMode: m.mode ?? 'ode',
    simModel: m.id,
    simStates: m.states,
    simDerivs: m.derivs,
    simAux: m.aux,
    simParams: m.params.map((p) => `${p.name} := ${p.def}`).join('\n'),
    simInit: m.init,
    simT0: m.t0,
    simT1: m.t1,
    simDt: m.dt,
    simSolver: m.solver,
    simEvents: m.events ?? '',
    simX: m.x,
    simY: m.y,
    simFdtdN: m.fdtd?.n,
    simFdtdL: m.fdtd?.length,
    simFdtdSteps: m.fdtd?.steps,
    simFdtdSrc: m.fdtd?.src,
    simFdtdFreq: m.fdtd?.freq,
    simFdtdAmp: m.fdtd?.amp,
    simFdtdSrcX: m.fdtd?.srcX,
    simFdtdDet: m.fdtd?.det,
    simFdtdLayers: m.fdtd?.layers,
  };
}

/** Дефолт нового sim-блока: маятник. */
export function defaultSimPatch(): ReturnType<typeof simModelPatch> {
  const m = getSimModel('pendulum') ?? listSimModels()[0];
  return simModelPatch(m);
}
