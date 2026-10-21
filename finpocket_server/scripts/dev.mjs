#!/usr/bin/env node
/**
 * FinPocket dev launcher — `npm run dev` always works, even when a previous
 * instance is still holding the port (the classic EADDRINUSE on :3001).
 *
 * 1. Reads PORT from .env (default 3001).
 * 2. On Windows, finds the PID still listening on that port and stops it.
 * 3. Starts `tsx watch src/index.ts` with inherited stdio.
 *
 * Usage: `npm run dev` (unchanged) — this script runs automatically.
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function readPort() {
  const envPath = path.join(root, '.env');
  if (existsSync(envPath)) {
    const match = readFileSync(envPath, 'utf8').match(/^PORT=(\d+)/m);
    if (match) return match[1];
  }
  return process.env.PORT || '3001';
}

/** Best-effort: free the dev port so a stale instance can never block startup. */
function freePort(port) {
  if (process.platform !== 'win32') return;
  const netstat = spawnSync('netstat', ['-ano'], { encoding: 'utf8' });
  if (netstat.status !== 0 || !netstat.stdout) return;

  const listener = new RegExp(
    `^\\s*TCP\\s+(?:0\\.0\\.0\\.0|127\\.0\\.0\\.1|\\[::\\]):${port}\\s+.*\\sLISTENING\\s+(\\d+)\\s*$`,
    'i'
  );
  const pids = new Set();
  for (const line of netstat.stdout.split(/\r?\n/)) {
    const m = line.match(listener);
    if (m && m[1] !== String(process.pid)) pids.add(m[1]);
  }
  for (const pid of pids) {
    try {
      spawnSync('taskkill', ['/F', '/PID', pid]);
      console.log(`[dev] Port ${port} was held by stale process ${pid} — stopped it.`);
    } catch {
      /* ignore — startup will surface any real problem */
    }
  }
}

const port = readPort();
freePort(port);

const child = spawn('npx tsx watch src/index.ts', {
  cwd: root,
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => child.kill(signal));
}
child.on('exit', (code) => process.exit(code ?? 0));
