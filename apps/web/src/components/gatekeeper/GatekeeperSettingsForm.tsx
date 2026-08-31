/* eslint-disable @typescript-eslint/no-unused-vars */
'use client';

// =============================================================================
// ForgeMind Web — PR Gatekeeper Settings Form & Webhook Status Panel
// =============================================================================

import type { RepositoryGatekeeperConfig, WebhookStatusResponse } from '@forgemind/types';
import React, { useState, useEffect } from 'react';
import {
  getGatekeeperConfig,
  updateGatekeeperConfig,
  resetGatekeeperConfig,
  getWebhookStatus,
} from '../../lib/gatekeeper.api';

interface GatekeeperSettingsFormProps {
  repositoryId: string;
}

export function GatekeeperSettingsForm({ repositoryId }: GatekeeperSettingsFormProps) {
  const [_config, setConfig] = useState<RepositoryGatekeeperConfig | null>(null);

  const [webhookStatus, setWebhookStatus] = useState<WebhookStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Form State
  const [enabled, setEnabled] = useState(true);
  const [maxScoreDegradation, setMaxScoreDegradation] = useState(5);
  const [blockOnNewCriticalFindings, setBlockOnNewCriticalFindings] = useState(true);
  const [blockOnNewHighFindings, setBlockOnNewHighFindings] = useState(false);
  const [blockOnNewCircularCycles, setBlockOnNewCircularCycles] = useState(true);
  const [blockOnNewLayerViolations, setBlockOnNewLayerViolations] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function loadData() {
      try {
        setLoading(true);
        setError(null);
        const [cfg, status] = await Promise.all([
          getGatekeeperConfig(repositoryId),
          getWebhookStatus(repositoryId),
        ]);

        if (!mounted) return;

        setConfig(cfg);
        setWebhookStatus(status);

        setEnabled(cfg.enabled);
        setMaxScoreDegradation(cfg.maxScoreDegradation);
        setBlockOnNewCriticalFindings(cfg.blockOnNewCriticalFindings);
        setBlockOnNewHighFindings(cfg.blockOnNewHighFindings);
        setBlockOnNewCircularCycles(cfg.blockOnNewCircularCycles);
        setBlockOnNewLayerViolations(cfg.blockOnNewLayerViolations);
      } catch (err) {
        if (!mounted) return;
        const msg = err instanceof Error ? err.message : 'Failed to load gatekeeper settings.';
        setError(msg);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    void loadData();
    return () => {
      mounted = false;
    };
  }, [repositoryId]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSaving(true);
      setError(null);
      setSuccessMessage(null);

      const updated = await updateGatekeeperConfig(repositoryId, {
        enabled,
        maxScoreDegradation: Number(maxScoreDegradation),
        blockOnNewCriticalFindings,
        blockOnNewHighFindings,
        blockOnNewCircularCycles,
        blockOnNewLayerViolations,
      });

      setConfig(updated);
      setSuccessMessage('PR Gatekeeper policy configuration updated successfully!');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to save gatekeeper configuration.';
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    try {
      setResetting(true);
      setError(null);
      setSuccessMessage(null);

      const reset = await resetGatekeeperConfig(repositoryId);

      setConfig(reset);
      setEnabled(reset.enabled);
      setMaxScoreDegradation(reset.maxScoreDegradation);
      setBlockOnNewCriticalFindings(reset.blockOnNewCriticalFindings);
      setBlockOnNewHighFindings(reset.blockOnNewHighFindings);
      setBlockOnNewCircularCycles(reset.blockOnNewCircularCycles);
      setBlockOnNewLayerViolations(reset.blockOnNewLayerViolations);

      setSuccessMessage('Gatekeeper policy configuration reset to system defaults.');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to reset gatekeeper configuration.';
      setError(msg);
    } finally {
      setResetting(false);
    }
  };

  if (loading) {
    return (
      <div className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-8 text-center">
        <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
        <p className="mt-2 text-sm text-neutral-400">Loading PR Gatekeeper settings...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* 1. Notifications */}
      {error && (
        <div
          className="rounded-md border border-red-500/30 bg-red-950/40 p-4 text-sm text-red-400"
          role="alert"
        >
          <span className="font-semibold">Error: </span>
          {error}
        </div>
      )}

      {successMessage && (
        <div
          className="rounded-md border border-emerald-500/30 bg-emerald-950/40 p-4 text-sm text-emerald-400"
          role="status"
        >
          <span className="font-semibold">Success: </span>
          {successMessage}
        </div>
      )}

      {/* 2. Custom Policy Form */}
      <form
        onSubmit={handleSave}
        className="rounded-lg border border-neutral-800 bg-neutral-900/70 p-6 space-y-6"
      >
        <div className="flex items-center justify-between border-b border-neutral-800 pb-4">
          <div>
            <h3 className="text-lg font-semibold text-neutral-100">
              PR Gatekeeper Policy Settings
            </h3>
            <p className="text-xs text-neutral-400">
              Configure baseline degradation thresholds and PR block criteria for this repository.
            </p>
          </div>
          <button
            type="button"
            onClick={handleReset}
            disabled={resetting || saving}
            className="rounded bg-neutral-800 px-3 py-1.5 text-xs font-medium text-neutral-300 hover:bg-neutral-700 disabled:opacity-50"
          >
            {resetting ? 'Resetting...' : 'Reset to Defaults'}
          </button>
        </div>

        {/* Enabled Toggle */}
        <div className="flex items-center justify-between">
          <div>
            <label className="text-sm font-medium text-neutral-200">Gatekeeper Enabled</label>
            <p className="text-xs text-neutral-400">
              Master switch for automated PR architecture policy enforcement.
            </p>
          </div>
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            className="h-5 w-5 rounded border-neutral-700 bg-neutral-800 text-indigo-600 focus:ring-indigo-500"
          />
        </div>

        {/* Max Score Degradation */}
        <div className="space-y-1">
          <label className="text-sm font-medium text-neutral-200">
            Maximum Allowed Score Drop (Points)
          </label>
          <p className="text-xs text-neutral-400">
            Fail PR if health score drops by more than this value relative to target branch
            baseline.
          </p>
          <input
            type="number"
            min="0"
            max="100"
            value={maxScoreDegradation}
            onChange={(e) => setMaxScoreDegradation(parseInt(e.target.value, 10) || 0)}
            className="w-32 rounded border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-sm text-neutral-100 focus:border-indigo-500 focus:outline-none"
          />
        </div>

        {/* Block Controls */}
        <div className="space-y-3 pt-2">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
            Block Criteria
          </h4>

          <div className="flex items-center justify-between">
            <span className="text-sm text-neutral-300">
              Block PR on new Critical severity findings
            </span>
            <input
              type="checkbox"
              checked={blockOnNewCriticalFindings}
              onChange={(e) => setBlockOnNewCriticalFindings(e.target.checked)}
              className="h-4 w-4 rounded border-neutral-700 bg-neutral-800 text-indigo-600"
            />
          </div>

          <div className="flex items-center justify-between">
            <span className="text-sm text-neutral-300">Block PR on new High severity findings</span>
            <input
              type="checkbox"
              checked={blockOnNewHighFindings}
              onChange={(e) => setBlockOnNewHighFindings(e.target.checked)}
              className="h-4 w-4 rounded border-neutral-700 bg-neutral-800 text-indigo-600"
            />
          </div>

          <div className="flex items-center justify-between">
            <span className="text-sm text-neutral-300">
              Block PR on new Circular Dependency cycles
            </span>
            <input
              type="checkbox"
              checked={blockOnNewCircularCycles}
              onChange={(e) => setBlockOnNewCircularCycles(e.target.checked)}
              className="h-4 w-4 rounded border-neutral-700 bg-neutral-800 text-indigo-600"
            />
          </div>

          <div className="flex items-center justify-between">
            <span className="text-sm text-neutral-300">
              Block PR on new Architectural Layer violations
            </span>
            <input
              type="checkbox"
              checked={blockOnNewLayerViolations}
              onChange={(e) => setBlockOnNewLayerViolations(e.target.checked)}
              className="h-4 w-4 rounded border-neutral-700 bg-neutral-800 text-indigo-600"
            />
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end pt-4 border-t border-neutral-800">
          <button
            type="submit"
            disabled={saving}
            className="rounded bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            {saving ? 'Saving Changes...' : 'Save Policy Changes'}
          </button>
        </div>
      </form>

      {/* 3. Webhook Management & Setup Guide Panel */}
      {webhookStatus && (
        <div className="rounded-lg border border-neutral-800 bg-neutral-900/70 p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
            <div>
              <h3 className="text-lg font-semibold text-neutral-100">GitHub Webhook Status</h3>
              <p className="text-xs text-neutral-400">
                Automated PR trigger configuration and security setup instructions.
              </p>
            </div>
            <span
              className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                webhookStatus.isConfigured
                  ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-500/30'
                  : 'bg-amber-950/80 text-amber-400 border border-amber-500/30'
              }`}
            >
              {webhookStatus.isConfigured ? 'Configured & Ingesting' : 'Pending Webhook Deliveries'}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div className="rounded border border-neutral-800 bg-neutral-950/60 p-3">
              <span className="font-semibold text-neutral-400 block mb-1">
                Payload Endpoint URL
              </span>
              <code className="text-indigo-300 break-all">{webhookStatus.webhookUrl}</code>
            </div>

            <div className="rounded border border-neutral-800 bg-neutral-950/60 p-3">
              <span className="font-semibold text-neutral-400 block mb-1">
                HMAC SHA-256 Secret Status
              </span>
              <span
                className={
                  webhookStatus.secretConfigured
                    ? 'text-emerald-400 font-medium'
                    : 'text-amber-400 font-medium'
                }
              >
                {webhookStatus.setupInstructions.secretNotice}
              </span>
            </div>
          </div>

          <div className="rounded border border-neutral-800 bg-neutral-950/40 p-4 space-y-2 text-xs text-neutral-300">
            <h4 className="font-semibold text-neutral-200">GitHub Webhook Setup Guide:</h4>
            <ol className="list-decimal list-inside space-y-1 text-neutral-400">
              <li>Open repository settings on GitHub → Webhooks → Add webhook.</li>
              <li>
                Set Payload URL to{' '}
                <code className="text-neutral-200">{webhookStatus.webhookUrl}</code>.
              </li>
              <li>
                Set Content type to <code className="text-neutral-200">application/json</code>.
              </li>
              <li>
                Set Secret to your server&apos;s{' '}
                <code className="text-neutral-200">GITHUB_WEBHOOK_SECRET</code>.
              </li>

              <li>
                Select individual events and check{' '}
                <code className="text-neutral-200">Pull requests</code>.
              </li>
            </ol>
          </div>
        </div>
      )}
    </div>
  );
}
