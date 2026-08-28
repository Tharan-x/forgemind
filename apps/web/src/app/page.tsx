'use client';

// =============================================================================
// ForgeMind Web — Landing Page (with Trusted Device Security)
// =============================================================================

import Link from 'next/link';

import { APP_NAME, APP_VERSION } from '@forgemind/shared';
import { Button } from '@forgemind/ui';

import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { useAuth } from '@/context/AuthContext';

export default function Home() {
  const { user, loading, isDeviceTrusted, deviceLoading } = useAuth();
  const isLoading = loading || (Boolean(user) && deviceLoading);

  return (
    <main className="min-h-screen bg-zinc-950 text-white flex flex-col items-center justify-center p-8">
      {/* Header */}
      <div className="text-center mb-12">
        <div className="inline-flex items-center gap-2 bg-zinc-900 border border-zinc-800 rounded-full px-4 py-1.5 text-sm text-zinc-400 mb-6">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          Trusted Device &amp; Session Security Hardened
        </div>

        <h1 className="text-5xl font-bold bg-gradient-to-r from-white via-zinc-200 to-zinc-500 bg-clip-text text-transparent mb-4">
          {APP_NAME}
        </h1>

        <p className="text-zinc-400 text-lg max-w-xl">
          AI-Powered GitHub Repository Intelligence &amp; Developer Onboarding SaaS Platform
        </p>

        <p className="text-zinc-600 text-sm mt-2">v{APP_VERSION}</p>
      </div>

      {/* Auth Actions CTA */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 max-w-md w-full text-center space-y-6 shadow-2xl">
        <h2 className="text-xl font-bold text-white">
          {isLoading
            ? 'Verifying Session...'
            : user
              ? isDeviceTrusted
                ? 'Welcome Back!'
                : 'Session Verification Required'
              : 'Get Started'}
        </h2>

        <p className="text-xs text-zinc-400 leading-relaxed">
          {isLoading
            ? 'Checking authentication and device trust state...'
            : user
              ? isDeviceTrusted
                ? 'Access your authenticated dashboard, repository management, and account settings.'
                : 'Verify your identity to continue. This device is not currently registered as trusted.'
              : 'Sign in or create an account to access protected workspace intelligence and project management.'}
        </p>

        {isLoading ? (
          <div className="py-4">
            <LoadingSpinner size="sm" label="Verifying session..." />
          </div>
        ) : user ? (
          <div className="space-y-3">
            <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-xs text-zinc-300">
              Signed in as <span className="text-emerald-400 font-semibold">{user.email}</span>
              {isDeviceTrusted && (
                <span className="ml-2 text-[10px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-1.5 py-0.5 rounded">
                  ✓ Trusted Device
                </span>
              )}
            </div>

            {isDeviceTrusted ? (
              <Button
                variant="default"
                className="w-full bg-emerald-500 hover:bg-emerald-600 text-zinc-950 font-semibold h-11 text-sm transition-colors"
                asChild
              >
                <Link href="/dashboard">Go to Dashboard →</Link>
              </Button>
            ) : (
              <Button
                variant="default"
                className="w-full bg-amber-500 hover:bg-amber-600 text-zinc-950 font-semibold h-11 text-sm transition-colors"
                asChild
              >
                <Link href="/login">Verify your identity to continue →</Link>
              </Button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <Button
              variant="default"
              className="bg-emerald-500 hover:bg-emerald-600 text-zinc-950 font-semibold h-11 text-sm transition-colors"
              asChild
            >
              <Link href="/login">Sign In</Link>
            </Button>
            <Button
              variant="outline"
              className="border-zinc-700 bg-zinc-800 text-zinc-200 hover:bg-zinc-700 h-11 text-sm transition-colors"
              asChild
            >
              <Link href="/register">Sign Up</Link>
            </Button>
          </div>
        )}
      </div>

      {/* Footer */}
      <p className="text-zinc-700 text-xs mt-12">
        ForgeMind Trusted Device &amp; Session Security active.
      </p>
    </main>
  );
}
