/**
 * lib/snapshots — TimeTravel поверх undo/redo (P0).
 *
 * Ответ на no-autosave Mathematica и порчу файлов Maple: тихие
 * автоснапшоты (кольцо в localStorage, последние 20) + ручные.
 * Храним slim-массив блоков (без plotPreview/simResult) + счётчики.
 * Storage инжектится для тестов (в браузере — localStorage).
 */
import type { MathBlockData } from '../engine/dependencies';
import { slimBlockRecord } from './blocks';

export interface Snapshot {
  /** ms epoch */
  at: number;
  /** число блоков */
  count: number;
  /** число ошибок на момент снимка */
  errors: number;
  /** ручной (true) или авто (false) */
  manual: boolean;
  /** slim-блоки */
  blocks: MathBlockData[];
}

export const SNAP_KEY = 'nyamath-snaps-v1';
export const SNAP_LIMIT = 20;

export interface KeyStorage {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
}

function browserStorage(): KeyStorage | null {
  try {
    if (typeof localStorage !== 'undefined') return localStorage;
    return null;
  } catch {
    return null;
  }
}

/** Слепок текущих блоков (уже slim — в файл/историю лишнего не пишем). */
export function takeSnapshot(
  blocks: Record<string, MathBlockData>,
  manual = false,
  at = Date.now(),
): Snapshot {
  const list = slimBlockRecord(blocks);
  return {
    at,
    count: list.length,
    errors: list.filter((b) => b.error).length,
    manual,
    blocks: list,
  };
}

export function readSnapshots(store?: KeyStorage | null): Snapshot[] {
  const st = store ?? browserStorage();
  if (!st) return [];
  try {
    const raw = st.getItem(SNAP_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as Snapshot[];
    return Array.isArray(arr) ? arr.filter((s) => s && typeof s.at === 'number') : [];
  } catch {
    return [];
  }
}

function writeSnapshots(list: Snapshot[], store?: KeyStorage | null): void {
  const st = store ?? browserStorage();
  if (!st) return;
  try {
    st.setItem(SNAP_KEY, JSON.stringify(list.slice(-SNAP_LIMIT)));
  } catch {
    /* quota — молча пропускаем */
  }
}

/** Положить снимок в кольцо (дедуп: подряд одинаковые по count+errors не пишем). */
export function pushSnapshot(
  snap: Snapshot,
  store?: KeyStorage | null,
): Snapshot[] {
  const list = readSnapshots(store);
  const last = list[list.length - 1];
  if (last && last.count === snap.count && last.errors === snap.errors && !snap.manual) {
    return list;
  }
  list.push(snap);
  const trimmed = list.slice(-SNAP_LIMIT);
  writeSnapshots(trimmed, store);
  return trimmed;
}

/** Снимок → Record для restore через loadDocument (id сохраняются). */
export function snapshotToRecord(snap: Snapshot): Record<string, MathBlockData> {
  const rec: Record<string, MathBlockData> = {};
  for (const b of snap.blocks) rec[b.id] = { ...b };
  return rec;
}

export function formatSnapTime(at: number, lang: 'ru' | 'en' = 'ru'): string {
  try {
    return new Date(at).toLocaleString(lang === 'ru' ? 'ru-RU' : 'en-US', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return String(at);
  }
}
