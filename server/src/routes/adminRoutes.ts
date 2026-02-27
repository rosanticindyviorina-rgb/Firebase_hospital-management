import { Router, Response } from 'express';
import { AuthenticatedRequest, verifyAuth, verifyAdmin, verifySuperAdmin } from '../middleware/authMiddleware';
import {
  switchAdProvider,
  adminBanUser,
  adminUnbanUser,
  getAdminUserDetail,
  getFraudLogs,
  getAdminActionLogs,
  getDashboardKPIs,
  getAppConfig,
} from '../services/adminService';
import { searchUsers } from '../services/userService';
import { BAN_REASONS } from '../config/constants';

const router = Router();

// All admin routes require auth + admin role
router.use(verifyAuth);
router.use(verifyAdmin);

/**
 * POST /admin/switchAds
 * Toggles the active ad provider. Requires super_admin.
 */
router.post('/switchAds', verifySuperAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { provider } = req.body;

    if (!provider) {
      res.status(400).json({ error: 'provider is required' });
      return;
    }

    const result = await switchAdProvider(provider, req.uid!);

    if (!result.success) {
      res.status(400).json({ error: result.error });
      return;
    }

    res.json({ success: true, provider });
  } catch (error) {
    console.error('Switch ads error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /admin/banUser
 * Bans a user with reason and audit trail.
 */
router.post('/banUser', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { targetUid, reason } = req.body;

    if (!targetUid || !reason) {
      res.status(400).json({ error: 'targetUid and reason are required' });
      return;
    }

    await adminBanUser(targetUid, reason, req.uid!);
    res.json({ success: true });
  } catch (error) {
    console.error('Admin ban error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /admin/unbanUser
 * Unbans a user. Requires super_admin.
 */
router.post('/unbanUser', verifySuperAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { targetUid } = req.body;

    if (!targetUid) {
      res.status(400).json({ error: 'targetUid is required' });
      return;
    }

    await adminUnbanUser(targetUid, req.uid!);
    res.json({ success: true });
  } catch (error) {
    console.error('Admin unban error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /admin/userDetail/:uid
 * Gets detailed user info including referrals, bans, and ledger.
 */
router.get('/userDetail/:uid', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { uid } = req.params;
    const detail = await getAdminUserDetail(uid);

    if (!detail.user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    res.json(detail);
  } catch (error) {
    console.error('User detail error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /admin/searchUsers
 * Search users by phone, uid, or referralCode.
 */
router.get('/searchUsers', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { query, field } = req.query;

    if (!query || !field) {
      res.status(400).json({ error: 'query and field are required' });
      return;
    }

    const validFields = ['phone', 'uid', 'referralCode'];
    if (!validFields.includes(field as string)) {
      res.status(400).json({ error: `field must be one of: ${validFields.join(', ')}` });
      return;
    }

    const results = await searchUsers(query as string, field as 'phone' | 'uid' | 'referralCode');
    res.json({ users: results });
  } catch (error) {
    console.error('Search users error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /admin/fraudLogs
 * Gets recent ban/fraud logs.
 */
router.get('/fraudLogs', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    const result = await getFraudLogs(limit);
    res.json({ logs: result.logs });
  } catch (error) {
    console.error('Fraud logs error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /admin/auditLogs
 * Gets admin action audit trail.
 */
router.get('/auditLogs', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    const logs = await getAdminActionLogs(limit);
    res.json({ logs });
  } catch (error) {
    console.error('Audit logs error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /admin/dashboard
 * Gets dashboard KPIs.
 */
router.get('/dashboard', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const kpis = await getDashboardKPIs();
    res.json(kpis);
  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /admin/config
 * Gets current app configuration.
 */
router.get('/config', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const config = await getAppConfig();
    res.json(config);
  } catch (error) {
    console.error('Config error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
