import { ENGINE_VERSION } from '../engine/version';
import {
  DEFAULT_CALC_PRECISION,
  normalizeCalcPrecision,
  type CalculationPrecision,
} from '../engine/precision';

/**
 * Формат файлов проекта с заголовком версии движка (Pluto-урок: manifest в header).
 *
 * Новый формат: `{ engine, savedAt, blocks }`. Старый (массив блоков) читается
 * как legacy (engine неизвестен). Пишем всегда новый. Чистый модуль без DOM:
 * используют и веб-приложение, и MCP-сервер.
 */

export interface DocFile {
  engine?: string;
  savedAt?: string;
  calcPrecision?: CalculationPrecision;
  blocks: unknown[];
}

export interface ParsedDoc {
  /** версия движка из заголовка; null = legacy-файл без заголовка */
  engine: string | null;
  legacy: boolean;
  blocks: unknown[];
  calcPrecision?: CalculationPrecision;
}

/** Разобрать содержимое .json: массив (legacy) или объект с заголовком. Бросает на мусоре. */
export function parseDocFile(raw: unknown): ParsedDoc {
  if (Array.isArray(raw)) {
    return { engine: null, legacy: true, blocks: raw };
  }
  if (raw !== null && typeof raw === 'object') {
    const o = raw as Record<string, unknown>;
    if (!Array.isArray(o['blocks'])) throw new Error('not a NyaMath document (missing blocks[])');
    const engine = typeof o['engine'] === 'string' ? (o['engine'] as string) : null;
    const calcPrecision =
      o['calcPrecision'] && typeof o['calcPrecision'] === 'object'
        ? normalizeCalcPrecision(o['calcPrecision'] as Partial<CalculationPrecision>)
        : undefined;
    return {
      engine,
      legacy: false,
      blocks: o['blocks'] as unknown[],
      ...(calcPrecision ? { calcPrecision } : {}),
    };
  }
  throw new Error('not a NyaMath document');
}

/** Упаковать блоки в файл с заголовком. savedAt — ISO для воспроизводимости. */
export function serializeDocFile(
  blocks: unknown[],
  now: string = new Date().toISOString(),
  calcPrecision: CalculationPrecision = DEFAULT_CALC_PRECISION,
): DocFile {
  const precision = normalizeCalcPrecision(calcPrecision);
  return {
    engine: ENGINE_VERSION,
    savedAt: now,
    ...(precision.mode === 'arbitrary' ? { calcPrecision: precision } : {}),
    blocks,
  };
}

/** Совместимость заголовка с текущим движком: major должен совпадать. */
export function engineMismatch(saved: string | null): string | null {
  if (!saved) return null;
  const major = (v: string): string => v.split('.')[0];
  if (major(saved) !== major(ENGINE_VERSION)) {
    return `engine ${saved} ≠ ${ENGINE_VERSION}`;
  }
  return null;
}
