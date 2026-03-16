// Task & Timer constants
export const CYCLE_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours
export const TASK_COOLDOWN_MS = 3 * 60 * 1000; // 3 minutes between tasks
export const AD_COOLDOWN_MS = 7 * 60 * 60 * 1000; // 7 hours (6-8h range, we use 7)
export const META_CYCLE_GAP_MS = 8 * 60 * 60 * 1000; // 8 hours between Meta task cycles

// Coins system — updated: 2000 coins = 50 PKR
export const COINS_PER_PKR = 40; // 2000 coins / 50 PKR = 40 coins per PKR
export const DEFAULT_EXCHANGE_RATE = 2000; // coins needed per 50 PKR
export const EXCHANGE_RATE_PKR = 50; // PKR per exchange unit
export const MIN_WITHDRAWAL_COINS = 15000; // Minimum withdrawal = 375 PKR

// Invite thresholds
export const INVITE_CHALLENGE_TARGET = 15; // Task 3
export const INVITE_TARGET_T9 = 1;
export const INVITE_TARGET_T10 = 3;
export const INVITE_TARGET_T11 = 5;
export const INVITE_TARGET_T12 = 8;

// Referral commission rates (applied on coins)
export const REFERRAL_COMMISSION = {
  L1: 0.10, // 10%
  L2: 0.05, // 5%
  L3: 0.02, // 2%
} as const;

// Referral bonus: Coins per verified L1 invite
// Only awarded after invitee completes at least one full task session
export const L1_INVITE_BONUS_COINS = 150;

// Daily ad limit (rewarded video ads)
export const DAILY_AD_LIMIT = 8;

// Spin wheel weights (coins)
export const SPIN_WEIGHTS = [
  { prize: 30, label: '30 Coins', weight: 40 },
  { prize: 0, label: 'Try Again', weight: 25 },
  { prize: 50, label: '50 Coins', weight: 20 },
  { prize: 100, label: '100 Coins', weight: 10 },
  { prize: 199, label: '199 Coins', weight: 5 },
] as const;

// Scratch card rewards (coins) — Task 8
export const SCRATCH_REWARDS = [
  { prize: 3, label: '3 Coins', weight: 40 },
  { prize: 7, label: '7 Coins', weight: 30 },
  { prize: 10, label: '10 Coins', weight: 20 },
  { prize: 15, label: '15 Coins', weight: 10 },
] as const;

// User statuses
export const USER_STATUS = {
  ACTIVE: 'active',
  BANNED: 'banned',
  PENDING: 'pending',
} as const;

// Ban reasons
export const BAN_REASONS = {
  ROOT_DETECTED: 'root_detected',
  EMULATOR_DETECTED: 'emulator_detected',
  VPN_DETECTED: 'vpn_detected',
  CLONE_DETECTED: 'clone_detected',
  PARALLEL_SPACE: 'parallel_space_detected',
  HOOKING_DETECTED: 'hooking_detected',
  INTEGRITY_FAILED: 'play_integrity_failed',
  MULTI_ACCOUNT: 'multi_account_device',
  ADMIN_BAN: 'admin_manual_ban',
  SUSPICIOUS_BEHAVIOR: 'suspicious_behavior',
} as const;

// 12 Core Task types + 5 Meta tasks + loyalty task
export const TASK_TYPES = {
  // AdMob tasks (first 4 ad tasks)
  TASK_1: 'task_1',   // Ad Watch (AdMob) — 50 coins
  TASK_2: 'task_2',   // Ad Watch (AdMob) — 60 coins
  TASK_3: 'task_3',   // Invite 15 Friends — 400 coins
  TASK_4: 'task_4',   // Spin Wheel — random
  // AppLovin/Unity tasks
  TASK_5: 'task_5',   // Ad Watch (AppLovin) — 50 coins
  TASK_6: 'task_6',   // Ad Watch (AppLovin) — 50 coins
  TASK_7: 'task_7',   // Ad Watch (Unity) — 50 coins
  TASK_8: 'task_8',   // Scratch Card — random
  // Invite tasks
  TASK_9: 'task_9',   // Invite 1 Friend — 80 coins
  TASK_10: 'task_10', // Invite 3 Friends — 100 coins
  TASK_11: 'task_11', // Invite 5 Friends — 150 coins
  TASK_12: 'task_12', // Invite 8 Friends — 250 coins
  // Meta (Facebook) Audience Network tasks — 5 tasks, 8h gap, 3min cooldown
  META_1: 'meta_1',   // Meta Ad Watch — 25 coins (half on repeat)
  META_2: 'meta_2',   // Meta Ad Watch — 30 coins (half on repeat)
  META_3: 'meta_3',   // Meta Ad Watch — 35 coins (half on repeat)
  META_4: 'meta_4',   // Meta Ad Watch — 40 coins (half on repeat)
  META_5: 'meta_5',   // Meta Ad Watch — 50 coins (half on repeat)
  // Daily loyalty reward
  LOYALTY: 'loyalty', // Daily loyalty ad — coins based on streak day
} as const;

