'use client';

// =============================================================================
// ForgeMind Web — Dashboard Topbar Component
// =============================================================================

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import React, { useState } from 'react';

import { Button } from '@forgemind/ui';

import { UserAvatar } from '@/components/ui/UserAvatar';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';

export function Topbar() {
  const { user, logout } = useAuth();
  const { addToast } = useToast();
  const pathname = usePathname();
  const [loggingOut, setLoggingOut] = useState(false);

  const getPageTitle = () => {
    if (pathname.includes('/settings')) return 'Account Settings';
    if (pathname.includes('/repositories')) return 'Repositories';
    if (pathname.includes('/history')) return 'Analysis History';
    return 'Dashboard';
  };

  const handleLogout = async () => {
    try {
      setLoggingOut(true);
      await logout();
      addToast('Signed out successfully.', 'info');
    } catch {
      setLoggingOut(false);
      addToast('Failed to sign out. Please try again.', 'error');
    }
  };

  const name =
    (user?.user_metadata?.['name'] as string | undefined) ||
    (user?.user_metadata?.['full_name'] as string | undefined) ||
    user?.email?.split('@')[0] ||
    'User';

  const avatarUrl = user?.user_metadata?.['avatar_url'] as string | undefined;

  return (
    <header className="h-16 border-b border-zinc-800 bg-zinc-900/60 backdrop-blur-md px-8 flex items-center justify-between sticky top-0 z-30">
      {/* Page Title / Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-zinc-400">
        <span className="text-zinc-500 font-medium">Platform</span>
        <span>/</span>
        <span className="text-white font-semibold">{getPageTitle()}</span>
      </div>

      {/* User Info & Actions */}
      <div className="flex items-center gap-4">
        <Link
          href="/dashboard/settings"
          className="flex items-center gap-3 bg-zinc-950 border border-zinc-800 hover:border-zinc-700 rounded-full px-3 py-1.5 transition-colors"
        >
          <UserAvatar name={name} email={user?.email} avatarUrl={avatarUrl} size="sm" />
          <div className="text-left hidden sm:block pr-1">
            <span className="block text-xs font-semibold text-zinc-200 leading-tight">{name}</span>
            <span className="block text-[10px] text-zinc-500 leading-tight truncate max-w-[140px]">
              {user?.email}
            </span>
          </div>
        </Link>

        <Button
          variant="outline"
          onClick={handleLogout}
          disabled={loggingOut}
          className="border-zinc-800 bg-zinc-950 hover:bg-zinc-800 text-zinc-300 text-xs h-9 px-3.5 transition-colors"
        >
          {loggingOut ? 'Signing Out...' : 'Sign Out'}
        </Button>
      </div>
    </header>
  );
}
