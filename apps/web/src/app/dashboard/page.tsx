'use client';

// =============================================================================
// ForgeMind Web — Dashboard Page
// =============================================================================

import Link from 'next/link';
import React from 'react';

import { Button } from '@forgemind/ui';

import { ProtectedLayout } from '@/components/dashboard/ProtectedLayout';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { useAuth } from '@/context/AuthContext';

export default function DashboardPage() {
  const { user } = useAuth();

  const name =
    (user?.user_metadata?.['name'] as string | undefined) ||
    (user?.user_metadata?.['full_name'] as string | undefined) ||
    user?.email?.split('@')[0] ||
    'User';

  const avatarUrl = user?.user_metadata?.['avatar_url'] as string | undefined;
  const provider = user?.app_metadata?.provider || 'Email & Password';
  const isEmailVerified = Boolean(user?.email_confirmed_at);
  const createdAtFormatted = user?.created_at
    ? new Date(user.created_at).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : 'N/A';

  return (
    <ProtectedLayout>
      <div className="space-y-8">
        {/* Welcome Header */}
        <div className="bg-gradient-to-r from-zinc-900 via-zinc-900/90 to-zinc-900 border border-zinc-800 rounded-2xl p-8 shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="flex items-center gap-5">
            <UserAvatar name={name} email={user?.email} avatarUrl={avatarUrl} size="lg" />
            <div>
              <div className="flex items-center gap-3 mb-1">
                <h1 className="text-2xl font-bold text-white">Welcome back, {name}!</h1>
                <span className="text-xs bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 px-2.5 py-0.5 rounded-full font-medium">
                  ForgeMind V1 Active
                </span>
              </div>
              <p className="text-zinc-400 text-sm">{user?.email}</p>
            </div>
          </div>

          <Button
            variant="default"
            className="bg-emerald-500 hover:bg-emerald-600 text-zinc-950 font-semibold text-xs h-10 px-5 transition-colors"
            asChild
          >
            <Link href="/dashboard/settings">Manage Account →</Link>
          </Button>
        </div>

        {/* User Information Metrics (Task 2) */}
        <div>
          <h2 className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-4">
            Authenticated Profile Summary
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* 1. Account Name */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-1">
              <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
                Full Name
              </span>
              <p className="text-base font-bold text-white truncate">{name}</p>
              <p className="text-xs text-zinc-500">Public display name</p>
            </div>

            {/* 2. Authentication Provider */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-1">
              <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
                Auth Provider
              </span>
              <p className="text-base font-bold text-white capitalize">{provider}</p>
              <p className="text-xs text-zinc-500">Supabase Auth Session</p>
            </div>

            {/* 3. Email Verification */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-1">
              <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
                Verification
              </span>
              <p
                className={`text-base font-bold ${
                  isEmailVerified ? 'text-emerald-400' : 'text-amber-400'
                }`}
              >
                {isEmailVerified ? '✓ Verified' : '⚠ Pending'}
              </p>
              <p className="text-xs text-zinc-500">Email confirmation status</p>
            </div>

            {/* 4. Registration Date */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-1">
              <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
                Member Since
              </span>
              <p className="text-base font-bold text-white truncate">{createdAtFormatted}</p>
              <p className="text-xs text-zinc-500">Account creation date</p>
            </div>
          </div>
        </div>

        {/* Dashboard Sections Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Quick Actions Card */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 space-y-4">
            <h2 className="text-base font-bold text-white">Quick Actions</h2>
            <div className="grid grid-cols-2 gap-3">
              <Link
                href="/dashboard/settings"
                className="flex flex-col gap-1 p-4 rounded-xl bg-zinc-950 border border-zinc-800 hover:border-zinc-700 transition-colors"
              >
                <span className="text-lg">⚙️</span>
                <span className="text-sm font-semibold text-zinc-200">Account Settings</span>
                <span className="text-xs text-zinc-500">Update profile &amp; security</span>
              </Link>

              <Link
                href="/dashboard/repositories"
                className="flex flex-col gap-1 p-4 rounded-xl bg-zinc-950 border border-zinc-800 hover:border-zinc-700 transition-colors"
              >
                <span className="text-lg">📁</span>
                <span className="text-sm font-semibold text-zinc-200">Repositories</span>
                <span className="text-xs text-zinc-500">View connected codebases</span>
              </Link>
            </div>
          </div>

          {/* System Status Card */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 space-y-4">
            <h2 className="text-base font-bold text-white">System Status</h2>
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 rounded-lg bg-zinc-950 border border-zinc-800">
                <div className="flex items-center gap-3">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  <span className="text-xs font-medium text-zinc-300">Supabase Auth Session</span>
                </div>
                <span className="text-xs text-emerald-400 font-semibold">Active</span>
              </div>

              <div className="flex items-center justify-between p-3 rounded-lg bg-zinc-950 border border-zinc-800">
                <div className="flex items-center gap-3">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  <span className="text-xs font-medium text-zinc-300">Prisma Database Sync</span>
                </div>
                <span className="text-xs text-emerald-400 font-semibold">Synced</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </ProtectedLayout>
  );
}
