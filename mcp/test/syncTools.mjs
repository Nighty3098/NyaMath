/** Мост stdio-сессия ↔ sync-сервис: nya_sync_pull / nya_sync_push против живого сервера.
 *  Сценарий как у пользователя: браузер (процесс A, --port) держит холст,
 *  агент (процесс B, stdio) забирает его, правит и отправляет обратно. */
import { strict as assert } from 'node:assert';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const serverPath = path.resolve(here, '../dist/index.js');

let pass = 0;
const check = (cond, label) => {
  assert.ok(cond, `FAIL: ${label}`);
  pass++;
  console.log(`ok: ${label}`);
};

// 0. живой sync-сервис с пустым документом (отдельный процесс — как npm run dev)
const proc = spawn(process.execPath, [serverPath, '--port=0'], {
  stdio: ['ignore', 'ignore', 'pipe'],
});
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

const transport = new StdioClientTransport({ command: process.execPath, args: [serverPath] });
const client = new Client({ name: 'synctools', version: '0.0.0' });
await client.connect(transport);
const call = async (name, args = {}) => {
  const r = await client.callTool({ name, arguments: args });
  const text = r.content.map((c) => (c.type === 'text' ? c.text : '')).join('');
  return { isError: !!r.isError, data: JSON.parse(text) };
};

try {
  // 1. seed холста напрямую по HTTP (эмуляция браузера с Live Sync)
  let r = await fetch(`${base}/push`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      blocks: [
        { id: 's1', x: 80, y: 60, rawInput: 'x := 5', kind: 'math' },
        { id: 's2', x: 80, y: 124, rawInput: 'y := x*2\ny =' },
      ],
    }),
  }).then((x) => x.json());
  check(r.ok === true, 'seed push accepted');

  // 2. pull забирает холст в stdio-сессию
  r = await call('nya_sync_pull', { url: base });
  check(
    !r.isError && r.data.blocks === 2 && r.data.rev >= 0,
    `pull: ${r.data.blocks} blocks rev=${r.data.rev}`,
  );
  r = await call('nya_get_scope');
  check(r.data.variables['y'] === '10', `pulled y = ${r.data.variables['y']}`);

  // 3. правка в сессии + push обратно
  r = await call('nya_add_block', { kind: 'math', x: 80, y: 200, rawInput: 'zz_tmp := 41 + 1' });
  check(!r.isError && !r.data.error, 'add zz_tmp');
  r = await call('nya_sync_push', { url: base });
  check(!r.isError && r.data.rev >= 0, `push rev=${r.data.rev}`);

  // 4. браузер (snapshot) видит правку посчитанной
  const snap = await fetch(`${base}/snapshot`).then((x) => x.json());
  const zz = snap.blocks.find((b) => b.rawInput && b.rawInput.includes('zz_tmp'));
  check(
    snap.blocks.length === 3 && !!zz && zz.error === null && zz.resultStr === '42',
    `snapshot zz = ${zz?.resultStr}`,
  );

  // 5. мёртвый сервис — честная ошибка, а не вис
  r = await call('nya_sync_pull', { url: 'http://127.0.0.1:1' });
  check(r.isError, 'dead service isError');
} finally {
  proc.kill();
  await client.close().catch(() => {});
}

console.log(`\nSYNCTOOLS PASS: ${pass} checks`);
