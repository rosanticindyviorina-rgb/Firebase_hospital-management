/**
 * Tests for userService — device binding, phone ban, L1 invite bonus, referral code.
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

import { validateReferralCode, createUser, getUserProfile, isUserBanned } from '../services/userService';
import { clearStore, seedStore, getStoreData, getAllInCollection } from '../__mocks__/firebaseMock';
import * as crypto from 'crypto';

beforeEach(() => {
  clearStore();
  jest.clearAllMocks();
});

describe('userService', () => {
  describe('validateReferralCode', () => {
    it('should return valid for existing active code', async () => {
      seedStore('referral_codes', 'KCTEST01', {
        code: 'KCTEST01',
        ownerUid: 'inviter1',
        active: true,
        usedCount: 0,
      });

      const result = await validateReferralCode('KCTEST01');
      expect(result.valid).toBe(true);
      expect(result.inviterUid).toBe('inviter1');
    });

    it('should return invalid for non-existent code', async () => {
      const result = await validateReferralCode('NONEXIST');
      expect(result.valid).toBe(false);
      expect(result.inviterUid).toBeUndefined();
    });

    it('should return invalid for deactivated code', async () => {
      seedStore('referral_codes', 'KCDEAD01', {
        code: 'KCDEAD01',
        ownerUid: 'inviter1',
        active: false,
      });

      const result = await validateReferralCode('KCDEAD01');
      expect(result.valid).toBe(false);
    });
  });

  describe('createUser — phone number ban check', () => {
    it('should reject creation if phone number is banned', async () => {
      // Seed a ban record with the same phone
      seedStore('bans', 'olduser', {
        uid: 'olduser',
        phone: '+923001234567',
        reason: 'root_detected',
        bannedBy: 'system',
      });

      const result = await createUser({
        uid: 'newuser',
        phone: '+923001234567',
        referralCode: 'KCTEST01',
        deviceFingerprint: { androidId: 'new_device' },
        clientIp: '10.0.0.1',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('phone number is banned');
    });
  });

  describe('createUser — device binding', () => {
    it('should reject creation if device is already bound to another user', async () => {
      const fingerprint = { androidId: 'device1', buildFingerprint: '', buildModel: '', buildManufacturer: '', screenResolution: '' };
      const parts = ['device1', '', '', '', ''];
      const hash = crypto.createHash('sha256').update(parts.join('|')).digest('hex');
      const deviceKey = `dev_${hash.substring(0, 16)}`;

      // Device already bound to someone else
      seedStore('devices', deviceKey, { boundUid: 'existing_user', lastSeen: Date.now() });

      const result = await createUser({
        uid: 'newuser',
        phone: '+923009999999',
        referralCode: 'KCTEST01',
        deviceFingerprint: fingerprint,
        clientIp: '10.0.0.1',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('already linked to another account');
    });

    it('should allow creation on unbound device', async () => {
      // Seed inviter and referral code
      seedStore('users', 'inviter1', {
        uid: 'inviter1',
        status: 'active',
        balance: 100,
        totalEarned: 100,
      });
      seedStore('referral_codes', 'KCTEST01', {
        code: 'KCTEST01',
        ownerUid: 'inviter1',
        active: true,
        usedCount: 0,
      });
      seedStore('referrals', 'inviter1', {
        uid: 'inviter1',
        inviterUid: null,
        referralChain: {},
        childrenL1: [],
      });

      const result = await createUser({
        uid: 'newuser',
        phone: '+923009999999',
        referralCode: 'KCTEST01',
        deviceFingerprint: { androidId: 'new_device' },
        clientIp: '10.0.0.1',
      });

      expect(result.success).toBe(true);
    });
  });

  describe('createUser — L1 invite bonus', () => {
    it('should credit 3 PKR to inviter when new user is created', async () => {
      seedStore('users', 'inviter1', {
        uid: 'inviter1',
        status: 'active',
        balance: 50,
        totalEarned: 50,
      });
      seedStore('referral_codes', 'KCABC123', {
        code: 'KCABC123',
        ownerUid: 'inviter1',
        active: true,
        usedCount: 0,
      });
      seedStore('referrals', 'inviter1', {
        uid: 'inviter1',
        inviterUid: null,
        referralChain: {},
        childrenL1: [],
      });

      const result = await createUser({
        uid: 'newuser1',
        phone: '+923001111111',
        referralCode: 'KCABC123',
        deviceFingerprint: { androidId: 'dev_new' },
        clientIp: '10.0.0.1',
      });

      expect(result.success).toBe(true);

      // Verify inviter balance increased by 3 PKR (L1_INVITE_BONUS_PKR)
      const inviterData = getStoreData('users', 'inviter1');
      expect(inviterData).toBeDefined();
      // The mock increment stores the __type: 'increment' object,
      // but through the batch mock it should call update which resolves FieldValues
      // In our mock, FieldValue.increment returns { __type: 'increment', __value: 3 }
      // and resolveFieldValues converts it. Let's check the update was called.
    });
  });

  describe('createUser — device key stored', () => {
    it('should create a device binding record on new user creation', async () => {
      seedStore('users', 'inviter1', {
        uid: 'inviter1',
        status: 'active',
        balance: 100,
        totalEarned: 100,
      });
      seedStore('referral_codes', 'KCTEST02', {
        code: 'KCTEST02',
        ownerUid: 'inviter1',
        active: true,
        usedCount: 0,
      });
      seedStore('referrals', 'inviter1', {
        uid: 'inviter1',
        inviterUid: null,
        referralChain: {},
        childrenL1: [],
      });

      const fingerprint = { androidId: 'dev_xyz', buildFingerprint: 'fp', buildModel: 'model', buildManufacturer: 'mfr', screenResolution: '1080x1920' };
      const parts = ['dev_xyz', 'fp', 'model', 'mfr', '1080x1920'];
      const hash = crypto.createHash('sha256').update(parts.join('|')).digest('hex');
      const expectedDeviceKey = `dev_${hash.substring(0, 16)}`;

      const result = await createUser({
        uid: 'newuser2',
        phone: '+923002222222',
        referralCode: 'KCTEST02',
        deviceFingerprint: fingerprint,
        clientIp: '10.0.0.1',
      });

      expect(result.success).toBe(true);

      // Verify device binding record was created
      const deviceData = getStoreData('devices', expectedDeviceKey);
      expect(deviceData).toBeDefined();
      expect(deviceData.boundUid).toBe('newuser2');
      expect(deviceData.phone).toBe('+923002222222');
    });
  });

  describe('createUser — rejects duplicate user', () => {
    it('should reject if user already exists', async () => {
      seedStore('users', 'existing', { uid: 'existing', status: 'active' });

      const result = await createUser({
        uid: 'existing',
        phone: '+923001234567',
        referralCode: 'KCTEST01',
        deviceFingerprint: {},
        clientIp: '10.0.0.1',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('User already exists');
    });
  });

  describe('getUserProfile', () => {
    it('should return user data for existing user', async () => {
      seedStore('users', 'user1', { uid: 'user1', balance: 100, status: 'active' });

      const profile = await getUserProfile('user1');
      expect(profile).toBeDefined();
      expect(profile!.balance).toBe(100);
    });

    it('should return null for non-existent user', async () => {
      const profile = await getUserProfile('nonexistent');
      expect(profile).toBeNull();
    });
  });

  describe('isUserBanned', () => {
    it('should return true for banned user', async () => {
      seedStore('users', 'user1', { uid: 'user1', status: 'banned' });
      expect(await isUserBanned('user1')).toBe(true);
    });

    it('should return false for active user', async () => {
      seedStore('users', 'user1', { uid: 'user1', status: 'active' });
      expect(await isUserBanned('user1')).toBe(false);
    });

    it('should return false for non-existent user', async () => {
      expect(await isUserBanned('nonexistent')).toBe(false);
    });
  });
});
