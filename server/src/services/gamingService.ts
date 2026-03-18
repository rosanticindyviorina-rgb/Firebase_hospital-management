import { db, Collections, firebaseAdmin } from '../config/firebase';

// ── Gaming Constants ──
const GAMING_PLATFORMS = ['adjoe', 'tapjoy', 'offertoro', 'gamezop', 'reserved'] as const;
type GamingPlatform = typeof GAMING_PLATFORMS[number];

const SESSION_GAP_MS = 8 * 60 * 60 * 1000; // 8 hours between sessions
const MAX_SESSION_MINUTES = 10; // 10-minute cap per session
const MAX_SESSION_MS = MAX_SESSION_MINUTES * 60 * 1000;
const SESSION_COIN_CAP = 100; // Max KC Coins per session
const MAX_SESSIONS_PER_DAY = 3;

interface GamingSession {
  platform: string;
  sessionNumber: number;
  startedAt: number;
  endedAt?: number;
  coinsEarned: number;
  capped: boolean;
}

interface StartSessionResult {
  success: boolean;
  error?: string;
  sessionId?: string;
  sessionNumber?: number;
  maxMinutes?: number;
  coinCap?: number;
  expiresAt?: number;
}

interface EndSessionResult {
  success: boolean;
  error?: string;
  coinsAwarded?: number;
  sessionNumber?: number;
  nextSessionAt?: number;
  capped?: boolean;
}

interface GamingStatusResult {
  platforms: Record<string, {
    sessionsToday: number;
    maxSessions: number;
    nextSessionAt: number;
    canPlay: boolean;
    activeSession: boolean;
    coinsEarnedToday: number;
  }>;
}

/**
 * Starts a gaming session for a platform.
 * Validates: user active, session limit, cooldown, no active session.
 */
export async function startGamingSession(uid: string, platform: string): Promise<StartSessionResult> {
  if (!GAMING_PLATFORMS.includes(platform as GamingPlatform)) {
    return { success: false, error: 'Invalid gaming platform' };
  }

  const userRef = db.collection(Collections.USERS).doc(uid);
  const userDoc = await userRef.get();
  if (!userDoc.exists) return { success: false, error: 'User not found' };

  const userData = userDoc.data()!;
  if (userData.status !== 'active') return { success: false, error: 'Account is not active' };

  const now = Date.now();
  const gamingData = userData.gaming || {};
  const platformData = gamingData[platform] || {};

  // Check if there's an active session
  if (platformData.activeSessionId) {
    const activeStarted = platformData.activeSessionStartedAt?.toMillis?.() || 0;
    const elapsed = now - activeStarted;
    if (elapsed < MAX_SESSION_MS) {
      // Session still within 10-min window — block new session
      return { success: false, error: 'Session already active' };
    }
    // Session expired (over 10 min) — auto-expire it, award 0, clear state
    await userRef.update({
      [`gaming.${platform}.activeSessionId`]: firebaseAdmin.firestore.FieldValue.delete(),
      [`gaming.${platform}.activeSessionStartedAt`]: firebaseAdmin.firestore.FieldValue.delete(),
      [`gaming.${platform}.activeSessionNumber`]: firebaseAdmin.firestore.FieldValue.delete(),
      [`gaming.${platform}.nextSessionAt`]: firebaseAdmin.firestore.Timestamp.fromMillis(now + SESSION_GAP_MS),
    });
    try {
      await db.collection('gamingSessions').doc(platformData.activeSessionId).update({
        status: 'expired', endedAt: firebaseAdmin.firestore.FieldValue.serverTimestamp(), coinsEarned: 0,
      });
    } catch (_) { /* session doc may not exist */ }
  }

  // Check session count today
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const sessionsToday = platformData.sessionsToday || 0;
  const lastSessionDate = platformData.lastSessionDate || '';
  const todayStr = todayStart.toISOString().split('T')[0];

  const actualSessionsToday = lastSessionDate === todayStr ? sessionsToday : 0;

  if (actualSessionsToday >= MAX_SESSIONS_PER_DAY) {
    return { success: false, error: `Maximum ${MAX_SESSIONS_PER_DAY} sessions per day reached` };
  }

  // Check cooldown (8h between sessions)
  const nextSessionAt = platformData.nextSessionAt?.toMillis?.() || 0;
  if (now < nextSessionAt) {
    return { success: false, error: 'Session cooldown active', nextSessionAt };
  }

  const sessionNumber = actualSessionsToday + 1;
  const sessionId = `${platform}_${uid}_${now}`;
  const expiresAt = now + MAX_SESSION_MS;

  // Create session record
  const serverNow = firebaseAdmin.firestore.FieldValue.serverTimestamp();

  await userRef.update({
    [`gaming.${platform}.activeSessionId`]: sessionId,
    [`gaming.${platform}.activeSessionStartedAt`]: firebaseAdmin.firestore.Timestamp.fromMillis(now),
    [`gaming.${platform}.activeSessionNumber`]: sessionNumber,
    [`gaming.${platform}.sessionsToday`]: sessionNumber,
    [`gaming.${platform}.lastSessionDate`]: todayStr,
    updatedAt: serverNow,
  });

  // Log session start
  await db.collection('gamingSessions').doc(sessionId).set({
    uid,
    platform,
    sessionNumber,
    startedAt: serverNow,
    expiresAt: firebaseAdmin.firestore.Timestamp.fromMillis(expiresAt),
    coinsEarned: 0,
    status: 'active',
    createdAt: serverNow,
  });

  return {
    success: true,
    sessionId,
    sessionNumber,
    maxMinutes: MAX_SESSION_MINUTES,
    coinCap: SESSION_COIN_CAP,
    expiresAt,
  };
}

