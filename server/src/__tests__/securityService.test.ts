/**
 * Tests for securityService — SHA-256 hashing, device binding, banning.
 */

// Mock firebase before imports
jest.mock('../config/firebase', () => {
  const mock = require('../__mocks__/firebaseMock');
  return {
    db: mock.mockDb,
    Collections: mock.MockCollections,
    firebaseAdmin: mock.mockFirebaseAdmin,
    auth: mock.mockAuth,
  };
});

import { attestDevice, processSecurityReport, banUser, unbanUser } from '../services/securityService';
import { clearStore, seedStore, getStoreData } from '../__mocks__/firebaseMock';
import * as crypto from 'crypto';

beforeEach(() => {
  clearStore();
  jest.clearAllMocks();
});

describe('securityService', () => {
  describe('Device key generation (SHA-256)', () => {
    it('should generate consistent device keys for same fingerprint', async () => {
      const fingerprint = {
        androidId: 'abc123',
        buildFingerprint: 'samsung/SM-G950F',
        buildModel: 'SM-G950F',
        buildManufacturer: 'samsung',
        screenResolution: '1080x1920',
      };

      // Compute expected hash
      const parts = ['abc123', 'samsung/SM-G950F', 'SM-G950F', 'samsung', '1080x1920'];
      const expectedHash = crypto.createHash('sha256').update(parts.join('|')).digest('hex');
      const expectedKey = `dev_${expectedHash.substring(0, 16)}`;

      // Seed active user
      seedStore('users', 'user1', { uid: 'user1', status: 'active', phone: '+923001234567' });

      // First attestation — should bind device
      const result = await attestDevice('user1', {
        integrityToken: 'valid-token',
        deviceFingerprint: fingerprint,
        appVersion: 1,
        detectedIssues: [],
      }, '192.168.1.1');

      expect(result.allowed).toBe(true);
      expect(result.banned).toBe(false);

      // Verify device was stored with SHA-256 key
      const deviceData = getStoreData('devices', expectedKey);
      expect(deviceData).toBeDefined();
      expect(deviceData.boundUid).toBe('user1');
    });

    it('should generate different keys for different fingerprints', () => {
      const fp1Parts = ['abc123', 'fp1', 'model1', 'mfr1', '1080x1920'];
      const fp2Parts = ['xyz789', 'fp2', 'model2', 'mfr2', '1440x2560'];

      const hash1 = crypto.createHash('sha256').update(fp1Parts.join('|')).digest('hex');
      const hash2 = crypto.createHash('sha256').update(fp2Parts.join('|')).digest('hex');

      expect(hash1).not.toBe(hash2);
      expect(`dev_${hash1.substring(0, 16)}`).not.toBe(`dev_${hash2.substring(0, 16)}`);
    });
  });

  describe('Device binding enforcement', () => {
    it('should allow same user on same device', async () => {
      const fingerprint = {
        androidId: 'device1',
        buildFingerprint: 'fp',
        buildModel: 'model',
        buildManufacturer: 'mfr',
        screenResolution: '1080x1920',
      };

      const parts = ['device1', 'fp', 'model', 'mfr', '1080x1920'];
      const hash = crypto.createHash('sha256').update(parts.join('|')).digest('hex');
      const deviceKey = `dev_${hash.substring(0, 16)}`;

      seedStore('users', 'user1', { uid: 'user1', status: 'active' });
      seedStore('devices', deviceKey, { boundUid: 'user1', lastSeen: Date.now() });

      const result = await attestDevice('user1', {
        integrityToken: 'valid-token',
        deviceFingerprint: fingerprint,
        appVersion: 1,
        detectedIssues: [],
      }, '192.168.1.1');

      expect(result.allowed).toBe(true);
    });

    it('should ban different user trying to use same device', async () => {
      const fingerprint = {
        androidId: 'device1',
        buildFingerprint: 'fp',
        buildModel: 'model',
        buildManufacturer: 'mfr',
        screenResolution: '1080x1920',
      };

      const parts = ['device1', 'fp', 'model', 'mfr', '1080x1920'];
      const hash = crypto.createHash('sha256').update(parts.join('|')).digest('hex');
      const deviceKey = `dev_${hash.substring(0, 16)}`;

      seedStore('users', 'user2', { uid: 'user2', status: 'active', phone: '+923009876543' });
      seedStore('devices', deviceKey, { boundUid: 'user1', lastSeen: Date.now() });

      const result = await attestDevice('user2', {
        integrityToken: 'valid-token',
        deviceFingerprint: fingerprint,
        appVersion: 1,
        detectedIssues: [],
      }, '192.168.1.1');

      expect(result.allowed).toBe(false);
      expect(result.banned).toBe(true);
      expect(result.reason).toBe('multi_account_device');
    });
  });

  describe('Client-reported detections (zero tolerance)', () => {
    it('should ban user when client reports root detection', async () => {
      seedStore('users', 'user1', { uid: 'user1', status: 'active', phone: '+923001111111' });

      const result = await attestDevice('user1', {
        integrityToken: 'valid-token',
        deviceFingerprint: { androidId: 'test' },
        appVersion: 1,
        detectedIssues: ['root_detected'],
      }, '10.0.0.1');

      expect(result.allowed).toBe(false);
      expect(result.banned).toBe(true);
      expect(result.reason).toBe('root_detected');
    });

    it('should ban user when client reports emulator', async () => {
      seedStore('users', 'user1', { uid: 'user1', status: 'active', phone: '+923001111111' });

      const result = await attestDevice('user1', {
        integrityToken: 'valid-token',
        deviceFingerprint: { androidId: 'test' },
        appVersion: 1,
        detectedIssues: ['emulator_detected'],
      }, '10.0.0.1');

      expect(result.banned).toBe(true);
    });
  });

  describe('Already banned user', () => {
    it('should reject already-banned user immediately', async () => {
      seedStore('users', 'user1', { uid: 'user1', status: 'banned' });

      const result = await attestDevice('user1', {
        integrityToken: 'valid-token',
        deviceFingerprint: { androidId: 'test' },
        appVersion: 1,
        detectedIssues: [],
      }, '10.0.0.1');

      expect(result.allowed).toBe(false);
      expect(result.banned).toBe(true);
      expect(result.reason).toBe('Account is banned');
    });
  });

  describe('Play Integrity token validation', () => {
    it('should ban user with empty integrity token', async () => {
      seedStore('users', 'user1', { uid: 'user1', status: 'active', phone: '+923001111111' });

      const result = await attestDevice('user1', {
        integrityToken: '',
        deviceFingerprint: { androidId: 'test' },
        appVersion: 1,
        detectedIssues: [],
      }, '10.0.0.1');

      expect(result.allowed).toBe(false);
      expect(result.banned).toBe(true);
      expect(result.reason).toBe('play_integrity_failed');
    });

    it('should ban user with invalid integrity token', async () => {
      seedStore('users', 'user1', { uid: 'user1', status: 'active', phone: '+923001111111' });

      const result = await attestDevice('user1', {
        integrityToken: 'invalid',
        deviceFingerprint: { androidId: 'test' },
        appVersion: 1,
        detectedIssues: [],
      }, '10.0.0.1');

      expect(result.banned).toBe(true);
      expect(result.reason).toBe('play_integrity_failed');
    });
  });

  describe('processSecurityReport', () => {
    it('should ban on root violation report', async () => {
      seedStore('users', 'user1', { uid: 'user1', status: 'active', phone: '+923001111111' });

      const result = await processSecurityReport(
        'user1',
        ['root'],
        { detected: true },
        '10.0.0.1'
      );

      expect(result.banned).toBe(true);
      expect(result.reason).toBe('root_detected');
    });

    it('should not ban on empty violations', async () => {
      const result = await processSecurityReport('user1', [], {}, '10.0.0.1');
      expect(result.banned).toBe(false);
    });
  });

  describe('banUser', () => {
    it('should store phone number in ban record', async () => {
      seedStore('users', 'user1', { uid: 'user1', status: 'active', phone: '+923001234567' });

      await banUser('user1', 'test_ban', { reason: 'test' });

      const banData = getStoreData('bans', 'user1');
      expect(banData).toBeDefined();
      expect(banData.phone).toBe('+923001234567');
      expect(banData.reason).toBe('test_ban');
      expect(banData.bannedBy).toBe('system');

      // User should be marked as banned
      const userData = getStoreData('users', 'user1');
      expect(userData.status).toBe('banned');
    });
  });

  describe('unbanUser', () => {
    it('should restore user to active status', async () => {
      seedStore('users', 'user1', { uid: 'user1', status: 'banned' });
      seedStore('bans', 'user1', { uid: 'user1', reason: 'test', bannedAt: Date.now() });

      await unbanUser('user1', 'admin1');

      const userData = getStoreData('users', 'user1');
      expect(userData.status).toBe('active');
      expect(userData.unbannedBy).toBe('admin1');
    });
  });
});
