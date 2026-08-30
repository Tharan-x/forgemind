'use client';

// =============================================================================
// ForgeMind Web — Architectural Health History Trend & Regression Diff Component
// =============================================================================

import React, { useState, useEffect, useCallback } from 'react';
import type {
  ArchitectureHealthComparisonResponse,
  ArchitectureHealthHistoryResponse,
} from '@forgemind/types';
import { getArchitectureHealthHistory, compareArchitectureHealth } from '@/lib/intelligence.api';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';

interface ArchitecturalHealthHistoryTrendProps {
  repositoryId: string;
}

export function ArchitecturalHealthHistoryTrend({
  repositoryId,
}: ArchitecturalHealthHistoryTrendProps) {
  const [historyData, setHistoryData] = useState<ArchitectureHealthHistoryResponse | null>(null);
  const [compareData, setCompareData] = useState<ArchitectureHealthComparisonResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [compareLoading, setCompareLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [compareError, setCompareError] = useState<string | null>(null);

  const [selectedBaselineId, setSelectedBaselineId] = useState<string | null>(null);
  const [selectedCurrentId, setSelectedCurrentId] = useState<string | null>(null);
  const [activeDiffTab, setActiveDiffTab] = useState<'new' | 'resolved' | 'unmodified'>('new');

  // Initial load of history & default comparison
  const fetchInitialData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [histRes, compRes] = await Promise.all([
        getArchitectureHealthHistory(repositoryId),
        compareArchitectureHealth(repositoryId),
      ]);
      setHistoryData(histRes.data);
      setCompareData(compRes.data);
      setSelectedBaselineId(compRes.data.baselineAnalysisId);
      setSelectedCurrentId(compRes.data.currentAnalysisId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load architectural health history.');
    } finally {
      setLoading(false);
    }
  }, [repositoryId]);

  useEffect(() => {
    fetchInitialData();
  }, [fetchInitialData]);

  // Re-fetch comparison when selected baseline or target changes
  const fetchComparison = useCallback(
    async (baselineId: string, currentId: string) => {
      if (baselineId === currentId) return;
      setCompareLoading(true);
      setCompareError(null);
      try {
        const compRes = await compareArchitectureHealth(repositoryId, baselineId, currentId);
        setCompareData(compRes.data);
      } catch (err) {
        setCompareError(
          err instanceof Error ? err.message : 'Failed to load snapshot comparison diff.',
        );
      } finally {
        setCompareLoading(false);
      }
    },
    [repositoryId],
  );

  const handleSelectBaseline = (analysisId: string) => {
    if (analysisId === selectedBaselineId) return;
    if (analysisId === selectedCurrentId) {
      // Swap selection if baseline is set to current target
      const newBaseline = analysisId;
      const newCurrent = selectedBaselineId || analysisId;
      setSelectedBaselineId(newBaseline);
      setSelectedCurrentId(newCurrent);
      if (newBaseline !== newCurrent) {
        fetchComparison(newBaseline, newCurrent);
      }
      return;
    }
    setSelectedBaselineId(analysisId);
    if (selectedCurrentId && analysisId !== selectedCurrentId) {
      fetchComparison(analysisId, selectedCurrentId);
    }
  };

  const handleSelectTarget = (analysisId: string) => {
    if (analysisId === selectedCurrentId) return;
    if (analysisId === selectedBaselineId) {
      // Swap selection if target is set to current baseline
      const newCurrent = analysisId;
      const newBaseline = selectedCurrentId || analysisId;
      setSelectedCurrentId(newCurrent);
      setSelectedBaselineId(newBaseline);
      if (newBaseline !== newCurrent) {
        fetchComparison(newBaseline, newCurrent);
      }
      return;
    }
    setSelectedCurrentId(analysisId);
    if (selectedBaselineId && analysisId !== selectedBaselineId) {
      fetchComparison(selectedBaselineId, analysisId);
    }
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center rounded-2xl border border-zinc-800 bg-zinc-950/60 p-8">
        <LoadingSpinner label="Analyzing historical architectural health trends..." />
      </div>
    );
  }

  if (error || !historyData || !compareData) {
    return (
      <div className="rounded-xl border border-rose-500/20 bg-rose-950/20 p-6 text-center text-sm text-rose-400">
        {error || 'No historical architectural trend data available.'}
      </div>
    );
  }

  const isSingleSnapshot = historyData.points.length <= 1;

  return (
    <div className="space-y-6">
      {/* SINGLE SNAPSHOT INFORMATIONAL BANNER */}
      {isSingleSnapshot && (
        <div className="rounded-xl border border-cyan-500/30 bg-cyan-950/20 p-4 text-cyan-300 flex items-center gap-3 text-xs">
          <span className="text-base">ℹ</span>
          <p>
            Single analysis snapshot recorded for this repository. Interactive baseline comparison
            diffing will unlock automatically as future analysis runs occur.
          </p>
        </div>
      )}

      {/* SECTION 1: REGRESSION ALERT BANNER */}
      {compareData.isRegressed ? (
        <div className="rounded-2xl border border-rose-500/30 bg-rose-950/30 p-6 text-rose-300">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-rose-900/60 pb-4">
            <div className="flex items-center gap-3">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-rose-500/20 text-lg font-bold text-rose-400">
                ⚠
              </span>
              <div>
                <h3 className="text-sm font-bold uppercase tracking-wider text-rose-400">
                  Architectural Health Regression Alert
                </h3>
                <p className="text-xs text-rose-300/80">
                  Health score degraded by {Math.abs(compareData.healthDelta)} points between
                  baseline and target snapshot
                </p>
              </div>
            </div>

            <span className="rounded-full border border-rose-500/40 bg-rose-500/20 px-3 py-1 text-xs font-bold text-rose-400">
              {compareData.regressionSeverity} REGRESSION
            </span>
          </div>

          {compareData.newFindings.length > 0 && (
            <div className="mt-4 space-y-2">
              <p className="text-xs font-semibold text-rose-300">
                New Anti-Patterns Introduced ({compareData.newFindings.length}):
              </p>
              <div className="flex flex-wrap gap-2">
                {compareData.newFindings.map((f) => (
                  <span
                    key={f.id}
                    className="rounded bg-rose-900/40 px-2 py-1 font-mono text-[11px] text-rose-200 border border-rose-800"
                  >
                    {f.title} ({f.severity})
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-950/20 p-4 text-emerald-300 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-lg">✅</span>
            <div>
              <p className="text-sm font-bold text-emerald-400">
                Architecture Health Baseline Stable
              </p>
              <p className="text-xs text-zinc-400">
                No score degradation detected across selected analysis snapshots
              </p>
            </div>
          </div>
          <span className="rounded-full bg-emerald-500/20 border border-emerald-500/30 px-3 py-1 text-xs font-bold text-emerald-400">
            {compareData.trend || historyData.overallTrend} TREND
          </span>
        </div>
      )}

      {/* SECTION 2: HEALTH SCORE TIMELINE */}
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold uppercase tracking-wider text-zinc-200">
              Historical Health Score Timeline ({historyData.points.length} Runs)
            </h3>
            <p className="text-xs text-zinc-400">
              Click &quot;Set Baseline&quot; or &quot;Set Target&quot; on any run card to compare
              snapshots.
            </p>
          </div>
          {compareLoading && (
            <span className="text-xs text-cyan-400 animate-pulse font-medium">
              Updating snapshot diff...
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {historyData.points.map((pt, idx) => {
            const isBaseline = pt.analysisId === selectedBaselineId;
            const isTarget = pt.analysisId === selectedCurrentId;

            let cardBorder = 'border-zinc-800 bg-zinc-950';
            if (isBaseline && isTarget) {
              cardBorder = 'border-amber-500/60 bg-amber-950/20';
            } else if (isBaseline) {
              cardBorder = 'border-purple-500/60 bg-purple-950/20';
            } else if (isTarget) {
              cardBorder = 'border-cyan-500/60 bg-cyan-950/20';
            }

            return (
              <div
                key={pt.analysisId}
                className={`rounded-xl border p-4 text-center space-y-2 transition ${cardBorder}`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-mono text-zinc-500">Run #{idx + 1}</span>
                  <div className="flex gap-1">
                    {isBaseline && (
                      <span className="rounded bg-purple-500/20 border border-purple-500/40 px-1.5 py-0.5 text-[9px] font-bold text-purple-300 uppercase">
                        Baseline
                      </span>
                    )}
                    {isTarget && (
                      <span className="rounded bg-cyan-500/20 border border-cyan-500/40 px-1.5 py-0.5 text-[9px] font-bold text-cyan-300 uppercase">
                        Target
                      </span>
                    )}
                  </div>
                </div>

                <p className="text-2xl font-bold text-white">{pt.healthScore}</p>

                <span className="inline-block rounded bg-zinc-800 px-2 py-0.5 text-xs font-semibold text-cyan-400">
                  Grade {pt.grade}
                </span>

                <p className="text-[10px] text-zinc-500 truncate">
                  {new Date(pt.evaluatedAt).toLocaleDateString()}
                </p>

                {!isSingleSnapshot && (
                  <div className="pt-2 flex items-center justify-center gap-1.5 text-[10px]">
                    <button
                      type="button"
                      onClick={() => handleSelectBaseline(pt.analysisId)}
                      disabled={isBaseline}
                      className={`px-2 py-1 rounded transition border font-semibold ${
                        isBaseline
                          ? 'bg-purple-900/40 border-purple-700 text-purple-200 opacity-60 cursor-default'
                          : 'bg-zinc-900 border-zinc-700 text-zinc-300 hover:border-purple-500 hover:text-purple-300'
                      }`}
                    >
                      Baseline
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSelectTarget(pt.analysisId)}
                      disabled={isTarget}
                      className={`px-2 py-1 rounded transition border font-semibold ${
                        isTarget
                          ? 'bg-cyan-900/40 border-cyan-700 text-cyan-200 opacity-60 cursor-default'
                          : 'bg-zinc-900 border-zinc-700 text-zinc-300 hover:border-cyan-500 hover:text-cyan-300'
                      }`}
                    >
                      Target
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* SECTION 3: SNAPSHOT COMPARISON DIFF */}
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-zinc-800 pb-4">
          <div>
            <h3 className="text-sm font-bold uppercase tracking-wider text-zinc-200">
              Analysis Snapshot Comparison Diff
            </h3>
            <p className="text-xs text-zinc-400">
              Comparing Baseline ({compareData.baselineAnalysisId}) vs Target (
              {compareData.currentAnalysisId})
            </p>
          </div>

          <div className="flex items-center space-x-2 text-xs">
            <button
              type="button"
              onClick={() => setActiveDiffTab('new')}
              className={`px-3 py-1.5 rounded-lg font-semibold transition ${
                activeDiffTab === 'new'
                  ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              New Issues ({compareData.newFindings.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveDiffTab('resolved')}
              className={`px-3 py-1.5 rounded-lg font-semibold transition ${
                activeDiffTab === 'resolved'
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Resolved ({compareData.resolvedFindings.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveDiffTab('unmodified')}
              className={`px-3 py-1.5 rounded-lg font-semibold transition ${
                activeDiffTab === 'unmodified'
                  ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/40'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Unchanged ({compareData.unmodifiedFindings.length})
            </button>
          </div>
        </div>

        {compareError && (
          <div className="rounded-xl border border-rose-500/20 bg-rose-950/20 p-4 text-xs text-rose-400">
            {compareError}
          </div>
        )}

        {/* Diff Content View */}
        <div className={compareLoading ? 'opacity-50 pointer-events-none transition' : ''}>
          {activeDiffTab === 'new' &&
            (compareData.newFindings.length === 0 ? (
              <p className="text-xs text-zinc-400 text-center py-6">
                🎉 Zero new architectural anti-patterns introduced.
              </p>
            ) : (
              <div className="space-y-3">
                {compareData.newFindings.map((f) => (
                  <div
                    key={f.id}
                    className="rounded-xl border border-rose-500/30 bg-rose-950/20 p-4 space-y-1"
                  >
                    <div className="flex items-center gap-2">
                      <span className="rounded bg-rose-500/20 px-2 py-0.5 text-[11px] font-bold text-rose-400 border border-rose-500/30 uppercase">
                        {f.severity}
                      </span>
                      <span className="text-xs font-mono text-zinc-400">{f.category}</span>
                    </div>
                    <p className="text-sm font-bold text-zinc-100">{f.title}</p>
                    <p className="text-xs text-zinc-400">{f.description}</p>
                  </div>
                ))}
              </div>
            ))}

          {activeDiffTab === 'resolved' &&
            (compareData.resolvedFindings.length === 0 ? (
              <p className="text-xs text-zinc-400 text-center py-6">
                No findings were resolved in this comparison step.
              </p>
            ) : (
              <div className="space-y-3">
                {compareData.resolvedFindings.map((f) => (
                  <div
                    key={f.id}
                    className="rounded-xl border border-emerald-500/30 bg-emerald-950/20 p-4 space-y-1"
                  >
                    <div className="flex items-center gap-2">
                      <span className="rounded bg-emerald-500/20 px-2 py-0.5 text-[11px] font-bold text-emerald-400 border border-emerald-500/30 uppercase">
                        RESOLVED
                      </span>
                      <span className="text-xs font-mono text-zinc-400">{f.category}</span>
                    </div>
                    <p className="text-sm font-bold text-zinc-100">{f.title}</p>
                  </div>
                ))}
              </div>
            ))}

          {activeDiffTab === 'unmodified' && (
            <div className="space-y-3">
              {compareData.unmodifiedFindings.map((f) => (
                <div
                  key={f.id}
                  className="rounded-xl border border-zinc-800 bg-zinc-950 p-4 space-y-1"
                >
                  <div className="flex items-center gap-2">
                    <span className="rounded bg-zinc-800 px-2 py-0.5 text-[11px] font-bold text-zinc-300 uppercase">
                      {f.severity}
                    </span>
                    <span className="text-xs font-mono text-zinc-400">{f.category}</span>
                  </div>
                  <p className="text-sm font-bold text-zinc-100">{f.title}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
