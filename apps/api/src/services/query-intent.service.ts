// =============================================================================
// ForgeMind API — Query Intent & Keyword Extraction Service
// =============================================================================

export type QueryIntentCategory =
  | 'AUTHENTICATION'
  | 'DATABASE'
  | 'DB_CONFIGURATION'
  | 'GITHUB_SYNC'
  | 'AST_ANALYSIS'
  | 'DEPENDENCIES'
  | 'ARCHITECTURE'
  | 'FILE_LOCATION'
  | 'FLOW'
  | 'GENERAL';

export interface QueryIntentAnalysis {
  category: QueryIntentCategory;
  /** Normalized meaningful search terms */
  keywords: string[];
  /** High priority file path pattern hints */
  pathHints: string[];
  /** High priority symbol name hints */
  symbolHints: string[];
  /**
   * True when the question is specifically about configuration/connection setup
   * rather than about general database usage or schema DDL.
   * Used by retrieval ranking to penalise migration-only evidence.
   */
  isConfigurationQuery?: boolean;
  /**
   * File path sub-strings that represent low-quality evidence for this query.
   * Chunks whose filePath contains any of these strings receive a score penalty.
   */
  lowQualityPathPatterns?: string[];
}

const STOP_WORDS = new Set([
  'where',
  'is',
  'are',
  'the',
  'handled',
  'configured',
  'how',
  'does',
  'work',
  'what',
  'happens',
  'when',
  'run',
  'use',
  'uses',
  'explain',
  'tell',
  'me',
  'about',
  'can',
  'you',
  'show',
  'find',
  'a',
  'an',
  'of',
  'in',
  'to',
  'for',
  'and',
  'or',
  'on',
  'at',
  'by',
  'with',
  'from',
]);

/**
 * Extracts normalized query terms and technical aliases from a natural language question.
 */
export function extractQueryKeywords(query: string): string[] {
  const normalized = query
    .toLowerCase()
    .replace(/[^a-z0-9._/-]/g, ' ')
    .split(/\s+/)
    .filter((term) => term.length >= 2 && !STOP_WORDS.has(term));

  const expanded = new Set<string>(normalized);
  for (const term of normalized) {
    if (term.startsWith('auth')) {
      expanded.add('auth');
      expanded.add('authentication');
    }
    if (term === 'db' || term.startsWith('data') || term.startsWith('prisma')) {
      expanded.add('db');
      expanded.add('database');
      expanded.add('prisma');
    }
    if (term.startsWith('sync')) {
      expanded.add('sync');
      expanded.add('synchronization');
    }
    if (term === 'ast' || term.startsWith('analy') || term.startsWith('parse')) {
      expanded.add('ast');
      expanded.add('analysis');
      expanded.add('parser');
    }
    if (term.startsWith('depend') || term.startsWith('pack')) {
      expanded.add('dependencies');
      expanded.add('package.json');
      expanded.add('package');
    }
  }

  return Array.from(expanded);
}

/**
 * Extracts user-named symbols from a natural language query.
 *
 * Matches:
 *  - Backtick-quoted identifiers: `requireAuth`, `AuthService`, `executeRAGQuery`
 *  - camelCase identifiers: executeRAGQuery, getLLMProvider (≥2 words, not pure lowercase)
 *  - PascalCase identifiers: AuthService, PrismaClient
 *
 * These are added to symbolHints to boost chunks with exact metadata.symbolName matches.
 * This fixes the W8 weakness where user-named symbols were not used for retrieval boosting.
 */
