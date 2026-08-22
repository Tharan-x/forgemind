// =============================================================================
// ForgeMind API — Standalone Background Worker Entry Point
// =============================================================================

import { startAnalysisWorkerLoop } from './services/analysis-worker.service.js';

// eslint-disable-next-line no-console
console.log('⚡ ForgeMind Background Analysis Worker process started.');

const workerControls = startAnalysisWorkerLoop({ pollIntervalMs: 2000 });

function shutdown(signal: string) {
  // eslint-disable-next-line no-console
  console.log(`\n🛑 Worker received ${signal}. Stopping analysis worker...`);
  workerControls.stop();
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
