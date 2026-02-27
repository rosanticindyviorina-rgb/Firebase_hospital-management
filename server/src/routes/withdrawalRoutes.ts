import { Router } from 'express';
import { verifyAuth, verifyAdmin } from '../middleware/authMiddleware';
import { taskLimiter } from '../middleware/rateLimiter';
import {
  requestWithdrawal,
  getWithdrawalHistory,
  getAllWithdrawals,
  getPendingWithdrawals,
  approveWithdrawal,
  rejectWithdrawal,
} from '../services/withdrawalService';

const router = Router();

/**
 * POST /withdrawals/request
 * User requests a withdrawal (EasyPaisa, JazzCash, or USDT).
 */
router.post('/request', verifyAuth, taskLimiter, async (req, res) => {
  try {
    const uid = (req as any).uid;
    const { method, amount, accountNumber, accountName } = req.body;

    const result = await requestWithdrawal({
      uid,
      method,
      amount: parseFloat(amount),
      accountNumber,
      accountName: accountName || '',
    });

    res.json({ success: true, ...result });
  } catch (error: any) {
    console.error('Withdrawal request error:', error);
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * GET /withdrawals/history
 * User gets their withdrawal history.
 */
router.get('/history', verifyAuth, async (req, res) => {
  try {
    const uid = (req as any).uid;
    const withdrawals = await getWithdrawalHistory(uid);
    res.json({ withdrawals });
  } catch (error: any) {
    console.error('Withdrawal history error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /withdrawals/admin/all
 * Admin gets all withdrawals with optional status filter.
 */
router.get('/admin/all', verifyAuth, verifyAdmin, async (req, res) => {
  try {
    const status = req.query.status as string | undefined;
    const limit = parseInt(req.query.limit as string) || 50;
    const withdrawals = await getAllWithdrawals(status, limit);
    res.json({ withdrawals });
  } catch (error: any) {
    console.error('Admin withdrawal list error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /withdrawals/admin/pending
 * Admin gets pending withdrawals.
 */
router.get('/admin/pending', verifyAuth, verifyAdmin, async (req, res) => {
  try {
    const withdrawals = await getPendingWithdrawals();
    res.json({ withdrawals });
  } catch (error: any) {
    console.error('Admin pending withdrawals error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /withdrawals/admin/approve
 * Admin approves a withdrawal.
 */
router.post('/admin/approve', verifyAuth, verifyAdmin, async (req, res) => {
  try {
    const adminUid = (req as any).uid;
    const { withdrawalId } = req.body;

    if (!withdrawalId) {
      return res.status(400).json({ error: 'withdrawalId is required' });
    }

    const result = await approveWithdrawal(withdrawalId, adminUid);
    res.json(result);
  } catch (error: any) {
    console.error('Admin approve error:', error);
    res.status(400).json({ error: error.message });
  }
});

/**
 * POST /withdrawals/admin/reject
 * Admin rejects a withdrawal (refunds balance).
 */
router.post('/admin/reject', verifyAuth, verifyAdmin, async (req, res) => {
  try {
    const adminUid = (req as any).uid;
    const { withdrawalId, reason } = req.body;

    if (!withdrawalId) {
      return res.status(400).json({ error: 'withdrawalId is required' });
    }

    const result = await rejectWithdrawal(withdrawalId, adminUid, reason || '');
    res.json(result);
  } catch (error: any) {
    console.error('Admin reject error:', error);
    res.status(400).json({ error: error.message });
  }
});

export default router;
