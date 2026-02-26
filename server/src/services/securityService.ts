import { db, Collections, firebaseAdmin } from '../config/firebase';
import { BAN_REASONS, USER_STATUS } from '../config/constants';

interface DeviceFingerprint {
  androidId?: string;
  buildFingerprint?: string;
  buildModel?: string;
  buildManufacturer?: string;
  screenResolution?: string;
  installerPackage?: string;
  appSignature?: string;
}

interface AttestationPayload {
  integrityToken: string;
  deviceFingerprint: DeviceFingerprint;
  appVersion: number;
  detectedIssues: string[]; // client-reported detections
}

interface SecurityVerdict {
  allowed: boolean;
  banned: boolean;
  reason?: string;
}

/**
 * Verifies Play Integrity token with Google's API.
 * Returns decoded integrity verdict.
 */
async function verifyPlayIntegrityToken(token: string): Promise<{
  deviceIntegrity: boolean;
  appIntegrity: boolean;
  accountDetails: string;
}> {
  // TODO: Implement actual Play Integrity API call
  // For now, return a placeholder that requires real integration
  // In production: call Google Play Integrity API with the token
  //
  // const { google } = require('googleapis');
  // const playintegrity = google.playintegrity('v1');
  // const response = await playintegrity.v1.decodeIntegrityToken({
  //   packageName: process.env.PLAY_INTEGRITY_PACKAGE_NAME,
  //   requestBody: { integrityToken: token }
  // });

  if (!token || token === '' || token === 'invalid') {
    return { deviceIntegrity: false, appIntegrity: false, accountDetails: 'UNEVALUATED' };
  }

  // Placeholder: In production, decode the actual token
  return {
    deviceIntegrity: true,
    appIntegrity: true,
    accountDetails: 'LICENSED',
  };
}

/**
 * Checks IP against known VPN/proxy/datacenter ASN lists.
 */
async function checkIpIntelligence(ip: string): Promise<{
  isVpn: boolean;
  isProxy: boolean;
  isDatacenter: boolean;
  country?: string;
}> {
  // TODO: Integrate with IP intelligence provider (e.g., ip-api.com, ipinfo.io, proxycheck.io)
  // For now, basic localhost/private detection
  const privateIps = ['127.0.0.1', '::1', '10.', '172.16.', '192.168.'];
  const isPrivate = privateIps.some(prefix => ip.startsWith(prefix));

  return {
    isVpn: false,
    isProxy: false,
    isDatacenter: false,
    country: isPrivate ? 'LOCAL' : undefined,
  };
}

/**
 * Generates a device key from fingerprint for device binding.
 */
function generateDeviceKey(fingerprint: DeviceFingerprint): string {
  const parts = [
    fingerprint.androidId || '',
    fingerprint.buildFingerprint || '',
    fingerprint.buildModel || '',
    fingerprint.buildManufacturer || '',
    fingerprint.screenResolution || '',
  ];
  // Simple hash — in production use a proper hash function
  let hash = 0;
  const str = parts.join('|');
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return `dev_${Math.abs(hash).toString(36)}`;
}

/**
 * Full attestation check: verifies device integrity, IP, and device binding.
 * Called during app startup and periodically.
 */
