'use client';

// =============================================================================
// ForgeMind Web — Login Page (with Trusted Device Support)
// =============================================================================

import Link from 'next/link';
import React, { useState } from 'react';

import { Button } from '@forgemind/ui';

import { ProtectedRoute } from '@/components/ProtectedRoute';
import { useAuth } from '@/context/AuthContext';

export default function LoginPage() {
  const { login, loginWithGithub, loginWithGoogle } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [trustDeviceChoice, setTrustDeviceChoice] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [oauthSubmitting, setOauthSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError('Please fill in all fields.');
      return;
    }

    try {
      setError(null);
      setSubmitting(true);
      await login(email, password, trustDeviceChoice);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Invalid credentials. Please try again.';
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleGithubOAuth = async () => {
    try {
      setError(null);
      setOauthSubmitting(true);
      await loginWithGithub();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'GitHub authentication failed.';
      setError(message);
      setOauthSubmitting(false);
    }
  };

  const handleGoogleOAuth = async () => {
    try {
      setError(null);
      setOauthSubmitting(true);
      await loginWithGoogle();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Google authentication failed.';
      setError(message);
      setOauthSubmitting(false);
    }
  };

  return (
    <ProtectedRoute requireAuth={false}>
      <main className="min-h-screen bg-zinc-950 text-white flex items-center justify-center p-6">
        <div className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-2xl p-8 shadow-2xl">
          {/* Header */}
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold bg-gradient-to-r from-white via-zinc-200 to-zinc-400 bg-clip-text text-transparent mb-2">
              Welcome to ForgeMind
            </h1>
            <p className="text-zinc-400 text-sm">
              Sign in to your account to access repository intelligence
            </p>
          </div>

          {/* Error Alert */}
          {error && (
            <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm rounded-lg p-3.5 mb-6 text-center">
              {error}
            </div>
          )}

          {/* OAuth Buttons */}
          <div className="space-y-3 mb-6">
            <Button
              variant="outline"
              onClick={handleGithubOAuth}
              disabled={oauthSubmitting || submitting}
              className="w-full bg-zinc-800 hover:bg-zinc-700 text-white border-zinc-700 h-11 text-sm font-medium flex items-center justify-center gap-3"
            >
              <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
              </svg>
              {oauthSubmitting ? 'Connecting...' : 'Continue with GitHub'}
            </Button>

            <Button
              variant="outline"
              onClick={handleGoogleOAuth}
              disabled={oauthSubmitting || submitting}
              className="w-full bg-zinc-800 hover:bg-zinc-700 text-white border-zinc-700 h-11 text-sm font-medium flex items-center justify-center gap-3"
            >
              <svg className="w-5 h-5 fill-current text-white" viewBox="0 0 24 24">
                <path d="M12.545,10.239v3.821h5.445c-0.712,2.315-2.647,3.972-5.445,3.972c-3.332,0-6.033-2.701-6.033-6.032s2.701-6.032,6.033-6.032c1.498,0,2.866,0.549,3.921,1.453l2.814-2.814C17.503,2.988,15.139,2,12.545,2C7.021,2,2.545,6.477,2.545,12s4.476,10,10,10c5.757,0,9.584-4.049,9.584-9.754c0-0.655-0.071-1.305-0.187-1.954H12.545z" />
              </svg>
              {oauthSubmitting ? 'Connecting...' : 'Continue with Google'}
            </Button>
          </div>

          {/* Divider */}
          <div className="relative flex items-center justify-center mb-6">
            <div className="border-t border-zinc-800 w-full" />
            <span className="bg-zinc-900 px-3 text-xs text-zinc-500 uppercase tracking-widest absolute">
              or
            </span>
          </div>

          {/* Email Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-xs font-medium text-zinc-400 mb-1.5">
                Email Address
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@company.com"
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2.5 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-emerald-500 transition-colors"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label htmlFor="password" className="block text-xs font-medium text-zinc-400">
                  Password
                </label>
                <Link
                  href="/forgot-password"
                  className="text-xs text-emerald-400 hover:text-emerald-300 transition-colors"
                >
                  Forgot Password?
                </Link>
              </div>
              <input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2.5 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-emerald-500 transition-colors"
              />
            </div>

            {/* Trust This Device Checkbox */}
            <div className="pt-2">
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={trustDeviceChoice}
                  onChange={(e) => setTrustDeviceChoice(e.target.checked)}
                  className="mt-0.5 rounded bg-zinc-950 border-zinc-800 text-emerald-500 focus:ring-emerald-500"
                />
                <div>
                  <span className="text-xs font-medium text-zinc-300">Trust this device</span>
                  <p className="text-[11px] text-zinc-500 mt-0.5 leading-tight">
                    Trust this personal device for 30 days. Don&apos;t enable this on shared
                    computers.
                  </p>
                </div>
              </label>
            </div>

            <Button
              type="submit"
              disabled={submitting || oauthSubmitting}
              className="w-full bg-emerald-500 hover:bg-emerald-600 text-zinc-950 font-semibold h-11 text-sm transition-colors mt-2"
            >
              {submitting ? 'Signing In...' : 'Sign In'}
            </Button>
          </form>

          {/* Footer Link */}
          <p className="text-center text-xs text-zinc-500 mt-6">
            Don&apos;t have an account?{' '}
            <Link
              href="/register"
              className="text-emerald-400 hover:text-emerald-300 font-medium transition-colors"
            >
              Sign Up
            </Link>
          </p>
        </div>
      </main>
    </ProtectedRoute>
  );
}
