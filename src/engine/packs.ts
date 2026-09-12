/**
 * Доменные паки Wengineering: статистика, физика, телекоммуникации, математика.
 * Все функции/константы — чистый клиентский JS поверх mathjs, zero-latency.
 */
import type { MathJsInstance } from 'mathjs';

export type Scope = Record<string, unknown>;

/** Построить scope паков. Вызывать один раз из mathEngine (там есть инстанс math). */
export function buildPackScope(math: MathJsInstance): Scope {
  const flat = (v: unknown): number[] => {
    try {
      const m = math.matrix(v as never);
      return ((m as unknown as { toArray: () => unknown }).toArray() as unknown[]).flat(
        Infinity,
      ) as number[];
    } catch {
      return [Number(v)];
    }
  };

  const seq = (a: unknown, b: unknown, step?: unknown): unknown => {
    const A = Number(a);
    const B = Number(b);
    const S = step === undefined ? 1 : Number(step);
    if (!isFinite(A) || !isFinite(B) || !isFinite(S)) throw new Error('seq: аргументы должны быть числами');
    if (S === 0) throw new Error('seq: шаг не может быть 0');
    const n = Math.floor((B - A) / S + 1e-9) + 1;
    if (n < 0) return math.matrix([]);
    if (n > 100000) throw new Error('seq: диапазон слишком большой (>100000). Уменьшите шаг/границы');
    const out: number[] = [];
    for (let k = 0; k < n; k++) out.push(Number((A + k * S).toPrecision(12)));
    return math.matrix(out);
  };

  const linspace = (a: unknown, b: unknown, n?: unknown): unknown => {
    const A = Number(a);
    const B = Number(b);
    const N = n === undefined ? 50 : Math.floor(Number(n));
    if (N < 2 || N > 100000) throw new Error('linspace: n должно быть 2..100000');
    const out: number[] = [];
    for (let k = 0; k < N; k++) out.push(Number((A + ((B - A) * k) / (N - 1)).toPrecision(12)));
    return math.matrix(out);
  };

  const rows = (m: unknown): number => {
    const s = math.size(m as never) as unknown as { toArray: () => number[] };
    return s.toArray()[0] ?? 0;
  };
  const cols = (m: unknown): number => {
    const s = math.size(m as never) as unknown as { toArray: () => number[] };
    const a = s.toArray();
    return a.length > 1 ? a[1] : 1;
  };

  const C = 299792458;
  const MU0 = 4 * Math.PI * 1e-7;
  const EPS0 = 1 / (MU0 * C * C);

  return {
    // ---------- математика ----------
    seq,
    linspace,
    rows,
    cols,
    rms: (v: unknown) => {
      const f = flat(v).map(Number);
      if (!f.length) throw new Error('rms: пустой вектор');
      return Math.sqrt(f.reduce((s, x) => s + x * x, 0) / f.length);
    },
    sinc: (x: unknown) => {
      const v = Number(x);
      if (v === 0) return 1;
      const t = Math.PI * v;
      return Math.sin(t) / t;
    },
    augment: (a: unknown, b: unknown) => math.concat(a as never, b as never),

    // ---------- статистика ----------
    // mean/median/mode/std/var/min/max/sum/prod/quantileSeq уже есть в mathjs.
    zscore: (v: unknown) => {
      const f = flat(v).map(Number);
      const m = f.reduce((s, x) => s + x, 0) / f.length;
      const sd = Math.sqrt(f.reduce((s, x) => s + (x - m) * (x - m), 0) / (f.length - 1 || 1));
      return math.matrix(f.map((x) => (x - m) / (sd || 1)));
    },

    // ---------- физика: константы SI ----------
    c_light: C,
    mu_0: MU0,
    eps_0: EPS0,
    h_planck: 6.62607015e-34,
    hbar: 6.62607015e-34 / (2 * Math.PI),
    k_B: 1.380649e-23,
    q_e: 1.602176634e-19,
    N_A: 6.02214076e23,
    G_const: 6.6743e-11,
    m_e: 9.1093837015e-31,
    m_p: 1.67262192369e-27,

    // ---------- телекоммуникации ----------
    // dB — отношение мощностей; dBV — отношение напряжений
    dB: (r: unknown) => 10 * Math.log10(Number(r)),
    dBV: (r: unknown) => 20 * Math.log10(Number(r)),
    idB: (db: unknown) => Math.pow(10, Number(db) / 10),
    // dBm: мощность в Вт -> дБм; WdBm: обратно
    dBm: (w: unknown) => 10 * Math.log10(Number(w) / 1e-3),
    WdBm: (dbm: unknown) => 1e-3 * Math.pow(10, Number(dbm) / 10),
    // длина волны по частоте, м
    lambda_f: (f: unknown) => C / Number(f),
    // потери в свободном пространстве: линейные и в дБ (d — м, f — Гц)
    fspl: (d: unknown, f: unknown) => {
      const t = ((4 * Math.PI * Number(d) * Number(f)) / C) ** 2;
      return t;
    },
    fspl_dB: (d: unknown, f: unknown) => 20 * Math.log10((4 * Math.PI * Number(d) * Number(f)) / C),
  };
}

