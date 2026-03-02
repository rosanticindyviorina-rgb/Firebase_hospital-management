/**
 * Tests for business logic constants — verifies they match the dev plan spec.
 */

import {
  CYCLE_DURATION_MS,
  TASK_COOLDOWN_MS,
  INVITE_CHALLENGE_TARGET,
  REFERRAL_COMMISSION,
  L1_INVITE_BONUS_COINS,
  SPIN_WEIGHTS,
  USER_STATUS,
  BAN_REASONS,
  TASK_TYPES,
  AD_PROVIDERS,
} from '../config/constants';

describe('Business constants match dev plan spec', () => {
  it('cycle duration should be 24 hours', () => {
    expect(CYCLE_DURATION_MS).toBe(24 * 60 * 60 * 1000);
  });

  it('task cooldown should be 3 minutes', () => {
    expect(TASK_COOLDOWN_MS).toBe(3 * 60 * 1000);
  });

  it('invite challenge target should be 15 friends', () => {
    expect(INVITE_CHALLENGE_TARGET).toBe(15);
  });

  it('referral commission rates should be L1=10%, L2=5%, L3=2%', () => {
    expect(REFERRAL_COMMISSION.L1).toBe(0.10);
    expect(REFERRAL_COMMISSION.L2).toBe(0.05);
    expect(REFERRAL_COMMISSION.L3).toBe(0.02);
  });

  it('L1 invite bonus should be 150 coins', () => {
    expect(L1_INVITE_BONUS_COINS).toBe(150);
  });

  it('spin weights should sum to 100%', () => {
    const totalWeight = SPIN_WEIGHTS.reduce((sum, w) => sum + w.weight, 0);
    expect(totalWeight).toBe(100);
  });

  it('spin weights should match spec: 30=40%, TryAgain=25%, 50=20%, 100=10%, 199=5%', () => {
    const weightMap = Object.fromEntries(SPIN_WEIGHTS.map(w => [w.prize, w.weight]));
    expect(weightMap[30]).toBe(40);
    expect(weightMap[0]).toBe(25);  // Try Again
    expect(weightMap[50]).toBe(20);
    expect(weightMap[100]).toBe(10);
    expect(weightMap[199]).toBe(5);
  });

  it('should have 12 task types', () => {
    expect(Object.keys(TASK_TYPES)).toHaveLength(12);
    expect(TASK_TYPES.TASK_1).toBe('task_1');
    expect(TASK_TYPES.TASK_2).toBe('task_2');
    expect(TASK_TYPES.TASK_3).toBe('task_3');
    expect(TASK_TYPES.TASK_4).toBe('task_4');
    expect(TASK_TYPES.TASK_5).toBe('task_5');
    expect(TASK_TYPES.TASK_6).toBe('task_6');
    expect(TASK_TYPES.TASK_7).toBe('task_7');
    expect(TASK_TYPES.TASK_8).toBe('task_8');
    expect(TASK_TYPES.TASK_9).toBe('task_9');
    expect(TASK_TYPES.TASK_10).toBe('task_10');
    expect(TASK_TYPES.TASK_11).toBe('task_11');
    expect(TASK_TYPES.TASK_12).toBe('task_12');
  });

  it('should have 4 ad providers: admob, applovin, unity, adcolony', () => {
    expect(AD_PROVIDERS).toEqual(['admob', 'applovin', 'unity', 'adcolony']);
  });

  it('should have correct user statuses', () => {
    expect(USER_STATUS.ACTIVE).toBe('active');
    expect(USER_STATUS.BANNED).toBe('banned');
    expect(USER_STATUS.PENDING).toBe('pending');
  });

  it('should have all required ban reasons', () => {
    expect(BAN_REASONS.ROOT_DETECTED).toBeDefined();
    expect(BAN_REASONS.EMULATOR_DETECTED).toBeDefined();
    expect(BAN_REASONS.VPN_DETECTED).toBeDefined();
    expect(BAN_REASONS.CLONE_DETECTED).toBeDefined();
    expect(BAN_REASONS.PARALLEL_SPACE).toBeDefined();
    expect(BAN_REASONS.HOOKING_DETECTED).toBeDefined();
    expect(BAN_REASONS.INTEGRITY_FAILED).toBeDefined();
    expect(BAN_REASONS.MULTI_ACCOUNT).toBeDefined();
    expect(BAN_REASONS.ADMIN_BAN).toBeDefined();
    expect(BAN_REASONS.SUSPICIOUS_BEHAVIOR).toBeDefined();
  });
});
