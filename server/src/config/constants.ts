// Task & Timer constants
export const CYCLE_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours
export const TASK_COOLDOWN_MS = 3 * 60 * 1000; // 3 minutes
export const INVITE_CHALLENGE_TARGET = 15; // Verified friends needed for Task 3

// Referral commission rates
export const REFERRAL_COMMISSION = {
  L1: 0.10, // 10%
  L2: 0.05, // 5%
  L3: 0.02, // 2%
} as const;

// Referral bonus: PKR per verified L1 invite
export const L1_INVITE_BONUS_PKR = 3;

// Spin wheel weights
export const SPIN_WEIGHTS = [
  { prize: 15, label: '15 PKR', weight: 40 },
  { prize: 0, label: 'Try Again', weight: 35 },
  { prize: 25, label: '25 PKR', weight: 12 },
  { prize: 50, label: '50 PKR', weight: 8 },
  { prize: 100, label: '100 PKR', weight: 4 },
  { prize: 199, label: '199 PKR', weight: 1 },
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

// Task types
export const TASK_TYPES = {
  TASK_1: 'task_1', // Watch ad
  TASK_2: 'task_2', // Watch ad (second)
  TASK_3: 'task_3', // Invite challenge (15 friends)
  TASK_4: 'task_4', // Spin wheel
} as const;

// Ad providers
export const AD_PROVIDERS = ['admob', 'applovin', 'unity', 'adcolony'] as const;

// Referral tree max levels
export const MAX_REFERRAL_LEVELS_ADMIN = 6;
export const MAX_REFERRAL_LEVELS_USER = 3;
