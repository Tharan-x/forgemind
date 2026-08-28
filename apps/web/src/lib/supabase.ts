// =============================================================================
// ForgeMind Web — Reusable Supabase Client (with Dynamic Storage Adapter)
// =============================================================================

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env['NEXT_PUBLIC_SUPABASE_URL'] || '';
const supabaseAnonKey = process.env['NEXT_PUBLIC_SUPABASE_ANON_KEY'] || '';

export const DYNAMIC_STORAGE_KEY_PREFERENCE = 'forgemind_trust_device_pref';

/**
 * Custom Storage Adapter for Supabase Client.
 * Dynamically switches session token storage between localStorage (trusted)
 * and sessionStorage (untrusted / shared device).
 */
const dynamicStorageAdapter = {
  getItem: (key: string): string | null => {
    if (typeof window === 'undefined') return null;
    const sessionVal = window.sessionStorage.getItem(key);
    if (sessionVal !== null) return sessionVal;
    return window.localStorage.getItem(key);
  },
  setItem: (key: string, value: string): void => {
    if (typeof window === 'undefined') return;
    const isTrusted = window.localStorage.getItem(DYNAMIC_STORAGE_KEY_PREFERENCE) === 'true';
    if (isTrusted) {
      window.localStorage.setItem(key, value);
      window.sessionStorage.removeItem(key);
    } else {
      window.sessionStorage.setItem(key, value);
      window.localStorage.removeItem(key);
    }
  },
  removeItem: (key: string): void => {
    if (typeof window === 'undefined') return;
    window.sessionStorage.removeItem(key);
    window.localStorage.removeItem(key);
  },
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: dynamicStorageAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  },
});
