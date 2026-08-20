// =============================================================================
// ForgeMind API — Environment Configuration
// =============================================================================

import { config } from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load .env from the monorepo root (three levels up from apps/api/src/config)
config({ path: path.resolve(__dirname, '../../.env') });

function optionalEnv(key: string, fallback: string): string {
  return process.env[key] ?? fallback;
}

export const env = {
  NODE_ENV: optionalEnv('NODE_ENV', 'development') as
    'development' | 'staging' | 'production' | 'test',
  PORT: parseInt(optionalEnv('API_PORT', '4000'), 10),
  HOST: optionalEnv('API_HOST', '0.0.0.0'),

  // Database
  DATABASE_URL: optionalEnv('DATABASE_URL', ''),
  DIRECT_URL: optionalEnv('DIRECT_URL', ''),

  // Supabase
  SUPABASE_URL: optionalEnv('SUPABASE_URL', ''),
  SUPABASE_ANON_KEY: optionalEnv('SUPABASE_ANON_KEY', ''),
  SUPABASE_SERVICE_ROLE_KEY: optionalEnv('SUPABASE_SERVICE_ROLE_KEY', ''),

  // Helpers
  get isDevelopment() {
    return this.NODE_ENV === 'development';
  },
  get isProduction() {
    return this.NODE_ENV === 'production';
  },
  get isTest() {
    return this.NODE_ENV === 'test';
  },
} as const;
