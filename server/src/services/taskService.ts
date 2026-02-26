import { db, Collections, firebaseAdmin } from '../config/firebase';
import {
  TASK_COOLDOWN_MS,
  CYCLE_DURATION_MS,
  TASK_TYPES,
  INVITE_CHALLENGE_TARGET,
  REFERRAL_COMMISSION,
  L1_INVITE_BONUS_PKR,
} from '../config/constants';

interface TaskClaimResult {
  success: boolean;
  error?: string;
  reward?: number;
  nextTaskAt?: number;
}

// Task reward amounts (PKR)
const TASK_REWARDS: Record<string, number> = {
  [TASK_TYPES.TASK_1]: 20,
  [TASK_TYPES.TASK_2]: 20,
  [TASK_TYPES.TASK_3]: 50, // Invite challenge
  // TASK_4 (spin) is handled separately
};

/**
 * Claims a task reward. Server-authoritative validation of timers and eligibility.
 */
export async function claimTask(
  uid: string,
  taskType: string
): Promise<TaskClaimResult> {
  // 1. Get user data
  const userRef = db.collection(Collections.USERS).doc(uid);
  const userDoc = await userRef.get();

  if (!userDoc.exists) {
    return { success: false, error: 'User not found' };
  }

  const userData = userDoc.data()!;

  // 2. Check user is active
  if (userData.status !== 'active') {
    return { success: false, error: 'Account is not active' };
  }

  // 3. Check cycle timer (24h cycle)
  const now = Date.now();
  const nextCycleAt = userData.nextCycleAt?.toMillis?.() || 0;

  if (now < nextCycleAt) {
    return {
      success: false,
      error: 'Task cycle not ready yet',
      nextTaskAt: nextCycleAt,
    };
  }

  // 4. Check task cooldown (3 minutes between tasks)
  const nextTaskAt = userData.nextTaskAt?.toMillis?.() || 0;

  if (now < nextTaskAt) {
    return {
      success: false,
      error: 'Task cooldown active',
      nextTaskAt,
    };
  }

  // 5. Check if task already completed in this cycle
  if (userData.taskProgress?.[taskType] === 'completed') {
    return { success: false, error: 'Task already completed in this cycle' };
  }

  // 6. Special check for Task 3 (invite challenge)
  if (taskType === TASK_TYPES.TASK_3) {
    const referralDoc = await db.collection(Collections.REFERRALS).doc(uid).get();
    const verifiedInvites = referralDoc.exists
      ? referralDoc.data()?.verifiedInvitesL1 || 0
      : 0;

    if (verifiedInvites < INVITE_CHALLENGE_TARGET) {
      return {
        success: false,
        error: `Need ${INVITE_CHALLENGE_TARGET} verified invites. Current: ${verifiedInvites}`,
      };
    }
  }

  // 7. Task 4 (spin) is handled by spinService, not here
  if (taskType === TASK_TYPES.TASK_4) {
    return { success: false, error: 'Use spin endpoint for Task 4' };
  }

  // 8. Calculate reward
  const reward = TASK_REWARDS[taskType] || 0;

  // 9. Check if all tasks will be complete after this one
  const updatedProgress = { ...userData.taskProgress, [taskType]: 'completed' };
  const allDone = Object.values(updatedProgress).every(s => s === 'completed');

  const serverNow = firebaseAdmin.firestore.FieldValue.serverTimestamp();
  const batch = db.batch();

  // 10. Update user: balance, timers, task progress
  const userUpdate: Record<string, unknown> = {
    [`taskProgress.${taskType}`]: 'completed',
    lastTaskAt: serverNow,
    nextTaskAt: firebaseAdmin.firestore.Timestamp.fromMillis(now + TASK_COOLDOWN_MS),
    balance: firebaseAdmin.firestore.FieldValue.increment(reward),
    totalEarned: firebaseAdmin.firestore.FieldValue.increment(reward),
    updatedAt: serverNow,
  };

  // If all tasks done, reset cycle for next 24h
  if (allDone) {
    userUpdate.nextCycleAt = firebaseAdmin.firestore.Timestamp.fromMillis(now + CYCLE_DURATION_MS);
    userUpdate.taskProgress = {
      task_1: 'pending',
      task_2: 'pending',
      task_3: 'pending',
      task_4: 'pending',
    };
    userUpdate.lastCycleStartAt = serverNow;
  }

  batch.update(userRef, userUpdate);

  // 11. Create task log
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  batch.set(
    db.collection(Collections.TASKS).doc(uid).collection(today).doc(taskType),
    {
      uid,
      taskType,
      reward,
      claimedAt: serverNow,
      cycleDate: today,
    }
  );

  // 12. Create ledger entry
  batch.set(
    db.collection(Collections.LEDGER).doc(uid).collection('entries').doc(),
    {
      uid,
      type: 'task_reward',
      taskType,
      amount: reward,
      balanceAfter: (userData.balance || 0) + reward,
      createdAt: serverNow,
    }
  );

  await batch.commit();

  // 13. Process referral commissions asynchronously
  processReferralCommissions(uid, reward, taskType).catch(err =>
    console.error('Referral commission error:', err)
  );

  return {
    success: true,
    reward,
    nextTaskAt: now + TASK_COOLDOWN_MS,
  };
}

