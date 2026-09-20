/**
 * Должен быть ПЕРВЫМ импортом index.ts: открывает NyaMath.db до того,
 * как модули движка выполнят createBaseScope() на импорте.
 * Только Node (MCP-сервер); в браузерный бандл не попадает.
 */
import { setDriver } from '../../src/lib/db.js';
import { openNodeDb } from '../../src/lib/db-node.js';

try {
  const { driver, path } = openNodeDb(process.env['NYAMATH_DB']);
  setDriver(driver, path);
} catch (e) {
  console.error(`[nyamath] DB init failed: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
}
