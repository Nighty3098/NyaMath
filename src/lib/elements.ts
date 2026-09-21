import type { ElementRow } from './db';

/**
 * Вставка элемента из палитры: молярная масса как определяемый блок
 * `M_Fe := 55.845 g/mol` (численно равна относительной атомной массе).
 * Чистая функция — UI только ставит блок в точку прицела.
 */
export function molarMassCode(el: ElementRow): string | null {
  if (el.atomic_mass === null || !Number.isFinite(el.atomic_mass)) return null;
  if (!/^[A-Z][a-z]?$/.test(el.symbol)) return null;
  return `M_${el.symbol} := ${el.atomic_mass} g/mol`;
}
