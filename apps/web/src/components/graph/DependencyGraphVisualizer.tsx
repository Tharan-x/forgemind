'use client';

// =============================================================================
// ForgeMind Web — Interactive Dependency Graph & Visual Topology Component
// =============================================================================

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import type {
  ArchitectureDecision,
  GraphNode,
  GraphNodeType,
  RepositoryGraphResponse,
} from '@forgemind/types';
import { Button } from '@forgemind/ui';
import {
  getArchitectureDecisions,
  getRepositoryGraphTopology,
  synthesizeArchitectureDecision,
} from '@/lib/intelligence.api';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';

interface DependencyGraphVisualizerProps {
  repositoryId: string;
  highlightNodeIds?: string[];
  onSelectNodeForImpact?: (filePath: string, symbolName?: string) => void;
  onSelectNodeForExplain?: (filePath: string, symbolName?: string) => void;
  onSelectNodeForFiles?: (filePath: string) => void;
  onSelectNodeForAIInvestigation?: (
    node: GraphNode,
    blastRadiusInfo: { incoming: GraphNode[]; outgoing: GraphNode[]; reachableCount: number },
  ) => void;
  onNavigateToTimeMachine?: (path: string) => void;
  onNavigateToWhatIf?: (path: string, isModule?: boolean) => void;
}

