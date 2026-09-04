// =============================================================================
// ForgeMind API — Authentication Middleware
// =============================================================================

import type { NextFunction, Request, Response } from 'express';

import { supabase } from '../lib/supabase.js';
import { ensureUserProfile } from './service.js';

export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
}

/**
 * Express middleware to validate Supabase JWT / Session tokens.
 * Protects backend endpoints and auto-creates user profiles if missing.
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Missing or invalid Authorization header.',
      },
    });
    return;
  }

  const token = authHeader.substring(7);

  try {
    const { data, error } = await supabase.auth.getUser(token);

    if (error || !data.user || !data.user.email) {
      res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Invalid or expired authentication token.',
        },
      });
      return;
    }

    const userMetaData = data.user.user_metadata || {};
    const name =
      (userMetaData['name'] as string | undefined) ||
      (userMetaData['full_name'] as string | undefined) ||
      null;
    const avatarUrl = (userMetaData['avatar_url'] as string | undefined) || null;

    // Automatically create or fetch profile on first login
    const dbUser = await ensureUserProfile({
      id: data.user.id,
      email: data.user.email,
      name,
      avatarUrl,
    });

    (req as AuthenticatedRequest).user = {
      id: dbUser.id,
      email: dbUser.email,
      name: dbUser.name,
      avatarUrl: dbUser.avatarUrl,
    };

    // Server-side Device Authorization & Revocation Check
    const rawDeviceId = req.headers['x-device-id'] as string | undefined;
    const deviceId = typeof rawDeviceId === 'string' ? rawDeviceId.trim() : '';
    const isDeviceRoute = (req.originalUrl || req.url || '').includes('/account/devices');

    if (!isDeviceRoute) {
      if (!deviceId) {
        res.status(403).json({
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: 'Device identification header (X-Device-Id) is required.',
          },
        });
        return;
      }

      const { checkDeviceTrustStatus } = await import('../services/device-management.service.js');
      const trustStatus = await checkDeviceTrustStatus(dbUser.id, deviceId);

      // Reject explicitly revoked or unknown devices for protected application endpoints
      if (trustStatus.isRevoked) {
        res.status(403).json({
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: trustStatus.isExpired
              ? 'Device trust has expired. Re-authentication required.'
              : 'Device access revoked or untrusted. Authentication required.',
          },
        });
        return;
      }
    }

    next();
  } catch {
    res.status(401).json({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Failed to authenticate request.',
      },
    });
  }
}
