'use client';

// =============================================================================
// ForgeMind Web — Protected Route Guard (with Trusted Device Security)
// =============================================================================

import { useRouter } from 'next/navigation';
import React, { useEffect } from 'react';

import { useAuth } from '@/context/AuthContext';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requireAuth?: boolean;
}

export function ProtectedRoute({ children, requireAuth = true }: ProtectedRouteProps) {
  const { user, loading, deviceLoading } = useAuth();
  const router = useRouter();

  const isLoading = loading || (Boolean(user) && deviceLoading);

  useEffect(() => {
    if (!isLoading) {
      if (requireAuth) {
        if (!user) {
          router.push('/login');
        }
      } else if (!requireAuth && user) {
        // Authenticated user accessing auth page (/login) -> redirect to /dashboard
        router.push('/dashboard');
      }
    }
  }, [isLoading, user, requireAuth, router]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center p-4 text-white">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-4 border-zinc-700 border-t-emerald-500 rounded-full animate-spin" />
          <p className="text-zinc-400 text-sm animate-pulse">Verifying security session...</p>
        </div>
      </div>
    );
  }

  if (requireAuth && !user) {
    return null;
  }

  if (!requireAuth && user) {
    return null;
  }

  return <>{children}</>;
}
