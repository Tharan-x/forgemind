// =============================================================================
// ForgeMind Web — Device Identification & Management API Client
// =============================================================================

import { supabase } from './supabase';

export interface UserDevice {
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

export interface DeviceTrustStatus {
  isTrusted: boolean;
  isExpired: boolean;
  trustedUntil: string | null;
  deviceName?: string;
}

const API_BASE_URL = process.env['NEXT_PUBLIC_API_URL'] || 'http://localhost:3001';

/**
 * Retrieves persistent unique device ID for this browser instance.
 */
export function getDeviceId(): string {
  if (typeof window === 'undefined') return 'server-device';

  const STORAGE_KEY = 'forgemind_device_id';
  let deviceId = localStorage.getItem(STORAGE_KEY);

  if (!deviceId) {
    deviceId =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `dev-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    localStorage.setItem(STORAGE_KEY, deviceId);
  }

  return deviceId;
}

/**
 * Extracts browser name and OS from navigator.userAgent safely.
 */
export function getDeviceMetadata(): { deviceName: string; browser: string; os: string } {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return { deviceName: 'Web Client', browser: 'Browser', os: 'OS' };
  }

  const ua = navigator.userAgent;
  let browser = 'Chrome/Safari';
  let os = 'Desktop';

  if (ua.includes('Firefox/')) browser = 'Firefox';
  else if (ua.includes('Edg/')) browser = 'Edge';
  else if (ua.includes('Chrome/')) browser = 'Chrome';
  else if (ua.includes('Safari/')) browser = 'Safari';

  if (ua.includes('Win')) os = 'Windows';
  else if (ua.includes('Mac')) os = 'macOS';
  else if (ua.includes('Linux')) os = 'Linux';
  else if (ua.includes('Android')) os = 'Android';
  else if (ua.includes('iPhone') || ua.includes('iPad')) os = 'iOS';

  return {
    deviceName: `${browser} on ${os}`,
    browser,
    os,
  };
}

async function getAuthHeader(explicitToken?: string): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = explicitToken || data.session?.access_token;
  const deviceId = getDeviceId();
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    'X-Device-Id': deviceId,
  };
}

/**
 * Fetches all user devices from API.
 */
export async function fetchUserDevices(): Promise<UserDevice[]> {
  const headers = await getAuthHeader();
  const response = await fetch(`${API_BASE_URL}/api/v1/account/devices`, { headers });

  if (!response.ok) {
    const errorData = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new Error(errorData.error?.message || 'Failed to fetch registered devices.');
  }

  const data = (await response.json()) as { data?: { devices: UserDevice[] } };
  return data.data?.devices || [];
}

/**
 * Checks device trust status from API.
 */
export async function checkDeviceTrustApi(
  deviceId: string,
  explicitToken?: string,
): Promise<DeviceTrustStatus> {
  const headers = await getAuthHeader(explicitToken);
  const response = await fetch(
    `${API_BASE_URL}/api/v1/account/devices/check?deviceId=${encodeURIComponent(deviceId)}`,
    { headers },
  );

  if (!response.ok) {
    return { isTrusted: false, isExpired: false, trustedUntil: null };
  }

  const data = (await response.json()) as { data?: DeviceTrustStatus };
  return data.data || { isTrusted: false, isExpired: false, trustedUntil: null };
}

/**
 * Registers or updates trust preference for this device.
 */
export async function setDeviceTrustApi(
  params: {
    deviceId: string;
    deviceName: string;
    browser?: string;
    os?: string;
    trust: boolean;
    password?: string;
  },
  explicitToken?: string,
): Promise<UserDevice> {
  const headers = await getAuthHeader(explicitToken);
  const response = await fetch(`${API_BASE_URL}/api/v1/account/devices/trust`, {
    method: 'POST',
    headers,
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    const errorData = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new Error(errorData.error?.message || 'Failed to update device trust status.');
  }

  const data = (await response.json()) as { data?: { device: UserDevice } };
  if (!data.data?.device) throw new Error('Invalid response updating device trust.');
  return data.data.device;
}

/**
 * Revokes trust and deletes device record.
 */
export async function revokeUserDeviceApi(targetId: string): Promise<void> {
  const headers = await getAuthHeader();
  const response = await fetch(
    `${API_BASE_URL}/api/v1/account/devices/${encodeURIComponent(targetId)}`,
    {
      method: 'DELETE',
      headers,
    },
  );

  if (!response.ok) {
    const errorData = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new Error(errorData.error?.message || 'Failed to revoke device access.');
  }
}
