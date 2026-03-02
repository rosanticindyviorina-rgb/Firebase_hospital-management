import { db, Collections, firebaseAdmin } from '../config/firebase';
import { banUser, unbanUser } from './securityService';
import { AD_PROVIDERS, DEFAULT_EXCHANGE_RATE, TASK_REWARDS } from '../config/constants';

/**
 * Switch the active ad provider.
 */
export async function switchAdProvider(
  provider: string,
  adminUid: string
): Promise<{ success: boolean; error?: string }> {
  if (!AD_PROVIDERS.includes(provider as typeof AD_PROVIDERS[number])) {
    return { success: false, error: `Invalid provider. Must be one of: ${AD_PROVIDERS.join(', ')}` };
  }

  const now = firebaseAdmin.firestore.FieldValue.serverTimestamp();
  const batch = db.batch();

  batch.set(
    db.collection(Collections.CONFIG).doc('app'),
    { ad_provider: provider, updatedAt: now, updatedBy: adminUid },
    { merge: true }
  );

  batch.set(db.collection(Collections.ADMIN_ACTIONS).doc(), {
    action: 'switch_ads',
    provider,
    adminUid,
    timestamp: now,
  });

  await batch.commit();
  return { success: true };
}

/**
 * Update app configuration (exchange rate, task rewards, ad limits, etc.)
 */
export async function updateAppConfig(
  updates: Record<string, unknown>,
  adminUid: string
): Promise<{ success: boolean }> {
  const now = firebaseAdmin.firestore.FieldValue.serverTimestamp();
  const batch = db.batch();

  batch.set(
    db.collection(Collections.CONFIG).doc('app'),
    { ...updates, updatedAt: now, updatedBy: adminUid },
    { merge: true }
  );

  batch.set(db.collection(Collections.ADMIN_ACTIONS).doc(), {
    action: 'update_config',
    adminUid,
    details: updates,
    timestamp: now,
  });

  await batch.commit();
  return { success: true };
}

export async function adminBanUser(targetUid: string, reason: string, adminUid: string): Promise<void> {
  await banUser(targetUid, reason, { bannedBy: adminUid, source: 'admin_panel' });
  await db.collection(Collections.ADMIN_ACTIONS).doc().set({
    action: 'ban_user',
    targetUid,
    reason,
    adminUid,
    timestamp: firebaseAdmin.firestore.FieldValue.serverTimestamp(),
  });
}

export async function adminUnbanUser(targetUid: string, adminUid: string): Promise<void> {
  await unbanUser(targetUid, adminUid);
}

export async function getAdminUserDetail(uid: string): Promise<{
  user: FirebaseFirestore.DocumentData | null;
  referral: FirebaseFirestore.DocumentData | null;
  ban: FirebaseFirestore.DocumentData | null;
  recentTasks: FirebaseFirestore.DocumentData[];
  recentLedger: FirebaseFirestore.DocumentData[];
}> {
  const [userDoc, referralDoc, banDoc] = await Promise.all([
    db.collection(Collections.USERS).doc(uid).get(),
    db.collection(Collections.REFERRALS).doc(uid).get(),
    db.collection(Collections.BANS).doc(uid).get(),
  ]);

  const ledgerSnapshot = await db
    .collection(Collections.LEDGER)
    .doc(uid)
    .collection('entries')
    .orderBy('createdAt', 'desc')
    .limit(20)
    .get();

  return {
    user: userDoc.exists ? { id: userDoc.id, ...userDoc.data() } : null,
    referral: referralDoc.exists ? { id: referralDoc.id, ...referralDoc.data() } : null,
    ban: banDoc.exists ? { id: banDoc.id, ...banDoc.data() } : null,
    recentTasks: [],
    recentLedger: ledgerSnapshot.docs.map(d => ({ id: d.id, ...d.data() })),
  };
}

export async function getFraudLogs(
  limit = 50,
  startAfter?: FirebaseFirestore.DocumentSnapshot
): Promise<{ logs: FirebaseFirestore.DocumentData[]; lastDoc: FirebaseFirestore.DocumentSnapshot | null }> {
  let query = db.collection(Collections.BANS).orderBy('bannedAt', 'desc').limit(limit);
  if (startAfter) query = query.startAfter(startAfter);

  const snapshot = await query.get();
  return {
    logs: snapshot.docs.map(d => ({ id: d.id, ...d.data() })),
    lastDoc: snapshot.docs.length > 0 ? snapshot.docs[snapshot.docs.length - 1] : null,
  };
}

export async function getAdminActionLogs(limit = 50): Promise<FirebaseFirestore.DocumentData[]> {
  const snapshot = await db
    .collection(Collections.ADMIN_ACTIONS)
    .orderBy('timestamp', 'desc')
    .limit(limit)
    .get();
  return snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function getDashboardKPIs(): Promise<{
  totalUsers: number;
  activeBans: number;
  todayNewUsers: number;
  todayBans: number;
  todayTaskClaims: number;
}> {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const [totalUsersSnapshot, bansSnapshot, todayUsersSnapshot, todayBansSnapshot] = await Promise.all([
    db.collection(Collections.USERS).count().get(),
    db.collection(Collections.BANS).count().get(),
    db.collection(Collections.USERS).where('createdAt', '>=', todayStart).count().get(),
    db.collection(Collections.BANS).where('bannedAt', '>=', todayStart).count().get(),
  ]);

  let todayTaskClaims = 0;
  try {
    const taskClaimsSnapshot = await db
      .collectionGroup('entries')
      .where('type', '==', 'task_reward')
      .where('createdAt', '>=', todayStart)
      .count()
      .get();
    todayTaskClaims = taskClaimsSnapshot.data().count;
  } catch {
    todayTaskClaims = 0;
  }

  return {
    totalUsers: totalUsersSnapshot.data().count,
    activeBans: bansSnapshot.data().count,
    todayNewUsers: todayUsersSnapshot.data().count,
    todayBans: todayBansSnapshot.data().count,
    todayTaskClaims,
  };
}

export async function getAppConfig(): Promise<FirebaseFirestore.DocumentData> {
  const doc = await db.collection(Collections.CONFIG).doc('app').get();
  const defaults = {
    ad_provider: 'admob',
    exchange_rate_coins: DEFAULT_EXCHANGE_RATE,
    exchange_rate_pkr: 100,
    min_withdrawal_coins: 3000,
    daily_ad_limit: 8,
    ad_cooldown_hours: 7,
    l1_invite_bonus_coins: 150,
    task_rewards: TASK_REWARDS,
    maintenance_mode: false,
  };
  return doc.exists ? { ...defaults, ...doc.data() } : defaults;
}