export function extractUserNamedSymbols(query: string): string[] {
  const symbols = new Set<string>();

  // 1. Backtick-quoted identifiers: `symbolName`
  const backtickMatches = query.match(/`([a-zA-Z_][a-zA-Z0-9_]+)`/g) ?? [];
  for (const match of backtickMatches) {
    symbols.add(match.replace(/`/g, ''));
  }

  // 2. camelCase identifiers: at least one lowercase then uppercase transition
  //    e.g. requireAuth, getLLMProvider, executeRAGQuery
  const camelCaseMatches = query.match(/\b[a-z][a-zA-Z0-9]*[A-Z][a-zA-Z0-9]*\b/g) ?? [];
  for (const match of camelCaseMatches) {
    if (match.length >= 4) symbols.add(match);
  }

  // 3. PascalCase identifiers: starts uppercase, has lowercase chars
  //    e.g. AuthService, PrismaClient, OpenAILLMProvider
  const pascalCaseMatches = query.match(/\b[A-Z][a-z][a-zA-Z0-9]+\b/g) ?? [];
  for (const match of pascalCaseMatches) {
    if (match.length >= 4) symbols.add(match);
  }

  return Array.from(symbols);
}

/**
 * Analyzes natural language query intent and extracts target path/symbol hints.
 * Also extracts user-named camelCase/PascalCase/backtick-quoted symbols from the query
 * to boost retrieval of chunks matching the user's specific function or class of interest.
 */
export function analyzeQueryIntent(query: string): QueryIntentAnalysis {
  const lowerQuery = query.toLowerCase();
  const keywords = extractQueryKeywords(query);
  // Extract any user-named symbols directly from the query text (e.g. `requireAuth`, AuthService)
  const userNamedSymbols = extractUserNamedSymbols(query);

  // ── Flow / trace queries ────────────────────────────────────────────────────
  // Must be tested before AUTHENTICATION to capture "trace auth flow", etc.
  if (
    lowerQuery.includes('trace') ||
    lowerQuery.includes('flow') ||
    lowerQuery.includes('end-to-end') ||
    lowerQuery.includes('end to end') ||
    lowerQuery.includes('step by step') ||
    lowerQuery.includes('lifecycle') ||
    (lowerQuery.includes('request') && lowerQuery.includes('response'))
  ) {
    const flowKeywords = extractQueryKeywords(query);
    // Determine if the flow is auth-specific
    if (
      lowerQuery.includes('auth') ||
      lowerQuery.includes('login') ||
      lowerQuery.includes('token')
    ) {
      return {
        category: 'FLOW',
        keywords: flowKeywords,
        pathHints: ['auth', 'middleware', 'routes', 'controller', 'frontend', 'client'],
        symbolHints: [
          ...new Set([
            'requireAuth',
            'verifyToken',
            'useSession',
            'createClient',
            ...userNamedSymbols,
          ]),
        ],
      };
    }
    return {
      category: 'FLOW',
      keywords: flowKeywords,
      pathHints: ['routes', 'controller', 'service', 'middleware'],
      symbolHints: [...userNamedSymbols],
    };
  }

  // ── Authentication ──────────────────────────────────────────────────────────
  if (
    lowerQuery.includes('auth') ||
    lowerQuery.includes('login') ||
    lowerQuery.includes('token') ||
    lowerQuery.includes('jwt') ||
    lowerQuery.includes('permission') ||
    lowerQuery.includes('credential')
  ) {
    return {
      category: 'AUTHENTICATION',
      keywords,
      pathHints: ['auth', 'user', 'credential', 'session', 'middleware'],
      symbolHints: [
        ...new Set(['requireAuth', 'verifyToken', 'AuthService', 'User', ...userNamedSymbols]),
      ],
    };
  }

  // ── Database — connection/configuration specific ────────────────────────────
  // Questions asking WHERE/HOW the database is CONFIGURED, CONNECTED, or
  // INITIALISED target schema.prisma and env config rather than migrations.
  if (
    (lowerQuery.includes('database') ||
      lowerQuery.includes('db') ||
      lowerQuery.includes('prisma') ||
      lowerQuery.includes('postgres')) &&
    (lowerQuery.includes('connect') ||
      lowerQuery.includes('config') ||
      lowerQuery.includes('configured') ||
      lowerQuery.includes('url') ||
      lowerQuery.includes('datasource') ||
      lowerQuery.includes('client') ||
      lowerQuery.includes('initializ') ||
      lowerQuery.includes('env'))
  ) {
    return {
      category: 'DB_CONFIGURATION',
      keywords,
      // Prefer datasource config files over migration DDL
      pathHints: ['schema.prisma', 'config', 'env', '.env', 'lib', 'supabase'],
      symbolHints: [
        ...new Set([
          'DATABASE_URL',
          'DIRECT_URL',
          'datasource',
          'PrismaClient',
          'createClient',
          ...userNamedSymbols,
        ]),
      ],
      isConfigurationQuery: true,
      // Migration files are not database connection configuration
      lowQualityPathPatterns: ['migrations'],
    };
  }

  // ── Database — general ──────────────────────────────────────────────────────
  if (
    lowerQuery.includes('database') ||
    lowerQuery.includes('db') ||
    lowerQuery.includes('prisma') ||
    lowerQuery.includes('schema') ||
    lowerQuery.includes('postgres') ||
    lowerQuery.includes('connection')
  ) {
    return {
      category: 'DATABASE',
      keywords,
      pathHints: ['prisma', 'schema', 'config', 'env', 'lib'],
      symbolHints: [...new Set(['PrismaClient', 'prisma', 'DATABASE_URL', ...userNamedSymbols])],
    };
  }

  if (
    lowerQuery.includes('github') ||
    lowerQuery.includes('sync') ||
    lowerQuery.includes('synchronization') ||
    lowerQuery.includes('acquisition') ||
    lowerQuery.includes('commit')
  ) {
    return {
      category: 'GITHUB_SYNC',
      keywords,
      pathHints: ['github', 'sync', 'acquisition'],
      symbolHints: [
        ...new Set([
          'createGithubClient',
          'syncRepositories',
          'triggerRepositoryAnalysis',
          ...userNamedSymbols,
        ]),
      ],
    };
  }

  if (
    lowerQuery.includes('ast') ||
    lowerQuery.includes('analysis') ||
    lowerQuery.includes('parser') ||
    lowerQuery.includes('symbol')
  ) {
    return {
      category: 'AST_ANALYSIS',
      keywords,
      pathHints: ['ast', 'symbol', 'analysis', 'tree-indexing'],
      symbolHints: [
        ...new Set([
          'parseSourceFile',
          'extractAndIndexFileSymbols',
          'indexRepositoryTree',
          ...userNamedSymbols,
        ]),
      ],
    };
  }

  if (
    lowerQuery.includes('dependenc') ||
    lowerQuery.includes('package') ||
    lowerQuery.includes('npm') ||
    lowerQuery.includes('pnpm')
  ) {
    return {
      category: 'DEPENDENCIES',
      keywords,
      pathHints: ['package.json', 'dependencies'],
      symbolHints: [...new Set(['dependencies', 'devDependencies', ...userNamedSymbols])],
    };
  }

  if (
    lowerQuery.includes('architecture') ||
    lowerQuery.includes('structure') ||
    lowerQuery.includes('overview') ||
    lowerQuery.includes('design') ||
    lowerQuery.includes('modules')
  ) {
    return {
      category: 'ARCHITECTURE',
      keywords,
      pathHints: ['apps/', 'packages/', 'src/'],
      symbolHints: [...userNamedSymbols],
    };
  }

  if (lowerQuery.includes('where is') || lowerQuery.includes('where are')) {
    return {
      category: 'FILE_LOCATION',
      keywords,
      pathHints: keywords,
      symbolHints: [...userNamedSymbols],
    };
  }

  return {
    category: 'GENERAL',
    keywords,
    pathHints: keywords,
    symbolHints: [...userNamedSymbols],
  };
}
