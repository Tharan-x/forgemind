'use client';

// =============================================================================
// ForgeMind Web — Public Shared Onboarding Blueprint Viewer Component
// =============================================================================

import React, { useState } from 'react';
import type { SharedBlueprintView, BlueprintTourStep } from '@forgemind/types';

export interface SharedBlueprintViewerProps {
  sharedBlueprint: SharedBlueprintView;
}

export function SharedBlueprintViewer({
  sharedBlueprint,
}: SharedBlueprintViewerProps): React.JSX.Element {
  const [activeStepIndex, setActiveStepIndex] = useState<number>(0);
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set([1]));
  const [copiedCommand, setCopiedCommand] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'tour' | 'entrypoints' | 'sections' | 'quickstart'>(
    'tour',
  );

  const tourStep: BlueprintTourStep | undefined = sharedBlueprint.guidedTour[activeStepIndex];

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

  const handleCopy = (text: string) => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(text);
      setCopiedCommand(text);
      setTimeout(() => setCopiedCommand(null), 2000);
    }
  };

  const handleExportMarkdown = () => {
    let healthMd = '';
    if (sharedBlueprint.healthSummary) {
      healthMd = `\n## 🛡️ Architectural Health Snapshot\n- **Health Score**: ${sharedBlueprint.healthSummary.healthScore}/100\n- **Grade**: ${sharedBlueprint.healthSummary.grade}\n- **Total Findings**: ${sharedBlueprint.healthSummary.totalFindings}\n- **Critical Findings**: ${sharedBlueprint.healthSummary.criticalFindingsCount}\n`;
    }

    let startHereMd = '';
    if (sharedBlueprint.startHereFiles && sharedBlueprint.startHereFiles.length > 0) {
      startHereMd =
        `\n## 🌟 Recommended Start-Here Files\n` +
        sharedBlueprint.startHereFiles
          .map((f) => `- \`${f.path}\` (${f.category}): ${f.reason} [Fan-In: ${f.fanInCount}]`)
          .join('\n') +
        '\n';
    }

    let tasksMd = '';
    if (sharedBlueprint.firstExplorationTasks && sharedBlueprint.firstExplorationTasks.length > 0) {
      tasksMd =
        `\n## 🎯 First Exploration Tasks\n` +
        sharedBlueprint.firstExplorationTasks
          .map(
            (t) =>
              `- **${t.title}** (${t.category}): ${t.description}${t.targetFile ? ` [\`${t.targetFile}\`]` : ''}`,
          )
          .join('\n') +
        '\n';
    }

    const tourMarkdown = sharedBlueprint.guidedTour
      .map((s) => {
        const isDone = completedSteps.has(s.stepNumber);
        const qaItems = sharedBlueprint.qaThreads?.[s.stepNumber] || [];
        const qaMd =
          qaItems.length > 0
            ? `\n**Included Q&A Notes**:\n` +
              qaItems.map((q) => `- **Q**: ${q.query}\n  **A**: ${q.answer}\n`).join('\n')
            : '';

        return `### Step ${s.stepNumber}: ${s.title} ${isDone ? '[COMPLETED ✓]' : '[PENDING]'}\n- **Target File**: \`${s.targetFile}\`\n- **Description**: ${s.description}\n- **Key Takeaway**: ${s.keyTakeaway}${qaMd}\n`;
      })
      .join('\n');

    const notesMd = sharedBlueprint.customNotes
      ? `\n## 📝 Author Notes\n${sharedBlueprint.customNotes}\n`
      : '';

    const mdContent = `# Shared Onboarding Blueprint — ${sharedBlueprint.repositoryName}
*Generated at: ${new Date(sharedBlueprint.generatedAt).toLocaleString()}*
*Expires at: ${new Date(sharedBlueprint.expiresAt).toLocaleDateString()}*
${notesMd}
## 📌 Executive Summary
${sharedBlueprint.summary}
${healthMd}${startHereMd}${tasksMd}
## 🚀 Key Entry Points
${sharedBlueprint.entryPoints.map((e) => `- \`${e.path}\` (${e.name}): ${e.description}`).join('\n')}

## 🗺️ 5-Step Guided Code Tour
${tourMarkdown}

## 🛠️ Quickstart Guide
**Prerequisites**:
${sharedBlueprint.quickstart.prerequisites.map((p) => `- ${p}`).join('\n')}

