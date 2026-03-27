import { db, Collections, firebaseAdmin } from '../config/firebase';
import {
  TASK_COOLDOWN_MS,
  CYCLE_DURATION_MS,
  TASK_TYPES,
  TASK_REWARDS,
  INVITE_TASKS,
  REFERRAL_COMMISSION,
  L1_INVITE_BONUS_COINS,
  NETWORK_COOLDOWN_MS,
  TASK_NETWORK_MAP,
  NETWORK_COOLDOWN_FIELDS,
  DAILY_AD_LIMIT,
  AD_TASKS,
  CORE_TASK_KEYS,
  getDefaultTaskProgress,
  TIER_TASK_GROUPS,
  TIER_LOCKDOWN_MS,
} from '../config/constants';

/**
 * Find which tier a task belongs to, and check if that tier is locked.
 */
function getTierForTask(taskType: string): string | null {
  for (const [tier, tasks] of Object.entries(TIER_TASK_GROUPS)) {
    if (tasks.includes(taskType)) return tier;
  }
  return null;
}

function isTierLocked(userData: Record<string, unknown>, tier: string, now: number): boolean {
  const lockField = `tierLockdown_${tier}`;
  const lockUntil = (userData[lockField] as any)?.toMillis?.() || 0;
  return now < lockUntil;
}

function areTierTasksComplete(taskProgress: Record<string, string>, metaProgress: Record<string, string>, tier: string): boolean {
  const tasks = TIER_TASK_GROUPS[tier] || [];
  return tasks.every(key => {
    if (key.startsWith('meta_')) return (metaProgress[key] || 'pending') === 'completed';
    return (taskProgress[key] || 'pending') === 'completed';
  });
}

interface TaskClaimResult {
  success: boolean;
  error?: string;
  reward?: number;
  nextTaskAt?: number;
  networkCooldowns?: Record<string, number>;
}

/**
 * Gets the network cooldown field for a task, or null if not an ad task.
 */
function getNetworkCooldownField(taskType: string): string | null {
  const network = TASK_NETWORK_MAP[taskType];
  if (!network) return null;
  return NETWORK_COOLDOWN_FIELDS[network] || null;
}

/**
 * Extracts current network cooldown timestamps from user data.
 */
function getNetworkCooldowns(
  userData: FirebaseFirestore.DocumentData,
  overrides: Record<string, number> = {}
): Record<string, number> {
  const cooldowns: Record<string, number> = {};
  for (const [network, field] of Object.entries(NETWORK_COOLDOWN_FIELDS)) {
    if (overrides[field] !== undefined) {
      cooldowns[network] = overrides[field];
    } else {
      cooldowns[network] = userData[field]?.toMillis?.() || 0;
    }
  }
  return cooldowns;
}

