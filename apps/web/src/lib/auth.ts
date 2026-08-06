// =============================================================================
// ForgeMind Web — Reusable Auth Service
// =============================================================================

import type { User, Session } from '@supabase/supabase-js';

import { supabase } from './supabase';

export interface AuthState {
  user: User | null;
  session: Session | null;
  loading: boolean;
}

/**
 * Sign in with Email & Password.
 */
export async function signInWithEmail(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (error) throw error;
  return data;
}

/**
 * Sign up with Email, Password & Name.
 */
export async function signUpWithEmail(email: string, password: string, name?: string) {
  const redirectTo = typeof window !== 'undefined' ? `${window.location.origin}/login` : undefined;
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        name: name || '',
        full_name: name || '',
      },
      emailRedirectTo: redirectTo,
    },
  });
  if (error) throw error;
  return data;
}

/**
 * Sign in with GitHub OAuth provider.
 */
export async function signInWithGithub() {
  const redirectTo =
    typeof window !== 'undefined' ? `${window.location.origin}/dashboard` : undefined;
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'github',
    options: {
      redirectTo,
    },
  });
  if (error) throw error;
  return data;
}

/**
 * Send password reset email.
 */
export async function resetPasswordForEmail(email: string) {
  const redirectTo =
    typeof window !== 'undefined' ? `${window.location.origin}/reset-password` : undefined;
  const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo,
  });
  if (error) throw error;
  return data;
}

/**
 * Update password.
 */
export async function updatePassword(newPassword: string) {
  const { data, error } = await supabase.auth.updateUser({
    password: newPassword,
  });
  if (error) throw error;
  return data;
}

/**
 * Update display name and avatar URL in user metadata.
 */
export async function updateProfile(name?: string, avatarUrl?: string) {
  const metadataUpdates: Record<string, string> = {};
  if (name !== undefined) {
    metadataUpdates['name'] = name;
    metadataUpdates['full_name'] = name;
  }
  if (avatarUrl !== undefined) {
    metadataUpdates['avatar_url'] = avatarUrl;
  }

  const { data, error } = await supabase.auth.updateUser({
    data: metadataUpdates,
  });
  if (error) throw error;
  return data;
}

/**
 * Sign out current user session.
 */
export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

/**
 * Get active session.
 */
export async function getSession() {
  const { data } = await supabase.auth.getSession();
  return data.session;
}

/**
 * Get current user.
 */
export async function getUser() {
  const { data } = await supabase.auth.getUser();
  return data.user;
}