// Task reward amounts (coins) — spin & scratch handled separately
export const TASK_REWARDS: Record<string, number> = {
  [TASK_TYPES.TASK_1]: 50,
  [TASK_TYPES.TASK_2]: 60,
  [TASK_TYPES.TASK_3]: 400,
  // task_4 = spin (random)
  [TASK_TYPES.TASK_5]: 50,
  [TASK_TYPES.TASK_6]: 50,
  [TASK_TYPES.TASK_7]: 50,
  // task_8 = scratch (random)
  [TASK_TYPES.TASK_9]: 80,
  [TASK_TYPES.TASK_10]: 100,
  [TASK_TYPES.TASK_11]: 150,
  [TASK_TYPES.TASK_12]: 250,
};

// Meta task rewards (first-time full coins, second-time half coins)
export const META_TASK_REWARDS: Record<string, number> = {
  [TASK_TYPES.META_1]: 25,
  [TASK_TYPES.META_2]: 30,
  [TASK_TYPES.META_3]: 35,
  [TASK_TYPES.META_4]: 40,
  [TASK_TYPES.META_5]: 50,
};

// Monthly Loyalty Reward System — one ad per day, coins based on day of month
export const LOYALTY_TIERS = [
  { dayStart: 1, dayEnd: 10, coins: 20 },   // Day 1-10: 20 coins
  { dayStart: 11, dayEnd: 20, coins: 30 },  // Day 11-20: 30 coins
  { dayStart: 21, dayEnd: 31, coins: 45 },  // Day 21-31: 45 coins
] as const;

// Task categories
export const AD_TASKS = ['task_1', 'task_2', 'task_5', 'task_6', 'task_7'] as const;
export const META_TASKS = ['meta_1', 'meta_2', 'meta_3', 'meta_4', 'meta_5'] as const;
export const INVITE_TASKS: Record<string, number> = {
  [TASK_TYPES.TASK_3]: 15,
  [TASK_TYPES.TASK_9]: 1,
  [TASK_TYPES.TASK_10]: 3,
  [TASK_TYPES.TASK_11]: 5,
  [TASK_TYPES.TASK_12]: 8,
};

// Ad providers
export const AD_PROVIDERS = ['admob', 'applovin', 'unity', 'meta', 'adcolony'] as const;

// Per-network ad cooldown (3 minutes per network, independent timers)
export const NETWORK_COOLDOWN_MS = 3 * 60 * 1000; // 3 minutes per network

// Map ad tasks to their ad network (for independent cooldowns)
// Client request: first 4 ad tasks = AdMob, rest = AppLovin/Unity
export const TASK_NETWORK_MAP: Record<string, string> = {
  [TASK_TYPES.TASK_1]: 'admob',    // Ad Watch — AdMob
  [TASK_TYPES.TASK_2]: 'admob',    // Ad Watch — AdMob
  [TASK_TYPES.TASK_5]: 'applovin', // Ad Watch — AppLovin
  [TASK_TYPES.TASK_6]: 'applovin', // Ad Watch — AppLovin
  [TASK_TYPES.TASK_7]: 'unity',    // Ad Watch — Unity
  // Meta tasks have their own 8h cycle, not per-network cooldown
  [TASK_TYPES.META_1]: 'meta',
  [TASK_TYPES.META_2]: 'meta',
  [TASK_TYPES.META_3]: 'meta',
  [TASK_TYPES.META_4]: 'meta',
  [TASK_TYPES.META_5]: 'meta',
};

// Network cooldown field names stored in user doc
export const NETWORK_COOLDOWN_FIELDS: Record<string, string> = {
  admob: 'nextAdmobAt',
  applovin: 'nextApplovinAt',
  unity: 'nextUnityAt',
  meta: 'nextMetaAt',
};

// Ad network SDK IDs
export const AD_IDS = {
  ADMOB_APP_ID: 'ca-app-pub-4867749522951713~3442061996',
  ADMOB_REWARDED_ID: 'ca-app-pub-4867749522951713/8624038237',
  UNITY_GAME_ID: '6061899',
  UNITY_REWARDED_ID: 'Rewarded_Android',
} as const;

// Referral tree max levels
export const MAX_REFERRAL_LEVELS_ADMIN = 6;
export const MAX_REFERRAL_LEVELS_USER = 3;

// Core task keys (task_1 through task_12 only — meta + loyalty tracked separately)
export const CORE_TASK_KEYS = [
  TASK_TYPES.TASK_1, TASK_TYPES.TASK_2, TASK_TYPES.TASK_3, TASK_TYPES.TASK_4,
  TASK_TYPES.TASK_5, TASK_TYPES.TASK_6, TASK_TYPES.TASK_7, TASK_TYPES.TASK_8,
  TASK_TYPES.TASK_9, TASK_TYPES.TASK_10, TASK_TYPES.TASK_11, TASK_TYPES.TASK_12,
] as const;

// Default task progress object (task_1–task_12 only, NOT meta tasks)
export function getDefaultTaskProgress(): Record<string, string> {
  const progress: Record<string, string> = {};
  for (const key of CORE_TASK_KEYS) {
    progress[key] = 'pending';
  }
  return progress;
}

// Default Meta task progress (separate cycle)
export function getDefaultMetaProgress(): Record<string, string> {
  const progress: Record<string, string> = {};
  for (const key of META_TASKS) {
    progress[key] = 'pending';
  }
  return progress;
}
