'use client';

// =============================================================================
// ForgeMind Web — Repository Detail & Intelligence Explorer Page
// =============================================================================

import Link from 'next/link';
import { useParams, useSearchParams, usePathname } from 'next/navigation';
import React, { useEffect, useState, useCallback, useMemo } from 'react';

import type {
  AnalysisJob,
  ArchitectureOverviewResponse,
  ChatMessage,
  CodeExplainResponse,
  FileDependency,
  FileDependencyIntelligence,
  ImpactAnalysisResult,
  OnboardingBlueprint,
  RAGSourceCitation,
  RepositoryFile,
  RepositorySymbol,
  WhatIfScenarioType,
} from '@forgemind/types';
import { Button } from '@forgemind/ui';

import { ProtectedLayout } from '@/components/dashboard/ProtectedLayout';
import { DependencyGraphVisualizer } from '@/components/graph/DependencyGraphVisualizer';
import { ArchitecturalHealthDashboard } from '@/components/health/ArchitecturalHealthDashboard';
import { PRGatekeeperDashboard } from '@/components/gatekeeper/PRGatekeeperDashboard';
import { OnboardingBlueprintViewer } from '@/components/onboarding/OnboardingBlueprintViewer';
import { ArchitectureTimeMachineViewer } from '@/components/architecture/ArchitectureTimeMachineViewer';
import { ArchitectureWhatIfSimulator } from '@/components/architecture/ArchitectureWhatIfSimulator';

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
import {
  explainCode,
  getFileDependencyIntelligence,
  analyzeImpact,
  getArchitectureOverview,
  getOnboardingBlueprint,
} from '@/lib/intelligence.api';
import {
  queryRepositoryRAG,
  getRepositoryChatHistory,
  clearRepositoryChatHistory,
} from '@/lib/rag.api';
import { getRepository, type Repository } from '@/lib/repository.api';

export type WorkspaceSection = 'overview' | 'architecture' | 'health' | 'change' | 'governance';

export type TabType =
  | 'overview'
  | 'health'
  | 'what-if'
  | 'time-machine'
  | 'intelligence'
  | 'graph'
  | 'chat'
  | 'files'
  | 'symbols'
  | 'dependencies'
  | 'gatekeeper';

export function resolveWorkspaceFromUrl(
  tabParam: string | null,
  subTabParam?: string | null,
): {
  section: WorkspaceSection;
  subTab: TabType;
} {
  const paramToResolve = subTabParam || tabParam;
  if (!paramToResolve) {
    return { section: 'overview', subTab: 'overview' };
  }
  const lower = paramToResolve.toLowerCase().trim();
  switch (lower) {
    case 'overview':
      return { section: 'overview', subTab: 'overview' };
    case 'health':
    case 'risk':
      return { section: 'health', subTab: 'health' };
    case 'change':
      return { section: 'change', subTab: 'what-if' };
    case 'what-if':
    case 'whatif':
      return { section: 'change', subTab: 'what-if' };
    case 'time-machine':
    case 'timemachine':
    case 'history':
      return { section: 'change', subTab: 'time-machine' };
    case 'architecture':
      return { section: 'architecture', subTab: 'graph' };
    case 'graph':
    case 'topology':
      return { section: 'architecture', subTab: 'graph' };
    case 'intelligence':
    case 'code':
      return { section: 'architecture', subTab: 'intelligence' };
    case 'files':
      return { section: 'architecture', subTab: 'files' };
    case 'symbols':
      return { section: 'architecture', subTab: 'symbols' };
    case 'dependencies':
    case 'deps':
      return { section: 'architecture', subTab: 'dependencies' };
    case 'chat':
    case 'ai':
    case 'assistant':
      return { section: 'architecture', subTab: 'chat' };
    case 'governance':
    case 'gatekeeper':
      return { section: 'governance', subTab: 'gatekeeper' };
    default:
      return { section: 'overview', subTab: 'overview' };
  }
}

const VALID_WHAT_IF_SCENARIOS: readonly WhatIfScenarioType[] = [
  'add_dependency',
  'remove_dependency',
  'move_module',
  'introduce_cross_layer_dependency',
];

export function parseValidScenarioType(param: string | null): WhatIfScenarioType | undefined {
  if (!param) return undefined;
  return VALID_WHAT_IF_SCENARIOS.includes(param as WhatIfScenarioType)
    ? (param as WhatIfScenarioType)
    : undefined;
}

