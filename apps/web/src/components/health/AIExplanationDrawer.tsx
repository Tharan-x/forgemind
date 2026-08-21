'use client';

// =============================================================================
// ForgeMind Web — AI Refactoring Explanation & Provenance Drawer
// =============================================================================

import React, { useEffect, useState } from 'react';
import type { ArchitectureHealthExplanationResponse, HealthFinding } from '@forgemind/types';
import { Button } from '@forgemind/ui';
import { explainArchitectureFinding } from '@/lib/intelligence.api';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';

interface AIExplanationDrawerProps {
  repositoryId: string;
  finding: HealthFinding | null;
  isOpen: boolean;
  onClose: () => void;
  onHighlightOnGraph?: (finding: HealthFinding) => void;
}

export function AIExplanationDrawer({
  repositoryId,
  finding,
  isOpen,
  onClose,
  onHighlightOnGraph,
}: AIExplanationDrawerProps) {
  const [data, setData] = useState<ArchitectureHealthExplanationResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !finding) {
      setData(null);
      setError(null);
      return;
    }

    let isMounted = true;
    setLoading(true);
    setError(null);

    explainArchitectureFinding(repositoryId, {
      findingId: finding.id,
      category: finding.category,
      affectedFiles: finding.affectedFilePaths,
    })
      .then((res) => {
        if (isMounted) {
          setData(res.data);
        }
      })
      .catch((err) => {
        if (isMounted) {
          setError(
            err instanceof Error ? err.message : 'Failed to retrieve AI architecture explanation.',
          );
        }
      })
      .finally(() => {
        if (isMounted) {
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [repositoryId, finding, isOpen]);

  if (!isOpen || !finding) return null;

  const severityColors: Record<string, string> = {
    critical: 'bg-red-500/10 text-red-400 border-red-500/30',
    high: 'bg-orange-500/10 text-orange-400 border-orange-500/30',
    medium: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
    low: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-black/60 backdrop-blur-sm">
      <div className="absolute inset-y-0 right-0 flex max-w-full pl-10">
        <div className="w-screen max-w-2xl border-l border-zinc-800 bg-zinc-950 p-6 shadow-2xl overflow-y-auto">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-zinc-800 pb-4">
            <div>
              <div className="flex items-center gap-2">
                <span
                  className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold uppercase ${
                    severityColors[finding.severity] || severityColors['medium']
                  }`}
                >
                  {finding.severity}
                </span>
                <span className="text-xs text-zinc-400 font-mono">{finding.id}</span>
              </div>
              <h2 className="mt-2 text-xl font-bold text-white">{finding.title}</h2>
            </div>
            <button
              onClick={onClose}
              className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-800 hover:text-white"
            >
              ✕
            </button>
          </div>

          {/* Action Bar */}
          <div className="mt-4 flex flex-wrap items-center gap-3 border-b border-zinc-800 pb-4">
            {onHighlightOnGraph && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  onHighlightOnGraph(finding);
                  onClose();
                }}
              >
                🔍 Highlight on Graph
              </Button>
            )}
          </div>

          {/* Deterministic Section */}
          <div className="mt-6 rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
              Deterministic Finding Evidence
            </h3>
            <p className="mt-2 text-sm text-zinc-300">{finding.description}</p>

            <div className="mt-4">
              <p className="text-xs font-medium text-zinc-400">Affected Code Files:</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {finding.affectedFilePaths.map((p) => (
                  <code
                    key={p}
                    className="rounded bg-zinc-800 px-2 py-1 text-xs text-cyan-400 font-mono"
                  >
                    {p}
                  </code>
                ))}
              </div>
            </div>
          </div>

          {/* Loading State */}
          {loading && (
            <div className="my-12 flex flex-col items-center justify-center space-y-4">
              <LoadingSpinner />
              <p className="text-sm text-zinc-400">
                Retrieving vector code context and generating AI refactoring roadmap...
              </p>
            </div>
          )}

          {/* Error State */}
          {error && (
            <div className="my-6 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400">
              <p className="font-semibold">Failed to load AI explanation</p>
              <p className="mt-1">{error}</p>
            </div>
          )}

          {/* AI Explanation Content */}
          {!loading && data && (
            <div className="mt-6 space-y-6">
              {/* Badge Declaration */}
              <div className="rounded-lg border border-purple-500/30 bg-purple-500/10 px-3 py-2 text-xs text-purple-300">
                ⚡ AI-GENERATED REMEDIATION — GROUNDED IN REPOSITORY EVIDENCE ({data.providerUsed})
              </div>

              {/* Natural Language Explanation */}
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
                <h3 className="text-sm font-semibold text-zinc-200">
                  Architectural Context & Risk
                </h3>
                <p className="mt-2 whitespace-pre-wrap text-sm text-zinc-300 leading-relaxed">
                  {data.explanation}
                </p>
              </div>

              {/* Remediation Plan */}
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4">
                <h3 className="text-sm font-semibold text-emerald-400">
                  Recommended Refactoring Plan
                </h3>
                <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-zinc-300">
                  {data.remediationSteps.map((step, idx) => (
                    <li key={idx} className="leading-relaxed">
                      {step}
                    </li>
                  ))}
                </ol>
              </div>

              {/* Blast Radius Context */}
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
                <h3 className="text-sm font-semibold text-zinc-200">
                  Calculated Blast Radius ({data.blastRadius.blastRadiusScore} points)
                </h3>
                <div className="mt-3 grid grid-cols-2 gap-4 text-center">
                  <div className="rounded-lg bg-zinc-950 p-3">
                    <p className="text-xs text-zinc-400">Direct Dependents</p>
                    <p className="text-lg font-bold text-amber-400">
                      {data.blastRadius.directDependents.length}
                    </p>
                  </div>
                  <div className="rounded-lg bg-zinc-950 p-3">
                    <p className="text-xs text-zinc-400">Transitive Dependents</p>
                    <p className="text-lg font-bold text-purple-400">
                      {data.blastRadius.transitiveDependents.length}
                    </p>
                  </div>
                </div>
              </div>

              {/* Provenance & Line Citations */}
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
                <h3 className="text-sm font-semibold text-zinc-200">
                  Retrieved Code Evidence & Provenance
                </h3>
                {data.sources.length === 0 ? (
                  <p className="mt-2 text-xs text-zinc-500">No direct code chunks retrieved.</p>
                ) : (
                  <div className="mt-3 space-y-3">
                    {data.sources.map((src, idx) => (
                      <div
                        key={idx}
                        className="rounded-lg border border-zinc-800 bg-zinc-950 p-3 text-xs"
                      >
                        <div className="flex items-center justify-between border-b border-zinc-800/60 pb-2">
                          <span className="font-mono text-cyan-400">
                            {src.filePath}:{src.startLine}-{src.endLine}
                          </span>
                          <span className="text-zinc-500">
                            Similarity: {(src.score * 100).toFixed(0)}%
                          </span>
                        </div>
                        <pre className="mt-2 overflow-x-auto font-mono text-zinc-300">
                          {src.content}
                        </pre>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
