import { createApp } from './app.js';
import { env } from './config/env.js';

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
});
