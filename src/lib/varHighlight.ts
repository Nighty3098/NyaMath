import type { MathBlockData } from '../engine/dependencies';

/**
 * Подсветка переменной по всему листу при наведении (DESIGN.md §5 п.2,
 * самая хвалимая фича SMath): навёл на блок — видишь, где переменная
 * определяется и где используется.
 */

/** Имя для подсветки от блока: своё определение, иначе первая зависимость. */
export function hoverNameOf(b: Pick<MathBlockData, 'definedVar' | 'dependencies'>): string | null {
  if (b.definedVar) return b.definedVar;
  return b.dependencies[0] ?? null;
}

/** Связан ли блок с подсвеченной переменной (определение или использование). */
export function isVarRelated(
  b: Pick<MathBlockData, 'definedVar' | 'dependencies'>,
  name: string | null,
): boolean {
  if (!name) return false;
  return b.definedVar === name || b.dependencies.includes(name);
}
