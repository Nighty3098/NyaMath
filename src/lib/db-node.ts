/**
 * Node-драйвер NyaMath.db (node:sqlite, синхронно, read-only).
 * Импортируется ТОЛЬКО из node-окружения (vitest setup, MCP-сервер,
 * seed-проверки) — в браузерный бандл не попадает.
 */
import { DatabaseSync } from 'node:sqlite';
import * as fs from 'node:fs';
import type { Driver, Row } from './db';

export function resolveNodeDbPath(explicit?: string): string {
  const cands = [
    explicit,
    process.env['NYAMATH_DB'],
    `${process.cwd()}/public/NyaMath.db`,
    `${process.cwd()}/../public/NyaMath.db`,
    `${process.cwd()}/NyaMath.db`,
  ].filter(Boolean) as string[];
  for (const p of cands) {
    try {
      if (fs.statSync(p).isFile()) return p;
    } catch { /* next */ }
  }
  throw new Error(`NyaMath.db not found (tried: ${cands.join(', ')})`);
}

/** Открыть БД read-only и вернуть драйвер для setDriver(). */
export function openNodeDb(dbPath?: string): { driver: Driver; path: string } {
  const target = resolveNodeDbPath(dbPath);
  const db = new DatabaseSync(target, { readOnly: true });
  const driver: Driver = {
    all: (sql: string): Row[] => db.prepare(sql).all() as Row[],
  };
  return { driver, path: target };
}
