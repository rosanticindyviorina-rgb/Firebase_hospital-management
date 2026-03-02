import { db, Collections, firebaseAdmin } from '../config/firebase';

interface CreateRedeemCodePayload {
  adminUid: string;
  totalCoins: number;
  maxClaims: number;
  expiresAt?: Date;
}

/**
 * Admin: Creates a redeem code with a coin pool distributed randomly among claimers.
 */
export async function createRedeemCode(payload: CreateRedeemCodePayload): Promise<{
  code: string;
  totalCoins: number;
  maxClaims: number;
}> {
  const { adminUid, totalCoins, maxClaims, expiresAt } = payload;

  if (totalCoins <= 0) throw new Error('totalCoins must be positive');
  if (maxClaims <= 0) throw new Error('maxClaims must be positive');

  const code = generateRedeemCode();
  const now = firebaseAdmin.firestore.FieldValue.serverTimestamp();

  await db.collection(Collections.REDEEM_CODES).doc(code).set({
    code,
    totalCoins,
    remainingCoins: totalCoins,
    maxClaims,
    claimCount: 0,
    active: true,
    createdBy: adminUid,
    expiresAt: expiresAt ? firebaseAdmin.firestore.Timestamp.fromDate(expiresAt) : null,
    createdAt: now,
  });

  // Log admin action
  await db.collection(Collections.ADMIN_ACTIONS).doc().set({
    action: 'create_redeem_code',
    adminUid,
    details: { code, totalCoins, maxClaims },
    timestamp: now,
  });

  return { code, totalCoins, maxClaims };
}

/**
 * User claims a redeem code. Gets a random share of the remaining coin pool.
 */
export async function claimRedeemCode(uid: string, code: string): Promise<{
  success: boolean;
  error?: string;
  coinsAwarded?: number;
}> {
  const codeRef = db.collection(Collections.REDEEM_CODES).doc(code.toUpperCase());
  const codeDoc = await codeRef.get();

  if (!codeDoc.exists) {
    return { success: false, error: 'Invalid redeem code' };
  }

  const codeData = codeDoc.data()!;

  if (!codeData.active) {
    return { success: false, error: 'This code has expired or been deactivated' };
  }

  if (codeData.claimCount >= codeData.maxClaims) {
    return { success: false, error: 'This code has reached its claim limit' };
  }

  if (codeData.remainingCoins <= 0) {
    return { success: false, error: 'No coins remaining in this code' };
  }

  // Check expiration
  if (codeData.expiresAt) {
    const expiresMs = codeData.expiresAt.toMillis?.() || 0;
    if (Date.now() > expiresMs) {
      return { success: false, error: 'This code has expired' };
    }
  }

  // Check if user already claimed this code
  const existingClaim = await db.collection(Collections.REDEEM_CLAIMS)
    .where('uid', '==', uid)
    .where('code', '==', code.toUpperCase())
    .limit(1)
    .get();

  if (!existingClaim.empty) {
    return { success: false, error: 'You have already claimed this code' };
  }

  // Calculate random coin amount from remaining pool
  const remainingClaims = codeData.maxClaims - codeData.claimCount;
  const remainingCoins = codeData.remainingCoins;
  const avgPerClaim = Math.floor(remainingCoins / remainingClaims);

  // Random amount: 50% to 150% of average (min 1, max remaining)
  const minAward = Math.max(1, Math.floor(avgPerClaim * 0.5));
  const maxAward = remainingClaims === 1
    ? remainingCoins // Last claimer gets all remaining
    : Math.min(Math.floor(avgPerClaim * 1.5), remainingCoins - (remainingClaims - 1));

  const coinsAwarded = remainingClaims === 1
    ? remainingCoins
    : Math.floor(Math.random() * (maxAward - minAward + 1)) + minAward;

  const now = firebaseAdmin.firestore.FieldValue.serverTimestamp();
  const batch = db.batch();

  // Update redeem code
  batch.update(codeRef, {
    remainingCoins: firebaseAdmin.firestore.FieldValue.increment(-coinsAwarded),
    claimCount: firebaseAdmin.firestore.FieldValue.increment(1),
  });

  // Deactivate if fully claimed
  if (codeData.claimCount + 1 >= codeData.maxClaims || remainingCoins - coinsAwarded <= 0) {
    batch.update(codeRef, { active: false });
  }

  // Record claim
  batch.set(db.collection(Collections.REDEEM_CLAIMS).doc(), {
    uid,
    code: code.toUpperCase(),
    coinsAwarded,
    claimedAt: now,
  });

  // Credit user
  batch.update(db.collection(Collections.USERS).doc(uid), {
    coinBalance: firebaseAdmin.firestore.FieldValue.increment(coinsAwarded),
    totalCoinsEarned: firebaseAdmin.firestore.FieldValue.increment(coinsAwarded),
    updatedAt: now,
  });

  // Ledger entry
  batch.set(
    db.collection(Collections.LEDGER).doc(uid).collection('entries').doc(),
    {
      uid,
      type: 'redeem_code',
      amount: coinsAwarded,
      currency: 'coins',
      code: code.toUpperCase(),
      createdAt: now,
    }
  );

  await batch.commit();

  return { success: true, coinsAwarded };
}

/**
 * Admin: Get all redeem codes with stats.
 */
export async function getRedeemCodes(limit = 50): Promise<FirebaseFirestore.DocumentData[]> {
  const snapshot = await db.collection(Collections.REDEEM_CODES)
    .orderBy('createdAt', 'desc')
    .limit(limit)
    .get();

  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

/**
 * Admin: Deactivate a redeem code.
 */
export async function deactivateRedeemCode(code: string, adminUid: string): Promise<void> {
  await db.collection(Collections.REDEEM_CODES).doc(code).update({
    active: false,
    deactivatedBy: adminUid,
    deactivatedAt: firebaseAdmin.firestore.FieldValue.serverTimestamp(),
  });
}

function generateRedeemCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'RC'; // Redeem Code prefix
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}
