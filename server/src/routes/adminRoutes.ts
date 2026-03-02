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
  updateAppConfig,
} from '../services/adminService';
import { searchUsers } from '../services/userService';
import { createRedeemCode, getRedeemCodes, deactivateRedeemCode } from '../services/redeemService';

const router = Router();

router.use(verifyAuth);
router.use(verifyAdmin);

// Switch ad provider (super_admin)
router.post('/switchAds', verifySuperAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { provider } = req.body;
    if (!provider) { res.status(400).json({ error: 'provider is required' }); return; }
    const result = await switchAdProvider(provider, req.uid!);
    if (!result.success) { res.status(400).json({ error: result.error }); return; }
    res.json({ success: true, provider });
  } catch (error) {
    console.error('Switch ads error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update app config (super_admin) — exchange rate, task rewards, ad limits, etc.
router.post('/config', verifySuperAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const updates = req.body;
    if (!updates || Object.keys(updates).length === 0) {
      res.status(400).json({ error: 'No updates provided' });
      return;
    }
    const result = await updateAppConfig(updates, req.uid!);
    res.json(result);
  } catch (error) {
    console.error('Config update error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Ban user
router.post('/banUser', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { targetUid, reason } = req.body;
    if (!targetUid || !reason) { res.status(400).json({ error: 'targetUid and reason are required' }); return; }
    await adminBanUser(targetUid, reason, req.uid!);
    res.json({ success: true });
  } catch (error) {
    console.error('Admin ban error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Unban user (super_admin)
router.post('/unbanUser', verifySuperAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { targetUid } = req.body;
    if (!targetUid) { res.status(400).json({ error: 'targetUid is required' }); return; }
    await adminUnbanUser(targetUid, req.uid!);
    res.json({ success: true });
  } catch (error) {
    console.error('Admin unban error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// User detail
router.get('/userDetail/:uid', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const detail = await getAdminUserDetail(req.params.uid);
    if (!detail.user) { res.status(404).json({ error: 'User not found' }); return; }
    res.json(detail);
  } catch (error) {
    console.error('User detail error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Search users
router.get('/searchUsers', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { query, field } = req.query;
    if (!query || !field) { res.status(400).json({ error: 'query and field are required' }); return; }
    const validFields = ['phone', 'uid', 'referralCode'];
    if (!validFields.includes(field as string)) { res.status(400).json({ error: `field must be one of: ${validFields.join(', ')}` }); return; }
    const results = await searchUsers(query as string, field as 'phone' | 'uid' | 'referralCode');
    res.json({ users: results });
  } catch (error) {
    console.error('Search users error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Fraud logs
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

// Audit logs
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

// Dashboard KPIs
router.get('/dashboard', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const kpis = await getDashboardKPIs();
    res.json(kpis);
  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get app config
router.get('/config', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const config = await getAppConfig();
    res.json(config);
  } catch (error) {
    console.error('Config error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create redeem code (super_admin)
router.post('/redeemCodes', verifySuperAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { totalCoins, maxClaims, expiresAt } = req.body;
    if (!totalCoins || !maxClaims) {
      res.status(400).json({ error: 'totalCoins and maxClaims are required' });
      return;
    }
    const result = await createRedeemCode({
      adminUid: req.uid!,
      totalCoins,
      maxClaims,
      expiresAt: expiresAt ? new Date(expiresAt) : undefined,
    });
    res.json(result);
  } catch (error) {
    console.error('Create redeem code error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// List redeem codes
router.get('/redeemCodes', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    const codes = await getRedeemCodes(limit);
    res.json({ codes });
  } catch (error) {
    console.error('List redeem codes error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Deactivate redeem code (super_admin)
router.post('/redeemCodes/deactivate', verifySuperAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { code } = req.body;
    if (!code) { res.status(400).json({ error: 'code is required' }); return; }
    await deactivateRedeemCode(code, req.uid!);
    res.json({ success: true });
  } catch (error) {
    console.error('Deactivate redeem code error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
