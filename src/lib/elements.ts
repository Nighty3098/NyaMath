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

/**
 * Все значения элемента набором мат-блоков (лесенкой):
 * молярная масса, плотность, T плавления/кипения, электроотрицательность,
 * молярная теплоёмкость. Пустые (null) пропускаются.
 */
export function elementBlocks(el: ElementRow): string[] {
  if (!/^[A-Z][a-z]?$/.test(el.symbol)) return [];
  const s = el.symbol;
  const out: string[] = [];
  if (el.atomic_mass !== null && Number.isFinite(el.atomic_mass)) {
    out.push(`M_${s} := ${el.atomic_mass} g/mol`);
  }
  if (el.density !== null && Number.isFinite(el.density)) {
    out.push(`rho_${s} := ${el.density} ${el.phase === 'Gas' ? 'g/L' : 'g/cm^3'}`);
  }
  if (el.melt !== null && Number.isFinite(el.melt)) {
    out.push(`Tm_${s} := ${el.melt} K`);
  }
  if (el.boil !== null && Number.isFinite(el.boil)) {
    out.push(`Tb_${s} := ${el.boil} K`);
  }
  if (el.electronegativity !== null && Number.isFinite(el.electronegativity)) {
    out.push(`EN_${s} := ${el.electronegativity}`);
  }
  if (el.molar_heat !== null && Number.isFinite(el.molar_heat)) {
    out.push(`Cp_${s} := ${el.molar_heat} J/mol/K`);
  }
  return out;
}
