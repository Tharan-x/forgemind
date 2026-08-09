'use client';

// =============================================================================
// ForgeMind Web — Repository Detail & Intelligence Explorer Page
// =============================================================================

import Link from 'next/link';
import { useParams } from 'next/navigation';
import React, { useEffect, useState, useCallback } from 'react';

import type {
  AnalysisJob,
  FileDependency,
  RepositoryFile,
  RepositorySymbol,
} from '@forgemind/types';
import { Button } from '@forgemind/ui';

import { ProtectedLayout } from '@/components/dashboard/ProtectedLayout';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { Skeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/context/ToastContext';
import {
  getLatestAnalysisJob,
  getRepositoryDependencies,
  getRepositoryFiles,
  getRepositorySymbols,
  triggerRepositoryAnalysis,
} from '@/lib/analysis.api';
import { getRepository, type Repository } from '@/lib/repository.api';

type TabType = 'overview' | 'files' | 'symbols' | 'dependencies';

export default function RepositoryDetailPage() {
  const params = useParams();
  const repositoryId = typeof params?.['id'] === 'string' ? params['id'] : '';

  const [repository, setRepository] = useState<Repository | null>(null);
  const [latestJob, setLatestJob] = useState<AnalysisJob | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>('overview');

  // Overview metrics & data state
  const [loadingRepo, setLoadingRepo] = useState<boolean>(true);
  const [analyzing, setAnalyzing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Files Tab State
  const [files, setFiles] = useState<RepositoryFile[]>([]);
  const [totalFiles, setTotalFiles] = useState<number>(0);
  const [filesLoading, setFilesLoading] = useState<boolean>(false);
  const [fileSearch, setFileSearch] = useState<string>('');
  const [selectedLanguage, setSelectedLanguage] = useState<string>('');

  // Symbols Tab State
  const [symbols, setSymbols] = useState<RepositorySymbol[]>([]);
  const [totalSymbols, setTotalSymbols] = useState<number>(0);
  const [symbolsLoading, setSymbolsLoading] = useState<boolean>(false);
  const [symbolSearch, setSymbolSearch] = useState<string>('');
  const [selectedKind, setSelectedKind] = useState<string>('');

  // Dependencies Tab State
  const [dependencies, setDependencies] = useState<FileDependency[]>([]);
  const [totalDependencies, setTotalDependencies] = useState<number>(0);
  const [depsLoading, setDepsLoading] = useState<boolean>(false);
  const [depSearch, setDepSearch] = useState<string>('');
  const [depFilter, setDepFilter] = useState<'all' | 'internal' | 'external'>('all');

  const { addToast } = useToast();

  // Load Repository Metadata and Latest Analysis Job
  const fetchRepoData = useCallback(async () => {
    if (!repositoryId) return;
    setLoadingRepo(true);
    setError(null);
    try {
      const [repoData, jobData] = await Promise.all([
        getRepository(repositoryId),
        getLatestAnalysisJob(repositoryId).catch(() => null),
      ]);
      setRepository(repoData);
      setLatestJob(jobData);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load repository details.';
      setError(msg);
    } finally {
      setLoadingRepo(false);
    }
  }, [repositoryId]);

  useEffect(() => {
    fetchRepoData();
  }, [fetchRepoData]);

  // Load Files
  const fetchFiles = useCallback(async () => {
    if (!repositoryId) return;
    setFilesLoading(true);
    try {
      const data = await getRepositoryFiles(repositoryId, {
        language: selectedLanguage || undefined,
        limit: 100,
      });
      setFiles(data.files);
      setTotalFiles(data.total);
    } catch {
      // Ignore initial file load errors gracefully
    } finally {
      setFilesLoading(false);
    }
  }, [repositoryId, selectedLanguage]);

  // Load Symbols
  const fetchSymbols = useCallback(async () => {
    if (!repositoryId) return;
    setSymbolsLoading(true);
    try {
      const data = await getRepositorySymbols(repositoryId, {
        kind: selectedKind || undefined,
        query: symbolSearch || undefined,
        limit: 100,
      });
      setSymbols(data.symbols);
      setTotalSymbols(data.total);
    } catch {
      // Ignore symbol load errors gracefully
    } finally {
      setSymbolsLoading(false);
    }
  }, [repositoryId, selectedKind, symbolSearch]);

  // Load Dependencies
  const fetchDependencies = useCallback(async () => {
    if (!repositoryId) return;
    setDepsLoading(true);
    try {
      const isExternalParam =
        depFilter === 'external' ? true : depFilter === 'internal' ? false : undefined;
      const data = await getRepositoryDependencies(repositoryId, {
        isExternal: isExternalParam,
        limit: 100,
      });
      setDependencies(data.dependencies);
      setTotalDependencies(data.total);
    } catch {
      // Ignore dependency load errors gracefully
    } finally {
      setDepsLoading(false);
    }
  }, [repositoryId, depFilter]);

  // Fetch data when switching tabs
  useEffect(() => {
    if (activeTab === 'files') {
      fetchFiles();
    } else if (activeTab === 'symbols') {
      fetchSymbols();
    } else if (activeTab === 'dependencies') {
      fetchDependencies();
    } else if (activeTab === 'overview') {
      fetchFiles();
      fetchSymbols();
      fetchDependencies();
    }
  }, [activeTab, fetchFiles, fetchSymbols, fetchDependencies]);

  // Handle Trigger Repository Analysis
  const handleTriggerAnalysis = async () => {
    if (!repositoryId) return;
    setAnalyzing(true);
    addToast('Starting AST analysis and file indexing...', 'info');
    try {
      const result = await triggerRepositoryAnalysis(repositoryId);
      setLatestJob(result.job);
      addToast(
        `Analysis completed! Parsed ${result.extraction?.filesParsed ?? 0} code files, extracted ${result.extraction?.totalSymbolsExtracted ?? 0} symbols.`,
        'success',
      );
      // Refresh current tab data
      fetchRepoData();
      fetchFiles();
      fetchSymbols();
      fetchDependencies();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Repository analysis failed.';
      addToast(msg, 'error');
    } finally {
      setAnalyzing(false);
    }
  };

  // Filter files client-side by search term
  const filteredFiles = files.filter((f) =>
    fileSearch ? f.path.toLowerCase().includes(fileSearch.toLowerCase()) : true,
  );

  // Filter dependencies client-side by search term
  const filteredDeps = dependencies.filter((d) =>
    depSearch
      ? d.sourcePath.toLowerCase().includes(depSearch.toLowerCase()) ||
        d.targetPath.toLowerCase().includes(depSearch.toLowerCase())
      : true,
  );

  if (loadingRepo) {
    return (
      <ProtectedLayout>
        <div className="space-y-6">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-32 w-full rounded-2xl" />
          <Skeleton className="h-64 w-full rounded-2xl" />
        </div>
      </ProtectedLayout>
    );
  }

  if (error || !repository) {
    return (
      <ProtectedLayout>
        <div className="bg-red-950/50 border border-red-800/60 rounded-2xl p-8 text-center space-y-4 shadow-xl">
          <div className="w-12 h-12 bg-red-500/10 border border-red-500/20 text-red-400 rounded-full flex items-center justify-center mx-auto text-xl font-bold">
            ⚠
          </div>
          <h2 className="text-lg font-bold text-white">Repository Not Found</h2>
          <p className="text-red-300/80 text-sm max-w-md mx-auto">
            {error || 'Unable to retrieve repository details.'}
          </p>
          <Button
            variant="default"
            asChild
            className="bg-zinc-800 hover:bg-zinc-700 text-white font-medium text-xs h-9 px-4"
          >
            <Link href="/dashboard/repositories">← Back to Repositories</Link>
          </Button>
        </div>
      </ProtectedLayout>
    );
  }

  const jobStatus = latestJob?.status || 'not_analyzed';
  const getStatusBadge = () => {
    switch (jobStatus) {
      case 'completed':
        return (
          <span className="text-xs bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 px-3 py-1 rounded-full font-semibold flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            Completed
          </span>
        );
      case 'in_progress':
        return (
          <span className="text-xs bg-amber-500/10 border border-amber-500/30 text-amber-400 px-3 py-1 rounded-full font-semibold flex items-center gap-1.5">
            <LoadingSpinner size="sm" />
            Analyzing...
          </span>
        );
      case 'failed':
        return (
          <span className="text-xs bg-red-500/10 border border-red-500/30 text-red-400 px-3 py-1 rounded-full font-semibold flex items-center gap-1.5">
            ⚠ Failed
          </span>
        );
      default:
        return (
          <span className="text-xs bg-zinc-800 border border-zinc-700 text-zinc-400 px-3 py-1 rounded-full font-medium">
            Not Analyzed
          </span>
        );
    }
  };

  return (
    <ProtectedLayout>
      <div className="space-y-8">
        {/* Navigation & Header */}
        <div className="space-y-4">
          <Link
            href="/dashboard/repositories"
            className="inline-flex items-center gap-2 text-xs font-semibold text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            <span>←</span>
            <span>Back to Repositories</span>
          </Link>

          <div className="bg-gradient-to-r from-zinc-900 via-zinc-900/90 to-zinc-900 border border-zinc-800 rounded-2xl p-6 sm:p-8 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
                  {repository.fullName || repository.name}
                </h1>
                {repository.private && (
                  <span className="text-xs bg-zinc-800 border border-zinc-700 text-zinc-400 px-2.5 py-0.5 rounded-md font-medium">
                    Private
                  </span>
                )}
                {getStatusBadge()}
              </div>

              {repository.description && (
                <p className="text-zinc-400 text-sm max-w-2xl leading-relaxed">
                  {repository.description}
                </p>
              )}

              <div className="flex flex-wrap items-center gap-4 text-xs text-zinc-400">
                {repository.language && (
                  <span className="flex items-center gap-1.5 font-medium text-zinc-300">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 inline-block" />
                    {repository.language}
                  </span>
                )}
                <span className="flex items-center gap-1">
                  <span>★</span>
                  <span>{repository.stars} stars</span>
                </span>
                <span className="flex items-center gap-1">
                  <span>⌥</span>
                  <span>{repository.forks} forks</span>
                </span>
                <span className="flex items-center gap-1 text-zinc-500">
                  <span>⎇</span>
                  <span>{repository.defaultBranch}</span>
                </span>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 shrink-0">
              <a
                href={repository.htmlUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-200 font-medium text-xs h-10 px-4 rounded-xl flex items-center justify-center gap-1.5 transition-colors"
              >
                <span>GitHub</span>
                <span>↗</span>
              </a>

              <Button
                variant="default"
                onClick={handleTriggerAnalysis}
                disabled={analyzing}
                className="bg-emerald-500 hover:bg-emerald-600 text-zinc-950 font-bold text-xs h-10 px-5 transition-all shadow-md flex items-center justify-center gap-2"
              >
                {analyzing ? (
                  <>
                    <LoadingSpinner size="sm" />
                    <span>Analyzing AST...</span>
                  </>
                ) : (
                  <>
                    <span>⚡</span>
                    <span>{jobStatus === 'completed' ? 'Re-analyze AST' : 'Run AST Analysis'}</span>
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="border-b border-zinc-800">
          <div className="flex space-x-8 overflow-x-auto">
            {(
              [
                { id: 'overview', label: 'Overview', icon: '📊' },
                { id: 'files', label: 'Indexed Files', icon: '📁', count: totalFiles },
                { id: 'symbols', label: 'AST Symbols', icon: '🧩', count: totalSymbols },
                { id: 'dependencies', label: 'Dependencies', icon: '🔗', count: totalDependencies },
              ] as Array<{ id: TabType; label: string; icon: string; count?: number }>
            ).map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`py-3 px-1 border-b-2 text-sm font-semibold transition-all flex items-center gap-2 whitespace-nowrap ${
                    isActive
                      ? 'border-emerald-400 text-emerald-400'
                      : 'border-transparent text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  <span>{tab.icon}</span>
                  <span>{tab.label}</span>
                  {tab.count !== undefined && tab.count > 0 && (
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                        isActive
                          ? 'bg-emerald-500/20 text-emerald-300'
                          : 'bg-zinc-800 text-zinc-400'
                      }`}
                    >
                      {tab.count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* TAB 1: OVERVIEW */}
        {activeTab === 'overview' && (
          <div className="space-y-8">
            {/* Quick Metrics Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-1">
                <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
                  Indexed Files
                </span>
                <p className="text-2xl font-black text-white">{totalFiles}</p>
                <p className="text-xs text-zinc-500">Repository tree items</p>
              </div>

              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-1">
                <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
                  AST Symbols
                </span>
                <p className="text-2xl font-black text-emerald-400">{totalSymbols}</p>
                <p className="text-xs text-zinc-500">Functions, classes &amp; types</p>
              </div>

              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-1">
                <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
                  File Dependencies
                </span>
                <p className="text-2xl font-black text-teal-400">{totalDependencies}</p>
                <p className="text-xs text-zinc-500">Internal &amp; external imports</p>
              </div>

              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-1">
                <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
                  Latest Commit
                </span>
                <p className="text-base font-mono font-bold text-zinc-200 truncate">
                  {latestJob?.commitHash ? latestJob.commitHash.substring(0, 7) : 'N/A'}
                </p>
                <p className="text-xs text-zinc-500">Git commit SHA</p>
              </div>
            </div>

            {/* Analysis Job Status Log Card */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 space-y-4">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <span>⚡</span>
                <span>Analysis Engine Status</span>
              </h3>

              {latestJob ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 bg-zinc-950 border border-zinc-800/80 rounded-xl p-4 text-xs">
                  <div>
                    <span className="text-zinc-500 block font-medium">Job ID</span>
                    <span className="font-mono text-zinc-300 truncate block">{latestJob.id}</span>
                  </div>

                  <div>
                    <span className="text-zinc-500 block font-medium">Status</span>
                    <span className="font-semibold text-emerald-400 capitalize">
                      {latestJob.status}
                    </span>
                  </div>

                  <div>
                    <span className="text-zinc-500 block font-medium">Started At</span>
                    <span className="text-zinc-300">
                      {latestJob.startedAt ? new Date(latestJob.startedAt).toLocaleString() : 'N/A'}
                    </span>
                  </div>

                  <div>
                    <span className="text-zinc-500 block font-medium">Finished At</span>
                    <span className="text-zinc-300">
                      {latestJob.finishedAt
                        ? new Date(latestJob.finishedAt).toLocaleString()
                        : 'N/A'}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="bg-zinc-950 border border-zinc-800/80 rounded-xl p-6 text-center space-y-3">
                  <p className="text-zinc-400 text-sm">
                    No analysis jobs have been run for this repository yet.
                  </p>
                  <Button
                    variant="default"
                    onClick={handleTriggerAnalysis}
                    disabled={analyzing}
                    className="bg-emerald-500 hover:bg-emerald-600 text-zinc-950 font-bold text-xs h-9 px-4"
                  >
                    Run AST Analysis Now
                  </Button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 2: INDEXED FILES */}
        {activeTab === 'files' && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
              <input
                type="text"
                placeholder="Search file path..."
                value={fileSearch}
                onChange={(e) => setFileSearch(e.target.value)}
                className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-emerald-500 w-full sm:w-72"
              />

              <select
                value={selectedLanguage}
                onChange={(e) => setSelectedLanguage(e.target.value)}
                className="bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-300 focus:outline-none focus:border-emerald-500"
              >
                <option value="">All Languages</option>
                <option value="TypeScript">TypeScript</option>
                <option value="JavaScript">JavaScript</option>
                <option value="TSX">TSX</option>
                <option value="JSX">JSX</option>
                <option value="Python">Python</option>
                <option value="Go">Go</option>
                <option value="Rust">Rust</option>
                <option value="Java">Java</option>
                <option value="C++">C++</option>
                <option value="JSON">JSON</option>
                <option value="Markdown">Markdown</option>
              </select>
            </div>

            {filesLoading ? (
              <div className="py-8 flex justify-center">
                <LoadingSpinner size="md" label="Loading indexed files..." />
              </div>
            ) : filteredFiles.length === 0 ? (
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 text-center text-zinc-400 text-sm">
                No indexed files found matching criteria.
              </div>
            ) : (
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden shadow-xl">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-zinc-950 border-b border-zinc-800 text-zinc-400 uppercase font-semibold text-[10px] tracking-wider">
                      <tr>
                        <th className="py-3 px-4">File Path</th>
                        <th className="py-3 px-4">Type</th>
                        <th className="py-3 px-4">Language</th>
                        <th className="py-3 px-4 text-right">Size</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800/60 font-mono text-zinc-300">
                      {filteredFiles.map((file) => (
                        <tr key={file.id} className="hover:bg-zinc-800/40 transition-colors">
                          <td className="py-3 px-4 font-semibold text-white truncate max-w-md">
                            {file.path}
                          </td>
                          <td className="py-3 px-4 capitalize font-sans text-zinc-400">
                            {file.type}
                          </td>
                          <td className="py-3 px-4 font-sans">
                            {file.language ? (
                              <span className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded text-[11px] font-medium">
                                {file.language}
                              </span>
                            ) : (
                              <span className="text-zinc-600">—</span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-right font-sans text-zinc-400">
                            {file.size ? `${(file.size / 1024).toFixed(1)} KB` : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 3: AST SYMBOL BROWSER */}
        {activeTab === 'symbols' && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
              <input
                type="text"
                placeholder="Search symbol name (e.g. parseSourceFile)..."
                value={symbolSearch}
                onChange={(e) => setSymbolSearch(e.target.value)}
                className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-emerald-500 w-full sm:w-80"
              />

              <select
                value={selectedKind}
                onChange={(e) => setSelectedKind(e.target.value)}
                className="bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-300 focus:outline-none focus:border-emerald-500"
              >
                <option value="">All Symbol Kinds</option>
                <option value="function">Function</option>
                <option value="class">Class</option>
                <option value="interface">Interface</option>
                <option value="type">Type</option>
                <option value="enum">Enum</option>
                <option value="variable">Variable</option>
                <option value="struct">Struct</option>
              </select>
            </div>

            {symbolsLoading ? (
              <div className="py-8 flex justify-center">
                <LoadingSpinner size="md" label="Loading extracted AST symbols..." />
              </div>
            ) : symbols.length === 0 ? (
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 text-center text-zinc-400 text-sm">
                No AST symbols extracted yet. Run AST analysis to populate code symbols.
              </div>
            ) : (
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden shadow-xl">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-zinc-950 border-b border-zinc-800 text-zinc-400 uppercase font-semibold text-[10px] tracking-wider">
                      <tr>
                        <th className="py-3 px-4">Symbol Name</th>
                        <th className="py-3 px-4">Kind</th>
                        <th className="py-3 px-4">Defined In File</th>
                        <th className="py-3 px-4">Line Range</th>
                        <th className="py-3 px-4 text-right">Exported</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800/60 text-zinc-300">
                      {symbols.map((sym) => (
                        <tr key={sym.id} className="hover:bg-zinc-800/40 transition-colors">
                          <td className="py-3 px-4 font-mono font-bold text-emerald-300">
                            {sym.name}
                          </td>
                          <td className="py-3 px-4 font-sans">
                            <span className="bg-zinc-800 border border-zinc-700 text-zinc-300 px-2 py-0.5 rounded text-[11px] font-medium capitalize">
                              {sym.kind}
                            </span>
                          </td>
                          <td className="py-3 px-4 font-mono text-zinc-400 truncate max-w-xs">
                            {sym.filePath}
                          </td>
                          <td className="py-3 px-4 font-mono text-zinc-500 text-[11px]">
                            {sym.startLine
                              ? `L${sym.startLine}–L${sym.endLine || sym.startLine}`
                              : '—'}
                          </td>
                          <td className="py-3 px-4 text-right font-sans">
                            {sym.exported ? (
                              <span className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded text-[10px] font-semibold">
                                Exported
                              </span>
                            ) : (
                              <span className="text-zinc-600 text-[10px]">Local</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 4: DEPENDENCY INSPECTOR */}
        {activeTab === 'dependencies' && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
              <input
                type="text"
                placeholder="Search source or target path..."
                value={depSearch}
                onChange={(e) => setDepSearch(e.target.value)}
                className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-emerald-500 w-full sm:w-80"
              />

              <div className="flex items-center bg-zinc-900 border border-zinc-800 rounded-xl p-1 gap-1">
                {(['all', 'internal', 'external'] as const).map((filter) => (
                  <button
                    key={filter}
                    onClick={() => setDepFilter(filter)}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold capitalize transition-colors ${
                      depFilter === filter
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                        : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    {filter}
                  </button>
                ))}
              </div>
            </div>

            {depsLoading ? (
              <div className="py-8 flex justify-center">
                <LoadingSpinner size="md" label="Loading file dependencies..." />
              </div>
            ) : filteredDeps.length === 0 ? (
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 text-center text-zinc-400 text-sm">
                No dependencies mapped yet. Run AST analysis to map module dependencies.
              </div>
            ) : (
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden shadow-xl">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-zinc-950 border-b border-zinc-800 text-zinc-400 uppercase font-semibold text-[10px] tracking-wider">
                      <tr>
                        <th className="py-3 px-4">Source File</th>
                        <th className="py-3 px-4">Target Dependency</th>
                        <th className="py-3 px-4">Scope</th>
                        <th className="py-3 px-4">Imported Symbols</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800/60 text-zinc-300 font-mono">
                      {filteredDeps.map((dep) => (
                        <tr key={dep.id} className="hover:bg-zinc-800/40 transition-colors">
                          <td className="py-3 px-4 font-semibold text-white truncate max-w-xs">
                            {dep.sourcePath}
                          </td>
                          <td className="py-3 px-4 font-bold text-teal-300 truncate max-w-xs">
                            {dep.targetPath}
                          </td>
                          <td className="py-3 px-4 font-sans">
                            {dep.isExternal ? (
                              <span className="bg-purple-500/10 border border-purple-500/20 text-purple-400 px-2 py-0.5 rounded text-[10px] font-semibold">
                                External Module
                              </span>
                            ) : (
                              <span className="bg-zinc-800 border border-zinc-700 text-zinc-400 px-2 py-0.5 rounded text-[10px] font-medium">
                                Relative Import
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4 font-sans">
                            {dep.importedSymbols && dep.importedSymbols.length > 0 ? (
                              <div className="flex flex-wrap gap-1">
                                {dep.importedSymbols.map((sym, idx) => (
                                  <span
                                    key={idx}
                                    className="bg-zinc-950 border border-zinc-800 text-zinc-300 font-mono text-[10px] px-1.5 py-0.5 rounded"
                                  >
                                    {sym}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <span className="text-zinc-600">—</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </ProtectedLayout>
  );
}
