/**
 * Соответствие имён функций Mathcad 15/Prime и NyaMath.
 *
 * Ключи — имена в нижнем регистре (Mathcad часто пишет их в другом регистре).
 * Значение — каноническое имя функции в NyaMath/mathjs.
 *
 * Сюда попадают только функции с ОДИНАКОВОЙ функциональностью: если в NyaMath
 * уже есть аналог, при импорте вызывается его имя, а не «перевод» с ошибкой.
 * Если аналога нет, но Mathcad-функция реализована в слое совместимости,
 * используется её имя из `MATHCAD_COMPAT_NAMES`.
 */
import { MATHCAD_COMPAT_NAMES } from '../engine/mathcadCompat';

export const MATHCAD_RENAMES: Readonly<Record<string, string>> = {
  // ВАЖНО: в NyaMath log(x) — десятичный, ln(x) — натуральный (как в Mathcad).
  ln: 'ln',
  lg: 'log10',
  ln0: 'ln0',
  lnγ: 'logGamma',
  lngamma: 'logGamma',
  γ: 'gamma',
  ceiling: 'ceil',
  trunc: 'trunc',
  Ceil: 'Ceil',
  Floor: 'Floor',
  Round: 'Round',
  Trunc: 'Trunc',
  signum: 'signum',
  csgn: 'csgn',
  eigenvals: 'eigen',
  eigenvecs: 'eigenvecs',
  genvals: 'eigen',
  genvecs: 'eigenvecs',
  rank: 'rankMat',
  Rank: 'mcRank',
  var: 'mcVar',
  variance: 'mcVar',
  Var: 'mcVarSample',
  stdev: 'mcStdev',
  Stdev: 'mcStdevSample',
  gmean: 'mcGMean',
  hmean: 'mcHMean',
  skew: 'mcSkew',
  kurt: 'mcKurt',
  percentile: 'mcPercentile',
  histogram: 'mcHistogram',
  hist: 'mcHistogram',
  cvar: 'mcCovar',
  slope: 'mcSlope',
  intercept: 'mcIntercept',
  trim: 'mcTrim',
  ThreeSigma: 'mcThreeSigma',
  Grubbs: 'grubbs',
  GrubbsClassic: 'mcGrubbsClassic',
  combin: 'combinations',
  permut: 'permutations',
  num2str: 'string',
  str2num: 'str2num',
  strlen: 'strlenU',
  substr: 'substrU',
  cfft: 'dft',
  icfft: 'idft',
  fft: 'dft',
  ifft: 'idft',
  FFT: 'dft',
  IFFT: 'idft',
  nth_root: 'nthRoot',
  power: 'pow',
  svds: 'svds',
  mantissa: 'mantissa',
  logspace: 'logspace',
  beta: 'beta',
  digamma: 'digamma',
  atan2: 'mcAtan2',
  angle: 'mcAngle',
  im: 'im',
  re: 're',
  max: 'max',
  min: 'min',
  find: 'find',
  minerr: 'minerr',
  minimize: 'minimize',
  maximize: 'maximize',
  root: 'root',
  lsolve: 'lsolve',
  isprime: 'isPrime',
  isarray: 'isArray',
  isscalar: 'isScalar',
  isstring: 'isString',
  isnan: 'isNaN',
  erf: 'erf',
  erfc: 'erfc',
  zeta: 'zeta',
  gamma: 'gamma',
  random: 'rnd',
  reverse: 'reverse',
  stack: 'stack',
  trapz: 'trapz',
};

const MATHCAD_RENAMES_LOWER: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(MATHCAD_RENAMES).map(([k, v]) => [k.toLowerCase(), v]),
);

const MATHCAD_COMPAT_NAMES_LOWER = new Set(MATHCAD_COMPAT_NAMES.map((n) => n.toLowerCase()));

/** Привести имя функции Mathcad к имени NyaMath. */
export function mapMathcadFunctionName(name: string): string {
  const key = name.replace(/\.sc$/i, '').trim();
  return MATHCAD_RENAMES_LOWER[key.toLowerCase()] ?? key;
}

/** Известно ли имя как функция Mathcad (для заметок при импорте). */
export function isMathcadFunctionName(name: string): boolean {
  const key = name.replace(/\.sc$/i, '').trim().toLowerCase();
  return key in MATHCAD_RENAMES_LOWER || MATHCAD_COMPAT_NAMES_LOWER.has(key);
}