export function DependencyGraphVisualizer({
  repositoryId,
  highlightNodeIds = [],
  onSelectNodeForImpact,
  onSelectNodeForExplain,
  onSelectNodeForFiles,
  onSelectNodeForAIInvestigation,
  onNavigateToTimeMachine,
  onNavigateToWhatIf,
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
  const [panOffset, setPanOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState<boolean>(false);
  const dragStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Decision Memory State for Selected Node
  const [decisions, setDecisions] = useState<ArchitectureDecision[]>([]);
  const [decisionsLoading, setDecisionsLoading] = useState<boolean>(false);
  const [decisionsError, setDecisionsError] = useState<string | null>(null);
  const [synthesizingId, setSynthesizingId] = useState<string | null>(null);
  const [synthesisError, setSynthesisError] = useState<string | null>(null);
  const activeFetchIdRef = useRef<string | null>(null);

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
      } else {
        setSelectedNode(null);
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

  // Fetch Decision Memory when selected node changes
  useEffect(() => {
    const currentPath = selectedNode?.path;
    if (!currentPath) {
      setDecisions([]);
      setDecisionsLoading(false);
      setDecisionsError(null);
      return;
    }

    const fetchId = `${selectedNode.id}::${currentPath}`;
    activeFetchIdRef.current = fetchId;
    setDecisionsLoading(true);
    setDecisionsError(null);

    getArchitectureDecisions(repositoryId, { path: currentPath, limit: 5 })
      .then((res) => {
        if (activeFetchIdRef.current === fetchId) {
          setDecisions(res.items || []);
        }
      })
      .catch((err) => {
        if (activeFetchIdRef.current === fetchId) {
          setDecisionsError(err instanceof Error ? err.message : 'Failed to load decision memory.');
        }
      })
      .finally(() => {
        if (activeFetchIdRef.current === fetchId) {
          setDecisionsLoading(false);
        }
      });
  }, [repositoryId, selectedNode]);

  const handleSynthesizeDecision = async (decisionId: string) => {
    if (synthesizingId) return;
    setSynthesizingId(decisionId);
    setSynthesisError(null);

    try {
      const updated = await synthesizeArchitectureDecision(repositoryId, decisionId, {
        force: true,
      });
      setDecisions((prev) => prev.map((d) => (d.id === decisionId ? updated : d)));
    } catch (err) {
      setSynthesisError(err instanceof Error ? err.message : 'Failed to synthesize AI rationale.');
    } finally {
      setSynthesizingId(null);
    }
  };

  const handleResetFilters = () => {
    setSearchFilter('');
    setNodeType('all');
    setDepth(3);
    setLimit(100);
    setZoomLevel(1.0);
    setPanOffset({ x: 0, y: 0 });
  };

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

  // Compute blast radius metrics for selected node (direct & reachable dependents)
  const blastRadiusInfo = useMemo(() => {
    if (!data || !selectedNode) {
      return { incoming: [], outgoing: [], reachableCount: 0 };
    }

    const incoming: GraphNode[] = [];
    const outgoing: GraphNode[] = [];

    data.edges.forEach((edge) => {
      if (edge.target === selectedNode.id) {
        const srcNode = data.nodes.find((n) => n.id === edge.source);
        if (srcNode) incoming.push(srcNode);
      }
      if (edge.source === selectedNode.id) {
        const tgtNode = data.nodes.find((n) => n.id === edge.target);
        if (tgtNode) outgoing.push(tgtNode);
      }
    });

    // BFS to find all reachable nodes (direct + transitive dependent files)
    const visited = new Set<string>();
    const queue = [selectedNode.id];
    visited.add(selectedNode.id);

    while (queue.length > 0) {
      const curr = queue.shift()!;
      data.edges.forEach((edge) => {
        if (edge.source === curr && !visited.has(edge.target)) {
          visited.add(edge.target);
          queue.push(edge.target);
        }
      });
    }

    return {
      incoming,
      outgoing,
      reachableCount: Math.max(0, visited.size - 1),
    };
  }, [data, selectedNode]);

  // Render node network on HTML5 Canvas with pan and zoom
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !data) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();

    // Scale & Pan canvas transformation
    ctx.translate(canvas.width / 2 + panOffset.x, canvas.height / 2 + panOffset.y);
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
  }, [data, nodePositions, selectedNode, zoomLevel, panOffset, highlightNodeIds]);

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

          {(searchFilter || nodeType !== 'all' || depth !== 3 || limit !== 100) && (
            <button
              onClick={handleResetFilters}
              className="text-xs text-cyan-400 hover:text-cyan-300 underline font-medium"
            >
              Reset Filters
            </button>
          )}
        </div>

        {/* Zoom & Export Controls */}
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setZoomLevel((z) => Math.min(2.5, z + 0.2))}
            title="Zoom In"
          >
            +
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setZoomLevel((z) => Math.max(0.4, z - 0.2))}
            title="Zoom Out"
          >
            -
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setZoomLevel(1.0);
              setPanOffset({ x: 0, y: 0 });
            }}
            title="Reset Zoom & Pan"
          >
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
      ) : data && data.nodes.length === 0 ? (
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950/60 p-10 text-center space-y-3">
          <p className="text-zinc-400 text-sm">
            No graph nodes match your search or filter criteria.
          </p>
          <Button variant="outline" size="sm" onClick={handleResetFilters}>
            Reset Search & Filters
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-4">
          {/* Canvas Topology View with Drag-to-Pan */}
          <div className="relative overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950/80 p-2 lg:col-span-3 select-none">
            <canvas
              ref={canvasRef}
              width={800}
              height={500}
              className={`h-[500px] w-full ${isPanning ? 'cursor-grabbing' : 'cursor-grab'}`}
              onMouseDown={(e) => {
                setIsPanning(true);
                dragStartRef.current = {
                  x: e.clientX - panOffset.x,
                  y: e.clientY - panOffset.y,
                };
              }}
              onMouseMove={(e) => {
                if (isPanning) {
                  setPanOffset({
                    x: e.clientX - dragStartRef.current.x,
                    y: e.clientY - dragStartRef.current.y,
                  });
                }
              }}
              onMouseUp={() => setIsPanning(false)}
              onMouseLeave={() => setIsPanning(false)}
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const rawX = e.clientX - rect.left;
                const rawY = e.clientY - rect.top;

                // Inverse matrix mapping to calculate click in graph coordinates
                const canvasW = 800;
                const canvasH = 500;
                const clickX = (rawX - canvasW / 2 - panOffset.x) / zoomLevel + canvasW / 2;
                const clickY = (rawY - canvasH / 2 - panOffset.y) / zoomLevel + canvasH / 2;

                let clicked: GraphNode | null = null;
                nodePositions.forEach((pos, id) => {
                  const dist = Math.hypot(clickX - pos.x, clickY - pos.y);
                  if (dist <= 18) {
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
                  <p className="font-semibold text-cyan-400 break-all">{selectedNode.label}</p>
                  <p className="mt-1 text-[11px] text-zinc-400 capitalize">
                    Type: {selectedNode.type}
                  </p>
                  {selectedNode.path && (
                    <p className="mt-1 break-all text-[11px] text-zinc-500 font-mono">
                      {selectedNode.path}
                    </p>
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

                {/* Blast Radius Summary */}
                <div className="rounded-lg border border-cyan-500/20 bg-cyan-950/10 p-2.5 space-y-1">
                  <span className="text-[10px] font-bold text-cyan-400 uppercase tracking-wider block">
                    Blast Radius
                  </span>
                  <p className="text-xs text-zinc-300">
                    <span className="font-bold text-cyan-300">
                      {blastRadiusInfo.reachableCount}
                    </span>{' '}
                    reachable dependent node{blastRadiusInfo.reachableCount !== 1 ? 's' : ''}
                  </p>
                </div>

                {/* Connected Incoming Dependents */}
                {blastRadiusInfo.incoming.length > 0 && (
                  <div className="space-y-1 border-t border-zinc-800 pt-2">
                    <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">
                      Imported By ({blastRadiusInfo.incoming.length})
                    </span>
                    <div className="max-h-24 overflow-y-auto space-y-1 pr-1">
                      {blastRadiusInfo.incoming.map((inc) => (
                        <button
                          key={inc.id}
                          onClick={() => setSelectedNode(inc)}
                          className="block w-full truncate text-left text-[11px] font-mono text-emerald-400 hover:underline"
                        >
                          {inc.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Connected Outgoing Dependencies */}
                {blastRadiusInfo.outgoing.length > 0 && (
                  <div className="space-y-1 border-t border-zinc-800 pt-2">
                    <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">
                      Depends On ({blastRadiusInfo.outgoing.length})
                    </span>
                    <div className="max-h-24 overflow-y-auto space-y-1 pr-1">
                      {blastRadiusInfo.outgoing.map((out) => (
                        <button
                          key={out.id}
                          onClick={() => setSelectedNode(out)}
                          className="block w-full truncate text-left text-[11px] font-mono text-purple-300 hover:underline"
                        >
                          {out.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Historical Decision Memory Section */}
                <div className="space-y-2 border-t border-zinc-800 pt-3">
                  <span className="text-[10px] font-bold text-cyan-400 uppercase tracking-wider block">
                    📜 Historical Decision Memory
                  </span>

                  {!selectedNode.path ? (
                    <p className="text-[11px] text-zinc-500 italic">
                      Historical decisions unavailable for this node (no repository path mapped).
                    </p>
                  ) : decisionsLoading ? (
                    <div className="py-2 text-center text-[11px] text-zinc-400">
                      <LoadingSpinner label="Loading decision history..." />
                    </div>
                  ) : decisionsError ? (
                    <p className="text-[11px] text-rose-400 font-mono">{decisionsError}</p>
                  ) : decisions.length === 0 ? (
                    <p className="text-[11px] text-zinc-500 italic">
                      No historical architectural decisions recorded for this path.
                    </p>
                  ) : (
                    <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                      {synthesisError && (
                        <p className="text-[10px] text-rose-400 font-mono bg-rose-950/30 p-1.5 rounded">
                          {synthesisError}
                        </p>
                      )}
                      {decisions.map((decision) => (
                        <div
                          key={decision.id}
                          className="rounded-lg border border-zinc-800 bg-zinc-950 p-2.5 space-y-1.5"
                        >
                          <div className="flex items-center justify-between gap-1 text-[10px]">
                            <span className="text-zinc-400 font-mono">
                              {decision.committedAt
                                ? new Date(decision.committedAt).toLocaleDateString()
                                : 'Date N/A'}
                            </span>
                            {decision.healthScoreDelta !== null && (
                              <span
                                className={`font-bold ${
                                  decision.healthScoreDelta >= 0
                                    ? 'text-emerald-400'
                                    : 'text-rose-400'
                                }`}
                              >
                                Health:{' '}
                                {decision.healthScoreDelta >= 0
                                  ? `+${decision.healthScoreDelta}`
                                  : decision.healthScoreDelta}
                              </span>
                            )}
                          </div>

                          <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-mono text-zinc-300">
                            {decision.commitHash && (
                              <a
                                href={decision.commitUrl || '#'}
                                target="_blank"
                                rel="noreferrer"
                                className="text-cyan-400 hover:underline"
                              >
                                Commit {decision.commitHash.substring(0, 7)}
                              </a>
                            )}
                            {decision.prNumber && (
                              <a
                                href={decision.prUrl || '#'}
                                target="_blank"
                                rel="noreferrer"
                                className="text-purple-400 hover:underline"
                              >
                                #{decision.prNumber}
                              </a>
                            )}
                            {decision.author && (
                              <span className="text-zinc-400">by {decision.author}</span>
                            )}
                          </div>

                          {decision.prTitle && (
                            <p className="text-[11px] font-medium text-zinc-200 line-clamp-1">
                              {decision.prTitle}
                            </p>
                          )}

                          {/* AI Grounded Rationale vs Action */}
                          {decision.synthesis ? (
                            <div className="rounded border border-cyan-950 bg-cyan-950/20 p-2 space-y-1">
                              <div className="flex items-center justify-between text-[9px] font-bold">
                                <span className="text-cyan-400 uppercase tracking-wide">
                                  🤖 Grounded AI Interpretation
                                </span>
                                <span
                                  className={`px-1 rounded ${
                                    decision.synthesis.evidenceConfidence === 'HIGH'
                                      ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                                      : decision.synthesis.evidenceConfidence === 'UNRECORDED'
                                        ? 'bg-zinc-800 text-zinc-400'
                                        : 'bg-amber-950 text-amber-300 border border-amber-800'
                                  }`}
                                >
                                  {decision.synthesis.evidenceConfidence}
                                </span>
                              </div>
                              <p className="text-[11px] text-zinc-300 leading-snug">
                                {decision.synthesis.architecturalIntent}
                              </p>
                            </div>
                          ) : (
                            <div className="pt-1">
                              <Button
                                variant="outline"
                                size="sm"
                                className="w-full text-[10px] h-6 justify-center border-cyan-500/30 text-cyan-300 hover:bg-cyan-950/40"
                                disabled={synthesizingId === decision.id}
                                onClick={() => handleSynthesizeDecision(decision.id)}
                              >
                                {synthesizingId === decision.id
                                  ? 'Synthesizing...'
                                  : '🤖 Synthesize AI Rationale'}
                              </Button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Direct Action Buttons */}
                <div className="space-y-2 pt-2 border-t border-zinc-800">
                  {selectedNode.path && onNavigateToTimeMachine && (
                    <Button
                      variant="outline"
                      className="w-full justify-center text-xs h-8 border-indigo-500/40 text-indigo-300 hover:bg-indigo-950/40 font-semibold"
                      onClick={() => onNavigateToTimeMachine(selectedNode.path!)}
                    >
                      ⏳ View History
                    </Button>
                  )}
                  {selectedNode.path && onNavigateToWhatIf && (
                    <Button
                      variant="outline"
                      className="w-full justify-center text-xs h-8 border-cyan-500/40 text-cyan-300 hover:bg-cyan-950/40 font-semibold"
                      onClick={() =>
                        onNavigateToWhatIf(selectedNode.path!, selectedNode.type === 'module')
                      }
                    >
                      🔮 Simulate Change
                    </Button>
                  )}
                  {onSelectNodeForAIInvestigation && (
                    <Button
                      variant="outline"
                      className="w-full justify-center text-xs h-8 border-cyan-500/40 text-cyan-300 hover:bg-cyan-950/40 font-semibold"
                      onClick={() => onSelectNodeForAIInvestigation(selectedNode, blastRadiusInfo)}
                    >
                      🤖 Investigate with AI
                    </Button>
                  )}
                  {selectedNode.path && onSelectNodeForFiles && (
                    <Button
                      variant="outline"
                      className="w-full justify-center text-xs h-8"
                      onClick={() => onSelectNodeForFiles(selectedNode.path!)}
                    >
                      📁 View in Indexed Files
                    </Button>
                  )}
                  {selectedNode.path && onSelectNodeForImpact && (
                    <Button
                      variant="outline"
                      className="w-full justify-center text-xs h-8"
                      onClick={() =>
                        onSelectNodeForImpact(
                          selectedNode.path!,
                          selectedNode.type === 'symbol'
                            ? selectedNode.label.split(' ')[0]
                            : undefined,
                        )
                      }
                    >
                      🎯 Analyze Impact
                    </Button>
                  )}
                  {selectedNode.path && onSelectNodeForExplain && (
                    <Button
                      variant="outline"
                      className="w-full justify-center text-xs h-8"
                      onClick={() =>
                        onSelectNodeForExplain(
                          selectedNode.path!,
                          selectedNode.type === 'symbol'
                            ? selectedNode.label.split(' ')[0]
                            : undefined,
                        )
                      }
                    >
                      💡 Explain Code
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
