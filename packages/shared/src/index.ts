// =============================================================================
// ForgeMind — Shared Utilities
// =============================================================================

import type { ApiResponse, ApiError, ResponseMeta } from '@forgemind/types';

// ─── API Response Builders ────────────────────────────────────────────────────

/**
 * Build a successful API response envelope.
 */
export function successResponse<T>(data: T, meta?: Partial<ResponseMeta>): ApiResponse<T> {
  return {
    success: true,
    data,
    meta: {
      timestamp: new Date().toISOString(),
      version: '1',
      ...meta,
    },
  };
}

/**
 * Build an error API response envelope.
 */
export function errorResponse(
  code: string,
  message: string,
  details?: Record<string, unknown>,
): ApiResponse<never> {
  return {
    success: false,
    error: { code, message, details } satisfies ApiError,
    meta: {
      timestamp: new Date().toISOString(),
      version: '1',
    },
  };
}

// ─── String Utilities ────────────────────────────────────────────────────────

/**
 * Convert a string to title case.
 * @example toTitleCase('hello world') // 'Hello World'
 */
export function toTitleCase(str: string): string {
  return str.replace(/\b\w/g, (char) => char.toUpperCase());
}

/**
 * Slugify a string for use in URLs.
 * @example slugify('Hello World!') // 'hello-world'
 */
export function slugify(str: string): string {
  return str
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// ─── Validation Utilities ────────────────────────────────────────────────────

/**
 * Check whether a string is a valid email address.
 */
export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * Check whether a string is a valid UUID v4.
 */
export function isValidUUID(uuid: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(uuid);
}

// ─── Date Utilities ──────────────────────────────────────────────────────────

/**
 * Format a Date or ISO string into a human-readable date.
 */
export function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

// ─── Constants ───────────────────────────────────────────────────────────────

export const APP_NAME = 'ForgeMind';
export const APP_VERSION = '0.1.0';
export const API_VERSION = 'v1';
