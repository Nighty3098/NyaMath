import { spawn } from 'node:child_process';

const serverUrl = 'http://127.0.0.1:5173';
const vite = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1'], {
  stdio: 'inherit',
});
let electron;
let shuttingDown = false;

function stop(child) {
  if (child && child.exitCode === null) child.kill();
}

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  stop(electron);
  stop(vite);
  process.exitCode = code;
}

process.on('SIGINT', () => shutdown());
process.on('SIGTERM', () => shutdown());
vite.on('error', (error) => {
  console.error(`[electron:dev] Failed to start Vite: ${error.message}`);
  shutdown(1);
});
vite.on('exit', (code) => {
  if (!shuttingDown) shutdown(code ?? 1);
});

try {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (vite.exitCode !== null) throw new Error('Vite exited before becoming ready');
    try {
      const response = await fetch(serverUrl);
      if (response.ok) break;
    } catch {
      // Vite is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  if (Date.now() >= deadline) throw new Error('Timed out waiting for Vite');

  electron = spawn(process.execPath, ['node_modules/electron/cli.js', '.'], {
    stdio: 'inherit',
    env: { ...process.env, NYAMATH_DEV_SERVER_URL: serverUrl },
  });
  electron.on('error', (error) => {
    console.error(`[electron:dev] Failed to start Electron: ${error.message}`);
    shutdown(1);
  });
  electron.on('exit', (code) => shutdown(code ?? 0));
} catch (error) {
  console.error(`[electron:dev] ${error instanceof Error ? error.message : String(error)}`);
  shutdown(1);
}
