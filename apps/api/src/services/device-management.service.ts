// =============================================================================
// ForgeMind API — Device & Session Management Service
// =============================================================================

import { prisma } from '../lib/prisma.js';

export interface DeviceTrustParams {
  deviceId: string;
  deviceName: string;
  browser?: string;
  os?: string;
  trust: boolean;
}

export interface UserDeviceDTO {
  id: string;
  userId: string;
  deviceId: string;
  deviceName: string;
  browser: string | null;
  os: string | null;
  isTrusted: boolean;
  trustedUntil: string | null;
  lastActiveAt: string;
  createdAt: string;
  isCurrentDevice: boolean;
}

/**
 * Retrieves all registered devices for a user, filtering/validating expiration status.
 */
export async function getUserDevices(
  userId: string,
  currentDeviceId?: string,
): Promise<UserDeviceDTO[]> {
  const devices = await prisma.userDevice.findMany({
    where: { userId },
    orderBy: { lastActiveAt: 'desc' },
  });

  const now = new Date();

  return devices.map((d) => {
    const isExpired = d.trustedUntil ? new Date(d.trustedUntil) < now : false;
    const isTrusted = d.isTrusted && !isExpired;

    return {
      id: d.id,
      userId: d.userId,
      deviceId: d.deviceId,
      deviceName: d.deviceName,
      browser: d.browser,
      os: d.os,
      isTrusted,
      trustedUntil: d.trustedUntil ? d.trustedUntil.toISOString() : null,
      lastActiveAt: d.lastActiveAt.toISOString(),
      createdAt: d.createdAt.toISOString(),
      isCurrentDevice: Boolean(currentDeviceId && d.deviceId === currentDeviceId),
    };
  });
}

export interface DeviceTrustCheckResult {
  isTrusted: boolean;
  isExpired: boolean;
  isRegistered: boolean;
  isRevoked: boolean;
  trustedUntil: string | null;
  deviceName?: string;
}

/**
 * Checks whether a specific device is registered and currently trusted for a user.
 */
export async function checkDeviceTrustStatus(
  userId: string,
  deviceId: string,
): Promise<DeviceTrustCheckResult> {
  if (!deviceId) {
    return {
      isTrusted: false,
      isExpired: false,
      isRegistered: false,
      isRevoked: false,
      trustedUntil: null,
    };
  }

  const device = await prisma.userDevice.findUnique({
    where: {
      userId_deviceId: {
        userId,
        deviceId,
      },
    },
  });

  if (!device) {
    return {
      isTrusted: false,
      isExpired: false,
      isRegistered: false,
      isRevoked: true,
      trustedUntil: null,
    };
  }

  const now = new Date();
  const isExpired = device.trustedUntil ? new Date(device.trustedUntil) < now : false;
  const isTrusted = device.isTrusted && !isExpired;
  const isRevoked = false;

  // Update last active timestamp asynchronously
  prisma.userDevice
    .update({
      where: { id: device.id },
      data: { lastActiveAt: now },
    })
    .catch(() => {
      // Ignore background timestamp update error
    });

  return {
    isTrusted,
    isExpired,
    isRegistered: true,
    isRevoked,
    trustedUntil: device.trustedUntil ? device.trustedUntil.toISOString() : null,
    deviceName: device.deviceName,
  };
}

/**
 * Registers or updates a device's trust status (30 days if trusted).
 */
export async function upsertDeviceTrust(
  userId: string,
  params: DeviceTrustParams,
): Promise<UserDeviceDTO> {
  const { deviceId, deviceName, browser, os, trust } = params;
  const now = new Date();
  const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
  const trustedUntil = trust ? new Date(now.getTime() + THIRTY_DAYS_MS) : null;

  const device = await prisma.userDevice.upsert({
    where: {
      userId_deviceId: {
        userId,
        deviceId,
      },
    },
    update: {
      deviceName,
      browser: browser || null,
      os: os || null,
      isTrusted: trust,
      trustedUntil,
      lastActiveAt: now,
    },
    create: {
      userId,
      deviceId,
      deviceName,
      browser: browser || null,
      os: os || null,
      isTrusted: trust,
      trustedUntil,
      lastActiveAt: now,
    },
  });

  return {
    id: device.id,
    userId: device.userId,
    deviceId: device.deviceId,
    deviceName: device.deviceName,
    browser: device.browser,
    os: device.os,
    isTrusted: device.isTrusted,
    trustedUntil: device.trustedUntil ? device.trustedUntil.toISOString() : null,
    lastActiveAt: device.lastActiveAt.toISOString(),
    createdAt: device.createdAt.toISOString(),
    isCurrentDevice: true,
  };
}

/**
 * Revokes trust for a device belonging to the user.
 */
export async function revokeUserDevice(userId: string, targetId: string): Promise<void> {
  const device = await prisma.userDevice.findFirst({
    where: {
      OR: [{ id: targetId }, { deviceId: targetId }],
      userId,
    },
  });

  if (!device) {
    throw new Error('Device not found or access denied.');
  }

  await prisma.userDevice.delete({
    where: { id: device.id },
  });
}
