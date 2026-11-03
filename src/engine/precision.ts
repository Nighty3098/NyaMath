export type CalculationPrecisionMode = 'standard' | 'arbitrary';

export interface CalculationPrecision {
  mode: CalculationPrecisionMode;
  digits: number;
}

export const DEFAULT_CALC_PRECISION: CalculationPrecision = {
  mode: 'standard',
  digits: 50,
};

export function normalizeCalcPrecision(
  value: Partial<CalculationPrecision> | null | undefined,
): CalculationPrecision {
  const mode = value?.mode === 'arbitrary' ? 'arbitrary' : 'standard';
  const requested = Math.floor(value?.digits ?? DEFAULT_CALC_PRECISION.digits);
  const digits = Math.max(16, Math.min(5000, requested || DEFAULT_CALC_PRECISION.digits));
  return { mode, digits };
}
