import { db, Collections, firebaseAdmin } from '../config/firebase';
import { USER_STATUS, CYCLE_DURATION_MS, BAN_REASONS } from '../config/constants';
import { v4 as uuidv4 } from 'uuid';

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
 * Enforces one-account-per-device.
 */
export async function createUser(payload: CreateUserPayload): Promise<{
  success: boolean;
  error?: string;
}> {
  const { uid, phone, referralCode, deviceFingerprint, clientIp } = payload;

  // 1. Check if user already exists
  const existingUser = await db.collection(Collections.USERS).doc(uid).get();
  if (existingUser.exists) {
    return { success: false, error: 'User already exists' };
  }

  // 2. Validate referral code
  const referralResult = await validateReferralCode(referralCode);
  if (!referralResult.valid) {
    return { success: false, error: 'Invalid or inactive referral code' };
  }

  const inviterUid = referralResult.inviterUid!;

  // 3. Generate a unique referral code for the new user
  const userReferralCode = generateReferralCode();

  // 4. Build the referral chain (up to 6 levels)
  const referralChain = await buildReferralChain(inviterUid);

  const now = firebaseAdmin.firestore.FieldValue.serverTimestamp();
  const batch = db.batch();

  // 5. Create user document
  batch.set(db.collection(Collections.USERS).doc(uid), {
    uid,
    phone,
    status: USER_STATUS.ACTIVE,
    referralCode: userReferralCode,
    invitedBy: inviterUid,
    usedReferralCode: referralCode,
    balance: 0,
    totalEarned: 0,
    monthlyVerifiedInvitesL1: 0,
    salaryTier: 0,
    lastCycleStartAt: now,
    nextCycleAt: now, // First cycle starts immediately
    lastTaskAt: null,
    nextTaskAt: null,
    taskProgress: {
      task_1: 'pending',
      task_2: 'pending',
      task_3: 'pending',
      task_4: 'pending',
    },
    createdAt: now,
    updatedAt: now,
  });

  // 6. Create referral record
  batch.set(db.collection(Collections.REFERRALS).doc(uid), {
    uid,
    inviterUid,
    referralChain, // { L1: uid, L2: uid, L3: uid, ... }
    childrenL1: [],
    verifiedInvitesL1: 0,
    createdAt: now,
  });

  // 7. Create the new user's referral code
  batch.set(db.collection(Collections.REFERRAL_CODES).doc(userReferralCode), {
    code: userReferralCode,
    ownerUid: uid,
    active: true,
    usedCount: 0,
    createdAt: now,
  });

  // 8. Update inviter's referral children
  batch.update(db.collection(Collections.REFERRALS).doc(inviterUid), {
    childrenL1: firebaseAdmin.firestore.FieldValue.arrayUnion(uid),
    updatedAt: now,
  });

  // 9. Increment used referral code count
  batch.update(db.collection(Collections.REFERRAL_CODES).doc(referralCode), {
    usedCount: firebaseAdmin.firestore.FieldValue.increment(1),
  });

  await batch.commit();

  return { success: true };
}

/**
 * Gets user profile data.
 */
export async function getUserProfile(uid: string): Promise<FirebaseFirestore.DocumentData | null> {
  const doc = await db.collection(Collections.USERS).doc(uid).get();
  return doc.exists ? doc.data()! : null;
}

/**
 * Checks if user is banned.
 */
export async function isUserBanned(uid: string): Promise<boolean> {
  const doc = await db.collection(Collections.USERS).doc(uid).get();
  return doc.exists ? doc.data()?.status === USER_STATUS.BANNED : false;
}

/**
 * Generates a unique referral code (8 chars alphanumeric).
 */
function generateReferralCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // No ambiguous chars (0/O, 1/I/L)
  let code = 'KC'; // Kamyabi Cash prefix
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

/**
 * Builds referral chain by walking up from inviterUid.
 * Returns { L1: inviterUid, L2: inviter's inviter, ... } up to 6 levels.
 */
async function buildReferralChain(
  inviterUid: string
): Promise<Record<string, string>> {
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

/**
 * Admin: search users by phone, uid, or referral code.
 */
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
