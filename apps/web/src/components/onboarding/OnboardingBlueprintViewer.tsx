'use client';

// =============================================================================
// ForgeMind Web — Automated Onboarding Blueprint Viewer Component
// =============================================================================

import React, { useState, useEffect } from 'react';
import type { OnboardingBlueprint, BlueprintTourStep, RAGSourceCitation } from '@forgemind/types';
import { askOnboardingStepQuestion } from '../../lib/intelligence.api';

interface OnboardingBlueprintViewerProps {
  blueprint: OnboardingBlueprint;
  onFileSelect?: (filePath: string) => void;
}

interface StepQAThreadItem {
  id: string;
  stepNumber: number;
  query: string;
  answer: string;
  sources: RAGSourceCitation[];
  providerUsed: string;
  timestamp: string;
}

export function OnboardingBlueprintViewer({
  blueprint,
  onFileSelect,
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

  const handleExportMarkdown = () => {
    const tourMarkdown = blueprint.guidedTour
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
                      q.sources
                        .map((src) => `\`${src.filePath}:${src.startLine}-${src.endLine}\``)
                        .join(', ') || 'N/A'
                    }\n`,
                )
                .join('\n')
            : '';

        return `### Step ${s.stepNumber}: ${s.title} ${isDone ? '[COMPLETED ✓]' : '[PENDING]'}\n- **Target File**: \`${s.targetFile}\`\n- **Description**: ${s.description}\n- **Key Takeaway**: ${s.keyTakeaway}${qaMd}\n`;
      })
      .join('\n');

    const mdContent = `# Onboarding Blueprint — ${blueprint.repositoryName}
*Generated at: ${new Date(blueprint.generatedAt).toLocaleString()}*

## 📌 Executive Summary
${blueprint.summary}

## 🚀 Key Entry Points
${blueprint.entryPoints.map((e) => `- \`${e.path}\` (${e.name}): ${e.description}`).join('\n')}

## 🗺️ 5-Step Guided Code Tour
${tourMarkdown}

## 🛠️ Quickstart Guide
**Prerequisites**:
${blueprint.quickstart.prerequisites.map((p) => `- ${p}`).join('\n')}

**Setup Commands**:
\`\`\`bash
${blueprint.quickstart.setupCommands.join('\n')}
\`\`\`
`;

    const blob = new Blob([mdContent], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${blueprint.repositoryName}-onboarding-blueprint.md`;
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
            <button
              onClick={handleExportMarkdown}
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-medium text-white transition-all hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 shadow-lg shadow-indigo-600/20"
            >
              📥 Export Markdown
            </button>
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
                                {item.sources.map((src, i) => (
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
                {onFileSelect && (
                  <button
                    onClick={() => onFileSelect(ep.path)}
                    className="text-xs text-indigo-400 hover:underline"
                  >
                    Inspect File →
                  </button>
                )}
              </div>
              <h4 className="mt-3 text-base font-bold text-white">{ep.name}</h4>
              <p className="mt-1 font-mono text-xs text-slate-300 break-all">{ep.path}</p>
              <p className="mt-2 text-xs text-slate-400 leading-relaxed">{ep.description}</p>
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
    </div>
  );
}
