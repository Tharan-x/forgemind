'use client';

// =============================================================================
// ForgeMind Web — Account Settings Page
// =============================================================================

import React, { useState } from 'react';

import { Button } from '@forgemind/ui';

import { ProtectedLayout } from '@/components/dashboard/ProtectedLayout';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';

export default function SettingsPage() {
  const { user, updateProfile, resetPassword, logout } = useAuth();
  const { addToast } = useToast();

  const currentName =
    (user?.user_metadata?.['name'] as string | undefined) ||
    (user?.user_metadata?.['full_name'] as string | undefined) ||
    '';

  const currentAvatarUrl = (user?.user_metadata?.['avatar_url'] as string | undefined) || '';

  const [name, setName] = useState(currentName);
  const [avatarUrl, setAvatarUrl] = useState(currentAvatarUrl);
  const [savingProfile, setSavingProfile] = useState(false);

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);

  const [loggingOut, setLoggingOut] = useState(false);

  // 1. Profile Update
  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSavingProfile(true);
      await updateProfile(name, avatarUrl);
      addToast('Profile updated successfully!', 'success');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to update profile.';
      addToast(message, 'error');
    } finally {
      setSavingProfile(false);
    }
  };

  // 2. Password Change
  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPassword) {
      addToast('Please enter a new password.', 'error');
      return;
    }
    if (newPassword.length < 6) {
      addToast('Password must be at least 6 characters.', 'error');
      return;
    }
    if (newPassword !== confirmPassword) {
      addToast('Passwords do not match.', 'error');
      return;
    }

    try {
      setSavingPassword(true);
      await resetPassword(newPassword);
      addToast('Password changed successfully!', 'success');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to change password.';
      addToast(message, 'error');
    } finally {
      setSavingPassword(false);
    }
  };

  // 3. Sign Out
  const handleSignOut = async () => {
    try {
      setLoggingOut(true);
      await logout();
      addToast('Signed out successfully.', 'info');
    } catch {
      setLoggingOut(false);
      addToast('Failed to sign out.', 'error');
    }
  };

  // Formatted User Information (Task 2)
  const provider = user?.app_metadata?.provider || 'email';
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
        {/* Page Header */}
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight">Account Settings</h1>
          <p className="text-zinc-400 text-sm mt-1">
            Manage your personal profile, credentials, and account details
          </p>
        </div>

        {/* User Info Overview Banner (Task 2) */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-xl space-y-6">
          <h2 className="text-xs font-bold text-emerald-400 uppercase tracking-widest">
            Authenticated Profile Overview
          </h2>

          <div className="flex flex-col md:flex-row items-start md:items-center gap-6">
            <UserAvatar name={name} email={user?.email} avatarUrl={avatarUrl} size="lg" />

            <div className="space-y-1 flex-1">
              <h3 className="text-xl font-bold text-white">{name || 'Unnamed User'}</h3>
              <p className="text-zinc-400 text-sm">{user?.email}</p>
              <div className="flex flex-wrap gap-2 pt-2">
                <span className="text-[11px] bg-zinc-800 border border-zinc-700 text-zinc-300 px-2.5 py-1 rounded-md font-medium capitalize">
                  Provider: {provider}
                </span>
                <span
                  className={`text-[11px] border px-2.5 py-1 rounded-md font-medium ${
                    isEmailVerified
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                      : 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                  }`}
                >
                  {isEmailVerified ? '✓ Email Verified' : '⚠ Email Pending Verification'}
                </span>
                <span className="text-[11px] bg-zinc-800 border border-zinc-700 text-zinc-400 px-2.5 py-1 rounded-md font-medium">
                  Joined: {createdAtFormatted}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Section 1: Update Profile Details */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-xl space-y-6">
          <div>
            <h2 className="text-lg font-bold text-white">Profile Details</h2>
            <p className="text-xs text-zinc-400 mt-0.5">
              Update your public display name and avatar URL
            </p>
          </div>

          <form onSubmit={handleUpdateProfile} className="space-y-4 max-w-xl">
            <div>
              <label htmlFor="name" className="block text-xs font-medium text-zinc-400 mb-1.5">
                Display Name
              </label>
              <input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Jane Doe"
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2.5 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-emerald-500 transition-colors"
              />
            </div>

            <div>
              <label htmlFor="avatarUrl" className="block text-xs font-medium text-zinc-400 mb-1.5">
                Avatar Image URL
              </label>
              <input
                id="avatarUrl"
                type="url"
                value={avatarUrl}
                onChange={(e) => setAvatarUrl(e.target.value)}
                placeholder="https://example.com/avatar.jpg"
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2.5 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-emerald-500 transition-colors"
              />
            </div>

            <Button
              type="submit"
              disabled={savingProfile}
              className="bg-emerald-500 hover:bg-emerald-600 text-zinc-950 font-semibold text-xs h-10 px-6 transition-colors"
            >
              {savingProfile ? 'Saving...' : 'Save Profile Changes'}
            </Button>
          </form>
        </div>

        {/* Section 2: Change Password */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-xl space-y-6">
          <div>
            <h2 className="text-lg font-bold text-white">Security &amp; Password</h2>
            <p className="text-xs text-zinc-400 mt-0.5">
              Change your password to maintain account security
            </p>
          </div>

          <form onSubmit={handleChangePassword} className="space-y-4 max-w-xl">
            <div>
              <label
                htmlFor="newPassword"
                className="block text-xs font-medium text-zinc-400 mb-1.5"
              >
                New Password (min. 6 characters)
              </label>
              <input
                id="newPassword"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
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
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2.5 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-emerald-500 transition-colors"
              />
            </div>

            <Button
              type="submit"
              disabled={savingPassword}
              className="bg-emerald-500 hover:bg-emerald-600 text-zinc-950 font-semibold text-xs h-10 px-6 transition-colors"
            >
              {savingPassword ? 'Updating Password...' : 'Update Password'}
            </Button>
          </form>
        </div>

        {/* Section 3: Sign Out & Session */}
        <div className="bg-zinc-900 border border-red-500/20 rounded-2xl p-6 shadow-xl flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-white">Sign Out of Session</h2>
            <p className="text-xs text-zinc-400 mt-0.5">End your active session on this device</p>
          </div>

          <Button
            variant="destructive"
            onClick={handleSignOut}
            disabled={loggingOut}
            className="bg-red-600 hover:bg-red-700 text-white font-semibold text-xs h-10 px-5 transition-colors"
          >
            {loggingOut ? 'Signing Out...' : 'Sign Out Account'}
          </Button>
        </div>
      </div>
    </ProtectedLayout>
  );
}
