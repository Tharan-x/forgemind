'use client';

// =============================================================================
// ForgeMind Web — Architecture Drift Intelligence Card Component
// =============================================================================

import React from 'react';
import type { ArchitectureDrift, ArchitectureDriftLevel } from '@forgemind/types';

interface ArchitectureDriftCardProps {
  drift: ArchitectureDrift;
}

export function ArchitectureDriftCard({ drift }: ArchitectureDriftCardProps) {
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

  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-6 space-y-6 shadow-xl backdrop-blur">
      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-neutral-800 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-lg">⏳</span>
            <h3 className="text-base font-semibold text-neutral-100">
              Architecture Time Machine & Drift Intelligence
            </h3>
          </div>
          <p className="text-xs text-neutral-400 mt-1">
            Deterministic structure comparison, layer drift, dependency edge movement, and
            explainable evidence
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span
            className={`inline-flex items-center px-3.5 py-1 text-xs font-bold uppercase tracking-wider rounded-full border ${getDriftBadgeStyle(
              drift.driftLevel,
            )}`}
          >
            ARCHITECTURE DRIFT: {drift.driftLevel}
          </span>
        </div>
      </div>

      {/* Why? Deterministic Reasons List */}
      <div className="rounded-lg bg-neutral-950/60 p-4 border border-neutral-800/80 space-y-2">
        <h4 className="text-xs font-semibold text-neutral-200 uppercase tracking-wider flex items-center gap-1.5">
          <span>❓</span> Why?
        </h4>
        <ul className="space-y-1.5 text-xs text-neutral-300 list-disc list-inside">
          {drift.reasons.map((reason, i) => (
            <li key={i} className="leading-relaxed">
              {reason}
            </li>
          ))}
        </ul>
      </div>

      {/* Metric Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Changed Modules */}
        <div className="rounded-lg border border-neutral-800 bg-neutral-950/40 p-4 space-y-1">
          <span className="text-xs font-medium text-neutral-400">Modules Changed</span>
          <div className="text-lg font-bold text-neutral-100">
            {drift.changedModules.length}{' '}
            <span className="text-xs font-normal text-neutral-400">module(s)</span>
          </div>
          <span className="text-[11px] text-neutral-400 block truncate">
            {drift.changedComponents.length} component(s) affected
          </span>
        </div>

        {/* Affected Layers */}
        <div className="rounded-lg border border-neutral-800 bg-neutral-950/40 p-4 space-y-1">
          <span className="text-xs font-medium text-neutral-400">Architectural Layers</span>
          <div className="text-lg font-bold text-neutral-100">
            {drift.affectedLayers.length}{' '}
            <span className="text-xs font-normal text-neutral-400">layer(s)</span>
          </div>
          <span className="text-[11px] text-neutral-400 block truncate">
            {drift.newCrossLayerDependencies.length} new cross-layer edge(s)
          </span>
        </div>

        {/* Dependency Churn */}
        <div className="rounded-lg border border-neutral-800 bg-neutral-950/40 p-4 space-y-1">
          <span className="text-xs font-medium text-neutral-400">Dependency Churn</span>
          <div className="text-lg font-bold text-neutral-100">
            Δ {drift.dependencyChurn.totalDependencyDelta}{' '}
            <span className="text-xs font-normal text-neutral-400">edges</span>
          </div>
          <span className="text-[11px] text-neutral-400 block">
            +{drift.dependencyChurn.addedEdgesCount} added / -
            {drift.dependencyChurn.removedEdgesCount} removed
          </span>
        </div>

        {/* Health Score Transition */}
        <div className="rounded-lg border border-neutral-800 bg-neutral-950/40 p-4 space-y-1">
          <span className="text-xs font-medium text-neutral-400">Health Transition</span>
          <div className="text-lg font-bold text-neutral-100 flex items-baseline gap-2">
            {drift.healthScoreMovement.baselineScore} → {drift.healthScoreMovement.currentScore}
            <span className={`text-xs ${getDeltaStyle(drift.healthScoreMovement.scoreDelta)}`}>
              ({drift.healthScoreMovement.scoreDelta >= 0 ? '+' : ''}
              {drift.healthScoreMovement.scoreDelta})
            </span>
          </div>
          <span className="text-[11px] text-neutral-400 block uppercase">
            Trend: {drift.healthScoreMovement.trend}
          </span>
        </div>
      </div>

      {/* Cross Layer Dependencies Detail */}
      {drift.newCrossLayerDependencies.length > 0 && (
        <div className="space-y-3 pt-2 border-t border-neutral-800/80">
          <h4 className="text-xs font-semibold text-neutral-200 uppercase tracking-wider flex items-center gap-2">
            <span>🔗</span> Newly Introduced Cross-Layer Edges (
            {drift.newCrossLayerDependencies.length})
          </h4>
          <div className="space-y-2">
            {drift.newCrossLayerDependencies.map((dep, i) => (
              <div
                key={i}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-neutral-800 bg-neutral-950/70 p-3 text-xs"
              >
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded bg-blue-950/60 text-blue-300 border border-blue-800/50 font-mono text-[11px]">
                    {dep.sourceLayer}
                  </span>
                  <span className="text-neutral-400">➔</span>
                  <span className="px-2 py-0.5 rounded bg-purple-950/60 text-purple-300 border border-purple-800/50 font-mono text-[11px]">
                    {dep.targetLayer}
                  </span>
                </div>
                <span className="text-[11px] font-mono text-neutral-400 truncate max-w-xs">
                  {dep.sourceFile}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
