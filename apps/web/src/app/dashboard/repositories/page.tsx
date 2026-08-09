'use client';

// =============================================================================
// ForgeMind Web — Repositories Page
// =============================================================================

import Link from 'next/link';
import React, { useEffect, useState, useCallback } from 'react';

import { Button } from '@forgemind/ui';

import { ProtectedLayout } from '@/components/dashboard/ProtectedLayout';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { Skeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/context/ToastContext';
import { getRepositories, syncRepositories, type Repository } from '@/lib/repository.api';

export default function RepositoriesPage() {
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [syncing, setSyncing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const { addToast } = useToast();

  const fetchRepositories = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getRepositories();
      setRepositories(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load repositories.';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRepositories();
  }, [fetchRepositories]);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const result = await syncRepositories();
      addToast(
        `Synced ${result.total} repositories (${result.created} created, ${result.updated} updated).`,
        'success',
      );
      await fetchRepositories();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to sync repositories.';
      addToast(message, 'error');
    } finally {
      setSyncing(false);
    }
  };

  return (
    <ProtectedLayout>
      <div className="space-y-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-white tracking-tight">Repositories</h1>
            <p className="text-zinc-400 text-sm mt-1">
              Connect and manage your GitHub codebases for AI intelligence
            </p>
          </div>
          <Button
            variant="default"
            onClick={handleSync}
            disabled={syncing || loading}
            className="bg-emerald-500 hover:bg-emerald-600 text-zinc-950 font-semibold text-xs h-10 px-5 transition-colors flex items-center gap-2 self-start sm:self-auto"
          >
            {syncing ? (
              <>
                <LoadingSpinner size="sm" />
                <span>Syncing...</span>
              </>
            ) : (
              <span>Sync Repositories</span>
            )}
          </Button>
        </div>

        {/* Loading State */}
        {loading && (
          <div className="space-y-4">
            <div className="flex items-center justify-center py-8">
              <LoadingSpinner size="md" label="Loading repositories..." />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-3">
                <Skeleton className="h-5 w-48" />
                <Skeleton className="h-4 w-full" />
                <div className="flex gap-4 pt-2">
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="h-4 w-20" />
                </div>
              </div>
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-3">
                <Skeleton className="h-5 w-48" />
                <Skeleton className="h-4 w-full" />
                <div className="flex gap-4 pt-2">
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="h-4 w-20" />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Error State */}
        {!loading && error && (
          <div className="bg-red-950/50 border border-red-800/60 rounded-2xl p-8 text-center space-y-4 shadow-xl">
            <div className="w-12 h-12 bg-red-500/10 border border-red-500/20 text-red-400 rounded-full flex items-center justify-center mx-auto text-xl font-bold">
              ⚠
            </div>
            <h2 className="text-lg font-bold text-white">Failed to Load Repositories</h2>
            <p className="text-red-300/80 text-sm max-w-md mx-auto">{error}</p>
            <Button
              variant="default"
              onClick={fetchRepositories}
              className="bg-zinc-800 hover:bg-zinc-700 text-white font-medium text-xs h-9 px-4 transition-colors"
            >
              Try Again
            </Button>
          </div>
        )}

        {/* Empty State */}
        {!loading && !error && repositories.length === 0 && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-12 text-center space-y-4 shadow-xl">
            <div className="w-16 h-16 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center mx-auto text-2xl font-bold">
              📁
            </div>
            <h2 className="text-xl font-bold text-white">No Repositories Found</h2>
            <p className="text-zinc-400 text-sm max-w-md mx-auto leading-relaxed">
              No repositories have been synchronized yet. Click below to sync your GitHub
              repositories.
            </p>
            <Button
              variant="default"
              onClick={handleSync}
              disabled={syncing}
              className="bg-emerald-500 hover:bg-emerald-600 text-zinc-950 font-semibold text-xs h-10 px-5 transition-colors inline-flex items-center gap-2"
            >
              {syncing ? (
                <>
                  <LoadingSpinner size="sm" />
                  <span>Syncing...</span>
                </>
              ) : (
                <span>Sync Repositories Now</span>
              )}
            </Button>
          </div>
        )}

        {/* Repository Grid / List */}
        {!loading && !error && repositories.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {repositories.map((repo) => (
              <div
                key={repo.id}
                className="bg-zinc-900 border border-zinc-800 hover:border-zinc-700 transition-colors rounded-xl p-5 flex flex-col justify-between space-y-4"
              >
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <a
                      href={repo.htmlUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-base font-bold text-white hover:text-emerald-400 transition-colors truncate"
                    >
                      {repo.fullName || repo.name}
                    </a>
                    {repo.private && (
                      <span className="text-[10px] bg-zinc-800 border border-zinc-700 text-zinc-400 px-2 py-0.5 rounded font-medium shrink-0">
                        Private
                      </span>
                    )}
                  </div>
                  {repo.description && (
                    <p className="text-zinc-400 text-xs line-clamp-2 leading-relaxed">
                      {repo.description}
                    </p>
                  )}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-4 text-xs text-zinc-400 pt-3 border-t border-zinc-800/80">
                  <div className="flex items-center gap-4">
                    {repo.language && (
                      <span className="flex items-center gap-1.5 font-medium text-zinc-300">
                        <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 inline-block" />
                        {repo.language}
                      </span>
                    )}
                    <span className="flex items-center gap-1">
                      <span>★</span>
                      <span>{repo.stars}</span>
                    </span>
                    <span className="flex items-center gap-1">
                      <span>⌥</span>
                      <span>{repo.forks}</span>
                    </span>
                  </div>

                  <Link
                    href={`/dashboard/repositories/${repo.id}`}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-400 hover:text-emerald-300 transition-colors bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5 rounded-lg"
                  >
                    <span>Explore Intelligence</span>
                    <span>→</span>
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </ProtectedLayout>
  );
}
