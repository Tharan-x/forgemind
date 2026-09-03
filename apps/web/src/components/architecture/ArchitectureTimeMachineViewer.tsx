'use client';

// =============================================================================
// ForgeMind Web — Architecture Time Machine UI Component
// =============================================================================

import React, { useState, useEffect, useCallback } from 'react';
import type {
  ArchitectureTimeMachineSnapshotItem,
  ArchitectureTimeMachineComparisonResponse,
  ArchitectureDriftLevel,
} from '@forgemind/types';

import {
  getArchitectureTimeline,
  compareArchitectureTimeMachineSnapshots,
} from '../../lib/intelligence.api';

interface ArchitectureTimeMachineViewerProps {
  repositoryId: string;
  initialPath?: string;
}

export function ArchitectureTimeMachineViewer({
  repositoryId,
  initialPath,
}: ArchitectureTimeMachineViewerProps) {
  const [timeline, setTimeline] = useState<ArchitectureTimeMachineSnapshotItem[]>([]);
  const [currentHealthScore, setCurrentHealthScore] = useState<number>(100);

  const [fromSnapshotId, setFromSnapshotId] = useState<string | null>(null);
  const [toSnapshotId, setToSnapshotId] = useState<string | null>(null);

  const [comparison, setComparison] = useState<ArchitectureTimeMachineComparisonResponse | null>(
    null,
  );
  const [isLoadingTimeline, setIsLoadingTimeline] = useState(true);
  const [isLoadingComparison, setIsLoadingComparison] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 1. Fetch Timeline
  const fetchTimeline = useCallback(async () => {
    try {
      setIsLoadingTimeline(true);
      setError(null);
      const res = await getArchitectureTimeline(repositoryId);
      setTimeline(res.timeline);
      setCurrentHealthScore(res.currentHealthScore);

      if (res.timeline.length >= 2) {
        setFromSnapshotId(res.timeline[0]?.snapshotId ?? null);
        setToSnapshotId(res.timeline[res.timeline.length - 1]?.snapshotId ?? null);
      } else if (res.timeline.length === 1) {
        setFromSnapshotId(res.timeline[0]?.snapshotId ?? null);
        setToSnapshotId(res.timeline[0]?.snapshotId ?? null);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to fetch architecture timeline';
      setError(msg);
    } finally {
      setIsLoadingTimeline(false);
    }
  }, [repositoryId]);

  // 2. Fetch Comparison
  const fetchComparison = useCallback(
    async (fromId: string, toId: string) => {
      try {
        setIsLoadingComparison(true);
        const res = await compareArchitectureTimeMachineSnapshots(repositoryId, fromId, toId);
        setComparison(res);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to load snapshot comparison';
        setError(msg);
      } finally {
        setIsLoadingComparison(false);
      }
    },
    [repositoryId],
  );

  useEffect(() => {
    fetchTimeline();
  }, [fetchTimeline]);

  useEffect(() => {
    if (fromSnapshotId && toSnapshotId) {
      fetchComparison(fromSnapshotId, toSnapshotId);
    }
  }, [fromSnapshotId, toSnapshotId, fetchComparison]);

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

  const getDeltaStyle = (delta: number) => {
    if (delta > 0) return 'text-emerald-400 font-semibold';
    if (delta < 0) return 'text-red-400 font-semibold';
    return 'text-neutral-400 font-semibold';
  };

  if (error) {
    return (
      <div className="rounded-xl border border-rose-500/30 bg-rose-950/20 p-6 text-rose-300 space-y-3">
        <h3 className="font-semibold text-base">Failed to load Architecture Time Machine</h3>
        <p className="text-xs">{error}</p>
        <button
          onClick={() => fetchTimeline()}
          className="rounded bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-500"
        >
          Retry Loading
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Product Distinction Banner */}
      <div className="rounded-xl border border-indigo-900/40 bg-gradient-to-r from-indigo-950/40 via-neutral-900/60 to-purple-950/40 p-6 shadow-xl space-y-3 backdrop-blur">
        <div className="flex items-center gap-3">
          <span className="text-2xl">⏳</span>
          <div>
            <h2 className="text-lg font-bold text-neutral-100">
              ForgeMind Architecture Time Machine
            </h2>
            <p className="text-xs text-neutral-300 mt-0.5">
              Deterministic structural history, snapshot scrubbers, and evidence-grounded
              architectural consequences
            </p>
            {initialPath && (
              <div className="mt-2 inline-flex items-center gap-2 px-3 py-1 bg-indigo-500/15 border border-indigo-500/30 rounded-lg text-xs text-indigo-300 font-mono">
                <span>📍</span>
                <span>
                  Viewing timeline in context of: <strong>{initialPath}</strong>
                </span>
              </div>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-neutral-800/80 text-[11px] font-mono text-neutral-400">
          <span className="px-2 py-0.5 rounded bg-neutral-800 text-neutral-200">GIT COMMITS</span>
          <span>➔</span>
          <span className="px-2 py-0.5 rounded bg-indigo-950 text-indigo-300 border border-indigo-800/50">
            ARCHITECTURE HISTORY
          </span>
          <span>➔</span>
          <span className="px-2 py-0.5 rounded bg-purple-950 text-purple-300 border border-purple-800/50">
            STRUCTURAL SHIFTS
          </span>
          <span>➔</span>
          <span className="px-2 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-800/50">
            ARCHITECTURAL CONSEQUENCE
          </span>
        </div>
      </div>

      {isLoadingTimeline ? (
        <div className="py-12 text-center text-xs text-neutral-400 animate-pulse">
          Loading historical architecture timeline...
        </div>
      ) : timeline.length === 0 ? (
        <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-8 text-center space-y-2">
          <span className="text-3xl">📭</span>
          <h3 className="text-sm font-semibold text-neutral-200">
            No earlier architecture snapshot is available yet.
          </h3>
          <p className="text-xs text-neutral-400 max-w-md mx-auto">
            As more commits or PR analyses complete, historical architecture states will appear here
            automatically.
          </p>
        </div>
      ) : (
        <>
          {/* Timeline Scrubber & Selector */}
          <div className="rounded-xl border border-neutral-800 bg-neutral-900/80 p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-neutral-200 uppercase tracking-wider flex items-center gap-2">
                <span>🗓️</span> Historical Architecture Snapshot Timeline ({timeline.length})
              </h3>
              <span className="text-xs font-mono text-neutral-400">
                Current Score: <strong className="text-emerald-400">{currentHealthScore}</strong>
              </span>
            </div>

            {/* Timeline Cards Row */}
            <div className="flex items-center gap-3 overflow-x-auto pb-2">
              {timeline.map((snap, idx) => {
                const isFrom = fromSnapshotId === snap.snapshotId;
                const isTo = toSnapshotId === snap.snapshotId;

                return (
                  <div
                    key={snap.snapshotId}
                    className={`flex-shrink-0 min-w-[200px] rounded-lg border p-3 space-y-2 transition-all cursor-pointer ${
                      isFrom && isTo
                        ? 'border-purple-500 bg-purple-950/30 ring-1 ring-purple-500/40'
                        : isFrom
                          ? 'border-blue-500 bg-blue-950/30 ring-1 ring-blue-500/40'
                          : isTo
                            ? 'border-indigo-500 bg-indigo-950/30 ring-1 ring-indigo-500/40'
                            : 'border-neutral-800 bg-neutral-950/60 hover:border-neutral-700'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-mono text-neutral-400">
                        #{idx + 1} • {snap.commitHash ? snap.commitHash.slice(0, 7) : 'Snapshot'}
                      </span>
                      <span className="text-xs font-bold text-neutral-200">
                        {snap.healthScore} pts
                      </span>
                    </div>

                    <div className="text-xs font-semibold text-neutral-300 truncate">
                      {snap.prNumber ? `PR #${snap.prNumber}` : snap.prTitle || 'AST Analysis'}
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-neutral-400">
                      <span>{snap.totalFiles} files</span>
                      <span>{snap.findingsCount} findings</span>
                    </div>

                    {/* Quick Selection Buttons */}
                    <div className="flex items-center justify-between gap-2 pt-1 border-t border-neutral-800/80">
                      <button
                        onClick={() => setFromSnapshotId(snap.snapshotId)}
                        className={`text-[10px] px-2 py-0.5 rounded font-semibold transition-colors ${
                          isFrom
                            ? 'bg-blue-600 text-white'
                            : 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700'
                        }`}
                      >
                        From (A)
                      </button>
                      <button
                        onClick={() => setToSnapshotId(snap.snapshotId)}
                        className={`text-[10px] px-2 py-0.5 rounded font-semibold transition-colors ${
                          isTo
                            ? 'bg-indigo-600 text-white'
                            : 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700'
                        }`}
                      >
                        To (B)
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Snapshot Side-by-Side Comparison View */}
          {isLoadingComparison ? (
            <div className="rounded-xl border border-neutral-800 bg-neutral-900/80 p-8 text-center text-xs text-neutral-400 animate-pulse">
              Computing deterministic structural comparison between snapshots...
            </div>
          ) : (
            comparison && (
              <div className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-6 space-y-6 shadow-xl backdrop-blur">
                {/* Comparison Header */}
                <div className="flex flex-wrap items-center justify-between gap-4 border-b border-neutral-800 pb-4">
                  <div>
                    <h3 className="text-base font-semibold text-neutral-100 flex items-center gap-2">
                      <span>🔬</span> Deterministic Architecture Comparison
                    </h3>
                    <p className="text-xs text-neutral-400 mt-1">
                      Comparing Snapshot A (
                      {comparison.fromSnapshot.commitHash?.slice(0, 7) || 'Baseline'}) vs Snapshot B
                      ({comparison.toSnapshot.commitHash?.slice(0, 7) || 'Target'})
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span
                      className={`inline-flex items-center px-3.5 py-1 text-xs font-bold uppercase tracking-wider rounded-full border ${getDriftBadgeStyle(
                        comparison.drift.driftLevel,
                      )}`}
                    >
                      DRIFT: {comparison.drift.driftLevel}
                    </span>
                  </div>
                </div>

                {/* Deterministic Explanation Section */}
                <div className="rounded-lg bg-neutral-950/70 p-4 border border-neutral-800 space-y-2">
                  <h4 className="text-xs font-semibold text-neutral-200 uppercase tracking-wider flex items-center gap-2">
                    <span>💡</span> Architectural Consequence Explanation:
                  </h4>
                  <p className="text-xs text-neutral-300 leading-relaxed font-sans">
                    {comparison.architecturalConsequenceExplanation}
                  </p>
                  {comparison.drift.reasons.length > 0 && (
                    <ul className="space-y-1.5 text-xs text-neutral-300 list-disc list-inside pt-2 border-t border-neutral-800/80">
                      {comparison.drift.reasons.map((reason, i) => (
                        <li key={i} className="leading-relaxed">
                          {reason}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {/* Metric Transition Cards Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  {/* Health Score Transition */}
                  <div className="rounded-lg border border-neutral-800 bg-neutral-950/40 p-4 space-y-1">
                    <span className="text-xs font-medium text-neutral-400">
                      Architecture Health Score
                    </span>
                    <div className="text-lg font-bold text-neutral-100 flex items-baseline gap-2">
                      {comparison.fromSnapshot.healthScore} → {comparison.toSnapshot.healthScore}
                      <span
                        className={`text-xs ${getDeltaStyle(comparison.drift.healthScoreMovement.scoreDelta)}`}
                      >
                        ({comparison.drift.healthScoreMovement.scoreDelta >= 0 ? '+' : ''}
                        {comparison.drift.healthScoreMovement.scoreDelta} pts)
                      </span>
                    </div>
                    <span className="text-[11px] text-neutral-400 block uppercase">
                      Trend: {comparison.drift.healthScoreMovement.trend}
                    </span>
                  </div>

                  {/* Changed Modules */}
                  <div className="rounded-lg border border-neutral-800 bg-neutral-950/40 p-4 space-y-1">
                    <span className="text-xs font-medium text-neutral-400">Changed Modules</span>
                    <div className="text-lg font-bold text-neutral-100">
                      {comparison.drift.changedModules.length}{' '}
                      <span className="text-xs font-normal text-neutral-400">module(s)</span>
                    </div>
                    <span className="text-[11px] text-neutral-400 block">
                      {comparison.drift.changedComponents.length} component(s)
                    </span>
                  </div>

                  {/* Layers Affected */}
                  <div className="rounded-lg border border-neutral-800 bg-neutral-950/40 p-4 space-y-1">
                    <span className="text-xs font-medium text-neutral-400">Layers Affected</span>
                    <div className="text-lg font-bold text-neutral-100">
                      {comparison.drift.affectedLayers.length}{' '}
                      <span className="text-xs font-normal text-neutral-400">layer(s)</span>
                    </div>
                    <span className="text-[11px] text-neutral-400 block">
                      {comparison.drift.newCrossLayerDependencies.length} new cross-layer
                      relationship(s)
                    </span>
                  </div>

                  {/* Dependency Edge Churn */}
                  <div className="rounded-lg border border-neutral-800 bg-neutral-950/40 p-4 space-y-1">
                    <span className="text-xs font-medium text-neutral-400">Dependency Churn</span>
                    <div className="text-lg font-bold text-neutral-100">
                      Δ {comparison.drift.dependencyChurn.totalDependencyDelta}{' '}
                      <span className="text-xs font-normal text-neutral-400">edges</span>
                    </div>
                    <span className="text-[11px] text-neutral-400 block">
                      +{comparison.drift.dependencyChurn.addedEdgesCount} added / -
                      {comparison.drift.dependencyChurn.removedEdgesCount} removed
                    </span>
                  </div>
                </div>

                {/* Modules & Layers Breakdown */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Changed Modules List */}
                  <div className="rounded-lg border border-neutral-800 bg-neutral-950/40 p-4 space-y-2">
                    <h4 className="text-xs font-semibold text-neutral-300 uppercase tracking-wider">
                      Changed Architectural Modules:
                    </h4>
                    <div className="flex flex-wrap gap-2">
                      {comparison.drift.changedModules.length > 0 ? (
                        comparison.drift.changedModules.map((mod, i) => (
                          <span
                            key={i}
                            className="px-2.5 py-1 text-xs font-mono bg-neutral-800/80 text-neutral-200 border border-neutral-700/60 rounded-md"
                          >
                            📦 {mod}
                          </span>
                        ))
                      ) : (
                        <span className="text-xs text-neutral-400">No modules changed</span>
                      )}
                    </div>
                  </div>

                  {/* Affected Layers List */}
                  <div className="rounded-lg border border-neutral-800 bg-neutral-950/40 p-4 space-y-2">
                    <h4 className="text-xs font-semibold text-neutral-300 uppercase tracking-wider">
                      Affected Architectural Layers:
                    </h4>
                    <div className="flex flex-wrap gap-2">
                      {comparison.drift.affectedLayers.length > 0 ? (
                        comparison.drift.affectedLayers.map((layer, i) => (
                          <span
                            key={i}
                            className="px-2.5 py-1 text-xs font-medium bg-indigo-950/40 text-indigo-300 border border-indigo-800/50 rounded-md"
                          >
                            🏛️ {layer}
                          </span>
                        ))
                      ) : (
                        <span className="text-xs text-neutral-400">No layers affected</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )
          )}
        </>
      )}
    </div>
  );
}
