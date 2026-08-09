'use client';

// =============================================================================
// ForgeMind Web — Analysis History Page (Sprint 4 Task 4)
// =============================================================================

import Link from 'next/link';
import React, { useEffect, useState, useCallback } from 'react';

import type { AnalysisJob } from '@forgemind/types';
import { Button } from '@forgemind/ui';

import { ProtectedLayout } from '@/components/dashboard/ProtectedLayout';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { getAnalysisHistory } from '@/lib/analysis.api';
import { getRepositories, type Repository } from '@/lib/repository.api';

interface JobWithRepo {
  job: AnalysisJob;
  repository: Repository;
}

export default function AnalysisHistoryPage() {
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [selectedRepoId, setSelectedRepoId] = useState<string>('');
  const [jobs, setJobs] = useState<JobWithRepo[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const repos = await getRepositories();
      setRepositories(repos);

      if (repos.length > 0) {
        const repoId = selectedRepoId || repos[0]?.id || '';
        if (repoId) {
          const repo = repos.find((r) => r.id === repoId) || repos[0]!;
          const historyJobs = await getAnalysisHistory(repo.id);
          setJobs(historyJobs.map((job) => ({ job, repository: repo })));
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load analysis history.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [selectedRepoId]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const handleSelectRepo = async (repoId: string) => {
    setSelectedRepoId(repoId);
    setLoading(true);
    try {
      const repo = repositories.find((r) => r.id === repoId);
      if (repo) {
        const historyJobs = await getAnalysisHistory(repo.id);
        setJobs(historyJobs.map((job) => ({ job, repository: repo })));
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load repository jobs.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ProtectedLayout>
      <div className="space-y-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-white tracking-tight">Analysis History</h1>
            <p className="text-zinc-400 text-sm mt-1">
              Track past repository analysis jobs, AST symbol indexes, and execution logs
            </p>
          </div>

          {repositories.length > 0 && (
            <select
              value={selectedRepoId || repositories[0]?.id}
              onChange={(e) => handleSelectRepo(e.target.value)}
              className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-2 text-xs text-white focus:outline-none focus:border-emerald-500 self-start sm:self-auto"
            >
              {repositories.map((repo) => (
                <option key={repo.id} value={repo.id}>
                  {repo.fullName || repo.name}
                </option>
              ))}
            </select>
          )}
        </div>

        {loading ? (
          <div className="py-12 flex justify-center">
            <LoadingSpinner size="md" label="Loading analysis history..." />
          </div>
        ) : error ? (
          <div className="bg-red-950/50 border border-red-800/60 rounded-2xl p-8 text-center space-y-4 shadow-xl">
            <div className="w-12 h-12 bg-red-500/10 border border-red-500/20 text-red-400 rounded-full flex items-center justify-center mx-auto text-xl font-bold">
              ⚠
            </div>
            <h2 className="text-lg font-bold text-white">Failed to Load History</h2>
            <p className="text-red-300/80 text-sm max-w-md mx-auto">{error}</p>
            <Button
              variant="default"
              onClick={fetchHistory}
              className="bg-zinc-800 hover:bg-zinc-700 text-white font-medium text-xs h-9 px-4"
            >
              Try Again
            </Button>
          </div>
        ) : repositories.length === 0 ? (
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-12 text-center space-y-4 shadow-xl">
            <div className="w-16 h-16 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center mx-auto text-2xl font-bold">
              ⚡
            </div>
            <h2 className="text-xl font-bold text-white">No Repositories Synchronized</h2>
            <p className="text-zinc-400 text-sm max-w-md mx-auto leading-relaxed">
              Connect a GitHub repository to trigger AST symbol extraction and track analysis
              history.
            </p>
            <Button
              variant="default"
              asChild
              className="bg-emerald-500 hover:bg-emerald-600 text-zinc-950 font-bold text-xs h-10 px-5"
            >
              <Link href="/dashboard/repositories">Sync Repositories Now</Link>
            </Button>
          </div>
        ) : jobs.length === 0 ? (
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-12 text-center space-y-4 shadow-xl">
            <div className="w-16 h-16 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center mx-auto text-2xl font-bold">
              ⚡
            </div>
            <h2 className="text-xl font-bold text-white">No Analysis Jobs Found</h2>
            <p className="text-zinc-400 text-sm max-w-md mx-auto leading-relaxed">
              No analysis jobs have been executed for this repository yet. Click below to explore
              intelligence and trigger analysis.
            </p>
            {selectedRepoId && (
              <Button
                variant="default"
                asChild
                className="bg-emerald-500 hover:bg-emerald-600 text-zinc-950 font-bold text-xs h-10 px-5"
              >
                <Link href={`/dashboard/repositories/${selectedRepoId}`}>
                  View Repository Intelligence →
                </Link>
              </Button>
            )}
          </div>
        ) : (
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden shadow-xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-zinc-950 border-b border-zinc-800 text-zinc-400 uppercase font-semibold text-[10px] tracking-wider">
                  <tr>
                    <th className="py-3 px-4">Repository</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Commit SHA</th>
                    <th className="py-3 px-4">Started At</th>
                    <th className="py-3 px-4">Finished At</th>
                    <th className="py-3 px-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60 text-zinc-300">
                  {jobs.map(({ job, repository }) => (
                    <tr key={job.id} className="hover:bg-zinc-800/40 transition-colors">
                      <td className="py-3 px-4 font-bold text-white">
                        {repository.fullName || repository.name}
                      </td>
                      <td className="py-3 px-4 capitalize">
                        {job.status === 'completed' && (
                          <span className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded text-[11px] font-semibold">
                            Completed
                          </span>
                        )}
                        {job.status === 'in_progress' && (
                          <span className="bg-amber-500/10 border border-amber-500/20 text-amber-400 px-2 py-0.5 rounded text-[11px] font-semibold">
                            In Progress
                          </span>
                        )}
                        {job.status === 'failed' && (
                          <span className="bg-red-500/10 border border-red-500/20 text-red-400 px-2 py-0.5 rounded text-[11px] font-semibold">
                            Failed
                          </span>
                        )}
                        {job.status === 'pending' && (
                          <span className="bg-zinc-800 border border-zinc-700 text-zinc-400 px-2 py-0.5 rounded text-[11px] font-medium">
                            Pending
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 font-mono text-zinc-300">
                        {job.commitHash ? job.commitHash.substring(0, 7) : '—'}
                      </td>
                      <td className="py-3 px-4 text-zinc-400">
                        {job.startedAt ? new Date(job.startedAt).toLocaleString() : '—'}
                      </td>
                      <td className="py-3 px-4 text-zinc-400">
                        {job.finishedAt ? new Date(job.finishedAt).toLocaleString() : '—'}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <Link
                          href={`/dashboard/repositories/${repository.id}`}
                          className="text-xs font-semibold text-emerald-400 hover:text-emerald-300 transition-colors"
                        >
                          Explore →
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </ProtectedLayout>
  );
}
