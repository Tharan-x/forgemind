'use client';

// =============================================================================
// ForgeMind Web — Architecture Impact Card Component
// =============================================================================

import React from 'react';
import type { ArchitectureImpact, ImpactLevel } from '@forgemind/types';

interface ArchitectureImpactCardProps {
  impact: ArchitectureImpact;
}

export function ArchitectureImpactCard({ impact }: ArchitectureImpactCardProps) {
  const getImpactBadgeStyle = (level: ImpactLevel) => {
    switch (level) {
      case 'CRITICAL':
        return 'bg-red-500/10 text-red-400 border-red-500/30 ring-1 ring-red-500/20';
      case 'HIGH':
        return 'bg-amber-500/10 text-amber-400 border-amber-500/30 ring-1 ring-amber-500/20';
      case 'MEDIUM':
        return 'bg-yellow-500/10 text-yellow-300 border-yellow-500/30 ring-1 ring-yellow-500/20';
      case 'LOW':
      default:
        return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 ring-1 ring-emerald-500/20';
    }
  };

  const getScoreDeltaBadgeStyle = (delta: number) => {
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
            <span className="text-lg">🎯</span>
            <h3 className="text-base font-semibold text-neutral-100">
              Architecture Impact Assessment
            </h3>
          </div>
          <p className="text-xs text-neutral-400 mt-1">
            Real-data analysis of structural changes, layer breaches, and dependency shifts for PR #
            {impact.prNumber ?? 'N/A'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs font-mono text-neutral-400">
            Commit: <code className="text-neutral-200">{impact.headSha.slice(0, 7)}</code>
          </span>
          <span
            className={`inline-flex items-center px-3 py-1 text-xs font-bold uppercase tracking-wider rounded-full border ${getImpactBadgeStyle(
              impact.overallImpactLevel,
            )}`}
          >
            {impact.overallImpactLevel} IMPACT
          </span>
        </div>
      </div>

      {/* Impact Reasoning Points */}
      {impact.impactReasoning.length > 0 && (
        <div className="rounded-lg bg-neutral-950/60 p-4 border border-neutral-800/80 space-y-2">
          <h4 className="text-xs font-medium text-neutral-300 uppercase tracking-wider">
            Key Architectural Drivers:
          </h4>
          <ul className="space-y-1.5 text-xs text-neutral-300 list-disc list-inside">
            {impact.impactReasoning.map((reason, i) => (
              <li key={i} className="leading-relaxed">
                {reason}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Metric Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Baseline Comparison */}
        <div className="rounded-lg border border-neutral-800 bg-neutral-950/40 p-4 space-y-1">
          <span className="text-xs font-medium text-neutral-400">Health Score Baseline</span>
          <div className="text-lg font-bold text-neutral-100 flex items-baseline gap-2">
            {impact.baselineComparison.prHealthScore}
            <span
              className={`text-xs ${getScoreDeltaBadgeStyle(impact.baselineComparison.scoreDelta)}`}
            >
              ({impact.baselineComparison.scoreDelta >= 0 ? '+' : ''}
              {impact.baselineComparison.scoreDelta} pts)
            </span>
          </div>
          <span className="text-[11px] text-neutral-400 block">
            Baseline: {impact.baselineComparison.baselineHealthScore ?? 'None'} (
            {impact.baselineComparison.healthTrend})
          </span>
        </div>

        {/* Affected Scope */}
        <div className="rounded-lg border border-neutral-800 bg-neutral-950/40 p-4 space-y-1">
          <span className="text-xs font-medium text-neutral-400">Files & Modules Touched</span>
          <div className="text-lg font-bold text-neutral-100">
            {impact.changedFiles.count}{' '}
            <span className="text-xs font-normal text-neutral-400">files</span>
          </div>
          <span className="text-[11px] text-neutral-400 block">
            {impact.affectedComponents.length} component(s) / {impact.affectedModules.length}{' '}
            module(s)
          </span>
        </div>

        {/* Dependency Graph Impact */}
        <div className="rounded-lg border border-neutral-800 bg-neutral-950/40 p-4 space-y-1">
          <span className="text-xs font-medium text-neutral-400">Dependency Churn</span>
          <div className="text-lg font-bold text-neutral-100">
            Δ {impact.dependencyImpact.totalDependencyDelta}{' '}
            <span className="text-xs font-normal text-neutral-400">edges</span>
          </div>
          <span className="text-[11px] text-neutral-400 block">
            +{impact.dependencyImpact.addedEdgesCount} added / -
            {impact.dependencyImpact.removedEdgesCount} removed
          </span>
        </div>

        {/* Introduced Risks */}
        <div className="rounded-lg border border-neutral-800 bg-neutral-950/40 p-4 space-y-1">
          <span className="text-xs font-medium text-neutral-400">New Architectural Risks</span>
          <div className="text-lg font-bold text-neutral-100 flex items-baseline gap-1.5">
            {impact.newlyIntroducedRisks.totalCount}
            {impact.newlyIntroducedRisks.criticalCount > 0 && (
              <span className="text-xs text-red-400">
                ({impact.newlyIntroducedRisks.criticalCount} Critical)
              </span>
            )}
          </div>
          <span className="text-[11px] text-neutral-400 block">
            Resolved: {impact.resolvedRisks.totalCount} issue(s)
          </span>
        </div>
      </div>

      {/* Architectural Scope Breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Affected Layers */}
        <div className="rounded-lg border border-neutral-800 bg-neutral-950/40 p-4 space-y-2">
          <h4 className="text-xs font-semibold text-neutral-300 uppercase tracking-wider">
            Touched Architectural Layers:
          </h4>
          <div className="flex flex-wrap gap-2">
            {impact.affectedLayers.map((layer, i) => (
              <span
                key={i}
                className="px-2.5 py-1 text-xs font-medium bg-neutral-800/80 text-neutral-200 border border-neutral-700/60 rounded-md"
              >
                🏛️ {layer}
              </span>
            ))}
          </div>
        </div>

        {/* Affected Components */}
        <div className="rounded-lg border border-neutral-800 bg-neutral-950/40 p-4 space-y-2">
          <h4 className="text-xs font-semibold text-neutral-300 uppercase tracking-wider">
            Affected Components & Packages:
          </h4>
          <div className="flex flex-wrap gap-2">
            {impact.affectedComponents.map((comp, i) => (
              <span
                key={i}
                className="px-2.5 py-1 text-xs font-mono bg-blue-950/40 text-blue-300 border border-blue-800/50 rounded-md"
              >
                📦 {comp}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Newly Introduced Risks Detail List */}
      {impact.newlyIntroducedRisks.items.length > 0 && (
        <div className="space-y-3 pt-2">
          <h4 className="text-xs font-semibold text-neutral-200 uppercase tracking-wider flex items-center gap-2">
            <span>🚨</span> Newly Introduced Architectural Risks (
            {impact.newlyIntroducedRisks.totalCount})
          </h4>
          <div className="space-y-2.5">
            {impact.newlyIntroducedRisks.items.map((risk, i) => (
              <div
                key={i}
                className="rounded-lg border border-neutral-800 bg-neutral-950/70 p-4 space-y-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-neutral-200">{risk.title}</span>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded border uppercase ${
                      risk.severity === 'critical'
                        ? 'bg-red-500/20 text-red-400 border-red-500/30'
                        : risk.severity === 'high'
                          ? 'bg-amber-500/20 text-amber-400 border-amber-500/30'
                          : 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30'
                    }`}
                  >
                    {risk.severity}
                  </span>
                </div>
                <p className="text-xs text-neutral-400 leading-relaxed">{risk.description}</p>
                {risk.affectedFilePaths && risk.affectedFilePaths.length > 0 && (
                  <div className="text-[11px] font-mono text-neutral-400">
                    Files: {risk.affectedFilePaths.join(', ')}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