/**
 * Claims a task reward (coins). Server-authoritative validation.
 * Ad tasks use independent per-network cooldowns (AdMob, AppLovin, Unity).
 * Non-ad tasks use the global cooldown.
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

  // Check tier-based 8-hour lockdown
  const tier = getTierForTask(taskType);
  if (tier && isTierLocked(userData, tier, now)) {
    const lockField = `tierLockdown_${tier}`;
    const lockUntil = (userData[lockField] as any)?.toMillis?.() || 0;
    return { success: false, error: `${tier.charAt(0).toUpperCase() + tier.slice(1)} tier is locked for 8 hours`, nextTaskAt: lockUntil };
  }

  // Check cooldown: per-network for ad tasks, global for others
  const networkField = getNetworkCooldownField(taskType);
  if (networkField) {
    // Per-network cooldown for ad tasks
    const networkCooldownAt = userData[networkField]?.toMillis?.() || 0;
    if (now < networkCooldownAt) {
      return {
        success: false,
        error: `${TASK_NETWORK_MAP[taskType]} network cooldown active`,
        nextTaskAt: networkCooldownAt,
        networkCooldowns: getNetworkCooldowns(userData),
      };
    }
  } else {
    // Global cooldown for non-ad tasks (spin, scratch, invite tasks)
    const nextTaskAt = userData.nextTaskAt?.toMillis?.() || 0;
    if (now < nextTaskAt) {
      return { success: false, error: 'Task cooldown active', nextTaskAt };
    }
  }

  // Check daily ad limit for ad tasks
  const isAdTask = (AD_TASKS as readonly string[]).includes(taskType);
  if (isAdTask) {
    const adWatchCount = userData.adWatchCount || 0;
    if (adWatchCount >= DAILY_AD_LIMIT) {
      return { success: false, error: `Daily ad limit reached (${DAILY_AD_LIMIT})` };
    }
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

  // Check if all 12 core tasks will be complete after this one
  const updatedProgress = { ...userData.taskProgress, [taskType]: 'completed' };
  const metaProgress = userData.metaProgress || {};
  const allDone = CORE_TASK_KEYS.every(key => updatedProgress[key] === 'completed');

  // Check if this task completes its tier → 8-hour lockdown
  let tierLockdownUpdate: Record<string, unknown> = {};
  if (tier) {
    const updatedMeta = taskType.startsWith('meta_')
      ? { ...metaProgress, [taskType]: 'completed' }
      : metaProgress;
    const updatedCore = taskType.startsWith('meta_') ? updatedProgress : { ...updatedProgress };
    if (areTierTasksComplete(updatedCore, updatedMeta, tier)) {
      tierLockdownUpdate[`tierLockdown_${tier}`] = firebaseAdmin.firestore.Timestamp.fromMillis(now + TIER_LOCKDOWN_MS);
    }
  }

  const serverNow = firebaseAdmin.firestore.FieldValue.serverTimestamp();
  const batch = db.batch();

  // Update user: coins balance, timers, task progress
  const userUpdate: Record<string, unknown> = {
    [`taskProgress.${taskType}`]: 'completed',
    lastTaskAt: serverNow,
    coinBalance: firebaseAdmin.firestore.FieldValue.increment(reward),
    totalCoinsEarned: firebaseAdmin.firestore.FieldValue.increment(reward),
    updatedAt: serverNow,
    ...tierLockdownUpdate,
  };

  // Increment ad watch count for ad tasks
  if (isAdTask) {
    userUpdate.adWatchCount = firebaseAdmin.firestore.FieldValue.increment(1);
  }

  // Set the appropriate cooldown timer
  if (networkField) {
    // Per-network cooldown — only this network gets locked for 3 min
    userUpdate[networkField] = firebaseAdmin.firestore.Timestamp.fromMillis(now + NETWORK_COOLDOWN_MS);
  } else {
    // Global cooldown for non-ad tasks
    userUpdate.nextTaskAt = firebaseAdmin.firestore.Timestamp.fromMillis(now + TASK_COOLDOWN_MS);
  }

  // If all tasks done, set next cycle (same time next day)
  if (allDone) {
    const cycleStartAt = userData.lastCycleStartAt?.toMillis?.() || now;
    const nextCycle = cycleStartAt + CYCLE_DURATION_MS;
    userUpdate.nextCycleAt = firebaseAdmin.firestore.Timestamp.fromMillis(nextCycle);
    userUpdate.taskProgress = getDefaultTaskProgress();
    userUpdate.lastCycleStartAt = serverNow;
    userUpdate.adWatchCount = 0;
    // Reset all network cooldowns on cycle reset
    for (const field of Object.values(NETWORK_COOLDOWN_FIELDS)) {
      userUpdate[field] = null;
    }
    userUpdate.nextTaskAt = null;
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

  // Credit invite bonus to inviter on first task completion
  if (userData.inviteBonusPending && userData.inviteBonusInviterUid) {
    creditInviteBonus(uid, userData.inviteBonusInviterUid).catch(err =>
      console.error('Invite bonus error:', err)
    );
  }

  return {
    success: true,
    reward,
    nextTaskAt: networkField ? now + NETWORK_COOLDOWN_MS : now + TASK_COOLDOWN_MS,
    networkCooldowns: getNetworkCooldowns(userData, networkField ? { [networkField]: now + NETWORK_COOLDOWN_MS } : {}),
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
  adWatchCount: number;
  coinBalance: number;
  totalCoinsEarned: number;
  networkCooldowns: Record<string, number>;
}> {
  const userDoc = await db.collection(Collections.USERS).doc(uid).get();

  if (!userDoc.exists) {
    throw new Error('User not found');
  }

  const userData = userDoc.data()!;
  const now = Date.now();
  const nextCycleAt = userData.nextCycleAt?.toMillis?.() || 0;
  const nextTaskAt = userData.nextTaskAt?.toMillis?.() || 0;
  const networkCooldowns = getNetworkCooldowns(userData);

  return {
    cycleReady: now >= nextCycleAt,
    cooldownReady: now >= nextTaskAt,
    taskProgress: userData.taskProgress || getDefaultTaskProgress(),
    nextCycleAt,
    nextTaskAt,
    adWatchCount: userData.adWatchCount || 0,
    coinBalance: userData.coinBalance || 0,
    totalCoinsEarned: userData.totalCoinsEarned || 0,
    networkCooldowns,
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

/**
 * Credits invite bonus to the inviter after the invitee completes their first task.
 * This prevents fake invite spamming — inviter only gets coins for real active users.
 */
async function creditInviteBonus(inviteeUid: string, inviterUid: string): Promise<void> {
  const now = firebaseAdmin.firestore.FieldValue.serverTimestamp();
  const batch = db.batch();

  // Credit 150 coins to inviter
  batch.update(db.collection(Collections.USERS).doc(inviterUid), {
    coinBalance: firebaseAdmin.firestore.FieldValue.increment(L1_INVITE_BONUS_COINS),
    totalCoinsEarned: firebaseAdmin.firestore.FieldValue.increment(L1_INVITE_BONUS_COINS),
    updatedAt: now,
  });

  // Ledger entry for inviter
  batch.set(
    db.collection(Collections.LEDGER).doc(inviterUid).collection('entries').doc(),
    {
      uid: inviterUid,
      type: 'invite_bonus_l1',
      amount: L1_INVITE_BONUS_COINS,
      currency: 'coins',
      fromUid: inviteeUid,
      createdAt: now,
    }
  );

  // Clear the pending flag on invitee
  batch.update(db.collection(Collections.USERS).doc(inviteeUid), {
    inviteBonusPending: false,
  });

  await batch.commit();
}