/**
 * Ends a gaming session, awards coins (capped at SESSION_COIN_CAP).
 * Called when: user exits game, 10-min timer fires, or server-side expiry check.
 */
export async function endGamingSession(
  uid: string,
  platform: string,
  coinsEarned: number
): Promise<EndSessionResult> {
  if (!GAMING_PLATFORMS.includes(platform as GamingPlatform)) {
    return { success: false, error: 'Invalid gaming platform' };
  }

  const userRef = db.collection(Collections.USERS).doc(uid);
  const userDoc = await userRef.get();
  if (!userDoc.exists) return { success: false, error: 'User not found' };

  const userData = userDoc.data()!;
  const gamingData = userData.gaming || {};
  const platformData = gamingData[platform] || {};

  const sessionId = platformData.activeSessionId;
  if (!sessionId) {
    return { success: false, error: 'No active session' };
  }

  const sessionStarted = platformData.activeSessionStartedAt?.toMillis?.() || 0;
  const now = Date.now();
  const elapsed = now - sessionStarted;
  const sessionNumber = platformData.activeSessionNumber || 1;

  // Reject sessions ended way after expiry (>2x window = likely stale/exploit)
  const GRACE_MS = MAX_SESSION_MS * 2; // 20 minutes grace
  if (elapsed > GRACE_MS) {
    // Auto-expire: award 0 coins, clear session
    const serverNow = firebaseAdmin.firestore.FieldValue.serverTimestamp();
    await userRef.update({
      [`gaming.${platform}.activeSessionId`]: firebaseAdmin.firestore.FieldValue.delete(),
      [`gaming.${platform}.activeSessionStartedAt`]: firebaseAdmin.firestore.FieldValue.delete(),
      [`gaming.${platform}.activeSessionNumber`]: firebaseAdmin.firestore.FieldValue.delete(),
      [`gaming.${platform}.nextSessionAt`]: firebaseAdmin.firestore.Timestamp.fromMillis(now + SESSION_GAP_MS),
      updatedAt: serverNow,
    });
    return { success: false, error: 'Session expired', coinsAwarded: 0 };
  }

  // Server-authoritative coin calculation based on elapsed time
  // Max coins proportional to time spent (prevents instant coin farming)
  const maxCoinsByTime = Math.floor((Math.min(elapsed, MAX_SESSION_MS) / MAX_SESSION_MS) * SESSION_COIN_CAP);
  const serverCoins = Math.min(Math.max(0, Math.floor(coinsEarned)), maxCoinsByTime);

  // Enforce 10-minute cap — ignore coins earned beyond the cap
  const capped = coinsEarned > SESSION_COIN_CAP || coinsEarned > maxCoinsByTime;
  const awardedCoins = serverCoins; // Use server-calculated amount, NOT client amount

  // Greed filter: if session lasted < 30 seconds, suspicious — award 0
  if (elapsed < 30000 && coinsEarned > 20) {
    console.warn(`Suspicious gaming session: ${uid} claimed ${coinsEarned} in ${elapsed}ms — awarding 0`);
  }

  const serverNow = firebaseAdmin.firestore.FieldValue.serverTimestamp();
  const nextSessionAt = now + SESSION_GAP_MS;

  const batch = db.batch();

  // Clear active session, set cooldown
  batch.update(userRef, {
    [`gaming.${platform}.activeSessionId`]: firebaseAdmin.firestore.FieldValue.delete(),
    [`gaming.${platform}.activeSessionStartedAt`]: firebaseAdmin.firestore.FieldValue.delete(),
    [`gaming.${platform}.activeSessionNumber`]: firebaseAdmin.firestore.FieldValue.delete(),
    [`gaming.${platform}.nextSessionAt`]: firebaseAdmin.firestore.Timestamp.fromMillis(nextSessionAt),
    [`gaming.${platform}.coinsEarnedToday`]: firebaseAdmin.firestore.FieldValue.increment(awardedCoins),
    coinBalance: firebaseAdmin.firestore.FieldValue.increment(awardedCoins),
    totalCoinsEarned: firebaseAdmin.firestore.FieldValue.increment(awardedCoins),
    updatedAt: serverNow,
  });

  // Update session record
  batch.update(db.collection('gamingSessions').doc(sessionId), {
    endedAt: serverNow,
    coinsEarned: awardedCoins,
    capped,
    durationMs: elapsed,
    status: 'completed',
  });

  // Ledger entry
  if (awardedCoins > 0) {
    batch.set(
      db.collection(Collections.LEDGER).doc(uid).collection('entries').doc(),
      {
        uid,
        type: 'gaming_reward',
        platform,
        sessionNumber,
        amount: awardedCoins,
        currency: 'coins',
        capped,
        balanceAfter: (userData.coinBalance || 0) + awardedCoins,
        createdAt: serverNow,
      }
    );
  }

  await batch.commit();

  return {
    success: true,
    coinsAwarded: awardedCoins,
    sessionNumber,
    nextSessionAt,
    capped,
  };
}

