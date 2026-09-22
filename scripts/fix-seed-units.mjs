// seed.json: остаток bare-литералов -> единицы СИ (всё остальное уже
// исправлено; скрипт оставлен как документ/проверка).
// Совпадение только ЦЕЛЫМИ строками кода.
//   dry-run: node scripts/fix-seed-units.mjs
//   apply:   node scripts/fix-seed-units.mjs --apply (перезаписывает seed.json)
import { readFileSync, writeFileSync } from 'node:fs';

const RULES = [['d_gr := 2*10^-6', 'd_gr := 2*10^-6 m']]; // остальные bare-литералы уже с единицами (история: git log db/seed.json)

const apply = process.argv.includes('--apply');
const db = JSON.parse(readFileSync('db/seed.json', 'utf-8'));

const hits = new Map();
function fixLines(table, id, lines) {
  return lines.map((ln) => {
    const rule = RULES.find(([o]) => o === ln);
    if (rule) {
      hits.set(rule[0], [...(hits.get(rule[0]) ?? []), `${table}:${id}`]);
      return rule[1];
    }
    return ln;
  });
}

for (const f of db.formulas ?? []) {
  f.code = fixLines('formulas', f.id, f.code.split('\n')).join('\n');
}
for (const s of db.snippets ?? []) {
  if (typeof s.code === 'string')
    s.code = fixLines('snippets', s.ord, s.code.split('\n')).join('\n');
}

let fails = 0;
for (const [old] of RULES) {
  const h = hits.get(old) ?? [];
  if (h.length === 0) {
    console.log(`MISSING (файл не записан): ${old}`);
    fails += 1;
  } else {
    console.log(`${h.length}  ${old}   [${h.join(', ')}]`);
  }
}
if (fails) process.exit(1);
if (!apply) {
  console.log('dry-run: файл не записан (добавь --apply)');
  process.exit(0);
}
writeFileSync('db/seed.json', JSON.stringify(db, null, 1));
console.log('seed.json перезаписан');
