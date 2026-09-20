import { describe, expect, it, vi } from 'vitest';

/**
 * Регресс: старт Web Worker падал до первого сообщения, потому что
 * recalc.worker.ts статически импортировал движок, а тот выполнял
 * createBaseScope() (→ getConstant → throw, драйвера БД ещё нет).
 * Движок теперь грузится лениво, после hydrateDb — импорт модуля
 * обязан проходить и без инициализированной БД.
 */
describe('recalc.worker entry has no DB side effects at import', () => {
  it('module evaluates without initialized DB', async () => {
    vi.resetModules();
    const mod = await import('./recalc.worker');
    expect(typeof mod.runWorkerJob).toBe('function');
  });
});
