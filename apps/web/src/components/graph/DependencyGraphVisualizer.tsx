'use client';

// =============================================================================
// ForgeMind Web — Interactive Dependency Graph & Visual Topology Component
// =============================================================================

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import type { GraphNode, GraphNodeType, RepositoryGraphResponse } from '@forgemind/types';
import { Button } from '@forgemind/ui';
import { getRepositoryGraphTopology } from '@/lib/intelligence.api';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';

interface DependencyGraphVisualizerProps {
  repositoryId: string;
  highlightNodeIds?: string[];
  onSelectNodeForImpact?: (filePath: string, symbolName?: string) => void;
  onSelectNodeForExplain?: (filePath: string, symbolName?: string) => void;
}

export function DependencyGraphVisualizer({
  repositoryId,
  highlightNodeIds = [],
  onSelectNodeForImpact,
  onSelectNodeForExplain,
}: DependencyGraphVisualizerProps) {
  const [data, setData] = useState<RepositoryGraphResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Filter State
  const [nodeType, setNodeType] = useState<GraphNodeType | 'all'>('all');
  const [searchFilter, setSearchFilter] = useState<string>('');
  const [depth, setDepth] = useState<number>(3);
  const [limit, setLimit] = useState<number>(100);

  // Interaction State
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [zoomLevel, setZoomLevel] = useState<number>(1.0);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Fetch Graph Data
  const loadGraph = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getRepositoryGraphTopology(repositoryId, {
        nodeType,
        depth,
        limit,
        filter: searchFilter || undefined,
      });
      setData(res);
      if (res.nodes.length > 0) {
        setSelectedNode(res.nodes[0] || null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load graph topology.');
    } finally {
      setLoading(false);
    }
  }, [repositoryId, nodeType, depth, limit, searchFilter]);

  useEffect(() => {
    loadGraph();
  }, [loadGraph]);

  // Compute 2D node layout positions deterministically
  const nodePositions = useMemo(() => {
    if (!data || data.nodes.length === 0) return new Map<string, { x: number; y: number }>();

    const map = new Map<string, { x: number; y: number }>();
    const total = data.nodes.length;
    const width = 800;
    const height = 500;
    const centerX = width / 2;
    const centerY = height / 2;

    // Concentric multi-ring layout based on node type and degree
    data.nodes.forEach((node, index) => {
      let radius = 180;
      if (node.type === 'module') radius = 80;
      else if (node.type === 'file') radius = 160;
      else if (node.type === 'symbol') radius = 230;
      else if (node.type === 'package') radius = 280;

      const angle = (index / total) * 2 * Math.PI;
      const x = centerX + radius * Math.cos(angle);
      const y = centerY + radius * Math.sin(angle);
      map.set(node.id, { x, y });
    });

    return map;
  }, [data]);

  // Render node network on HTML5 Canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !data) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();

    // Scale canvas for zoom
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.scale(zoomLevel, zoomLevel);
    ctx.translate(-canvas.width / 2, -canvas.height / 2);

    // Draw Edges
    data.edges.forEach((edge) => {
      const srcPos = nodePositions.get(edge.source);
      const tgtPos = nodePositions.get(edge.target);
      if (!srcPos || !tgtPos) return;

      const isHighlighted =
        selectedNode && (edge.source === selectedNode.id || edge.target === selectedNode.id);

      ctx.beginPath();
      ctx.moveTo(srcPos.x, srcPos.y);
      ctx.lineTo(tgtPos.x, tgtPos.y);
      ctx.strokeStyle = isHighlighted ? 'rgba(56, 189, 248, 0.8)' : 'rgba(71, 85, 105, 0.3)';
      ctx.lineWidth = isHighlighted ? 2.5 : 1.0;
      ctx.stroke();
    });

    // Draw Nodes
    data.nodes.forEach((node) => {
      const pos = nodePositions.get(node.id);
      if (!pos) return;

      const isSelected = selectedNode?.id === node.id;
      const isHighlighted = highlightNodeIds.includes(node.id);

      let color = '#38bdf8'; // Sky blue for files
      if (node.type === 'module')
        color = '#a855f7'; // Purple for modules
      else if (node.type === 'symbol')
        color = '#34d399'; // Emerald for symbols
      else if (node.type === 'package') color = '#fbbf24'; // Amber for packages

      ctx.beginPath();
      ctx.arc(pos.x, pos.y, isSelected ? 10 : isHighlighted ? 8 : 6, 0, 2 * Math.PI);
      ctx.fillStyle = isHighlighted ? '#ef4444' : color;
      ctx.fill();

      if (isHighlighted) {
        ctx.strokeStyle = '#f87171';
        ctx.lineWidth = 3;
        ctx.stroke();

        ctx.font = 'bold 11px sans-serif';
        ctx.fillStyle = '#f87171';
        ctx.fillText(`⚠ ${node.label}`, pos.x + 12, pos.y + 4);
      } else if (isSelected) {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Node Label Tag
        ctx.font = '11px sans-serif';
        ctx.fillStyle = '#f8fafc';
        ctx.fillText(node.label, pos.x + 12, pos.y + 4);
      }
    });

    ctx.restore();
  }, [data, nodePositions, selectedNode, zoomLevel, highlightNodeIds]);

  // Export JSON topology data
  const exportGraphJson = () => {
    if (!data) return;
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `graph-topology-${repositoryId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Control Bar & Filter Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 backdrop-blur-md">
        <div className="flex flex-wrap items-center gap-3">
          {/* Search Filter Input */}
          <input
            type="text"
            placeholder="Search nodes by path/name..."
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
            className="w-56 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-1.5 text-xs text-zinc-200 focus:border-cyan-500 focus:outline-none"
          />

          {/* Node Type Filter */}
          <select
            value={nodeType}
            onChange={(e) => setNodeType(e.target.value as GraphNodeType | 'all')}
            className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-1.5 text-xs text-zinc-200 focus:border-cyan-500 focus:outline-none"
          >
            <option value="all">All Node Types</option>
            <option value="file">Files Only</option>
            <option value="symbol">Symbols Only</option>
            <option value="module">Modules Only</option>
            <option value="package">Packages Only</option>
          </select>

          {/* Depth Control */}
          <select
            value={depth}
            onChange={(e) => setDepth(parseInt(e.target.value, 10))}
            className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-1.5 text-xs text-zinc-200 focus:border-cyan-500 focus:outline-none"
          >
            <option value={1}>Depth 1 (Root)</option>
            <option value={2}>Depth 2</option>
            <option value={3}>Depth 3 (Standard)</option>
            <option value={5}>Depth 5 (Full)</option>
          </select>

          {/* Node Limit Control */}
          <select
            value={limit}
            onChange={(e) => setLimit(parseInt(e.target.value, 10))}
            className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-1.5 text-xs text-zinc-200 focus:border-cyan-500 focus:outline-none"
          >
            <option value={50}>50 Nodes</option>
            <option value={100}>100 Nodes</option>
            <option value={250}>250 Nodes</option>
            <option value={500}>500 Nodes (Max)</option>
          </select>
        </div>

        {/* Zoom & Export Controls */}
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setZoomLevel((z) => Math.min(2.0, z + 0.2))}
            title="Zoom In"
          >
            +
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setZoomLevel((z) => Math.max(0.5, z - 0.2))}
            title="Zoom Out"
          >
            -
          </Button>
          <Button variant="outline" size="sm" onClick={() => setZoomLevel(1.0)} title="Reset Zoom">
            Reset
          </Button>
          <Button variant="outline" size="sm" onClick={exportGraphJson}>
            Export JSON
          </Button>
        </div>
      </div>

      {/* Topology Metrics Summary */}
      {data && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-6">
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3 text-center">
            <p className="text-xs text-zinc-400">Total Nodes</p>
            <p className="text-lg font-bold text-cyan-400">{data.metrics.totalNodes}</p>
          </div>
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3 text-center">
            <p className="text-xs text-zinc-400">Total Edges</p>
            <p className="text-lg font-bold text-purple-400">{data.metrics.totalEdges}</p>
          </div>
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3 text-center">
            <p className="text-xs text-zinc-400">Files / Modules</p>
            <p className="text-lg font-bold text-emerald-400">
              {data.metrics.fileNodeCount} / {data.metrics.moduleNodeCount}
            </p>
          </div>
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3 text-center">
            <p className="text-xs text-zinc-400">Symbols / Packages</p>
            <p className="text-lg font-bold text-amber-400">
              {data.metrics.symbolNodeCount} / {data.metrics.packageNodeCount}
            </p>
          </div>
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3 text-center">
            <p className="text-xs text-zinc-400">Network Density</p>
            <p className="text-lg font-bold text-sky-400">{data.metrics.density}</p>
          </div>
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3 text-center">
            <p className="text-xs text-zinc-400">Circular Cycles</p>
            <p
              className={`text-lg font-bold ${
                data.metrics.circularDependencies.length > 0 ? 'text-rose-400' : 'text-zinc-400'
              }`}
            >
              {data.metrics.circularDependencies.length}
            </p>
          </div>
        </div>
      )}

      {/* Circular Dependency Warning Banner */}
      {data && data.metrics.circularDependencies.length > 0 && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-950/20 p-4 text-xs text-rose-300">
          <span className="font-semibold text-rose-400">⚠️ Circular Dependency Alert:</span>{' '}
          Detected {data.metrics.circularDependencies.length} circular cycle(s) in repository import
          graph:
          <ul className="mt-1 list-disc space-y-1 pl-4">
            {data.metrics.circularDependencies.slice(0, 3).map((c, i) => (
              <li key={i}>{c.cycle.join(' → ')}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Main Canvas & Side Inspector View */}
      {loading ? (
        <div className="flex h-96 items-center justify-center rounded-2xl border border-zinc-800 bg-zinc-950/60">
          <LoadingSpinner label="Aggregating repository topology..." />
        </div>
      ) : error ? (
        <div className="rounded-xl border border-rose-500/20 bg-rose-950/20 p-6 text-center text-sm text-rose-400">
          {error}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-4">
          {/* Canvas Topology View */}
          <div className="relative overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950/80 p-2 lg:col-span-3">
            <canvas
              ref={canvasRef}
              width={800}
              height={500}
              className="h-[500px] w-full cursor-grab active:cursor-grabbing"
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const clickX = e.clientX - rect.left;
                const clickY = e.clientY - rect.top;
                // Find clicked node
                let clicked: GraphNode | null = null;
                nodePositions.forEach((pos, id) => {
                  const dist = Math.hypot(clickX - pos.x, clickY - pos.y);
                  if (dist <= 15) {
                    clicked = data?.nodes.find((n) => n.id === id) || null;
                  }
                });
                if (clicked) setSelectedNode(clicked);
              }}
            />
          </div>

          {/* Node Inspector Panel */}
          <div className="space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-4">
            <h3 className="text-sm font-semibold text-zinc-200">Node Inspector</h3>
            {selectedNode ? (
              <div className="space-y-3 text-xs text-zinc-300">
                <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
                  <p className="font-semibold text-cyan-400">{selectedNode.label}</p>
                  <p className="mt-1 text-[11px] text-zinc-400">Type: {selectedNode.type}</p>
                  {selectedNode.path && (
                    <p className="mt-1 break-all text-[11px] text-zinc-500">{selectedNode.path}</p>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-2 text-center">
                    <p className="text-[10px] text-zinc-400">In-Degree</p>
                    <p className="text-sm font-bold text-emerald-400">
                      {selectedNode.metrics.inDegree}
                    </p>
                  </div>
                  <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-2 text-center">
                    <p className="text-[10px] text-zinc-400">Out-Degree</p>
                    <p className="text-sm font-bold text-purple-400">
                      {selectedNode.metrics.outDegree}
                    </p>
                  </div>
                </div>

                {/* Direct Action Buttons */}
                <div className="space-y-2 pt-2">
                  {selectedNode.path && onSelectNodeForImpact && (
                    <Button
                      variant="outline"
                      className="w-full justify-center text-xs"
                      onClick={() =>
                        onSelectNodeForImpact(
                          selectedNode.path!,
                          selectedNode.type === 'symbol'
                            ? selectedNode.label.split(' ')[0]
                            : undefined,
                        )
                      }
                    >
                      Analyze Impact
                    </Button>
                  )}
                  {selectedNode.path && onSelectNodeForExplain && (
                    <Button
                      variant="outline"
                      className="w-full justify-center text-xs"
                      onClick={() =>
                        onSelectNodeForExplain(
                          selectedNode.path!,
                          selectedNode.type === 'symbol'
                            ? selectedNode.label.split(' ')[0]
                            : undefined,
                        )
                      }
                    >
                      Explain Code
                    </Button>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-xs text-zinc-500">
                Click any node in the graph to inspect details.
              </p>
            )}

            {/* Hub Nodes List */}
            {data && data.metrics.hubNodes.length > 0 && (
              <div className="border-t border-zinc-800 pt-3">
                <p className="text-[11px] font-semibold text-zinc-400">Blast Radius Hub Nodes</p>
                <div className="mt-2 space-y-1">
                  {data.metrics.hubNodes.slice(0, 3).map((hub) => (
                    <button
                      key={hub.id}
                      onClick={() => setSelectedNode(hub)}
                      className="block w-full truncate text-left text-xs text-cyan-400 hover:underline"
                    >
                      {hub.label} ({hub.metrics.inDegree + hub.metrics.outDegree} links)
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
