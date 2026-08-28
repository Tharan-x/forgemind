'use client';

// =============================================================================
// ForgeMind Web — Public Shared Blueprint Page Route (/share/[token])
// =============================================================================

import React, { useEffect, useState, use } from 'react';
import type { SharedBlueprintView } from '@forgemind/types';
import { getSharedBlueprint } from '../../../lib/intelligence.api';
import { SharedBlueprintViewer } from '../../../components/onboarding/SharedBlueprintViewer';

interface SharedBlueprintPageProps {
  params: Promise<{ token: string }>;
}

export default function SharedBlueprintPage({
  params,
}: SharedBlueprintPageProps): React.JSX.Element {
  const { token } = use(params);
  const [data, setData] = useState<SharedBlueprintView | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    async function loadSharedBlueprint() {
      if (!token) return;
      setLoading(true);
      setError(null);
      try {
        const res = await getSharedBlueprint(token);
        if (isMounted) {
          setData(res.data);
        }
      } catch (err) {
        if (isMounted) {
          setError(
            err instanceof Error ? err.message : 'Failed to resolve shared onboarding blueprint.',
          );
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }
    void loadSharedBlueprint();
    return () => {
      isMounted = false;
    };
  }, [token]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6 md:p-10">
      <div className="mx-auto max-w-6xl space-y-6">
        {/* Brand Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-600 font-bold text-white shadow-lg shadow-indigo-600/30">
              FM
            </div>
            <div>
              <h1 className="text-base font-bold text-white tracking-wide">ForgeMind</h1>
              <p className="text-[11px] text-slate-400">Autonomous Codebase Intelligence Engine</p>
            </div>
          </div>
          <span className="rounded-full bg-slate-900 border border-slate-800 px-3 py-1 text-xs text-slate-400">
            Public View
          </span>
        </div>

        {/* Page Body */}
        {loading ? (
          <div className="my-20 flex flex-col items-center justify-center space-y-3">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
            <p className="text-sm text-slate-400">Loading shared onboarding blueprint...</p>
          </div>
        ) : error ? (
          <div className="my-16 rounded-xl border border-red-800/40 bg-red-950/20 p-8 text-center max-w-xl mx-auto space-y-3">
            <div className="text-3xl">⚠️</div>
            <h2 className="text-lg font-bold text-red-300">Shared Blueprint Unavailable</h2>
            <p className="text-xs text-red-200 leading-relaxed">{error}</p>
            <p className="text-[11px] text-slate-500 pt-2">
              The link may be invalid, expired, or revoked by the repository owner.
            </p>
          </div>
        ) : data ? (
          <SharedBlueprintViewer sharedBlueprint={data} />
        ) : null}
      </div>
    </div>
  );
}
