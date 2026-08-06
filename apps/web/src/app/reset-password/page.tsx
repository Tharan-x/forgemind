'use client';

// =============================================================================
// ForgeMind Web — Reset Password Page
// =============================================================================

import Link from 'next/link';
import React, { useState } from 'react';

import { Button } from '@forgemind/ui';

import { useAuth } from '@/context/AuthContext';

export default function ResetPasswordPage() {
  const { resetPassword } = useAuth();

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updated, setUpdated] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password || !confirmPassword) {
      setError('Please fill in all fields.');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    try {
      setError(null);
      setSubmitting(true);
      await resetPassword(password);
      setUpdated(true);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Failed to update password. Please try again.';
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-zinc-950 text-white flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-2xl p-8 shadow-2xl">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold bg-gradient-to-r from-white via-zinc-200 to-zinc-400 bg-clip-text text-transparent mb-2">
            Set New Password
          </h1>
          <p className="text-zinc-400 text-sm">Enter your new password below</p>
        </div>

        {updated ? (
          <div className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-sm rounded-lg p-6 text-center space-y-4">
            <div className="w-12 h-12 bg-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center mx-auto text-xl font-bold">
              ✓
            </div>
            <h2 className="text-base font-semibold text-white">Password Updated!</h2>
            <p className="text-zinc-300 text-xs leading-relaxed">
              Your password has been successfully updated. You can now sign in with your new
              credentials.
            </p>
            <Link
              href="/login"
              className="inline-block text-xs font-semibold bg-emerald-500 text-zinc-950 px-4 py-2 rounded-lg hover:bg-emerald-400 transition-colors mt-2"
            >
              Sign In Now →
            </Link>
          </div>
        ) : (
          <>
            {/* Error Alert */}
            {error && (
              <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm rounded-lg p-3.5 mb-6 text-center">
                {error}
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label
                  htmlFor="password"
                  className="block text-xs font-medium text-zinc-400 mb-1.5"
                >
                  New Password (min. 6 characters)
                </label>
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

              <div>
                <label
                  htmlFor="confirmPassword"
                  className="block text-xs font-medium text-zinc-400 mb-1.5"
                >
                  Confirm New Password
                </label>
                <input
                  id="confirmPassword"
                  type="password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2.5 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-emerald-500 transition-colors"
                />
              </div>

              <Button
                type="submit"
                disabled={submitting}
                className="w-full bg-emerald-500 hover:bg-emerald-600 text-zinc-950 font-semibold h-11 text-sm transition-colors mt-2"
              >
                {submitting ? 'Updating Password...' : 'Update Password'}
              </Button>
            </form>

            {/* Footer Link */}
            <p className="text-center text-xs text-zinc-500 mt-6">
              Back to{' '}
              <Link
                href="/login"
                className="text-emerald-400 hover:text-emerald-300 font-medium transition-colors"
              >
                Sign In
              </Link>
            </p>
          </>
        )}
      </div>
    </main>
  );
}
