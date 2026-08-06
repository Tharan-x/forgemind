'use client';

// =============================================================================
// ForgeMind Web — Dashboard Page (Sprint 2 Phase 2A)
// =============================================================================

import React, { useState } from 'react';

import { Button } from '@forgemind/ui';

import { ProtectedRoute } from '@/components/ProtectedRoute';
import { useAuth } from '@/context/AuthContext';

export default function DashboardPage() {
  const { user, logout } = useAuth();
  const [loggingOut, setLoggingOut] = useState(false);

  const handleLogout = async () => {
    try {
      setLoggingOut(true);
      await logout();
    } catch {
      setLoggingOut(false);
    }
  };

  const name =
    (user?.user_metadata?.['name'] as string | undefined) ||
    (user?.user_metadata?.['full_name'] as string | undefined) ||
    user?.email?.split('@')[0] ||
    'User';

  const avatarUrl = user?.user_metadata?.['avatar_url'] as string | undefined;

  return (
    <ProtectedRoute requireAuth={true}>
      <div className="min-h-screen bg-zinc-950 text-white flex flex-col">
        {/* Topbar */}
        <header className="border-b border-zinc-800 bg-zinc-900/50 backdrop-blur px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-500 flex items-center justify-center font-bold text-zinc-950 text-sm">
              FM
            </div>
            <span className="font-semibold text-lg tracking-tight">ForgeMind</span>
            <span className="text-xs bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 px-2.5 py-0.5 rounded-full font-medium">
              Sprint 2 Phase 2A
            </span>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3 bg-zinc-900 border border-zinc-800 rounded-full px-3 py-1.5">
              {avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatarUrl} alt={name} className="w-6 h-6 rounded-full object-cover" />
              ) : (
                <div className="w-6 h-6 rounded-full bg-zinc-800 text-zinc-300 flex items-center justify-center text-xs font-semibold">
                  {name.charAt(0).toUpperCase()}
                </div>
              )}
              <span className="text-xs text-zinc-300 font-medium">{user?.email}</span>
            </div>

            {/* Logout Button */}
            <Button
              variant="outline"
              onClick={handleLogout}
              disabled={loggingOut}
              className="border-zinc-800 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 text-xs h-9 px-3.5"
            >
              {loggingOut ? 'Signing Out...' : 'Sign Out'}
            </Button>
          </div>
        </header>

        {/* Dashboard Main Content */}
        <main className="flex-1 p-8 max-w-6xl w-full mx-auto space-y-8">
          {/* Welcome Banner */}
          <div className="bg-gradient-to-r from-zinc-900 via-zinc-900/90 to-zinc-900 border border-zinc-800 rounded-2xl p-8 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs font-semibold text-emerald-400 uppercase tracking-widest bg-emerald-500/10 border border-emerald-500/20 px-3 py-1 rounded-full">
                Authentication Foundation Active
              </span>
              <span className="text-xs text-zinc-500">User ID: {user?.id}</span>
            </div>
            <h1 className="text-3xl font-bold text-white mb-2">Welcome back, {name}!</h1>
            <p className="text-zinc-400 text-sm max-w-2xl">
              Your authentication session is active and secure. Supabase Auth, JWT verification, and
              database profile synchronization are operational.
            </p>
          </div>

          {/* User Profile Overview */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 space-y-2">
              <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                Account Email
              </span>
              <p className="text-lg font-medium text-white truncate">{user?.email}</p>
              <p className="text-xs text-emerald-400 font-medium">✓ Verified &amp; Authenticated</p>
            </div>

            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 space-y-2">
              <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                Authentication Provider
              </span>
              <p className="text-lg font-medium text-white capitalize">
                {user?.app_metadata?.provider || 'Email & Password'}
              </p>
              <p className="text-xs text-zinc-400">Session restored on refresh</p>
            </div>

            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 space-y-2">
              <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                Security Status
              </span>
              <p className="text-lg font-medium text-white">Protected Route</p>
              <p className="text-xs text-emerald-400">✓ JWT verified by API backend</p>
            </div>
          </div>

          {/* Next Steps Card */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
            <h2 className="text-base font-semibold text-white mb-4">Sprint 2 Roadmap</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex items-start gap-3 bg-zinc-800/50 rounded-xl p-4 border border-zinc-800">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 mt-1.5 flex-shrink-0" />
                <div>
                  <h3 className="text-sm font-semibold text-zinc-200">
                    Phase 2A — Auth Foundation
                  </h3>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    Email auth, GitHub OAuth, JWT middleware, session persistence.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 bg-zinc-800/30 rounded-xl p-4 border border-zinc-800/60 opacity-60">
                <span className="w-2.5 h-2.5 rounded-full bg-zinc-600 mt-1.5 flex-shrink-0" />
                <div>
                  <h3 className="text-sm font-semibold text-zinc-400">
                    Phase 2B — Repository Foundation
                  </h3>
                  <p className="text-xs text-zinc-500 mt-0.5">
                    Repository connection, PAT encryption, workspace dashboard.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    </ProtectedRoute>
  );
}
