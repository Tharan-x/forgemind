#!/usr/bin/env node
// =============================================================================
// ForgeMind — clean.js
// Removes all build artifacts and caches across the monorepo
// Run with: node scripts/clean.js
// =============================================================================

import { rmSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { globSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const CYAN = '\x1b[36m';
const GREEN = '\x1b[32m';
const RESET = '\x1b[0m';

function remove(path) {
  if (existsSync(path)) {
    rmSync(path, { recursive: true, force: true });
    console.log(`${CYAN}removed${RESET} ${path.replace(ROOT, '.')}`);
  }
}

const targets = [
  // Turbo cache
  '.turbo',
  // Next.js
  'apps/web/.next',
  'apps/web/dist',
  // API
  'apps/api/dist',
  // Package builds
  'packages/ui/dist',
  'packages/shared/dist',
  'packages/types/dist',
  // TS build info
  ...['apps/web', 'apps/api', 'packages/ui', 'packages/shared', 'packages/types'].flatMap(
    (dir) => [`${dir}/tsconfig.tsbuildinfo`, `${dir}/*.tsbuildinfo`],
  ),
];

console.log('\n🧹 Cleaning ForgeMind build artifacts...\n');

for (const target of targets) {
  remove(resolve(ROOT, target));
}

console.log(`\n${GREEN}✔ Clean complete${RESET}\n`);
