// =============================================================================
// ForgeMind API — Graph Topology & Visual Dependency Engine Service
// =============================================================================

import type {
  CircularDependencyCycle,
  GraphEdge,
  GraphNode,
  GraphQueryOptions,
  GraphTopologyMetrics,
  RepositoryGraphResponse,
} from '@forgemind/types';

import { assertRepositoryOwnership } from './repository.service.js';
import { findRepositoryFiles } from './tree-indexing.service.js';
import { findRepositorySymbols, findRepositoryDependencies } from './symbol-extraction.service.js';

const DEFAULT_NODE_LIMIT = 100;
const MAX_NODE_LIMIT = 500;
const DEFAULT_DEPTH = 3;
const MAX_DEPTH = 5;

/**
 * Generates a complete, multi-layered visual topology graph dataset for a given repository.
 * Enforces repository ownership, bounds node counts to protection limits, and detects
 * circular dependency cycles.
 */
export async function generateRepositoryGraphTopology(
  repositoryId: string,
  userId: string,
  options: GraphQueryOptions = {},
): Promise<RepositoryGraphResponse> {
  await assertRepositoryOwnership(repositoryId, userId);

  const limit = Math.min(MAX_NODE_LIMIT, Math.max(1, options.limit ?? DEFAULT_NODE_LIMIT));
  const depth = Math.min(MAX_DEPTH, Math.max(1, options.depth ?? DEFAULT_DEPTH));
  const targetNodeType = options.nodeType ?? 'all';
  const filterQuery = options.filter?.trim().toLowerCase() ?? '';

  // 1. Fetch raw indexed assets in parallel
  const [filesResult, depsResult, symbolsResult] = await Promise.all([
    findRepositoryFiles(repositoryId, { limit: 1000 }),
    findRepositoryDependencies(repositoryId, { limit: 2000 }),
    findRepositorySymbols(repositoryId, { limit: 2000 }),
  ]);

  const rawFiles = filesResult.files;
  const rawDeps = depsResult.dependencies;
  const rawSymbols = symbolsResult.symbols;

  const nodeMap = new Map<string, GraphNode>();
  const edgeMap = new Map<string, GraphEdge>();
  const inDegreeMap = new Map<string, number>();
  const outDegreeMap = new Map<string, number>();

  const pathFilter = (p: string) => {
    if (depth >= MAX_DEPTH) return true;
    const parts = p.split('/');
    return parts.length <= depth + 1;
  };

  // 2. Build Module / Directory Nodes
  const moduleDirs = new Set<string>();
  for (const f of rawFiles) {
    if (!pathFilter(f.path)) continue;
    const parts = f.path.split('/');
    if (parts.length > 1) {
      const topDir = parts.slice(0, Math.min(parts.length - 1, depth)).join('/');
      moduleDirs.add(topDir);
    }
  }

  if (targetNodeType === 'all' || targetNodeType === 'module') {
    for (const dir of moduleDirs) {
      const nodeId = `module:${dir}`;
      if (filterQuery && !dir.toLowerCase().includes(filterQuery)) continue;
      nodeMap.set(nodeId, {
        id: nodeId,
        label: dir,
        type: 'module',
        group: 'module',
        path: dir,
        metrics: { inDegree: 0, outDegree: 0 },
      });
    }
  }

  // 3. Build File Nodes
  for (const f of rawFiles) {
    if (!pathFilter(f.path)) continue;
    if (filterQuery && !f.path.toLowerCase().includes(filterQuery)) continue;

    if (targetNodeType === 'all' || targetNodeType === 'file') {
      const nodeId = `file:${f.path}`;
      const group = f.language || 'unknown';
      nodeMap.set(nodeId, {
        id: nodeId,
        label: f.path.split('/').pop() || f.path,
        type: 'file',
        group,
        path: f.path,
        metrics: { inDegree: 0, outDegree: 0, linesCount: f.size ?? undefined },
      });
    }
  }

  // 4. Build External Package Nodes
  for (const d of rawDeps) {
    if (!d.isExternal || !d.targetPath) continue;
    const pkgName = d.targetPath;
    if (filterQuery && !pkgName.toLowerCase().includes(filterQuery)) continue;

    if (targetNodeType === 'all' || targetNodeType === 'package') {
      const nodeId = `package:${pkgName}`;
      if (!nodeMap.has(nodeId)) {
        nodeMap.set(nodeId, {
          id: nodeId,
          label: pkgName,
          type: 'package',
          group: 'external',
          metrics: { inDegree: 0, outDegree: 0 },
        });
      }
    }
  }

  // 5. Build AST Symbol Nodes
  for (const s of rawSymbols) {
    if (!pathFilter(s.filePath)) continue;
    if (filterQuery && !s.name.toLowerCase().includes(filterQuery)) continue;

    if (targetNodeType === 'all' || targetNodeType === 'symbol') {
      const nodeId = `symbol:${s.filePath}:${s.name}`;
      nodeMap.set(nodeId, {
        id: nodeId,
        label: `${s.name} (${s.kind})`,
        type: 'symbol',
        group: s.kind,
        path: s.filePath,
        metrics: {
          inDegree: 0,
          outDegree: 0,
          symbolKind: s.kind,
        },
      });

      // Symbol definition edge from parent File -> Symbol
      const fileNodeId = `file:${s.filePath}`;
      if (nodeMap.has(fileNodeId)) {
        const edgeId = `${fileNodeId}->${nodeId}`;
        edgeMap.set(edgeId, {
          id: edgeId,
          source: fileNodeId,
          target: nodeId,
          type: 'defines',
          weight: 1,
        });
      }
    }
  }

  // 6. Build File Dependency Edges (Internal & External)
  for (const d of rawDeps) {
    const srcNodeId = `file:${d.sourcePath}`;

    if (d.isExternal && d.targetPath) {
      const tgtNodeId = `package:${d.targetPath}`;
      if (nodeMap.has(srcNodeId) && nodeMap.has(tgtNodeId)) {
        const edgeId = `${srcNodeId}->${tgtNodeId}`;
        const existing = edgeMap.get(edgeId);
        if (existing) {
          existing.weight += 1;
        } else {
          edgeMap.set(edgeId, {
            id: edgeId,
            source: srcNodeId,
            target: tgtNodeId,
            type: 'depends_on',
            weight: 1,
          });
        }
      }
    } else if (d.targetPath) {
      const tgtNodeId = `file:${d.targetPath}`;
      if (nodeMap.has(srcNodeId) && nodeMap.has(tgtNodeId)) {
        const edgeId = `${srcNodeId}->${tgtNodeId}`;
        const weight = d.importedSymbols ? d.importedSymbols.length || 1 : 1;
        const existing = edgeMap.get(edgeId);
        if (existing) {
          existing.weight += weight;
        } else {
          edgeMap.set(edgeId, {
            id: edgeId,
            source: srcNodeId,
            target: tgtNodeId,
            type: 'imports',
            weight,
          });
        }
      }
    }
  }

  // 7. Clamp total node count strictly to limit
  let nodesList = Array.from(nodeMap.values());
  if (nodesList.length > limit) {
    nodesList = nodesList.slice(0, limit);
  }

  const activeNodeIds = new Set(nodesList.map((n) => n.id));

  // Filter edges to only those connecting active nodes
  const edgesList = Array.from(edgeMap.values()).filter(
    (e) => activeNodeIds.has(e.source) && activeNodeIds.has(e.target),
  );

  // 8. Compute node degree metrics
  for (const edge of edgesList) {
    outDegreeMap.set(edge.source, (outDegreeMap.get(edge.source) ?? 0) + 1);
    inDegreeMap.set(edge.target, (inDegreeMap.get(edge.target) ?? 0) + 1);
  }

  for (const node of nodesList) {
    node.metrics.inDegree = inDegreeMap.get(node.id) ?? 0;
    node.metrics.outDegree = outDegreeMap.get(node.id) ?? 0;
  }

  // 9. Detect Circular Dependency Cycles (Tarjan's SCC algorithm on internal file graph)
  const circularDependencies = detectCircularDependencies(rawDeps);

  // 10. Calculate Graph Metrics
  let fileNodeCount = 0;
  let symbolNodeCount = 0;
  let packageNodeCount = 0;
  let moduleNodeCount = 0;

  for (const node of nodesList) {
    if (node.type === 'file') fileNodeCount++;
    else if (node.type === 'symbol') symbolNodeCount++;
    else if (node.type === 'package') packageNodeCount++;
    else if (node.type === 'module') moduleNodeCount++;
  }

  const totalNodes = nodesList.length;
  const totalEdges = edgesList.length;
  const density =
    totalNodes > 1 ? parseFloat((totalEdges / (totalNodes * (totalNodes - 1))).toFixed(4)) : 0;

  // Top 5 Hub Nodes (highest inDegree + outDegree)
  const hubNodes = [...nodesList]
    .sort(
      (a, b) =>
        b.metrics.inDegree + b.metrics.outDegree - (a.metrics.inDegree + a.metrics.outDegree),
    )
    .slice(0, 5);

  const metrics: GraphTopologyMetrics = {
    totalNodes,
    totalEdges,
    fileNodeCount,
    symbolNodeCount,
    packageNodeCount,
    moduleNodeCount,
    density,
    hubNodes,
    circularDependencies,
  };

  return {
    repositoryId,
    nodes: nodesList,
    edges: edgesList,
    metrics,
  };
}

