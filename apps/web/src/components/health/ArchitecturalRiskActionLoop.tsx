'use client';

// =============================================================================
// ForgeMind Web — Architectural Risk Intelligence & Action Loop Component
// =============================================================================

import React, { useState, useEffect, useCallback } from 'react';
import type {
  ArchitecturalRiskIntelligenceResponse,
  RemediationActionPlan,
  RemediationExplanationResponse,
} from '@forgemind/types';
import { Button } from '@forgemind/ui';
import { getArchitecturalRiskIntelligence, explainRemediationAction } from '@/lib/intelligence.api';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';

interface ArchitecturalRiskActionLoopProps {
  repositoryId: string;
  onSelectTargetFile?: (filePath: string) => void;
}

export function ArchitecturalRiskActionLoop({
  repositoryId,
  onSelectTargetFile,
}: ArchitecturalRiskActionLoopProps) {
  const [data, setData] = useState<ArchitecturalRiskIntelligenceResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Active Selected Simulation Plan
  const [selectedPlan, setSelectedPlan] = useState<RemediationActionPlan | null>(null);

  // AI Drawer State
  const [drawerOpen, setDrawerOpen] = useState<boolean>(false);
  const [drawerLoading, setDrawerLoading] = useState<boolean>(false);
  const [explanation, setExplanation] = useState<RemediationExplanationResponse | null>(null);
  const [drawerError, setDrawerError] = useState<string | null>(null);

  const fetchRiskIntelligence = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getArchitecturalRiskIntelligence(repositoryId);
      setData(res.data);
      if (res.data.highestValueFix) {
        setSelectedPlan(res.data.highestValueFix);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load risk intelligence.');
    } finally {
      setLoading(false);
    }
  }, [repositoryId]);

  useEffect(() => {
    fetchRiskIntelligence();
  }, [fetchRiskIntelligence]);

  const handleExplainAction = async (plan: RemediationActionPlan) => {
    setSelectedPlan(plan);
    setDrawerOpen(true);
    setDrawerLoading(true);
    setDrawerError(null);
    try {
      const res = await explainRemediationAction(repositoryId, {
        findingId: plan.findingId,
        targetFile: plan.targetFile,
      });
      setExplanation(res.data);
    } catch (err) {
      setDrawerError(
        err instanceof Error ? err.message : 'Failed to generate AI refactoring proposal.',
      );
    } finally {
      setDrawerLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center rounded-2xl border border-zinc-800 bg-zinc-950/60 p-8">
        <LoadingSpinner label="Evaluating architectural risk topology..." />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-xl border border-rose-500/20 bg-rose-950/20 p-6 text-center text-sm text-rose-400">
        {error || 'No architectural risk intelligence available.'}
      </div>
    );
  }

  const activeFix = selectedPlan || data.highestValueFix;
  const currentScore = data.currentHealthScore;
  const simulatedScore = activeFix
    ? Math.min(100, currentScore + activeFix.estimatedHealthImprovement)
    : currentScore;

  return (
    <div className="space-y-6">
      {/* SECTION 1: HIGHEST-VALUE FIX HERO SPOTLIGHT */}
      {activeFix && (
        <div className="relative overflow-hidden rounded-2xl border border-cyan-500/30 bg-gradient-to-br from-zinc-900 via-zinc-900/90 to-cyan-950/20 p-6 shadow-2xl backdrop-blur-md">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-zinc-800 pb-4">
            <div className="flex items-center gap-3">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-cyan-500/20 text-lg font-bold text-cyan-400">
                🎯
              </span>
              <div>
                <h3 className="text-sm font-bold uppercase tracking-wider text-cyan-400">
                  Single Highest-Value Refactoring Target
                </h3>
                <p className="text-xs text-zinc-400">
                  Deterministic priority recommendation based on blast radius & centrality
                </p>
              </div>
            </div>

            {/* Risk Badge & Projected Health Gain */}
            <div className="flex items-center gap-3">
              <span
                className={`rounded-full px-3 py-1 text-xs font-bold ${
                  activeFix.impactLevel === 'CRITICAL'
                    ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40'
                    : activeFix.impactLevel === 'HIGH'
                      ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                      : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                }`}
              >
                {activeFix.impactLevel} RISK ({activeFix.riskScore}/100)
              </span>

              <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/30 px-3 py-1.5 text-xs text-emerald-300 font-semibold">
                Projected Gain: +{activeFix.estimatedHealthImprovement} pts ({currentScore} →{' '}
                {simulatedScore})
              </div>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
            {/* Target File & Refactoring Pattern Details */}
            <div className="space-y-2 lg:col-span-2">
              <p className="text-base font-semibold text-zinc-100">{activeFix.title}</p>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="text-zinc-400">Target File:</span>
                <button
                  type="button"
                  onClick={() => onSelectTargetFile?.(activeFix.targetFile)}
                  className="font-mono text-cyan-400 hover:underline break-all"
                >
                  {activeFix.targetFile}
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="text-zinc-400">Pattern:</span>
                <span className="rounded bg-zinc-800 px-2 py-0.5 font-medium text-zinc-200">
                  {activeFix.refactoringPattern}
                </span>
              </div>
            </div>

            {/* Direct Action Trigger */}
            <div className="flex flex-col justify-center space-y-2">
              <Button
                variant="default"
                className="w-full justify-center bg-cyan-600 hover:bg-cyan-500 text-xs py-2.5 font-semibold"
                onClick={() => handleExplainAction(activeFix)}
              >
                Generate AI Code Refactoring Plan
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* SECTION 2: BEFORE -> AFTER SIMULATION METRICS BAR */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 text-center">
          <p className="text-xs text-zinc-400">Current Health</p>
          <p className="text-2xl font-bold text-zinc-100">{data.currentHealthScore}</p>
        </div>

        <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/20 p-4 text-center">
          <p className="text-xs text-emerald-400">Projected Health (Top Fix)</p>
          <p className="text-2xl font-bold text-emerald-400">{data.projectedHealthScore}</p>
        </div>

        <div className="rounded-xl border border-cyan-500/30 bg-cyan-950/20 p-4 text-center">
          <p className="text-xs text-cyan-400">Total Potential Recovery</p>
          <p className="text-2xl font-bold text-cyan-400">
            +{data.totalPotentialScoreImprovement} pts
          </p>
        </div>

        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 text-center">
          <p className="text-xs text-zinc-400">Critical / High Risks</p>
          <p className="text-2xl font-bold text-amber-400">
            {data.remediationSummary.criticalRiskCount + data.remediationSummary.highRiskCount}
          </p>
        </div>
      </div>

      {/* SECTION 3: RANKED REMEDIATION ACTION PLANS TABLE */}
      <div className="space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-zinc-200 uppercase tracking-wide">
            Ranked Architectural Action Plans ({data.rankedRemediations.length})
          </h3>
          <span className="text-xs text-zinc-400">
            Ordered deterministically by engineering risk score
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-zinc-800 bg-zinc-950/60 text-zinc-400 uppercase font-semibold">
              <tr>
                <th className="py-3 px-3">Priority</th>
                <th className="py-3 px-3">Risk Rating</th>
                <th className="py-3 px-3">Refactoring Pattern</th>
                <th className="py-3 px-3">Target File</th>
                <th className="py-3 px-3">Health Gain</th>
                <th className="py-3 px-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60 text-zinc-300">
              {data.rankedRemediations.map((plan, index) => {
                const isSelected = selectedPlan?.findingId === plan.findingId;
                return (
                  <tr
                    key={plan.findingId}
                    className={`transition-colors hover:bg-zinc-800/40 ${
                      isSelected ? 'bg-cyan-950/30' : ''
                    }`}
                  >
                    <td className="py-3 px-3 font-bold text-zinc-400">#{index + 1}</td>
                    <td className="py-3 px-3">
                      <span
                        className={`rounded px-2 py-0.5 text-[11px] font-bold ${
                          plan.impactLevel === 'CRITICAL'
                            ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                            : plan.impactLevel === 'HIGH'
                              ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                              : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                        }`}
                      >
                        {plan.impactLevel} ({plan.riskScore})
                      </span>
                    </td>
                    <td className="py-3 px-3 font-medium text-zinc-200">
                      {plan.refactoringPattern}
                    </td>
                    <td className="py-3 px-3 font-mono text-xs text-cyan-400 truncate max-w-xs">
                      {plan.targetFile}
                    </td>
                    <td className="py-3 px-3 font-semibold text-emerald-400">
                      +{plan.estimatedHealthImprovement} pts
                    </td>
                    <td className="py-3 px-3 text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-xs"
                        onClick={() => handleExplainAction(plan)}
                      >
                        AI Refactoring
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* SECTION 4: AI REMEDIATION EXPLANATION DRAWER */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-2xl overflow-y-auto border-l border-zinc-800 bg-zinc-950 p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-4">
              <div>
                <h3 className="text-base font-bold text-zinc-100">
                  AI Refactoring Plan & Code Guidance
                </h3>
                <p className="text-xs text-zinc-400">
                  Grounded strictly in retrieved codebase chunks & deterministic risk model
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={() => setDrawerOpen(false)}>
                ✕ Close
              </Button>
            </div>

            <div className="mt-6 space-y-6">
              {drawerLoading ? (
                <div className="flex h-64 items-center justify-center">
                  <LoadingSpinner label="Synthesizing refactoring code guidance..." />
                </div>
              ) : drawerError ? (
                <div className="rounded-xl border border-rose-500/20 bg-rose-950/20 p-4 text-xs text-rose-400">
                  {drawerError}
                </div>
              ) : explanation ? (
                <>
                  {/* Summary & Pattern */}
                  <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 space-y-2">
                    <p className="text-xs text-zinc-400">Pattern:</p>
                    <p className="text-sm font-semibold text-cyan-400">
                      {explanation.refactoringPattern}
                    </p>
                    <p className="text-xs text-zinc-400">Target File:</p>
                    <p className="font-mono text-xs text-zinc-200">{explanation.targetFile}</p>
                  </div>

                  {/* AI Explanation Prose */}
                  <div className="space-y-2">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-400">
                      Refactoring Rationale
                    </h4>
                    <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-4 text-xs leading-relaxed text-zinc-300 whitespace-pre-line">
                      {explanation.explanation}
                    </div>
                  </div>

                  {/* Step by Step Instructions */}
                  <div className="space-y-2">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-400">
                      Step-by-Step Execution Plan
                    </h4>
                    <ol className="list-decimal space-y-2 pl-5 text-xs text-zinc-300">
                      {explanation.stepByStepInstructions.map((step, idx) => (
                        <li key={idx} className="leading-normal">
                          {step}
                        </li>
                      ))}
                    </ol>
                  </div>

                  {/* Code Diff Proposal */}
                  {explanation.codeDiffProposal && (
                    <div className="space-y-2">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-400">
                        Proposed Code Diff Snippet
                      </h4>
                      <pre className="overflow-x-auto rounded-xl border border-zinc-800 bg-zinc-900 p-4 font-mono text-xs text-emerald-400">
                        {explanation.codeDiffProposal}
                      </pre>
                    </div>
                  )}

                  {/* RAG Citations */}
                  {explanation.sources.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-400">
                        Retrieved Code Evidence ({explanation.sources.length})
                      </h4>
                      <div className="space-y-2">
                        {explanation.sources.map((src, i) => (
                          <div
                            key={i}
                            className="rounded-lg border border-zinc-800/80 bg-zinc-900/40 p-3 text-xs"
                          >
                            <p className="font-mono font-semibold text-cyan-400">
                              {src.filePath} (L{src.startLine}-L{src.endLine})
                            </p>
                            {src.content && (
                              <p className="mt-1 font-mono text-[11px] text-zinc-400 truncate">
                                {src.content}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
