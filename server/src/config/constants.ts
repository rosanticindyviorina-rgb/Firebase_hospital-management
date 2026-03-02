// Task & Timer constants
export const CYCLE_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours
export const TASK_COOLDOWN_MS = 3 * 60 * 1000; // 3 minutes between tasks
export const AD_COOLDOWN_MS = 7 * 60 * 60 * 1000; // 7 hours (6-8h range, we use 7)

// Coins system
export const COINS_PER_PKR = 30; // 3000 coins = 100 PKR → 30 coins per PKR
export const DEFAULT_EXCHANGE_RATE = 3000; // coins needed per 100 PKR
export const MIN_WITHDRAWAL_COINS = 3000; // Minimum withdrawal = 100 PKR

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

// 12 Task types
export const TASK_TYPES = {
  TASK_1: 'task_1',   // Ad Watch — 50 coins
  TASK_2: 'task_2',   // Ad Watch — 60 coins
  TASK_3: 'task_3',   // Invite 15 Friends — 400 coins
  TASK_4: 'task_4',   // Spin Wheel — random
  TASK_5: 'task_5',   // Ad Watch — 50 coins
  TASK_6: 'task_6',   // Ad Watch — 50 coins
  TASK_7: 'task_7',   // Ad Watch — 50 coins
  TASK_8: 'task_8',   // Scratch Card — random
  TASK_9: 'task_9',   // Invite 1 Friend — 80 coins
  TASK_10: 'task_10', // Invite 3 Friends — 100 coins
  TASK_11: 'task_11', // Invite 5 Friends — 150 coins
  TASK_12: 'task_12', // Invite 8 Friends — 250 coins
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

// Task categories
export const AD_TASKS = ['task_1', 'task_2', 'task_5', 'task_6', 'task_7', 'task_8'] as const;
export const INVITE_TASKS: Record<string, number> = {
  [TASK_TYPES.TASK_3]: 15,
  [TASK_TYPES.TASK_9]: 1,
  [TASK_TYPES.TASK_10]: 3,
  [TASK_TYPES.TASK_11]: 5,
  [TASK_TYPES.TASK_12]: 8,
};

// Ad providers
export const AD_PROVIDERS = ['admob', 'applovin', 'unity', 'adcolony'] as const;

// Referral tree max levels
export const MAX_REFERRAL_LEVELS_ADMIN = 6;
export const MAX_REFERRAL_LEVELS_USER = 3;

// Default task progress object (all 12 tasks pending)
export function getDefaultTaskProgress(): Record<string, string> {
  const progress: Record<string, string> = {};
  for (const key of Object.values(TASK_TYPES)) {
    progress[key] = 'pending';
  }
  return progress;
}
