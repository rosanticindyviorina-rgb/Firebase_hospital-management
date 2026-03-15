import { db, Collections, firebaseAdmin } from '../config/firebase';
import { LOYALTY_TIERS } from '../config/constants';

interface LoyaltyClaimResult {
  success: boolean;
  error?: string;
  reward?: number;
  dayOfMonth?: number;
  streakDay?: number;
}

/**
 * Gets loyalty reward amount based on day of month.
 * Day 1-10: 20 coins, Day 11-20: 30 coins, Day 21-31: 45 coins
 */
function getLoyaltyReward(dayOfMonth: number): number {
  for (const tier of LOYALTY_TIERS) {
    if (dayOfMonth >= tier.dayStart && dayOfMonth <= tier.dayEnd) {
      return tier.coins;
    }
  }
  return LOYALTY_TIERS[0].coins; // fallback
}

/**
 * Claims daily loyalty reward. One ad per day, coins based on day of month.
 * Only one claim per calendar day — second click does nothing.
 */
export async function claimLoyaltyReward(uid: string): Promise<LoyaltyClaimResult> {
  const userRef = db.collection(Collections.USERS).doc(uid);
  const userDoc = await userRef.get();

  if (!userDoc.exists) return { success: false, error: 'User not found' };
  const userData = userDoc.data()!;
  if (userData.status !== 'active') return { success: false, error: 'Account is not active' };

  // Check if already claimed today
  const now = new Date();
  const today = now.toISOString().split('T')[0]; // YYYY-MM-DD
  const lastLoyaltyDate = userData.lastLoyaltyDate || '';

  if (lastLoyaltyDate === today) {
    return { success: false, error: 'Daily loyalty reward already claimed today' };
  }

  const dayOfMonth = now.getDate();
  const reward = getLoyaltyReward(dayOfMonth);

  // Calculate streak
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().split('T')[0];
  const currentStreak = userData.loyaltyStreak || 0;
  const streakDay = lastLoyaltyDate === yesterdayStr ? currentStreak + 1 : 1;

  const serverNow = firebaseAdmin.firestore.FieldValue.serverTimestamp();
  const batch = db.batch();

  batch.update(userRef, {
    coinBalance: firebaseAdmin.firestore.FieldValue.increment(reward),
    totalCoinsEarned: firebaseAdmin.firestore.FieldValue.increment(reward),
    lastLoyaltyDate: today,
    loyaltyStreak: streakDay,
    updatedAt: serverNow,
  });

  // Ledger entry
  batch.set(
    db.collection(Collections.LEDGER).doc(uid).collection('entries').doc(),
    {
      uid,
      type: 'loyalty_reward',
      amount: reward,
      currency: 'coins',
      dayOfMonth,
      streakDay,
      date: today,
      balanceAfter: (userData.coinBalance || 0) + reward,
      createdAt: serverNow,
    }
  );

  await batch.commit();

  return { success: true, reward, dayOfMonth, streakDay };
}

/**
 * Gets loyalty status for a user.
 */
export async function getLoyaltyStatus(uid: string): Promise<{
  claimedToday: boolean;
  lastLoyaltyDate: string;
  loyaltyStreak: number;
  todayReward: number;
  dayOfMonth: number;
  tiers: typeof LOYALTY_TIERS;
}> {
  const userDoc = await db.collection(Collections.USERS).doc(uid).get();
  if (!userDoc.exists) throw new Error('User not found');

  const userData = userDoc.data()!;
  const now = new Date();
  const today = now.toISOString().split('T')[0];
  const dayOfMonth = now.getDate();

  return {
    claimedToday: userData.lastLoyaltyDate === today,
    lastLoyaltyDate: userData.lastLoyaltyDate || '',
    loyaltyStreak: userData.loyaltyStreak || 0,
    todayReward: getLoyaltyReward(dayOfMonth),
    dayOfMonth,
    tiers: LOYALTY_TIERS,
  };
}
