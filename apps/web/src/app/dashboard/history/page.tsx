'use client';

// =============================================================================
// ForgeMind Web — Analysis History Placeholder Page (Sprint 2 Phase 2B)
// =============================================================================

import React from 'react';

import { ProtectedLayout } from '@/components/dashboard/ProtectedLayout';

export default function AnalysisHistoryPage() {
  return (
    <ProtectedLayout>
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight">Analysis History</h1>
          <p className="text-zinc-400 text-sm mt-1">
            Track past repository analysis jobs, AST symbol indexes, and dependency maps
          </p>
        </div>

        {/* Coming Soon Placeholder */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-12 text-center space-y-4 shadow-xl">
          <div className="w-16 h-16 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center mx-auto text-2xl font-bold">
            ⚡
          </div>
          <h2 className="text-xl font-bold text-white">Analysis Jobs Coming Soon</h2>
          <p className="text-zinc-400 text-sm max-w-md mx-auto leading-relaxed">
            Historical analysis logs, job execution metrics, and codebase graph visualizations will
            be enabled in upcoming releases.
          </p>
          <span className="inline-block text-xs bg-zinc-800 border border-zinc-700 text-zinc-300 px-3 py-1 rounded-full font-medium">
            Sprint 2 — Phase 2B Active
          </span>
        </div>
      </div>
    </ProtectedLayout>
  );
}
