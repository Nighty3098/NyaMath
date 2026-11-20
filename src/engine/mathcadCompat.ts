/**
 * Слой совместимости с функциями Mathcad 15/Prime.
 *
 * Часть функций Mathcad уже совпадает с mathjs/паками NyaMath (`sin`, `det`,
 * `linfit`, …). Здесь собраны функции, которых в движке не было, но которые
 * встречаются в импортируемых листах или входят в базовый математический
 * набор Mathcad: random/distribution, matrices, strings, finance.
 *
 * Функции из дополнительных пакетов (image processing, wavelets, signal)
 * попадают в каталог БД как `unsupported`: при импорте они не теряются, а
 * получают явную заметку вместо молчаливого `Undefined symbol`.
 */
import type { MathJsInstance, MathNode } from 'mathjs';
import { t } from '../i18n';

/** Имена, которые добавляет этот слой (используются и в PACK_NAMES). */
export const MATHCAD_COMPAT_NAMES = [
  // Точные/почти точные аналоги, которых не было в_BASE scope.
  'ln0',
  'trunc',
  'Ceil',
  'Floor',
  'Round',
  'Trunc',
  'mantissa',
  'digamma',
  'beta',
  'fibonacci',
  'logspace',
  'signum',
  'csgn',
  'mcAtan2',
  'mcAngle',
  'mod',
  'svds',
  'mcVar',
  'mcVarSample',
  'mcStdev',
  'mcStdevSample',
  'mcGMean',
  'mcHMean',
  'mcSkew',
  'mcKurt',
  'mcPercentile',
  'mcHistogram',
  'mcCovar',
  'mcSlope',
  'mcIntercept',
  'mcRank',
  'mcTrim',
  'mcThreeSigma',
  'mcGrubbsClassic',
  'last',
  'length',
  'submatrix',
  'stack',
  'augment3',
  'reverse',
  'rsort',
  'csort',
  'rowgrad',
  'colgrad',
  'matcol',
  'matrow',
  'geninv',
  'rref',
  'lu',
  'cholesky',
  'eigenvecs',
  'svd2',
  'vectorize',
  'fract',
  'log1p',
  'logGamma',
  'erfc',
  'norm1',
  'norm2',
  'norme',
  'normi',
  'cnorm',
  'combin',
  'permut',
  'isScalar',
  'str2num',
  'str2vec',
  'vec2str',
  'interp',
  'linterp',
  'polyval',
  'cumint',
  'trapz',
  'Seed',
  'randomize',
  'rnd',
  'rbinom',
  'rnorm',
  'runif',
  'rexp',
  'rgamma',
  'rbeta',
  'rcauchy',
  'rchisq',
  'rF',
  'rgeom',
  'rhypergeom',
  'rlnorm',
  'rlogis',
  'rnbinom',
  'rt',
  'rweibull',
  'dnorm',
  'pnorm',
  'qnorm',
  'dbeta',
  'pbeta',
  'qbeta',
  'dbinom',
  'pbinom',
  'qbinom',
  'dcauchy',
  'pcauchy',
  'qcauchy',
  'dchisq',
  'pchisq',
  'qchisq',
  'dexp',
  'pexp',
  'qexp',
  'dF',
  'pF',
  'qF',
  'dgamma',
  'pgamma',
  'qgamma',
  'dgeom',
  'pgeom',
  'qgeom',
  'dhypergeom',
  'phypergeom',
  'qhypergeom',
  'dlnorm',
  'plnorm',
  'qlnorm',
  'dlogis',
  'plogis',
  'qlogis',
  'dnbinom',
  'pnbinom',
  'qnbinom',
  'dpois',
  'ppois',
  'qpois',
  'dt',
  'pt',
  'qt',
  'dunif',
  'punif',
  'qunif',
  'dweibull',
  'pweibull',
  'qweibull',
  'fv',
  'fvadj',
  'fvc',
  'ipmt',
  'irr',
  'nper',
  'npv',
  'pmt',
  'ppmt',
  'pv',
  'rate',
] as const;

type NumFn = (x: number) => number;
type Scope = Record<string, unknown>;

const LANCZOS = [
  0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
  -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6,
  1.5056327351493116e-7,
];

function logGamma(z: number): number {
  if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - logGamma(1 - z);
  const x = z - 1;
  let a = LANCZOS[0] as number;
  for (let i = 1; i < LANCZOS.length; i++) a += (LANCZOS[i] as number) / (x + i);
  const g = x + 7.5;
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(g) - g + Math.log(a);
}

/** Регуляризованная верхняя неполная гамма-функция Q(a,x). */
function gammaQ(a: number, x: number): number {
  if (x < 0 || a <= 0) return NaN;
  if (x === 0) return 1;
  const gln = logGamma(a);
  if (x < a + 1) {
    let sum = 1 / a;
    let term = sum;
    for (let n = 1; n < 1000; n++) {
      term *= x / (a + n);
      sum += term;
      if (Math.abs(term) < Math.abs(sum) * 1e-14) break;
    }
    return 1 - (sum * Math.exp(-x + a * Math.log(x) - gln));
  }
  let b = x + 1 - a;
  let c = 1e300;
  let d = 1 / b;
  let h = d;
  for (let i = 1; i < 1000; i++) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < 1e-300) d = 1e-300;
    c = b + an / c;
    if (Math.abs(c) < 1e-300) c = 1e-300;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 1e-14) break;
  }
  return Math.exp(-x + a * Math.log(x) - gln) * h;
}

function gammaP(a: number, x: number): number {
  return 1 - gammaQ(a, x);
}

/** Непрерывная дробь для регуляризованной неполной бета-функции. */
function betaCf(a: number, b: number, x: number): number {
  const tiny = 1e-300;
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < tiny) d = tiny;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= 300; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < tiny) d = tiny;
    c = 1 + aa / c;
    if (Math.abs(c) < tiny) c = tiny;
    d = 1 / d;
    h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < tiny) d = tiny;
    c = 1 + aa / c;
    if (Math.abs(c) < tiny) c = tiny;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 1e-14) break;
  }
  return h;
}

function betaI(x: number, a: number, b: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const bt = Math.exp(
    logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log(1 - x),
  );
  if (x < (a + 1) / (a + b + 2)) return (bt * betaCf(a, b, x)) / a;
  return 1 - (bt * betaCf(b, a, 1 - x)) / b;
}

function erf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const z = Math.abs(x);
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;
  const q = 1 / (1 + p * z);
  const y = 1 - ((((a5 * q + a4) * q + a3) * q + a2) * q + a1) * q * Math.exp(-z * z);
  return sign * y;
}

const normPdf = (x: number, mu: number, sigma: number): number =>
  Math.exp(-0.5 * ((x - mu) / sigma) ** 2) / (sigma * Math.sqrt(2 * Math.PI));
const normCdf = (x: number, mu: number, sigma: number): number =>
  0.5 * (1 + erf((x - mu) / (sigma * Math.SQRT2)));

