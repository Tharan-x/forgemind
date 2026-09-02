'use client';

import React, { useState, useEffect, useCallback } from 'react';
import type {
  RepositoryPRGatekeeperOverview,
  PRGatekeeperHistoryItem,
  PRGatekeeperDetailResponse,
  WebhookDeliveryLogItem,
  HealthFinding,
  ArchitectureImpact,
  ArchitectureDrift,
} from '@forgemind/types';

import {
  getGatekeeperOverview,
  getGatekeeperPRs,
  getGatekeeperPRDetail,
  getGatekeeperWebhooks,
  getPRArchitectureImpact,
  getPRArchitectureDrift,
} from '../../lib/gatekeeper.api';
import { AIExplanationDrawer } from '../health/AIExplanationDrawer';
import { ArchitectureImpactCard } from './ArchitectureImpactCard';
import { ArchitectureDriftCard } from './ArchitectureDriftCard';
import { GatekeeperSettingsForm } from './GatekeeperSettingsForm';
import { PRHealthComparisonCard } from './PRHealthComparisonCard';
import { WebhookDeliveryLogViewer } from './WebhookDeliveryLogViewer';

interface PRGatekeeperDashboardProps {
  repositoryId: string;
}

export const PRGatekeeperDashboard: React.FC<PRGatekeeperDashboardProps> = ({ repositoryId }) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'settings'>('overview');
  const [overview, setOverview] = useState<RepositoryPRGatekeeperOverview | null>(null);

  const [prItems, setPRItems] = useState<PRGatekeeperHistoryItem[]>([]);
  const [prTotal, setPRTotal] = useState(0);
  const [prPage, setPRPage] = useState(1);
  const [prTotalPages, setPRTotalPages] = useState(1);

  const [deliveries, setDeliveries] = useState<WebhookDeliveryLogItem[]>([]);
  const [whTotal, setWHTotal] = useState(0);
  const [whPage, setWHPage] = useState(1);
  const [whTotalPages, setWHTotalPages] = useState(1);

  const [selectedPRNumber, setSelectedPRNumber] = useState<number | null>(null);
  const [selectedPRDetail, setSelectedPRDetail] = useState<PRGatekeeperDetailResponse | null>(null);
  const [selectedPRImpact, setSelectedPRImpact] = useState<ArchitectureImpact | null>(null);
  const [selectedPRDrift, setSelectedPRDrift] = useState<ArchitectureDrift | null>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);

  const [isLoadingOverview, setIsLoadingOverview] = useState(true);
  const [isLoadingPRs, setIsLoadingPRs] = useState(true);
  const [isLoadingWebhooks, setIsLoadingWebhooks] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // AI Explanation Drawer State Bridge
  const [activeAIExplanationFinding, setActiveAIExplanationFinding] = useState<{
    id: string;
    category: 'circular_dependency' | 'layer_violation' | 'coupling_hotspot' | 'orphan_export';
    severity: 'critical' | 'high' | 'medium' | 'low';
    title: string;
    description: string;
    affectedNodeIds: string[];
    affectedFilePaths: string[];
    metrics: Record<string, unknown>;
    penaltyPoints: number;
  } | null>(null);

  // 1. Fetch Overview
  const fetchOverview = useCallback(async () => {
    try {
      setIsLoadingOverview(true);
      const data = await getGatekeeperOverview(repositoryId);
      setOverview(data);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to fetch gatekeeper overview';
      setError(msg);
    } finally {
      setIsLoadingOverview(false);
    }
  }, [repositoryId]);

  // 2. Fetch PR History
  const fetchPRs = useCallback(
    async (pageNum: number) => {
      try {
        setIsLoadingPRs(true);
        const res = await getGatekeeperPRs(repositoryId, pageNum, 10);
        setPRItems(res.items);
        setPRTotal(res.total);
        setPRTotalPages(res.totalPages);
        setPRPage(res.page);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to fetch PR history';
        setError(msg);
      } finally {
        setIsLoadingPRs(false);
      }
    },
    [repositoryId],
  );

  // 3. Fetch Webhook Logs
  const fetchWebhooks = useCallback(
    async (pageNum: number) => {
      try {
        setIsLoadingWebhooks(true);
        const res = await getGatekeeperWebhooks(repositoryId, pageNum, 10);
        setDeliveries(res.items);
        setWHTotal(res.total);
        setWHTotalPages(res.totalPages);
        setWHPage(res.page);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to fetch webhook logs';
        setError(msg);
      } finally {
        setIsLoadingWebhooks(false);
      }
    },
    [repositoryId],
  );

  useEffect(() => {
    fetchOverview();
    fetchPRs(1);
    fetchWebhooks(1);
  }, [fetchOverview, fetchPRs, fetchWebhooks]);

  // 4. Select PR detail
  const handleSelectPR = async (prNumber: number) => {
    if (selectedPRNumber === prNumber) {
      setSelectedPRNumber(null);
      setSelectedPRDetail(null);
      setSelectedPRImpact(null);
      setSelectedPRDrift(null);
      return;
    }

    try {
      setSelectedPRNumber(prNumber);
      setIsLoadingDetail(true);
      const [detail, impactResult, driftResult] = await Promise.all([
        getGatekeeperPRDetail(repositoryId, prNumber),
        getPRArchitectureImpact(repositoryId, prNumber).catch(() => null),
        getPRArchitectureDrift(repositoryId, prNumber).catch(() => null),
      ]);
      setSelectedPRDetail(detail);
      setSelectedPRImpact(impactResult);
      setSelectedPRDrift(driftResult);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load PR detail';
      setError(msg);
    } finally {
      setIsLoadingDetail(false);
    }
  };

  // Bridge finding to AI Explanation Drawer
  const handleInvestigateFinding = (finding: HealthFinding) => {
    setActiveAIExplanationFinding({
      id: finding.id,
      category: finding.category,
      severity: finding.severity,
      title: finding.title,
      description: finding.description,
      affectedNodeIds: finding.affectedNodeIds,
      affectedFilePaths: finding.affectedFilePaths,
      metrics: finding.metrics as Record<string, unknown>,
      penaltyPoints: finding.penaltyPoints,
    });
  };

  if (error) {
    return (
      <div className="rounded-xl border border-rose-500/30 bg-rose-950/20 p-6 text-rose-300">
        <h3 className="font-semibold text-lg">Failed to load PR Gatekeeper Dashboard</h3>
        <p className="mt-1 text-xs">{error}</p>
        <button
          onClick={() => {
            setError(null);
            fetchOverview();
            fetchPRs(1);
            fetchWebhooks(1);
          }}
          className="mt-4 rounded bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-500"
        >
          Retry Loading
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Sub-tab Navigation */}
      <div className="flex border-b border-zinc-800 space-x-4">
        <button
          onClick={() => setActiveTab('overview')}
          className={`pb-3 text-sm font-semibold transition-colors border-b-2 ${
            activeTab === 'overview'
              ? 'border-indigo-500 text-indigo-400'
              : 'border-transparent text-zinc-400 hover:text-zinc-200'
          }`}
        >
          🛡️ Gatekeeper Intelligence & Runs
        </button>
        <button
          onClick={() => setActiveTab('settings')}
          className={`pb-3 text-sm font-semibold transition-colors border-b-2 ${
            activeTab === 'settings'
              ? 'border-indigo-500 text-indigo-400'
              : 'border-transparent text-zinc-400 hover:text-zinc-200'
          }`}
        >
          ⚙️ Policy Settings & Webhook Setup
        </button>
      </div>

      {activeTab === 'settings' ? (
        <GatekeeperSettingsForm repositoryId={repositoryId} />
      ) : (
        <>
          {/* Overview Metric Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/80 p-4">
              <div className="text-xs font-medium text-zinc-400">PRs Analyzed</div>
              <div className="mt-1 text-2xl font-bold text-zinc-100">
                {isLoadingOverview ? '...' : (overview?.totalPRAnalyses ?? 0)}
              </div>
            </div>

            <div className="rounded-xl border border-zinc-800 bg-zinc-900/80 p-4">
              <div className="text-xs font-medium text-zinc-400">Pass Rate</div>
              <div className="mt-1 text-2xl font-bold text-emerald-400">
                {isLoadingOverview ? '...' : `${overview?.passRate ?? 100}%`}
              </div>
            </div>

            <div className="rounded-xl border border-zinc-800 bg-zinc-900/80 p-4">
              <div className="text-xs font-medium text-zinc-400">Passed</div>
              <div className="mt-1 text-2xl font-bold text-emerald-400">
                {isLoadingOverview ? '...' : (overview?.passedCount ?? 0)}
              </div>
            </div>

            <div className="rounded-xl border border-zinc-800 bg-zinc-900/80 p-4">
              <div className="text-xs font-medium text-zinc-400">Failed</div>
              <div className="mt-1 text-2xl font-bold text-rose-400">
                {isLoadingOverview ? '...' : (overview?.failedCount ?? 0)}
              </div>
            </div>

            <div className="rounded-xl border border-zinc-800 bg-zinc-900/80 p-4">
              <div className="text-xs font-medium text-zinc-400">Neutral</div>
              <div className="mt-1 text-2xl font-bold text-zinc-400">
                {isLoadingOverview ? '...' : (overview?.neutralCount ?? 0)}
              </div>
            </div>

            <div className="rounded-xl border border-zinc-800 bg-zinc-900/80 p-4">
              <div className="text-xs font-medium text-zinc-400">Active Regressions</div>
              <div className="mt-1 text-2xl font-bold text-amber-400">
                {isLoadingOverview ? '...' : (overview?.activeRegressionsCount ?? 0)}
              </div>
            </div>
          </div>

          {/* Selected PR Architecture Impact & Health Comparison View */}
          {isLoadingDetail ? (
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/80 p-6 text-center text-xs text-zinc-400 animate-pulse">
              Loading PR comparison analysis for PR #{selectedPRNumber}...
            </div>
          ) : (
            selectedPRDetail && (
              <div className="space-y-6">
                {selectedPRDrift && <ArchitectureDriftCard drift={selectedPRDrift} />}
                {selectedPRImpact && <ArchitectureImpactCard impact={selectedPRImpact} />}
                <PRHealthComparisonCard
                  detail={selectedPRDetail}
                  onInvestigateFinding={handleInvestigateFinding}
                  onClose={() => {
                    setSelectedPRNumber(null);
                    setSelectedPRDetail(null);
                    setSelectedPRImpact(null);
                    setSelectedPRDrift(null);
                  }}
                />
              </div>
            )
          )}

          {/* PR Analysis History Section */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/90 p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-zinc-100 flex items-center gap-2">
                  🛡️ PR Architecture Gatekeeper History
                </h3>
                <p className="text-xs text-zinc-400">
                  Automated PR checks, baseline health comparisons, and policy evaluation decisions
                </p>
              </div>
            </div>

            {isLoadingPRs ? (
              <div className="py-8 text-center text-xs text-zinc-400 animate-pulse">
                Loading PR history...
              </div>
            ) : prItems.length === 0 ? (
              <div className="py-8 text-center text-xs text-zinc-500 border border-dashed border-zinc-800 rounded-lg">
                No Pull Request architecture analyses recorded for this repository yet.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-zinc-300">
                  <thead className="border-b border-zinc-800 bg-zinc-950/60 uppercase text-[10px] text-zinc-400 font-semibold">
                    <tr>
                      <th className="py-2.5 px-3">PR Number</th>
                      <th className="py-2.5 px-3">Head SHA</th>
                      <th className="py-2.5 px-3">Status</th>
                      <th className="py-2.5 px-3">Outcome</th>
                      <th className="py-2.5 px-3">Health Score</th>
                      <th className="py-2.5 px-3">Delta</th>
                      <th className="py-2.5 px-3">Analyzed At</th>
                      <th className="py-2.5 px-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/60 font-mono">
                    {prItems.map((pr) => {
                      const isSelected = selectedPRNumber === pr.prNumber;
                      const outcomeColor =
                        pr.outcome === 'pass'
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                          : pr.outcome === 'fail'
                            ? 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                            : 'bg-zinc-500/10 text-zinc-400 border-zinc-500/30';

                      const outcomeBadge =
                        pr.outcome === 'pass'
                          ? '🟢 PASS'
                          : pr.outcome === 'fail'
                            ? '🔴 FAIL'
                            : '⚪ NEUTRAL';

                      const deltaStr =
                        pr.scoreDelta !== null
                          ? pr.scoreDelta >= 0
                            ? `+${pr.scoreDelta}`
                            : `${pr.scoreDelta}`
                          : 'N/A';

                      return (
                        <tr
                          key={pr.id}
                          className={`hover:bg-zinc-800/40 transition-colors ${
                            isSelected ? 'bg-indigo-950/30 border-l-2 border-l-indigo-500' : ''
                          }`}
                        >
                          <td className="py-2.5 px-3 font-bold font-sans text-zinc-100">
                            {pr.prNumber ? `PR #${pr.prNumber}` : 'Manual Run'}
                          </td>
                          <td className="py-2.5 px-3 text-zinc-300">
                            {pr.headSha?.slice(0, 7) || 'N/A'}
                          </td>
                          <td className="py-2.5 px-3 font-sans capitalize text-zinc-400">
                            {pr.status}
                          </td>
                          <td className="py-2.5 px-3 font-sans">
                            <span
                              className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-semibold ${outcomeColor}`}
                            >
                              {outcomeBadge}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 font-semibold text-zinc-100">
                            {pr.healthScore !== null ? `${pr.healthScore}/100` : 'N/A'}
                          </td>
                          <td className="py-2.5 px-3 text-zinc-300">{deltaStr}</td>
                          <td className="py-2.5 px-3 font-sans text-zinc-400">
                            {new Date(pr.createdAt).toLocaleString()}
                          </td>
                          <td className="py-2.5 px-3 text-right font-sans">
                            {pr.prNumber && (
                              <button
                                onClick={() => handleSelectPR(pr.prNumber as number)}
                                className={`rounded px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                                  isSelected
                                    ? 'bg-indigo-600 text-white'
                                    : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                                }`}
                              >
                                {isSelected ? 'Close Diff' : 'View Comparison'}
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* PR History Pagination */}
            {prTotalPages > 1 && (
              <div className="flex items-center justify-between pt-2 border-t border-zinc-800 text-xs">
                <span className="text-zinc-400">
                  Page {prPage} of {prTotalPages} ({prTotal} total runs)
                </span>
                <div className="flex gap-2">
                  <button
                    disabled={prPage <= 1}
                    onClick={() => fetchPRs(prPage - 1)}
                    className="rounded bg-zinc-800 px-3 py-1 text-zinc-200 disabled:opacity-40 hover:bg-zinc-700 transition-colors"
                  >
                    Previous
                  </button>
                  <button
                    disabled={prPage >= prTotalPages}
                    onClick={() => fetchPRs(prPage + 1)}
                    className="rounded bg-zinc-800 px-3 py-1 text-zinc-200 disabled:opacity-40 hover:bg-zinc-700 transition-colors"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Webhook Delivery Logs Section */}
          <WebhookDeliveryLogViewer
            deliveries={deliveries}
            total={whTotal}
            page={whPage}
            totalPages={whTotalPages}
            onPageChange={fetchWebhooks}
            isLoading={isLoadingWebhooks}
          />
        </>
      )}

      {/* AI Explanation Drawer Bridge */}

      {activeAIExplanationFinding && (
        <AIExplanationDrawer
          repositoryId={repositoryId}
          finding={activeAIExplanationFinding}
          isOpen={true}
          onClose={() => setActiveAIExplanationFinding(null)}
        />
      )}
    </div>
  );
};
