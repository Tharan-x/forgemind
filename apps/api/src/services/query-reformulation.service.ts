// =============================================================================
// ForgeMind API — Contextual Query Reformulation Service
// =============================================================================

import type { ChatMessage } from '@forgemind/types';
import { extractQueryKeywords } from './query-intent.service.js';

const MAX_REFORMULATED_QUERY_LENGTH = 500;
const MAX_HISTORY_MESSAGES_TO_INSPECT = 4;

/**
 * Patterns indicating anaphoric or contextual references to previous turns.
 */
const CONTEXTUAL_REFERENCE_PATTERNS = [
  /\b(it|its|they|them|this|that|there|here)\b/i,
  /\b(this|that)\s+(file|function|service|method|class|module|component|route|controller|table)\b/i,
  /\bthe\s+(token|credential|implementation|service|function|file|module|handler|endpoint|schema|database|config|sync|flow|indexing)\b/i,
  /\bwhat\s+happens\s+(next|after|when)\b/i,
  /\bhow\s+does\s+it\s+work\b/i,
  /\bwhere\s+is\s+it\s+(initialized|configured|handled|defined|used|called|stored|saved)\b/i,
  /\bwhat\s+does\s+it\s+do\b/i,
  /\bwhat\s+vulnerability\s+(is|was|did)\b/i,
  /\bwhich\s+(file|service|function|method)\s+(actually|specifically|handles|initializes|runs|performs|does|is)\b/i,
];

/**
 * Generic structural/action terms to filter out from contextual enrichment additions
 * to avoid keyword pollution.
 */
const GENERIC_POLLUTION_WORDS = new Set([
  'file',
  'files',
  'service',
  'services',
  'function',
  'functions',
  'implementation',
  'implementations',
  'what',
  'where',
  'which',
  'happens',
  'happen',
  'actual',
  'actually',
  'explain',
  'show',
  'tell',
  'me',
  'run',
  'runs',
  'running',
  'does',
  'work',
  'works',
  'working',
  'is',
  'are',
  'there',
  'here',
  'this',
  'that',
  'the',
  'a',
  'an',
  'vulnerability',
  'vulnerabilities',
  'find',
  'found',
]);

/**
 * Regex to detect explicit technical file path signals in a query.
 */
const EXPLICIT_FILE_PATH_REGEX = /[\w.-]+\.(ts|tsx|js|jsx|json|md|css|sql|prisma|html)\b/i;

/**
 * Detects whether a query string contains explicit file path or technology terms.
 */
function hasExplicitTechnicalSignals(query: string): boolean {
  if (EXPLICIT_FILE_PATH_REGEX.test(query)) {
    return true;
  }

  const lower = query.toLowerCase();
  const explicitTechs = ['kafka', 'kubernetes', 'k8s', 'redis', 'mongodb', 'graphql', 'docker'];
  for (const tech of explicitTechs) {
    if (lower.includes(tech)) {
      return true;
    }
  }

  return false;
}

/**
 * Extracts high-confidence technical/entity terms from text, preferring user messages.
 */
function extractEntityTerms(text: string): string[] {
  // Extract explicit file paths first (e.g. auth/middleware.ts or schema.prisma)
  const filePathMatches = text.match(/[\w/-]+\.(ts|tsx|js|jsx|json|md|css|sql|prisma)\b/gi) || [];

  // Extract keywords using existing query-intent stop-word filtering & expansion
  const keywords = extractQueryKeywords(text);

  // Filter out generic pollution words
  const meaningfulKeywords = keywords.filter(
    (kw) => !GENERIC_POLLUTION_WORDS.has(kw.toLowerCase()),
  );

  const termsSet = new Set<string>();

  for (const path of filePathMatches) {
    termsSet.add(path.toLowerCase());
  }

  for (const kw of meaningfulKeywords) {
    termsSet.add(kw.toLowerCase());
  }

  return Array.from(termsSet);
}

