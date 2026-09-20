import { ENGINE_VERSION } from '../engine/version';

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
  blocks: unknown[];
}

export interface ParsedDoc {
  /** версия движка из заголовка; null = legacy-файл без заголовка */
  engine: string | null;
  legacy: boolean;
  blocks: unknown[];
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
    return { engine, legacy: false, blocks: o['blocks'] as unknown[] };
  }
  throw new Error('not a NyaMath document');
}

/** Упаковать блоки в файл с заголовком. savedAt — ISO для воспроизводимости. */
export function serializeDocFile(blocks: unknown[], now: string = new Date().toISOString()): DocFile {
  return { engine: ENGINE_VERSION, savedAt: now, blocks };
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
