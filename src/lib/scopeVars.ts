import { sortBlocksTopDown, type MathBlockData } from '../engine/dependencies';

export interface ScopeVar {
  name: string;
  value: string;
  hasError: boolean;
  blockId: string;
}

/**
 * Телеметрия пульта: живые переменные листа сверху-вниз.
 * Последнее определение имени побеждает (как в scope движка).
 */
export function collectScopeVars(blocks: Record<string, MathBlockData>): ScopeVar[] {
  const seen = new Map<string, ScopeVar>();
  for (const b of sortBlocksTopDown(Object.values(blocks))) {
    if (b.kind !== 'math' && b.kind !== 'program' && b.kind !== 'slider') continue;
    if (!b.definedVar) continue;
    seen.set(b.definedVar, {
      name: b.definedVar,
      value: b.error ? b.error : b.resultStr || '—',
      hasError: b.error !== null,
      blockId: b.id,
    });
  }
  return [...seen.values()];
}
