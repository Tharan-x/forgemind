'use client';

// =============================================================================
// ForgeMind Web — Automated Onboarding Blueprint Viewer Component
// =============================================================================

import React, { useState, useEffect } from 'react';
import type {
  OnboardingBlueprint,
  BlueprintTourStep,
  RAGSourceCitation,
  ArchitectureDecision,
} from '@forgemind/types';
import {
  askOnboardingStepQuestion,
  shareOnboardingBlueprint,
  getArchitectureDecisions,
} from '../../lib/intelligence.api';

export interface OnboardingBlueprintViewerProps {
  blueprint: OnboardingBlueprint;
  onFileSelect?: (filePath: string) => void;
  onOpenGraph?: (filePath?: string) => void;
  onExplainCode?: (filePath: string) => void;
  onInvestigateAI?: (queryOrFile?: string) => void;
  onViewRemediation?: (findingIdOrFile?: string) => void;
  onNavigateToHealth?: () => void;
  onViewHistory?: (filePath: string) => void;
}

const OnboardingFileDecisionMemorySection: React.FC<{
  repositoryId: string;
  filePath: string;
}> = ({ repositoryId, filePath }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [fetched, setFetched] = useState(false);
  const [decisions, setDecisions] = useState<ArchitectureDecision[]>([]);
  const [error, setError] = useState<string | null>(null);

  if (!filePath || !filePath.trim()) return null;

  const handleToggle = () => {
    const nextOpen = !isOpen;
    setIsOpen(nextOpen);

    if (nextOpen && !fetched) {
      setLoading(true);
      setError(null);
      const normalizedPath = filePath.trim().replace(/\\/g, '/').replace(/^\//, '');

      getArchitectureDecisions(repositoryId, { path: normalizedPath, limit: 3 })
        .then((res) => {
          setDecisions(res.items || []);
        })
        .catch((err) => {
          setError(err instanceof Error ? err.message : 'Failed to load decisions');
          setDecisions([]);
        })
        .finally(() => {
          setLoading(false);
          setFetched(true);
        });
    }
  };

  return (
    <div className="w-full pt-2">
      <button
        type="button"
        onClick={handleToggle}
        className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 rounded transition-colors"
        title="View Decision Memory for this file"
      >
        📜 Decision Memory
      </button>

      {isOpen && (
        <div className="mt-3 rounded-lg border border-slate-800 bg-slate-950 p-3 text-xs space-y-2 text-left w-full">
          <div className="flex items-center justify-between font-semibold text-slate-300 border-b border-slate-800 pb-1.5">
            <span>📜 Historical Architecture Decisions</span>
            {loading && (
              <span className="text-[11px] text-slate-400 animate-pulse">Loading...</span>
            )}
          </div>

          {error && (
            <p className="text-slate-500 text-[11px]">
              No historical architecture decisions found for this file.
            </p>
          )}

          {!loading && fetched && !error && decisions.length === 0 && (
            <p className="text-slate-500 text-[11px]">
              No historical architecture decisions found for this file.
            </p>
          )}

          {!loading && decisions.length > 0 && (
            <div className="space-y-2">
              {decisions.map((dec) => (
                <div
                  key={dec.id}
                  className="rounded border border-slate-800/80 bg-slate-900/60 p-2.5 text-[11px] space-y-1"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-slate-200">
                      {dec.prTitle || dec.commitMessage || 'Architecture Decision'}
                    </span>
                    <span
                      className={`rounded px-1.5 py-0.5 text-[9px] font-bold uppercase ${
                        dec.isConfirmed
                          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                          : 'bg-slate-700/50 text-slate-300 border border-slate-600/30'
                      }`}
                    >
                      {dec.isConfirmed ? 'Confirmed' : 'Mined'}
                    </span>
                  </div>

                  {(dec.author || dec.committedAt || dec.prNumber) && (
                    <div className="flex flex-wrap items-center gap-2 text-[10px] text-slate-400">
                      {dec.author && <span>Author: {dec.author}</span>}
                      {dec.committedAt && (
                        <span>Date: {new Date(dec.committedAt).toLocaleDateString()}</span>
                      )}
                      {dec.prNumber && dec.prUrl ? (
                        <a
                          href={dec.prUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-cyan-400 hover:underline"
                        >
                          PR #{dec.prNumber}
                        </a>
                      ) : (
                        dec.prNumber && <span>PR #{dec.prNumber}</span>
                      )}
                    </div>
                  )}

                  {dec.synthesis?.rationale ? (
                    <p className="text-slate-300 text-[10px] leading-normal">
                      {dec.synthesis.rationale}
                    </p>
                  ) : (
                    dec.commitMessage && (
                      <p className="text-slate-400 italic text-[10px]">{dec.commitMessage}</p>
                    )
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export interface StepQAThreadItem {
  id: string;
  stepNumber: number;
  query: string;
  answer: string;
  sources: RAGSourceCitation[];
  providerUsed: string;
  timestamp: string;
}

export function generateBlueprintMarkdown(
  blueprint: OnboardingBlueprint,
  completedSteps: Set<number> = new Set(),
  stepQAThreads: Record<number, StepQAThreadItem[]> = {},
): string {
  let healthMd = '';
  if (blueprint.healthSummary) {
    healthMd = `\n## 🛡️ Architectural Health Snapshot\n- **Health Score**: ${blueprint.healthSummary.healthScore}/100\n- **Grade**: ${blueprint.healthSummary.grade}\n- **Total Findings**: ${blueprint.healthSummary.totalFindings}\n- **Critical Findings**: ${blueprint.healthSummary.criticalFindingsCount}\n`;
  }

  let startHereMd = '';
  if (blueprint.startHereFiles && blueprint.startHereFiles.length > 0) {
    startHereMd =
      `\n## 🌟 Recommended Start-Here Files\n` +
      blueprint.startHereFiles
        .map((f) => `- \`${f.path}\` (${f.category}): ${f.reason} [Fan-In: ${f.fanInCount}]`)
        .join('\n') +
      '\n';
  }

  let tasksMd = '';
  if (blueprint.firstExplorationTasks && blueprint.firstExplorationTasks.length > 0) {
    tasksMd =
      `\n## 🎯 First Exploration Tasks\n` +
      blueprint.firstExplorationTasks
        .map(
          (t) =>
            `- **${t.title}** (${t.category}): ${t.description}${t.targetFile ? ` [\`${t.targetFile}\`]` : ''}`,
        )
        .join('\n') +
      '\n';
  }

  const tourMarkdown = (blueprint.guidedTour || [])
    .map((s) => {
      const isDone = completedSteps.has(s.stepNumber);
      const qaItems = stepQAThreads[s.stepNumber] || [];
      const qaMd =
        qaItems.length > 0
          ? `\n**Step Q&A Notes**:\n` +
            qaItems
              .map(
                (q) =>
                  `- **Q**: ${q.query}\n  **A**: ${q.answer}\n  *Sources*: ${
                    (q.sources || [])
                      .map(
                        (src: RAGSourceCitation) =>
                          `\`${src.filePath}:${src.startLine}-${src.endLine}\``,
                      )
                      .join(', ') || 'N/A'
                  }\n`,
              )
              .join('\n')
          : '';

      return `### Step ${s.stepNumber}: ${s.title} ${isDone ? '[COMPLETED ✓]' : '[PENDING]'}\n- **Target File**: \`${s.targetFile}\`\n- **Description**: ${s.description}\n- **Key Takeaway**: ${s.keyTakeaway}${qaMd}\n`;
    })
    .join('\n');

  const entryPointsMd = (blueprint.entryPoints || [])
    .map((e) => `- \`${e.path}\` (${e.name}): ${e.description}`)
    .join('\n');

  const quickstartPrereqs = (blueprint.quickstart?.prerequisites || [])
    .map((p) => `- ${p}`)
    .join('\n');

  const quickstartCmds = (blueprint.quickstart?.setupCommands || []).join('\n');

  return `# Onboarding Blueprint — ${blueprint.repositoryName || 'Repository'}
*Generated at: ${blueprint.generatedAt ? new Date(blueprint.generatedAt).toLocaleString() : new Date().toLocaleString()}*

## 📌 Executive Summary
${blueprint.summary || ''}
${healthMd}${startHereMd}${tasksMd}
## 🚀 Key Entry Points
${entryPointsMd}

## 🗺️ 5-Step Guided Code Tour
${tourMarkdown}

## 🛠️ Quickstart Guide
**Prerequisites**:
${quickstartPrereqs}

**Setup Commands**:
\`\`\`bash
${quickstartCmds}
\`\`\`
`;
}

export function OnboardingBlueprintViewer({
  blueprint,
  onFileSelect,
  onOpenGraph,
  onExplainCode,
  onInvestigateAI,
  onViewRemediation,
  onNavigateToHealth,
  onViewHistory,
}: OnboardingBlueprintViewerProps): React.JSX.Element {
  const [activeStepIndex, setActiveStepIndex] = useState<number>(0);

  // Initialize progress state with localStorage persistence
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(() => {
    if (typeof window === 'undefined') return new Set([1]);
    try {
      const saved = localStorage.getItem(`forgemind_onboarding_progress_${blueprint.repositoryId}`);
      if (saved) {
        const arr = JSON.parse(saved);
        if (Array.isArray(arr) && arr.length > 0) return new Set(arr);
      }
    } catch {
      // Fallback on storage errors
    }
    return new Set([1]);
  });

  const [copiedCommand, setCopiedCommand] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'tour' | 'entrypoints' | 'sections' | 'quickstart'>(
    'tour',
  );

  // Initialize Step-Specific Q&A State with localStorage persistence
  const [stepQAThreads, setStepQAThreads] = useState<Record<number, StepQAThreadItem[]>>(() => {
    if (typeof window === 'undefined') return {};
    try {
      const saved = localStorage.getItem(`forgemind_onboarding_qa_${blueprint.repositoryId}`);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (typeof parsed === 'object' && parsed !== null) return parsed;
      }
    } catch {
      // Fallback on storage errors
    }
    return {};
  });

  const [stepQuery, setStepQuery] = useState<string>('');
  const [stepQALoading, setStepQALoading] = useState<boolean>(false);
  const [stepQAError, setStepQAError] = useState<string | null>(null);

  // Share Blueprint State (Sprint 7 Task 3)
  const [shareModalOpen, setShareModalOpen] = useState<boolean>(false);
  const [shareLoading, setShareLoading] = useState<boolean>(false);
  const [shareError, setShareError] = useState<string | null>(null);
  const [shareResult, setShareResult] = useState<{ shareUrl: string; expiresAt: string } | null>(
    null,
  );
  const [shareIncludeQA, setShareIncludeQA] = useState<boolean>(false);
  const [shareCustomNotes, setShareCustomNotes] = useState<string>('');
  const [shareExpiresInDays, setShareExpiresInDays] = useState<number>(7);
  const [shareCopied, setShareCopied] = useState<boolean>(false);

  // Persist completedSteps changes to localStorage
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(
        `forgemind_onboarding_progress_${blueprint.repositoryId}`,
        JSON.stringify(Array.from(completedSteps)),
      );
    } catch {
      // Ignore quota errors
    }
  }, [completedSteps, blueprint.repositoryId]);

  // Persist stepQAThreads changes to localStorage
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(
        `forgemind_onboarding_qa_${blueprint.repositoryId}`,
        JSON.stringify(stepQAThreads),
      );
    } catch {
      // Ignore quota errors
    }
  }, [stepQAThreads, blueprint.repositoryId]);

  const tourStep: BlueprintTourStep | undefined = blueprint.guidedTour[activeStepIndex];

  const handleStepClick = (index: number) => {
    setActiveStepIndex(index);
    setCompletedSteps((prev) => new Set(prev).add(index + 1));
  };

  const toggleCurrentStepCompletion = (stepNum: number) => {
    setCompletedSteps((prev) => {
      const next = new Set(prev);
      if (next.has(stepNum)) {
        next.delete(stepNum);
      } else {
        next.add(stepNum);
      }
      return next;
    });
  };

  const handleAskStepQuestion = async () => {
    if (!tourStep || !stepQuery.trim() || stepQALoading) return;
    const queryText = stepQuery.trim();
    setStepQALoading(true);
    setStepQAError(null);

    try {
      const res = await askOnboardingStepQuestion(blueprint.repositoryId, {
        stepNumber: tourStep.stepNumber,
        targetFile: tourStep.targetFile,
        query: queryText,
        symbolName: tourStep.symbolName,
      });

      const newItem: StepQAThreadItem = {
        id: `qa-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        stepNumber: tourStep.stepNumber,
        query: queryText,
        answer: res.data.answer,
        sources: res.data.sources || [],
        providerUsed: res.data.providerUsed || 'AI Engine',
        timestamp: new Date().toLocaleTimeString(),
      };

      setStepQAThreads((prev) => ({
        ...prev,
        [tourStep.stepNumber]: [...(prev[tourStep.stepNumber] || []), newItem],
      }));
      setStepQuery('');
    } catch (err) {
      setStepQAError(err instanceof Error ? err.message : 'Failed to retrieve AI answer for step');
    } finally {
      setStepQALoading(false);
    }
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCommand(text);
    setTimeout(() => setCopiedCommand(null), 2000);
  };

  const handleShareBlueprint = async () => {
    setShareLoading(true);
    setShareError(null);
    setShareResult(null);
    try {
      const qaThreadsForShare = shareIncludeQA
        ? Object.fromEntries(
            Object.entries(stepQAThreads).map(([stepNum, items]) => [
              stepNum,
              items.map((i) => ({ query: i.query, answer: i.answer, timestamp: i.timestamp })),
            ]),
          )
        : undefined;

      void qaThreadsForShare; // payload handled server-side via token flag

      const res = await shareOnboardingBlueprint(blueprint.repositoryId, {
        includeQAHistory: shareIncludeQA,
        customNotes: shareCustomNotes.trim() || undefined,
        expiresInDays: shareExpiresInDays,
      });
      setShareResult({ shareUrl: res.data.shareUrl, expiresAt: res.data.expiresAt });
    } catch (err) {
      setShareError(err instanceof Error ? err.message : 'Failed to generate share link');
    } finally {
      setShareLoading(false);
    }
  };

  const handleCopyShareUrl = () => {
    if (!shareResult) return;
    navigator.clipboard.writeText(shareResult.shareUrl);
    setShareCopied(true);
    setTimeout(() => setShareCopied(false), 2000);
  };

  const handleExportMarkdown = () => {
    const mdContent = generateBlueprintMarkdown(blueprint, completedSteps, stepQAThreads);
    if (typeof window === 'undefined' || typeof document === 'undefined') return;

    const blob = new Blob([mdContent], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${blueprint.repositoryName || 'forgemind'}-onboarding-blueprint.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const progressPercentage = Math.round((completedSteps.size / blueprint.guidedTour.length) * 100);

  return (
    <div className="space-y-6 text-slate-100">
      {/* Header & Overview Card */}
      <div className="relative overflow-hidden rounded-xl border border-slate-800 bg-slate-950/80 p-6 shadow-xl backdrop-blur-md">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <div>
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-indigo-500/20 px-3 py-1 text-xs font-semibold text-indigo-400 ring-1 ring-indigo-500/30">
                Sprint 7 AI Engine
              </span>
              <span className="text-xs text-slate-400">Powered by {blueprint.providerUsed}</span>
            </div>
            <h2 className="mt-2 text-2xl font-bold tracking-tight text-white">
              Automated Onboarding Blueprint — {blueprint.repositoryName}
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-300">
              {blueprint.summary}
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setShareModalOpen(true);
                  setShareResult(null);
                  setShareError(null);
                }}
                className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-4 py-2 text-xs font-medium text-white transition-all hover:bg-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 shadow-lg shadow-emerald-700/20"
              >
                🔗 Share Blueprint
              </button>
              <button
                onClick={handleExportMarkdown}
                className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-medium text-white transition-all hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 shadow-lg shadow-indigo-600/20"
              >
                📥 Export Markdown
              </button>
            </div>
            <div className="text-right">
              <span className="text-xs text-slate-400">Tour Completion</span>
              <div className="mt-1 flex items-center gap-2">
                <div className="h-2 w-32 overflow-hidden rounded-full bg-slate-800">
                  <div
                    className="h-full bg-gradient-to-r from-indigo-500 to-emerald-400 transition-all duration-300"
                    style={{ width: `${progressPercentage}%` }}
                  />
                </div>
                <span className="text-xs font-semibold text-emerald-400">
                  {progressPercentage}%
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* HEALTH SNAPSHOT CARD (Task 2) */}
      {blueprint.healthSummary && (
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-800 bg-slate-900/60 p-4 shadow-md backdrop-blur-sm">
          <div className="flex items-center gap-4">
            <div
              className={`flex h-12 w-12 items-center justify-center rounded-xl font-bold text-lg border ${
                ['A+', 'A'].includes(blueprint.healthSummary.grade)
                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                  : ['B+', 'B'].includes(blueprint.healthSummary.grade)
                    ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                    : 'bg-red-500/10 text-red-400 border-red-500/30'
              }`}
            >
              {blueprint.healthSummary.grade}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-white">Architectural Health Snapshot</h3>
                <span className="text-xs text-slate-400">
                  Score: {blueprint.healthSummary.healthScore}/100
                </span>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-slate-300">
                <span>
                  Total Findings:{' '}
                  <strong className="text-zinc-200">{blueprint.healthSummary.totalFindings}</strong>
                </span>
                {blueprint.healthSummary.criticalFindingsCount > 0 && (
                  <span className="font-semibold text-red-400">
                    ⚠️ {blueprint.healthSummary.criticalFindingsCount} Critical
                  </span>
                )}
              </div>
            </div>
          </div>
          {(onNavigateToHealth || onViewRemediation) && (
            <button
              onClick={() => (onNavigateToHealth ? onNavigateToHealth() : onViewRemediation?.())}
              className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3.5 py-1.5 text-xs font-semibold text-amber-300 transition-all hover:bg-amber-500/20"
            >
              🛠 View Architecture Health
            </button>
          )}
        </div>
      )}

      {/* START HERE RECOMMENDED FILES (Task 3) */}
      {blueprint.startHereFiles && blueprint.startHereFiles.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              🌟 Recommended Start Here Files ({blueprint.startHereFiles.length})
            </h3>
            <span className="text-[11px] text-slate-500">Ranked by architectural centrality</span>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {blueprint.startHereFiles.slice(0, 5).map((file) => {
              const categoryColors: Record<string, string> = {
                bootstrap: 'bg-purple-500/10 text-purple-300 border-purple-500/30',
                data_model: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30',
                api_gateway: 'bg-blue-500/10 text-blue-300 border-blue-500/30',
                ui: 'bg-pink-500/10 text-pink-300 border-pink-500/30',
                core_logic: 'bg-amber-500/10 text-amber-300 border-amber-500/30',
              };

              const canView = Boolean(onFileSelect || onExplainCode);

              return (
                <div
                  key={file.path}
                  className="flex flex-col justify-between rounded-xl border border-slate-800 bg-slate-950/60 p-4 transition-all hover:border-slate-700"
                >
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase ${
                          categoryColors[file.category] || categoryColors.core_logic
                        }`}
                      >
                        {file.category.replace('_', ' ')}
                      </span>
                      {file.fanInCount > 0 && (
                        <span className="text-[10px] font-mono text-cyan-400">
                          ⚡ {file.fanInCount} dependent{file.fanInCount === 1 ? '' : 's'}
                        </span>
                      )}
                    </div>
                    <h4 className="mt-2 text-sm font-bold text-white truncate" title={file.name}>
                      {file.name}
                    </h4>
                    <p
                      className="mt-0.5 text-[11px] font-mono text-cyan-400/80 truncate"
                      title={file.path}
                    >
                      {file.path}
                    </p>
                    <p className="mt-2 text-xs text-slate-300 line-clamp-2">{file.reason}</p>
                  </div>
                  <div className="mt-3 border-t border-slate-800/80 pt-2.5 space-y-2">
                    <div className="flex items-center gap-2">
                      {canView && (
                        <button
                          onClick={() => {
                            if (onFileSelect) {
                              onFileSelect(file.path);
                            } else if (onExplainCode) {
                              onExplainCode(file.path);
                            }
                          }}
                          className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-200 transition-all hover:bg-slate-800 hover:text-white"
                        >
                          📄 View File
                        </button>
                      )}
                      {file.path && onViewHistory && (
                        <button
                          onClick={() => onViewHistory(file.path)}
                          className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-medium text-neutral-300 transition-all hover:bg-slate-800 hover:text-white"
                          title="View History in Time Machine"
                        >
                          ⏳ View History
                        </button>
                      )}
                    </div>
                    {file.path && (
                      <OnboardingFileDecisionMemorySection
                        repositoryId={blueprint.repositoryId}
                        filePath={file.path}
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* FIRST EXPLORATION TASKS (Task 4 & 5) */}
      {blueprint.firstExplorationTasks && blueprint.firstExplorationTasks.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              🎯 First Exploration Tasks ({blueprint.firstExplorationTasks.length})
            </h3>
            <span className="text-[11px] text-slate-500">Guided codebase actions</span>
          </div>
          <div className="space-y-2.5">
            {blueprint.firstExplorationTasks.map((task) => {
              const categoryBadges: Record<string, string> = {
                setup: 'bg-blue-500/10 text-blue-300 border-blue-500/30',
                code_flow: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30',
                architecture: 'bg-purple-500/10 text-purple-300 border-purple-500/30',
                health_fix: 'bg-amber-500/10 text-amber-300 border-amber-500/30',
              };

              let actionLabel = 'View File';
              let actionIcon = '📄';
              let handler: (() => void) | undefined = undefined;

              if (task.actionType === 'view_file') {
                actionLabel = 'View File';
                actionIcon = '📄';
                if (task.targetFile && onFileSelect) {
                  handler = () => onFileSelect(task.targetFile!);
                } else if (task.targetFile && onExplainCode) {
                  handler = () => onExplainCode(task.targetFile!);
                }
              } else if (task.actionType === 'open_graph') {
                actionLabel = 'Open Graph';
                actionIcon = '🔍';
                if (onOpenGraph) {
                  handler = () => onOpenGraph(task.targetFile);
                }
              } else if (task.actionType === 'explain_code') {
                actionLabel = 'Explain Code';
                actionIcon = '⚡';
                if (task.targetFile && onExplainCode) {
                  handler = () => onExplainCode(task.targetFile!);
                } else if (task.targetFile && onFileSelect) {
                  handler = () => onFileSelect(task.targetFile!);
                }
              } else if (task.actionType === 'investigate_ai') {
                actionLabel = 'Investigate with AI';
                actionIcon = '🤖';
                if (onInvestigateAI) {
                  handler = () => onInvestigateAI(task.targetFile);
                }
              } else if (task.actionType === 'view_remediation') {
                actionLabel = 'View Fix Plan';
                actionIcon = '🛠';
                if (onViewRemediation) {
                  handler = () => onViewRemediation(task.targetFile);
                } else if (onNavigateToHealth) {
                  handler = () => onNavigateToHealth();
                }
              }

              return (
                <div
                  key={task.taskId}
                  className="flex flex-col justify-between gap-3 rounded-xl border border-slate-800 bg-slate-950/60 p-4 transition-all hover:border-slate-700 sm:flex-row sm:items-center"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span
                        className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase ${
                          categoryBadges[task.category] || categoryBadges.architecture
                        }`}
                      >
                        {task.category.replace('_', ' ')}
                      </span>
                      {task.targetFile && (
                        <span className="text-[11px] font-mono text-cyan-400">
                          {task.targetFile}
                        </span>
                      )}
                    </div>
                    <h4 className="text-sm font-bold text-white">{task.title}</h4>
                    <p className="text-xs text-slate-300">{task.description}</p>
                  </div>
                  <div className="shrink-0 flex items-center gap-2">
                    {handler && (
                      <button
                        onClick={handler}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-3.5 py-1.5 text-xs font-semibold text-slate-200 transition-all hover:bg-slate-800 hover:text-white shadow-sm"
                      >
                        <span>{actionIcon}</span>
                        <span>{actionLabel}</span>
                      </button>
                    )}
                    {task.targetFile && onViewHistory && (
                      <button
                        onClick={() => onViewHistory(task.targetFile!)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-neutral-300 transition-all hover:bg-slate-800 hover:text-white shadow-sm"
                        title="View History in Time Machine"
                      >
                        <span>⏳</span>
                        <span>View History</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Navigation Sub-Tabs */}
      <div className="flex border-b border-slate-800">
        <button
          onClick={() => setActiveTab('tour')}
          className={`px-4 py-2.5 text-xs font-medium border-b-2 transition-colors ${
            activeTab === 'tour'
              ? 'border-indigo-500 text-indigo-400 bg-indigo-500/10'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          🗺️ 5-Step Guided Tour
        </button>
        <button
          onClick={() => setActiveTab('entrypoints')}
          className={`px-4 py-2.5 text-xs font-medium border-b-2 transition-colors ${
            activeTab === 'entrypoints'
              ? 'border-indigo-500 text-indigo-400 bg-indigo-500/10'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          🚀 Entry Points ({blueprint.entryPoints.length})
        </button>
        <button
          onClick={() => setActiveTab('sections')}
          className={`px-4 py-2.5 text-xs font-medium border-b-2 transition-colors ${
            activeTab === 'sections'
              ? 'border-indigo-500 text-indigo-400 bg-indigo-500/10'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          🏗️ Architecture Layers ({blueprint.architecturalSections.length})
        </button>
        <button
          onClick={() => setActiveTab('quickstart')}
          className={`px-4 py-2.5 text-xs font-medium border-b-2 transition-colors ${
            activeTab === 'quickstart'
              ? 'border-indigo-500 text-indigo-400 bg-indigo-500/10'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          ⚡ Developer Quickstart
        </button>
      </div>

      {/* TAB 1: 5-STEP GUIDED CODE TOUR */}
      {activeTab === 'tour' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Step Selector List */}
          <div className="space-y-3 lg:col-span-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Guided Tour Steps
            </h3>
            <div className="space-y-2">
              {blueprint.guidedTour.map((step, idx) => {
                const isActive = activeStepIndex === idx;
                const isDone = completedSteps.has(idx + 1);

                return (
                  <button
                    key={step.stepNumber}
                    onClick={() => handleStepClick(idx)}
                    className={`w-full text-left rounded-lg p-3.5 border transition-all ${
                      isActive
                        ? 'border-indigo-500/60 bg-indigo-500/15 text-white ring-1 ring-indigo-500/40 shadow-lg'
                        : 'border-slate-800/80 bg-slate-950/40 text-slate-300 hover:border-slate-700 hover:bg-slate-900/60'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-2 text-xs font-bold">
                        <span
                          className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] ${
                            isDone
                              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                              : 'bg-slate-800 text-slate-400'
                          }`}
                        >
                          {isDone ? '✓' : step.stepNumber}
                        </span>
                        Step {step.stepNumber}
                      </span>
                      <span className="text-[10px] font-mono text-slate-400 truncate max-w-[120px]">
                        {step.targetFile.split('/').pop()}
                      </span>
                    </div>
                    <p className="mt-1.5 text-xs font-semibold line-clamp-1">{step.title}</p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Active Step Detailed Content */}
          <div className="lg:col-span-8">
            {tourStep && (
              <div className="rounded-xl border border-slate-800 bg-slate-950/90 p-6 shadow-xl backdrop-blur-sm">
                <div className="flex items-center justify-between border-b border-slate-800 pb-4">
                  <div>
                    <span className="text-xs font-bold text-indigo-400">
                      Step {tourStep.stepNumber} of 5
                    </span>
                    <h3 className="text-xl font-bold text-white mt-1">{tourStep.title}</h3>
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => toggleCurrentStepCompletion(tourStep.stepNumber)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                        completedSteps.has(tourStep.stepNumber)
                          ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                          : 'bg-slate-900 text-slate-300 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      {completedSteps.has(tourStep.stepNumber) ? '✓ Completed' : 'Mark Complete'}
                    </button>
                    {onFileSelect && (
                      <button
                        onClick={() => onFileSelect(tourStep.targetFile)}
                        className="text-xs font-medium text-indigo-400 hover:text-indigo-300 underline"
                      >
                        View File →
                      </button>
                    )}
                    {tourStep.targetFile && onViewHistory && (
                      <button
                        onClick={() => onViewHistory(tourStep.targetFile)}
                        className="text-xs font-medium text-neutral-300 hover:text-white underline"
                        title="View History in Time Machine"
                      >
                        ⏳ View History →
                      </button>
                    )}
                  </div>
                </div>

                <div className="mt-4 space-y-4">
                  <div>
                    <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                      Target File
                    </label>
                    <p className="mt-1 rounded-md bg-slate-900 px-3 py-2 font-mono text-xs font-semibold text-emerald-400 border border-slate-800">
                      {tourStep.targetFile}
                      {tourStep.symbolName && (
                        <span className="ml-2 text-indigo-400">:: {tourStep.symbolName}</span>
                      )}
                    </p>
                  </div>

                  <div>
                    <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                      Architectural Overview
                    </label>
                    <p className="mt-1 text-sm leading-relaxed text-slate-200">
                      {tourStep.description}
                    </p>
                  </div>

                  <div className="rounded-lg border border-indigo-500/20 bg-indigo-500/10 p-4">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-indigo-400">
                      💡 Key Developer Takeaway
                    </h4>
                    <p className="mt-1 text-xs text-indigo-200 font-medium">
                      {tourStep.keyTakeaway}
                    </p>
                  </div>

                  {/* Step-Specific Grounded AI Q&A Panel */}
                  <div className="mt-6 rounded-lg border border-slate-800 bg-slate-900/80 p-4">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-indigo-400 flex items-center gap-1.5">
                        🤖 Step-Grounded AI Q&A Assistant
                      </h4>
                      <span className="text-[10px] text-slate-400 font-mono">
                        Grounded in {tourStep.targetFile}
                      </span>
                    </div>

                    {/* Q&A Thread Items for this Step */}
                    {(stepQAThreads[tourStep.stepNumber] || []).length > 0 && (
                      <div className="mt-3 space-y-3 max-h-64 overflow-y-auto pr-1">
                        {(stepQAThreads[tourStep.stepNumber] || []).map((item) => (
                          <div
                            key={item.id}
                            className="rounded-md border border-slate-800 bg-slate-950 p-3 text-xs"
                          >
                            <div className="flex items-center justify-between text-[10px] text-slate-400">
                              <span className="font-bold text-indigo-300">Q: {item.query}</span>
                              <span>{item.timestamp}</span>
                            </div>
                            <p className="mt-2 text-slate-200 leading-relaxed font-sans">
                              {item.answer}
                            </p>
                            {item.sources.length > 0 && (
                              <div className="mt-2 pt-2 border-t border-slate-800/80 flex flex-wrap gap-1.5">
                                <span className="text-[10px] font-semibold text-slate-400">
                                  Sources:
                                </span>
                                {item.sources.map((src: RAGSourceCitation, i: number) => (
                                  <span
                                    key={i}
                                    onClick={() => onFileSelect && onFileSelect(src.filePath)}
                                    className="cursor-pointer rounded bg-slate-900 border border-slate-800 px-1.5 py-0.5 text-[10px] font-mono text-emerald-400 hover:border-emerald-500/50"
                                  >
                                    {src.filePath}:{src.startLine}-{src.endLine}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {stepQAError && (
                      <div className="mt-2 rounded bg-rose-500/10 border border-rose-500/30 p-2 text-xs text-rose-300">
                        {stepQAError}
                      </div>
                    )}

                    {/* Query Input */}
                    <div className="mt-3 flex gap-2">
                      <input
                        type="text"
                        value={stepQuery}
                        onChange={(e) => setStepQuery(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleAskStepQuestion()}
                        placeholder={`Ask a question about Step ${tourStep.stepNumber} (${tourStep.targetFile.split('/').pop()})...`}
                        className="flex-1 rounded-lg bg-slate-950 border border-slate-800 px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 font-sans"
                      />
                      <button
                        disabled={stepQALoading || !stepQuery.trim()}
                        onClick={handleAskStepQuestion}
                        className="rounded-lg bg-indigo-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                      >
                        {stepQALoading ? 'Asking...' : 'Ask AI'}
                      </button>
                    </div>
                  </div>

                  {/* Tour Navigation Controls */}
                  <div className="flex justify-between border-t border-slate-800 pt-4 mt-6">
                    <button
                      disabled={activeStepIndex === 0}
                      onClick={() => handleStepClick(activeStepIndex - 1)}
                      className="px-4 py-2 rounded-lg text-xs font-medium bg-slate-900 border border-slate-800 text-slate-300 hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      ← Previous Step
                    </button>
                    <button
                      disabled={activeStepIndex === blueprint.guidedTour.length - 1}
                      onClick={() => handleStepClick(activeStepIndex + 1)}
                      className="px-4 py-2 rounded-lg text-xs font-medium bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed shadow-md"
                    >
                      Next Step →
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: KEY ENTRY POINTS */}
      {activeTab === 'entrypoints' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {blueprint.entryPoints.map((ep) => (
            <div
              key={ep.path}
              className="rounded-xl border border-slate-800 bg-slate-950/70 p-5 hover:border-slate-700 transition-all"
            >
              <div className="flex items-center justify-between">
                <span className="rounded-md bg-emerald-500/15 px-2.5 py-1 text-[11px] font-bold text-emerald-400 border border-emerald-500/30">
                  {ep.type.toUpperCase()}
                </span>
                <div className="flex items-center gap-3">
                  {onFileSelect && (
                    <button
                      onClick={() => onFileSelect(ep.path)}
                      className="text-xs text-indigo-400 hover:underline"
                    >
                      Inspect File →
                    </button>
                  )}
                  {ep.path && onViewHistory && (
                    <button
                      onClick={() => onViewHistory(ep.path)}
                      className="text-xs text-neutral-300 hover:text-white underline"
                      title="View History in Time Machine"
                    >
                      ⏳ View History →
                    </button>
                  )}
                </div>
              </div>
              <h4 className="mt-3 text-base font-bold text-white">{ep.name}</h4>
              <p className="mt-1 font-mono text-xs text-slate-300 break-all">{ep.path}</p>
              <p className="mt-2 text-xs text-slate-400 leading-relaxed">{ep.description}</p>
              {ep.path && (
                <OnboardingFileDecisionMemorySection
                  repositoryId={blueprint.repositoryId}
                  filePath={ep.path}
                />
              )}
            </div>
          ))}
        </div>
      )}

      {/* TAB 3: ARCHITECTURE LAYERS */}
      {activeTab === 'sections' && (
        <div className="space-y-4">
          {blueprint.architecturalSections.map((sec) => (
            <div key={sec.title} className="rounded-xl border border-slate-800 bg-slate-950/70 p-5">
              <div className="flex items-center justify-between">
                <h4 className="text-base font-bold text-white">{sec.title}</h4>
                <span className="text-xs text-indigo-400 font-mono">{sec.files.length} Files</span>
              </div>
              <p className="mt-1 text-xs text-slate-300">{sec.summary}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {sec.files.map((file) => (
                  <span
                    key={file}
                    onClick={() => onFileSelect && onFileSelect(file)}
                    className="cursor-pointer rounded-md bg-slate-900 border border-slate-800 px-2.5 py-1 text-[11px] font-mono text-slate-300 hover:text-indigo-400 hover:border-indigo-500/50 transition-colors"
                  >
                    {file}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* TAB 4: DEVELOPER QUICKSTART */}
      {activeTab === 'quickstart' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Prerequisites */}
          <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-5">
            <h4 className="text-sm font-bold text-white flex items-center gap-2">
              📋 Prerequisites
            </h4>
            <ul className="mt-3 space-y-2 text-xs text-slate-300">
              {blueprint.quickstart.prerequisites.map((req) => (
                <li key={req} className="flex items-center gap-2">
                  <span className="text-emerald-400">✓</span> {req}
                </li>
              ))}
            </ul>

            <h4 className="mt-6 text-sm font-bold text-white flex items-center gap-2">
              🔑 Key Environment Variables
            </h4>
            <div className="mt-3 flex flex-wrap gap-2">
              {blueprint.quickstart.keyEnvironmentVars.map((env) => (
                <span
                  key={env}
                  className="rounded-md bg-slate-900 border border-slate-800 px-2.5 py-1 text-xs font-mono text-amber-400"
                >
                  {env}
                </span>
              ))}
            </div>
          </div>

          {/* Setup Commands */}
          <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-5">
            <h4 className="text-sm font-bold text-white flex items-center gap-2">
              🚀 Setup Commands
            </h4>
            <div className="mt-3 space-y-2">
              {blueprint.quickstart.setupCommands.map((cmd) => (
                <div
                  key={cmd}
                  className="group flex items-center justify-between rounded-lg bg-slate-900 border border-slate-800 px-3.5 py-2.5 font-mono text-xs text-emerald-400"
                >
                  <span>$ {cmd}</span>
                  <button
                    onClick={() => handleCopy(cmd)}
                    className="text-[11px] text-slate-400 hover:text-white transition-colors"
                  >
                    {copiedCommand === cmd ? 'Copied!' : 'Copy'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Share Blueprint Modal (Sprint 7 Task 3) */}
      {shareModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-950 p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-white">🔗 Share Onboarding Blueprint</h3>
              <button
                onClick={() => setShareModalOpen(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                aria-label="Close share modal"
              >
                ✕
              </button>
            </div>

            {!shareResult ? (
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Expiry (days, 1–30)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={30}
                    value={shareExpiresInDays}
                    onChange={(e) =>
                      setShareExpiresInDays(Math.min(30, Math.max(1, Number(e.target.value))))
                    }
                    className="w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-xs text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Custom notes for team (optional, max 2000 chars)
                  </label>
                  <textarea
                    value={shareCustomNotes}
                    onChange={(e) => setShareCustomNotes(e.target.value.substring(0, 2000))}
                    rows={3}
                    className="w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-xs text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 resize-none"
                    placeholder="Add onboarding notes for your team..."
                  />
                </div>
                <div className="flex items-center gap-2">
                  <input
                    id="share-include-qa"
                    type="checkbox"
                    checked={shareIncludeQA}
                    onChange={(e) => setShareIncludeQA(e.target.checked)}
                    className="rounded border-slate-600"
                  />
                  <label htmlFor="share-include-qa" className="text-xs text-slate-300">
                    Include step Q&amp;A history
                  </label>
                </div>
                {shareError && (
                  <p className="text-xs text-red-400 bg-red-900/20 rounded-lg px-3 py-2 border border-red-800/40">
                    ❌ {shareError}
                  </p>
                )}
                <button
                  onClick={handleShareBlueprint}
                  disabled={shareLoading}
                  className="w-full rounded-lg bg-emerald-700 px-4 py-2.5 text-xs font-medium text-white transition-all hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {shareLoading ? '⏳ Generating share link…' : '🔗 Generate Share Link'}
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-xs text-emerald-400 font-medium">
                  ✓ Share link generated successfully!
                </p>
                <div className="rounded-lg bg-slate-900 border border-slate-700 px-3 py-2">
                  <p className="text-[10px] text-slate-400 mb-1">
                    Share URL (expires {new Date(shareResult.expiresAt).toLocaleDateString()})
                  </p>
                  <p className="text-xs text-slate-100 break-all font-mono">
                    {shareResult.shareUrl}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleCopyShareUrl}
                    className="flex-1 rounded-lg bg-indigo-700 px-4 py-2 text-xs font-medium text-white transition-all hover:bg-indigo-600"
                  >
                    {shareCopied ? '✓ Copied!' : '📋 Copy URL'}
                  </button>
                  <button
                    onClick={() => setShareResult(null)}
                    className="rounded-lg border border-slate-700 px-4 py-2 text-xs font-medium text-slate-300 transition-all hover:bg-slate-800"
                  >
                    Generate New
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
