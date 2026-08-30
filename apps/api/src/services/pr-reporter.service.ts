// =============================================================================
// ForgeMind API — GitHub PR Reporter Service (Phase 7.6)
// =============================================================================
//
// Manages GitHub status checks and idempotent PR comments for the Architecture
// Gatekeeper pipeline:
//   1. Posts GitHub Commit Status (pending, success, failure, error) on head SHA.
//   2. Generates formatted GitHub Markdown reports.
//   3. Upserts PR comments idempotently (searching for existing report marker).
// =============================================================================

import { createGithubClient, type GithubStatusState } from '../github/index.js';

import type { PRAnalysisSummary } from './pr-analysis.service.js';

export const GATEKEEPER_COMMENT_MARKER = '<!-- forgemind-gatekeeper-report -->';
export const GATEKEEPER_STATUS_CONTEXT = 'forgemind/architecture-gatekeeper';

/**
 * Posts a GitHub Commit Status update for a PR analysis run.
 */
export async function postPRGatekeeperStatus(options: {
  githubToken: string;
  owner: string;
  repo: string;
  headSha: string;
  state: GithubStatusState;
  description: string;
  targetUrl?: string;
}): Promise<boolean> {
  const { githubToken, owner, repo, headSha, state, description, targetUrl } = options;

  try {
    const github = createGithubClient(githubToken);
    await github.postCommitStatus(owner, repo, headSha, {
      state,
      context: GATEKEEPER_STATUS_CONTEXT,
      description: description.slice(0, 140), // GitHub status description max length is 140 chars
      target_url: targetUrl,
    });
    return true;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(
      `[PR Reporter] Failed to post GitHub commit status for ${owner}/${repo}@${headSha.slice(0, 7)}:`,
      err,
    );
    return false;
  }
}

/**
 * Generates a formatted GitHub Markdown report for a PR Gatekeeper policy evaluation result.
 */
export function generatePRGatekeeperMarkdownReport(summary: PRAnalysisSummary): string {
  const { snapshot, policyResult, comparison } = summary;

  let outcomeBadge = '⚪ **NEUTRAL**';
  if (policyResult.outcome === 'pass') outcomeBadge = '🟢 **PASS**';
  else if (policyResult.outcome === 'fail') outcomeBadge = '🔴 **FAIL**';

  const baselineScoreStr =
    policyResult.baselineHealthScore !== null ? `${policyResult.baselineHealthScore}/100` : 'N/A';
  const healthDeltaStr =
    policyResult.baselineHealthScore !== null
      ? policyResult.healthDelta >= 0
        ? `+${policyResult.healthDelta}`
        : `${policyResult.healthDelta}`
      : 'N/A';

  const lines: string[] = [
    GATEKEEPER_COMMENT_MARKER,
    '## 🛡️ ForgeMind Architecture Gatekeeper Report',
    '',
    `**Outcome:** ${outcomeBadge}`,
    `**Status:** ${policyResult.statusDescription}`,
    '',
    '### 📊 Architecture Health Metrics',
    '| Metric | Value |',
    '| :--- | :--- |',
    `| **PR Health Score** | \`${snapshot.healthScore}/100\` (Grade **${snapshot.grade}**) |`,
    `| **Baseline Health Score** | \`${baselineScoreStr}\` |`,
    `| **Health Delta** | \`${healthDeltaStr} points\` |`,
    `| **Total Files Analyzed** | \`${snapshot.totalFiles}\` |`,
    `| **Total Dependencies** | \`${snapshot.totalDependencies}\` |`,
    `| **Circular Cycles** | \`${snapshot.circularCycleCount}\` |`,
    `| **Layer Violations** | \`${snapshot.layerViolationCount}\` |`,
    '',
  ];

  if (policyResult.reasons.length > 0) {
    lines.push('### 📋 Policy Evaluation & Findings');
    policyResult.reasons.forEach((reason) => {
      lines.push(`- ${reason}`);
    });
    lines.push('');
  }

  if (comparison && comparison.newFindings.length > 0) {
    lines.push('### ⚠️ Newly Introduced Anti-Patterns');
    comparison.newFindings.slice(0, 5).forEach((finding) => {
      const files = finding.affectedFilePaths.join(', ');
      lines.push(
        `- **[${finding.severity.toUpperCase()}] ${finding.title}**: ${finding.description} _(${files})_`,
      );
    });
    if (comparison.newFindings.length > 5) {
      lines.push(`- _...and ${comparison.newFindings.length - 5} more new finding(s)._`);
    }
    lines.push('');
  }

  lines.push('---');
  lines.push(
    '*Evaluated automatically by [ForgeMind](https://forgemind.ai) Architecture Gatekeeper*',
  );

  return lines.join('\n');
}

/**
 * Idempotently posts or updates a PR comment containing the Gatekeeper report.
 */
export async function upsertPRGatekeeperComment(options: {
  githubToken: string;
  owner: string;
  repo: string;
  prNumber: number;
  summary: PRAnalysisSummary;
}): Promise<boolean> {
  const { githubToken, owner, repo, prNumber, summary } = options;

  try {
    const github = createGithubClient(githubToken);
    const reportBody = generatePRGatekeeperMarkdownReport(summary);

    // 1. List existing comments to find previous report comment by marker
    const comments = await github.listIssueComments(owner, repo, prNumber);
    const existingComment = comments.find((c) => c.body.includes(GATEKEEPER_COMMENT_MARKER));

    if (existingComment) {
      // Update existing comment
      await github.updateIssueComment(owner, repo, existingComment.id, reportBody);
    } else {
      // Create new comment
      await github.createIssueComment(owner, repo, prNumber, reportBody);
    }

    return true;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(
      `[PR Reporter] Failed to upsert PR comment for ${owner}/${repo}#${prNumber}:`,
      err,
    );
    return false;
  }
}