/**
 * Gets the current task status for a user.
 */
export async function getTaskStatus(uid: string): Promise<{
  cycleReady: boolean;
  cooldownReady: boolean;
  taskProgress: Record<string, string>;
  nextCycleAt: number;
  nextTaskAt: number;
}> {
  const userDoc = await db.collection(Collections.USERS).doc(uid).get();

  if (!userDoc.exists) {
    throw new Error('User not found');
  }

  const userData = userDoc.data()!;
  const now = Date.now();
  const nextCycleAt = userData.nextCycleAt?.toMillis?.() || 0;
  const nextTaskAt = userData.nextTaskAt?.toMillis?.() || 0;

  return {
    cycleReady: now >= nextCycleAt,
    cooldownReady: now >= nextTaskAt,
    taskProgress: userData.taskProgress || {},
    nextCycleAt,
    nextTaskAt,
  };
}

/**
 * Processes referral commissions up to 3 levels when a user earns a reward.
 */
async function processReferralCommissions(
  uid: string,
  rewardAmount: number,
  taskType: string
): Promise<void> {
  const referralDoc = await db.collection(Collections.REFERRALS).doc(uid).get();
  if (!referralDoc.exists) return;

  const referralData = referralDoc.data()!;
  const chain = referralData.referralChain || {};
  const now = firebaseAdmin.firestore.FieldValue.serverTimestamp();

  const commissionRates: Record<string, number> = {
    L1: REFERRAL_COMMISSION.L1,
    L2: REFERRAL_COMMISSION.L2,
    L3: REFERRAL_COMMISSION.L3,
  };

  for (const [level, rate] of Object.entries(commissionRates)) {
    const referrerUid = chain[level];
    if (!referrerUid) continue;

    const commission = Math.floor(rewardAmount * rate);
    if (commission <= 0) continue;

    const batch = db.batch();

    // Credit referrer balance
    batch.update(db.collection(Collections.USERS).doc(referrerUid), {
      balance: firebaseAdmin.firestore.FieldValue.increment(commission),
      totalEarned: firebaseAdmin.firestore.FieldValue.increment(commission),
      updatedAt: now,
    });

    // Create ledger entry for referrer
    batch.set(
      db.collection(Collections.LEDGER).doc(referrerUid).collection('entries').doc(),
      {
        uid: referrerUid,
        type: 'referral_commission',
        level,
        fromUid: uid,
        taskType,
        amount: commission,
        rate,
        createdAt: now,
      }
    );

    await batch.commit();
  }
}