/**
 * Detects circular dependency cycles among internal files using Tarjan's Strongly Connected Components algorithm.
 */
export function detectCircularDependencies(
  dependencies: Array<{ sourcePath: string; targetPath: string | null; isExternal: boolean }>,
): CircularDependencyCycle[] {
  const adj = new Map<string, Set<string>>();

  for (const dep of dependencies) {
    if (dep.isExternal || !dep.targetPath) continue;
    const src = dep.sourcePath;
    const tgt = dep.targetPath;
    if (src === tgt) continue; // Ignore self-references

    let srcSet = adj.get(src);
    if (!srcSet) {
      srcSet = new Set();
      adj.set(src, srcSet);
    }
    srcSet.add(tgt);
  }

  const indexMap = new Map<string, number>();
  const lowLinkMap = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  let index = 0;
  const cycles: CircularDependencyCycle[] = [];

  function strongConnect(node: string) {
    indexMap.set(node, index);
    lowLinkMap.set(node, index);
    index++;
    stack.push(node);
    onStack.add(node);

    const neighbors = adj.get(node) || new Set();
    for (const neighbor of neighbors) {
      const nodeLow = lowLinkMap.get(node) ?? 0;
      if (!indexMap.has(neighbor)) {
        strongConnect(neighbor);
        const neighborLow = lowLinkMap.get(neighbor) ?? 0;
        lowLinkMap.set(node, Math.min(nodeLow, neighborLow));
      } else if (onStack.has(neighbor)) {
        const neighborIndex = indexMap.get(neighbor) ?? 0;
        lowLinkMap.set(node, Math.min(nodeLow, neighborIndex));
      }
    }

    if (lowLinkMap.get(node) === indexMap.get(node)) {
      const scc: string[] = [];
      let w: string | undefined;
      do {
        w = stack.pop();
        if (w) {
          onStack.delete(w);
          scc.push(w);
        }
      } while (w && w !== node);

      // Only SCCs with size > 1 constitute circular dependency cycles
      if (scc.length > 1) {
        cycles.push({
          cycle: scc.reverse(),
          length: scc.length,
        });
      }
    }
  }

  for (const node of adj.keys()) {
    if (!indexMap.has(node)) {
      strongConnect(node);
    }
  }

  return cycles.slice(0, 10); // Cap at 10 detected cycles
}
