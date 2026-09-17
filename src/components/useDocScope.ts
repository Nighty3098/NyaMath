import { useMemo } from 'react';
import { getLastScope } from '../engine/dependencies';
import type { MathBlockData } from '../engine/dependencies';
import type { Scope } from '../engine/mathEngine';

/**
 * Снапшот scope документа из последнего recalculateAll стора.
 *
 * `blocks` — ревизия документа: сам scope хранится вне React (модульный
 * getLastScope), поэтому явно ссылаемся на blocks в теле useMemo — иначе
 * сэмплинг графиков/отладчик не обновятся при изменении документа.
 * Возвращаем копию: сэмплинг пишет x/y/t в свой объект и не должен
 * пачкать общий scope пересчёта.
 */
export function useDocScope(blocks: Record<string, MathBlockData>): Scope {
  return useMemo(() => {
    void blocks;
    return { ...getLastScope() };
  }, [blocks]);
}
