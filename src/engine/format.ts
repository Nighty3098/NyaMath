/**
 * engine/format — чистое форматирование чисел без зависимостей.
 *
 * Раньше было 4+ почти одинаковых форматтера:
 * formatNumber/numLatex (mathEngine), fmtTrace (numeric), fmtT (simEngine).
 * Здесь — один параметризованный форматтер + компактный для логов/тиков.
 */

export type NumFmtMode = 'auto' | 'sig' | 'fixed';

export interface NumFmt {
  mode: NumFmtMode;
  digits: number;
}

export const DEFAULT_NUM_FMT: NumFmt = { mode: 'auto', digits: 6 };

/** Нормализовать формат отображения (clamp digits 1..5000, fallback auto/6). */
export function normalizeNumFmt(f: Partial<NumFmt> | null | undefined): NumFmt {
  const mode = f?.mode === 'sig' || f?.mode === 'fixed' ? f.mode : 'auto';
  const digits = Math.max(1, Math.min(5000, Math.floor(f?.digits ?? 6) || 6));
  return { mode, digits };
}

/** e-нотация → инженерная «·10^». */
export function expToSup(s: string): string {
  return s.replace('e+', '·10^').replace('e', '·10^');
}

/** -0.00 → 0.00. */
function fixZero(s: string, digits: number): string {
  return Number(s) === 0 ? (0).toFixed(digits) : s;
}

/** Формат числа с явным форматом (чистая функция, без глобалов). */
export function formatNumberWith(n: number, fmt: NumFmt): string {
  if (!isFinite(n)) return String(n);
  const digits = Math.min(fmt.digits, 100);
  if (n === 0 || Object.is(n, -0)) return fmt.mode === 'fixed' ? (0).toFixed(digits) : '0';
  const abs = Math.abs(n);
  if (fmt.mode === 'sig') {
    if (abs >= 1e-3 && abs < 1e6) return String(Number(n.toPrecision(digits)));
    return expToSup(n.toExponential(digits - 1));
  }
  if (fmt.mode === 'fixed') {
    if (abs >= 1e-3 && abs < 1e6) return fixZero(n.toFixed(digits), digits);
    return expToSup(n.toExponential(digits));
  }
  if (abs >= 1e-3 && abs < 1e6) return Number(n.toPrecision(10)).toString();
  return expToSup(n.toExponential(5));
}

export function formatBigNumberWith(
  n: {
    abs(): { gte(value: number): boolean; lt(value: number): boolean };
    isFinite(): boolean;
    toExponential(digits?: number): string;
    toFixed(digits?: number): string;
    toSignificantDigits(digits?: number): { toString(): string };
    isZero(): boolean;
  },
  fmt: NumFmt,
): string {
  if (!n.isFinite()) return n.toString();
  if (n.isZero()) return fmt.mode === 'fixed' ? n.toFixed(fmt.digits) : '0';
  const abs = n.abs();
  const ordinaryRange = abs.gte(1e-3) && abs.lt(1e6);
  if (fmt.mode === 'sig') {
    return ordinaryRange
      ? n.toSignificantDigits(fmt.digits).toString()
      : expToSup(n.toExponential(fmt.digits - 1));
  }
  if (fmt.mode === 'fixed') {
    return ordinaryRange ? n.toFixed(fmt.digits) : expToSup(n.toExponential(fmt.digits));
  }
  return ordinaryRange ? n.toSignificantDigits(10).toString() : expToSup(n.toExponential(5));
}

/** Компактный формат для логов решателей (бывший fmtTrace/fmtT).
 *  Подписи осей графиков — в lib/plotTicks.ts (там свои пороги/точность). */
export function formatCompact(n: number): string {
  if (!isFinite(n)) return String(n);
  if (n === 0) return '0';
  const a = Math.abs(n);
  if (a >= 1e-3 && a < 1e6) return String(Number(n.toPrecision(6)));
  // инженерная нотация листа (·10^), а не программистская e-нотация
  return expToSup(n.toExponential(2));
}
