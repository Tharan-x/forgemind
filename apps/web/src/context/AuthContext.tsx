'use client';

// =============================================================================
// ForgeMind Web — Auth Context & Provider (with Trusted Device Security)
// =============================================================================

import type { User, Session } from '@supabase/supabase-js';
import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';

import {
  signInWithEmail,
  signUpWithEmail,
  signOut,
  signInWithGithub,
  signInWithGoogle,
  resetPasswordForEmail,
  updatePassword,
  updateProfile as updateProfileApi,
} from '@/lib/auth';
import {
  getDeviceId,
  getDeviceMetadata,
  checkDeviceTrustApi,
  setDeviceTrustApi,
  revokeUserDeviceApi,
} from '@/lib/device.api';
import { supabase, DYNAMIC_STORAGE_KEY_PREFERENCE } from '@/lib/supabase';

export interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  isDeviceTrusted: boolean;
  deviceLoading: boolean;
  lastReauthenticatedAt: number | null;
  login: (email: string, password: string, trustDevice?: boolean) => Promise<void>;
  signup: (email: string, password: string, name?: string, trustDevice?: boolean) => Promise<void>;
  logout: () => Promise<void>;
  loginWithGithub: () => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  forgotPassword: (email: string) => Promise<void>;
  resetPassword: (newPassword: string) => Promise<void>;
  updateProfile: (name?: string, avatarUrl?: string) => Promise<void>;
  trustDevice: (trust?: boolean, password?: string) => Promise<void>;
  revokeDevice: (id: string) => Promise<void>;
  reauthenticate: (password: string) => Promise<boolean>;
  isReauthenticatedRecently: (maxAgeMs?: number) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [isDeviceTrusted, setIsDeviceTrusted] = useState<boolean>(false);
  const [deviceLoading, setDeviceLoading] = useState<boolean>(true);
  const [lastReauthenticatedAt, setLastReauthenticatedAt] = useState<number | null>(null);

  const verifyDeviceTrust = useCallback(async (activeUser: User | null, token?: string) => {
    if (!activeUser) {
      setIsDeviceTrusted(false);
      setDeviceLoading(false);
      return;
    }

    try {
      const deviceId = getDeviceId();
      const status = await checkDeviceTrustApi(deviceId, token);
      setIsDeviceTrusted(status.isTrusted);

      if (status.isTrusted && typeof window !== 'undefined') {
        window.localStorage.setItem(DYNAMIC_STORAGE_KEY_PREFERENCE, 'true');
      }
    } catch {
      setIsDeviceTrusted(false);
    } finally {
      setDeviceLoading(false);
    }
  }, []);

  useEffect(() => {
    // 1. Restore active session on initial load
    supabase.auth
      .getSession()
      .then(({ data: { session } }) => {
        setSession(session);
        setUser(session?.user ?? null);
        setLoading(false);
        verifyDeviceTrust(session?.user ?? null, session?.access_token);
      })
      .catch(() => {
        setLoading(false);
        setDeviceLoading(false);
      });

    // 2. Subscribe to auth state changes (restore, refresh, or expire session)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
      verifyDeviceTrust(session?.user ?? null, session?.access_token);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [verifyDeviceTrust]);

  const login = async (email: string, password: string, trustDeviceChoice = false) => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(
        DYNAMIC_STORAGE_KEY_PREFERENCE,
        trustDeviceChoice ? 'true' : 'false',
      );
    }

    const res = await signInWithEmail(email, password);
    setUser(res.user ?? null);
    setSession(res.session ?? null);
    setLastReauthenticatedAt(Date.now());

    if (res.user) {
      const meta = getDeviceMetadata();
      await setDeviceTrustApi(
        {
          deviceId: getDeviceId(),
          deviceName: meta.deviceName,
          browser: meta.browser,
          os: meta.os,
          trust: trustDeviceChoice,
          password: trustDeviceChoice ? password : undefined,
        },
        res.session?.access_token,
      );
      setIsDeviceTrusted(trustDeviceChoice);
    }
  };

  const signup = async (
    email: string,
    password: string,
    name?: string,
    trustDeviceChoice = false,
  ) => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(
        DYNAMIC_STORAGE_KEY_PREFERENCE,
        trustDeviceChoice ? 'true' : 'false',
      );
    }

    const res = await signUpWithEmail(email, password, name);
    if (res.session && res.user) {
      setUser(res.user);
      setSession(res.session);
      setLastReauthenticatedAt(Date.now());

      const meta = getDeviceMetadata();
      await setDeviceTrustApi(
        {
          deviceId: getDeviceId(),
          deviceName: meta.deviceName,
          browser: meta.browser,
          os: meta.os,
          trust: trustDeviceChoice,
          password: trustDeviceChoice ? password : undefined,
        },
        res.session?.access_token,
      );
      setIsDeviceTrusted(trustDeviceChoice);
    }
  };

  const logout = async () => {
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(DYNAMIC_STORAGE_KEY_PREFERENCE);
    }
    await signOut();
    setUser(null);
    setSession(null);
    setIsDeviceTrusted(false);
    setLastReauthenticatedAt(null);
  };

  const loginWithGithub = async () => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(DYNAMIC_STORAGE_KEY_PREFERENCE, 'true');
    }
    await signInWithGithub();
  };

  const loginWithGoogle = async () => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(DYNAMIC_STORAGE_KEY_PREFERENCE, 'true');
    }
    await signInWithGoogle();
  };

  const forgotPassword = async (email: string) => {
    await resetPasswordForEmail(email);
  };

  const resetPassword = async (newPassword: string) => {
    await updatePassword(newPassword);
    setLastReauthenticatedAt(Date.now());
  };

  const updateProfile = async (name?: string, avatarUrl?: string) => {
    const data = await updateProfileApi(name, avatarUrl);
    if (data.user) {
      setUser(data.user);
    }
  };

  const trustDevice = async (trust = true, password?: string) => {
    if (!user) return;
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(DYNAMIC_STORAGE_KEY_PREFERENCE, trust ? 'true' : 'false');
    }
    const meta = getDeviceMetadata();
    await setDeviceTrustApi({
      deviceId: getDeviceId(),
      deviceName: meta.deviceName,
      browser: meta.browser,
      os: meta.os,
      trust,
      password: trust ? password : undefined,
    });
    setIsDeviceTrusted(trust);
  };

  const revokeDevice = async (targetId: string) => {
    await revokeUserDeviceApi(targetId);
    if (targetId === getDeviceId()) {
      setIsDeviceTrusted(false);
      if (typeof window !== 'undefined') {
        window.localStorage.removeItem(DYNAMIC_STORAGE_KEY_PREFERENCE);
      }
    }
  };

  const reauthenticate = async (password: string): Promise<boolean> => {
    if (!user || !user.email) throw new Error('No active user to re-authenticate.');
    const { error } = await supabase.auth.signInWithPassword({
      email: user.email,
      password,
    });

    if (error) {
      throw error;
    }

    setLastReauthenticatedAt(Date.now());
    return true;
  };

  const isReauthenticatedRecently = (maxAgeMs = 15 * 60 * 1000): boolean => {
    if (!lastReauthenticatedAt) return false;
    return Date.now() - lastReauthenticatedAt <= maxAgeMs;
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        loading,
        isDeviceTrusted,
        deviceLoading,
        lastReauthenticatedAt,
        login,
        signup,
        logout,
        loginWithGithub,
        loginWithGoogle,
        forgotPassword,
        resetPassword,
        updateProfile,
        trustDevice,
        revokeDevice,
        reauthenticate,
        isReauthenticatedRecently,
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
