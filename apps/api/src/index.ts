import { createApp } from './app.js';
import { env } from './config/env.js';
import { startAnalysisWorkerLoop } from './services/analysis-worker.service.js';

const app = createApp();

app.listen(env.PORT, env.HOST, () => {
  // eslint-disable-next-line no-console
  console.log(`
  ╔══════════════════════════════════════╗
  ║          ForgeMind API               ║
  ║  Sprint 0 — Infrastructure Ready    ║
  ╠══════════════════════════════════════╣
  ║  Status : Running                   ║
  ║  Host   : ${env.HOST}:${env.PORT}             ║
  ║  Env    : ${env.NODE_ENV.padEnd(26)}║
  ║  URL    : http://localhost:${env.PORT}       ║
  ╚══════════════════════════════════════╝
  `);

  if (process.env['ENABLE_IN_PROCESS_WORKER'] !== 'false') {
    startAnalysisWorkerLoop({ pollIntervalMs: 2000 });
  }
});
