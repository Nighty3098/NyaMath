/** Sync-тест realtime-шины: HTTP/SSE вокруг того же документа, что видят MCP-инструменты. */
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

try {
  // 1. status пустого документа
  let r = await fetch(`${base}/status`).then((x) => x.json());
  check(r.blocks === 0 && r.rev >= 0, `status empty (rev=${r.rev})`);

  // 2. push документа с UI-стороны
  const doc = [
    { id: 'a1', x: 80, y: 60, rawInput: 'x := 5', kind: 'math' },
    { id: 'a2', x: 80, y: 124, rawInput: 'y := x*2\ny =' },
  ];
  r = await fetch(`${base}/push`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ blocks: doc }),
  }).then((x) => x.json());
  check(r.ok === true && r.rev > 0, `push accepted (rev=${r.rev})`);

  // 3. snapshot содержит пересчитанные блоки
  r = await fetch(`${base}/snapshot`).then((x) => x.json());
  check(r.blocks.length === 2, 'snapshot has 2 blocks');
  const yb = r.blocks.find((b) => b.id === 'a2');
  check(yb && yb.error === null && yb.resultStr === '10', `y = ${yb?.resultStr}`);

  // 4. битый push отклоняется
  r = await fetch(`${base}/push`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ blocks: [{ nope: 1 }] }),
  }).then((x) => x.json());
  check(r.ok === false, 'broken push rejected');

  // 5. Сервер шлёт именованный кадр `event: snapshot` с валидным JSON.
  // Проверяем семантику как у браузерного EventSource: кадр засчитывается
  // только если имя события — snapshot (onmessage такие кадры не видит).
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 10000);
  const resp = await fetch(`${base}/events`, { signal: ctrl.signal });
  const reader = resp.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  let got = false;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const idx = buf.indexOf('\n\n');
    if (idx < 0) continue;
    const frame = buf.slice(0, idx);
    const name = frame.split('\n').find((l) => l.startsWith('event:'))?.slice(6).trim();
    const dataLine = frame.split('\n').find((l) => l.startsWith('data:'))?.slice(5).trim();
    if (name === 'snapshot' && dataLine) {
      try {
        const data = JSON.parse(dataLine);
        got = typeof data.rev === 'number' && Array.isArray(data.blocks);
      } catch {
        got = false;
      }
    }
    break;
  }
  clearTimeout(timer);
  ctrl.abort();
  check(got, 'SSE named snapshot event with valid JSON');
} finally {
  proc.kill('SIGKILL');
}

console.log(`\nSYNC PASS: ${pass} checks`);
