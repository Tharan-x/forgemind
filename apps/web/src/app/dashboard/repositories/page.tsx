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

  // Filter States
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [languageFilter, setLanguageFilter] = useState<string>('');

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

  const fetchRepositoriesSilently = useCallback(async () => {
    try {
      const data = await getRepositories();
      setRepositories(data);
    } catch {
      // Swallowed silently during polling
    }
  }, []);

  useEffect(() => {
    fetchRepositories();
  }, [fetchRepositories]);

  // Live polling for active analysis progress across repositories
  useEffect(() => {
    const hasActiveIndexing = repositories.some(
      (r) => r.status === 'indexing' || r.status === 'queued',
    );
    if (!hasActiveIndexing) return;

    const intervalId = setInterval(() => {
      fetchRepositoriesSilently();
    }, 3000);

    return () => clearInterval(intervalId);
  }, [repositories, fetchRepositoriesSilently]);

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

  const handleClearFilters = () => {
    setSearchQuery('');
    setStatusFilter('');
    setLanguageFilter('');
  };

  const hasActiveFilters = Boolean(searchQuery.trim() || statusFilter || languageFilter);

  // Combined AND filtering
  const filteredRepositories = repositories.filter((repo) => {
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      const matchName = repo.name ? repo.name.toLowerCase().includes(q) : false;
      const matchFullName = repo.fullName ? repo.fullName.toLowerCase().includes(q) : false;
      const matchDesc = repo.description ? repo.description.toLowerCase().includes(q) : false;
      if (!matchName && !matchFullName && !matchDesc) return false;
    }

    if (statusFilter) {
      const repoStatus = repo.status || 'connected';
      if (repoStatus !== statusFilter) return false;
    }

    if (languageFilter) {
      if (!repo.language || repo.language.toLowerCase() !== languageFilter.toLowerCase()) {
        return false;
      }
    }

    return true;
  });

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

        {/* Search & Filter Controls Bar */}
        {!loading && !error && repositories.length > 0 && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 shadow-md">
            <div className="flex-1 min-w-[240px]">
              <input
                type="text"
                placeholder="Search repositories by name, full name, or description..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-emerald-500 transition-colors"
              />
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-300 focus:outline-none focus:border-emerald-500 transition-colors"
              >
                <option value="">All Statuses</option>
                <option value="ready">Ready</option>
                <option value="indexing">Indexing</option>
                <option value="queued">Queued</option>
                <option value="failed">Failed</option>
                <option value="connected">Connected</option>
              </select>

              <select
                value={languageFilter}
                onChange={(e) => setLanguageFilter(e.target.value)}
                className="bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-300 focus:outline-none focus:border-emerald-500 transition-colors"
              >
                <option value="">All Languages</option>
                <option value="TypeScript">TypeScript</option>
                <option value="JavaScript">JavaScript</option>
                <option value="Python">Python</option>
                <option value="Go">Go</option>
                <option value="Rust">Rust</option>
                <option value="Java">Java</option>
                <option value="C++">C++</option>
              </select>

              {hasActiveFilters && (
                <Button
                  variant="outline"
                  onClick={handleClearFilters}
                  className="bg-zinc-800 hover:bg-zinc-700 border-zinc-700 text-zinc-300 text-xs h-8 px-3 transition-colors"
                >
                  Clear Filters
                </Button>
              )}
            </div>
          </div>
        )}

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

        {/* Zero Repositories Connected Empty State */}
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

        {/* No Filter Matches Empty State */}
        {!loading && !error && repositories.length > 0 && filteredRepositories.length === 0 && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-12 text-center space-y-4 shadow-xl">
            <div className="w-12 h-12 bg-zinc-800 border border-zinc-700 text-zinc-400 rounded-full flex items-center justify-center mx-auto text-xl font-bold">
              🔍
            </div>
            <h2 className="text-lg font-bold text-white">No Matching Repositories Found</h2>
            <p className="text-zinc-400 text-sm max-w-md mx-auto leading-relaxed">
              No repositories match your active search and filter criteria. Try adjusting your
              search query or clearing your filters.
            </p>
            <Button
              variant="default"
              onClick={handleClearFilters}
              className="bg-zinc-800 hover:bg-zinc-700 text-white font-semibold text-xs h-9 px-4 transition-colors"
            >
              Clear Filters
            </Button>
          </div>
        )}

        {/* Repository Grid / List */}
        {!loading && !error && filteredRepositories.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredRepositories.map((repo) => {
              const status = repo.status || 'connected';
              const statusBadge =
                status === 'ready' ? (
                  <span className="text-[10px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded font-medium shrink-0 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> Ready
                  </span>
                ) : status === 'indexing' ? (
                  <span className="text-[10px] bg-sky-500/20 text-sky-400 border border-sky-500/30 px-2 py-0.5 rounded font-medium shrink-0 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-ping" />{' '}
                    Indexing...
                  </span>
                ) : status === 'queued' ? (
                  <span className="text-[10px] bg-amber-500/20 text-amber-400 border border-amber-500/30 px-2 py-0.5 rounded font-medium shrink-0">
                    Queued
                  </span>
                ) : status === 'failed' ? (
                  <span className="text-[10px] bg-red-500/20 text-red-400 border border-red-500/30 px-2 py-0.5 rounded font-medium shrink-0">
                    Ingestion Failed
                  </span>
                ) : (
                  <span className="text-[10px] bg-zinc-800 text-zinc-400 border border-zinc-700 px-2 py-0.5 rounded font-medium shrink-0">
                    Connected
                  </span>
                );

              return (
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
                      <div className="flex items-center gap-1.5 shrink-0">
                        {statusBadge}
                        {repo.private && (
                          <span className="text-[10px] bg-zinc-800 border border-zinc-700 text-zinc-400 px-2 py-0.5 rounded font-medium shrink-0">
                            Private
                          </span>
                        )}
                      </div>
                    </div>
                    {repo.description && (
                      <p className="text-zinc-400 text-xs line-clamp-2 leading-relaxed">
                        {repo.description}
                      </p>
                    )}

                    {/* Active Ingestion Progress Bar & Stage */}
                    {(status === 'indexing' || status === 'queued') && (
                      <div className="pt-2 border-t border-zinc-800/60 space-y-1.5">
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="text-sky-400 font-medium truncate">
                            {repo.latestJob?.stageLabel ||
                              (status === 'queued'
                                ? 'Queued in worker pipeline'
                                : 'Indexing repository data...')}
                          </span>
                          {typeof repo.latestJob?.processedCount === 'number' &&
                            typeof repo.latestJob?.totalCount === 'number' &&
                            repo.latestJob.totalCount > 0 && (
                              <span className="font-mono text-emerald-400 font-semibold shrink-0 ml-2">
                                {repo.latestJob.processedCount} / {repo.latestJob.totalCount} (
                                {Math.min(
                                  100,
                                  Math.max(
                                    0,
                                    Math.round(
                                      (repo.latestJob.processedCount / repo.latestJob.totalCount) *
                                        100,
                                    ),
                                  ),
                                )}
                                %)
                              </span>
                            )}
                        </div>
                        {typeof repo.latestJob?.processedCount === 'number' &&
                          typeof repo.latestJob?.totalCount === 'number' &&
                          repo.latestJob.totalCount > 0 && (
                            <div className="w-full bg-zinc-950 border border-zinc-800 rounded-full h-1.5 overflow-hidden">
                              <div
                                className="bg-sky-400 h-1.5 transition-all duration-300 rounded-full"
                                style={{
                                  width: `${Math.min(
                                    100,
                                    Math.max(
                                      0,
                                      Math.round(
                                        (repo.latestJob.processedCount /
                                          repo.latestJob.totalCount) *
                                          100,
                                      ),
                                    ),
                                  )}%`,
                                }}
                              />
                            </div>
                          )}
                      </div>
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
              );
            })}
          </div>
        )}
      </div>
    </ProtectedLayout>
  );
}
