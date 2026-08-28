// =============================================================================
// ForgeMind API — Account & Device Management Router (/api/v1/account)
// =============================================================================

import { Router, type Response, type Router as RouterType } from 'express';
import { successResponse, errorResponse } from '@forgemind/shared';

import { requireAuth, type AuthenticatedRequest } from '../auth/index.js';
import {
  getUserDevices,
  checkDeviceTrustStatus,
  upsertDeviceTrust,
  revokeUserDevice,
} from '../services/device-management.service.js';

const router: RouterType = Router();

/**
 * GET /api/v1/account/devices
 * Lists all registered devices for the authenticated user.
 */
router.get('/devices', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json(errorResponse('UNAUTHORIZED', 'Not authenticated.'));
    return;
  }

  try {
    const currentDeviceId =
      (req.headers['x-device-id'] as string) || (req.query['deviceId'] as string);
    const devices = await getUserDevices(req.user.id, currentDeviceId);
    res.json(successResponse({ devices }));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to retrieve user devices.';
    res.status(500).json(errorResponse('INTERNAL_SERVER_ERROR', message));
  }
});

/**
 * GET /api/v1/account/devices/check
 * Checks trust status for a given deviceId.
 */
router.get('/devices/check', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json(errorResponse('UNAUTHORIZED', 'Not authenticated.'));
    return;
  }

  const deviceId = (req.query['deviceId'] as string) || (req.headers['x-device-id'] as string);

  try {
    const status = await checkDeviceTrustStatus(req.user.id, deviceId);
    res.json(successResponse(status));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to check device trust status.';
    res.status(500).json(errorResponse('INTERNAL_SERVER_ERROR', message));
  }
});

/**
 * POST /api/v1/account/devices/trust
 * Registers or updates trust status for a device.
 */
router.post('/devices/trust', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json(errorResponse('UNAUTHORIZED', 'Not authenticated.'));
    return;
  }

  const { deviceId, deviceName, browser, os, trust, password } = req.body as {
    deviceId?: string;
    deviceName?: string;
    browser?: string;
    os?: string;
    trust?: boolean;
    password?: string;
  };

  if (!deviceId || typeof deviceId !== 'string' || !deviceId.trim()) {
    res.status(400).json(errorResponse('INVALID_INPUT', 'A valid deviceId is required.'));
    return;
  }

  // Step-up Verification: Granting trust requires password re-authentication
  if (trust === true) {
    if (!password || typeof password !== 'string' || !password.trim()) {
      res
        .status(403)
        .json(
          errorResponse(
            'STEP_UP_REQUIRED',
            'Password re-authentication is required to trust this device.',
          ),
        );
      return;
    }

    try {
      const { supabase } = await import('../lib/supabase.js');
      const { error: authErr } = await supabase.auth.signInWithPassword({
        email: req.user.email,
        password: password.trim(),
      });

      if (authErr) {
        res
          .status(403)
          .json(
            errorResponse(
              'STEP_UP_REQUIRED',
              'Password re-authentication failed. Incorrect password.',
            ),
          );
        return;
      }
    } catch {
      res.status(403).json(errorResponse('STEP_UP_REQUIRED', 'Password re-authentication failed.'));
      return;
    }
  }

  try {
    const device = await upsertDeviceTrust(req.user.id, {
      deviceId: deviceId.trim(),
      deviceName: deviceName || 'Web Browser',
      browser,
      os,
      trust: Boolean(trust),
    });

    res.json(successResponse({ device }));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to update device trust.';
    res.status(500).json(errorResponse('INTERNAL_SERVER_ERROR', message));
  }
});

/**
 * DELETE /api/v1/account/devices/:id
 * Revokes trust and removes device for the authenticated user.
 */
router.delete('/devices/:id', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json(errorResponse('UNAUTHORIZED', 'Not authenticated.'));
    return;
  }

  const targetId = Array.isArray(req.params['id']) ? req.params['id'][0] : req.params['id'];

  if (!targetId) {
    res.status(400).json(errorResponse('INVALID_INPUT', 'Target device ID is required.'));
    return;
  }

  try {
    await revokeUserDevice(req.user.id, targetId);
    res.json(successResponse({ success: true, message: 'Device trust revoked successfully.' }));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to revoke device trust.';
    res.status(404).json(errorResponse('NOT_FOUND', message));
  }
});

export { router as accountRouter };
