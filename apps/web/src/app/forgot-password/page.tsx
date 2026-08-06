'use client';

// =============================================================================
// ForgeMind Web — Forgot Password Page
// =============================================================================

import Link from 'next/link';
import React, { useState } from 'react';

import { Button } from '@forgemind/ui';

import { ProtectedRoute } from '@/components/ProtectedRoute';
import { useAuth } from '@/context/AuthContext';

export default function ForgotPasswordPage() {
  const { forgotPassword } = useAuth();

  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      setError('Please enter your email address.');
      return;
    }

    try {
      setError(null);
      setSubmitting(true);
      await forgotPassword(email);
      setSent(true);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Failed to send reset link. Please try again.';
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ProtectedRoute requireAuth={false}>
      <main className="min-h-screen bg-zinc-950 text-white flex items-center justify-center p-6">
        <div className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-2xl p-8 shadow-2xl">
          {/* Header */}
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold bg-gradient-to-r from-white via-zinc-200 to-zinc-400 bg-clip-text text-transparent mb-2">
              Reset Your Password
            </h1>
            <p className="text-zinc-400 text-sm">
              Enter your email address and we&apos;ll send you a password reset link
            </p>
          </div>

          {sent ? (
            <div className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-sm rounded-lg p-6 text-center space-y-4">
              <div className="w-12 h-12 bg-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center mx-auto text-xl font-bold">
                ✓
              </div>
              <h2 className="text-base font-semibold text-white">Reset Link Sent</h2>
              <p className="text-zinc-300 text-xs leading-relaxed">
                If an account exists for{' '}
                <span className="font-medium text-emerald-400">{email}</span>, you will receive a
                password reset link shortly.
              </p>
              <Link
                href="/login"
                className="inline-block text-xs font-semibold bg-emerald-500 text-zinc-950 px-4 py-2 rounded-lg hover:bg-emerald-400 transition-colors mt-2"
              >
                Return to Sign In →
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

                <Button
                  type="submit"
                  disabled={submitting}
                  className="w-full bg-emerald-500 hover:bg-emerald-600 text-zinc-950 font-semibold h-11 text-sm transition-colors mt-2"
                >
                  {submitting ? 'Sending Link...' : 'Send Reset Link'}
                </Button>
              </form>

              {/* Footer Link */}
              <p className="text-center text-xs text-zinc-500 mt-6">
                Remember your password?{' '}
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
    </ProtectedRoute>
  );
}
