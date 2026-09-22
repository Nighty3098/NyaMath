/**
 * store/persist — localStorage-персист настроек листа.
 *
 * Раньше эти load/save жили прямо в canvasStore.ts (god-store, ~150 строк),
 * вперемешку с экшенами документа. Здесь — только чтение/запись ключей
 * + синхронизация модульного состояния движка при загрузке
 * (main-thread фолбэк без воркера читает его же).
 * Зависит от движка и темы, НЕ от стора (без циклов).
 */
import {
  setNumFmt as setEngineNumFmt,
  setUnitSys as setEngineUnitSys,
  setComplexFmt as setEngineComplexFmt,
  setAngleMode as setEngineAngleMode,
  type AngleMode,
  type ComplexFmt,
  type NumFmt,
  type UnitSys,
} from '../engine/mathEngine';
import { normalizeNumFmt } from '../engine/format';

export const STORAGE_KEY = 'nyamath-doc-v1';
export const STORAGE_KEY_LEGACY = 'wengineering-doc-v1';

const GRID_KEY = 'nyamath-show-grid';
const GRID_KEY_LEGACY = 'wengineering-show-grid';
const GRID_SIZE_KEY = 'nyamath-grid-size';
const ELEM_OPEN_KEY = 'nyamath-elem-open';
const NUMFMT_KEY = 'nyamath-num-fmt';
const UNITSYS_KEY = 'nyamath-unit-sys';
const COMPLEXFMT_KEY = 'nyamath-complex-fmt';
const ANGLEMODE_KEY = 'nyamath-angle-mode';

export function loadGrid(): boolean {
  try {
    return (localStorage.getItem(GRID_KEY) ?? localStorage.getItem(GRID_KEY_LEGACY)) === '1';
  } catch {
    return false;
  }
}

export function saveGrid(v: boolean): void {
  try {
    localStorage.setItem(GRID_KEY, v ? '1' : '0');
  } catch {
    /* ignore */
  }
}

export function loadElemOpen(): boolean {
  try {
    return localStorage.getItem(ELEM_OPEN_KEY) === '1';
  } catch {
    return false;
  }
}

export function saveElemOpen(open: boolean): void {
  try {
    localStorage.setItem(ELEM_OPEN_KEY, open ? '1' : '0');
  } catch {
    /* ignore */
  }
}

export function loadGridSize(): 'standard' | 'fine' {
  try {
    return localStorage.getItem(GRID_SIZE_KEY) === 'fine' ? 'fine' : 'standard';
  } catch {
    return 'standard';
  }
}

export function saveGridSize(v: 'standard' | 'fine'): void {
  try {
    localStorage.setItem(GRID_SIZE_KEY, v);
  } catch {
    /* ignore */
  }
}

export function loadNumFmt(): NumFmt {
  let out: NumFmt = { mode: 'auto', digits: 6 };
  try {
    const raw = localStorage.getItem(NUMFMT_KEY);
    if (raw) out = normalizeNumFmt(JSON.parse(raw) as Partial<NumFmt>);
  } catch {
    out = { mode: 'auto', digits: 6 };
  }
  // main-thread движок (фолбэк без воркера) читает модульное состояние
  setEngineNumFmt(out);
  return out;
}

export function saveNumFmt(f: NumFmt): void {
  try {
    localStorage.setItem(NUMFMT_KEY, JSON.stringify(f));
  } catch {
    /* ignore */
  }
}

export function loadUnitSys(): UnitSys {
  try {
    const raw = localStorage.getItem(UNITSYS_KEY);
    if (raw === 'SI' || raw === 'US' || raw === 'CGS') {
      setEngineUnitSys(raw);
      return raw;
    }
  } catch {
    /* ignore */
  }
  return 'none';
}

export function saveUnitSys(s: UnitSys): void {
  try {
    localStorage.setItem(UNITSYS_KEY, s);
  } catch {
    /* ignore */
  }
}

export function loadComplexFmt(): ComplexFmt {
  try {
    const raw = localStorage.getItem(COMPLEXFMT_KEY);
    if (raw === 'polar' || raw === 'both') {
      setEngineComplexFmt(raw);
      return raw;
    }
  } catch {
    /* ignore */
  }
  return 'rect';
}

export function saveComplexFmt(f: ComplexFmt): void {
  try {
    localStorage.setItem(COMPLEXFMT_KEY, f);
  } catch {
    /* ignore */
  }
}

export function loadAngleMode(): AngleMode {
  try {
    const raw = localStorage.getItem(ANGLEMODE_KEY);
    if (raw === 'deg') {
      setEngineAngleMode('deg');
      return 'deg';
    }
  } catch {
    /* ignore */
  }
  return 'rad';
}

export function saveAngleMode(m: AngleMode): void {
  try {
    localStorage.setItem(ANGLEMODE_KEY, m);
  } catch {
    /* ignore */
  }
}
