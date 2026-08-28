'use client';

// =============================================================================
// ForgeMind Web — Architectural Health & Anti-Pattern Dashboard Component
// =============================================================================

import React, { useEffect, useState, useMemo, useCallback } from 'react';
import type {
  ArchitectureHealthReport,
  HealthFinding,
  HealthFindingCategory,
  HealthFindingSeverity,
} from '@forgemind/types';
import { Button } from '@forgemind/ui';
import { getArchitectureHealth } from '@/lib/intelligence.api';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { AIExplanationDrawer } from './AIExplanationDrawer';
import { ArchitecturalRiskActionLoop } from './ArchitecturalRiskActionLoop';
import { ArchitecturalHealthHistoryTrend } from './ArchitecturalHealthHistoryTrend';

interface ArchitecturalHealthDashboardProps {
  repositoryId: string;
  onNavigateToGraph?: (finding: HealthFinding) => void;
  onInvestigateWithAI?: (finding: HealthFinding) => void;
}

export function ArchitecturalHealthDashboard({
  repositoryId,
  onNavigateToGraph,
  onInvestigateWithAI,
}: ArchitecturalHealthDashboardProps) {
  const [report, setReport] = useState<ArchitectureHealthReport | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // View Mode: 'risk_loop' | 'history' | 'findings'
  const [activeSubTab, setActiveSubTab] = useState<'risk_loop' | 'history' | 'findings'>(
    'risk_loop',
  );

  // Filter State
  const [severityFilter, setSeverityFilter] = useState<'all' | HealthFindingSeverity>('all');
  const [categoryFilter, setCategoryFilter] = useState<'all' | HealthFindingCategory>('all');

  // AI Drawer State
  const [activeDrawerFinding, setActiveDrawerFinding] = useState<HealthFinding | null>(null);

  const loadHealthReport = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getArchitectureHealth(repositoryId);
      setReport(res.data);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to retrieve architecture health report.',
      );
    } finally {
      setLoading(false);
    }
  }, [repositoryId]);

  useEffect(() => {
    void loadHealthReport();
  }, [loadHealthReport]);

  // Filtered & Sorted Findings
  const filteredFindings = useMemo(() => {
    if (!report) return [];
    return report.findings.filter((f) => {
      const matchSeverity = severityFilter === 'all' || f.severity === severityFilter;
      const matchCategory = categoryFilter === 'all' || f.category === categoryFilter;
      return matchSeverity && matchCategory;
    });
  }, [report, severityFilter, categoryFilter]);

  if (loading) {
    return (
      <div className="my-16 flex flex-col items-center justify-center space-y-4">
        <LoadingSpinner />
        <p className="text-sm text-zinc-400">
          Running 100% deterministic architectural health analysis...
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-6 text-center">
        <p className="text-lg font-semibold text-red-400">Failed to load Architectural Health</p>
        <p className="mt-2 text-sm text-zinc-400">{error}</p>
        <Button variant="outline" size="sm" onClick={loadHealthReport} className="mt-4">
          Try Again
        </Button>
      </div>
    );
  }

  if (!report) return null;

  const gradeColors: Record<string, string> = {
    'A+': 'text-emerald-400 border-emerald-500/40 bg-emerald-500/10',
    A: 'text-emerald-400 border-emerald-500/40 bg-emerald-500/10',
    'B+': 'text-cyan-400 border-cyan-500/40 bg-cyan-500/10',
    B: 'text-blue-400 border-blue-500/40 bg-blue-500/10',
    C: 'text-amber-400 border-amber-500/40 bg-amber-500/10',
    D: 'text-orange-400 border-orange-500/40 bg-orange-500/10',
    F: 'text-red-400 border-red-500/40 bg-red-500/10',
  };

  const severityBadges: Record<string, string> = {
    critical: 'bg-red-500/10 text-red-400 border-red-500/30',
    high: 'bg-orange-500/10 text-orange-400 border-orange-500/30',
    medium: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
    low: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
  };

  return (
    <div className="space-y-8">
      {/* Top Banner: Score Gauge & Grade */}
      <div className="flex flex-wrap items-center justify-between gap-6 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6 backdrop-blur-md">
        <div className="flex items-center gap-6">
          {/* Radial Score Gauge */}
          <div className="relative flex h-24 w-24 items-center justify-center rounded-full border-4 border-zinc-800 bg-zinc-950 font-mono text-2xl font-bold text-white shadow-xl">
            <span
              className={
                report.healthScore >= 90
                  ? 'text-emerald-400'
                  : report.healthScore >= 75
                    ? 'text-cyan-400'
                    : report.healthScore >= 60
                      ? 'text-amber-400'
                      : 'text-red-400'
              }
            >
              {report.healthScore}
            </span>
          </div>

          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-bold text-white">Architectural Health Index</h2>
              <span
                className={`rounded-lg border px-3 py-1 text-xs font-bold ${
                  gradeColors[report.grade] || gradeColors['C']
                }`}
              >
                Grade: {report.grade}
              </span>
            </div>
            <p className="mt-1 text-sm text-zinc-400">
              100% deterministic graph topology analysis & anti-pattern penalties
            </p>
          </div>
        </div>

        {/* Quick Summary Pills */}
        <div className="flex flex-wrap items-center gap-4 text-xs text-zinc-400">
          <div className="rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-2 text-center">
            <p className="text-zinc-500">Indexed Files</p>
            <p className="text-base font-bold text-white">{report.metrics.totalFiles}</p>
          </div>
          <div className="rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-2 text-center">
            <p className="text-zinc-500">Dependencies</p>
            <p className="text-base font-bold text-white">{report.metrics.totalDependencies}</p>
          </div>
          <div className="rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-2 text-center">
            <p className="text-zinc-500">Total Findings</p>
            <p className="text-base font-bold text-amber-400">{report.findings.length}</p>
          </div>
        </div>
      </div>

      {/* Score Breakdown Category Penalty Cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
          <p className="text-xs text-zinc-400">Circular Cycles</p>
          <div className="mt-2 flex items-baseline justify-between">
            <p className="text-lg font-bold text-red-400">
              {report.metrics.circularCycleCount} cycles
            </p>
            <span className="text-xs text-red-400">-{report.scoreBreakdown.cyclePenalty} pts</span>
          </div>
        </div>

        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
          <p className="text-xs text-zinc-400">Layer Violations</p>
          <div className="mt-2 flex items-baseline justify-between">
            <p className="text-lg font-bold text-orange-400">
              {report.metrics.layerViolationCount} breaches
            </p>
            <span className="text-xs text-orange-400">
              -{report.scoreBreakdown.layerViolationPenalty} pts
            </span>
          </div>
        </div>

        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
          <p className="text-xs text-zinc-400">Coupling Hotspots</p>
          <div className="mt-2 flex items-baseline justify-between">
            <p className="text-lg font-bold text-amber-400">{report.metrics.hotspotCount} hubs</p>
            <span className="text-xs text-amber-400">
              -{report.scoreBreakdown.hotspotPenalty} pts
            </span>
          </div>
        </div>

        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
          <p className="text-xs text-zinc-400">Orphan Exports</p>
          <div className="mt-2 flex items-baseline justify-between">
            <p className="text-lg font-bold text-blue-400">
              {report.metrics.orphanExportCount} symbols
            </p>
            <span className="text-xs text-blue-400">
              -{report.scoreBreakdown.orphanPenalty} pts
            </span>
          </div>
        </div>
      </div>

      {/* Sub-Navigation Bar */}
      <div className="flex items-center space-x-4 border-b border-zinc-800 pb-2 text-sm font-semibold">
        <button
          type="button"
          onClick={() => setActiveSubTab('risk_loop')}
          className={`py-2 px-3 rounded-lg transition-all flex items-center gap-2 ${
            activeSubTab === 'risk_loop'
              ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
              : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <span>🎯</span>
          <span>Risk Action Loop & Action Plans</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('history')}
          className={`py-2 px-3 rounded-lg transition-all flex items-center gap-2 ${
            activeSubTab === 'history'
              ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
              : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <span>📈</span>
          <span>Health History & Regression Diff</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('findings')}
          className={`py-2 px-3 rounded-lg transition-all flex items-center gap-2 ${
            activeSubTab === 'findings'
              ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
              : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <span>📋</span>
          <span>Detailed Anti-Pattern Findings ({report.findings.length})</span>
        </button>
      </div>

      {activeSubTab === 'risk_loop' ? (
        <ArchitecturalRiskActionLoop repositoryId={repositoryId} />
      ) : activeSubTab === 'history' ? (
        <ArchitecturalHealthHistoryTrend repositoryId={repositoryId} />
      ) : (
        <>
          {/* Filter Bar */}
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="mr-2 text-zinc-400">Severity:</span>
              {(['all', 'critical', 'high', 'medium', 'low'] as const).map((sev) => (
                <button
                  key={sev}
                  onClick={() => setSeverityFilter(sev)}
                  className={`rounded-lg px-3 py-1.5 font-medium transition ${
                    severityFilter === sev
                      ? 'bg-zinc-100 text-zinc-950 font-bold'
                      : 'bg-zinc-950 text-zinc-400 hover:text-white'
                  }`}
                >
                  {sev.toUpperCase()}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2 text-xs">
              <span className="text-zinc-400">Category:</span>
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value as 'all' | HealthFindingCategory)}
                className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-1.5 text-zinc-200 focus:border-cyan-500 focus:outline-none"
              >
                <option value="all">All Categories</option>
                <option value="circular_dependency">Circular Dependencies</option>
                <option value="layer_violation">Layer Violations</option>
                <option value="coupling_hotspot">Coupling Hotspots</option>
                <option value="orphan_export">Orphan Exports</option>
              </select>
            </div>
          </div>

          {/* Findings List */}
          {filteredFindings.length === 0 ? (
            <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-8 text-center">
              <p className="text-lg font-bold text-emerald-400">🎉 Excellent Architecture!</p>
              <p className="mt-1 text-sm text-zinc-400">
                No architectural anti-patterns detected for the selected filters.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredFindings.map((finding) => (
                <div
                  key={finding.id}
                  className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 transition hover:border-zinc-700"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span
                        className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold uppercase ${
                          severityBadges[finding.severity] || severityBadges['medium']
                        }`}
                      >
                        {finding.severity}
                      </span>
                      <span className="text-xs font-mono text-zinc-500">{finding.category}</span>
                    </div>
                    <h3 className="text-base font-bold text-white">{finding.title}</h3>
                    <p className="text-xs text-zinc-400">{finding.description}</p>
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {finding.affectedFilePaths.slice(0, 3).map((p) => (
                        <code
                          key={p}
                          className="rounded bg-zinc-950 px-2 py-0.5 text-[11px] text-cyan-400"
                        >
                          {p}
                        </code>
                      ))}
                      {finding.affectedFilePaths.length > 3 && (
                        <span className="text-[11px] text-zinc-500">
                          +{finding.affectedFilePaths.length - 3} more
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    {onNavigateToGraph && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onNavigateToGraph(finding)}
                      >
                        🔍 Highlight on Graph
                      </Button>
                    )}
                    {onInvestigateWithAI && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onInvestigateWithAI(finding)}
                        className="border-cyan-500/30 text-cyan-300 hover:bg-cyan-950/40"
                      >
                        🤖 Investigate with AI
                      </Button>
                    )}
                    <Button
                      variant="default"
                      size="sm"
                      onClick={() => setActiveDrawerFinding(finding)}
                    >
                      ⚡ Explain & Fix with AI
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Slide-over AI Refactoring Drawer */}

      <AIExplanationDrawer
        repositoryId={repositoryId}
        finding={activeDrawerFinding}
        isOpen={Boolean(activeDrawerFinding)}
        onClose={() => setActiveDrawerFinding(null)}
        onHighlightOnGraph={onNavigateToGraph}
        onInvestigateWithAI={onInvestigateWithAI}
      />
    </div>
  );
}