export default function RepositoryDetailPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const pathname = usePathname();

  const repositoryId = typeof params?.['id'] === 'string' ? params['id'] : '';
  const tabParam = searchParams ? searchParams.get('tab') : null;
  const subTabParam = searchParams ? searchParams.get('subtab') : null;
  const pathParam = searchParams
    ? searchParams.get('sourcePath') || searchParams.get('path') || ''
    : '';
  const scenarioParam = searchParams ? searchParams.get('scenario') : null;
  const validScenario = parseValidScenarioType(scenarioParam);

  const resolvedWorkspace = useMemo(
    () => resolveWorkspaceFromUrl(tabParam, subTabParam),
    [tabParam, subTabParam],
  );

  const [repository, setRepository] = useState<Repository | null>(null);
  const [latestJob, setLatestJob] = useState<AnalysisJob | null>(null);
  const [activeTab, setActiveTabState] = useState<TabType>(resolvedWorkspace.subTab);

  // Sync activeTab whenever URL search parameter changes
  useEffect(() => {
    setActiveTabState(resolvedWorkspace.subTab);
  }, [resolvedWorkspace]);

  // Handle browser Back / Forward popstate navigation
  useEffect(() => {
    const handlePopState = () => {
      if (typeof window === 'undefined') return;
      const currentSearchParams = new URLSearchParams(window.location.search);
      const currentTabParam = currentSearchParams.get('tab');
      const currentSubTabParam = currentSearchParams.get('subtab');
      const resolved = resolveWorkspaceFromUrl(currentTabParam, currentSubTabParam);
      setActiveTabState(resolved.subTab);
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigateToTab = useCallback(
    (
      targetTab: TabType,
      targetSection?: WorkspaceSection,
      options: { replace?: boolean; queryParams?: Record<string, string> } = {},
    ) => {
      setActiveTabState(targetTab);
      const sectionToUse = targetSection || resolveWorkspaceFromUrl(targetTab).section;
      const paramToSet = sectionToUse === 'overview' ? 'overview' : sectionToUse;

      if (typeof window !== 'undefined' && pathname) {
        const search = new URLSearchParams();
        search.set('tab', paramToSet);
        if (targetTab !== 'overview' && targetTab !== sectionToUse) {
          search.set('subtab', targetTab);
        }
        if (options.queryParams) {
          Object.entries(options.queryParams).forEach(([k, v]) => {
            if (v) search.set(k, v);
          });
        }
        const targetSearch = `?${search.toString()}`;
        const url = `${pathname}${targetSearch}`;

        if (window.location.search !== targetSearch) {
          if (options.replace) {
            window.history.replaceState(null, '', url);
          } else {
            window.history.pushState(null, '', url);
          }
        }
      }
    },
    [pathname],
  );

  const setActiveTab = (tab: TabType) => {
    navigateToTab(tab);
  };

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

  // AI Code Assistant Tab State
  const [chatQuery, setChatQuery] = useState<string>('');
  const [chatLoading, setChatLoading] = useState<boolean>(false);
  const [chatHistoryLoading, setChatHistoryLoading] = useState<boolean>(false);
  const [chatClearing, setChatClearing] = useState<boolean>(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [investigationContextSource, setInvestigationContextSource] = useState<
    'finding' | 'graph' | 'onboarding' | null
  >(null);
  // Reconstructed message thread from DB history + in-session queries
  const [chatDbMessages, setChatDbMessages] = useState<ChatMessage[]>([]);
  const [chatMessages, setChatMessages] = useState<
    Array<{
      id: string;
      query: string;
      answer: string;
      sources: RAGSourceCitation[];
      providerUsed: string;
      timestamp: Date;
    }>
  >([]);
  const [chatLastQuery, setChatLastQuery] = useState<string>('');

  const { addToast } = useToast();

  // Load persisted chat history from DB for this repository
  const loadChatHistory = useCallback(async () => {
    if (!repositoryId) return;
    setChatHistoryLoading(true);
    try {
      const { messages } = await getRepositoryChatHistory(repositoryId);
      setChatDbMessages(messages);
    } catch {
      // Non-fatal: history load failures are swallowed silently
    } finally {
      setChatHistoryLoading(false);
    }
  }, [repositoryId]);

  const handleSendRAGQuery = async (queryToRun?: string) => {
    const q = (queryToRun || chatQuery).trim();
    if (!q || !repositoryId) return;

    setChatLoading(true);
    setChatError(null);
    setChatLastQuery(q);
    setChatQuery('');

    try {
      const res = await queryRepositoryRAG(repositoryId, q);
      setChatMessages((prev) => [
        ...prev,
        {
          id: String(Date.now()),
          query: q,
          answer: res.answer,
          sources: res.sources,
          providerUsed: res.providerUsed,
          timestamp: new Date(),
        },
      ]);
      // Reload DB history so persisted messages stay in sync
      await loadChatHistory();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to retrieve codebase answer.';
      setChatError(msg);
      addToast(msg, 'error');
    } finally {
      setChatLoading(false);
    }
  };

  const handleRetryLastQuery = () => {
    if (chatLastQuery) {
      void handleSendRAGQuery(chatLastQuery);
    }
  };

  const handleClearConversation = async () => {
    if (!repositoryId) return;
    setChatClearing(true);
    try {
      await clearRepositoryChatHistory(repositoryId);
      setChatMessages([]);
      setChatDbMessages([]);
      setChatError(null);
      setChatLastQuery('');
      addToast('Conversation cleared.', 'success');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to clear conversation.';
      addToast(msg, 'error');
    } finally {
      setChatClearing(false);
    }
  };

  // ─── Code Intelligence Tab State ───────────────────────────────────────────
  const [intelSubTab, setIntelSubTab] = useState<
    'onboarding' | 'architecture' | 'explain' | 'depintel' | 'impact'
  >('architecture');

  // Architecture Overview State
  const [archOverview, setArchOverview] = useState<ArchitectureOverviewResponse | null>(null);
  const [archLoading, setArchLoading] = useState<boolean>(false);
  const [archError, setArchError] = useState<string | null>(null);

  // Code Explanation State
  const [explainFilePath, setExplainFilePath] = useState<string>('');
  const [explainSymbolName, setExplainSymbolName] = useState<string>('');
  const [explainResult, setExplainResult] = useState<CodeExplainResponse | null>(null);
  const [explainLoading, setExplainLoading] = useState<boolean>(false);
  const [explainError, setExplainError] = useState<string | null>(null);

  // Dependency Intelligence State
  const [depIntelFilePath, setDepIntelFilePath] = useState<string>('');
  const [depIntelResult, setDepIntelResult] = useState<FileDependencyIntelligence | null>(null);
  const [depIntelLoading, setDepIntelLoading] = useState<boolean>(false);
  const [depIntelError, setDepIntelError] = useState<string | null>(null);

  // Impact Analysis State
  const [impactFilePath, setImpactFilePath] = useState<string>('');
  const [impactSymbolName, setImpactSymbolName] = useState<string>('');
  const [impactIncludeExplanation, setImpactIncludeExplanation] = useState<boolean>(true);
  const [impactResult, setImpactResult] = useState<ImpactAnalysisResult | null>(null);
  const [impactLoading, setImpactLoading] = useState<boolean>(false);
  const [impactError, setImpactError] = useState<string | null>(null);

  // Onboarding Blueprint State
  const [blueprint, setBlueprint] = useState<OnboardingBlueprint | null>(null);
  const [blueprintLoading, setBlueprintLoading] = useState<boolean>(false);
  const [blueprintError, setBlueprintError] = useState<string | null>(null);

  // Graph Highlight State
  const [graphHighlightNodeIds, setGraphHighlightNodeIds] = useState<string[]>([]);

  // Callbacks
  const fetchBlueprint = useCallback(async () => {
    if (!repositoryId) return;
    setBlueprintLoading(true);
    setBlueprintError(null);
    try {
      const res = await getOnboardingBlueprint(repositoryId);
      setBlueprint(res.data);
    } catch (err) {
      setBlueprintError(
        err instanceof Error ? err.message : 'Failed to generate onboarding blueprint.',
      );
    } finally {
      setBlueprintLoading(false);
    }
  }, [repositoryId]);
  const fetchArchOverview = useCallback(async () => {
    if (!repositoryId) return;
    setArchLoading(true);
    setArchError(null);
    try {
      const res = await getArchitectureOverview(repositoryId);
      setArchOverview(res);
    } catch (err) {
      setArchError(err instanceof Error ? err.message : 'Failed to load architecture overview.');
    } finally {
      setArchLoading(false);
    }
  }, [repositoryId]);

  const handleExplainCode = async (overrideFile?: string, overrideSymbol?: string) => {
    const file = (overrideFile || explainFilePath).trim();
    const symbol = (overrideSymbol !== undefined ? overrideSymbol : explainSymbolName).trim();
    if (!file || !repositoryId) return;

    setExplainLoading(true);
    setExplainError(null);
    try {
      const res = await explainCode(repositoryId, {
        filePath: file,
        symbolName: symbol || undefined,
      });
      setExplainResult(res);
    } catch (err) {
      setExplainError(err instanceof Error ? err.message : 'Failed to explain code.');
    } finally {
      setExplainLoading(false);
    }
  };

  const handleFetchDepIntel = async (overrideFile?: string) => {
    const file = (overrideFile || depIntelFilePath).trim();
    if (!file || !repositoryId) return;

    setDepIntelLoading(true);
    setDepIntelError(null);
    try {
      const res = await getFileDependencyIntelligence(repositoryId, file);
      setDepIntelResult(res);
    } catch (err) {
      setDepIntelError(err instanceof Error ? err.message : 'Failed to analyze dependencies.');
    } finally {
      setDepIntelLoading(false);
    }
  };

  const handleAnalyzeImpact = async (overrideFile?: string, overrideSymbol?: string) => {
    const file = (overrideFile || impactFilePath).trim();
    const symbol = (overrideSymbol !== undefined ? overrideSymbol : impactSymbolName).trim();
    if (!file || !repositoryId) return;

    setImpactLoading(true);
    setImpactError(null);
    try {
      const res = await analyzeImpact(repositoryId, {
        filePath: file,
        symbolName: symbol || undefined,
        includeExplanation: impactIncludeExplanation,
      });
      setImpactResult(res);
    } catch (err) {
      setImpactError(err instanceof Error ? err.message : 'Failed to analyze impact.');
    } finally {
      setImpactLoading(false);
    }
  };

  // Load Repository Metadata and Latest Analysis Job
  const fetchRepoData = useCallback(async () => {
    if (!repositoryId) return;
    setLoadingRepo(true);
    setError(null);

    try {
      const [repo, job] = await Promise.all([
        getRepository(repositoryId),
        getLatestAnalysisJob(repositoryId).catch(() => null),
      ]);

      setRepository(repo);
      setLatestJob(job);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load repository.');
    } finally {
      setLoadingRepo(false);
    }
  }, [repositoryId]);

  const fetchRepoDataSilently = useCallback(async () => {
    if (!repositoryId) return;
    try {
      const [repo, job] = await Promise.all([
        getRepository(repositoryId),
        getLatestAnalysisJob(repositoryId).catch(() => null),
      ]);
      if (repo) setRepository(repo);
      if (job) setLatestJob(job);
    } catch {
      // Swallowed silently during polling
    }
  }, [repositoryId]);

  useEffect(() => {
    fetchRepoData();
  }, [fetchRepoData]);

  // Live polling for active analysis progress
  useEffect(() => {
    const isProcessing =
      repository?.status === 'indexing' ||
      repository?.status === 'queued' ||
      latestJob?.status === 'pending' ||
      latestJob?.status === 'in_progress';

    if (!isProcessing) return;

    const intervalId = setInterval(() => {
      fetchRepoDataSilently();
    }, 3000);

    return () => clearInterval(intervalId);
  }, [repository?.status, latestJob?.status, fetchRepoDataSilently]);

  // Load Files
  const fetchFiles = useCallback(async () => {
    if (!repositoryId) return;
    setFilesLoading(true);
    try {
      const data = await getRepositoryFiles(repositoryId, {
        language: selectedLanguage || undefined,
        limit: 100,
      });
      setFiles(Array.isArray(data?.files) ? data.files : []);
      setTotalFiles(data?.total || 0);
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
      setSymbols(Array.isArray(data?.symbols) ? data.symbols : []);
      setTotalSymbols(data?.total || 0);
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
      setDependencies(Array.isArray(data?.dependencies) ? data.dependencies : []);
      setTotalDependencies(data?.total || 0);
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
    } else if (activeTab === 'chat') {
      loadChatHistory();
    } else if (activeTab === 'intelligence') {
      fetchBlueprint();
      fetchArchOverview();
    }
  }, [
    activeTab,
    fetchFiles,
    fetchSymbols,
    fetchDependencies,
    loadChatHistory,
    fetchBlueprint,
    fetchArchOverview,
  ]);

  // Handle Trigger Repository Analysis
  const handleTriggerAnalysis = async () => {
    if (!repositoryId) return;
    setAnalyzing(true);
    addToast('Analysis job queued. Processing in background...', 'info');
    try {
      const result = await triggerRepositoryAnalysis(repositoryId);
      if (result.job) {
        setLatestJob(result.job);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to queue repository analysis.';
      addToast(msg, 'error');
    } finally {
      setAnalyzing(false);
    }
  };

  // Poll analysis job status while in pending or in_progress state
  useEffect(() => {
    if (!repositoryId || !latestJob) return;
    if (latestJob.status !== 'pending' && latestJob.status !== 'in_progress') return;

    const interval = setInterval(async () => {
      try {
        const updatedJob = await getLatestAnalysisJob(repositoryId);
        if (updatedJob) {
          setLatestJob(updatedJob);
          if (updatedJob.status === 'completed') {
            addToast('Repository analysis completed successfully!', 'success');
            fetchRepoData();
            fetchFiles();
            fetchSymbols();
            fetchDependencies();
          } else if (updatedJob.status === 'failed') {
            addToast(`Analysis failed: ${updatedJob.error || 'Unknown error'}`, 'error');
          }
        }
      } catch {
        // Non-fatal polling error
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [
    repositoryId,
    latestJob,
    addToast,
    fetchRepoData,
    fetchFiles,
    fetchSymbols,
    fetchDependencies,
  ]);

  // Filter files client-side by search term
  const safeFiles = Array.isArray(files) ? files : [];
  const filteredFiles = safeFiles.filter((f) =>
    fileSearch ? f.path.toLowerCase().includes(fileSearch.toLowerCase()) : true,
  );

  // Filter dependencies client-side by search term
  const safeDeps = Array.isArray(dependencies) ? dependencies : [];
  const filteredDeps = safeDeps.filter((d) =>
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

        {/* Primary Workspace Section Navigation */}
        <div className="border-b border-zinc-800 space-y-3">
          <div className="flex space-x-6 overflow-x-auto">
            {[
              {
                section: 'overview' as WorkspaceSection,
                defaultTab: 'overview' as TabType,
                label: 'Overview',
                icon: '📊',
              },
              {
                section: 'architecture' as WorkspaceSection,
                defaultTab: 'graph' as TabType,
                label: 'Architecture',
                icon: '🌐',
              },
              {
                section: 'health' as WorkspaceSection,
                defaultTab: 'health' as TabType,
                label: 'Health & Risk',
                icon: '🩺',
              },
              {
                section: 'change' as WorkspaceSection,
                defaultTab: 'what-if' as TabType,
                label: 'Change & History',
                icon: '⚡',
              },
              {
                section: 'governance' as WorkspaceSection,
                defaultTab: 'gatekeeper' as TabType,
                label: 'Governance',
                icon: '🛡️',
              },
            ].map((item) => {
              const currentSection = resolveWorkspaceFromUrl(activeTab).section;
              const isSectionActive = currentSection === item.section;
              return (
                <button
                  key={item.section}
                  onClick={() => navigateToTab(item.defaultTab, item.section)}
                  className={`py-3 px-1 border-b-2 text-sm font-semibold transition-all flex items-center gap-2 whitespace-nowrap ${
                    isSectionActive
                      ? 'border-emerald-400 text-emerald-400'
                      : 'border-transparent text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  <span>{item.icon}</span>
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>

          {/* Secondary Sub-Navigation for Architecture Workspace */}
          {resolveWorkspaceFromUrl(activeTab).section === 'architecture' && (
            <div className="bg-zinc-950/60 border border-zinc-800/80 rounded-xl p-1.5 flex flex-wrap items-center gap-1.5">
              {[
                { id: 'graph' as TabType, label: 'Graph & Topology', icon: '🌐' },
                { id: 'intelligence' as TabType, label: 'Code Intelligence', icon: '🧠' },
                { id: 'files' as TabType, label: 'Indexed Files', icon: '📁', count: totalFiles },
                { id: 'symbols' as TabType, label: 'AST Symbols', icon: '🧩', count: totalSymbols },
                {
                  id: 'dependencies' as TabType,
                  label: 'Dependencies',
                  icon: '🔗',
                  count: totalDependencies,
                },
                { id: 'chat' as TabType, label: 'AI Assistant', icon: '🤖' },
              ].map((sub) => {
                const isSubActive = activeTab === sub.id;
                return (
                  <button
                    key={sub.id}
                    onClick={() => navigateToTab(sub.id, 'architecture')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                      isSubActive
                        ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-300'
                        : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
                    }`}
                  >
                    <span>{sub.icon}</span>
                    <span>{sub.label}</span>
                    {sub.count !== undefined && sub.count > 0 && (
                      <span className="text-[10px] px-1.5 py-0.2 bg-zinc-800 text-zinc-300 rounded font-mono">
                        {sub.count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {/* Secondary Sub-Navigation for Change & History Workspace */}
          {resolveWorkspaceFromUrl(activeTab).section === 'change' && (
            <div className="bg-zinc-950/60 border border-zinc-800/80 rounded-xl p-1.5 flex flex-wrap items-center gap-1.5">
              {[
                { id: 'what-if' as TabType, label: 'What-If Simulator', icon: '🔮' },
                { id: 'time-machine' as TabType, label: 'Time Machine', icon: '⏳' },
              ].map((sub) => {
                const isSubActive = activeTab === sub.id;
                return (
                  <button
                    key={sub.id}
                    onClick={() => navigateToTab(sub.id, 'change')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                      isSubActive
                        ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-300'
                        : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
                    }`}
                  >
                    <span>{sub.icon}</span>
                    <span>{sub.label}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* TAB: ARCHITECTURAL HEALTH */}
        {activeTab === 'health' && (
          <ArchitecturalHealthDashboard
            repositoryId={repositoryId}
            onNavigateToGraph={(finding) => {
              setGraphHighlightNodeIds(finding.affectedNodeIds);
              setActiveTab('graph');
            }}
            onInvestigateWithAI={(finding) => {
              const primaryFile = finding.affectedFilePaths[0] || 'codebase';
              setChatQuery(
                `Investigate the architectural risk in ${primaryFile}: '${finding.title}' (${finding.severity.toUpperCase()} - ${finding.category}). Description: ${finding.description}. Explain the main causes of this issue, identify the most important dependencies contributing to it, describe the likely blast radius of a refactor, and suggest practical refactoring approaches.`,
              );
              setInvestigationContextSource('finding');
              setActiveTab('chat');
            }}
            onSelectFile={(path) => {
              setFileSearch(path);
              setActiveTab('files');
            }}
            onSimulateRefactor={(sourcePath, scenario) => {
              navigateToTab('what-if', 'change', {
                queryParams: {
                  sourcePath,
                  scenario,
                },
              });
            }}
          />
        )}

        {/* TAB: WHAT-IF SIMULATOR */}
        {activeTab === 'what-if' && (
          <ArchitectureWhatIfSimulator
            key={`${pathParam}-${validScenario || 'default'}`}
            repositoryId={repositoryId}
            initialSourcePath={pathParam}
            initialScenarioType={validScenario}
          />
        )}

        {/* TAB: ARCHITECTURE TIME MACHINE */}
        {activeTab === 'time-machine' && (
          <ArchitectureTimeMachineViewer repositoryId={repositoryId} initialPath={pathParam} />
        )}

        {/* TAB: PR GATEKEEPER */}
        {activeTab === 'gatekeeper' && <PRGatekeeperDashboard repositoryId={repositoryId} />}

        {/* TAB: GRAPH & TOPOLOGY */}

        {activeTab === 'graph' && (
          <DependencyGraphVisualizer
            repositoryId={repositoryId}
            highlightNodeIds={graphHighlightNodeIds}
            onSelectNodeForFiles={(path) => {
              setFileSearch(path);
              setActiveTab('files');
            }}
            onSelectNodeForImpact={(path, symbol) => {
              setImpactFilePath(path);
              if (symbol) setImpactSymbolName(symbol);
              setIntelSubTab('impact');
              setActiveTab('intelligence');
            }}
            onSelectNodeForExplain={(path, symbol) => {
              setExplainFilePath(path);
              if (symbol) setExplainSymbolName(symbol);
              setIntelSubTab('explain');
              setActiveTab('intelligence');
            }}
            onSelectNodeForAIInvestigation={(node, blastRadiusInfo) => {
              let prompt = '';
              if (node.type === 'symbol') {
                const symbolParts = node.label.split(' ');
                const symbolName = symbolParts[0] || node.label;
                const kindText = symbolParts[1] ? ` ${symbolParts[1]}` : '';
                prompt = `Investigate AST symbol '${symbolName}'${kindText} defined in ${node.path || 'the repository'} (in-degree: ${node.metrics.inDegree}, out-degree: ${node.metrics.outDegree}, reachable blast radius: ${blastRadiusInfo.reachableCount} node(s)). Explain what uses this symbol, its dependency contract, risks of modifying its signature, and recommended refactoring steps.`;
              } else if (node.type === 'file') {
                prompt = `Investigate file ${node.path || node.label} (${node.metrics.inDegree} incoming dependent(s), ${node.metrics.outDegree} outgoing dependency(ies), reachable blast radius of ${blastRadiusInfo.reachableCount} node(s)). Explain what depends on this file, what it imports, refactoring risks, and key architectural considerations.`;
              } else if (node.type === 'module') {
                prompt = `Investigate module directory ${node.path || node.label} (${node.metrics.inDegree} incoming link(s), ${node.metrics.outDegree} outgoing link(s), reachable blast radius of ${blastRadiusInfo.reachableCount} node(s)). Explain module boundaries, coupling with other modules, and architectural health considerations.`;
              } else if (node.type === 'package') {
                prompt = `Investigate external package dependency '${node.label}' (${node.metrics.inDegree} file(s) importing it). Explain its usage across the repository and risks or alternatives for upgrading or replacing it.`;
              } else {
                prompt = `Investigate ${node.path || node.label} (${node.type}) and its dependency relationships. It has ${node.metrics.inDegree} incoming dependent(s), ${node.metrics.outDegree} outgoing dependency(ies), and a reachable blast radius of ${blastRadiusInfo.reachableCount} node(s). Explain what depends on this node, what it depends on, the risks of modifying it, and key architectural considerations.`;
              }
              setChatQuery(prompt);
              setInvestigationContextSource('graph');
              setActiveTab('chat');
            }}
            onNavigateToTimeMachine={(path) => {
              navigateToTab('time-machine', 'change', { queryParams: { path } });
            }}
            onNavigateToWhatIf={(path, isModule) => {
              navigateToTab('what-if', 'change', {
                queryParams: {
                  sourcePath: path,
                  ...(isModule ? { scenario: 'move_module' } : {}),
                },
              });
            }}
          />
        )}

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
              <h3 className="text-base font-bold text-white flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <span>⚡</span>
                  <span>Analysis Engine Status</span>
                </span>
                {latestJob?.stageLabel && (
                  <span className="text-xs text-sky-400 bg-sky-500/10 border border-sky-500/20 px-3 py-1 rounded-full font-medium">
                    {latestJob.stageLabel}
                  </span>
                )}
              </h3>

              {latestJob ? (
                <div className="space-y-4 bg-zinc-950 border border-zinc-800/80 rounded-xl p-4 text-xs">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div>
                      <span className="text-zinc-500 block font-medium">Job ID</span>
                      <span className="font-mono text-zinc-300 truncate block">{latestJob.id}</span>
                    </div>

                    <div>
                      <span className="text-zinc-500 block font-medium">Status</span>
                      <span
                        className={`font-semibold capitalize ${
                          latestJob.status === 'completed'
                            ? 'text-emerald-400'
                            : latestJob.status === 'in_progress'
                              ? 'text-sky-400'
                              : latestJob.status === 'failed'
                                ? 'text-red-400'
                                : 'text-amber-400'
                        }`}
                      >
                        {latestJob.status === 'in_progress' ? 'Indexing' : latestJob.status}
                      </span>
                    </div>

                    <div>
                      <span className="text-zinc-500 block font-medium">Started At</span>
                      <span className="text-zinc-300">
                        {latestJob.startedAt
                          ? new Date(latestJob.startedAt).toLocaleString()
                          : 'N/A'}
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

                  {/* Progress Bar & Real Denominator Count */}
                  {(latestJob.status === 'in_progress' || latestJob.status === 'pending') && (
                    <div className="pt-2 border-t border-zinc-800/60 space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-zinc-400 font-medium">
                          {latestJob.stageLabel || 'Processing repository data...'}
                        </span>
                        {typeof latestJob.processedCount === 'number' &&
                          typeof latestJob.totalCount === 'number' &&
                          latestJob.totalCount > 0 && (
                            <span className="font-mono text-emerald-400 font-bold">
                              {latestJob.processedCount} / {latestJob.totalCount} files (
                              {Math.min(
                                100,
                                Math.max(
                                  0,
                                  Math.round(
                                    (latestJob.processedCount / latestJob.totalCount) * 100,
                                  ),
                                ),
                              )}
                              %)
                            </span>
                          )}
                      </div>

                      {typeof latestJob.processedCount === 'number' &&
                        typeof latestJob.totalCount === 'number' &&
                        latestJob.totalCount > 0 && (
                          <div className="w-full bg-zinc-900 border border-zinc-800 rounded-full h-2 overflow-hidden">
                            <div
                              className="bg-emerald-500 h-2 transition-all duration-300 rounded-full"
                              style={{
                                width: `${Math.min(
                                  100,
                                  Math.max(
                                    0,
                                    Math.round(
                                      (latestJob.processedCount / latestJob.totalCount) * 100,
                                    ),
                                  ),
                                )}%`,
                              }}
                            />
                          </div>
                        )}
                    </div>
                  )}

                  {/* Failure State & Safe Error Presentation */}
                  {latestJob.status === 'failed' && (
                    <div className="pt-2 border-t border-zinc-800/60 space-y-2">
                      <div className="p-3 bg-red-950/40 border border-red-800/50 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div>
                          <span className="text-red-400 font-bold block">
                            Analysis Ingestion Failed
                          </span>
                          <p className="text-red-300/80 text-xs mt-0.5">
                            {latestJob.error ||
                              'An unexpected error occurred during repository ingestion.'}
                          </p>
                        </div>
                        <Button
                          variant="default"
                          onClick={handleTriggerAnalysis}
                          disabled={analyzing}
                          className="bg-emerald-500 hover:bg-emerald-600 text-zinc-950 font-bold text-xs h-8 px-3 shrink-0"
                        >
                          Retry Analysis
                        </Button>
                      </div>
                    </div>
                  )}
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
                        <th className="py-3 px-4 text-right">Actions</th>
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
                          <td className="py-3 px-4 text-right font-sans">
                            <button
                              onClick={() => {
                                setChatQuery(
                                  `Explain the purpose, structure, and exports of ${file.path}`,
                                );
                                setActiveTab('chat');
                              }}
                              className="text-[11px] font-semibold text-emerald-400 hover:text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 px-2.5 py-1 rounded transition-colors"
                            >
                              Ask AI 🤖
                            </button>
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
                        <th className="py-3 px-4">Exported</th>
                        <th className="py-3 px-4 text-right">Actions</th>
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
                          <td className="py-3 px-4 font-sans">
                            {sym.exported ? (
                              <span className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded text-[10px] font-semibold">
                                Exported
                              </span>
                            ) : (
                              <span className="text-zinc-600 text-[10px]">Local</span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-right font-sans">
                            <button
                              onClick={() => {
                                setExplainFilePath(sym.filePath);
                                setExplainSymbolName(sym.name);
                                setIntelSubTab('explain');
                                setActiveTab('intelligence');
                              }}
                              className="text-[11px] font-semibold text-sky-400 hover:text-sky-300 bg-sky-500/10 hover:bg-sky-500/20 border border-sky-500/20 px-2.5 py-1 rounded transition-colors"
                            >
                              Explain 🧠
                            </button>
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

        {/* TAB: CODE INTELLIGENCE & EXPLAINABILITY */}
        {activeTab === 'intelligence' && (
          <div className="space-y-6">
            {/* Header / Sub-tab Nav */}
            <div className="bg-gradient-to-br from-zinc-900 via-zinc-900 to-zinc-950 border border-zinc-800 rounded-2xl p-5 shadow-xl space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 shrink-0 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-400 flex items-center justify-center text-lg">
                    🧠
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-white leading-tight">
                      Code Intelligence & Explainability
                    </h2>
                    <p className="text-xs text-zinc-400 leading-snug">
                      Deep structural insights, grounded code explanations, dependency intelligence,
                      and blast radius analysis.
                    </p>
                  </div>
                </div>
              </div>

              {/* Sub-tab Pills */}
              <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-zinc-800/60">
                {[
                  { id: 'onboarding', label: 'Onboarding Blueprint', icon: '🗺️' },
                  { id: 'architecture', label: 'Architecture Overview', icon: '🏛' },
                  { id: 'explain', label: 'Explain File / Symbol', icon: '💡' },
                  { id: 'depintel', label: 'Dependency Intelligence', icon: '🔗' },
                  { id: 'impact', label: 'Impact Analysis', icon: '🎯' },
                ].map((sub) => (
                  <button
                    key={sub.id}
                    onClick={() => setIntelSubTab(sub.id as typeof intelSubTab)}
                    className={`text-xs px-3 py-1.5 rounded-xl font-semibold transition-all flex items-center gap-1.5 ${
                      intelSubTab === sub.id
                        ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40'
                        : 'bg-zinc-800/60 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 border border-zinc-700/50'
                    }`}
                  >
                    <span>{sub.icon}</span>
                    <span>{sub.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* SUBTAB 0: AUTOMATED ONBOARDING BLUEPRINT */}
            {intelSubTab === 'onboarding' && (
              <div>
                {blueprintLoading ? (
                  <div className="py-12 flex justify-center">
                    <LoadingSpinner
                      size="md"
                      label="Generating AI Onboarding Walkthrough Blueprint..."
                    />
                  </div>
                ) : blueprintError ? (
                  <div className="bg-red-950/30 border border-red-800/50 rounded-2xl p-6 text-sm text-red-300">
                    ⚠ {blueprintError}
                  </div>
                ) : blueprint ? (
                  <OnboardingBlueprintViewer
                    blueprint={blueprint}
                    onFileSelect={(path) => {
                      setFileSearch(path);
                      setActiveTab('files');
                    }}
                    onOpenGraph={(path) => {
                      if (path) {
                        setGraphHighlightNodeIds([path]);
                      }
                      setActiveTab('graph');
                    }}
                    onExplainCode={(path) => {
                      setExplainFilePath(path);
                      setIntelSubTab('explain');
                      setActiveTab('intelligence');
                    }}
                    onInvestigateAI={(targetFile) => {
                      if (targetFile) {
                        setChatQuery(
                          `Investigate repository architecture, dependencies, and code flow for file: ${targetFile}`,
                        );
                      } else {
                        setChatQuery(
                          `Investigate overall repository architecture and component boundaries`,
                        );
                      }
                      setInvestigationContextSource('onboarding');
                      setActiveTab('chat');
                    }}
                    onViewRemediation={() => {
                      setActiveTab('health');
                    }}
                    onNavigateToHealth={() => {
                      setActiveTab('health');
                    }}
                  />
                ) : (
                  <div className="py-8 text-center text-zinc-400 text-sm">
                    No onboarding blueprint available.
                  </div>
                )}
              </div>
            )}

            {/* SUBTAB 1: ARCHITECTURE OVERVIEW */}
            {intelSubTab === 'architecture' && (
              <div className="space-y-6">
                {archLoading ? (
                  <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-8 text-center">
                    <LoadingSpinner size="md" label="Loading repository architecture metrics..." />
                  </div>
                ) : archError ? (
                  <div className="bg-red-950/30 border border-red-800/50 rounded-xl p-4 text-xs text-red-300">
                    ⚠ {archError}
                  </div>
                ) : archOverview ? (
                  <div className="space-y-6">
                    {/* Summary Cards Grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                      <div className="bg-zinc-900/70 border border-zinc-800 rounded-2xl p-4 space-y-1">
                        <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block">
                          Total Files
                        </span>
                        <p className="text-2xl font-extrabold text-white">
                          {archOverview.totalFiles}
                        </p>
                      </div>
                      <div className="bg-zinc-900/70 border border-zinc-800 rounded-2xl p-4 space-y-1">
                        <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block">
                          AST Symbols
                        </span>
                        <p className="text-2xl font-extrabold text-emerald-400">
                          {archOverview.totalSymbols}
                        </p>
                      </div>
                      <div className="bg-zinc-900/70 border border-zinc-800 rounded-2xl p-4 space-y-1">
                        <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block">
                          Internal Imports
                        </span>
                        <p className="text-2xl font-extrabold text-blue-400">
                          {archOverview.internalDependencyCount}
                        </p>
                      </div>
                      <div className="bg-zinc-900/70 border border-zinc-800 rounded-2xl p-4 space-y-1">
                        <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block">
                          External Packages
                        </span>
                        <p className="text-2xl font-extrabold text-purple-400">
                          {archOverview.externalDependencyCount}
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {/* Language Distribution */}
                      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-4">
                        <h3 className="text-xs font-bold text-zinc-300 uppercase tracking-wider flex items-center gap-2">
                          <span>🌐</span> Language Breakdown
                        </h3>
                        <div className="space-y-2.5">
                          {Object.entries(archOverview.languageDistribution)
                            .sort(([, a], [, b]) => b - a)
                            .map(([lang, count]) => {
                              const pct = ((count / (archOverview.totalFiles || 1)) * 100).toFixed(
                                1,
                              );
                              return (
                                <div key={lang} className="space-y-1 text-xs">
                                  <div className="flex items-center justify-between text-zinc-300">
                                    <span className="font-semibold">{lang}</span>
                                    <span className="text-zinc-500 font-mono">
                                      {count} files ({pct}%)
                                    </span>
                                  </div>
                                  <div className="w-full bg-zinc-800 h-1.5 rounded-full overflow-hidden">
                                    <div
                                      className="bg-emerald-400 h-full rounded-full"
                                      style={{ width: `${pct}%` }}
                                    />
                                  </div>
                                </div>
                              );
                            })}
                        </div>
                      </div>

                      {/* Top Directories */}
                      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-4">
                        <h3 className="text-xs font-bold text-zinc-300 uppercase tracking-wider flex items-center gap-2">
                          <span>📁</span> Major Modules & Directories
                        </h3>
                        <div className="space-y-2">
                          {archOverview.topDirectories.map((dir) => (
                            <div
                              key={dir.directory}
                              className="flex items-center justify-between p-2.5 bg-zinc-950/60 border border-zinc-800/80 rounded-xl text-xs"
                            >
                              <span className="font-mono text-purple-300 font-medium">
                                /{dir.directory}
                              </span>
                              <span className="text-zinc-500 font-mono text-[11px] bg-zinc-800 px-2 py-0.5 rounded">
                                {dir.fileCount} file{dir.fileCount !== 1 ? 's' : ''}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {/* Top External Packages */}
                      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-4">
                        <h3 className="text-xs font-bold text-zinc-300 uppercase tracking-wider flex items-center gap-2">
                          <span>📦</span> Most Used External Packages
                        </h3>
                        {archOverview.topExternalPackages.length > 0 ? (
                          <div className="flex flex-wrap gap-2">
                            {archOverview.topExternalPackages.map((pkg) => (
                              <span
                                key={pkg.package}
                                className="bg-zinc-950 border border-zinc-800 text-zinc-300 px-2.5 py-1 rounded-xl text-xs font-mono flex items-center gap-1.5"
                              >
                                <span className="font-semibold text-purple-400">{pkg.package}</span>
                                <span className="text-[10px] bg-zinc-800 text-zinc-500 px-1.5 py-0.2 rounded-full">
                                  {pkg.count}
                                </span>
                              </span>
                            ))}
                          </div>
                        ) : (
                          <p className="text-xs text-zinc-500 italic">
                            No external package dependencies indexed.
                          </p>
                        )}
                      </div>

                      {/* Symbol Kind Distribution */}
                      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-4">
                        <h3 className="text-xs font-bold text-zinc-300 uppercase tracking-wider flex items-center gap-2">
                          <span>🧩</span> Symbol Kinds
                        </h3>
                        <div className="grid grid-cols-2 gap-2">
                          {Object.entries(archOverview.symbolKindDistribution).map(
                            ([kind, count]) => (
                              <div
                                key={kind}
                                className="bg-zinc-950 border border-zinc-800/80 rounded-xl p-2.5 text-xs flex items-center justify-between"
                              >
                                <span className="capitalize text-zinc-300 font-medium">{kind}</span>
                                <span className="font-mono text-emerald-400 font-bold">
                                  {count}
                                </span>
                              </div>
                            ),
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            )}

            {/* SUBTAB 2: EXPLAIN CODE */}
            {intelSubTab === 'explain' && (
              <div className="space-y-5">
                <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-4">
                  <h3 className="text-xs font-bold text-zinc-300 uppercase tracking-wider">
                    Grounded Code Explanation
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block mb-1">
                        File Path *
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. src/services/auth.service.ts"
                        value={explainFilePath}
                        onChange={(e) => setExplainFilePath(e.target.value)}
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-purple-500 font-mono"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block mb-1">
                        Symbol Name (Optional)
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. verifyToken or AuthService"
                        value={explainSymbolName}
                        onChange={(e) => setExplainSymbolName(e.target.value)}
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-purple-500 font-mono"
                      />
                    </div>
                  </div>

                  <Button
                    onClick={() => void handleExplainCode()}
                    disabled={explainLoading || !explainFilePath.trim()}
                    className="bg-purple-500 hover:bg-purple-600 disabled:opacity-40 text-zinc-950 font-bold text-xs h-9 px-4 flex items-center gap-1.5"
                  >
                    {explainLoading ? (
                      <>
                        <LoadingSpinner size="sm" />
                        <span>Synthesizing Explanation...</span>
                      </>
                    ) : (
                      <>
                        <span>💡</span>
                        <span>Explain Code</span>
                      </>
                    )}
                  </Button>
                </div>

                {explainError && (
                  <div className="bg-red-950/30 border border-red-800/50 rounded-xl p-4 text-xs text-red-300">
                    ⚠ {explainError}
                  </div>
                )}

                {explainResult && (
                  <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-4 shadow-xl">
                    <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
                      <div className="space-y-0.5">
                        <span className="text-[10px] font-bold text-purple-400 uppercase tracking-wider">
                          Explanation Result
                        </span>
                        <h4 className="text-sm font-bold text-white font-mono">
                          {explainResult.filePath}
                          {explainResult.symbolName ? ` → ${explainResult.symbolName}` : ''}
                        </h4>
                      </div>
                      <span className="text-[10px] bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded font-mono">
                        via {explainResult.providerUsed}
                      </span>
                    </div>

                    <div className="text-xs text-zinc-300 whitespace-pre-wrap leading-relaxed bg-zinc-950/50 border border-zinc-800/70 rounded-xl p-4">
                      {explainResult.explanation}
                    </div>

                    {/* Source Citations */}
                    {explainResult.sources.length > 0 && (
                      <div className="space-y-2 pt-2">
                        <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block">
                          Source Citations ({explainResult.sources.length})
                        </span>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {explainResult.sources.map((src, idx) => (
                            <div
                              key={idx}
                              className="bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-xs space-y-1"
                            >
                              <div className="flex items-center justify-between font-mono text-[11px]">
                                <span className="font-bold text-purple-300 truncate max-w-[220px]">
                                  {src.filePath}
                                </span>
                                <span className="text-zinc-500">
                                  L{src.startLine}–{src.endLine}
                                </span>
                              </div>
                              <div className="flex items-center justify-between text-[10px]">
                                {src.symbolName ? (
                                  <span className="bg-zinc-800 text-zinc-300 px-1.5 py-0.5 rounded">
                                    {src.symbolKind}: {src.symbolName}
                                  </span>
                                ) : (
                                  <span className="text-zinc-600">Chunk</span>
                                )}
                                <span className="text-emerald-400 font-mono">
                                  {(src.score * 100).toFixed(0)}% match
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* SUBTAB 3: DEPENDENCY INTELLIGENCE */}
            {intelSubTab === 'depintel' && (
              <div className="space-y-5">
                <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-4">
                  <h3 className="text-xs font-bold text-zinc-300 uppercase tracking-wider">
                    File Dependency Intelligence
                  </h3>
                  <div>
                    <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block mb-1">
                      File Path *
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. src/controllers/user.controller.ts"
                      value={depIntelFilePath}
                      onChange={(e) => setDepIntelFilePath(e.target.value)}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-purple-500 font-mono"
                    />
                  </div>

                  <Button
                    onClick={() => void handleFetchDepIntel()}
                    disabled={depIntelLoading || !depIntelFilePath.trim()}
                    className="bg-purple-500 hover:bg-purple-600 disabled:opacity-40 text-zinc-950 font-bold text-xs h-9 px-4 flex items-center gap-1.5"
                  >
                    {depIntelLoading ? (
                      <>
                        <LoadingSpinner size="sm" />
                        <span>Analyzing Imports...</span>
                      </>
                    ) : (
                      <>
                        <span>🔗</span>
                        <span>Analyze Dependencies</span>
                      </>
                    )}
                  </Button>
                </div>

                {depIntelError && (
                  <div className="bg-red-950/30 border border-red-800/50 rounded-xl p-4 text-xs text-red-300">
                    ⚠ {depIntelError}
                  </div>
                )}

                {depIntelResult && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Outgoing Imports */}
                    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-3">
                      <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
                        <h4 className="text-xs font-bold text-zinc-300 uppercase tracking-wider">
                          Outgoing Imports ({depIntelResult.imports.length})
                        </h4>
                        <div className="flex items-center gap-1.5 text-[10px]">
                          <span className="bg-blue-500/20 text-blue-300 px-2 py-0.5 rounded-full">
                            {depIntelResult.internalCount} internal
                          </span>
                          <span className="bg-purple-500/20 text-purple-300 px-2 py-0.5 rounded-full">
                            {depIntelResult.externalCount} external
                          </span>
                        </div>
                      </div>

                      {depIntelResult.imports.length > 0 ? (
                        <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                          {depIntelResult.imports.map((dep) => (
                            <div
                              key={dep.id}
                              className="bg-zinc-950 border border-zinc-800/80 rounded-xl p-2.5 text-xs space-y-1"
                            >
                              <div className="flex items-center justify-between font-mono text-[11px]">
                                <span className="font-semibold text-zinc-200 truncate max-w-[240px]">
                                  {dep.targetPath}
                                </span>
                                <span
                                  className={`text-[9px] px-1.5 py-0.2 rounded font-bold uppercase ${
                                    dep.isExternal
                                      ? 'bg-purple-500/20 text-purple-300'
                                      : 'bg-blue-500/20 text-blue-300'
                                  }`}
                                >
                                  {dep.isExternal ? 'External' : 'Internal'}
                                </span>
                              </div>
                              {dep.importedSymbols.length > 0 && (
                                <div className="text-[10px] text-zinc-500 font-mono truncate">
                                  symbols: {dep.importedSymbols.join(', ')}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-zinc-500 italic py-4">
                          No outgoing imports detected.
                        </p>
                      )}
                    </div>

                    {/* Incoming Imported By */}
                    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-3">
                      <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
                        <h4 className="text-xs font-bold text-zinc-300 uppercase tracking-wider">
                          Imported By ({depIntelResult.importedBy.length})
                        </h4>
                        <span className="text-[10px] text-zinc-500">Dependent files</span>
                      </div>

                      {depIntelResult.importedBy.length > 0 ? (
                        <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                          {depIntelResult.importedBy.map((dep) => (
                            <div
                              key={dep.id}
                              className="bg-zinc-950 border border-zinc-800/80 rounded-xl p-2.5 text-xs font-mono flex items-center justify-between"
                            >
                              <span className="text-emerald-300 truncate max-w-[240px]">
                                {dep.sourcePath}
                              </span>
                              <span className="text-[10px] text-zinc-500 bg-zinc-800 px-1.5 py-0.5 rounded">
                                imports this
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-zinc-500 italic py-4">
                          No indexed files import this file directly.
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* SUBTAB 4: IMPACT ANALYSIS */}
            {intelSubTab === 'impact' && (
              <div className="space-y-5">
                <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-4">
                  <h3 className="text-xs font-bold text-zinc-300 uppercase tracking-wider">
                    Blast Radius & Impact Analysis
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block mb-1">
                        Target File Path *
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. src/services/user.service.ts"
                        value={impactFilePath}
                        onChange={(e) => setImpactFilePath(e.target.value)}
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-purple-500 font-mono"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block mb-1">
                        Symbol Name (Optional)
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. createUser"
                        value={impactSymbolName}
                        onChange={(e) => setImpactSymbolName(e.target.value)}
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-purple-500 font-mono"
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pt-1">
                    <input
                      type="checkbox"
                      id="impact-narrative"
                      checked={impactIncludeExplanation}
                      onChange={(e) => setImpactIncludeExplanation(e.target.checked)}
                      className="rounded border-zinc-700 bg-zinc-950 text-purple-500 focus:ring-purple-500"
                    />
                    <label htmlFor="impact-narrative" className="text-xs text-zinc-400">
                      Generate AI impact narrative via RAG retrieval
                    </label>
                  </div>

                  <Button
                    onClick={() => void handleAnalyzeImpact()}
                    disabled={impactLoading || !impactFilePath.trim()}
                    className="bg-purple-500 hover:bg-purple-600 disabled:opacity-40 text-zinc-950 font-bold text-xs h-9 px-4 flex items-center gap-1.5"
                  >
                    {impactLoading ? (
                      <>
                        <LoadingSpinner size="sm" />
                        <span>Analyzing Blast Radius...</span>
                      </>
                    ) : (
                      <>
                        <span>🎯</span>
                        <span>Analyze Impact</span>
                      </>
                    )}
                  </Button>
                </div>

                {impactError && (
                  <div className="bg-red-950/30 border border-red-800/50 rounded-xl p-4 text-xs text-red-300">
                    ⚠ {impactError}
                  </div>
                )}

                {impactResult && (
                  <div className="space-y-6">
                    {/* Blast Radius Summary Card */}
                    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-4 shadow-xl">
                      <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
                        <div className="space-y-0.5">
                          <span className="text-[10px] font-bold text-purple-400 uppercase tracking-wider">
                            Blast Radius Summary
                          </span>
                          <h4 className="text-sm font-bold text-white font-mono">
                            {impactResult.targetFilePath}
                            {impactResult.targetSymbolName
                              ? ` → ${impactResult.targetSymbolName}`
                              : ''}
                          </h4>
                        </div>
                        <span className="text-xs bg-purple-500/20 text-purple-300 px-3 py-1 rounded-full font-bold">
                          {impactResult.totalAffected} dependent file
                          {impactResult.totalAffected !== 1 ? 's' : ''}
                        </span>
                      </div>

                      {/* AI Impact Narrative */}
                      {impactResult.explanation && (
                        <div className="space-y-2">
                          <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block">
                            AI Impact Narrative
                          </span>
                          <div className="text-xs text-zinc-300 whitespace-pre-wrap leading-relaxed bg-zinc-950/50 border border-zinc-800/70 rounded-xl p-4">
                            {impactResult.explanation}
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {/* Direct Dependent Files */}
                      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-3">
                        <h4 className="text-xs font-bold text-zinc-300 uppercase tracking-wider">
                          Directly Affected Files ({impactResult.directDependents.length})
                        </h4>
                        {impactResult.directDependents.length > 0 ? (
                          <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                            {impactResult.directDependents.map((dep) => (
                              <div
                                key={dep.id}
                                className="bg-zinc-950 border border-zinc-800/80 rounded-xl p-2.5 text-xs font-mono flex items-center justify-between gap-2"
                              >
                                <span className="truncate max-w-[200px] text-emerald-300">
                                  {dep.sourcePath}
                                </span>
                                <div className="flex items-center gap-1 shrink-0 font-sans">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      navigateToTab('time-machine', 'change', {
                                        queryParams: { path: dep.sourcePath },
                                      })
                                    }
                                    className="px-2 py-0.5 text-[10px] font-semibold text-neutral-300 bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 rounded transition-colors"
                                    title="View History in Time Machine"
                                  >
                                    ⏳ History
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      navigateToTab('what-if', 'change', {
                                        queryParams: { sourcePath: dep.sourcePath },
                                      })
                                    }
                                    className="px-2 py-0.5 text-[10px] font-semibold text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 rounded transition-colors"
                                    title="Simulate Change in What-If Simulator"
                                  >
                                    🔮 Simulate
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-xs text-zinc-500 italic py-4">
                            No direct dependent files detected.
                          </p>
                        )}
                      </div>

                      {/* Defined Symbols in Target File */}
                      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-3">
                        <h4 className="text-xs font-bold text-zinc-300 uppercase tracking-wider">
                          Symbols in Target File ({impactResult.affectedSymbols.length})
                        </h4>
                        {impactResult.affectedSymbols.length > 0 ? (
                          <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                            {impactResult.affectedSymbols.map((sym) => (
                              <div
                                key={sym.id}
                                className="bg-zinc-950 border border-zinc-800/80 rounded-xl p-2.5 text-xs font-mono flex items-center justify-between"
                              >
                                <span className="text-zinc-200 font-semibold">{sym.name}</span>
                                <span className="text-[10px] bg-zinc-800 text-zinc-400 px-1.5 py-0.5 rounded capitalize">
                                  {sym.kind}
                                </span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-xs text-zinc-500 italic py-4">
                            No symbols extracted for this file.
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* TAB: AI CODE ASSISTANT (RAG) */}
        {activeTab === 'chat' && (
          <div className="space-y-5">
            {/* Header Card */}
            <div className="bg-gradient-to-br from-zinc-900 via-zinc-900 to-zinc-950 border border-zinc-800 rounded-2xl p-5 shadow-xl">
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 shrink-0 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center text-lg">
                    🤖
                  </div>
                  <div className="space-y-0.5">
                    <h2 className="text-base font-bold text-white leading-tight">
                      Repository AI Assistant
                    </h2>
                    <p className="text-xs text-zinc-400 leading-snug">
                      Grounded answers from{' '}
                      <span className="text-emerald-400 font-semibold">{repository.fullName}</span>{' '}
                      via pgvector semantic retrieval
                    </p>
                    {jobStatus !== 'completed' && (
                      <p className="text-[11px] text-amber-400/80 bg-amber-400/5 border border-amber-400/20 rounded-lg px-2.5 py-1 mt-1.5 inline-block">
                        ⚠ Repository has not been analyzed yet — run AST Analysis first for best
                        results.
                      </p>
                    )}
                  </div>
                </div>

                {/* Clear conversation button */}
                {(chatMessages.length > 0 || chatDbMessages.length > 0) && (
                  <button
                    onClick={() => void handleClearConversation()}
                    disabled={chatClearing}
                    className="text-[11px] text-zinc-400 hover:text-red-400 border border-zinc-700/60 hover:border-red-500/40 bg-zinc-900 hover:bg-red-950/20 px-3 py-1.5 rounded-xl transition-colors font-medium flex items-center gap-1.5 shrink-0"
                  >
                    {chatClearing ? (
                      <>
                        <LoadingSpinner size="sm" />
                        <span>Clearing...</span>
                      </>
                    ) : (
                      <>
                        <span>🗑</span>
                        <span>Clear conversation</span>
                      </>
                    )}
                  </button>
                )}
              </div>

              {/* Suggested Questions */}
              <div className="flex flex-wrap items-center gap-2 pt-4 border-t border-zinc-800/60 mt-4">
                <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">
                  Try asking:
                </span>
                {[
                  'Where is authentication handled?',
                  'Explain the repository architecture',
                  'How does GitHub synchronization work?',
                  'Where is the database connection configured?',
                  'Find the code responsible for repository analysis',
                  'What dependencies does this service use?',
                ].map((promptText) => (
                  <button
                    key={promptText}
                    onClick={() => void handleSendRAGQuery(promptText)}
                    disabled={chatLoading}
                    className="text-[11px] bg-zinc-800/70 hover:bg-zinc-800 border border-zinc-700/50 hover:border-emerald-500/40 text-zinc-300 hover:text-emerald-300 px-2.5 py-1 rounded-full transition-colors font-medium disabled:opacity-40"
                  >
                    {promptText}
                  </button>
                ))}
              </div>

              {/* Pre-populated Context Banner */}
              {investigationContextSource && (
                <div className="flex items-center justify-between bg-cyan-950/40 border border-cyan-500/30 rounded-xl px-4 py-2.5 mt-4 text-xs text-cyan-300">
                  <div className="flex items-center gap-2">
                    <span className="text-base">💡</span>
                    <span>
                      AI Investigation query pre-populated from{' '}
                      <strong className="font-semibold text-cyan-200">
                        {investigationContextSource === 'finding'
                          ? 'Architecture Health Finding'
                          : investigationContextSource === 'onboarding'
                            ? 'Onboarding Blueprint'
                            : 'Dependency Graph Node'}
                      </strong>
                      . You can review or edit the question below before submitting.
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setInvestigationContextSource(null)}
                    className="text-cyan-400 hover:text-cyan-200 text-xs font-bold px-1.5 py-0.5 rounded hover:bg-cyan-900/50"
                  >
                    ✕
                  </button>
                </div>
              )}

              {/* Input Bar */}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void handleSendRAGQuery();
                }}
                className="flex items-center gap-2.5 mt-4"
              >
                <input
                  id="chat-input"
                  type="text"
                  placeholder="Ask a question about this codebase..."
                  value={chatQuery}
                  onChange={(e) => setChatQuery(e.target.value)}
                  disabled={chatLoading}
                  className="bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-emerald-500 flex-1 shadow-inner transition-colors"
                />
                <Button
                  type="submit"
                  disabled={chatLoading || !chatQuery.trim()}
                  className="bg-emerald-500 hover:bg-emerald-600 disabled:opacity-40 text-zinc-950 font-bold text-xs h-10 px-5 shrink-0 transition-all shadow-md flex items-center gap-1.5"
                >
                  {chatLoading ? (
                    <>
                      <LoadingSpinner size="sm" />
                      <span>Thinking...</span>
                    </>
                  ) : (
                    <>
                      <span>Ask AI</span>
                      <span aria-hidden>→</span>
                    </>
                  )}
                </Button>
              </form>
            </div>

            {/* Error Banner */}
            {chatError && (
              <div className="bg-red-950/30 border border-red-800/50 rounded-xl p-4 flex items-start justify-between gap-3">
                <div className="flex items-start gap-2 text-xs text-red-300">
                  <span className="text-base leading-none">⚠</span>
                  <span className="leading-relaxed">{chatError}</span>
                </div>
                {chatLastQuery && (
                  <button
                    onClick={handleRetryLastQuery}
                    disabled={chatLoading}
                    className="text-[11px] font-semibold text-red-400 hover:text-red-300 border border-red-700/50 hover:border-red-600 px-3 py-1 rounded-lg transition-colors shrink-0 whitespace-nowrap"
                  >
                    ↺ Retry
                  </button>
                )}
              </div>
            )}

            {/* History loading spinner */}
            {chatHistoryLoading && (
              <div className="flex items-center justify-center gap-2 py-4 text-zinc-500 text-xs">
                <LoadingSpinner size="sm" />
                <span>Loading conversation history...</span>
              </div>
            )}

            {/* Answer synthesis loading */}
            {chatLoading && (
              <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-2xl p-7 text-center">
                <LoadingSpinner
                  size="md"
                  label="Searching vector embeddings & synthesizing grounded answer..."
                />
              </div>
            )}

            {/* Empty State */}
            {chatMessages.length === 0 &&
              chatDbMessages.length === 0 &&
              !chatLoading &&
              !chatHistoryLoading && (
                <div className="bg-zinc-900/40 border border-zinc-800/60 rounded-2xl p-10 text-center space-y-3">
                  <div className="w-14 h-14 rounded-2xl bg-zinc-800 border border-zinc-700 text-zinc-400 flex items-center justify-center mx-auto text-3xl">
                    💬
                  </div>
                  <h3 className="text-sm font-bold text-zinc-300">No questions asked yet</h3>
                  <p className="text-xs text-zinc-500 max-w-xs mx-auto leading-relaxed">
                    {jobStatus === 'completed'
                      ? 'Ask a question above or click a suggested prompt to explore codebase intelligence.'
                      : 'Run AST Analysis first to index this repository, then ask questions here.'}
                  </p>
                  {jobStatus !== 'completed' && (
                    <Button
                      onClick={handleTriggerAnalysis}
                      disabled={analyzing}
                      className="bg-emerald-500 hover:bg-emerald-600 text-zinc-950 font-bold text-xs h-9 px-4 mt-2"
                    >
                      {analyzing ? 'Analyzing...' : '⚡ Run AST Analysis'}
                    </Button>
                  )}
                </div>
              )}

            {/* Persisted DB History (shown when no in-session messages yet) */}
            {chatMessages.length === 0 && chatDbMessages.length > 0 && !chatLoading && (
              <div className="space-y-4">
                <div className="flex items-center gap-2 px-1">
                  <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">
                    Previous session history
                  </span>
                  <div className="flex-1 h-px bg-zinc-800" />
                </div>
                <div className="space-y-3">
                  {/* Pair up user/assistant messages from DB */}
                  {chatDbMessages
                    .reduce<
                      Array<{
                        user: (typeof chatDbMessages)[0];
                        assistant?: (typeof chatDbMessages)[0];
                      }>
                    >((pairs, msg) => {
                      if (msg.sender === 'user') {
                        pairs.push({ user: msg });
                      } else if (msg.sender === 'assistant' && pairs.length > 0) {
                        const last = pairs[pairs.length - 1];
                        if (last && !last.assistant) {
                          last.assistant = msg;
                        }
                      }
                      return pairs;
                    }, [])
                    .map((pair, idx) => (
                      <div
                        key={idx}
                        className="bg-zinc-900/50 border border-zinc-800/60 rounded-2xl p-5 space-y-3 opacity-80"
                      >
                        <div className="flex items-start gap-2.5 border-b border-zinc-800/60 pb-3">
                          <span className="text-sm bg-zinc-800 p-1.5 rounded-lg text-zinc-400">
                            👤
                          </span>
                          <p className="text-xs font-semibold text-zinc-300 pt-0.5">
                            {pair.user.content}
                          </p>
                        </div>
                        {pair.assistant && (
                          <div className="flex items-start gap-2.5">
                            <span className="text-sm bg-emerald-500/10 border border-emerald-500/20 p-1.5 rounded-lg text-emerald-500">
                              🤖
                            </span>
                            <div className="space-y-2.5 flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-2 flex-wrap">
                                <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider">
                                  ForgeMind AI Answer
                                </span>
                                {typeof pair.assistant.metadata?.['provider'] === 'string' && (
                                  <span className="text-[10px] bg-zinc-800 border border-zinc-700 text-zinc-400 px-2 py-0.5 rounded font-mono">
                                    via {pair.assistant.metadata['provider']}
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-zinc-400 whitespace-pre-wrap leading-relaxed">
                                {pair.assistant.content}
                              </p>
                              {/* Persisted Source Citations from metadata.sources */}
                              {Array.isArray(pair.assistant.metadata?.['sources']) &&
                                (pair.assistant.metadata['sources'] as RAGSourceCitation[]).length >
                                  0 && (
                                  <div className="space-y-2 pt-1">
                                    <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block">
                                      Source Citations —{' '}
                                      {
                                        (pair.assistant.metadata['sources'] as RAGSourceCitation[])
                                          .length
                                      }{' '}
                                      snippet
                                      {(pair.assistant.metadata['sources'] as RAGSourceCitation[])
                                        .length !== 1
                                        ? 's'
                                        : ''}
                                    </span>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                      {(
                                        pair.assistant.metadata['sources'] as RAGSourceCitation[]
                                      ).map((src, srcIdx) => (
                                        <div
                                          key={srcIdx}
                                          onClick={() => {
                                            setFileSearch(src.filePath);
                                            setActiveTab('files');
                                          }}
                                          className="bg-zinc-950 border border-zinc-800 hover:border-emerald-500/50 rounded-xl p-3 text-xs space-y-1.5 transition-colors cursor-pointer"
                                        >
                                          <div className="flex items-start justify-between gap-2">
                                            <span
                                              className="font-mono font-bold text-emerald-300 break-all text-[11px] leading-snug"
                                              title={src.filePath}
                                            >
                                              {src.filePath}
                                            </span>
                                            <span className="text-zinc-500 font-mono text-[11px] shrink-0 whitespace-nowrap">
                                              L{src.startLine}–{src.endLine}
                                            </span>
                                          </div>
                                          <div className="flex items-center justify-between gap-2 flex-wrap">
                                            {src.symbolName ? (
                                              <span className="bg-zinc-800 text-zinc-300 px-1.5 py-0.5 rounded text-[10px] font-mono">
                                                {src.symbolKind ?? 'symbol'}: {src.symbolName}
                                              </span>
                                            ) : (
                                              <span className="text-zinc-600 text-[10px]">
                                                Code chunk
                                              </span>
                                            )}
                                            <span
                                              className={`text-[10px] px-1.5 py-0.5 rounded font-mono font-semibold ${
                                                src.score >= 0.8
                                                  ? 'bg-emerald-500/15 text-emerald-400'
                                                  : src.score >= 0.5
                                                    ? 'bg-amber-500/10 text-amber-400'
                                                    : 'bg-zinc-800 text-zinc-500'
                                              }`}
                                            >
                                              {(src.score * 100).toFixed(0)}% match
                                            </span>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                </div>
                <div className="flex items-center gap-2 px-1">
                  <div className="flex-1 h-px bg-zinc-800" />
                  <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">
                    Current session
                  </span>
                  <div className="flex-1 h-px bg-zinc-800" />
                </div>
              </div>
            )}

            {/* Current Session Messages */}
            {chatMessages.length > 0 && (
              <div className="space-y-5">
                {chatMessages.map((msg) => (
                  <div
                    key={msg.id}
                    className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-4 shadow-lg"
                  >
                    {/* User Question */}
                    <div className="flex items-start gap-3 border-b border-zinc-800/60 pb-3.5">
                      <span className="text-base bg-zinc-800 p-2 rounded-xl text-zinc-300 shrink-0">
                        👤
                      </span>
                      <div className="space-y-0.5 pt-0.5">
                        <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block">
                          Question
                        </span>
                        <p className="text-sm font-semibold text-white">{msg.query}</p>
                      </div>
                    </div>

                    {/* AI Answer */}
                    <div className="flex items-start gap-3">
                      <span className="text-base bg-emerald-500/10 border border-emerald-500/20 p-2 rounded-xl text-emerald-400 shrink-0">
                        🤖
                      </span>
                      <div className="space-y-3 flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider">
                            ForgeMind AI Answer
                          </span>
                          <span className="text-[10px] bg-zinc-800 border border-zinc-700 text-zinc-400 px-2 py-0.5 rounded font-mono">
                            via {msg.providerUsed}
                          </span>
                        </div>

                        <div className="text-xs text-zinc-300 whitespace-pre-wrap leading-relaxed font-sans bg-zinc-950/50 border border-zinc-800/70 rounded-xl p-4">
                          {msg.answer}
                        </div>

                        {/* Source Citations */}
                        {msg.sources.length > 0 && (
                          <div className="space-y-2 pt-1">
                            <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block">
                              Source Citations — {msg.sources.length} relevant snippet
                              {msg.sources.length !== 1 ? 's' : ''}
                            </span>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              {msg.sources.map((src, idx) => (
                                <div
                                  key={idx}
                                  onClick={() => {
                                    setFileSearch(src.filePath);
                                    setActiveTab('files');
                                  }}
                                  className="group bg-zinc-950 border border-zinc-800 hover:border-emerald-500/50 rounded-xl p-3 text-xs space-y-1.5 transition-colors cursor-pointer"
                                >
                                  {/* File path + line range */}
                                  <div className="flex items-start justify-between gap-2">
                                    <span
                                      className="font-mono font-bold text-emerald-300 break-all text-[11px] leading-snug"
                                      title={src.filePath}
                                    >
                                      {src.filePath}
                                    </span>
                                    <span className="text-zinc-500 font-mono text-[11px] shrink-0 whitespace-nowrap">
                                      L{src.startLine}–{src.endLine}
                                    </span>
                                  </div>

                                  {/* Symbol + score row */}
                                  <div className="flex items-center justify-between gap-2 flex-wrap">
                                    {src.symbolName ? (
                                      <span className="bg-zinc-800 text-zinc-300 px-1.5 py-0.5 rounded text-[10px] font-mono">
                                        {src.symbolKind ?? 'symbol'}: {src.symbolName}
                                      </span>
                                    ) : (
                                      <span className="text-zinc-600 text-[10px]">Code chunk</span>
                                    )}
                                    <span
                                      className={`text-[10px] px-1.5 py-0.5 rounded font-mono font-semibold ${
                                        src.score >= 0.8
                                          ? 'bg-emerald-500/15 text-emerald-400'
                                          : src.score >= 0.5
                                            ? 'bg-amber-500/10 text-amber-400'
                                            : 'bg-zinc-800 text-zinc-500'
                                      }`}
                                    >
                                      {(src.score * 100).toFixed(0)}% match
                                    </span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* No sources note */}
                        {msg.sources.length === 0 && (
                          <p className="text-[11px] text-zinc-600 italic">
                            No indexed code chunks matched this query — try running AST Analysis
                            first.
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </ProtectedLayout>
  );
}