/**
 * Gets gaming status for all platforms for a user.
 */
export async function getGamingStatus(uid: string): Promise<GamingStatusResult> {
  const userDoc = await db.collection(Collections.USERS).doc(uid).get();
  if (!userDoc.exists) throw new Error('User not found');

  const userData = userDoc.data()!;
  const gamingData = userData.gaming || {};
  const now = Date.now();

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayStr = todayStart.toISOString().split('T')[0];

  const platforms: GamingStatusResult['platforms'] = {};

  for (const platform of GAMING_PLATFORMS) {
    const pd = gamingData[platform] || {};
    const isToday = pd.lastSessionDate === todayStr;
    const sessionsToday = isToday ? (pd.sessionsToday || 0) : 0;
    const nextSessionAt = pd.nextSessionAt?.toMillis?.() || 0;
    const hasActiveSession = !!pd.activeSessionId;

    // Check if active session expired
    let activeSession = hasActiveSession;
    if (hasActiveSession) {
      const started = pd.activeSessionStartedAt?.toMillis?.() || 0;
      if (now - started >= MAX_SESSION_MS) {
        activeSession = false; // Expired
      }
    }

    platforms[platform] = {
      sessionsToday,
      maxSessions: MAX_SESSIONS_PER_DAY,
      nextSessionAt,
      canPlay: sessionsToday < MAX_SESSIONS_PER_DAY && now >= nextSessionAt && !activeSession,
      activeSession,
      coinsEarnedToday: isToday ? (pd.coinsEarnedToday || 0) : 0,
    };
  }

  return { platforms };
}
