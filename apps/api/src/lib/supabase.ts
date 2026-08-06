// =============================================================================
// ForgeMind API — Reusable Supabase Client
// =============================================================================

import { createClient } from '@supabase/supabase-js';

import { env } from '../config/env.js';

const supabaseUrl = env.SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_ANON_KEY || 'placeholder-key';

export const supabase = createClient(supabaseUrl, supabaseKey);
