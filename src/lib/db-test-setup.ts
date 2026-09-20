/**
 * Vitest setup: синхронно открываем NyaMath.db (node:sqlite) до тестов.
 * Движок и палитры читают данные только через src/lib/db.ts.
 */
import { setDriver } from './db';
import { openNodeDb } from './db-node';

const { driver, path } = openNodeDb(process.env['NYAMATH_DB']);
setDriver(driver, path);
