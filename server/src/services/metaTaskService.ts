import { db, Collections, firebaseAdmin } from '../config/firebase';
import {
  META_TASK_REWARDS,
  META_TASKS,
  META_CYCLE_GAP_MS,
  NETWORK_COOLDOWN_MS,
  NETWORK_COOLDOWN_FIELDS,
  getDefaultMetaProgress,
} from '../config/constants';

interface MetaClaimResult {
  success: boolean;
  error?: string;
  reward?: number;
  isHalfReward?: boolean;
  nextMetaCycleAt?: number;
  metaProgress?: Record<string, string>;
}

/**
 * Claims a Meta (Facebook Audience Network) task.
 * - 5 tasks per cycle with 3-min cooldown between each
 * - 8-hour gap between cycles
 * - First time: full coins, second time onward: half coins
 */
export async function claimMetaTask(uid: string, taskType: string): Promise<MetaClaimResult> {
  if (!META_TASKS.includes(taskType as any)) {
    return { success: false, error: 'Invalid Meta task type' };
  }

  const userRef = db.collection(Collections.USERS).doc(uid);
  const userDoc = await userRef.get();

  if (!userDoc.exists) return { success: false, error: 'User not found' };
  const userData = userDoc.data()!;
  if (userData.status !== 'active') return { success: false, error: 'Account is not active' };

  const now = Date.now();

  // Check Meta cycle (8-hour gap)
  const nextMetaCycleAt = userData.nextMetaCycleAt?.toMillis?.() || 0;
  if (now < nextMetaCycleAt) {
    return { success: false, error: 'Meta cycle not ready yet', nextMetaCycleAt };
  }

  // Check Meta network cooldown (3-min between Meta tasks)
  const metaCooldownField = NETWORK_COOLDOWN_FIELDS.meta;
  const nextMetaAt = userData[metaCooldownField]?.toMillis?.() || 0;
  if (now < nextMetaAt) {
    return { success: false, error: 'Meta cooldown active', nextMetaCycleAt: nextMetaAt };
  }

  // Get Meta progress (separate from core task progress)
  const metaProgress = userData.metaProgress || getDefaultMetaProgress();

  if (metaProgress[taskType] === 'completed') {
    return { success: false, error: 'Meta task already completed in this cycle' };
  }

  // Calculate reward — first time full, repeat cycles half
  const metaCycleCount = userData.metaCycleCount || 0;
  const baseReward = META_TASK_REWARDS[taskType] || 0;
  const isHalfReward = metaCycleCount > 0;
  const reward = isHalfReward ? Math.floor(baseReward / 2) : baseReward;

  // Check if all Meta tasks done after this
  const updatedProgress = { ...metaProgress, [taskType]: 'completed' };
  const allMetaDone = META_TASKS.every(t => updatedProgress[t] === 'completed');

  const serverNow = firebaseAdmin.firestore.FieldValue.serverTimestamp();
  const batch = db.batch();

  const userUpdate: Record<string, unknown> = {
    [`metaProgress.${taskType}`]: 'completed',
    [metaCooldownField]: firebaseAdmin.firestore.Timestamp.fromMillis(now + NETWORK_COOLDOWN_MS),
    coinBalance: firebaseAdmin.firestore.FieldValue.increment(reward),
    totalCoinsEarned: firebaseAdmin.firestore.FieldValue.increment(reward),
    updatedAt: serverNow,
  };

  // If all 5 Meta tasks done, start 8h gap and reset
  if (allMetaDone) {
    userUpdate.nextMetaCycleAt = firebaseAdmin.firestore.Timestamp.fromMillis(now + META_CYCLE_GAP_MS);
    userUpdate.metaProgress = getDefaultMetaProgress();
    userUpdate.metaCycleCount = firebaseAdmin.firestore.FieldValue.increment(1);
  }

  batch.update(userRef, userUpdate);

  // Ledger entry
  batch.set(
    db.collection(Collections.LEDGER).doc(uid).collection('entries').doc(),
    {
      uid,
      type: 'meta_task_reward',
      taskType,
      amount: reward,
      currency: 'coins',
      isHalfReward,
      cycleNumber: metaCycleCount,
      balanceAfter: (userData.coinBalance || 0) + reward,
      createdAt: serverNow,
    }
  );

  await batch.commit();

  return {
    success: true,
    reward,
    isHalfReward,
    nextMetaCycleAt: allMetaDone ? now + META_CYCLE_GAP_MS : undefined,
    metaProgress: allMetaDone ? getDefaultMetaProgress() : updatedProgress,
  };
}

/**
 * Gets Meta task status for a user.
 */
export async function getMetaTaskStatus(uid: string): Promise<{
  metaProgress: Record<string, string>;
  cycleReady: boolean;
  cooldownReady: boolean;
  nextMetaCycleAt: number;
  nextMetaAt: number;
  metaCycleCount: number;
}> {
  const userDoc = await db.collection(Collections.USERS).doc(uid).get();
  if (!userDoc.exists) throw new Error('User not found');

  const userData = userDoc.data()!;
  const now = Date.now();
  const nextMetaCycleAt = userData.nextMetaCycleAt?.toMillis?.() || 0;
  const nextMetaAt = userData[NETWORK_COOLDOWN_FIELDS.meta]?.toMillis?.() || 0;

  return {
    metaProgress: userData.metaProgress || getDefaultMetaProgress(),
    cycleReady: now >= nextMetaCycleAt,
    cooldownReady: now >= nextMetaAt,
    nextMetaCycleAt,
    nextMetaAt,
    metaCycleCount: userData.metaCycleCount || 0,
  };
}