/** Имена паков — исключаются из зависимостей (встроенные). */
export const PACK_NAMES = [
  'seq', 'linspace', 'rows', 'cols', 'rms', 'sinc', 'augment', 'zscore',
  'c_light', 'mu_0', 'eps_0', 'h_planck', 'hbar', 'k_B', 'q_e', 'N_A', 'G_const', 'm_e', 'm_p',
  'dB', 'dBV', 'idB', 'dBm', 'WdBm', 'lambda_f', 'fspl', 'fspl_dB',
];

/* ---------------- Палитра вставки ---------------- */

export interface Snippet {
  pack: string;
  label: string;
  hint: string;
  code: string;
  kind: 'math' | 'plot' | 'program';
  exportName?: string;
}

export const SNIPPETS: Snippet[] = [
  // матрицы
  { pack: 'Матрицы', label: 'Матрица 2×2', hint: '[ ; ] — строки', code: 'A := [1, 2; 3, 4]', kind: 'math' },
  { pack: 'Матрицы', label: 'Определитель', hint: 'det(M)', code: 'det(A) =', kind: 'math' },
  { pack: 'Матрицы', label: 'Обратная', hint: 'inv(M)', code: 'B := inv(A)', kind: 'math' },
  { pack: 'Матрицы', label: 'Транспонирование', hint: "A' или transpose", code: 'transpose(A) =', kind: 'math' },
  { pack: 'Матрицы', label: 'Решение СЛАУ', hint: 'x = A⁻¹·b', code: 'x := inv(A)*[5; 6]', kind: 'math' },
  { pack: 'Матрицы', label: 'Диапазон 1..n', hint: 'вектор-столбец значений', code: 'n := seq(0, 10)', kind: 'math' },
  { pack: 'Матрицы', label: 'linspace', hint: 'N точек [a,b]', code: 't := linspace(0, 1, 11)', kind: 'math' },
  // статистика
  { pack: 'Статистика', label: 'Выборка', hint: 'вектор данных', code: 'data := [2.3, 3.1, 2.8, 4.0, 3.5, 2.9]', kind: 'math' },
  { pack: 'Статистика', label: 'Среднее', hint: 'mean(v)', code: 'mean(data) =', kind: 'math' },
  { pack: 'Статистика', label: 'СКО', hint: 'std(v)', code: 'std(data) =', kind: 'math' },
  { pack: 'Статистика', label: 'RMS', hint: 'среднеквадратичное', code: 'rms(data) =', kind: 'math' },
  { pack: 'Статистика', label: 'Медиана/квантиль', hint: 'median, quantileSeq', code: 'median(data) =', kind: 'math' },
  // физика
  { pack: 'Физика', label: 'Фотон 650 нм', hint: 'E = h·c/λ', code: 'E_ph := h_planck*c_light/(650*10^-9)', kind: 'math' },
  { pack: 'Физика', label: 'Энергия в эВ', hint: '/q_e', code: 'E_eV := E_ph/q_e', kind: 'math' },
  { pack: 'Физика', label: 'Тепловая энергия', hint: 'k_B·T', code: 'E_th := k_B*300', kind: 'math' },
  // телеком
  { pack: 'Телеком', label: 'Мощность в дБм', hint: 'Вт → дБм', code: 'dBm(20*10^-3) =', kind: 'math' },
  { pack: 'Телеком', label: 'дБм в ватты', hint: 'обратно', code: 'WdBm(13) =', kind: 'math' },
  { pack: 'Телеком', label: 'FSPL', hint: 'потери, d — м, f — Гц', code: 'L := fspl_dB(1000, 2.4*10^9)', kind: 'math' },
  { pack: 'Телеком', label: 'Длина волны', hint: 'λ(f)', code: 'lambda_f(2.4*10^9) =', kind: 'math' },
  { pack: 'Телеком', label: 'Отношение в дБ', hint: '10·lg', code: 'dB(100) =', kind: 'math' },
  // программы
  {
    pack: 'Программы', label: 'Факториал (for)', hint: 'цикл, экспорт fact',
    code: 'f := 1\nfor i in 2..n\n  f := f*i\nend\nf', kind: 'program', exportName: 'fact',
  },
  {
    pack: 'Программы', label: 'Сумма ряда (while+if)', hint: 'while, if/else',
    code: 's := 0\nk := 0\nwhile s < 100\n  k := k + 1\n  if k/2 == round(k/2)\n    s := s + k\n  else\n    s := s + 1\n  end\nend\ns', kind: 'program',
  },
  // графики
  { pack: 'Графики', label: 'sin + cos', hint: 'две серии через ;', code: 'sin(x); cos(x/2)', kind: 'plot' },
  { pack: 'Графики', label: 'Затухание', hint: 'экспонента × синус', code: 'exp(-x/5)*sin(x)', kind: 'plot' },
];
