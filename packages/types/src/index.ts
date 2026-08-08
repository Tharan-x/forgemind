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

export interface RepositoryAcquisitionResult {
  job: AnalysisJob;
  commitHash: string;
  fileCount: number;
  totalSizeBytes: number;
  indexing?: IndexingResult;
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