**Setup Commands**:
\`\`\`bash
${sharedBlueprint.quickstart.setupCommands.join('\n')}
\`\`\`
`;

    const blob = new Blob([mdContent], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${sharedBlueprint.repositoryName}-shared-onboarding-blueprint.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const progressPercentage = Math.round(
    (completedSteps.size / sharedBlueprint.guidedTour.length) * 100,
  );

  const formattedExpiration = new Date(sharedBlueprint.expiresAt).toLocaleDateString();

  return (
    <div className="space-y-6 text-slate-100">
      {/* Header & Shared Overview Card */}
      <div className="relative overflow-hidden rounded-xl border border-slate-800 bg-slate-950/80 p-6 shadow-xl backdrop-blur-md">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-semibold text-emerald-400 ring-1 ring-emerald-500/30">
                🔗 Shared Blueprint
              </span>
              <span className="rounded-full bg-indigo-500/10 px-2.5 py-0.5 text-xs text-indigo-300 border border-indigo-500/20">
                Expires {formattedExpiration}
              </span>
            </div>
            <h2 className="mt-2 text-2xl font-bold tracking-tight text-white">
              Shared Onboarding Blueprint — {sharedBlueprint.repositoryName}
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-300">
              {sharedBlueprint.summary}
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

        {/* Custom Author Notes Banner */}
        {sharedBlueprint.customNotes && (
          <div className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3.5">
            <h3 className="text-xs font-bold uppercase tracking-wider text-amber-300 flex items-center gap-1.5">
              📝 Author Note
            </h3>
            <p className="mt-1 text-xs text-amber-200 leading-relaxed">
              {sharedBlueprint.customNotes}
            </p>
          </div>
        )}
      </div>

      {/* HEALTH SNAPSHOT CARD */}
      {sharedBlueprint.healthSummary && (
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-800 bg-slate-900/60 p-4 shadow-md backdrop-blur-sm">
          <div className="flex items-center gap-4">
            <div
              className={`flex h-12 w-12 items-center justify-center rounded-xl font-bold text-lg border ${
                ['A+', 'A'].includes(sharedBlueprint.healthSummary.grade)
                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                  : ['B+', 'B'].includes(sharedBlueprint.healthSummary.grade)
                    ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                    : 'bg-red-500/10 text-red-400 border-red-500/30'
              }`}
            >
              {sharedBlueprint.healthSummary.grade}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-white">Architectural Health Snapshot</h3>
                <span className="text-xs text-slate-400">
                  Score: {sharedBlueprint.healthSummary.healthScore}/100
                </span>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-slate-300">
                <span>
                  Total Findings:{' '}
                  <strong className="text-zinc-200">
                    {sharedBlueprint.healthSummary.totalFindings}
                  </strong>
                </span>
                {sharedBlueprint.healthSummary.criticalFindingsCount > 0 && (
                  <span className="font-semibold text-red-400">
                    ⚠️ {sharedBlueprint.healthSummary.criticalFindingsCount} Critical
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* START HERE RECOMMENDED FILES */}
      {sharedBlueprint.startHereFiles && sharedBlueprint.startHereFiles.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              🌟 Recommended Start Here Files ({sharedBlueprint.startHereFiles.length})
            </h3>
            <span className="text-[11px] text-slate-500">Ranked by architectural centrality</span>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {sharedBlueprint.startHereFiles.slice(0, 5).map((file) => {
              const categoryColors: Record<string, string> = {
                bootstrap: 'bg-purple-500/10 text-purple-300 border-purple-500/30',
                data_model: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30',
                api_gateway: 'bg-blue-500/10 text-blue-300 border-blue-500/30',
                ui: 'bg-pink-500/10 text-pink-300 border-pink-500/30',
                core_logic: 'bg-amber-500/10 text-amber-300 border-amber-500/30',
              };

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
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* FIRST EXPLORATION TASKS */}
      {sharedBlueprint.firstExplorationTasks &&
        sharedBlueprint.firstExplorationTasks.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                🎯 First Exploration Tasks ({sharedBlueprint.firstExplorationTasks.length})
              </h3>
              <span className="text-[11px] text-slate-500">Guided codebase actions</span>
            </div>
            <div className="space-y-2.5">
              {sharedBlueprint.firstExplorationTasks.map((task) => {
                const categoryBadges: Record<string, string> = {
                  setup: 'bg-blue-500/10 text-blue-300 border-blue-500/30',
                  code_flow: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30',
                  architecture: 'bg-purple-500/10 text-purple-300 border-purple-500/30',
                  health_fix: 'bg-amber-500/10 text-amber-300 border-amber-500/30',
                };

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
          🚀 Entry Points ({sharedBlueprint.entryPoints.length})
        </button>
        <button
          onClick={() => setActiveTab('sections')}
          className={`px-4 py-2.5 text-xs font-medium border-b-2 transition-colors ${
            activeTab === 'sections'
              ? 'border-indigo-500 text-indigo-400 bg-indigo-500/10'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          🏗️ Architecture Layers ({sharedBlueprint.architecturalSections.length})
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
              {sharedBlueprint.guidedTour.map((step, idx) => {
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
                      Step {tourStep.stepNumber} of {sharedBlueprint.guidedTour.length}
                    </span>
                    <h3 className="text-xl font-bold text-white mt-1">{tourStep.title}</h3>
                  </div>
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

                  {/* Shared Q&A Thread Items for this Step */}
                  {(() => {
                    const stepQAItems = sharedBlueprint.qaThreads?.[tourStep.stepNumber];
                    if (!stepQAItems || stepQAItems.length === 0) return null;
                    return (
                      <div className="mt-6 rounded-lg border border-slate-800 bg-slate-900/80 p-4">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-indigo-400 flex items-center gap-1.5">
                          💬 Included Q&A History
                        </h4>
                        <div className="mt-3 space-y-3">
                          {stepQAItems.map((qa, index) => (
                            <div
                              key={index}
                              className="rounded-lg border border-slate-800 bg-slate-950 p-3 space-y-1.5"
                            >
                              <p className="text-xs font-semibold text-indigo-300">Q: {qa.query}</p>
                              <p className="text-xs text-slate-200 leading-relaxed whitespace-pre-wrap">
                                {qa.answer}
                              </p>
                              <span className="text-[10px] text-slate-500 block text-right">
                                {qa.timestamp}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: KEY ENTRY POINTS */}
      {activeTab === 'entrypoints' && (
        <div className="space-y-4">
          <h3 className="text-sm font-bold text-white uppercase tracking-wider">
            🚀 System Entry Points ({sharedBlueprint.entryPoints.length})
          </h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {sharedBlueprint.entryPoints.map((entry) => (
              <div
                key={entry.path}
                className="rounded-xl border border-slate-800 bg-slate-950/80 p-4 shadow-md backdrop-blur-sm"
              >
                <div className="flex items-center justify-between">
                  <span className="rounded-md bg-indigo-500/20 px-2 py-0.5 text-[10px] font-semibold text-indigo-300 border border-indigo-500/30">
                    {entry.type}
                  </span>
                  <span className="text-xs font-mono text-emerald-400">{entry.name}</span>
                </div>
                <p className="mt-2 text-xs font-mono text-slate-300 bg-slate-900 px-2.5 py-1.5 rounded border border-slate-800">
                  {entry.path}
                </p>
                <p className="mt-2 text-xs text-slate-400 leading-relaxed">{entry.description}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 3: ARCHITECTURE LAYERS */}
      {activeTab === 'sections' && (
        <div className="space-y-4">
          <h3 className="text-sm font-bold text-white uppercase tracking-wider">
            🏗️ Architectural Component Layers ({sharedBlueprint.architecturalSections.length})
          </h3>
          <div className="grid grid-cols-1 gap-4">
            {sharedBlueprint.architecturalSections.map((sec) => (
              <div
                key={sec.title}
                className="rounded-xl border border-slate-800 bg-slate-950/80 p-5 shadow-md"
              >
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-bold text-white">{sec.title}</h4>
                  <span className="rounded-full bg-slate-800 px-2.5 py-0.5 text-[10px] font-semibold text-slate-300">
                    {sec.category}
                  </span>
                </div>
                <p className="mt-2 text-xs text-slate-300 leading-relaxed">{sec.summary}</p>
                {sec.files.length > 0 && (
                  <div className="mt-3">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      Files in Layer:
                    </span>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {sec.files.map((file) => (
                        <span
                          key={file}
                          className="rounded bg-slate-900 px-2 py-0.5 text-[10px] font-mono text-cyan-400 border border-slate-800"
                        >
                          {file}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 4: DEVELOPER QUICKSTART */}
      {activeTab === 'quickstart' && (
        <div className="space-y-6">
          <h3 className="text-sm font-bold text-white uppercase tracking-wider">
            ⚡ Developer Quickstart Guide
          </h3>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            {/* Prerequisites */}
            <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-5">
              <h4 className="text-xs font-bold uppercase tracking-wider text-indigo-400">
                📋 Prerequisites
              </h4>
              <ul className="mt-3 space-y-2">
                {sharedBlueprint.quickstart.prerequisites.map((req, idx) => (
                  <li key={idx} className="flex items-center gap-2 text-xs text-slate-300">
                    <span className="text-emerald-400">✓</span> {req}
                  </li>
                ))}
              </ul>
            </div>

            {/* Key Environment Variables */}
            <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-5">
              <h4 className="text-xs font-bold uppercase tracking-wider text-amber-400">
                🔑 Key Environment Variables
              </h4>
              <div className="mt-3 flex flex-wrap gap-2">
                {sharedBlueprint.quickstart.keyEnvironmentVars.map((env, idx) => (
                  <span
                    key={idx}
                    className="rounded-md bg-amber-500/10 px-2.5 py-1 text-xs font-mono text-amber-300 border border-amber-500/20"
                  >
                    {env}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Setup Commands */}
          <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-5">
            <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-400 mb-3">
              💻 Setup Commands
            </h4>
            <div className="space-y-2">
              {sharedBlueprint.quickstart.setupCommands.map((cmd, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between rounded-lg bg-slate-900 px-3.5 py-2 font-mono text-xs text-slate-200 border border-slate-800"
                >
                  <span>{cmd}</span>
                  <button
                    onClick={() => handleCopy(cmd)}
                    className="text-[10px] text-slate-400 hover:text-white transition-colors"
                  >
                    {copiedCommand === cmd ? '✓ Copied' : '📋 Copy'}
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