/**
 * Reformulates a user query using bounded recent conversation history
 * to resolve pronouns and contextual references for codebase context retrieval.
 *
 * Enforces:
 * - Empty history -> returns rawQuery unchanged
 * - Self-contained query -> returns rawQuery unchanged
 * - User message prioritization (never trusts hallucinated assistant paths alone)
 * - Explicit technology preservation (never replaces user's explicit tech search)
 * - Generic keyword pollution avoidance
 * - Max 500 characters string limit
 *
 * @param rawQuery Current user query
 * @param historyMessages Recent chat history messages (up to 10)
 * @returns Reformulated query string for retrieval only
 */
export function reformulateQueryForRetrieval(
  rawQuery: string,
  historyMessages?: ChatMessage[],
): string {
  const trimmed = rawQuery.trim();
  if (!trimmed) {
    return rawQuery;
  }

  // Rule 1: Empty history
  if (!historyMessages || historyMessages.length === 0) {
    return trimmed;
  }

  const validMessages = historyMessages.filter(
    (msg) => msg && typeof msg.content === 'string' && msg.content.trim().length > 0,
  );
  if (validMessages.length === 0) {
    return trimmed;
  }

  // Inspect at most the 4 most recent messages (last 2 turns)
  const recentMessages = validMessages.slice(-MAX_HISTORY_MESSAGES_TO_INSPECT);

  // Rule 3: Check if query contains anaphora / contextual references
  const hasContextualRef = CONTEXTUAL_REFERENCE_PATTERNS.some((pattern) => pattern.test(trimmed));

  // Check if current query has no technical keywords at all (e.g. "What happens when it runs?")
  const currentKeywords = extractQueryKeywords(trimmed).filter(
    (kw) => !GENERIC_POLLUTION_WORDS.has(kw.toLowerCase()),
  );

  const needsEnrichment = hasContextualRef || currentKeywords.length === 0;

  // Rule 2 & Rule 5: If query is self-contained and does NOT contain vague contextual references, return rawQuery
  if (!needsEnrichment && hasExplicitTechnicalSignals(trimmed)) {
    return trimmed;
  }

  if (!needsEnrichment && currentKeywords.length >= 2) {
    return trimmed;
  }

  // Extract entity terms from recent history, prioritizing USER messages
  const userMessages = recentMessages.filter((msg) => msg.sender === 'user');
  const assistantMessages = recentMessages.filter((msg) => msg.sender === 'assistant');

  const userEntityTerms: string[] = [];
  for (const msg of userMessages) {
    const terms = extractEntityTerms(msg.content);
    userEntityTerms.push(...terms);
  }

  const assistantEntityTerms: string[] = [];
  for (const msg of assistantMessages) {
    const paths = msg.content.match(/[\w/-]+\.(ts|tsx|js|jsx|json|md|css|sql|prisma)\b/gi) || [];
    for (const p of paths) {
      assistantEntityTerms.push(p.toLowerCase());
    }
  }

  // Deduplicate terms
  const combinedTermsSet = new Set<string>();

  // Add USER terms first (Prioritize USER messages)
  for (const term of userEntityTerms) {
    combinedTermsSet.add(term);
  }

  // Add Assistant terms ONLY if they don't introduce unverified technologies (Kafka/Kubernetes/etc)
  for (const term of assistantEntityTerms) {
    if (term.includes('kafka') || term.includes('kubernetes') || term.includes('k8s')) {
      const userMentioned = userMessages.some((u) => u.content.toLowerCase().includes(term));
      if (!userMentioned) continue;
    }
    combinedTermsSet.add(term);
  }

  const newTerms = Array.from(combinedTermsSet).filter((t) => {
    return !trimmed.toLowerCase().includes(t);
  });

  if (newTerms.length === 0) {
    return trimmed;
  }

  // Rule 8: Character budget cap (500 chars)
  let reformulated = trimmed;
  const additionString = newTerms.join(' ');
  const candidate = `${trimmed} ${additionString}`;

  if (candidate.length <= MAX_REFORMULATED_QUERY_LENGTH) {
    return candidate;
  }

  // Truncate appended terms to fit within 500 chars, keeping rawQuery intact
  for (const term of newTerms) {
    if (`${reformulated} ${term}`.length <= MAX_REFORMULATED_QUERY_LENGTH) {
      reformulated += ` ${term}`;
    } else {
      break;
    }
  }

  return reformulated;
}
