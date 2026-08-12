// =============================================================================
// ForgeMind — Shared Type Definitions
// =============================================================================

// ─── API Response Envelope ───────────────────────────────────────────────────

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: ApiError;
  meta?: ResponseMeta;
}

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface ResponseMeta {
  timestamp: string;
  version: string;
  requestId?: string;
}

// ─── Health Check ────────────────────────────────────────────────────────────

export interface HealthStatus {
  status: 'ok' | 'degraded' | 'error';
  version: string;
  uptime: number;
  timestamp: string;
  services: ServiceHealth[];
}

export interface ServiceHealth {
  name: string;
  status: 'ok' | 'degraded' | 'error';
  latency?: number;
  message?: string;
}

// ─── Environment ─────────────────────────────────────────────────────────────

export type AppEnvironment = 'development' | 'staging' | 'production' | 'test';

// ─── Pagination ──────────────────────────────────────────────────────────────

export interface PaginationParams {
  page: number;
  limit: number;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// ─── Auth & User Types ────────────────────────────────────────────────────────

export interface AuthUser {
  id: string;
  email: string;
  name?: string | null;
  avatarUrl?: string | null;
}

export interface UserProfile {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

// ─── Database Models Types ────────────────────────────────────────────────────

export interface User {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Repository {
  id: string;
  userId: string;
  githubId: number;
  name: string;
  fullName: string;
  owner: string;
  private: boolean;
  defaultBranch: string;
  language?: string | null;
  description?: string | null;
  stars: number;
  forks: number;
  htmlUrl: string;
  createdAt: string;
  updatedAt: string;
}

export interface RepositoryMember {
  id: string;
  repositoryId: string;
  userId: string;
  role: string;
  createdAt: string;
}

export type AnalysisJobStatus = 'pending' | 'in_progress' | 'completed' | 'failed';

export interface AnalysisJob {
  id: string;
  repositoryId: string;
  status: AnalysisJobStatus | string;
  commitHash: string | null;
  error: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface GithubTreeItem {
  path: string;
  mode: string;
  type: 'blob' | 'tree' | string;
  sha: string;
  size?: number;
  url?: string;
}

export interface RepositoryFile {
  id: string;
  repositoryId: string;
  path: string;
  name: string;
  extension: string | null;
  language: string | null;
  type: string;
  size: number | null;
  sha: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface IndexingResult {
  totalItemsProcessed: number;
  filesIndexed: number;
  ignoredItems: number;
  languageDistribution: Record<string, number>;
}

export interface RepositorySymbol {
  id: string;
  repositoryId: string;
  fileId: string;
  name: string;
  kind: string;
  filePath: string;
  startLine: number | null;
  endLine: number | null;
  exported: boolean;
  createdAt: string;
}

export interface FileDependency {
  id: string;
  repositoryId: string;
  sourceFileId: string;
  sourcePath: string;
  targetPath: string;
  isExternal: boolean;
  importedSymbols: string[];
  createdAt: string;
}

export interface ExtractionResult {
  filesParsed: number;
  totalSymbolsExtracted: number;
  totalDependenciesExtracted: number;
}

export interface VectorIndexingResult {
  filesChunked: number;
  totalChunksCreated: number;
  totalChunksEmbedded: number;
  chunksSkippedUnchanged: number;
  providerUsed: string;
}

export interface RepositoryAcquisitionResult {
  job: AnalysisJob;
  commitHash: string;
  fileCount: number;
  totalSizeBytes: number;
  indexing?: IndexingResult;
  extraction?: ExtractionResult;
  vectorIndexing?: VectorIndexingResult;
}

// ─── Vector Embeddings & Code Chunks ──────────────────────────────────────────

export interface CodeChunkMetadata {
  symbolName?: string;
  symbolKind?: string;
  headerContext?: string;
  checksum?: string;
  language?: string;
  filePath?: string;
  [key: string]: unknown;
}

export interface CodeChunk {
  id: string;
  repositoryId: string;
  fileId: string;
  chunkIndex: number;
  content: string;
  filePath: string;
  language: string | null;
  startLine: number;
  endLine: number;
  tokenCount: number;
  linesCount: number;
  checksum: string;
  metadata: CodeChunkMetadata | null;
  createdAt: string;
}

export interface VectorSearchResult {
  id: string;
  repositoryId: string;
  fileId: string;
  chunkIndex: number;
  content: string;
  filePath: string;
  language: string | null;
  startLine: number;
  endLine: number;
  tokenCount: number;
  linesCount: number;
  similarity: number;
  metadata: CodeChunkMetadata | null;
}

export interface VectorPipelineStatus {
  repositoryId: string;
  totalChunks: number;
  embeddedChunks: number;
  indexedFiles: number;
  provider: string;
}

// ─── RAG Context Retrieval & Chat Engine ───────────────────────────────────────

export interface RAGSourceCitation {
  filePath: string;
  startLine: number;
  endLine: number;
  score: number;
  symbolName?: string;
  symbolKind?: string;
  language?: string | null;
  content?: string;
}

export interface RAGQueryRequest {
  query: string;
  topK?: number;
  conversationId?: string;
}

export interface RAGQueryResponse {
  answer: string;
  sources: RAGSourceCitation[];
  repositoryId: string;
  query: string;
  providerUsed: string;
}

export interface RetrievedContextChunk {
  id: string;
  filePath: string;
  startLine: number;
  endLine: number;
  content: string;
  language: string | null;
  similarity: number;
  metadata: CodeChunkMetadata | null;
}

export interface ChatSession {
  id: string;
  repositoryId: string;
  userId: string;
  title: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ChatMessage {
  id: string;
  sessionId: string;
  sender: 'user' | 'assistant' | 'system';
  content: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

// ─── Code Intelligence & Explainability ──────────────────────────────────────

export interface CodeExplainRequest {
  /** Relative file path within the repository */
  filePath: string;
  /** Optional symbol name to explain (function, class, interface) */
  symbolName?: string;
  /** Optional symbol kind hint ('function' | 'class' | 'interface' | etc.) */
  symbolKind?: string;
}

export interface CodeExplainResponse {
  filePath: string;
  symbolName?: string;
  symbolKind?: string;
  startLine?: number;
  endLine?: number;
  /** AI-generated explanation grounded in retrieved code context */
  explanation: string;
  /** Supporting source citations */
  sources: RAGSourceCitation[];
  /** Related symbols found in the same file */
  relatedSymbols: RepositorySymbol[];
  providerUsed: string;
}

export interface FileDependencyIntelligence {
  filePath: string;
  /** Files this file imports from (outgoing) */
  imports: FileDependency[];
  /** Files that import this file (incoming) */
  importedBy: FileDependency[];
  /** Count of internal dependencies */
  internalCount: number;
  /** Count of external package dependencies */
  externalCount: number;
}

export interface ImpactAnalysisResult {
  targetFilePath: string;
  targetSymbolName?: string;
  /** Files that directly import the target */
  directDependents: FileDependency[];
  /** Symbols defined in the target file */
  affectedSymbols: RepositorySymbol[];
  /** Total count of files affected */
  totalAffected: number;
  /** Whether semantic RAG explanation was used */
  ragExplanationUsed: boolean;
  /** Optional AI narrative of impact */
  explanation?: string;
  sources?: RAGSourceCitation[];
}

export interface ArchitectureOverviewResponse {
  repositoryId: string;
  repositoryName: string;
  /** Language distribution: { TypeScript: 45, Python: 12, ... } */
  languageDistribution: Record<string, number>;
  totalFiles: number;
  totalSymbols: number;
  totalDependencies: number;
  internalDependencyCount: number;
  externalDependencyCount: number;
  /** Top-level directories detected from file paths */
  topDirectories: Array<{ directory: string; fileCount: number }>;
  /** Most referenced external packages */
  topExternalPackages: Array<{ package: string; count: number }>;
  /** Top symbol kinds: { function: 120, class: 30, ... } */
  symbolKindDistribution: Record<string, number>;
}
