/** CRDT-лайт e2e: stale baseRev С meta сливается (200 + merged),
 *  stale baseRev БЕЗ meta — по-прежнему 409. Правки разных блоков не теряются. */
import { strict as assert } from 'node:assert';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const serverPath = path.resolve(here, '../dist/index.js');

let pass = 0;
const check = (cond, label) => {
  assert.ok(cond, `FAIL: ${label}`);
  pass++;
  console.log(`ok: ${label}`);
};

const proc = spawn(process.execPath, [serverPath, '--port=0'], { stdio: ['ignore', 'ignore', 'pipe'] });
let base = '';
await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('sync server did not start')), 15000);
  proc.stderr.on('data', (chunk) => {
    const m = String(chunk).match(/http:\/\/localhost:(\d+)/);
    if (m) {
      base = `http://localhost:${m[1]}`;
      clearTimeout(timer);
      resolve();
    }
  });
  proc.on('error', reject);
});
check(base.startsWith('http://localhost:'), `sync listening at ${base}`);

const push = (body) => fetch(`${base}/push`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
}).then((x) => x.json().then((j) => ({ status: x.status, ...j })));
const snap = () => fetch(`${base}/snapshot`).then((x) => x.json());

try {
  // 1. seed: два блока, legacy-push без meta
  let r = await push({ blocks: [
    { id: 'a', x: 80, y: 60, rawInput: 'x := 1', kind: 'math' },
    { id: 'b', x: 80, y: 124, rawInput: 'y := 2', kind: 'math' },
  ] });
  check(r.ok === true, `seed accepted rev=${r.rev}`);
  const r1 = r.rev;
  let s = await snap();
  check(s.blocks.length === 2 && s.meta && s.meta.a && s.meta.b, 'snapshot carries meta');

  // 2. серверная правка B (агент): fast-path без baseRev
  r = await push({ blocks: [
    { id: 'a', x: 80, y: 60, rawInput: 'x := 1', kind: 'math' },
    { id: 'b', x: 80, y: 124, rawInput: 'y := 20', kind: 'math' },
  ] });
  check(r.ok === true && r.rev > r1, `server-side edit rev=${r.rev}`);

  // 3. браузер со stale baseRev правит ДРУГОЙ блок (A) + свежие часы → мёрж, не 409
  const future = Date.now() + 100000;
  r = await push({
    blocks: [
      { id: 'a', x: 80, y: 60, rawInput: 'x := 10', kind: 'math' },
      { id: 'b', x: 80, y: 124, rawInput: 'y := 2', kind: 'math' },
    ],
    baseRev: r1,
    meta: { a: { clock: future, actor: 'web-x' }, b: s.meta.b },
    deleted: {},
  });
  check(r.ok === true && Array.isArray(r.blocks), `stale+meta merged rev=${r.rev}`);
  s = await snap();
  const got = Object.fromEntries(s.blocks.map((x) => [x.id, x.rawInput]));
  check(got.a === 'x := 10' && got.b === 'y := 20', `disjoint edits kept (a=${got.a}, b=${got.b})`);

  // 4. конфликт одного блока: часы браузера старше серверных → выигрывает сервер
  const r2 = s.rev;
  r = await push({
    blocks: [
      { id: 'a', x: 80, y: 60, rawInput: 'x := 777', kind: 'math' },
      { id: 'b', x: 80, y: 124, rawInput: 'y := 20', kind: 'math' },
    ],
    baseRev: r2,
  });
  check(r.ok === true, `agent edit a rev=${r.rev}`);
  r = await push({
    blocks: [
      { id: 'a', x: 80, y: 60, rawInput: 'x := 555', kind: 'math' },
      { id: 'b', x: 80, y: 124, rawInput: 'y := 20', kind: 'math' },
    ],
    baseRev: r2,
    meta: { a: { clock: 1, actor: 'web-x' }, b: s.meta.b },
    deleted: {},
  });
  check(r.ok === true, 'stale same-block merged (no 409)');
  s = await snap();
  const ga = s.blocks.find((x) => x.id === 'a');
  check(ga && ga.rawInput === 'x := 777', `older clock loses (a=${ga?.rawInput})`);

  // 5. legacy stale push без meta — по-прежнему 409
  r = await push({
    blocks: [{ id: 'a', x: 80, y: 60, rawInput: 'x := 0', kind: 'math' }],
    baseRev: r2,
  });
  check(r.ok === false, 'legacy stale push still 409');
} finally {
  proc.kill('SIGKILL');
}

console.log(`\nCRDT PASS: ${pass} checks`);
