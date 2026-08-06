'use client';

// =============================================================================
// ForgeMind Web — Protected Dashboard Layout Wrapper
// =============================================================================

import React from 'react';

import { Sidebar } from '@/components/dashboard/Sidebar';
import { Topbar } from '@/components/dashboard/Topbar';
import { ProtectedRoute } from '@/components/ProtectedRoute';

interface ProtectedLayoutProps {
  children: React.ReactNode;
}

export function ProtectedLayout({ children }: ProtectedLayoutProps) {
  return (
    <ProtectedRoute requireAuth={true}>
      <div className="min-h-screen bg-zinc-950 text-white flex">
        {/* Left Sidebar */}
        <Sidebar />

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Top Navigation */}
          <Topbar />

          {/* Page Body */}
          <main className="flex-1 p-8 max-w-6xl w-full mx-auto space-y-8">{children}</main>
        </div>
      </div>
    </ProtectedRoute>
  );
}
