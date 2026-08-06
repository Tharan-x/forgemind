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
  ownerId: string;
  name: string;
  fullName: string;
  githubUrl: string;
  defaultBranch: string;
  isPrivate: boolean;
  status: string;
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

export interface AnalysisJob {
  id: string;
  repositoryId: string;
  status: string;
  commitHash: string | null;
  error: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  updatedAt: string;
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
