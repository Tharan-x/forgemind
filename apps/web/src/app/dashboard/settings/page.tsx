'use client';

// =============================================================================
// ForgeMind Web — Account Settings Page (with Sessions & Trusted Devices)
// =============================================================================

import React, { useEffect, useState, useCallback } from 'react';

import { Button } from '@forgemind/ui';

import { ProtectedLayout } from '@/components/dashboard/ProtectedLayout';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { fetchUserDevices, getDeviceId, type UserDevice } from '@/lib/device.api';
import {
  getGitHubConnection,
  connectGitHub,
  disconnectGitHub,
  type GitHubConnection,
} from '@/lib/github-credential.api';

export default function SettingsPage() {
  const {
    user,
    updateProfile,
    resetPassword,
    logout,
    trustDevice,
    revokeDevice,
    reauthenticate,
    isReauthenticatedRecently,
    isDeviceTrusted,
  } = useAuth();
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

  const [githubConn, setGithubConn] = useState<GitHubConnection | null>(null);
  const [loadingGithub, setLoadingGithub] = useState<boolean>(true);
  const [githubTokenInput, setGithubTokenInput] = useState<string>('');
  const [savingGithub, setSavingGithub] = useState<boolean>(false);
  const [disconnectingGithub, setDisconnectingGithub] = useState<boolean>(false);

  const [devices, setDevices] = useState<UserDevice[]>([]);
  const [loadingDevices, setLoadingDevices] = useState<boolean>(true);
  const [updatingDevice, setUpdatingDevice] = useState<string | null>(null);

  const [loggingOut, setLoggingOut] = useState(false);

  // Step-up Re-authentication Modal State
  const [reauthModalOpen, setReauthModalOpen] = useState(false);
  const [reauthPassword, setReauthPassword] = useState('');
  const [reauthSubmitting, setReauthSubmitting] = useState(false);
  const [reauthError, setReauthError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<(() => Promise<void>) | null>(null);

  const loadDevices = useCallback(async () => {
    try {
      setLoadingDevices(true);
      const list = await fetchUserDevices();
      setDevices(list);
    } catch {
      // Ignore device fetch error on initial load
    } finally {
      setLoadingDevices(false);
    }
  }, []);

  const fetchGitHubStatus = useCallback(async () => {
    try {
      setLoadingGithub(true);
      const conn = await getGitHubConnection();
      setGithubConn(conn);
    } catch {
      // Ignore if fetch fails on initial load
    } finally {
      setLoadingGithub(false);
    }
  }, []);

  useEffect(() => {
    fetchGitHubStatus();
    loadDevices();
  }, [fetchGitHubStatus, loadDevices]);

  /**
   * Enforces Step-Up Re-Authentication (15-min grace period) before proceeding with a sensitive action.
   */
  const executeWithStepUp = (action: () => Promise<void>) => {
    if (isReauthenticatedRecently()) {
      action();
    } else {
      setPendingAction(() => action);
      setReauthPassword('');
      setReauthError(null);
      setReauthModalOpen(true);
    }
  };

  const handleReauthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reauthPassword) {
      setReauthError('Please enter your password.');
      return;
    }

    try {
      setReauthError(null);
      setReauthSubmitting(true);
      await reauthenticate(reauthPassword);
      setReauthModalOpen(false);
      if (pendingAction) {
        await pendingAction();
        setPendingAction(null);
      }
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Authentication failed. Incorrect password.';
      setReauthError(message);
    } finally {
      setReauthSubmitting(false);
    }
  };

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

  // 2. Password Change (Sensitive)
  const handleChangePassword = (e: React.FormEvent) => {
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

    executeWithStepUp(async () => {
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
    });
  };

  // 3. GitHub Credential Connect / Update (Sensitive)
  const handleConnectGitHub = (e: React.FormEvent) => {
    e.preventDefault();
    if (!githubTokenInput.trim()) {
      addToast('Please enter a GitHub Personal Access Token.', 'error');
      return;
    }

    executeWithStepUp(async () => {
      try {
        setSavingGithub(true);
        const updatedConn = await connectGitHub(githubTokenInput.trim());
        setGithubConn(updatedConn);
        setGithubTokenInput('');
        addToast('GitHub credential connected successfully!', 'success');
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to connect GitHub token.';
        addToast(message, 'error');
      } finally {
        setSavingGithub(false);
      }
    });
  };

  // 4. GitHub Credential Disconnect (Sensitive)
  const handleDisconnectGitHub = () => {
    executeWithStepUp(async () => {
      try {
        setDisconnectingGithub(true);
        await disconnectGitHub();
        setGithubConn({
          connected: false,
          githubUsername: null,
          githubAvatarUrl: null,
          updatedAt: null,
        });
        addToast('GitHub credential disconnected.', 'info');
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : 'Failed to disconnect GitHub credential.';
        addToast(message, 'error');
      } finally {
        setDisconnectingGithub(false);
      }
    });
  };

  // 5. Device Trust Toggle
  const handleToggleCurrentDeviceTrust = async (trust: boolean) => {
    try {
      setUpdatingDevice('current');
      await trustDevice(trust);
      await loadDevices();
      addToast(
        trust ? 'This device is now trusted for 30 days.' : 'Device trust revoked.',
        trust ? 'success' : 'info',
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to update device trust.';
      addToast(message, 'error');
    } finally {
      setUpdatingDevice(null);
    }
  };

  // 6. Revoke Device (Sensitive)
  const handleRevokeDevice = (targetId: string, deviceName: string) => {
    executeWithStepUp(async () => {
      try {
        setUpdatingDevice(targetId);
        await revokeDevice(targetId);
        await loadDevices();
        addToast(`Access revoked for device "${deviceName}".`, 'info');
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to revoke device access.';
        addToast(message, 'error');
      } finally {
        setUpdatingDevice(null);
      }
    });
  };

  // 7. Sign Out
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
            Manage your personal profile, security credentials, and active session devices
          </p>
        </div>

        {/* User Info Overview Banner */}
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

        {/* Section 1: Sessions & Trusted Devices (NEW) */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-xl space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold text-white">Sessions &amp; Trusted Devices</h2>
              <p className="text-xs text-zinc-400 mt-1">
                Manage personal devices trusted for 30-day session continuation and revoke remote
                access.
              </p>
            </div>
            <Button
              variant="outline"
              onClick={loadDevices}
              disabled={loadingDevices}
              className="bg-zinc-800 border-zinc-700 text-zinc-300 hover:bg-zinc-700 text-xs h-9 px-3 self-start sm:self-auto"
            >
              {loadingDevices ? 'Refreshing...' : 'Refresh Devices'}
            </Button>
          </div>

          {loadingDevices ? (
            <div className="text-center py-6 text-xs text-zinc-500">
              Loading sessions &amp; device inventory...
            </div>
          ) : devices.length === 0 ? (
            <div className="bg-zinc-950/60 border border-zinc-800 rounded-xl p-6 text-center space-y-3">
              <p className="text-xs text-zinc-400">No registered devices found.</p>
              <Button
                onClick={() => handleToggleCurrentDeviceTrust(true)}
                className="bg-emerald-500 hover:bg-emerald-600 text-zinc-950 font-semibold text-xs h-9 px-4"
              >
                Trust This Current Device
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {devices.map((device) => {
                const isCurrent = device.isCurrentDevice || device.deviceId === getDeviceId();
                return (
                  <div
                    key={device.id}
                    className={`border rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-colors ${
                      isCurrent
                        ? 'bg-emerald-950/20 border-emerald-500/30'
                        : 'bg-zinc-950/60 border-zinc-800'
                    }`}
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-white">
                          {device.deviceName}
                        </span>
                        {isCurrent && (
                          <span className="text-[10px] bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 px-2 py-0.5 rounded font-bold">
                            ★ Current Device
                          </span>
                        )}
                        {device.isTrusted ? (
                          <span className="text-[10px] bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 px-2 py-0.5 rounded font-medium">
                            ✓ Trusted
                          </span>
                        ) : (
                          <span className="text-[10px] bg-zinc-800 border border-zinc-700 text-zinc-400 px-2 py-0.5 rounded font-medium">
                            Untrusted / Shared
                          </span>
                        )}
                      </div>

                      <p className="text-xs text-zinc-400">
                        {device.browser || 'Browser'} on {device.os || 'OS'} • Last active:{' '}
                        {new Date(device.lastActiveAt).toLocaleString()}
                      </p>

                      {device.isTrusted && device.trustedUntil && (
                        <p className="text-[11px] text-zinc-500">
                          Trust valid until: {new Date(device.trustedUntil).toLocaleDateString()}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
                      {isCurrent ? (
                        isDeviceTrusted ? (
                          <Button
                            variant="destructive"
                            onClick={() => handleToggleCurrentDeviceTrust(false)}
                            disabled={updatingDevice === 'current'}
                            className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 text-xs h-8 px-3"
                          >
                            Revoke Trust
                          </Button>
                        ) : (
                          <Button
                            onClick={() => handleToggleCurrentDeviceTrust(true)}
                            disabled={updatingDevice === 'current'}
                            className="bg-emerald-500 hover:bg-emerald-600 text-zinc-950 font-semibold text-xs h-8 px-3"
                          >
                            Trust This Device (30 Days)
                          </Button>
                        )
                      ) : (
                        <Button
                          variant="destructive"
                          onClick={() => handleRevokeDevice(device.id, device.deviceName)}
                          disabled={updatingDevice === device.id}
                          className="bg-red-950/60 hover:bg-red-900 border border-red-800/80 text-red-300 text-xs h-8 px-3"
                        >
                          Revoke Access
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Section 2: GitHub Integration */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-xl space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-3">
                <h2 className="text-lg font-bold text-white">GitHub Integration</h2>
                {loadingGithub ? (
                  <span className="text-xs text-zinc-500 font-medium">Loading status...</span>
                ) : githubConn?.connected ? (
                  <span className="text-xs bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 px-2.5 py-0.5 rounded-full font-semibold flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block animate-pulse" />
                    Connected
                  </span>
                ) : (
                  <span className="text-xs bg-zinc-800 border border-zinc-700 text-zinc-400 px-2.5 py-0.5 rounded-full font-medium">
                    Not Connected
                  </span>
                )}
              </div>
              <p className="text-xs text-zinc-400 mt-1">
                Connect a GitHub Personal Access Token (PAT) to enable automatic repository syncing
                and AI code intelligence.
              </p>
            </div>

            {githubConn?.connected && (
              <Button
                variant="destructive"
                onClick={handleDisconnectGitHub}
                disabled={disconnectingGithub || savingGithub}
                className="bg-red-950/60 hover:bg-red-900 border border-red-800/80 text-red-300 font-medium text-xs h-9 px-4 transition-colors self-start sm:self-auto shrink-0"
              >
                {disconnectingGithub ? 'Disconnecting...' : 'Disconnect GitHub'}
              </Button>
            )}
          </div>

          {githubConn?.connected && (
            <div className="bg-zinc-950/60 border border-zinc-800 rounded-xl p-4 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-zinc-800 rounded-full flex items-center justify-center text-zinc-300 font-bold text-sm">
                  GH
                </div>
                <div>
                  <p className="text-xs font-semibold text-zinc-200">
                    GitHub Account:{' '}
                    <span className="text-emerald-400 font-bold">
                      @{githubConn.githubUsername || 'connected'}
                    </span>
                  </p>
                  <p className="text-[11px] text-zinc-500 mt-0.5">
                    Token encrypted at rest • Last updated:{' '}
                    {githubConn.updatedAt
                      ? new Date(githubConn.updatedAt).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })
                      : 'Recently'}
                  </p>
                </div>
              </div>
            </div>
          )}

          <form onSubmit={handleConnectGitHub} className="space-y-4 max-w-xl">
            <div>
              <label
                htmlFor="githubToken"
                className="block text-xs font-medium text-zinc-400 mb-1.5"
              >
                {githubConn?.connected
                  ? 'Update Personal Access Token (PAT)'
                  : 'GitHub Personal Access Token (PAT)'}
              </label>
              <input
                id="githubToken"
                type="password"
                value={githubTokenInput}
                onChange={(e) => setGithubTokenInput(e.target.value)}
                placeholder={
                  githubConn?.connected
                    ? '•••••••••••••••••••• (Leave blank to keep current)'
                    : 'ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'
                }
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-emerald-500 transition-colors font-mono"
              />
              <p className="text-[11px] text-zinc-500 mt-1.5 leading-normal">
                Your token is encrypted using AES-256-GCM server-side at rest and is never stored in
                your browser session or local storage.
              </p>
            </div>

            <Button
              type="submit"
              disabled={savingGithub || disconnectingGithub || !githubTokenInput.trim()}
              className="bg-emerald-500 hover:bg-emerald-600 text-zinc-950 font-semibold text-xs h-10 px-6 transition-colors"
            >
              {savingGithub
                ? 'Validating & Connecting...'
                : githubConn?.connected
                  ? 'Update GitHub Credential'
                  : 'Connect GitHub Account'}
            </Button>
          </form>
        </div>

        {/* Section 3: Update Profile Details */}
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

        {/* Section 4: Change Password */}
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

        {/* Section 5: Sign Out & Session */}
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

        {/* Step-Up Re-Authentication Modal */}
        {reauthModalOpen && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-6">
              <div>
                <h3 className="text-lg font-bold text-white">Confirm Password Required</h3>
                <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
                  For security, sensitive actions require recent authentication. Enter your current
                  password to continue.
                </p>
              </div>

              {reauthError && (
                <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-xs rounded-lg p-3 text-center">
                  {reauthError}
                </div>
              )}

              <form onSubmit={handleReauthSubmit} className="space-y-4">
                <div>
                  <label
                    htmlFor="reauthPassword"
                    className="block text-xs font-medium text-zinc-400 mb-1.5"
                  >
                    Current Password
                  </label>
                  <input
                    id="reauthPassword"
                    type="password"
                    required
                    autoFocus
                    value={reauthPassword}
                    onChange={(e) => setReauthPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2.5 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-emerald-500 transition-colors"
                  />
                </div>

                <div className="flex items-center justify-end gap-3 pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setReauthModalOpen(false);
                      setPendingAction(null);
                    }}
                    className="bg-zinc-800 border-zinc-700 text-zinc-300 hover:bg-zinc-700 text-xs h-9 px-4"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={reauthSubmitting}
                    className="bg-emerald-500 hover:bg-emerald-600 text-zinc-950 font-semibold text-xs h-9 px-5"
                  >
                    {reauthSubmitting ? 'Verifying...' : 'Confirm & Proceed'}
                  </Button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </ProtectedLayout>
  );
}
