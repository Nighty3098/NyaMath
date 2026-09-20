/** Тон статус-бара (DESIGN.md §5 п.7: состояние расчёта как в Prime/SMath). */

/** ok — чисто, warn — есть stale, err — есть ошибки, busy — идёт пересчёт. */
export type StatusTone = 'ok' | 'warn' | 'err' | 'busy';

/** Ошибки важнее всего, затем активный пересчёт, затем stale. */
export function statusTone(errCount: number, staleCount: number, computeActive: boolean): StatusTone {
  if (errCount > 0) return 'err';
  if (computeActive) return 'busy';
  if (staleCount > 0) return 'warn';
  return 'ok';
}
