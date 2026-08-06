#!/usr/bin/env node
// =============================================================================
// ForgeMind — setup.js
// Developer onboarding script: validates environment and bootstraps the project
// Run with: node scripts/setup.js
// =============================================================================

import { execSync } from 'node:child_process';
import { existsSync, copyFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RED = '\x1b[31m';
const CYAN = '\x1b[36m';
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';

function log(msg) {
  console.log(`${CYAN}[setup]${RESET} ${msg}`);
}
function success(msg) {
  console.log(`${GREEN}✔${RESET} ${msg}`);
}
function warn(msg) {
  console.log(`${YELLOW}⚠${RESET} ${msg}`);
}
function error(msg) {
  console.log(`${RED}✘${RESET} ${msg}`);
}
function section(msg) {
  console.log(`\n${BOLD}${CYAN}── ${msg} ${'─'.repeat(40 - msg.length)}${RESET}`);
}

// ── Check Node.js version ─────────────────────────────────────────────────────
section('Checking Node.js');
const nodeVersion = process.versions.node;
const [major] = nodeVersion.split('.').map(Number);
if (major < 20) {
  error(`Node.js 20+ required. Found: v${nodeVersion}`);
  process.exit(1);
}
success(`Node.js v${nodeVersion}`);

// ── Check pnpm ───────────────────────────────────────────────────────────────
section('Checking pnpm');
try {
  const pnpmVersion = execSync('pnpm --version', { encoding: 'utf8' }).trim();
  success(`pnpm v${pnpmVersion}`);
} catch {
  error('pnpm not found. Install with: npm install -g pnpm@9');
  process.exit(1);
}

// ── Copy .env.example to .env ─────────────────────────────────────────────────
section('Environment setup');
const envExamplePath = resolve(ROOT, '.env.example');
const envPath = resolve(ROOT, '.env');

if (existsSync(envPath)) {
  warn('.env already exists — skipping copy. Update it manually if needed.');
} else {
  copyFileSync(envExamplePath, envPath);
  success('.env created from .env.example');
  warn('ACTION REQUIRED: Open .env and fill in your Supabase credentials.');
}

// ── Install dependencies ──────────────────────────────────────────────────────
section('Installing dependencies');
log('Running pnpm install...');
try {
  execSync('pnpm install', { cwd: ROOT, stdio: 'inherit' });
  success('Dependencies installed');
} catch {
  error('pnpm install failed');
  process.exit(1);
}

// ── Setup Husky ───────────────────────────────────────────────────────────────
section('Husky git hooks');
try {
  execSync('pnpm exec husky', { cwd: ROOT, stdio: 'inherit' });
  success('Husky initialized');
} catch {
  warn('Husky setup skipped (may not be a git repository yet)');
}

// ── Done ──────────────────────────────────────────────────────────────────────
console.log(`
${GREEN}${BOLD}
  ╔══════════════════════════════════════════╗
  ║   ForgeMind — Setup Complete! 🎉         ║
  ╠══════════════════════════════════════════╣
  ║  Next steps:                             ║
  ║  1. Edit .env with your credentials      ║
  ║  2. Run: pnpm dev                        ║
  ║  3. Web → http://localhost:3000          ║
  ║  4. API → http://localhost:4000/api/v1   ║
  ╚══════════════════════════════════════════╝
${RESET}`);
