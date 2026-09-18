/**
 * `npm run dev` — сайт (vite) + MCP-сервис с realtime-шиной в одном процессе.
 * Без новых зависимостей: только node:child_process.
 *
 * - Сначала собирает mcp/dist (esbuild из mcp/node_modules).
 * - Поднимает `node mcp/dist/index.js --port=$NYAMATH_PORT` (по умолчанию 3777).
 * - Рядом запускает vite; логи обоих процессов идут в один терминал с префиксами.
 * - Ctrl+C гасит всё дерево процессов.
 */
import { spawn, execSync } from 'node:child_process';

const PORT = process.env['NYAMATH_PORT'] ?? '3777';
const children = new Set();

function log(prefix, chunk) {
  for (const line of String(chunk).split('\n')) {
    if (line.trim().length) process.stdout.write(`[${prefix}] ${line}\n`);
  }
}

function run(name, command, args, extraEnv = {}) {
  const child = spawn(command, args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, ...extraEnv },
    // своя группа процессов — гасим целиком, включая внуков (esbuild/vite)
    detached: process.platform !== 'win32',
  });
  children.add(child);
  child.stdout.on('data', (c) => log(name, c));
  child.stderr.on('data', (c) => log(name, c));
  child.on('exit', (code, signal) => {
    children.delete(child);
    if (code !== 0 && code !== null) {
      log(name, `exit code=${code} signal=${signal ?? '-'}`);
    }
  });
  return child;
}

function shutdown() {
  for (const child of children) {
    try {
      if (process.platform === 'win32') child.kill();
      else process.kill(-child.pid, 'SIGTERM');
    } catch {
      /* уже мёртв */
    }
  }
  setTimeout(() => process.exit(0), 300).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// 1. свежий dist MCP (иначе ui-шина и инструменты разъедутся с исходниками)
try {
  execSync('npm run build --prefix mcp --silent', { stdio: 'inherit' });
} catch {
  console.error('[dev] не собрался mcp/dist — проверьте mcp/ вручную');
  process.exit(1);
}

// 2. сервис: тот же документ видят и MCP-агент (stdio), и UI (SSE/POST)
run('mcp', process.execPath, ['mcp/dist/index.js', `--port=${PORT}`], {
  NYAMATH_PORT: PORT,
});

// 3. сайт
run('vite', process.execPath, ['node_modules/vite/bin/vite.js']);
