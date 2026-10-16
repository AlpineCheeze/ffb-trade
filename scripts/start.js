#!/usr/bin/env node
'use strict';

/**
 * Production server entrypoint for Railway and local environments.
 * - Binds explicitly to 0.0.0.0 and process.env.PORT (or -p CLI arg) so cloud proxies/healthchecks never time out.
 * - Handles SIGTERM / SIGINT cleanly with exit code 0 to prevent `npm error signal SIGTERM` crashes
 *   when containers stop, restart, or remount volumes, and avoids hanging on HTTP keep-alive sockets.
 */

process.env.NODE_ENV = process.env.NODE_ENV || 'production';
process.env.NEXT_RUNTIME = 'nodejs';
process.env.NEXT_MANUAL_SIG_HANDLE = 'true';
process.env.NEXT_IGNORE_INCORRECT_LOCKFILE = '1';

// Parse optional CLI flags (e.g., `npm run start -- -p 6969 -H 0.0.0.0`)
const args = process.argv.slice(2);
let cliPort = null;
let cliHost = null;

for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if ((arg === '-p' || arg === '--port') && args[i + 1]) {
    cliPort = parseInt(args[i + 1], 10);
    i++;
  } else if (arg.startsWith('--port=')) {
    cliPort = parseInt(arg.split('=')[1], 10);
  } else if ((arg === '-H' || arg === '--hostname') && args[i + 1]) {
    cliHost = args[i + 1];
    i++;
  } else if (arg.startsWith('--hostname=')) {
    cliHost = arg.split('=')[1];
  }
}

const port = cliPort || parseInt(process.env.PORT || '3000', 10) || 3000;
const hostname = cliHost || process.env.HOSTNAME_OVERRIDE || '0.0.0.0';

let shuttingDown = false;
function handleSignal(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[Server] Received ${signal}, shutting down cleanly...`);
  process.exit(0);
}

process.on('SIGTERM', () => handleSignal('SIGTERM'));
process.on('SIGINT', () => handleSignal('SIGINT'));

const { nextStart } = require('next/dist/cli/next-start');

nextStart(
  {
    port,
    hostname,
    keepAliveTimeout: 5000,
  },
  process.cwd()
).catch((err) => {
  console.error('[Server] Failed to start Next.js production server:', err);
  process.exit(1);
});
