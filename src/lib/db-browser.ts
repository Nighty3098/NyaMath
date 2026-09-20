/**
 * Браузерный init NyaMath.db: sql.js (WASM) + public/NyaMath.db через fetch.
 * Отдельный модуль, чтобы sql.js не попадал в node-бандлы (MCP).
 * Вызывать один раз в main.tsx до первого рендера (идемпотентно).
 */
import initSqlJs from 'sql.js';
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url';
import { isDbReady, setDriver, sqlJsDriver } from './db';

export async function initDb(dbUrl?: string): Promise<void> {
  if (isDbReady()) return;
  const SQL = await initSqlJs({ locateFile: () => wasmUrl });
  const url = dbUrl ?? `${import.meta.env.BASE_URL}NyaMath.db`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`NyaMath.db: fetch failed (${res.status} ${url})`);
  const db = new SQL.Database(new Uint8Array(await res.arrayBuffer()));
  setDriver(sqlJsDriver(db), url);
}