/** Обратная стандартного нормального распределения (Acklam, ~1e-9). */
function normalQuantile(p: number): number {
  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2, -3.066479806614716e1, 2.506628277459239];
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1];
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  if (p < 0.02425) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0]! * q + c[1]!) * q + c[2]!) * q + c[3]!) * q + c[4]!) * q + c[5]!) /
      ((((d[0]! * q + d[1]!) * q + d[2]!) * q + d[3]!) * q + 1);
  }
  if (p > 0.97575) return -normalQuantile(1 - p);
  const q = p - 0.5;
  const r = q * q;
  return (((((a[0]! * r + a[1]!) * r + a[2]!) * r + a[3]!) * r + a[4]!) * r + a[5]!) * q /
    (((((b[0]! * r + b[1]!) * r + b[2]!) * r + b[3]!) * r + b[4]!) * r + 1);
}

function invCdf(cdf: NumFn, p: number, lo: number, hi: number): number {
  if (p <= 0) return lo;
  if (p >= 1) return hi;
  let a = lo;
  let b = hi;
  for (let i = 0; i < 200; i++) {
    const m = (a + b) / 2;
    if (cdf(m) < p) a = m;
    else b = m;
    if (b - a < 1e-13 * (1 + Math.abs(m))) break;
  }
  return (a + b) / 2;
}

