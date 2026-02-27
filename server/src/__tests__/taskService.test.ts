/**
 * Tests for taskService — cooldown, cycle timer, task claiming, referral commissions.
 */

jest.mock('../config/firebase', () => {
  const mock = require('../__mocks__/firebaseMock');
  return {
    db: mock.mockDb,
    Collections: mock.MockCollections,
    firebaseAdmin: mock.mockFirebaseAdmin,
    auth: mock.mockAuth,
  };
});

import { claimTask, getTaskStatus } from '../services/taskService';
import { clearStore, seedStore, getStoreData } from '../__mocks__/firebaseMock';

beforeEach(() => {
  clearStore();
  jest.clearAllMocks();
});

describe('taskService', () => {
  describe('claimTask', () => {
    it('should reject if user not found', async () => {
      const result = await claimTask('nonexistent', 'task_1');
      expect(result.success).toBe(false);
      expect(result.error).toBe('User not found');
    });

    it('should reject if user is banned', async () => {
      seedStore('users', 'user1', { uid: 'user1', status: 'banned' });

      const result = await claimTask('user1', 'task_1');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Account is not active');
    });

    it('should reject if cycle not ready (24h timer)', async () => {
      const futureTime = Date.now() + 10 * 60 * 60 * 1000; // 10 hours from now
      seedStore('users', 'user1', {
        uid: 'user1',
        status: 'active',
        nextCycleAt: { toMillis: () => futureTime },
        nextTaskAt: null,
        taskProgress: { task_1: 'pending', task_2: 'pending', task_3: 'pending', task_4: 'pending' },
      });

      const result = await claimTask('user1', 'task_1');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Task cycle not ready yet');
    });

    it('should reject if 3-minute cooldown is active', async () => {
      const futureTask = Date.now() + 2 * 60 * 1000; // 2 minutes from now
      seedStore('users', 'user1', {
        uid: 'user1',
        status: 'active',
        nextCycleAt: { toMillis: () => 0 },
        nextTaskAt: { toMillis: () => futureTask },
        taskProgress: { task_1: 'pending', task_2: 'pending', task_3: 'pending', task_4: 'pending' },
      });

      const result = await claimTask('user1', 'task_1');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Task cooldown active');
      expect(result.nextTaskAt).toBe(futureTask);
    });

    it('should reject already completed task', async () => {
      seedStore('users', 'user1', {
        uid: 'user1',
        status: 'active',
        nextCycleAt: { toMillis: () => 0 },
        nextTaskAt: { toMillis: () => 0 },
        taskProgress: { task_1: 'completed', task_2: 'pending', task_3: 'pending', task_4: 'pending' },
      });

      const result = await claimTask('user1', 'task_1');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Task already completed in this cycle');
    });

    it('should reject task_3 if not enough verified invites', async () => {
      seedStore('users', 'user1', {
        uid: 'user1',
        status: 'active',
        balance: 0,
        totalEarned: 0,
        nextCycleAt: { toMillis: () => 0 },
        nextTaskAt: { toMillis: () => 0 },
        taskProgress: { task_1: 'completed', task_2: 'completed', task_3: 'pending', task_4: 'pending' },
      });
      seedStore('referrals', 'user1', {
        uid: 'user1',
        verifiedInvitesL1: 5, // Only 5, need 15
        childrenL1: [],
      });

      const result = await claimTask('user1', 'task_3');
      expect(result.success).toBe(false);
      expect(result.error).toContain('Need 15 verified invites');
      expect(result.error).toContain('Current: 5');
    });

    it('should redirect task_4 to spin endpoint', async () => {
      seedStore('users', 'user1', {
        uid: 'user1',
        status: 'active',
        nextCycleAt: { toMillis: () => 0 },
        nextTaskAt: { toMillis: () => 0 },
        taskProgress: { task_1: 'pending', task_2: 'pending', task_3: 'pending', task_4: 'pending' },
      });

      const result = await claimTask('user1', 'task_4');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Use spin endpoint for Task 4');
    });

    it('should successfully claim task_1 and return 20 PKR reward', async () => {
      seedStore('users', 'user1', {
        uid: 'user1',
        status: 'active',
        balance: 100,
        totalEarned: 100,
        nextCycleAt: { toMillis: () => 0 },
        nextTaskAt: { toMillis: () => 0 },
        taskProgress: { task_1: 'pending', task_2: 'pending', task_3: 'pending', task_4: 'pending' },
      });

      const result = await claimTask('user1', 'task_1');
      expect(result.success).toBe(true);
      expect(result.reward).toBe(20);
      expect(result.nextTaskAt).toBeGreaterThan(Date.now());
    });

    it('should successfully claim task_2 with 20 PKR reward', async () => {
      seedStore('users', 'user1', {
        uid: 'user1',
        status: 'active',
        balance: 120,
        totalEarned: 120,
        nextCycleAt: { toMillis: () => 0 },
        nextTaskAt: { toMillis: () => 0 },
        taskProgress: { task_1: 'completed', task_2: 'pending', task_3: 'pending', task_4: 'pending' },
      });

      const result = await claimTask('user1', 'task_2');
      expect(result.success).toBe(true);
      expect(result.reward).toBe(20);
    });

    it('should claim task_3 (invite challenge) with 50 PKR when 15 invites verified', async () => {
      seedStore('users', 'user1', {
        uid: 'user1',
        status: 'active',
        balance: 0,
        totalEarned: 0,
        nextCycleAt: { toMillis: () => 0 },
        nextTaskAt: { toMillis: () => 0 },
        taskProgress: { task_1: 'completed', task_2: 'completed', task_3: 'pending', task_4: 'pending' },
      });
      seedStore('referrals', 'user1', {
        uid: 'user1',
        verifiedInvitesL1: 15, // Exactly 15, should pass
        referralChain: {},
        childrenL1: [],
      });

      const result = await claimTask('user1', 'task_3');
      expect(result.success).toBe(true);
      expect(result.reward).toBe(50);
    });

    it('should set next cooldown 3 minutes from now after claiming', async () => {
      seedStore('users', 'user1', {
        uid: 'user1',
        status: 'active',
        balance: 0,
        totalEarned: 0,
        nextCycleAt: { toMillis: () => 0 },
        nextTaskAt: { toMillis: () => 0 },
        taskProgress: { task_1: 'pending', task_2: 'pending', task_3: 'pending', task_4: 'pending' },
      });

      const before = Date.now();
      const result = await claimTask('user1', 'task_1');
      const after = Date.now();

      expect(result.success).toBe(true);
      // nextTaskAt should be ~3 minutes (180000ms) from now
      const cooldown = 3 * 60 * 1000;
      expect(result.nextTaskAt).toBeGreaterThanOrEqual(before + cooldown);
      expect(result.nextTaskAt).toBeLessThanOrEqual(after + cooldown);
    });
  });

  describe('getTaskStatus', () => {
    it('should throw for non-existent user', async () => {
      await expect(getTaskStatus('nonexistent')).rejects.toThrow('User not found');
    });

    it('should return task status with cycle and cooldown readiness', async () => {
      const pastTime = Date.now() - 1000;
      seedStore('users', 'user1', {
        uid: 'user1',
        status: 'active',
        nextCycleAt: { toMillis: () => pastTime },
        nextTaskAt: { toMillis: () => pastTime },
        taskProgress: { task_1: 'pending', task_2: 'completed', task_3: 'pending', task_4: 'pending' },
      });

      const status = await getTaskStatus('user1');
      expect(status.cycleReady).toBe(true);
      expect(status.cooldownReady).toBe(true);
      expect(status.taskProgress.task_1).toBe('pending');
      expect(status.taskProgress.task_2).toBe('completed');
    });

    it('should show cycle not ready when timer is in future', async () => {
      const futureTime = Date.now() + 1000000;
      seedStore('users', 'user1', {
        uid: 'user1',
        status: 'active',
        nextCycleAt: { toMillis: () => futureTime },
        nextTaskAt: { toMillis: () => 0 },
        taskProgress: {},
      });

      const status = await getTaskStatus('user1');
      expect(status.cycleReady).toBe(false);
      expect(status.nextCycleAt).toBe(futureTime);
    });
  });
});
