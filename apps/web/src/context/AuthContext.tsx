'use client';

// =============================================================================
// ForgeMind Web — Auth Context & Provider
// =============================================================================

import type { User, Session } from '@supabase/supabase-js';
import React, { createContext, useContext, useEffect, useState } from 'react';

import {
  signInWithEmail,
  signUpWithEmail,
  signOut,
  signInWithGithub,
  resetPasswordForEmail,
  updatePassword,
  updateProfile as updateProfileApi,
} from '@/lib/auth';
import { supabase } from '@/lib/supabase';

export interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, name?: string) => Promise<void>;
  logout: () => Promise<void>;
  loginWithGithub: () => Promise<void>;
  forgotPassword: (email: string) => Promise<void>;
  resetPassword: (newPassword: string) => Promise<void>;
  updateProfile: (name?: string, avatarUrl?: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    // 1. Restore active session on initial load
    supabase.auth
      .getSession()
      .then(({ data: { session } }) => {
        setSession(session);
        setUser(session?.user ?? null);
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
      });

    // 2. Subscribe to auth state changes (restore, refresh, or expire session)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const login = async (email: string, password: string) => {
    await signInWithEmail(email, password);
  };

  const signup = async (email: string, password: string, name?: string) => {
    await signUpWithEmail(email, password, name);
  };

  const logout = async () => {
    await signOut();
    setUser(null);
    setSession(null);
  };

  const loginWithGithub = async () => {
    await signInWithGithub();
  };

  const forgotPassword = async (email: string) => {
    await resetPasswordForEmail(email);
  };

  const resetPassword = async (newPassword: string) => {
    await updatePassword(newPassword);
  };

  const updateProfile = async (name?: string, avatarUrl?: string) => {
    const data = await updateProfileApi(name, avatarUrl);
    if (data.user) {
      setUser(data.user);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        loading,
        login,
        signup,
        logout,
        loginWithGithub,
        forgotPassword,
        resetPassword,
        updateProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
