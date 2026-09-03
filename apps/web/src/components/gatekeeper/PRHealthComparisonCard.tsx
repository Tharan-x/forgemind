import React, { useState } from 'react';
import type {
  PRGatekeeperDetailResponse,
  HealthFinding,
  WhatIfScenarioType,
  ArchitectureDecision,
} from '@forgemind/types';
import { getRemediationWhatIfScenario } from '../health/StructuredRemediationPlanView';
import { getArchitectureDecisions } from '../../lib/intelligence.api';

const PRFindingDecisionMemorySection: React.FC<{
  repositoryId: string;
  filePath: string;
}> = ({ repositoryId, filePath }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [fetched, setFetched] = useState(false);
  const [decisions, setDecisions] = useState<ArchitectureDecision[]>([]);
  const [error, setError] = useState<string | null>(null);

  if (!repositoryId) return null;

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
    <div className="w-full">
      <button
        type="button"
        onClick={handleToggle}
        className="px-2 py-1 text-xs font-semibold text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 rounded transition-colors"
        title="View Decision Memory for affected file"
      >
        📜 Decision Memory
      </button>

      {isOpen && (
        <div className="mt-3 rounded-lg border border-zinc-800 bg-zinc-950 p-3 text-xs space-y-2 text-left w-full">
          <div className="flex items-center justify-between font-semibold text-zinc-300 border-b border-zinc-800 pb-1.5">
            <span>📜 Historical Architecture Decisions</span>
            {loading && <span className="text-[11px] text-zinc-400 animate-pulse">Loading...</span>}
          </div>

          {error && (
            <p className="text-zinc-500 text-[11px]">
              No historical architecture decisions found for this file.
            </p>
          )}

          {!loading && fetched && !error && decisions.length === 0 && (
            <p className="text-zinc-500 text-[11px]">
              No historical architecture decisions found for this file.
            </p>
          )}

          {!loading && decisions.length > 0 && (
            <div className="space-y-2">
              {decisions.map((dec) => (
                <div
                  key={dec.id}
                  className="rounded border border-zinc-800/80 bg-zinc-900/60 p-2 text-[11px] space-y-1"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-zinc-200">
                      {dec.prTitle || dec.commitMessage || 'Architecture Decision'}
                    </span>
                    <span
                      className={`rounded px-1.5 py-0.5 text-[9px] font-bold uppercase ${
                        dec.isConfirmed
                          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                          : 'bg-zinc-700/50 text-zinc-300 border border-zinc-600/30'
                      }`}
                    >
                      {dec.isConfirmed ? 'Confirmed' : 'Mined'}
                    </span>
                  </div>

                  {(dec.author || dec.committedAt || dec.prNumber) && (
                    <div className="flex flex-wrap items-center gap-2 text-[10px] text-zinc-400">
                      {dec.author && <span>Author: {dec.author}</span>}
                      {dec.committedAt && (
                        <span>Date: {new Date(dec.committedAt).toLocaleDateString()}</span>
                      )}
                      {dec.prNumber && <span>PR #{dec.prNumber}</span>}
                    </div>
                  )}

                  {dec.synthesis?.rationale ? (
                    <p className="text-zinc-300 text-[10px] leading-normal">
                      {dec.synthesis.rationale}
                    </p>
                  ) : (
                    dec.commitMessage && (
                      <p className="text-zinc-400 italic text-[10px]">{dec.commitMessage}</p>
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

interface PRHealthComparisonCardProps {
  detail: PRGatekeeperDetailResponse;
  repositoryId?: string;
  onInvestigateFinding?: (finding: HealthFinding) => void;
  onHighlightOnGraph?: (nodeIds: string[]) => void;
  onSimulateRefactor?: (sourcePath: string, scenario: WhatIfScenarioType) => void;
  onViewHistory?: (filePath: string) => void;
  onClose?: () => void;
}

export const PRHealthComparisonCard: React.FC<PRHealthComparisonCardProps> = ({
  detail,
  repositoryId,
  onInvestigateFinding,
  onHighlightOnGraph,
  onSimulateRefactor,
  onViewHistory,
  onClose,
}) => {
  const { policyResult, comparison, snapshot, baseline, prNumber, headSha, baseSha } = detail;
  const activeRepoId = repositoryId || comparison?.repositoryId || '';
  const outcome = policyResult.outcome;

  const outcomeColor =
    outcome === 'pass'
      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
      : outcome === 'fail'
        ? 'bg-rose-500/10 text-rose-400 border-rose-500/30'
        : 'bg-zinc-500/10 text-zinc-400 border-zinc-500/30';

  const outcomeBadgeText =
    outcome === 'pass' ? '🟢 PASS' : outcome === 'fail' ? '🔴 FAIL' : '⚪ NEUTRAL';

  const deltaFormatted =
    policyResult.healthDelta >= 0 ? `+${policyResult.healthDelta}` : `${policyResult.healthDelta}`;

  const deltaBadgeColor =
    policyResult.healthDelta > 0
      ? 'text-emerald-400'
      : policyResult.healthDelta < 0
        ? 'text-rose-400'
        : 'text-zinc-400';

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/90 p-6 shadow-xl space-y-6">
      {/* Top Header */}
      <div className="flex items-center justify-between border-b border-zinc-800 pb-4">
        <div>
          <div className="flex items-center gap-3">
            <h3 className="text-xl font-semibold text-zinc-100">
              PR #{prNumber} Architecture Comparison
            </h3>
            <span
              className={`inline-flex items-center rounded-full border px-3 py-0.5 text-xs font-semibold ${outcomeColor}`}
            >
              {outcomeBadgeText}
            </span>
          </div>
          <p className="mt-1 text-xs text-zinc-400 font-mono">
            Head: <span className="text-zinc-300">{headSha?.slice(0, 7) || 'N/A'}</span>
            {baseSha && (
              <>
                {' '}
                | Base: <span className="text-zinc-300">{baseSha.slice(0, 7)}</span>
              </>
            )}
          </p>
        </div>

        {onClose && (
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 transition-colors"
            title="Close comparison view"
          >
            ✕
          </button>
        )}
      </div>

      {/* Health Metric Stat Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-4">
          <div className="text-xs font-medium text-zinc-400">PR Health Score</div>
          <div className="mt-1 text-2xl font-bold text-zinc-100">
            {policyResult.prHealthScore}/100
            {snapshot && (
              <span className="ml-2 text-sm font-semibold text-indigo-400">
                Grade {snapshot.grade}
              </span>
            )}
          </div>
        </div>

        <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-4">
          <div className="text-xs font-medium text-zinc-400">Baseline Score</div>
          <div className="mt-1 text-2xl font-bold text-zinc-100">
            {baseline ? `${baseline.healthScore}/100` : 'N/A'}
          </div>
          <div className="text-[11px] text-zinc-500">
            {baseline
              ? `Commit ${baseline.commitHash?.slice(0, 7) || 'N/A'}`
              : 'No baseline snapshot'}
          </div>
        </div>

        <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-4">
          <div className="text-xs font-medium text-zinc-400">Health Delta</div>
          <div className={`mt-1 text-2xl font-bold ${deltaBadgeColor}`}>
            {baseline ? `${deltaFormatted} pts` : '0 pts'}
          </div>
        </div>

        <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-4">
          <div className="text-xs font-medium text-zinc-400">Regressions Introduced</div>
          <div className="mt-1 text-2xl font-bold text-rose-400">
            {policyResult.newCircularCyclesCount + policyResult.newLayerViolationsCount}
          </div>
          <div className="text-[11px] text-zinc-400">
            {policyResult.newCircularCyclesCount} cycles, {policyResult.newLayerViolationsCount}{' '}
            layer violations
          </div>
        </div>
      </div>

      {/* Policy Status Banner */}
      <div className={`rounded-lg border p-4 ${outcomeColor}`}>
        <div className="font-semibold text-sm">{policyResult.statusDescription}</div>
        {policyResult.reasons.length > 0 && (
          <ul className="mt-2 space-y-1 text-xs list-disc list-inside">
            {policyResult.reasons.map((reason, idx) => (
              <li key={idx}>{reason}</li>
            ))}
          </ul>
        )}
      </div>

      {/* Newly Introduced Anti-Patterns & Regressions */}
      {comparison && comparison.newFindings.length > 0 ? (
        <div className="space-y-3">
          <h4 className="text-sm font-semibold text-rose-300 flex items-center gap-2">
            ⚠️ Newly Introduced Architectural Anti-Patterns ({comparison.newFindings.length})
          </h4>
          <div className="space-y-2">
            {comparison.newFindings.map((finding) => {
              const supportedScenario = getRemediationWhatIfScenario(finding.category);
              const sourcePath = finding.affectedFilePaths[0];

              return (
                <div
                  key={finding.id}
                  className="rounded-lg border border-rose-500/20 bg-rose-950/20 p-4 flex flex-col md:flex-row md:items-center justify-between gap-3"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="rounded bg-rose-500/20 px-2 py-0.5 text-[10px] font-bold text-rose-400 uppercase">
                        {finding.severity}
                      </span>
                      <span className="text-sm font-semibold text-zinc-100">{finding.title}</span>
                    </div>
                    <p className="mt-1 text-xs text-zinc-300">{finding.description}</p>
                    {finding.affectedFilePaths.length > 0 && (
                      <div className="mt-2 text-[11px] text-zinc-400 font-mono">
                        Files: {finding.affectedFilePaths.join(', ')}
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2 pt-2 md:pt-0 shrink-0 font-sans">
                    {finding.affectedNodeIds &&
                      finding.affectedNodeIds.length > 0 &&
                      onHighlightOnGraph && (
                        <button
                          type="button"
                          onClick={() => onHighlightOnGraph(finding.affectedNodeIds)}
                          className="px-2 py-1 text-xs font-semibold text-indigo-300 bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/30 rounded transition-colors"
                          title="Highlight on Graph"
                        >
                          🔍 Highlight on Graph
                        </button>
                      )}
                    {supportedScenario && sourcePath && onSimulateRefactor && (
                      <button
                        type="button"
                        onClick={() => onSimulateRefactor(sourcePath, supportedScenario)}
                        className="px-2 py-1 text-xs font-semibold text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 rounded transition-colors"
                        title="Simulate Proposed Fix in What-If Simulator"
                      >
                        🔮 Simulate Fix
                      </button>
                    )}
                    {sourcePath && onViewHistory && (
                      <button
                        type="button"
                        onClick={() => onViewHistory(sourcePath)}
                        className="px-2 py-1 text-xs font-semibold text-neutral-300 bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 rounded transition-colors"
                        title="View History in Time Machine"
                      >
                        ⏳ View History
                      </button>
                    )}
                    {onInvestigateFinding && (
                      <button
                        type="button"
                        onClick={() => onInvestigateFinding(finding)}
                        className="shrink-0 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500 transition-colors flex items-center gap-1.5"
                      >
                        ✨ Ask AI
                      </button>
                    )}
                  </div>
                  {sourcePath && (
                    <div className="w-full pt-2">
                      <PRFindingDecisionMemorySection
                        repositoryId={activeRepoId}
                        filePath={sourcePath}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-4 text-center text-xs text-zinc-400">
          No new architectural anti-patterns introduced in this PR.
        </div>
      )}

      {/* Resolved Findings in PR */}
      {comparison && comparison.resolvedFindings.length > 0 && (
        <div className="space-y-3">
          <h4 className="text-sm font-semibold text-emerald-400 flex items-center gap-2">
            ✅ Architectural Anti-Patterns Resolved in this PR ({comparison.resolvedFindings.length}
            )
          </h4>
          <div className="space-y-2">
            {comparison.resolvedFindings.map((finding) => (
              <div
                key={finding.id}
                className="rounded-lg border border-emerald-500/20 bg-emerald-950/20 p-3 text-xs text-zinc-300"
              >
                <span className="font-semibold text-emerald-300">{finding.title}</span> —{' '}
                {finding.description}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
