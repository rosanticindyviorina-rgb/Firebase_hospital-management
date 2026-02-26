import { db, Collections, firebaseAdmin } from '../config/firebase';
import { SPIN_WEIGHTS, TASK_TYPES, TASK_COOLDOWN_MS, CYCLE_DURATION_MS } from '../config/constants';
import { v4 as uuidv4 } from 'uuid';

interface SpinResult {
  success: boolean;
  error?: string;
  prize?: number;
  label?: string;
  spinId?: string;
}

/**
 * Executes a spin (Task 4). Server decides the outcome using weighted random.
 * Zero client influence on the result.
 */
export async function executeSpin(uid: string): Promise<SpinResult> {
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

  // 3. Check cycle timer
  const now = Date.now();
  const nextCycleAt = userData.nextCycleAt?.toMillis?.() || 0;
  if (now < nextCycleAt) {
    return { success: false, error: 'Task cycle not ready yet' };
  }

  // 4. Check cooldown
  const nextTaskAt = userData.nextTaskAt?.toMillis?.() || 0;
  if (now < nextTaskAt) {
    return { success: false, error: 'Task cooldown active' };
  }

  // 5. Check if spin already done this cycle
  if (userData.taskProgress?.[TASK_TYPES.TASK_4] === 'completed') {
    return { success: false, error: 'Spin already completed in this cycle' };
  }

  // 6. Execute weighted random spin
  const totalWeight = SPIN_WEIGHTS.reduce((sum, w) => sum + w.weight, 0);
  let random = Math.random() * totalWeight;
  let prize = SPIN_WEIGHTS[0].prize as number;
  let label = SPIN_WEIGHTS[0].label as string;

  for (const entry of SPIN_WEIGHTS) {
    random -= entry.weight;
    if (random <= 0) {
      prize = entry.prize;
      label = entry.label;
      break;
    }
  }
  const spinId = uuidv4();

  // 7. Check if all tasks will be complete
  const updatedProgress = { ...userData.taskProgress, [TASK_TYPES.TASK_4]: 'completed' };
  const allDone = Object.values(updatedProgress).every(s => s === 'completed');

  const serverNow = firebaseAdmin.firestore.FieldValue.serverTimestamp();
  const batch = db.batch();

  // 8. Update user
  const userUpdate: Record<string, unknown> = {
    [`taskProgress.${TASK_TYPES.TASK_4}`]: 'completed',
    lastTaskAt: serverNow,
    nextTaskAt: firebaseAdmin.firestore.Timestamp.fromMillis(now + TASK_COOLDOWN_MS),
    updatedAt: serverNow,
  };

  if (prize > 0) {
    userUpdate.balance = firebaseAdmin.firestore.FieldValue.increment(prize);
    userUpdate.totalEarned = firebaseAdmin.firestore.FieldValue.increment(prize);
  }

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

  // 9. Log spin result
  batch.set(
    db.collection(Collections.SPINS).doc(uid).collection('results').doc(spinId),
    {
      uid,
      spinId,
      prize,
      label,
      weights: SPIN_WEIGHTS.map(w => ({ label: w.label, weight: w.weight })),
      claimedAt: serverNow,
    }
  );

  // 10. Create ledger entry (only if prize > 0)
  if (prize > 0) {
    batch.set(
      db.collection(Collections.LEDGER).doc(uid).collection('entries').doc(),
      {
        uid,
        type: 'spin_reward',
        amount: prize,
        spinId,
        label,
        balanceAfter: (userData.balance || 0) + prize,
        createdAt: serverNow,
      }
    );
  }

  await batch.commit();

  return {
    success: true,
    prize,
    label,
    spinId,
  };
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
