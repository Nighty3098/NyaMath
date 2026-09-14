/**
 * Движок симуляций Wengineering: численное интегрирование систем ОДУ
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
import { t, type LText } from '../i18n';

export type SimSolver = 'euler' | 'rk4' | 'rk45';

export const SIM_SOLVERS: SimSolver[] = ['euler', 'rk4', 'rk45'];

/** Ограничения: честность вместо молчаливой деградации. */
const MAX_FIXED_STEPS = 200000;
const MAX_PTS = 20000;
const MAX_ITERS = 2000000;

export interface SimDef {
  states: string[];
  derivs: string[];
  aux: { name: string; expr: string }[];
  params: { name: string; expr: string }[];
  init: string[];
  t0: number;
  t1: number;
  dt: number;
  solver: SimSolver;
}

export interface SimSeries {
  name: string;
  ys: number[];
}

export interface SimResult {
  ts: number[];
  series: SimSeries[];
  /** значение состояний в конце (для экспорта в документ) */
  final: number[];
  steps: number;
  error: string | null;
}

const VAR_RE = /^[A-Za-z_]\w*$/;

/** Разобрать текстовые поля sim-блока в SimDef (проверки, без вычисления). */
export function parseSimDef(raw: {
  states: string;
  derivs: string;
  aux?: string;
  params?: string;
  init: string;
  t0: number;
  t1: number;
  dt: number;
  solver: SimSolver;
}): { def: SimDef | null; error: string | null } {
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
  return {
    def: { states, derivs: derivsClean, aux, params, init, t0, t1, dt, solver: raw.solver },
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
  const fail = (error: string): SimResult => ({ ts: [], series: [], final: [], steps: 0, error });
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

    const ts: number[] = [def.t0];
    const traj: number[][] = [y0.slice()];
    let steps = 0;

    const checkFinite = (y: number[], tt: number) => {
      for (let i = 0; i < n; i++) {
        if (!isFinite(y[i])) throw { msg: t('e.simNan', { state: def.states[i], t: fmtT(tt) }) };
      }
    };
    checkFinite(y0, def.t0);

    if (def.solver === 'rk45') {
      integrateRK45(def, rhs, ts, traj, checkFinite);
      steps = ts.length - 1;
    } else {
      const total = Math.ceil((def.t1 - def.t0) / def.dt);
      if (total > MAX_FIXED_STEPS) throw { msg: t('e.simSteps', { max: MAX_FIXED_STEPS }) };
      const h = (def.t1 - def.t0) / total;
      let y = y0.slice();
      let tt = def.t0;
      for (let k = 0; k < total; k++) {
        y = def.solver === 'euler' ? stepEuler(rhs, tt, y, h) : stepRK4(rhs, tt, y, h);
        tt = k === total - 1 ? def.t1 : tt + h;
        checkFinite(y, tt);
        traj.push(y.slice());
        ts.push(tt);
      }
      steps = total;
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
    return { ts: rts, series, final: last.slice(), steps, error: null };
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

/** Адаптивный Дорман–Принс RK45 (rtol 1e-6). Бросает {msg} при превышении лимитов. */
function integrateRK45(
  def: SimDef,
  rhs: (t: number, y: number[]) => number[],
  ts: number[],
  traj: number[][],
  checkFinite: (y: number[], t: number) => void,
): void {
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
    }
    h = Math.max(1e-12, Math.min(hNew, hMax));
  }
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
];

export function getSimModel(id: string): SimModel | undefined {
  return SIM_MODELS.find((m) => m.id === id);
}

/** Патч полей блока для применения модели (label локализуется через lx). */
export function simModelPatch(m: SimModel): {
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
  simX: string;
  simY: string;
} {
  return {
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
    simX: m.x,
    simY: m.y,
  };
}

/** Дефолт нового sim-блока: маятник. */
export function defaultSimPatch(): ReturnType<typeof simModelPatch> {
  const m = getSimModel('pendulum') ?? SIM_MODELS[0];
  return simModelPatch(m);
}