/** С语言中 Mathcad-совместимый слой: только чистые функции, без состояния UI. */
export function buildMathcadScope(math: MathJsInstance): Scope {
  const asNum = (v: unknown): number => {
    const n = Number(v);
    if (!Number.isFinite(n)) throw new Error(t('e.calcArgs'));
    return n;
  };
  const optNum = (v: unknown, fallback: number): number =>
    v === undefined || v === null || v === '' ? fallback : asNum(v);
  const intArg = (v: unknown): number => {
    const n = asNum(v);
    if (!Number.isInteger(n) || n < 0) throw new Error(t('e.calcArgs'));
    return n;
  };
  const toArr = (v: unknown): unknown[] => {
    if (Array.isArray(v)) return v.flat(Infinity);
    if (v !== null && typeof v === 'object' && 'toArray' in (v as object)) {
      return ((v as { toArray: () => unknown[] }).toArray() as unknown[]).flat(Infinity);
    }
    return [v];
  };
  const toVec = (v: unknown): number[] => toArr(v).map(asNum);
  const toMat = (v: unknown): number[][] => {
    if (Array.isArray(v)) return v.map((r) => (Array.isArray(r) ? r : [r])).map((r) => r.map(asNum));
    if (v !== null && typeof v === 'object' && 'toArray' in (v as object)) {
      const a = (v as { toArray: () => unknown[] }).toArray() as unknown[];
      return a.map((r) => (Array.isArray(r) ? r : [r])).map((r) => r.map(asNum));
    }
    return [[asNum(v)]];
  };
  const mat = (a: number[][] | number[]): unknown => math.matrix(a as never);
  const vmap = (v: unknown, f: NumFn): unknown => {
    const a = toArr(v);
    const out = a.map((x) => f(asNum(x)));
    return Array.isArray(v) || (v !== null && typeof v === 'object') ? mat(out) : (out[0] as number);
  };

  /* ------------------------- RNG (Seed / randomize) ------------------------ */
  let rngState = 0x1a2b3c4d;
  const rand = (): number => {
    rngState = (Math.imul(1664525, rngState) + 1013904223) >>> 0;
    return rngState / 4294967296;
  };
  const normalSample = (mu = 0, sigma = 1): number => {
    const u = Math.max(rand(), 1e-12);
    const v = rand();
    return mu + sigma * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
  const gammaSample = (shape: number): number => {
    if (shape <= 0) return NaN;
    if (shape < 1) return gammaSample(shape + 1) * rand() ** (1 / shape);
    const d = shape - 1 / 3;
    const c = 1 / Math.sqrt(9 * d);
    for (;;) {
      const x = normalSample();
      const v = (1 + c * x) ** 3;
      if (v <= 0) continue;
      const u = rand();
      if (u < 1 - 0.0331 * x ** 4 || Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) {
        return d * v;
      }
    }
  };
  const betaSample = (a: number, b: number): number => {
    const x = gammaSample(a);
    const y = gammaSample(b);
    return x / (x + y);
  };
  const binomSample = (n: number, p: number): number => {
    if (n <= 1000) {
      let k = 0;
      for (let i = 0; i < n; i++) if (rand() < p) k++;
      return k;
    }
    return Math.max(0, Math.min(n, Math.round(n * p + Math.sqrt(n * p * (1 - p)) * normalSample())));
  };
  const poissonSample = (lambda: number): number => {
    if (lambda < 30) {
      const lim = Math.exp(-lambda);
      let k = 0;
      let p = 1;
      do {
        k++;
        p *= rand();
      } while (p > lim);
      return k - 1;
    }
    return Math.max(0, Math.round(lambda + Math.sqrt(lambda) * normalSample()));
  };
  const sample = (n: number, f: () => number): unknown => mat(Array.from({ length: n }, f));

  /* ---------------------------cdf / pdf helpers --------------------------- */
  const tCdf = (x: number, nu: number): number => {
    const z = nu / (nu + x * x);
    return x < 0 ? 0.5 * betaI(z, nu / 2, 0.5) : 1 - 0.5 * betaI(z, nu / 2, 0.5);
  };
  const fCdf = (x: number, d1: number, d2: number): number =>
    x <= 0 ? 0 : betaI((d1 * x) / (d1 * x + d2), d1 / 2, d2 / 2);
  const poisCdf = (k: number, lambda: number): number => {
    let sum = Math.exp(-lambda);
    let term = sum;
    for (let i = 1; i <= Math.floor(k); i++) {
      term *= lambda / i;
      sum += term;
    }
    return sum;
  };
  const binomCdf = (k: number, n: number, p: number): number =>
    k >= n ? 1 : k < 0 ? 0 : betaI(1 - p, n - k, k + 1);
  const nbinomCdf = (k: number, r: number, p: number): number => betaI(p, r, k + 1);
  const hyperPmf = (k: number, N: number, K: number, n: number): number => {
    const choose = (a: number, b: number): number =>
      Math.exp(logGamma(a + 1) - logGamma(b + 1) - logGamma(a - b + 1));
    return (choose(K, k) * choose(N - K, n - k)) / choose(N, n);
  };

  const dbinomPmf = (k: number, n: number, p: number): number => {
    if (!Number.isInteger(k) || k < 0 || k > n) return 0;
    return (
      Math.exp(logGamma(n + 1) - logGamma(k + 1) - logGamma(n - k + 1)) *
      p ** k *
      (1 - p) ** (n - k)
    );
  };
  const dnbinomPmf = (k: number, r: number, p: number): number =>
    Math.exp(logGamma(k + r) - logGamma(r) - logGamma(k + 1)) * p ** r * (1 - p) ** k;
  const dpoisPmf = (k: number, lambda: number): number =>
    Number.isInteger(k) && k >= 0 ? Math.exp(-lambda + k * Math.log(lambda) - logGamma(k + 1)) : 0;
  const dgeomPmf = (k: number, p: number): number =>
    Number.isInteger(k) && k >= 0 ? p * (1 - p) ** k : 0;
  const dhyperPmf = (k: number, N: number, K: number, n: number): number => {
    const lo = Math.max(0, n - (N - K));
    const hi = Math.min(n, K);
    return k < lo || k > hi ? 0 : hyperPmf(k, N, K, n);
  };

  const linterpFn = (xs: unknown, ys: unknown, xq: unknown): number => {
    const x = toVec(xs);
    const y = toVec(ys);
    const q = asNum(xq);
    if (x.length !== y.length || x.length < 2) throw new Error(t('e.calcArgs'));
    if (q <= (x[0] as number)) return y[0] as number;
    if (q >= (x[x.length - 1] as number)) return y[y.length - 1] as number;
    let i = 0;
    while ((x[i + 1] as number) < q) i++;
    const w = (q - (x[i] as number)) / ((x[i + 1] as number) - (x[i] as number));
    return (y[i] as number) + w * ((y[i + 1] as number) - (y[i] as number));
  };

  const fvFn = (rate: unknown, n: unknown, payment: unknown, present?: unknown): number => {
    const r = asNum(rate);
    const N = asNum(n);
    const P = asNum(payment);
    const V = optNum(present, 0);
    return r === 0 ? -(V + P * N) : -(V * (1 + r) ** N + P * (((1 + r) ** N - 1) / r));
  };
  const pmtFn = (rate: unknown, n: unknown, present: unknown, future?: unknown): number => {
    const r = asNum(rate);
    const N = asNum(n);
    if (r === 0) return -(asNum(present) + optNum(future, 0)) / N;
    const f = (1 + r) ** N;
    return (-(asNum(present) * f + optNum(future, 0)) * r) / (f - 1);
  };
  const ipmtFn = (
    rate: unknown,
    period: unknown,
    n: unknown,
    present: unknown,
    future?: unknown,
  ): number => -fvFn(rate, asNum(period) - 1, pmtFn(rate, n, present, future), present) * asNum(rate);
  const phyperFn = (k: unknown, N: unknown, K: unknown, n: unknown): number => {
    const NN = asNum(N);
    const KK = asNum(K);
    const nn = asNum(n);
    let s = 0;
    for (let i = Math.max(0, nn - (NN - KK)); i <= asNum(k); i++) s += hyperPmf(i, NN, KK, nn);
    return s;
  };

  /* --------------------------- additional helpers -------------------------- */

  const rawArray = (v: unknown): unknown[] => {
    if (Array.isArray(v)) return v;
    if (v !== null && typeof v === 'object' && 'toArray' in (v as object)) {
      return (v as { toArray: () => unknown[] }).toArray() as unknown[];
    }
    return [v];
  };
  const numArgs = (args: unknown[]): number[] => args.flatMap(toArr).map(asNum);
  const meanOf = (a: number[]): number => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : NaN);
  const varianceOf = (a: number[], sample = false): number => {
    if (a.length < (sample ? 2 : 1)) return NaN;
    const m = meanOf(a);
    const d = a.length - (sample ? 1 : 0);
    return a.reduce((s, v) => s + (v - m) ** 2, 0) / d;
  };
  const sdOf = (a: number[], sample = false): number => Math.sqrt(varianceOf(a, sample));
  const sortedOf = (a: number[]): number[] => a.slice().sort((x, y) => x - y);
  const complexParts = (v: unknown): { re: number; im: number } => {
    if (v !== null && typeof v === 'object' && 're' in (v as object) && 'im' in (v as object)) {
      const o = v as { re: unknown; im: unknown };
      return { re: asNum(o.re), im: asNum(o.im) };
    }
    return { re: asNum(v), im: 0 };
  };

  /** Mathcad vectorize — вычислить выражение для каждого элемента вектора. */
  type RawCompatFn = ((args: MathNode[], math: MathJsInstance, scope: Scope) => unknown) & {
    rawArgs?: boolean;
  };
  const rawCompat = (fn: RawCompatFn): RawCompatFn => {
    fn.rawArgs = true;
    return fn;
  };
  /** Чтение значения из scope: может быть mathjs Scope (.get) или обычный объект. */
  const scopeGet = (scope: Scope, name: string): unknown => {
    const s = scope as Scope & { get?: (n: string) => unknown };
    return s.get ? s.get(name) : s[name];
  };
  const evalNode = (node: MathNode, scope: Scope): unknown =>
    (node as MathNode & { compile: (m: MathJsInstance) => { evaluate: (s: Scope) => unknown } })
      .compile(math)
      .evaluate(scope);
  const vectorSymbols = (node: MathNode, scope: Scope): string[] => {
    const out = new Set<string>();
    node.traverse((n: MathNode) => {
      const s = n as MathNode & { isSymbolNode?: boolean; name?: string };
      if (!s.isSymbolNode || !s.name) return;
      if (isVectorValue(scopeGet(scope, s.name))) out.add(s.name!);
    });
    return [...out];
  };
  const isVectorValue = (v: unknown): boolean =>
    Array.isArray(v) || (v !== null && typeof v === 'object' && 'toArray' in (v as object));

  /** Сингулярные значения/векторы через собственные значения AᵀA (Jacobi mathjs). */
  const svdCore = (m: unknown): { s: number[]; u: number[][]; v: number[][] } => {
    const a = toMat(m);
    const cols = a[0]?.length ?? 0;
    const rowsN = a.length;
    const ata = Array.from({ length: cols }, (_, i) =>
      Array.from({ length: cols }, (_, j) =>
        a.reduce((sum, row) => sum + (row[i] as number) * (row[j] as number), 0),
      ),
    );
    const eig = math.eigs(math.matrix(ata as never) as never) as unknown as {
      eigenvectors: Array<{ value: number; vector: { toArray: () => unknown[] } }>;
    };
    const pairs = eig.eigenvectors
      .map((e) => ({
        value: Math.sqrt(Math.max(0, Number(e.value))),
        vector: e.vector.toArray().flat().map(asNum),
      }))
      .sort((x, y) => y.value - x.value);
    const v = pairs.map((p) => p.vector);
    const u = Array.from({ length: rowsN }, (_, i) =>
      pairs.map((p) => {
        const val = p.vector.reduce((s, x, j) => s + (a[i]?.[j] as number) * x, 0);
        return p.value > 1e-12 ? val / p.value : 0;
      }),
    );
    return { s: pairs.map((p) => p.value), u, v };
  };

  const S: Scope = {
    /* ------------------------------ vectors ------------------------------ */
    last: (v: unknown) => toArr(v).length - 1,
    length: (v: unknown) => toArr(v).length,
    reverse: (v: unknown) => {
      const a = rawArray(v);
      if (Array.isArray(a[0])) return mat((a as number[][]).slice().reverse());
      return mat((a as number[]).slice().reverse());
    },
    submatrix: (m: unknown, r0: unknown, r1: unknown, c0: unknown, c1: unknown) => {
      const a = toMat(m);
      const R0 = intArg(r0);
      const R1 = intArg(r1);
      const C0 = intArg(c0);
      const C1 = intArg(c1);
      return mat(a.slice(R0, R1 + 1).map((row) => row.slice(C0, C1 + 1)));
    },
    stack: (...parts: unknown[]) => mat(parts.flatMap((p) => toMat(p))),
    augment3: (...parts: unknown[]) => {
      const mats = parts.map(toMat);
      const rowsN = Math.max(0, ...mats.map((m) => m.length));
      return mat(
        Array.from({ length: rowsN }, (_, i) =>
          mats.flatMap((m) => m[i] ?? new Array<number>(m[0]?.length ?? 0).fill(0)),
        ),
      );
    },
    rowgrad: (m: unknown) => mat(toMat(m).map((r) => r.slice(1).map((v, i) => v - (r[i] as number)))),
    colgrad: (m: unknown) => {
      const a = toMat(m);
      return mat(a.slice(1).map((r, i) => r.map((v, j) => v - (a[i]?.[j] as number))));
    },
    matcol: (m: unknown, j: unknown) => mat(toMat(m).map((r) => [r[intArg(j)] ?? 0])),
    matrow: (m: unknown, i: unknown) => mat([toMat(m)[intArg(i)] ?? []]),
    rsort: (m: unknown, row = 0) => {
      const a = toMat(m);
      const idx = (a[0] ?? [])
        .map((_, j) => j)
        .sort((i, j) => (a[intArg(row)]?.[i] as number) - (a[intArg(row)]?.[j] as number));
      return mat(a.map((r) => idx.map((j) => r[j] as number)));
    },
    csort: (m: unknown, col = 0) => {
      const a = toMat(m);
      const idx = a
        .map((_, i) => i)
        .sort((i, j) => (a[i]?.[intArg(col)] as number) - (a[j]?.[intArg(col)] as number));
      return mat(idx.map((i) => a[i] ?? []));
    },
    vectorize: rawCompat((args, _m, scope) => {
      const expr = args[0];
      if (!expr) return null;
      const names = vectorSymbols(expr, scope);
      if (!names.length) return evalNode(expr, scope);
      const columns = names.map((n) => toArr(scopeGet(scope, n)));
      const count = Math.max(1, ...columns.map((c) => c.length));
      const out = Array.from({ length: count }, (_, i) => {
        const local: Scope = {};
        names.forEach((n, k) => {
          local[n] = columns[k]?.[i] ?? columns[k]?.[0];
        });
        return evalNode(expr, local);
      });
      return out.every((v) => typeof v === 'number') ? mat(out as number[]) : out;
    }),
    geninv: (m: unknown) => {
      const a = toMat(m);
      const at = a[0]?.map((_, j) => a.map((r) => r[j] as number)) ?? [];
      const ata = at.map((row) => a[0]?.map((_, k) => row.reduce((s, v, i) => s + v * (a[i]?.[k] as number), 0)) ?? []);
      const inv = math.inv(mat(ata) as never) as unknown as { toArray: () => number[][] };
      return mat(inv.toArray().map((row) =>
        at[0]?.map((_, j) => row.reduce((s, v, i) => s + v * (at[i]?.[j] as number), 0)) ?? [],
      ));
    },
    rref: (m: unknown) => {
      const a = toMat(m).map((r) => r.slice());
      const rowsN = a.length;
      const colsN = a[0]?.length ?? 0;
      let pivotRow = 0;
      for (let col = 0; col < colsN && pivotRow < rowsN; col++) {
        let best = pivotRow;
        for (let r = pivotRow + 1; r < rowsN; r++) {
          if (Math.abs(a[r]?.[col] as number) > Math.abs(a[best]?.[col] as number)) best = r;
        }
        if (Math.abs(a[best]?.[col] as number) < 1e-12) continue;
        [a[pivotRow], a[best]] = [a[best] as number[], a[pivotRow] as number[]];
        const piv = a[pivotRow]?.[col] as number;
        a[pivotRow] = (a[pivotRow] as number[]).map((v) => v / piv);
        for (let r = 0; r < rowsN; r++) {
          if (r === pivotRow) continue;
          const f = a[r]?.[col] as number;
          a[r] = (a[r] as number[]).map((v, j) => v - f * (a[pivotRow]?.[j] as number));
        }
        pivotRow++;
      }
      return mat(a);
    },
    cholesky: (m: unknown) => {
      const a = toMat(m);
      const n = a.length;
      const l = Array.from({ length: n }, () => new Array<number>(n).fill(0));
      for (let i = 0; i < n; i++) {
        for (let j = 0; j <= i; j++) {
          let s = 0;
          for (let k = 0; k < j; k++) s += (l[i]?.[k] as number) * (l[j]?.[k] as number);
          const v = (a[i]?.[j] as number) - s;
          if (i === j) {
            if (v <= 0) throw new Error(t('e.calcArgs'));
            l[i]![j] = Math.sqrt(v);
          } else l[i]![j] = v / (l[j]?.[j] as number);
        }
      }
      return mat(l);
    },
    lu: (m: unknown) => {
      const a = toMat(m).map((r) => r.slice());
      const n = a.length;
      const l = Array.from({ length: n }, () => new Array<number>(n).fill(0));
      const p = Array.from({ length: n }, (_, i) => i);
      for (let k = 0; k < n; k++) {
        let best = k;
        for (let i = k + 1; i < n; i++) {
          if (Math.abs(a[i]?.[k] as number) > Math.abs(a[best]?.[k] as number)) best = i;
        }
        if (best !== k) {
          [a[k], a[best]] = [a[best] as number[], a[k] as number[]];
          [p[k], p[best]] = [p[best] as number, p[k] as number];
          for (let j = 0; j < k; j++) [l[k]![j], l[best]![j]] = [l[best]![j] as number, l[k]![j] as number];
        }
        const piv = a[k]?.[k] as number;
        if (Math.abs(piv) < 1e-14) throw new Error(t('e.calcArgs'));
        for (let i = k + 1; i < n; i++) {
          l[i]![k] = (a[i]?.[k] as number) / piv;
          for (let j = k; j < n; j++) a[i]![j] = (a[i]?.[j] as number) - (l[i]![k] as number) * (a[k]?.[j] as number);
        }
      }
      for (let i = 0; i < n; i++) l[i]![i] = 1;
      const pm = Array.from({ length: n }, (_, i) =>
        Array.from({ length: n }, (_, j) => (p[i] === j ? 1 : 0)),
      );
      return [mat(pm), mat(l), mat(a)];
    },
    eigenvecs: (m: unknown) => {
      const eig = math.eigs(mat(toMat(m)) as never) as unknown as {
        eigenvectors: Array<{ vector: { toArray: () => unknown[] } }>;
      };
      const cols = eig.eigenvectors.map((x) => x.vector.toArray().flat().map(asNum));
      return mat(
        (cols[0] ?? []).map((_, j) => cols.map((r) => r[j] as number)),
      );
    },
    svd2: (m: unknown) => {
      const { s, u, v } = svdCore(m);
      return [mat(s), mat(u), mat(v)];
    },
    svds: (m: unknown) => mat(svdCore(m).s),

    /* ------------------------ elementary / special ----------------------- */
    fract: (x: unknown) => {
      const v = asNum(x);
      return v - Math.trunc(v);
    },
    ln0: (x: unknown) => {
      const v = asNum(x);
      return v === 0 ? -1e307 : Math.log(v);
    },
    trunc: (x: unknown) => Math.trunc(asNum(x)),
    Ceil: (x: unknown, multiple = 1) => Math.ceil(asNum(x) / asNum(multiple)) * asNum(multiple),
    Floor: (x: unknown, multiple = 1) => Math.floor(asNum(x) / asNum(multiple)) * asNum(multiple),
    Round: (x: unknown, multiple = 1) => Math.round(asNum(x) / asNum(multiple)) * asNum(multiple),
    Trunc: (x: unknown, multiple = 1) =>
      Math.trunc(asNum(x) / asNum(multiple)) * asNum(multiple),
    mantissa: (x: unknown) => {
      const v = asNum(x);
      if (v === 0) return 0;
      return v / 10 ** Math.floor(Math.log10(Math.abs(v)));
    },
    digamma: (x: unknown) => {
      let v = asNum(x);
      let r = 0;
      while (v < 6) {
        r -= 1 / v;
        v++;
      }
      const inv = 1 / v;
      return r + Math.log(v) - inv / 2 - inv ** 2 / 12 + inv ** 4 / 120 - inv ** 6 / 252;
    },
    beta: (x: unknown, a: unknown, b: unknown) => betaI(asNum(x), asNum(a), asNum(b)),
    fibonacci: (n: unknown) => {
      const k = intArg(n);
      let a = 0;
      let b = 1;
      for (let i = 0; i < k; i++) [a, b] = [b, a + b];
      return a;
    },
    logspace: (a: unknown, b: unknown, n: unknown) => {
      const lo = asNum(a);
      const hi = asNum(b);
      const count = intArg(n);
      if (count <= 0) return mat([]);
      if (count === 1) return mat([lo]);
      return mat(
        Array.from({ length: count }, (_, i) => lo * (hi / lo) ** (i / (count - 1))),
      );
    },
    signum: (z: unknown, atZero = 0) => {
      const { re, im } = complexParts(z);
      const mag = Math.hypot(re, im);
      return mag === 0 ? asNum(atZero) : re / mag;
    },
    csgn: (z: unknown) => {
      const { re, im } = complexParts(z);
      return re > 0 || (re === 0 && im >= 0) ? 1 : -1;
    },
    mcAtan2: (x: unknown, y: unknown) => Math.atan2(asNum(y), asNum(x)),
    mcAngle: (x: unknown, y: unknown) => {
      const a = Math.atan2(asNum(y), asNum(x));
      return a < 0 ? a + 2 * Math.PI : a;
    },
    mod: (x: unknown, y: unknown) => {
      const a = asNum(x);
      const b = asNum(y);
      if (b === 0) throw new Error(t('e.calcArgs'));
      return a - Math.trunc(a / b) * b;
    },
    log1p: (x: unknown) => Math.log1p(asNum(x)),
    logGamma,
    erfc: (x: unknown) => 1 - erf(asNum(x)),
    norm1: (v: unknown) => toVec(v).reduce((s, x) => s + Math.abs(x), 0),
    norm2: (v: unknown) => Math.hypot(...toVec(v)),
    norme: (v: unknown) => Math.sqrt(toVec(v).reduce((s, x) => s + x * x, 0)),
    normi: (v: unknown) => Math.max(...toVec(v).map(Math.abs)),
    cnorm: (x: unknown) => normCdf(asNum(x), 0, 1),
    combin: (n: unknown, k: unknown) => math.combinations(asNum(n), asNum(k)),
    permut: (n: unknown, k: unknown) => math.permutations(asNum(n), asNum(k)),
    isScalar: (v: unknown) => !Array.isArray(v) && !(v !== null && typeof v === 'object' && 'toArray' in v),
    str2num: (s: unknown) => {
      const n = Number(String(s).trim().replace(',', '.'));
      if (!Number.isFinite(n)) throw new Error(t('e.calcArgs'));
      return n;
    },
    str2vec: (s: unknown) => mat(String(s).split(/\s+/).filter(Boolean).map(Number)),
    vec2str: (v: unknown) => toArr(v).join(' '),

    /* --------------------------- statistics ------------------------------ */
    mcVar: (...args: unknown[]) => varianceOf(numArgs(args)),
    mcVarSample: (...args: unknown[]) => varianceOf(numArgs(args), true),
    mcStdev: (...args: unknown[]) => sdOf(numArgs(args)),
    mcStdevSample: (...args: unknown[]) => sdOf(numArgs(args), true),
    mcGMean: (...args: unknown[]) => {
      const a = numArgs(args);
      return Math.exp(meanOf(a.map(Math.log)));
    },
    mcHMean: (...args: unknown[]) => {
      const a = numArgs(args);
      return a.length / a.reduce((s, v) => s + 1 / v, 0);
    },
    mcSkew: (...args: unknown[]) => {
      const a = numArgs(args);
      const m = meanOf(a);
      const sd = sdOf(a);
      return a.reduce((s, v) => s + ((v - m) / sd) ** 3, 0) / a.length;
    },
    mcKurt: (...args: unknown[]) => {
      const a = numArgs(args);
      const m = meanOf(a);
      const sd = sdOf(a);
      return a.reduce((s, v) => s + ((v - m) / sd) ** 4, 0) / a.length - 3;
    },
    mcPercentile: (v: unknown, p: unknown) => {
      const a = toVec(v);
      const sorted = sortedOf(a);
      const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor((asNum(p) / 100) * sorted.length)));
      return a.filter((x) => x < sorted[idx]!).length;
    },
    mcHistogram: (intervals: unknown, data: unknown) => {
      const values = toVec(data);
      const n = intArg(intervals);
      const lo = Math.min(...values);
      const hi = Math.max(...values);
      const step = (hi - lo) / n;
      return mat(
        Array.from({ length: n }, (_, i) => {
          const a = lo + i * step;
          const b = a + step;
          return [
            (a + b) / 2,
            values.filter((x) => x >= a && (i === n - 1 ? x <= b : x < b)).length,
          ];
        }),
      );
    },
    mcCovar: (a: unknown, b: unknown) => {
      const x = toVec(a);
      const y = toVec(b);
      if (x.length !== y.length || !x.length) throw new Error(t('e.calcArgs'));
      const mx = meanOf(x);
      const my = meanOf(y);
      return x.reduce((s, v, i) => s + (v - mx) * ((y[i] as number) - my), 0) / x.length;
    },
    mcSlope: (x: unknown, y: unknown) => {
      const xs = toVec(x);
      const ys = toVec(y);
      const mx = meanOf(xs);
      const my = meanOf(ys);
      return (
        xs.reduce((s, v, i) => s + (v - mx) * ((ys[i] as number) - my), 0) /
        xs.reduce((s, v) => s + (v - mx) ** 2, 0)
      );
    },
    mcIntercept: (x: unknown, y: unknown) => {
      const mx = meanOf(toVec(x));
      const my = meanOf(toVec(y));
      return my - (S.mcSlope as (a: unknown, b: unknown) => number)(x, y) * mx;
    },
    mcRank: (v: unknown) => {
      const a = toVec(v);
      const order = a.map((x, i) => ({ x, i })).sort((p, q) => p.x - q.x);
      const ranks = new Array<number>(a.length);
      for (let i = 0; i < order.length; ) {
        let j = i;
        while (j + 1 < order.length && order[j + 1]!.x === order[i]!.x) j++;
        const avg = (i + j) / 2 + 1;
        for (let k = i; k <= j; k++) ranks[order[k]!.i] = avg;
        i = j + 1;
      }
      return mat(ranks);
    },
    mcTrim: (data: unknown, index: unknown) => {
      const a = toVec(data);
      const drop = new Set(toVec(index).map((x) => x - 1));
      return mat(a.filter((_, i) => !drop.has(i)));
    },
    mcThreeSigma: (data: unknown) => {
      const a = toVec(data);
      const m = meanOf(a);
      const sd = sdOf(a);
      return mat(
        a
          .map((x, i) => ({ i, z: Math.abs((x - m) / sd) }))
          .filter((p) => p.z > 3)
          .map((p) => [p.i, p.z]),
      );
    },
    mcGrubbsClassic: (data: unknown, _confidence = 0.05) => {
      const a = toVec(data);
      const sd = sdOf(a);
      const m = meanOf(a);
      let best = 0;
      let stat = -1;
      a.forEach((x, i) => {
        const z = Math.abs(x - m) / sd;
        if (z > stat) {
          stat = z;
          best = i;
        }
      });
      return mat([[best, stat]]);
    },

    /* ------------------------ interpolation / fits ----------------------- */
    linterp: linterpFn,
    interp: linterpFn,
    polyval: (coeffs: unknown, x: unknown) =>
      toVec(coeffs).reduce((acc, c) => acc * asNum(x) + c, 0),
    trapz: (x: unknown, y: unknown) => {
      const xx = toVec(x);
      const yy = toVec(y);
      let s = 0;
      for (let i = 1; i < xx.length; i++) s += ((xx[i] as number) - (xx[i - 1] as number)) * (((yy[i] as number) + (yy[i - 1] as number)) / 2);
      return s;
    },
    cumint: (x: unknown, y: unknown) => {
      const xx = toVec(x);
      const yy = toVec(y);
      const out = [0];
      for (let i = 1; i < xx.length; i++) {
        out.push((out[i - 1] as number) + ((xx[i] as number) - (xx[i - 1] as number)) * (((yy[i] as number) + (yy[i - 1] as number)) / 2));
      }
      return mat(out);
    },

    /* ------------------------------ RNG API ------------------------------ */
    Seed: (x: unknown) => {
      const previous = rngState;
      rngState = (intArg(x) || 1) >>> 0;
      return previous;
    },
    randomize: () => {
      rngState = (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
      return rngState;
    },
    rnd: (x?: unknown) => rand() * optNum(x, 1),
    rbinom: (n: unknown, trials: unknown, p: unknown) =>
      sample(intArg(n), () => binomSample(asNum(trials), asNum(p))),
    rnorm: (n: unknown, mu?: unknown, sigma?: unknown) =>
      sample(intArg(n), () => normalSample(optNum(mu, 0), optNum(sigma, 1))),
    runif: (n: unknown, a?: unknown, b?: unknown) => {
      const lo = optNum(a, 0);
      const hi = optNum(b, 1);
      return sample(intArg(n), () => lo + (hi - lo) * rand());
    },
    rexp: (n: unknown, rate?: unknown) => {
      const r = asNum(rate ?? 1);
      return sample(intArg(n), () => -Math.log(Math.max(rand(), 1e-12)) / r);
    },
    rgamma: (n: unknown, shape: unknown, scale?: unknown) => {
      const s = asNum(shape);
      const sc = optNum(scale, 1);
      return sample(intArg(n), () => gammaSample(s) * sc);
    },
    rbeta: (n: unknown, a: unknown, b: unknown) => sample(intArg(n), () => betaSample(asNum(a), asNum(b))),
    rcauchy: (n: unknown, x0?: unknown, gamma?: unknown) =>
      sample(intArg(n), () => optNum(x0, 0) + optNum(gamma, 1) * Math.tan(Math.PI * (rand() - 0.5))),
    rchisq: (n: unknown, nu: unknown) => sample(intArg(n), () => 2 * gammaSample(asNum(nu) / 2)),
    rF: (n: unknown, d1: unknown, d2: unknown) =>
      sample(intArg(n), () =>
        (gammaSample(asNum(d1) / 2) / asNum(d1)) / (gammaSample(asNum(d2) / 2) / asNum(d2)),
      ),
    rgeom: (n: unknown, p: unknown) =>
      sample(intArg(n), () => Math.floor(Math.log(Math.max(rand(), 1e-12)) / Math.log(1 - asNum(p)))),
    rhypergeom: (n: unknown, N: unknown, K: unknown, m: unknown) => {
      const NN = asNum(N);
      const KK = asNum(K);
      const mm = asNum(m);
      return sample(intArg(n), () => {
        let success = 0;
        let leftN = NN;
        let leftK = KK;
        for (let i = 0; i < mm; i++) {
          if (rand() < leftK / leftN) {
            success++;
            leftK--;
          }
          leftN--;
        }
        return success;
      });
    },
    rlnorm: (n: unknown, mu?: unknown, sigma?: unknown) =>
      sample(intArg(n), () => Math.exp(normalSample(optNum(mu, 0), optNum(sigma, 1)))),
    rlogis: (n: unknown, mu?: unknown, beta?: unknown) => {
      const m = optNum(mu, 0);
      const b = optNum(beta, 1);
      return sample(intArg(n), () => {
        const u = rand();
        return m + b * Math.log(u / (1 - u));
      });
    },
    rnbinom: (n: unknown, r: unknown, p: unknown) =>
      sample(intArg(n), () => {
        const lam = gammaSample(asNum(r));
        return poissonSample(lam * ((1 - asNum(p)) / asNum(p)));
      }),
    rt: (n: unknown, nu: unknown) => {
      const v = asNum(nu);
      return sample(intArg(n), () => normalSample() / Math.sqrt(gammaSample(v / 2) * 2 / v));
    },
    rweibull: (n: unknown, shape: unknown, scale?: unknown) => {
      const k = asNum(shape);
      const lambda = optNum(scale, 1);
      return sample(intArg(n), () => lambda * (-Math.log(Math.max(rand(), 1e-12))) ** (1 / k));
    },

    /* -------------------------- distributions ---------------------------- */
    dnorm: (x: unknown, mu?: unknown, sigma?: unknown) =>
      vmap(x, (z) => normPdf(z, optNum(mu, 0), optNum(sigma, 1))),
    pnorm: (x: unknown, mu?: unknown, sigma?: unknown) =>
      vmap(x, (z) => normCdf(z, optNum(mu, 0), optNum(sigma, 1))),
    qnorm: (p: unknown, mu?: unknown, sigma?: unknown) =>
      vmap(p, (z) => normalQuantile(z) * optNum(sigma, 1) + optNum(mu, 0)),

    dbeta: (x: unknown, a: unknown, b: unknown) =>
      vmap(x, (z) =>
        z <= 0 || z >= 1 ? 0 : Math.exp((asNum(a) - 1) * Math.log(z) + (asNum(b) - 1) * Math.log(1 - z) + logGamma(asNum(a) + asNum(b)) - logGamma(asNum(a)) - logGamma(asNum(b))),
      ),
    pbeta: (x: unknown, a: unknown, b: unknown) => vmap(x, (z) => betaI(z, asNum(a), asNum(b))),
    qbeta: (p: unknown, a: unknown, b: unknown) =>
      vmap(p, (z) => invCdf((x) => betaI(x, asNum(a), asNum(b)), z, 0, 1)),

    dbinom: (k: unknown, n: unknown, p: unknown) => vmap(k, (z) => dbinomPmf(z, asNum(n), asNum(p))),
    pbinom: (k: unknown, n: unknown, p: unknown) => vmap(k, (z) => binomCdf(z, asNum(n), asNum(p))),
    qbinom: (p: unknown, n: unknown, prob: unknown) =>
      vmap(p, (z) => invCdf((x) => binomCdf(x, asNum(n), asNum(prob)), z, 0, asNum(n))),

    dcauchy: (x: unknown, x0?: unknown, g?: unknown) =>
      vmap(x, (z) => {
        const G = optNum(g, 1);
        return 1 / (Math.PI * G * (1 + ((z - optNum(x0, 0)) / G) ** 2));
      }),
    pcauchy: (x: unknown, x0?: unknown, g?: unknown) =>
      vmap(x, (z) => 0.5 + Math.atan((z - optNum(x0, 0)) / optNum(g, 1)) / Math.PI),
    qcauchy: (p: unknown, x0?: unknown, g?: unknown) =>
      vmap(p, (z) => optNum(x0, 0) + optNum(g, 1) * Math.tan(Math.PI * (z - 0.5))),

    dchisq: (x: unknown, nu: unknown) =>
      vmap(x, (z) => {
        const k = asNum(nu);
        return z <= 0 ? 0 : Math.exp((k / 2 - 1) * Math.log(z) - z / 2 - (k / 2) * Math.log(2) - logGamma(k / 2));
      }),
    pchisq: (x: unknown, nu: unknown) => vmap(x, (z) => gammaP(asNum(nu) / 2, z / 2)),
    qchisq: (p: unknown, nu: unknown) =>
      vmap(p, (z) => invCdf((x) => gammaP(asNum(nu) / 2, x / 2), z, 0, 1e5)),

    dexp: (x: unknown, rate?: unknown) =>
      vmap(x, (z) => (z < 0 ? 0 : asNum(rate ?? 1) * Math.exp(-asNum(rate ?? 1) * z))),
    pexp: (x: unknown, rate?: unknown) =>
      vmap(x, (z) => (z < 0 ? 0 : 1 - Math.exp(-asNum(rate ?? 1) * z))),
    qexp: (p: unknown, rate?: unknown) =>
      vmap(p, (z) => -Math.log(1 - z) / asNum(rate ?? 1)),

    dF: (x: unknown, d1: unknown, d2: unknown) =>
      vmap(x, (z) => {
        const a = asNum(d1);
        const b = asNum(d2);
        if (z <= 0) return 0;
        return Math.exp(logGamma((a + b) / 2) - logGamma(a / 2) - logGamma(b / 2) + (a / 2) * Math.log((a * z) / (a * z + b)) + (b / 2) * Math.log(b / (a * z + b)) - Math.log(z));
      }),
    pF: (x: unknown, d1: unknown, d2: unknown) => vmap(x, (z) => fCdf(z, asNum(d1), asNum(d2))),
    qF: (p: unknown, d1: unknown, d2: unknown) =>
      vmap(p, (z) => invCdf((x) => fCdf(x, asNum(d1), asNum(d2)), z, 0, 1e5)),

    dgamma: (x: unknown, shape: unknown, scale?: unknown) =>
      vmap(x, (z) => {
        const k = asNum(shape);
        const th = optNum(scale, 1);
        return z <= 0 ? 0 : Math.exp((k - 1) * Math.log(z) - z / th - k * Math.log(th) - logGamma(k));
      }),
    pgamma: (x: unknown, shape: unknown, scale?: unknown) =>
      vmap(x, (z) => gammaP(asNum(shape), z / optNum(scale, 1))),
    qgamma: (p: unknown, shape: unknown, scale?: unknown) =>
      vmap(p, (z) => invCdf((x) => gammaP(asNum(shape), x), z, 0, 1e5) * optNum(scale, 1)),

    dgeom: (k: unknown, p: unknown) => vmap(k, (z) => dgeomPmf(z, asNum(p))),
    pgeom: (k: unknown, p: unknown) => vmap(k, (z) => (z < 0 ? 0 : 1 - (1 - asNum(p)) ** (Math.floor(z) + 1))),
    qgeom: (p: unknown, prob: unknown) =>
      vmap(p, (z) => Math.max(0, Math.ceil(Math.log(1 - z) / Math.log(1 - asNum(prob))) - 1)),

    dhypergeom: (k: unknown, N: unknown, K: unknown, n: unknown) =>
      vmap(k, (z) => dhyperPmf(z, asNum(N), asNum(K), asNum(n))),
    phypergeom: (k: unknown, N: unknown, K: unknown, n: unknown) =>
      vmap(k, (z) => phyperFn(z, N, K, n)),
    qhypergeom: (p: unknown, N: unknown, K: unknown, n: unknown) =>
      vmap(p, (z) => invCdf((x) => phyperFn(x, N, K, n), z, 0, asNum(n))),

    dlnorm: (x: unknown, mu?: unknown, sigma?: unknown) =>
      vmap(x, (z) => {
        const s = optNum(sigma, 1);
        return z <= 0 ? 0 : normPdf(Math.log(z), optNum(mu, 0), s) / z;
      }),
    plnorm: (x: unknown, mu?: unknown, sigma?: unknown) =>
      vmap(x, (z) => (z <= 0 ? 0 : normCdf(Math.log(z), optNum(mu, 0), optNum(sigma, 1)))),
    qlnorm: (p: unknown, mu?: unknown, sigma?: unknown) =>
      vmap(p, (z) => Math.exp(normalQuantile(z) * optNum(sigma, 1) + optNum(mu, 0))),

    dlogis: (x: unknown, mu?: unknown, beta?: unknown) =>
      vmap(x, (z) => {
        const b = optNum(beta, 1);
        const q = Math.exp(-(z - optNum(mu, 0)) / b);
        return q / (b * (1 + q) ** 2);
      }),
    plogis: (x: unknown, mu?: unknown, beta?: unknown) =>
      vmap(x, (z) => 1 / (1 + Math.exp(-(z - optNum(mu, 0)) / optNum(beta, 1)))),
    qlogis: (p: unknown, mu?: unknown, beta?: unknown) =>
      vmap(p, (z) => optNum(mu, 0) + optNum(beta, 1) * Math.log(z / (1 - z))),

    dnbinom: (k: unknown, r: unknown, p: unknown) => vmap(k, (z) => dnbinomPmf(z, asNum(r), asNum(p))),
    pnbinom: (k: unknown, r: unknown, p: unknown) => vmap(k, (z) => nbinomCdf(z, asNum(r), asNum(p))),
    qnbinom: (p: unknown, r: unknown, prob: unknown) =>
      vmap(p, (z) => invCdf((x) => nbinomCdf(x, asNum(r), asNum(prob)), z, 0, 1e6)),

    dpois: (k: unknown, lambda: unknown) => vmap(k, (z) => dpoisPmf(z, asNum(lambda))),
    ppois: (k: unknown, lambda: unknown) => vmap(k, (z) => poisCdf(z, asNum(lambda))),
    qpois: (p: unknown, lambda: unknown) =>
      vmap(p, (z) => invCdf((x) => poisCdf(x, asNum(lambda)), z, 0, 1e6)),

    dt: (x: unknown, nu: unknown) =>
      vmap(x, (z) => {
        const v = asNum(nu);
        return Math.exp(logGamma((v + 1) / 2) - logGamma(v / 2)) / Math.sqrt(v * Math.PI) * (1 + z * z / v) ** (-(v + 1) / 2);
      }),
    pt: (x: unknown, nu: unknown) => vmap(x, (z) => tCdf(z, asNum(nu))),
    qt: (p: unknown, nu: unknown) =>
      vmap(p, (z) => invCdf((x) => tCdf(x, asNum(nu)), z, -1e5, 1e5)),

    dunif: (x: unknown, a?: unknown, b?: unknown) =>
      vmap(x, (z) => (z >= optNum(a, 0) && z <= optNum(b, 1) ? 1 / (optNum(b, 1) - optNum(a, 0)) : 0)),
    punif: (x: unknown, a?: unknown, b?: unknown) =>
      vmap(x, (z) => Math.max(0, Math.min(1, (z - optNum(a, 0)) / (optNum(b, 1) - optNum(a, 0))))),
    qunif: (p: unknown, a?: unknown, b?: unknown) =>
      vmap(p, (z) => optNum(a, 0) + z * (optNum(b, 1) - optNum(a, 0))),

    dweibull: (x: unknown, k: unknown, lambda?: unknown) =>
      vmap(x, (z) => {
        const K = asNum(k);
        const L = optNum(lambda, 1);
        return z <= 0 ? 0 : (K / L) * (z / L) ** (K - 1) * Math.exp(-((z / L) ** K));
      }),
    pweibull: (x: unknown, k: unknown, lambda?: unknown) =>
      vmap(x, (z) => (z <= 0 ? 0 : 1 - Math.exp(-((z / optNum(lambda, 1)) ** asNum(k))))),
    qweibull: (p: unknown, k: unknown, lambda?: unknown) =>
      vmap(p, (z) => optNum(lambda, 1) * (-Math.log(1 - z)) ** (1 / asNum(k))),

    /* ----------------------------- finance -------------------------------- */
    fv: fvFn,
    fvadj: (rate: unknown, n: unknown, payment: unknown, present?: unknown, freq?: unknown) =>
      fvFn(asNum(rate) / asNum(freq ?? 1), asNum(n) * asNum(freq ?? 1), asNum(payment) / asNum(freq ?? 1), present),
    fvc: (rate: unknown, n: unknown, payment: unknown, present?: unknown, type?: unknown) =>
      fvFn(rate, n, asNum(payment) * (asNum(type ?? 0) ? 1 + asNum(rate) : 1), present),
    pmt: pmtFn,
    ipmt: ipmtFn,
    ppmt: (rate: unknown, period: unknown, n: unknown, present: unknown, future?: unknown) =>
      pmtFn(rate, n, present, future) - ipmtFn(rate, period, n, present, future),
    pv: (rate: unknown, n: unknown, pmt_: unknown, fv_?: unknown) => {
      const r = asNum(rate);
      const N = asNum(n);
      if (r === 0) return -(asNum(pmt_) * N + optNum(fv_, 0));
      const f = (1 + r) ** N;
      return -(asNum(pmt_) * ((f - 1) / r) + optNum(fv_, 0)) / f;
    },
    npv: (rate: unknown, ...cashflows: unknown[]) =>
      cashflows.flatMap(toArr).reduce<number>((s, v, i) => s + asNum(v) / (1 + asNum(rate)) ** (i + 1), 0),
    irr: (...cashflows: unknown[]) => {
      const cf = cashflows.flatMap(toArr).map(asNum);
      const f = (r: number): number => cf.reduce((s, v, i) => s + v / (1 + r) ** i, 0);
      let lo = -0.9999;
      let hi = 1;
      while (f(hi) > 0 && hi < 1e6) hi *= 2;
      while (f(lo) < 0 && lo > -0.999999) lo = (lo - 1) / 2;
      for (let i = 0; i < 200; i++) {
        const m = (lo + hi) / 2;
        if (f(m) > 0) lo = m;
        else hi = m;
      }
      return (lo + hi) / 2;
    },
    nper: (rate: unknown, pmt_: unknown, pv_: unknown, fv_?: unknown) => {
      const r = asNum(rate);
      const P = asNum(pmt_);
      const V = asNum(pv_);
      const F = optNum(fv_, 0);
      if (r === 0) return -(V + F) / P;
      return Math.log((P - r * F) / (P + r * V)) / Math.log(1 + r);
    },
    rate: (n: unknown, pmt_: unknown, pv_: unknown, fv_?: unknown) => {
      const N = asNum(n);
      const P = asNum(pmt_);
      const V = asNum(pv_);
      const F = optNum(fv_, 0);
      let lo = -0.9999;
      let hi = 1;
      const f = (r: number): number =>
        r === 0 ? V + P * N + F : V * (1 + r) ** N + P * (((1 + r) ** N - 1) / r) + F;
      for (let i = 0; i < 200; i++) {
        const m = (lo + hi) / 2;
        if (f(m) < 0) lo = m;
        else hi = m;
      }
      return (lo + hi) / 2;
    },
  };

  return S;
}
