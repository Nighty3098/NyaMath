/**
 * Распознавание единиц для подписей осей графиков: «ГГц», «рад/с», «мм», «Тл».
 *
 * Префиксы SI в RU и EN вариантах; возвращаем масштаб (во сколько раз тик
 * делить, чтобы показать в выбранной единице) и остаток — метку единицы.
 * «мс» → милли + «с», «МГц» → мега + «Гц», «км/ч» → кило + «м/ч».
 * Если префикс не распознан, масштаб = 1 (единица как написана).
 */

export interface UnitScale {
  raw: string;
  ok: boolean;
  /** Делитель тиков: тик / scale = значение в выбранной единице. */
  scale: number;
  /** Остаток после префикса (метка единицы, например «Гц»). */
  unit: string;
}

/** Составные символы, которые нельзя резать «префикс + остаток» (RU). */
export const EXACT_UNITS: Record<string, number> = {
  Тл: 1, // тесла
  Гн: 1, // генри
  Вб: 1, // вебер
};

export const UNIT_PREFIX2: Array<[string, number]> = [
  ['мк', 1e-6], // микро
  ['дк', 1e1], // дека
  ['da', 1e1],
];

export const UNIT_PREFIX1: Array<[string, number]> = [
  ['ф', 1e-15], ['f', 1e-15],
  ['п', 1e-12], ['p', 1e-12],
  ['н', 1e-9], ['n', 1e-9],
  ['м', 1e-3], ['m', 1e-3], // также μ/u — микро (после мк-проверки)
  ['с', 1e-2], ['c', 1e-2],
  ['д', 1e-1], ['d', 1e-1],
  ['г', 1e2], ['h', 1e2],
  ['к', 1e3], ['k', 1e3],
  ['М', 1e6], ['M', 1e6],
  ['Г', 1e9], ['G', 1e9],
  ['Т', 1e12], ['T', 1e12],
  ['П', 1e15], ['P', 1e15],
  ['Э', 1e18], ['E', 1e18],
  ['u', 1e-6], ['μ', 1e-6],
];

const REST_RE = /^[А-Яа-яЁёA-Za-zμΩ°′″]+(?:\/[А-Яа-яЁёA-Za-zμΩ°′″]+)?$/;

const isUnitLabel = (s: string): boolean => s.length > 0 && REST_RE.test(s);

/**
 * Префиксы живут в NyaMath.db (таблица unit_prefixes): точные совпадения,
 * затем длинные префиксы первыми (порядок — из БД, ORDER BY len DESC).
 * Таблицы EXACT_UNITS/UNIT_PREFIX* оставлены для seed-скрипта.
 */
import { unitPrefixes } from '../lib/db';

export function parseUnitScale(r: string): UnitScale {
  const raw = r.trim();
  if (!raw) return { raw: '', ok: true, scale: 1, unit: '' };
  for (const { prefix: p, mult: s } of unitPrefixes()) {
    if (raw.startsWith(p) || raw === p) {
      const rest = raw.slice(p.length);
      if (!rest) return { raw, ok: true, scale: 1, unit: raw };
      if (isUnitLabel(rest)) return { raw, ok: true, scale: s, unit: rest };
      break;
    }
  }
  return isUnitLabel(raw) ? { raw, ok: true, scale: 1, unit: raw } : { raw, ok: false, scale: 1, unit: raw };
}