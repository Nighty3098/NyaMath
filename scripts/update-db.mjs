/**
 * Полное обновление справочной БД одной командой:
 *   1. scripts/fetch-codata.mjs --write — подтянуть значения констант из NIST CODATA;
 *   2. scripts/seed-db.mjs — пересобрать public/NyaMath.db из db/schema.sql + db/seed.json.
 *
 * Запуск: npm run update-db
 * После — проверьте `git diff` (seed.json, NyaMath.db), прогоните `npm run test` и коммитьте.
 */
import { execFileSync } from 'node:child_process';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const node = process.execPath;

console.log('==> [1/2] NIST CODATA check (fetch-codata --write)');
execFileSync(node, [path.join(here, 'fetch-codata.mjs'), '--write'], { stdio: 'inherit' });

console.log('==> [2/2] rebuild NyaMath.db (seed-db)');
execFileSync(node, [path.join(here, 'seed-db.mjs')], { stdio: 'inherit' });

console.log('done. Next: review `git diff`, run `npm run test`, commit seed.json + NyaMath.db');
