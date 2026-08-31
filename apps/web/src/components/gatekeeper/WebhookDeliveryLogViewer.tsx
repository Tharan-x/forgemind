'use client';

import React from 'react';
import type { WebhookDeliveryLogItem } from '@forgemind/types';

interface WebhookDeliveryLogViewerProps {
  deliveries: WebhookDeliveryLogItem[];
  total: number;
  page: number;
  totalPages: number;
  onPageChange: (newPage: number) => void;
  isLoading?: boolean;
}

export const WebhookDeliveryLogViewer: React.FC<WebhookDeliveryLogViewerProps> = ({
  deliveries,
  total,
  page,
  totalPages,
  onPageChange,
  isLoading = false,
}) => {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/90 p-6 space-y-4 shadow-xl">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-zinc-100 flex items-center gap-2">
            📡 Webhook Delivery Logs
          </h3>
          <p className="text-xs text-zinc-400">
            Real-time GitHub webhook payload ingestion and idempotency history ({total} deliveries
            logged)
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="py-8 text-center text-xs text-zinc-400 animate-pulse">
          Loading webhook delivery logs...
        </div>
      ) : deliveries.length === 0 ? (
        <div className="py-8 text-center text-xs text-zinc-500 border border-dashed border-zinc-800 rounded-lg">
          No webhook deliveries logged for this repository yet.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-zinc-300">
            <thead className="border-b border-zinc-800 bg-zinc-950/60 uppercase text-[10px] text-zinc-400 font-semibold">
              <tr>
                <th className="py-2.5 px-3">Delivery ID</th>
                <th className="py-2.5 px-3">Event / Action</th>
                <th className="py-2.5 px-3">PR #</th>
                <th className="py-2.5 px-3">Status</th>
                <th className="py-2.5 px-3">Received At</th>
                <th className="py-2.5 px-3">Details / Ignored Reason</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60 font-mono">
              {deliveries.map((delivery) => {
                const statusBadgeColor =
                  delivery.status === 'processed'
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                    : delivery.status === 'ignored'
                      ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                      : delivery.status === 'duplicate'
                        ? 'bg-purple-500/10 text-purple-400 border-purple-500/30'
                        : 'bg-zinc-500/10 text-zinc-400 border-zinc-500/30';

                return (
                  <tr key={delivery.id} className="hover:bg-zinc-800/40 transition-colors">
                    <td className="py-2.5 px-3 font-semibold text-indigo-300">
                      {delivery.deliveryId}
                    </td>
                    <td className="py-2.5 px-3 font-sans">
                      <span className="font-semibold text-zinc-200">{delivery.eventType}</span>
                      {delivery.action && (
                        <span className="ml-1 text-zinc-400 text-[11px]">({delivery.action})</span>
                      )}
                    </td>
                    <td className="py-2.5 px-3">
                      {delivery.prNumber ? `#${delivery.prNumber}` : '—'}
                    </td>
                    <td className="py-2.5 px-3 font-sans">
                      <span
                        className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase ${statusBadgeColor}`}
                      >
                        {delivery.status}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-zinc-400 font-sans">
                      {new Date(delivery.receivedAt).toLocaleString()}
                    </td>
                    <td className="py-2.5 px-3 text-zinc-400 font-sans text-[11px]">
                      {delivery.ignoredReason || '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-2 border-t border-zinc-800 text-xs">
          <span className="text-zinc-400">
            Page {page} of {totalPages}
          </span>
          <div className="flex gap-2">
            <button
              disabled={page <= 1}
              onClick={() => onPageChange(page - 1)}
              className="rounded bg-zinc-800 px-3 py-1 text-zinc-200 disabled:opacity-40 hover:bg-zinc-700 transition-colors"
            >
              Previous
            </button>
            <button
              disabled={page >= totalPages}
              onClick={() => onPageChange(page + 1)}
              className="rounded bg-zinc-800 px-3 py-1 text-zinc-200 disabled:opacity-40 hover:bg-zinc-700 transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
