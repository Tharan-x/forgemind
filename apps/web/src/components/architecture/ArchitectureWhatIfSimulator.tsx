'use client';

// =============================================================================
// ForgeMind Web — Architecture What-If / Change Simulator UI Component
// =============================================================================

import React, { useState } from 'react';
import type {
  ArchitectureDriftLevel,
  ArchitectureWhatIfResult,
  WhatIfScenarioType,
} from '@forgemind/types';

import { simulateArchitectureWhatIf } from '../../lib/intelligence.api';

interface ArchitectureWhatIfSimulatorProps {
  repositoryId: string;
  initialSourcePath?: string;
  initialTargetPath?: string;
}

export function ArchitectureWhatIfSimulator({
  repositoryId,
  initialSourcePath = '',
  initialTargetPath = '',
}: ArchitectureWhatIfSimulatorProps) {
  const [scenarioType, setScenarioType] = useState<WhatIfScenarioType>('add_dependency');
  const [sourcePath, setSourcePath] = useState<string>(initialSourcePath);
  const [targetPath, setTargetPath] = useState<string>(initialTargetPath);
  const [includeAIAdvice, setIncludeAIAdvice] = useState<boolean>(true);

  const [result, setResult] = useState<ArchitectureWhatIfResult | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const handleSimulate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sourcePath.trim() || !targetPath.trim() || !repositoryId) return;

    setIsLoading(true);
    setError(null);

    try {
      const res = await simulateArchitectureWhatIf(repositoryId, {
        scenarioType,
        sourcePath: sourcePath.trim(),
        targetPath: targetPath.trim(),
        includeAIAdvice,
      });
      setResult(res);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to execute architecture simulation';
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  const getDriftBadgeStyle = (level: ArchitectureDriftLevel) => {
    switch (level) {
      case 'CRITICAL':
        return 'bg-red-500/10 text-red-400 border-red-500/30 ring-1 ring-red-500/20';
      case 'HIGH':
        return 'bg-amber-500/10 text-amber-400 border-amber-500/30 ring-1 ring-amber-500/20';
      case 'MEDIUM':
        return 'bg-yellow-500/10 text-yellow-300 border-yellow-500/30 ring-1 ring-yellow-500/20';
      case 'LOW':
        return 'bg-blue-500/10 text-blue-400 border-blue-500/30 ring-1 ring-blue-500/20';
      case 'NONE':
      default:
        return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 ring-1 ring-emerald-500/20';
    }
  };

  const getPolicyBadgeStyle = (outcome: 'pass' | 'fail' | 'neutral') => {
    switch (outcome) {
      case 'fail':
        return 'bg-red-500/10 text-red-400 border-red-500/30';
      case 'pass':
        return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30';
      case 'neutral':
      default:
        return 'bg-zinc-800 text-zinc-400 border-zinc-700';
    }
  };

  const getDeltaStyle = (delta: number) => {
    if (delta > 0) return 'text-emerald-400 font-bold';
    if (delta < 0) return 'text-red-400 font-bold';
    return 'text-neutral-400 font-bold';
  };

  return (
    <div className="space-y-8">
      {/* Product Distinction Header */}
      <div className="rounded-xl border border-cyan-900/40 bg-gradient-to-r from-cyan-950/40 via-neutral-900/60 to-indigo-950/40 p-6 shadow-xl space-y-3 backdrop-blur">
        <div className="flex items-center gap-3">
          <span className="text-2xl">🔮</span>
          <div>
            <h2 className="text-lg font-bold text-neutral-100">
              ForgeMind Architecture What-If / Change Simulator
            </h2>
            <p className="text-xs text-neutral-300 mt-0.5">
              Simulate proposed dependency changes, module moves, or cross-layer breaches before
              writing code
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-neutral-800/80 text-[11px] font-mono text-neutral-400">
          <span className="px-2 py-0.5 rounded bg-neutral-800 text-neutral-200">
            PROPOSED CHANGE
          </span>
          <span>➔</span>
          <span className="px-2 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-800/50">
            GRAPH SIMULATION
          </span>
          <span>➔</span>
          <span className="px-2 py-0.5 rounded bg-indigo-950 text-indigo-300 border border-indigo-800/50">
            PREDICTED CONSEQUENCE
          </span>
          <span>➔</span>
          <span className="px-2 py-0.5 rounded bg-purple-950 text-purple-300 border border-purple-800/50">
            EDUCATIONAL INSIGHTS
          </span>
        </div>
      </div>

      {/* Scenario Control Form */}
      <form
        onSubmit={handleSimulate}
        className="rounded-xl border border-neutral-800 bg-neutral-900/80 p-6 space-y-6 shadow-xl"
      >
        <h3 className="text-sm font-semibold text-neutral-200 uppercase tracking-wider flex items-center gap-2">
          <span>🛠️</span> Configure Simulation Scenario
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Scenario Type Selector */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-neutral-300">Scenario Type</label>
            <select
              value={scenarioType}
              onChange={(e) => setScenarioType(e.target.value as WhatIfScenarioType)}
              className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-xs font-medium text-neutral-100 focus:border-cyan-500 focus:outline-none"
            >
              <option value="add_dependency">➕ Add Dependency</option>
              <option value="remove_dependency">➖ Remove Dependency</option>
              <option value="move_module">📦 Move Module / File</option>
              <option value="introduce_cross_layer_dependency">⚠️ Cross-Layer Breach</option>
            </select>
          </div>

          {/* Source Path Input */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-neutral-300">Source Path</label>
            <input
              type="text"
              value={sourcePath}
              onChange={(e) => setSourcePath(e.target.value)}
              placeholder="e.g. apps/web/src/app/page.tsx"
              required
              className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-xs font-mono text-neutral-100 placeholder-neutral-500 focus:border-cyan-500 focus:outline-none"
            />
          </div>

          {/* Target Path Input */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-neutral-300">Target Path</label>
            <input
              type="text"
              value={targetPath}
              onChange={(e) => setTargetPath(e.target.value)}
              placeholder="e.g. apps/api/src/db/client.ts"
              required
              className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-xs font-mono text-neutral-100 placeholder-neutral-500 focus:border-cyan-500 focus:outline-none"
            />
          </div>
        </div>

        {/* Options & Action Row */}
        <div className="flex flex-wrap items-center justify-between gap-4 pt-2 border-t border-neutral-800">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={includeAIAdvice}
              onChange={(e) => setIncludeAIAdvice(e.target.checked)}
              className="rounded border-neutral-700 bg-neutral-950 text-cyan-500 focus:ring-cyan-500"
            />
            <span className="text-xs text-neutral-300 font-medium">
              Include Gemini Educational & Safer Alternative Advice
            </span>
          </label>

          <button
            type="submit"
            disabled={isLoading || !sourcePath.trim() || !targetPath.trim()}
            className="rounded-lg bg-cyan-600 px-5 py-2.5 text-xs font-bold text-white shadow-md hover:bg-cyan-500 disabled:opacity-50 transition-all flex items-center gap-2"
          >
            {isLoading ? (
              <>
                <span className="animate-spin">⏳</span>
                <span>Simulating Graph Mutation...</span>
              </>
            ) : (
              <>
                <span>🔮</span>
                <span>Run Architectural Simulation</span>
              </>
            )}
          </button>
        </div>
      </form>

      {error && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-950/20 p-5 text-rose-300 space-y-1 text-xs">
          <strong className="font-semibold block">Simulation Failed</strong>
          <span>{error}</span>
        </div>
      )}

      {/* Simulation Result Output */}
      {result && (
        <div className="space-y-6">
          {/* Dual Panel Grid: CONFIRMED EVIDENCE vs PREDICTED CONSEQUENCE */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Panel 1: CONFIRMED EVIDENCE */}
            <div className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-6 space-y-4 shadow-xl backdrop-blur">
              <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
                <h4 className="text-xs font-bold text-neutral-200 uppercase tracking-wider flex items-center gap-2">
                  <span>📌</span> CONFIRMED EVIDENCE (Current Baseline)
                </h4>
                <span className="text-[10px] font-mono bg-neutral-800 text-neutral-300 px-2 py-0.5 rounded">
                  Active Codebase
                </span>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="rounded-lg border border-neutral-800 bg-neutral-950/40 p-3 space-y-1">
                  <span className="text-[11px] text-neutral-400 block">Current Health Score</span>
                  <div className="text-xl font-bold text-neutral-100 flex items-baseline gap-2">
                    {result.confirmedEvidence.currentHealthScore}
                    <span className="text-xs font-semibold text-emerald-400">
                      ({result.confirmedEvidence.currentGrade})
                    </span>
                  </div>
                </div>

                <div className="rounded-lg border border-neutral-800 bg-neutral-950/40 p-3 space-y-1">
                  <span className="text-[11px] text-neutral-400 block">Total Dependencies</span>
                  <div className="text-xl font-bold text-neutral-100">
                    {result.confirmedEvidence.currentTotalDependencies}
                    <span className="text-xs font-normal text-neutral-400 ml-1">edges</span>
                  </div>
                </div>
              </div>

              <div className="space-y-2 pt-2 border-t border-neutral-800/80 text-xs">
                <div className="flex items-center justify-between text-neutral-300">
                  <span>Source Layer:</span>
                  <span className="font-semibold text-indigo-300">
                    {result.confirmedEvidence.sourceLayer}
                  </span>
                </div>
                <div className="flex items-center justify-between text-neutral-300">
                  <span>Target Layer:</span>
                  <span className="font-semibold text-purple-300">
                    {result.confirmedEvidence.targetLayer}
                  </span>
                </div>
                <div className="flex items-center justify-between text-neutral-300">
                  <span>Active Findings:</span>
                  <span className="font-semibold text-neutral-200">
                    {result.confirmedEvidence.currentFindingCount} finding(s)
                  </span>
                </div>
              </div>
            </div>

            {/* Panel 2: PREDICTED CONSEQUENCE */}
            <div className="rounded-xl border border-cyan-900/40 bg-neutral-900/80 p-6 space-y-4 shadow-xl backdrop-blur">
              <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
                <h4 className="text-xs font-bold text-cyan-300 uppercase tracking-wider flex items-center gap-2">
                  <span>⚡</span> PREDICTED CONSEQUENCE (In-Memory Simulation)
                </h4>
                <div className="flex items-center gap-2">
                  <span
                    className={`text-[10px] px-2.5 py-0.5 rounded-full font-bold uppercase border ${getDriftBadgeStyle(
                      result.predictedConsequence.predictedDriftLevel,
                    )}`}
                  >
                    DRIFT: {result.predictedConsequence.predictedDriftLevel}
                  </span>
                  <span
                    className={`text-[10px] px-2.5 py-0.5 rounded-full font-bold uppercase border ${getPolicyBadgeStyle(
                      result.predictedConsequence.predictedPolicyOutcome,
                    )}`}
                  >
                    POLICY: {result.predictedConsequence.predictedPolicyOutcome}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="rounded-lg border border-neutral-800 bg-neutral-950/60 p-3 space-y-1">
                  <span className="text-[11px] text-neutral-400 block">Simulated Score</span>
                  <div className="text-xl font-bold text-neutral-100 flex items-baseline gap-2">
                    {result.predictedConsequence.simulatedHealthScore}
                    <span
                      className={`text-xs ${getDeltaStyle(result.predictedConsequence.scoreDelta)}`}
                    >
                      ({result.predictedConsequence.scoreDelta >= 0 ? '+' : ''}
                      {result.predictedConsequence.scoreDelta} pts)
                    </span>
                  </div>
                </div>

                <div className="rounded-lg border border-neutral-800 bg-neutral-950/60 p-3 space-y-1">
                  <span className="text-[11px] text-neutral-400 block">Findings Delta</span>
                  <div className="text-xl font-bold text-neutral-100">
                    +{result.predictedConsequence.newFindingsCount}{' '}
                    <span className="text-xs font-normal text-neutral-400">new</span> / -
                    {result.predictedConsequence.resolvedFindingsCount}{' '}
                    <span className="text-xs font-normal text-neutral-400">resolved</span>
                  </div>
                </div>
              </div>

              {/* Reasons list */}
              <div className="space-y-1.5 pt-2 border-t border-neutral-800">
                <span className="text-xs font-semibold text-neutral-300 block">
                  Deterministic Consequence Drivers:
                </span>
                <ul className="space-y-1 text-xs text-neutral-300 list-disc list-inside font-sans">
                  {result.predictedConsequence.reasons.map((r, idx) => (
                    <li key={idx} className="leading-relaxed">
                      {r}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>

          {/* Bottom Panel: AI Architectural Guidance & Educational Insights */}
          {result.aiAdvice && (
            <div className="rounded-xl border border-indigo-900/40 bg-neutral-950/70 p-6 space-y-4 shadow-xl">
              <h4 className="text-xs font-bold text-indigo-300 uppercase tracking-wider flex items-center gap-2">
                <span>🧠</span> Architectural Guidance & Student Insights
              </h4>

              <div className="space-y-3 text-xs text-neutral-300 leading-relaxed font-sans">
                <div className="p-3 rounded bg-neutral-900/80 border border-neutral-800">
                  <strong className="text-neutral-200 block mb-1">Risk Summary:</strong>
                  <span>{result.aiAdvice.architecturalRiskSummary}</span>
                </div>

                <div className="p-3 rounded bg-neutral-900/80 border border-neutral-800">
                  <strong className="text-indigo-300 block mb-1">
                    Architectural Principle / Insight:
                  </strong>
                  <span>{result.aiAdvice.educationalInsight}</span>
                </div>

                {result.aiAdvice.saferAlternatives.length > 0 && (
                  <div className="p-3 rounded bg-neutral-900/80 border border-neutral-800 space-y-1">
                    <strong className="text-emerald-400 block mb-1">
                      Safer Design Alternatives:
                    </strong>
                    <ul className="list-disc list-inside space-y-1">
                      {result.aiAdvice.saferAlternatives.map((alt, i) => (
                        <li key={i}>{alt}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
