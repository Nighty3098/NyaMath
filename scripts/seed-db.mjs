/**
 * Пересборка public/NyaMath.db из db/schema.sql + db/seed.json.
 * Запуск: npm run seed
 * Правки данных вносятся в db/seed.json (читаемый дифф в git), затем seed.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const schemaPath = path.join(root, 'db', 'schema.sql');
const seedPath = path.join(root, 'db', 'seed.json');
const outPath = path.join(root, 'public', 'NyaMath.db');

const schema = fs.readFileSync(schemaPath, 'utf-8');
const seed = JSON.parse(fs.readFileSync(seedPath, 'utf-8'));

try {
  fs.unlinkSync(outPath);
} catch { /* ignore */ }

const db = new DatabaseSync(outPath);
db.exec(schema);

let total = 0;
for (const [table, rows] of Object.entries(seed)) {
  if (!Array.isArray(rows) || !rows.length) continue;
  const cols = Object.keys(rows[0]);
  const stmt = db.prepare(`INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`);
  for (const r of rows) stmt.run(...cols.map((k) => r[k] ?? null));
  total += rows.length;
  console.log(`${table}: ${rows.length}`);
}
db.exec('VACUUM');
db.close();

const size = fs.statSync(outPath).size;
console.log(`wrote ${outPath} (${total} rows, ${size} bytes)`);
