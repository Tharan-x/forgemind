/* eslint-disable no-console */
// =============================================================================
// ForgeMind API — Device Management & Security Isolation Test Suite
// =============================================================================

import {
  getUserDevices,
  checkDeviceTrustStatus,
  upsertDeviceTrust,
  revokeUserDevice,
} from './device-management.service.js';

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`[Assertion Failed] ${message}`);
  }
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  assert(actual === expected, `${message} — Expected: ${String(expected)}, Got: ${String(actual)}`);
}

export async function runDeviceManagementTests(): Promise<void> {
  console.log('🧪 Running Device Management & Tenant Isolation Tests...\n');

  // Test 1: Upsert device trust creates 30-day trusted record when trust=true
  {
    const userId = '00000000-0000-0000-0000-000000000001';
    const deviceId = 'test-device-uuid-1';

    const device = await upsertDeviceTrust(userId, {
      deviceId,
      deviceName: 'Chrome on macOS',
      browser: 'Chrome',
      os: 'macOS',
      trust: true,
    });

    assertEqual(device.userId, userId, 'Test 1: userId matches');
    assertEqual(device.deviceId, deviceId, 'Test 1: deviceId matches');
    assertEqual(device.isTrusted, true, 'Test 1: isTrusted is true');
    assert(Boolean(device.trustedUntil), 'Test 1: trustedUntil is populated');

    const status = await checkDeviceTrustStatus(userId, deviceId);
    assertEqual(status.isTrusted, true, 'Test 1: check returns isTrusted=true');
    assertEqual(status.isExpired, false, 'Test 1: check returns isExpired=false');
    assertEqual(status.isRegistered, true, 'Test 1: check returns isRegistered=true');

    console.log('  ✅ Test 1: Upserting trusted device creates 30-day valid trust record');
  }

  // Test 2: Upsert device trust creates untrusted record when trust=false
  {
    const userId = '00000000-0000-0000-0000-000000000001';
    const deviceId = 'test-device-uuid-untrusted';

    const device = await upsertDeviceTrust(userId, {
      deviceId,
      deviceName: 'Safari on iOS (Public)',
      browser: 'Safari',
      os: 'iOS',
      trust: false,
    });

    assertEqual(device.isTrusted, false, 'Test 2: isTrusted is false');
    assertEqual(device.trustedUntil, null, 'Test 2: trustedUntil is null');

    const status = await checkDeviceTrustStatus(userId, deviceId);
    assertEqual(status.isTrusted, false, 'Test 2: status isTrusted is false');
    assertEqual(status.isRegistered, true, 'Test 2: status isRegistered is true');
    assertEqual(status.isRevoked, true, 'Test 2: status isRevoked is true');

    console.log(
      '  ✅ Test 2: Upserting untrusted device creates untrusted record with null expiration',
    );
  }

  // Test 3: Tenant Isolation — User A cannot access or revoke User B's device
  {
    const userA = '00000000-0000-0000-0000-000000000001';
    const userB = '00000000-0000-0000-0000-000000000002';

    const deviceB = await upsertDeviceTrust(userB, {
      deviceId: 'device-belonging-to-user-b',
      deviceName: 'Firefox on Linux',
      trust: true,
    });

    // User A attempts to check or revoke User B's device using User A's ID
    const statusForUserA = await checkDeviceTrustStatus(userA, 'device-belonging-to-user-b');
    assertEqual(
      statusForUserA.isTrusted,
      false,
      'Test 3: User A checking User B device returns isTrusted=false',
    );
    assertEqual(
      statusForUserA.isRegistered,
      false,
      'Test 3: User A checking User B device returns isRegistered=false',
    );

    let errorThrown = false;
    try {
      await revokeUserDevice(userA, deviceB.id);
    } catch {
      errorThrown = true;
    }

    assertEqual(errorThrown, true, 'Test 3: User A cannot revoke User B device');

    // Verify User B's device still exists
    const userBDevices = await getUserDevices(userB);
    assert(
      userBDevices.some((d) => d.id === deviceB.id),
      'Test 3: User B device preserved',
    );

    // Clean up User B device
    await revokeUserDevice(userB, deviceB.id);

    console.log(
      '  ✅ Test 3: Tenant isolation prevents User A from accessing/revoking User B device',
    );
  }

  // Test 4: Revoking device trust deletes record cleanly for owner
  {
    const userId = '00000000-0000-0000-0000-000000000001';
    const deviceId = 'test-device-uuid-to-revoke';

    const device = await upsertDeviceTrust(userId, {
      deviceId,
      deviceName: 'Edge on Windows',
      trust: true,
    });

    await revokeUserDevice(userId, device.id);

    const status = await checkDeviceTrustStatus(userId, deviceId);
    assertEqual(status.isTrusted, false, 'Test 4: revoked device is no longer trusted');
    assertEqual(status.isRegistered, false, 'Test 4: revoked device is no longer registered');
    assertEqual(status.isRevoked, true, 'Test 4: revoked device reports isRevoked=true');

    console.log(
      '  ✅ Test 4: Revoking device trust removes access for owner and sets isRevoked=true',
    );
  }

  // Test 5: Empty/Missing deviceId returns isTrusted=false
  {
    const userId = '00000000-0000-0000-0000-000000000001';
    const status = await checkDeviceTrustStatus(userId, '');
    assertEqual(status.isTrusted, false, 'Test 5: empty deviceId returns isTrusted=false');
    assertEqual(status.isRegistered, false, 'Test 5: empty deviceId returns isRegistered=false');

    console.log('  ✅ Test 5: Empty or missing deviceId cleanly returns isTrusted=false');
  }

  console.log('\n🎉 ALL DEVICE MANAGEMENT API & TENANT ISOLATION TESTS PASSED!\n');
}

if (process.argv[1]?.endsWith('device-management.test.ts')) {
  runDeviceManagementTests().catch((err) => {
    console.error('❌ Test failed:', err);
    process.exit(1);
  });
}
