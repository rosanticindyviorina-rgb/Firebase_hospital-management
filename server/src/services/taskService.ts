import { db, Collections, firebaseAdmin } from '../config/firebase';
import {
  TASK_COOLDOWN_MS,
  CYCLE_DURATION_MS,
  TASK_TYPES,
  TASK_REWARDS,
  INVITE_TASKS,
  REFERRAL_COMMISSION,
  getDefaultTaskProgress,
} from '../config/constants';

interface TaskClaimResult {
  success: boolean;
  error?: string;
  reward?: number;
  nextTaskAt?: number;
}

/**
 * Claims a task reward (coins). Server-authoritative validation.
 */
export async function claimTask(
  uid: string,
  taskType: string
): Promise<TaskClaimResult> {
  const userRef = db.collection(Collections.USERS).doc(uid);
  const userDoc = await userRef.get();

  if (!userDoc.exists) {
    return { success: false, error: 'User not found' };
  }

  const userData = userDoc.data()!;

  if (userData.status !== 'active') {
    return { success: false, error: 'Account is not active' };
  }

  // Check cycle timer (24h cycle)
  const now = Date.now();
  const nextCycleAt = userData.nextCycleAt?.toMillis?.() || 0;
  if (now < nextCycleAt) {
    return { success: false, error: 'Task cycle not ready yet', nextTaskAt: nextCycleAt };
  }

  // Check task cooldown (3 minutes between tasks)
  const nextTaskAt = userData.nextTaskAt?.toMillis?.() || 0;
  if (now < nextTaskAt) {
    return { success: false, error: 'Task cooldown active', nextTaskAt };
  }

  // Check if task already completed in this cycle
  if (userData.taskProgress?.[taskType] === 'completed') {
    return { success: false, error: 'Task already completed in this cycle' };
  }

  // Task 4 (spin) and Task 8 (scratch) are handled by separate endpoints
  if (taskType === TASK_TYPES.TASK_4) {
    return { success: false, error: 'Use spin endpoint for Task 4' };
  }
  if (taskType === TASK_TYPES.TASK_8) {
    return { success: false, error: 'Use scratch endpoint for Task 8' };
  }

  // Check invite-based tasks
  if (INVITE_TASKS[taskType] !== undefined) {
    const referralDoc = await db.collection(Collections.REFERRALS).doc(uid).get();
    const verifiedInvites = referralDoc.exists
      ? referralDoc.data()?.verifiedInvitesL1 || 0
      : 0;

    const required = INVITE_TASKS[taskType];
    if (verifiedInvites < required) {
      return {
        success: false,
        error: `Need ${required} verified invites. Current: ${verifiedInvites}`,
      };
    }
  }

  // Calculate reward (coins)
  const reward = TASK_REWARDS[taskType] || 0;

  // Check if all tasks will be complete after this one
  const updatedProgress = { ...userData.taskProgress, [taskType]: 'completed' };
  const allDone = Object.values(updatedProgress).every(s => s === 'completed');

  const serverNow = firebaseAdmin.firestore.FieldValue.serverTimestamp();
  const batch = db.batch();

  // Update user: coins balance, timers, task progress
  const userUpdate: Record<string, unknown> = {
    [`taskProgress.${taskType}`]: 'completed',
    lastTaskAt: serverNow,
    nextTaskAt: firebaseAdmin.firestore.Timestamp.fromMillis(now + TASK_COOLDOWN_MS),
    coinBalance: firebaseAdmin.firestore.FieldValue.increment(reward),
    totalCoinsEarned: firebaseAdmin.firestore.FieldValue.increment(reward),
    updatedAt: serverNow,
  };

  // If all tasks done, set next cycle (same time next day)
  if (allDone) {
    const cycleStartAt = userData.lastCycleStartAt?.toMillis?.() || now;
    const nextCycle = cycleStartAt + CYCLE_DURATION_MS;
    userUpdate.nextCycleAt = firebaseAdmin.firestore.Timestamp.fromMillis(nextCycle);
    userUpdate.taskProgress = getDefaultTaskProgress();
    userUpdate.lastCycleStartAt = serverNow;
    userUpdate.adWatchCount = 0; // Reset daily ad count
  }

  batch.update(userRef, userUpdate);

  // Create task log
  const today = new Date().toISOString().split('T')[0];
  batch.set(
    db.collection(Collections.TASKS).doc(uid).collection(today).doc(taskType),
    { uid, taskType, reward, currency: 'coins', claimedAt: serverNow, cycleDate: today }
  );

  // Create ledger entry
  batch.set(
    db.collection(Collections.LEDGER).doc(uid).collection('entries').doc(),
    {
      uid,
      type: 'task_reward',
      taskType,
      amount: reward,
      currency: 'coins',
      balanceAfter: (userData.coinBalance || 0) + reward,
      createdAt: serverNow,
    }
  );

  await batch.commit();

  // Process referral commissions asynchronously (on coins)
  processReferralCommissions(uid, reward, taskType).catch(err =>
    console.error('Referral commission error:', err)
  );

  return { success: true, reward, nextTaskAt: now + TASK_COOLDOWN_MS };
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
  adWatchCount: number;
  coinBalance: number;
  totalCoinsEarned: number;
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
    taskProgress: userData.taskProgress || getDefaultTaskProgress(),
    nextCycleAt,
    nextTaskAt,
    adWatchCount: userData.adWatchCount || 0,
    coinBalance: userData.coinBalance || 0,
    totalCoinsEarned: userData.totalCoinsEarned || 0,
  };
}

/**
 * Processes referral commissions up to 3 levels when a user earns coins.
 */
async function processReferralCommissions(
  uid: string,
  rewardCoins: number,
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

    const commission = Math.floor(rewardCoins * rate);
    if (commission <= 0) continue;

    const batch = db.batch();

    batch.update(db.collection(Collections.USERS).doc(referrerUid), {
      coinBalance: firebaseAdmin.firestore.FieldValue.increment(commission),
      totalCoinsEarned: firebaseAdmin.firestore.FieldValue.increment(commission),
      updatedAt: now,
    });

    batch.set(
      db.collection(Collections.LEDGER).doc(referrerUid).collection('entries').doc(),
      {
        uid: referrerUid,
        type: 'referral_commission',
        level,
        fromUid: uid,
        taskType,
        amount: commission,
        currency: 'coins',
        rate,
        createdAt: now,
      }
    );

    await batch.commit();
  }
}
