'use client';

// =============================================================================
// ForgeMind Web — Structured Architectural Remediation Plan Component
// =============================================================================

import React from 'react';
import type { HealthFinding, StructuredRemediationPlan } from '@forgemind/types';
import { Button } from '@forgemind/ui';

interface StructuredRemediationPlanViewProps {
  plan: StructuredRemediationPlan;
  finding?: HealthFinding | null;
  onSelectFile?: (filePath: string) => void;
  onHighlightOnGraph?: (finding: HealthFinding) => void;
  onInvestigateWithAI?: (finding: HealthFinding) => void;
  onClose?: () => void;
}

export function StructuredRemediationPlanView({
  plan,
  finding,
  onSelectFile,
  onHighlightOnGraph,
  onInvestigateWithAI,
  onClose,
}: StructuredRemediationPlanViewProps) {
  const getSeverityBadgeClass = (severity: string) => {
    switch (severity.toLowerCase()) {
      case 'critical':
        return 'bg-red-950/80 text-red-400 border-red-800/60';
      case 'high':
        return 'bg-orange-950/80 text-orange-400 border-orange-800/60';
      case 'medium':
        return 'bg-yellow-950/80 text-yellow-400 border-yellow-800/60';
      default:
        return 'bg-blue-950/80 text-blue-400 border-blue-800/60';
    }
  };

  return (
    <div className="space-y-6 text-zinc-200">
      {/* Top Header Card */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800 pb-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className={`text-xs px-2.5 py-0.5 rounded-full font-semibold border ${getSeverityBadgeClass(
                  plan.severity,
                )}`}
              >
                {plan.severity.toUpperCase()}
              </span>
              <span className="text-xs px-2.5 py-0.5 rounded-full font-mono bg-zinc-800 text-zinc-300 border border-zinc-700">
                {plan.category}
              </span>
              <span className="text-xs text-zinc-400 font-mono">ID: {plan.findingId}</span>
            </div>
            <h3 className="text-lg font-bold text-zinc-100">{plan.title}</h3>
          </div>

          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="text-zinc-400 hover:text-zinc-100 p-1.5 rounded-lg hover:bg-zinc-800 text-sm font-bold"
            >
              ✕ Close
            </button>
          )}
        </div>

        {/* Action Button Bar */}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          {finding && onHighlightOnGraph && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onHighlightOnGraph(finding)}
              className="border-indigo-500/40 text-indigo-300 hover:bg-indigo-950/40 text-xs font-semibold"
            >
              🔍 Highlight on Graph
            </Button>
          )}
          {finding && onInvestigateWithAI && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onInvestigateWithAI(finding)}
              className="border-cyan-500/40 text-cyan-300 hover:bg-cyan-950/40 text-xs font-semibold"
            >
              🤖 Ask AI Assistant
            </Button>
          )}
        </div>
      </div>

      {/* Grounding & Safety Notice */}
      <div className="bg-emerald-950/30 border border-emerald-800/40 rounded-xl p-4 flex items-start gap-3">
        <span className="text-lg">🛡️</span>
        <div className="space-y-1">
          <div className="text-xs font-bold uppercase tracking-wider text-emerald-400">
            Repository Evidence Grounding
          </div>
          <p className="text-xs text-emerald-200/90 leading-relaxed">
            {plan.evidenceGrounding.evidenceSummary} All proposed architectural steps distinguish
            supported codebase evidence from reasonable inference and recommendations.
          </p>
          {plan.evidenceGrounding.insufficientEvidenceNotes && (
            <p className="text-xs text-amber-400 font-mono mt-1">
              ⚠️ {plan.evidenceGrounding.insufficientEvidenceNotes}
            </p>
          )}
        </div>
      </div>

      {/* Expected Architectural Improvement Banner */}
      <div className="bg-gradient-to-r from-emerald-950/60 to-cyan-950/60 border border-emerald-800/50 rounded-xl p-5 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider">
            Expected Architectural Improvement
          </span>
          <span className="text-sm font-bold text-emerald-300 bg-emerald-950 border border-emerald-700/60 px-3 py-1 rounded-full">
            +{plan.expectedArchitecturalImprovement.penaltyPointsRecovered} Points Recovery
          </span>
        </div>
        <p className="text-sm font-semibold text-zinc-100">
          {plan.expectedArchitecturalImprovement.summary}
        </p>
      </div>

      {/* Grid: Problem & Root Cause */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-2">
          <div className="text-xs font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-2">
            <span>⚠️</span> Problem Summary
          </div>
          <p className="text-xs text-zinc-300 leading-relaxed">{plan.problemSummary}</p>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-2">
          <div className="text-xs font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-2">
            <span>🔍</span> Root Cause Analysis
          </div>
          <p className="text-xs text-zinc-300 leading-relaxed">{plan.rootCause}</p>
        </div>
      </div>

      {/* Affected Components & AST Symbols */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4">
        <div className="text-xs font-bold text-zinc-300 uppercase tracking-wider flex items-center gap-2">
          <span>📦</span> Affected Components & AST Symbols
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
          {/* Files to modify */}
          <div className="space-y-2">
            <span className="font-semibold text-amber-400 block">
              Files to Modify ({plan.affectedComponents.filesToModify.length}):
            </span>
            <div className="space-y-1">
              {plan.affectedComponents.filesToModify.map((filePath) => (
                <button
                  key={filePath}
                  type="button"
                  onClick={() => onSelectFile && onSelectFile(filePath)}
                  className="block text-left w-full font-mono text-cyan-400 hover:text-cyan-200 hover:underline bg-zinc-950/60 p-2 rounded border border-zinc-800 truncate"
                >
                  📄 {filePath}
                </button>
              ))}
            </div>
          </div>

          {/* New files required */}
          <div className="space-y-2">
            <span className="font-semibold text-emerald-400 block">
              New Files Required ({plan.affectedComponents.newFilesRequired.length}):
            </span>
            <div className="space-y-1">
              {plan.affectedComponents.newFilesRequired.length > 0 ? (
                plan.affectedComponents.newFilesRequired.map((filePath) => (
                  <div
                    key={filePath}
                    className="font-mono text-emerald-300 bg-zinc-950/60 p-2 rounded border border-zinc-800 truncate"
                  >
                    ✨ {filePath}
                  </div>
                ))
              ) : (
                <span className="text-zinc-500 italic">No new files required.</span>
              )}
            </div>
          </div>

          {/* AST Symbols involved */}
          <div className="space-y-2">
            <span className="font-semibold text-indigo-400 block">
              AST Symbols Involved ({plan.affectedComponents.symbolsInvolved.length}):
            </span>
            <div className="space-y-1 max-h-40 overflow-y-auto pr-1">
              {plan.affectedComponents.symbolsInvolved.map((sym) => (
                <div
                  key={sym}
                  className="font-mono text-indigo-300 bg-zinc-950/60 p-2 rounded border border-zinc-800 text-[11px] truncate"
                >
                  ⚡ {sym}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Dependency & Blast Radius Impact */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="text-xs font-bold text-zinc-300 uppercase tracking-wider flex items-center gap-2">
            <span>🌐</span> Topology & Dependency Impact
          </div>
          <span className="text-xs font-bold text-cyan-400 bg-cyan-950/80 border border-cyan-800/60 px-3 py-1 rounded-full">
            Blast Radius: {plan.dependencyImpact.reachableBlastRadiusCount} Reachable Node(s)
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          <div className="space-y-2 bg-zinc-950/60 p-3.5 rounded-lg border border-zinc-800">
            <span className="font-semibold text-zinc-300 block">
              Direct Dependencies ({plan.dependencyImpact.directDependencies.length}):
            </span>
            <div className="space-y-1 max-h-32 overflow-y-auto">
              {plan.dependencyImpact.directDependencies.length > 0 ? (
                plan.dependencyImpact.directDependencies.map((dep) => (
                  <button
                    key={dep}
                    type="button"
                    onClick={() => onSelectFile && onSelectFile(dep)}
                    className="block text-left w-full font-mono text-zinc-400 hover:text-zinc-200 hover:underline truncate"
                  >
                    ➡️ {dep}
                  </button>
                ))
              ) : (
                <span className="text-zinc-500 italic">No direct dependencies.</span>
              )}
            </div>
          </div>

          <div className="space-y-2 bg-zinc-950/60 p-3.5 rounded-lg border border-zinc-800">
            <span className="font-semibold text-zinc-300 block">
              Direct Dependents ({plan.dependencyImpact.directDependents.length}):
            </span>
            <div className="space-y-1 max-h-32 overflow-y-auto">
              {plan.dependencyImpact.directDependents.length > 0 ? (
                plan.dependencyImpact.directDependents.map((dep) => (
                  <button
                    key={dep}
                    type="button"
                    onClick={() => onSelectFile && onSelectFile(dep)}
                    className="block text-left w-full font-mono text-zinc-400 hover:text-zinc-200 hover:underline truncate"
                  >
                    ⬅️ {dep}
                  </button>
                ))
              ) : (
                <span className="text-zinc-500 italic">No direct dependents.</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Recommended Strategy */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-2">
        <div className="text-xs font-bold text-cyan-400 uppercase tracking-wider flex items-center gap-2">
          <span>🎯</span> Recommended Refactoring Strategy
        </div>
        <p className="text-xs text-zinc-200 leading-relaxed font-semibold bg-zinc-950/60 p-3.5 rounded-lg border border-zinc-800">
          {plan.recommendedStrategy}
        </p>
      </div>

      {/* Step-by-Step Implementation Plan */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4">
        <div className="text-xs font-bold text-zinc-300 uppercase tracking-wider flex items-center gap-2">
          <span>🛠️</span> Ordered Implementation Steps ({plan.implementationSteps.length})
        </div>

        <div className="space-y-3">
          {plan.implementationSteps.map((step) => (
            <div
              key={step.stepNumber}
              className="bg-zinc-950/80 border border-zinc-800 rounded-lg p-4 space-y-2"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-cyan-950 border border-cyan-800 text-cyan-400 text-xs font-bold flex items-center justify-center">
                    {step.stepNumber}
                  </span>
                  <h4 className="text-xs font-bold text-zinc-100">{step.title}</h4>
                </div>
                {step.targetFile && (
                  <button
                    type="button"
                    onClick={() => onSelectFile && onSelectFile(step.targetFile!)}
                    className="text-[11px] font-mono text-cyan-400 hover:underline bg-zinc-900 px-2 py-0.5 rounded border border-zinc-800"
                  >
                    {step.targetFile}
                  </button>
                )}
              </div>
              <p className="text-xs text-zinc-300 pl-8 leading-relaxed">{step.description}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Grid: Risks & Testing Strategy */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3">
          <div className="text-xs font-bold text-amber-400 uppercase tracking-wider flex items-center gap-2">
            <span>⚠️</span> Risks & Regressions
          </div>
          <ul className="space-y-1.5 text-xs text-zinc-300 pl-2">
            {plan.risksAndRegressions.map((risk, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="text-amber-400">•</span>
                <span>{risk}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3">
          <div className="text-xs font-bold text-blue-400 uppercase tracking-wider flex items-center gap-2">
            <span>🧪</span> Testing Strategy
          </div>
          <ul className="space-y-1.5 text-xs text-zinc-300 pl-2">
            {plan.testingStrategy.map((test, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="text-blue-400">•</span>
                <span>{test}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Verification Checklist */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-3">
        <div className="text-xs font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-2">
          <span>✅</span> Verification Checklist
        </div>
        <div className="space-y-2">
          {plan.verificationChecklist.map((item, i) => (
            <div
              key={i}
              className="flex items-center gap-2.5 text-xs text-zinc-200 bg-zinc-950/60 p-2.5 rounded border border-zinc-800"
            >
              <span className="text-emerald-400 font-bold">✓</span>
              <span>{item}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Retrieved Source Citations */}
      {plan.sources.length > 0 && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-3">
          <div className="text-xs font-bold text-zinc-400 uppercase tracking-wider flex items-center justify-between">
            <span>📚 Grounded Source Code Evidence ({plan.sources.length})</span>
            <span className="text-[11px] font-mono text-zinc-500">
              Provider: {plan.providerUsed}
            </span>
          </div>

          <div className="space-y-2">
            {plan.sources.map((source, index) => (
              <div
                key={index}
                className="bg-zinc-950/80 border border-zinc-800 rounded-lg p-3 space-y-1.5 font-mono text-xs"
              >
                <div className="flex items-center justify-between text-zinc-400">
                  <button
                    type="button"
                    onClick={() => onSelectFile && onSelectFile(source.filePath)}
                    className="text-cyan-400 hover:underline font-semibold"
                  >
                    📄 {source.filePath}:{source.startLine}-{source.endLine}
                  </button>
                  <span className="text-[11px] text-zinc-500">
                    Similarity: {(source.score * 100).toFixed(1)}%
                  </span>
                </div>
                <pre className="text-[11px] text-zinc-300 bg-zinc-900/60 p-2 rounded overflow-x-auto whitespace-pre-wrap">
                  {source.content}
                </pre>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