export async function attestDevice(
  uid: string,
  payload: AttestationPayload,
  clientIp: string
): Promise<SecurityVerdict> {
  const { integrityToken, deviceFingerprint, appVersion, detectedIssues } = payload;

  // 1. Check if user is already banned
  const userDoc = await db.collection(Collections.USERS).doc(uid).get();
  if (userDoc.exists && userDoc.data()?.status === USER_STATUS.BANNED) {
    return { allowed: false, banned: true, reason: 'Account is banned' };
  }

  // 2. Check client-reported detections (zero tolerance)
  if (detectedIssues && detectedIssues.length > 0) {
    const reason = detectedIssues[0]; // First detected issue
    await banUser(uid, reason, { detectedIssues, clientIp, deviceFingerprint });
    return { allowed: false, banned: true, reason };
  }

  // 3. Verify Play Integrity token
  const integrityVerdict = await verifyPlayIntegrityToken(integrityToken);

  if (!integrityVerdict.deviceIntegrity) {
    await banUser(uid, BAN_REASONS.INTEGRITY_FAILED, {
      integrityVerdict,
      clientIp,
      deviceFingerprint,
    });
    return { allowed: false, banned: true, reason: BAN_REASONS.INTEGRITY_FAILED };
  }

  if (!integrityVerdict.appIntegrity) {
    await banUser(uid, BAN_REASONS.CLONE_DETECTED, {
      integrityVerdict,
      clientIp,
      deviceFingerprint,
    });
    return { allowed: false, banned: true, reason: BAN_REASONS.CLONE_DETECTED };
  }

  // 4. Check IP intelligence
  const ipCheck = await checkIpIntelligence(clientIp);

  if (ipCheck.isVpn || ipCheck.isProxy) {
    await banUser(uid, BAN_REASONS.VPN_DETECTED, {
      ipCheck,
      clientIp,
      deviceFingerprint,
    });
    return { allowed: false, banned: true, reason: BAN_REASONS.VPN_DETECTED };
  }

  // 5. Device binding check (one-account-per-device)
  const deviceKey = generateDeviceKey(deviceFingerprint);
  const deviceDoc = await db.collection(Collections.DEVICES).doc(deviceKey).get();

  if (deviceDoc.exists) {
    const deviceData = deviceDoc.data()!;
    if (deviceData.boundUid && deviceData.boundUid !== uid) {
      // Device is already bound to a different user
      await banUser(uid, BAN_REASONS.MULTI_ACCOUNT, {
        deviceKey,
        existingUid: deviceData.boundUid,
        clientIp,
        deviceFingerprint,
      });
      return { allowed: false, banned: true, reason: BAN_REASONS.MULTI_ACCOUNT };
    }
  }

  // 6. Update device record
  await db.collection(Collections.DEVICES).doc(deviceKey).set(
    {
      boundUid: uid,
      lastSeen: firebaseAdmin.firestore.FieldValue.serverTimestamp(),
      lastIp: clientIp,
      fingerprint: deviceFingerprint,
      appVersion,
      riskScore: 0,
    },
    { merge: true }
  );

  return { allowed: true, banned: false };
}

/**
 * Processes a security report from the client.
 * Client detected a violation → server verifies and may ban instantly.
 */
export async function processSecurityReport(
  uid: string,
  violations: string[],
  evidence: Record<string, unknown>,
  clientIp: string
): Promise<{ banned: boolean; reason?: string }> {
  if (!violations || violations.length === 0) {
    return { banned: false };
  }

  // Map client violations to ban reasons
  const violationMap: Record<string, string> = {
    root: BAN_REASONS.ROOT_DETECTED,
    emulator: BAN_REASONS.EMULATOR_DETECTED,
    vpn: BAN_REASONS.VPN_DETECTED,
    clone: BAN_REASONS.CLONE_DETECTED,
    parallel_space: BAN_REASONS.PARALLEL_SPACE,
    hooking: BAN_REASONS.HOOKING_DETECTED,
  };

  for (const violation of violations) {
    const reason = violationMap[violation] || BAN_REASONS.SUSPICIOUS_BEHAVIOR;
    await banUser(uid, reason, { ...evidence, clientIp, reportedViolation: violation });
    return { banned: true, reason };
  }

  return { banned: false };
}

/**
 * Bans a user: updates user status, creates ban record, disables auth account.
 */
export async function banUser(
  uid: string,
  reason: string,
  evidence: Record<string, unknown>
): Promise<void> {
  const batch = db.batch();
  const now = firebaseAdmin.firestore.FieldValue.serverTimestamp();

  // Update user status to banned
  batch.set(
    db.collection(Collections.USERS).doc(uid),
    { status: USER_STATUS.BANNED, bannedAt: now, banReason: reason },
    { merge: true }
  );

  // Create ban record
  batch.set(db.collection(Collections.BANS).doc(uid), {
    uid,
    reason,
    evidence,
    bannedAt: now,
    bannedBy: 'system',
  });

  await batch.commit();

  // Disable Firebase Auth account
  try {
    await firebaseAdmin.auth().updateUser(uid, { disabled: true });
  } catch (error) {
    console.error(`Failed to disable auth for ${uid}:`, error);
  }
}

/**
 * Unbans a user (admin action, only if policy allows).
 */
export async function unbanUser(
  uid: string,
  adminUid: string
): Promise<void> {
  const batch = db.batch();
  const now = firebaseAdmin.firestore.FieldValue.serverTimestamp();

  batch.update(db.collection(Collections.USERS).doc(uid), {
    status: USER_STATUS.ACTIVE,
    unbannedAt: now,
    unbannedBy: adminUid,
  });

  batch.update(db.collection(Collections.BANS).doc(uid), {
    unbannedAt: now,
    unbannedBy: adminUid,
  });

  // Log admin action
  batch.create(db.collection(Collections.ADMIN_ACTIONS).doc(), {
    action: 'unban_user',
    targetUid: uid,
    adminUid,
    timestamp: now,
  });

  await batch.commit();

  // Re-enable Firebase Auth account
  try {
    await firebaseAdmin.auth().updateUser(uid, { disabled: false });
  } catch (error) {
    console.error(`Failed to re-enable auth for ${uid}:`, error);
  }
}
