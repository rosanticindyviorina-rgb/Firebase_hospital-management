import { db, Collections, firebaseAdmin } from '../config/firebase';
import { USER_STATUS, L1_INVITE_BONUS_COINS, getDefaultTaskProgress } from '../config/constants';
import * as crypto from 'crypto';

interface CreateUserPayload {
  uid: string;
  phone: string;
  referralCode: string;
  deviceFingerprint: Record<string, unknown>;
  clientIp: string;
}

/**
 * Validates a referral code exists and is active.
 */
export async function validateReferralCode(code: string): Promise<{
  valid: boolean;
  inviterUid?: string;
}> {
  const codeDoc = await db.collection(Collections.REFERRAL_CODES).doc(code).get();

  if (!codeDoc.exists) {
    return { valid: false };
  }

  const codeData = codeDoc.data()!;
  if (!codeData.active) {
    return { valid: false };
  }

  return { valid: true, inviterUid: codeData.ownerUid };
}

/**
 * Creates a new user profile after successful phone auth + referral validation.
 * Uses coins system. Enforces one-account-per-device.
 */
export async function createUser(payload: CreateUserPayload): Promise<{
  success: boolean;
  error?: string;
}> {
  const { uid, phone, referralCode, deviceFingerprint, clientIp } = payload;

  const existingUser = await db.collection(Collections.USERS).doc(uid).get();
  if (existingUser.exists) {
    return { success: false, error: 'User already exists' };
  }

  const bannedPhoneSnapshot = await db.collection(Collections.BANS)
    .where('phone', '==', phone)
    .limit(1)
    .get();
  if (!bannedPhoneSnapshot.empty) {
    return { success: false, error: 'This phone number is banned' };
  }

  const deviceKey = generateDeviceKey(deviceFingerprint);
  const deviceDoc = await db.collection(Collections.DEVICES).doc(deviceKey).get();
  if (deviceDoc.exists) {
    const deviceData = deviceDoc.data()!;
    if (deviceData.boundUid && deviceData.boundUid !== uid) {
      return { success: false, error: 'This device is already linked to another account' };
    }
  }

  const referralResult = await validateReferralCode(referralCode);
  if (!referralResult.valid) {
    return { success: false, error: 'Invalid or inactive referral code' };
  }

  const inviterUid = referralResult.inviterUid!;
  const userReferralCode = generateReferralCode();
  const referralChain = await buildReferralChain(inviterUid);

  const now = firebaseAdmin.firestore.FieldValue.serverTimestamp();
  const batch = db.batch();

  // Create user document (coins system)
  batch.set(db.collection(Collections.USERS).doc(uid), {
    uid,
    phone,
    status: USER_STATUS.ACTIVE,
    referralCode: userReferralCode,
    invitedBy: inviterUid,
    usedReferralCode: referralCode,
    coinBalance: 0,
    totalCoinsEarned: 0,
    balance: 0,
    totalEarned: 0,
    monthlyVerifiedInvitesL1: 0,
    salaryTier: 0,
    adWatchCount: 0,
    lastCycleStartAt: now,
    nextCycleAt: now,
    lastTaskAt: null,
    nextTaskAt: null,
    taskProgress: getDefaultTaskProgress(),
    createdAt: now,
    updatedAt: now,
  });

  batch.set(db.collection(Collections.REFERRALS).doc(uid), {
    uid,
    inviterUid,
    referralChain,
    childrenL1: [],
    verifiedInvitesL1: 0,
    createdAt: now,
  });

  batch.set(db.collection(Collections.REFERRAL_CODES).doc(userReferralCode), {
    code: userReferralCode,
    ownerUid: uid,
    active: true,
    usedCount: 0,
    createdAt: now,
  });

  batch.update(db.collection(Collections.REFERRALS).doc(inviterUid), {
    childrenL1: firebaseAdmin.firestore.FieldValue.arrayUnion(uid),
    verifiedInvitesL1: firebaseAdmin.firestore.FieldValue.increment(1),
    updatedAt: now,
  });

  batch.update(db.collection(Collections.REFERRAL_CODES).doc(referralCode), {
    usedCount: firebaseAdmin.firestore.FieldValue.increment(1),
  });

  batch.set(db.collection(Collections.DEVICES).doc(deviceKey), {
    boundUid: uid,
    phone,
    lastSeen: now,
    lastIp: clientIp,
    fingerprint: deviceFingerprint,
    createdAt: now,
  }, { merge: true });

  // Mark invite bonus as pending — 150 coins awarded to inviter only
  // after this new user completes at least one full task session.
  // The bonus is credited in taskService.ts on first task completion.
  batch.update(db.collection(Collections.USERS).doc(uid), {
    inviteBonusPending: true,
    inviteBonusInviterUid: inviterUid,
  });

  await batch.commit();
  return { success: true };
}

export async function getUserProfile(uid: string): Promise<FirebaseFirestore.DocumentData | null> {
  const doc = await db.collection(Collections.USERS).doc(uid).get();
  return doc.exists ? doc.data()! : null;
}

export async function isUserBanned(uid: string): Promise<boolean> {
  const doc = await db.collection(Collections.USERS).doc(uid).get();
  return doc.exists ? doc.data()?.status === USER_STATUS.BANNED : false;
}

function generateDeviceKey(fingerprint: Record<string, unknown>): string {
  const parts = [
    fingerprint.androidId || '',
    fingerprint.buildFingerprint || '',
    fingerprint.buildModel || '',
    fingerprint.buildManufacturer || '',
    fingerprint.screenResolution || '',
  ];
  const hash = crypto.createHash('sha256').update(parts.join('|')).digest('hex');
  return `dev_${hash.substring(0, 16)}`;
}

function generateReferralCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'KC';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

async function buildReferralChain(inviterUid: string): Promise<Record<string, string>> {
  const chain: Record<string, string> = { L1: inviterUid };
  let currentUid = inviterUid;

  for (let level = 2; level <= 6; level++) {
    const refDoc = await db.collection(Collections.REFERRALS).doc(currentUid).get();
    if (!refDoc.exists) break;

    const refData = refDoc.data()!;
    if (!refData.inviterUid) break;

    chain[`L${level}`] = refData.inviterUid;
    currentUid = refData.inviterUid;
  }

  return chain;
}

export async function searchUsers(query: string, field: 'phone' | 'uid' | 'referralCode'): Promise<FirebaseFirestore.DocumentData[]> {
  if (field === 'uid') {
    const doc = await db.collection(Collections.USERS).doc(query).get();
    return doc.exists ? [{ id: doc.id, ...doc.data() }] : [];
  }

  const snapshot = await db
    .collection(Collections.USERS)
    .where(field, '==', query)
    .limit(20)
    .get();

  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}
