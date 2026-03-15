import { db, Collections, firebaseAdmin } from '../config/firebase';
import {
  SPIN_WEIGHTS,
  SCRATCH_REWARDS,
  TASK_TYPES,
  TASK_COOLDOWN_MS,
  CYCLE_DURATION_MS,
  NETWORK_COOLDOWN_FIELDS,
  CORE_TASK_KEYS,
  getDefaultTaskProgress,
} from '../config/constants';
import { v4 as uuidv4 } from 'uuid';

interface SpinResult {
  success: boolean;
  error?: string;
  prize?: number;
  label?: string;
  spinId?: string;
}

/**
 * Weighted random pick from a weights array.
 */
function weightedRandom(weights: ReadonlyArray<{ prize: number; label: string; weight: number }>): { prize: number; label: string } {
  const totalWeight = weights.reduce((sum, w) => sum + w.weight, 0);
  let random = Math.random() * totalWeight;

  for (const entry of weights) {
    random -= entry.weight;
    if (random <= 0) {
      return { prize: entry.prize, label: entry.label };
    }
  }
  return { prize: weights[0].prize, label: weights[0].label };
}

/**
 * Common validation for spin/scratch tasks.
 */
async function validateRandomTask(uid: string, taskKey: string): Promise<{
  valid: boolean;
  error?: string;
  userRef?: FirebaseFirestore.DocumentReference;
  userData?: FirebaseFirestore.DocumentData;
}> {
  const userRef = db.collection(Collections.USERS).doc(uid);
  const userDoc = await userRef.get();

  if (!userDoc.exists) return { valid: false, error: 'User not found' };
  const userData = userDoc.data()!;
  if (userData.status !== 'active') return { valid: false, error: 'Account is not active' };

  const now = Date.now();
  const nextCycleAt = userData.nextCycleAt?.toMillis?.() || 0;
  if (now < nextCycleAt) return { valid: false, error: 'Task cycle not ready yet' };

  const nextTaskAt = userData.nextTaskAt?.toMillis?.() || 0;
  if (now < nextTaskAt) return { valid: false, error: 'Task cooldown active' };

  if (userData.taskProgress?.[taskKey] === 'completed') {
    return { valid: false, error: 'Task already completed in this cycle' };
  }

  return { valid: true, userRef, userData };
}

/**
 * Applies random task result (spin or scratch) to user.
 */
async function applyRandomTaskResult(
  uid: string,
  taskKey: string,
  prize: number,
  label: string,
  resultType: 'spin_reward' | 'scratch_reward',
  userRef: FirebaseFirestore.DocumentReference,
  userData: FirebaseFirestore.DocumentData,
  weights: ReadonlyArray<{ label: string; weight: number }>,
): Promise<string> {
  const now = Date.now();
  const resultId = uuidv4();
  const serverNow = firebaseAdmin.firestore.FieldValue.serverTimestamp();
  const batch = db.batch();

  const updatedProgress = { ...userData.taskProgress, [taskKey]: 'completed' };
  const allDone = CORE_TASK_KEYS.every(key => updatedProgress[key] === 'completed');

  const userUpdate: Record<string, unknown> = {
    [`taskProgress.${taskKey}`]: 'completed',
    lastTaskAt: serverNow,
    nextTaskAt: firebaseAdmin.firestore.Timestamp.fromMillis(now + TASK_COOLDOWN_MS),
    updatedAt: serverNow,
  };

  if (prize > 0) {
    userUpdate.coinBalance = firebaseAdmin.firestore.FieldValue.increment(prize);
    userUpdate.totalCoinsEarned = firebaseAdmin.firestore.FieldValue.increment(prize);
  }

  if (allDone) {
    const cycleStartAt = userData.lastCycleStartAt?.toMillis?.() || now;
    userUpdate.nextCycleAt = firebaseAdmin.firestore.Timestamp.fromMillis(cycleStartAt + CYCLE_DURATION_MS);
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

  // Log result
  const collection = resultType === 'spin_reward' ? Collections.SPINS : Collections.TASKS;
  const subcollection = resultType === 'spin_reward' ? 'results' : 'scratches';
  batch.set(
    db.collection(collection).doc(uid).collection(subcollection).doc(resultId),
    {
      uid, resultId, prize, label, currency: 'coins',
      weights: weights.map(w => ({ label: w.label, weight: w.weight })),
      claimedAt: serverNow,
    }
  );

  // Ledger entry (only if prize > 0)
  if (prize > 0) {
    batch.set(
      db.collection(Collections.LEDGER).doc(uid).collection('entries').doc(),
      {
        uid,
        type: resultType,
        amount: prize,
        currency: 'coins',
        resultId,
        label,
        balanceAfter: (userData.coinBalance || 0) + prize,
        createdAt: serverNow,
      }
    );
  }

  await batch.commit();
  return resultId;
}

/**
 * Executes a spin (Task 4). Server decides outcome using weighted random.
 */
export async function executeSpin(uid: string): Promise<SpinResult> {
  const validation = await validateRandomTask(uid, TASK_TYPES.TASK_4);
  if (!validation.valid) return { success: false, error: validation.error };

  const { prize, label } = weightedRandom(SPIN_WEIGHTS);
  const spinId = await applyRandomTaskResult(
    uid, TASK_TYPES.TASK_4, prize, label,
    'spin_reward', validation.userRef!, validation.userData!,
    SPIN_WEIGHTS,
  );

  return { success: true, prize, label, spinId };
}

/**
 * Executes a scratch card (Task 8). Server decides outcome.
 */
export async function executeScratch(uid: string): Promise<SpinResult> {
  const validation = await validateRandomTask(uid, TASK_TYPES.TASK_8);
  if (!validation.valid) return { success: false, error: validation.error };

  const { prize, label } = weightedRandom(SCRATCH_REWARDS);
  const scratchId = await applyRandomTaskResult(
    uid, TASK_TYPES.TASK_8, prize, label,
    'scratch_reward', validation.userRef!, validation.userData!,
    SCRATCH_REWARDS,
  );

  return { success: true, prize, label, spinId: scratchId };
}

/**
 * Gets spin history for a user.
 */
export async function getSpinHistory(
  uid: string,
  limit = 20
): Promise<FirebaseFirestore.DocumentData[]> {
  const snapshot = await db
    .collection(Collections.SPINS)
    .doc(uid)
    .collection('results')
    .orderBy('claimedAt', 'desc')
    .limit(limit)
    .get();

  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}
