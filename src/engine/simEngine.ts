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
import { math, preprocessJ, preprocessRanges } from './mathEngine';
import type { Scope } from './packs';
import { solveLinear } from './numeric';
import { t, type LText } from '../i18n';

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
  const states = raw.states.split(',').map((s) => s.trim()).filter(Boolean);
  if (!states.length) return { def: null, error: t('e.simNoStates') };
  for (const s of states) {
    if (!VAR_RE.test(s) || s === 't') return { def: null, error: t('e.simBadState', { name: s }) };
  }
  if (new Set(states).size !== states.length) return { def: null, error: t('e.simDupState') };
  const derivsClean = raw.derivs.split(';').map((s) => s.trim()).filter((s) => s !== '');
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
    if (states.includes(a.name) || a.name === 't') return { def: null, error: t('e.simShadow', { name: a.name }) };
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
    def: { mode: 'ode', states, derivs: derivsClean, aux, params, init, t0, t1, dt, solver: raw.solver, events, fdtd: null },
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
function parseFdtdDef(raw: Parameters<typeof parseSimDef>[0]): { def: SimDef | null; error: string | null } {
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
  if (length === null || !(length > 0)) return { def: null, error: t('e.simFdtdNum', { name: 'length' }) };
  if (steps === null || !Number.isInteger(steps) || steps < 100 || steps > MAX_FDTD_STEPS) {
    return { def: null, error: t('e.simFdtdSteps', { max: MAX_FDTD_STEPS }) };
  }
  const src = f?.src === 'sine' ? 'sine' : 'gauss';
  if (src === 'sine' && (freq === null || !(freq > 0))) return { def: null, error: t('e.simFdtdNum', { name: 'freq' }) };
  if (amp === null || amp === 0) return { def: null, error: t('e.simFdtdNum', { name: 'amp' }) };
  if (srcX === null || srcX < 0 || srcX > length) return { def: null, error: t('e.simFdtdRange', { name: 'srcX' }) };
  const detV = det ?? 0.85 * length;
  if (!(detV >= 0 && detV <= length)) return { def: null, error: t('e.simFdtdRange', { name: 'det' }) };
  const layers: SimFdtdLayer[] = [];
  for (const line of (f?.layers ?? '').split('\n')) {
    const l = line.trim();
    if (!l || l.startsWith('//') || l.startsWith('#')) continue;
    const parts = l.split(',').map((s) => s.trim());
    if (parts.length !== 3 || parts.some((p) => !p)) return { def: null, error: t('e.simFdtdLayers') };
    layers.push({ x0: parts[0], x1: parts[1], eps: parts[2] });
  }
  return {
    def: {
      mode: 'fdtd', states: [], derivs: [], aux: [], params: [], init: [],
      t0: 0, t1: 0, dt: 0, solver: 'rk4', events: [],
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

function evalExpr(expr: string, scope: Scope): number {
  let v: unknown;
  try {
    v = math.evaluate(preprocessRanges(preprocessJ(expr, false)), scope);
  } catch {
    throw { msg: t('e.simEval', { expr: expr.slice(0, 60) }) };
  }
  const n = toNum(v);
  if (n === null) throw { msg: t('e.simNotNum', { expr: expr.slice(0, 60) }) };
  return n;
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
function eventTruthy(expr: string, scope: Scope): boolean {
  let v: unknown;
  try {
    v = math.evaluate(preprocessRanges(preprocessJ(expr, false)), scope);
  } catch {
    throw { msg: t('e.simEval', { expr: expr.slice(0, 60) }) };
  }
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number' && isFinite(v)) return v !== 0;
  if (v !== null && typeof v === 'object' && 're' in v && 'im' in v) {
    const c = v as { re: number; im: number };
    return c.re !== 0 || c.im !== 0;
  }
  throw { msg: t('e.simEventCond', { expr: expr.slice(0, 60) }) };
}

function runOde(def: SimDef, docScope: Scope): SimResult {
  const fail = (error: string): SimResult => ({ ts: [], series: [], final: [], steps: 0, error, events: [], halted: false, field: null, tEst: null });
  try {
    const base: Scope = { ...docScope };
    for (const p of def.params) base[p.name] = evalExpr(p.expr, base);
    const y0 = def.init.map((e) => evalExpr(e, base));
    const n = def.states.length;

    const rhs = (tt: number, y: number[]): number[] => {
      const s: Scope = { ...base, t: tt };
      for (let i = 0; i < n; i++) s[def.states[i]] = y[i];
      for (const a of def.aux) s[a.name] = evalExpr(a.expr, s);
      return def.derivs.map((d) => evalExpr(d, s));
    };

    /** Скоп шага для условий/действий событий (состояния + aux + t). */
    const stepScope = (tt: number, y: number[]): Scope => {
      const s: Scope = { ...base, t: tt };
      for (let i = 0; i < n; i++) s[def.states[i]] = y[i];
      for (const a of def.aux) s[a.name] = evalExpr(a.expr, s);
      return s;
    };

    const ts: number[] = [def.t0];
    const traj: number[][] = [y0.slice()];
    const fired: { t: number }[] = [];
    let halted = false;
    let steps = 0;
    // фронты: начальные значения условий (без срабатывания на старте)
    const prev = def.events.map((ev) => eventTruthy(ev.cond, stepScope(def.t0, y0)));

    /** Проверить события после шага; true = останов. Мутирует y на месте. */
    const fireEvents = (tt: number, y: number[]): boolean => {
      const s = stepScope(tt, y);
      for (let e = 0; e < def.events.length; e++) {
        const ev = def.events[e];
        const now = eventTruthy(ev.cond, s);
        if (now && !prev[e]) {
          fired.push({ t: tt });
          let stop = false;
          for (const a of ev.actions) {
            if (a.stop) {
              stop = true;
              continue;
            }
            const idx = def.states.indexOf(a.name);
            const v = evalExpr(a.expr, s);
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

    if (def.solver === 'rk45') {
      halted = integrateRK45(def, rhs, ts, traj, checkFinite, fireEvents);
      steps = ts.length - 1;
    } else {
      const total = Math.ceil((def.t1 - def.t0) / def.dt);
      if (total > MAX_FIXED_STEPS) throw { msg: t('e.simSteps', { max: MAX_FIXED_STEPS }) };
      const h = (def.t1 - def.t0) / total;
      let y = y0.slice();
      let tt = def.t0;
      for (let k = 0; k < total; k++) {
        if (def.solver === 'trbdf2') y = stepTRBDF2(rhs, tt, y, h);
        else y = def.solver === 'euler' ? stepEuler(rhs, tt, y, h) : stepRK4(rhs, tt, y, h);
        tt = k === total - 1 ? def.t1 : tt + h;
        checkFinite(y, tt);
        traj.push(y.slice());
        ts.push(tt);
        if (def.events.length && fireEvents(tt, y)) {
          halted = true;
          traj[traj.length - 1] = y.slice();
          break;
        }
      }
      steps = ts.length - 1;
    }

    // Прореживание для отображения/анимации (интеграция уже точная)
    const stride = Math.max(1, Math.ceil(ts.length / MAX_PTS));
    const rts: number[] = [];
    const rtraj: number[][] = [];
    for (let k = 0; k < ts.length; k += stride) {
      rts.push(ts[k]);
      rtraj.push(traj[k]);
    }
    if (rts[rts.length - 1] !== ts[ts.length - 1]) {
      rts.push(ts[ts.length - 1]);
      rtraj.push(traj[traj.length - 1]);
    }
    const series: SimSeries[] = def.states.map((name, i) => ({
      name,
      ys: rtraj.map((row) => row[i]),
    }));
    const last = traj[traj.length - 1];
    return { ts: rts, series, final: last.slice(), steps, error: null, events: fired, halted, field: null, tEst: null };
  } catch (e) {
    const ce = e as { msg?: string };
    return fail(typeof ce?.msg === 'string' ? ce.msg : t('e.lineErrDefault'));
  }
}

/**
 * 1D FDTD для уравнений Максвелла (Ey, Hz), нормировка c = 1.
 * Слоистая среда eps(x), источник (гауссов импульс / синус), Mur-ABC по краям.
 * Возвращает кадры поля E(x) + оценку прохождения T по детектору.
 */
function runFdtd(f: SimFdtd, docScope: Scope): SimResult {
  const fail = (error: string): SimResult => ({ ts: [], series: [], final: [], steps: 0, error, events: [], halted: false, field: null, tEst: null });
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
      if (!(x0 >= 0 && x1 > x0 && x1 <= L)) throw { msg: t('e.simFdtdLayer', { expr: `${lay.x0}, ${lay.x1}, ${lay.eps}`.slice(0, 60) }) };
      if (!(e >= 1)) throw { msg: t('e.simFdtdLayer', { expr: `${lay.x0}, ${lay.x1}, ${lay.eps}`.slice(0, 60) }) };
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
        } catch { /* ignore */ }
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
    const snaps: number[][] = [];
    const sts: number[] = [];
    // T энергетическое: поток Пойнтинга S=E·H у источника (до возврата
    // отражений) vs у детектора (после прихода фронта).
    let incFlux = 0;
    let detFlux = 0;
    let tt = 0;
    for (let k = 0; k < steps; k++) {
      tt = (k + 1) * dt;
      for (let i = 0; i < N; i++) H[i] -= (dt / dx) * (E[i + 1] - E[i]);
      Eprev[0] = E[0];
      Eprev[N] = E[N];
      const E1old = E[1];
      const EN1old = E[N - 1];
      for (let i = 1; i < N; i++) E[i] -= (dt / (eps[i] * dx)) * (H[i] - H[i - 1]);
      E[0] = E1old + mur * (E[1] - Eprev[0]);
      E[N] = EN1old + mur * (E[N - 1] - Eprev[N]);
      E[is] += srcAt(tt);
      if (tRefl <= 0 || tt < tRefl) incFlux += E[iInc] * H[Math.min(iInc, N - 1)] * dt;
      if (tt > tArr) detFlux += E[id] * H[Math.min(id, N - 1)] * dt;
      for (let i = 0; i <= N; i++) {
        if (!isFinite(E[i]) || !isFinite(H[Math.min(i, N - 1)])) {
          throw { msg: t('e.simNan', { state: 'E', t: fmtT(tt) }) };
        }
      }
      if (k % stride === 0 || k === steps - 1) {
        snaps.push(E.slice());
        sts.push(tt);
      }
    }
    // Оценка прохождения T = поток у детектора / падающий поток
    const tEst = incFlux > 0 ? Number(Math.min(1.5, detFlux / incFlux).toPrecision(4)) : null;
    const xs = Array.from({ length: N + 1 }, (_, i) => Number((i * dx).toPrecision(6)));
    return {
      ts: sts, series: [], final: [], steps, error: null, events: [], halted: false,
      field: { xs, snaps, ts: sts }, tEst,
    };
  } catch (e) {
    const ce = e as { msg?: string };
    return fail(typeof ce?.msg === 'string' ? ce.msg : t('e.lineErrDefault'));
  }
}

function fmtT(v: number): string {
  if (v === 0) return '0';
  const a = Math.abs(v);
  if (a >= 1000 || a < 0.01) return v.toExponential(2);
  return String(Number(v.toPrecision(6)));
}

function stepEuler(rhs: (t: number, y: number[]) => number[], tt: number, y: number[], h: number): number[] {
  const f = rhs(tt, y);
  return y.map((v, i) => v + h * f[i]);
}

/**
 * TR-BDF2: L-устойчивый неявный метод 2-го порядка для жёстких систем.
 * Стадия 1 — трапеции на γh, стадия 2 — BDF2; γ = 2−√2.
 * Нелинейности — Ньютоном с численной якобианой.
 */
function stepTRBDF2(rhs: (t: number, y: number[]) => number[], tt: number, y: number[], h: number): number[] {
  const n = y.length;
  const gamma = 2 - Math.sqrt(2);
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
        dz = solveLinear(J, g.map((v) => -v));
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
  const fy = rhs(tt, y);
  const c1 = (gamma * h) / 2;
  const t1 = tt + gamma * h;
  const z = newton(
    (zz) => {
      const fz = rhs(t1, zz);
      return zz.map((v, i) => v - y[i] - c1 * (fy[i] + fz[i]));
    },
    y.map((v, i) => v + gamma * h * fy[i]),
  );
  // стадия 2: BDF2 с шагами h1=γh, h2=(1−γ)h
  const h1 = gamma * h;
  const h2 = (1 - gamma) * h;
  const r = h2 / h1;
  const cA = ((1 + r) ** 2) / (1 + 2 * r);
  const cB = -(r ** 2) / (1 + 2 * r);
  const cC = ((1 + r) / (1 + 2 * r)) * h2;
  const t2 = tt + h;
  return newton(
    (w) => {
      const fw = rhs(t2, w);
      return w.map((v, i) => v - cA * z[i] - cB * y[i] - cC * fw[i]);
    },
    z.map((v, i) => v + h2 * (v - y[i]) / h1),
  );
}

function stepRK4(rhs: (t: number, y: number[]) => number[], tt: number, y: number[], h: number): number[] {
  const k1 = rhs(tt, y);
  const y2 = y.map((v, i) => v + (h / 2) * k1[i]);
  const k2 = rhs(tt + h / 2, y2);
  const y3 = y.map((v, i) => v + (h / 2) * k2[i]);
  const k3 = rhs(tt + h / 2, y3);
  const y4 = y.map((v, i) => v + h * k3[i]);
  const k4 = rhs(tt + h, y4);
  return y.map((v, i) => v + (h / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]));
}

/** Адаптивный Дорман–Принс RK45 (rtol 1e-6). Возвращает halted. Бросает {msg} при превышении лимитов. */
function integrateRK45(
  def: SimDef,
  rhs: (t: number, y: number[]) => number[],
  ts: number[],
  traj: number[][],
  checkFinite: (y: number[], t: number) => void,
  fireEvents: (t: number, y: number[]) => boolean,
): boolean {
  const n = def.states.length;
  const RTOL = 1e-6;
  const ATOL = 1e-9;
  // Макс. шаг ограничен span/1000: адаптивность сохраняется вниз,
  // а recorded-точек всегда достаточно для плавной анимации.
  const hMax = (def.t1 - def.t0) / 1000;
  let h = Math.min(def.dt, hMax);
  let tt = def.t0;
  let y = traj[0].slice();
  let iters = 0;
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
  const addScaled = (yi: number[], kk: number[][], a: number[], hh: number): number[] => {
    const out = yi.slice();
    for (let j = 0; j < a.length; j++) {
      const c = a[j] * hh;
      const kj = kk[j];
      for (let i = 0; i < n; i++) out[i] += c * kj[i];
    }
    return out;
  };
  while (tt < def.t1) {
    if (++iters > MAX_ITERS) throw { msg: t('e.simStuck') };
    if (ts.length > MAX_PTS * 4) throw { msg: t('e.simPts', { max: MAX_PTS }) };
    h = Math.min(h, def.t1 - tt);
    const ks: number[][] = [];
    for (let s = 0; s < 7; s++) {
      const yt = s === 0 ? y : addScaled(y, ks, A[s], h);
      const k = rhs(tt + C[s] * h, yt);
      ks.push(k);
    }
    const y5 = y.map((v, i) => v + h * B5.reduce((s2, b, j) => s2 + b * ks[j][i], 0));
    const y4 = y.map((v, i) => v + h * B4.reduce((s2, b, j) => s2 + b * ks[j][i], 0));
    let err = 0;
    for (let i = 0; i < n; i++) {
      const sc = ATOL + RTOL * Math.max(Math.abs(y[i]), Math.abs(y5[i]));
      const d = (y5[i] - y4[i]) / sc;
      err += d * d;
    }
    err = Math.sqrt(err / n);
    const hNew = err === 0 ? h * 4 : h * Math.min(4, Math.max(0.2, 0.9 * Math.pow(1 / err, 0.2)));
    if (err <= 1) {
      tt += h;
      if (tt > def.t1) tt = def.t1;
      y = y5;
      checkFinite(y, tt);
      ts.push(tt);
      traj.push(y.slice());
      if (def.events.length && fireEvents(tt, y)) {
        traj[traj.length - 1] = y.slice();
        return true;
      }
    }
    h = Math.max(1e-12, Math.min(hNew, hMax));
  }
  return false;
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
  'mechanics', 'osc', 'circuits', 'thermo', 'optics', 'chaos', 'nuclear', 'molecular', 'astro',
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

const L = (ru: string, en: string): LText => ({ ru, en });

export const SIM_MODELS: SimModel[] = [
  {
    id: 'projectile', domain: 'mechanics',
    label: L('Бросок тела', 'Projectile motion'),
    desc: L('Полёт с линейным сопротивлением воздуха', 'Flight with linear air drag'),
    states: 'x, y, vx, vy', derivs: 'vx; vy; -k*vx/m; -g - k*vy/m', aux: '',
    params: [{ name: 'm', def: '1' }, { name: 'g', def: '9.81' }, { name: 'k', def: '0' }],
    init: '0, 0, 20, 20', t0: 0, t1: 5, dt: 0.01, solver: 'rk4', x: 'x', y: 'y',
  },
  {
    id: 'pendulum', domain: 'mechanics',
    label: L('Маятник (нелинейный)', 'Pendulum (nonlinear)'),
    desc: L('Колебания на больших углах с трением', 'Large-angle swings with damping'),
    states: 'th, om', derivs: 'om; -(g/L)*sin(th) - b*om', aux: '',
    params: [{ name: 'L', def: '1' }, { name: 'g', def: '9.81' }, { name: 'b', def: '0.05' }],
    init: '1.2, 0', t0: 0, t1: 10, dt: 0.01, solver: 'rk4', x: 't', y: 'th',
  },
  {
    id: 'oscillator', domain: 'osc',
    label: L('Осциллятор с затуханием', 'Damped oscillator'),
    desc: L('Груз на пружине с вязким трением', 'Mass on a spring with viscous damping'),
    states: 'x, v', derivs: 'v; -(k*x + c*v)/m', aux: '',
    params: [{ name: 'm', def: '1' }, { name: 'k', def: '4' }, { name: 'c', def: '0.1' }],
    init: '1, 0', t0: 0, t1: 12, dt: 0.01, solver: 'rk4', x: 't', y: 'x',
  },
  {
    id: 'driven', domain: 'osc',
    label: L('Вынужденные колебания', 'Driven oscillator'),
    desc: L('Резонанс под гармонической силой', 'Resonance under harmonic forcing'),
    states: 'x, v', derivs: 'v; (F*cos(w*t) - c*v - k*x)/m', aux: '',
    params: [
      { name: 'm', def: '1' }, { name: 'k', def: '4' }, { name: 'c', def: '0.05' },
      { name: 'F', def: '1' }, { name: 'w', def: '2' },
    ],
    init: '0, 0', t0: 0, t1: 30, dt: 0.01, solver: 'rk4', x: 't', y: 'x',
  },
  {
    id: 'vanderpol', domain: 'chaos',
    label: L('Осциллятор Ван-дер-Поля', 'Van der Pol oscillator'),
    desc: L('Нелинейный осциллятор с предельным циклом', 'Nonlinear oscillator with a limit cycle'),
    states: 'x, v', derivs: 'v; mu*(1 - x^2)*v - x', aux: '',
    params: [{ name: 'mu', def: '2' }],
    init: '0.5, 0', t0: 0, t1: 25, dt: 0.01, solver: 'rk4', x: 'x', y: 'v',
  },
  {
    id: 'lorenz', domain: 'chaos',
    label: L('Система Лоренца', 'Lorenz system'),
    desc: L('Детерминированный хаос: аттрактор-бабочка', 'Deterministic chaos: butterfly attractor'),
    states: 'x, y, z', derivs: 's*(y - x); x*(r - z) - y; x*y - b*z', aux: '',
    params: [{ name: 's', def: '10' }, { name: 'r', def: '28' }, { name: 'b', def: '8/3' }],
    init: '1, 1, 1', t0: 0, t1: 40, dt: 0.005, solver: 'rk4', x: 'x', y: 'y',
  },
  {
    id: 'doublepend', domain: 'chaos',
    label: L('Двойной маятник', 'Double pendulum'),
    desc: L('Полные нелинейные уравнения, хаос', 'Full nonlinear equations, chaos'),
    states: 'th1, om1, th2, om2',
    derivs: 'om1; d1; om2; d2',
    aux: 'den := 2*m1 + m2 - m2*cos(2*th1 - 2*th2)\nd1 := (-g*(2*m1+m2)*sin(th1) - m2*g*sin(th1-2*th2) - 2*sin(th1-th2)*m2*(om2^2*L2 + om1^2*L1*cos(th1-th2)))/(L1*den)\nd2 := 2*sin(th1-th2)*(om1^2*L1*(m1+m2) + g*(m1+m2)*cos(th1) + om2^2*L2*m2*cos(th1-th2))/(L2*den)',
    params: [
      { name: 'm1', def: '1' }, { name: 'm2', def: '1' },
      { name: 'L1', def: '1' }, { name: 'L2', def: '1' }, { name: 'g', def: '9.81' },
    ],
    init: '1.5, 0, 2.2, 0', t0: 0, t1: 15, dt: 0.005, solver: 'rk4', x: 't', y: 'th1; th2',
  },
  {
    id: 'orbit', domain: 'astro',
    label: L('Орбита спутника', 'Satellite orbit'),
    desc: L('Кеплерова орбита вокруг Земли (СИ)', 'Kepler orbit around Earth (SI)'),
    states: 'x, y, vx, vy', derivs: 'vx; vy; -mu*x/r^3; -mu*y/r^3',
    aux: 'r := sqrt(x^2 + y^2)',
    params: [{ name: 'mu', def: '3.986e14' }],
    init: '6771000, 0, 0, 7672', t0: 0, t1: 6000, dt: 5, solver: 'rk45', x: 'x', y: 'y',
  },
  {
    id: 'lctank', domain: 'circuits',
    label: L('LC-контур', 'LC tank'),
    desc: L('Свободные колебания с малыми потерями', 'Free oscillations with small losses'),
    states: 'q, i', derivs: 'i; -q/(L*C) - R*i/L', aux: '',
    params: [{ name: 'L', def: '0.01' }, { name: 'C', def: '1e-6' }, { name: 'R', def: '0.5' }],
    init: '1e-6, 0', t0: 0, t1: 0.01, dt: 0.00001, solver: 'rk4', x: 't', y: 'q; i',
  },
  {
    id: 'drivenRLC', domain: 'circuits',
    label: L('RLC под синусом', 'Driven RLC'),
    desc: L('Вынужденный отклик последовательного контура', 'Forced response of a series circuit'),
    states: 'q, i', derivs: 'i; (V*cos(w*t) - R*i - q/C)/L', aux: '',
    params: [
      { name: 'R', def: '10' }, { name: 'L', def: '0.1' }, { name: 'C', def: '1e-5' },
      { name: 'V', def: '5' }, { name: 'w', def: '1000' },
    ],
    init: '0, 0', t0: 0, t1: 0.05, dt: 0.00002, solver: 'rk4', x: 't', y: 'q; i',
  },
  {
    id: 'duffing', domain: 'chaos',
    label: L('Осциллятор Даффинга', 'Duffing oscillator'),
    desc: L('Двухъямный потенциал, хаос под накачкой', 'Double-well potential, driven chaos'),
    states: 'x, v', derivs: 'v; -d*v - a*x - b*x^3 + F*cos(w*t)', aux: '',
    params: [
      { name: 'd', def: '0.2' }, { name: 'a', def: '-1' }, { name: 'b', def: '1' },
      { name: 'F', def: '0.3' }, { name: 'w', def: '1.2' },
    ],
    init: '1, 0', t0: 0, t1: 60, dt: 0.02, solver: 'rk4', x: 'x', y: 'v',
  },
  {
    id: 'rlc', domain: 'circuits',
    label: L('RLC-контур', 'RLC circuit'),
    desc: L('Последовательный контур под постоянным напряжением', 'Series circuit under DC voltage'),
    states: 'q, i', derivs: 'i; (V - R*i - q/C)/L', aux: '',
    params: [{ name: 'R', def: '10' }, { name: 'L', def: '0.1' }, { name: 'C', def: '0.001' }, { name: 'V', def: '5' }],
    init: '0, 0', t0: 0, t1: 0.2, dt: 0.0001, solver: 'rk4', x: 't', y: 'q; i',
  },
  {
    id: 'rc', domain: 'circuits',
    label: L('Заряд RC-цепи', 'RC charging'),
    desc: L('Заряд конденсатора через резистор', 'Capacitor charging through a resistor'),
    states: 'V', derivs: '(Vs - V)/(R*C)', aux: '',
    params: [{ name: 'Vs', def: '5' }, { name: 'R', def: '1000' }, { name: 'C', def: '0.001' }],
    init: '0', t0: 0, t1: 5, dt: 0.005, solver: 'rk4', x: 't', y: 'V',
  },
  {
    id: 'newton', domain: 'thermo',
    label: L('Охлаждение Ньютона', 'Newton cooling'),
    desc: L('Температура тела в среде', 'Body temperature in a medium'),
    states: 'T', derivs: '-k*(T - Ta)', aux: '',
    params: [{ name: 'Ta', def: '20' }, { name: 'k', def: '0.05' }],
    init: '90', t0: 0, t1: 100, dt: 0.1, solver: 'rk4', x: 't', y: 'T',
  },
  {
    id: 'thermal2', domain: 'thermo',
    label: L('Два тела + нагреватель', 'Two bodies + heater'),
    desc: L('Теплообмен двух тел, первое греем', 'Heat exchange of two bodies, first one heated'),
    states: 'T1, T2', derivs: '(P - K*(T1-T2))/C1; K*(T1-T2)/C2', aux: '',
    params: [{ name: 'C1', def: '100' }, { name: 'C2', def: '200' }, { name: 'K', def: '5' }, { name: 'P', def: '50' }],
    init: '20, 20', t0: 0, t1: 200, dt: 0.1, solver: 'rk4', x: 't', y: 'T1; T2',
  },
  {
    id: 'decay', domain: 'nuclear',
    label: L('Цепочка распада', 'Decay chain'),
    desc: L('Радиоактивная цепочка A → B → C', 'Radioactive chain A → B → C'),
    states: 'N1, N2, N3', derivs: '-l1*N1; l1*N1 - l2*N2; l2*N2', aux: '',
    params: [{ name: 'l1', def: '0.1' }, { name: 'l2', def: '0.05' }],
    init: '1000, 0, 0', t0: 0, t1: 100, dt: 0.1, solver: 'rk4', x: 't', y: 'N1; N2; N3',
  },
  {
    id: 'kinetics', domain: 'molecular',
    label: L('Кинетика A ↔ B', 'Kinetics A ↔ B'),
    desc: L('Обратимая реакция первого порядка', 'Reversible first-order reaction'),
    states: 'A, B', derivs: '-k1*A + k2*B; k1*A - k2*B', aux: '',
    params: [{ name: 'k1', def: '0.3' }, { name: 'k2', def: '0.1' }],
    init: '1, 0', t0: 0, t1: 30, dt: 0.05, solver: 'rk4', x: 't', y: 'A; B',
  },
  {
    id: 'grin', domain: 'optics',
    label: L('Луч в GRIN-среде', 'GRIN beam'),
    desc: L('Параксиальный луч в градиентной оптике', 'Paraxial ray in gradient-index optics'),
    states: 'x, u', derivs: 'u; -g^2*x', aux: '',
    params: [{ name: 'g', def: '0.5' }],
    init: '1, 0', t0: 0, t1: 15, dt: 0.02, solver: 'rk4', x: 't', y: 'x',
  },
  {
    id: 'bounce', domain: 'mechanics',
    label: L('Прыгающий мяч', 'Bouncing ball'),
    desc: L('Удар об пол через событие: отражение скорости', 'Floor impact via event: velocity bounce'),
    states: 'y, vy', derivs: 'vy; -g', aux: '',
    params: [{ name: 'g', def: '9.81' }, { name: 'e', def: '0.8' }],
    events: 'y <= 0 => vy := -e*vy; y := 0',
    init: '5, 0', t0: 0, t1: 6, dt: 0.002, solver: 'rk4', x: 't', y: 'y',
  },
  {
    id: 'binary', domain: 'astro',
    label: L('Двойная система', 'Binary system'),
    desc: L('Две звезды вокруг барицентра (m1=2, m2=1)', 'Two stars around barycenter (m1=2, m2=1)'),
    states: 'x1, y1, vx1, vy1, x2, y2, vx2, vy2',
    derivs: 'vx1; vy1; -G*m2*(x1-x2)/r^3; -G*m2*(y1-y2)/r^3; vx2; vy2; G*m1*(x1-x2)/r^3; G*m1*(y1-y2)/r^3',
    aux: 'r := sqrt((x1-x2)^2 + (y1-y2)^2)',
    params: [{ name: 'G', def: '1' }, { name: 'm1', def: '2' }, { name: 'm2', def: '1' }],
    init: '-0.6667, 0, 0, -0.4082, 1.3333, 0, 0, 0.8165',
    t0: 0, t1: 10.3, dt: 0.005, solver: 'rk4', x: 'x1', y: 'y1',
  },
  {
    id: 'figure8', domain: 'astro',
    label: L('Восьмёрка трёх тел', 'Figure-8 three-body'),
    desc: L('Знаменитая периодическая орбита Мура (G=m=1)', "Moore's periodic orbit (G=m=1)"),
    states: 'x1, y1, vx1, vy1, x2, y2, vx2, vy2, x3, y3, vx3, vy3',
    derivs: 'vx1; vy1; (x2-x1)/r12^3 + (x3-x1)/r13^3; (y2-y1)/r12^3 + (y3-y1)/r13^3; vx2; vy2; (x1-x2)/r12^3 + (x3-x2)/r23^3; (y1-y2)/r12^3 + (y3-y2)/r23^3; vx3; vy3; (x1-x3)/r13^3 + (x2-x3)/r23^3; (y1-y3)/r13^3 + (y2-y3)/r23^3',
    aux: 'r12 := sqrt((x1-x2)^2 + (y1-y2)^2)\nr13 := sqrt((x1-x3)^2 + (y1-y3)^2)\nr23 := sqrt((x2-x3)^2 + (y2-y3)^2)',
    params: [],
    init: '-0.97000436, 0.24308753, 0.466203685, 0.43236573, 0.97000436, -0.24308753, 0.466203685, 0.43236573, 0, 0, -0.93240737, -0.86473146',
    t0: 0, t1: 6.33, dt: 0.002, solver: 'rk4', x: 'x1', y: 'y1',
  },
  {
    id: 'slab', domain: 'optics', mode: 'fdtd',
    label: L('Импульс через пластину', 'Pulse through slab'),
    desc: L('Гауссов импульс: отражение и прохождение слоя eps=4', 'Gaussian pulse: reflection and transmission at eps=4 slab'),
    states: '', derivs: '', aux: '', params: [], init: '',
    t0: 0, t1: 0, dt: 0, solver: 'rk4', x: 't', y: '',
    fdtd: { n: 400, length: 20, steps: 1500, src: 'gauss', freq: 1, amp: 1, srcX: 4, det: 16, layers: '8, 12, 4' },
  },
  {
    id: 'mirror', domain: 'optics', mode: 'fdtd',
    label: L('Отражение от зеркала', 'Mirror reflection'),
    desc: L('Импульс отражается от плотного слоя eps=100', 'Pulse reflects off a dense eps=100 slab'),
    states: '', derivs: '', aux: '', params: [], init: '',
    t0: 0, t1: 0, dt: 0, solver: 'rk4', x: 't', y: '',
    fdtd: { n: 400, length: 20, steps: 1500, src: 'gauss', freq: 1, amp: 1, srcX: 4, det: 16, layers: '9, 11, 100' },
  },
  {
    id: 'bragg', domain: 'optics', mode: 'fdtd',
    label: L('Зеркало Брэгга', 'Bragg mirror'),
    desc: L('Два слоя eps=4: многократные отражения', 'Two eps=4 slabs: multiple reflections'),
    states: '', derivs: '', aux: '', params: [], init: '',
    t0: 0, t1: 0, dt: 0, solver: 'rk4', x: 't', y: '',
    fdtd: { n: 400, length: 20, steps: 2000, src: 'gauss', freq: 1, amp: 1, srcX: 4, det: 16, layers: '8, 9, 4\n11, 12, 4' },
  },
];

export function getSimModel(id: string): SimModel | undefined {
  return SIM_MODELS.find((m) => m.id === id);
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
  const m = getSimModel('pendulum') ?? SIM_MODELS[0];
  return simModelPatch(m);
}
