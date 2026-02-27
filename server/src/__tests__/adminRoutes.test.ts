/**
 * Tests for admin routes — RBAC enforcement (super_admin vs moderator).
 * Verifies that switchAds, unbanUser, withdrawal approve/reject require super_admin.
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

import { clearStore, seedStore } from '../__mocks__/firebaseMock';
import { verifyAuth, verifyAdmin, verifySuperAdmin } from '../middleware/authMiddleware';
import { Request, Response } from 'express';

// Helper to create mock req/res/next
function createMockReqRes(uid?: string, token?: string) {
  const req: any = {
    headers: token ? { authorization: `Bearer ${token}` } : {},
    uid: uid || undefined,
    userRecord: undefined,
    body: {},
    params: {},
    query: {},
  };
  const res: any = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
  const next = jest.fn();
  return { req, res, next };
}

beforeEach(() => {
  clearStore();
  jest.clearAllMocks();
});

describe('Auth Middleware — RBAC', () => {
  describe('verifyAdmin', () => {
    it('should allow super_admin through', async () => {
      seedStore('admins', 'admin1', { role: 'super_admin', email: 'admin@test.com' });

      const { req, res, next } = createMockReqRes('admin1');
      await verifyAdmin(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should allow moderator through', async () => {
      seedStore('admins', 'mod1', { role: 'moderator', email: 'mod@test.com' });

      const { req, res, next } = createMockReqRes('mod1');
      await verifyAdmin(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    it('should reject non-admin user', async () => {
      const { req, res, next } = createMockReqRes('regularuser');
      await verifyAdmin(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
    });

    it('should reject unauthenticated request', async () => {
      const { req, res, next } = createMockReqRes();
      await verifyAdmin(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(401);
    });
  });

  describe('verifySuperAdmin', () => {
    it('should allow super_admin through', async () => {
      seedStore('admins', 'admin1', { role: 'super_admin', email: 'admin@test.com' });

      const { req, res, next } = createMockReqRes('admin1');
      await verifySuperAdmin(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should REJECT moderator', async () => {
      seedStore('admins', 'mod1', { role: 'moderator', email: 'mod@test.com' });

      const { req, res, next } = createMockReqRes('mod1');
      await verifySuperAdmin(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.stringContaining('Super admin') })
      );
    });

    it('should reject non-admin user', async () => {
      const { req, res, next } = createMockReqRes('regularuser');
      await verifySuperAdmin(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
    });

    it('should reject unauthenticated request', async () => {
      const { req, res, next } = createMockReqRes();
      await verifySuperAdmin(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(401);
    });
  });

  describe('Route-level RBAC verification', () => {
    // These tests verify the route configuration by checking the source code patterns
    // Since we've already verified the middleware works, we test the routing declarations

    it('switchAds route should use verifySuperAdmin middleware', () => {
      // Read the route file and verify verifySuperAdmin is applied
      const fs = require('fs');
      const routeContent = fs.readFileSync(
        require('path').join(__dirname, '../../src/routes/adminRoutes.ts'),
        'utf-8'
      );

      // Verify switchAds uses verifySuperAdmin
      const switchAdsMatch = routeContent.match(/router\.post\('\/switchAds',\s*verifySuperAdmin/);
      expect(switchAdsMatch).toBeTruthy();
    });

    it('unbanUser route should use verifySuperAdmin middleware', () => {
      const fs = require('fs');
      const routeContent = fs.readFileSync(
        require('path').join(__dirname, '../../src/routes/adminRoutes.ts'),
        'utf-8'
      );

      const unbanMatch = routeContent.match(/router\.post\('\/unbanUser',\s*verifySuperAdmin/);
      expect(unbanMatch).toBeTruthy();
    });

    it('withdrawal approve route should use verifySuperAdmin middleware', () => {
      const fs = require('fs');
      const routeContent = fs.readFileSync(
        require('path').join(__dirname, '../../src/routes/withdrawalRoutes.ts'),
        'utf-8'
      );

      const approveMatch = routeContent.match(/router\.post\('\/admin\/approve',\s*verifyAuth,\s*verifySuperAdmin/);
      expect(approveMatch).toBeTruthy();
    });

    it('withdrawal reject route should use verifySuperAdmin middleware', () => {
      const fs = require('fs');
      const routeContent = fs.readFileSync(
        require('path').join(__dirname, '../../src/routes/withdrawalRoutes.ts'),
        'utf-8'
      );

      const rejectMatch = routeContent.match(/router\.post\('\/admin\/reject',\s*verifyAuth,\s*verifySuperAdmin/);
      expect(rejectMatch).toBeTruthy();
    });

    it('banUser route should NOT require super_admin (moderators can ban)', () => {
      const fs = require('fs');
      const routeContent = fs.readFileSync(
        require('path').join(__dirname, '../../src/routes/adminRoutes.ts'),
        'utf-8'
      );

      // banUser should NOT have verifySuperAdmin
      const banMatch = routeContent.match(/router\.post\('\/banUser',\s*verifySuperAdmin/);
      expect(banMatch).toBeNull();
    });
  });
});
