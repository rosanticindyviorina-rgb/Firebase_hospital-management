import { Router, Response } from 'express';
import { AuthenticatedRequest, verifyAuth } from '../middleware/authMiddleware';
import { db, Collections } from '../config/firebase';

const router = Router();

/**
 * POST /account/bank
 * Save or update bank/wallet binding (one-time, can only update if not yet approved).
 */
router.post('/bank', verifyAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const uid = req.uid!;
    const { accountTitle, accountNumber, bankName, method } = req.body;

    if (!accountTitle || !accountNumber || !bankName || !method) {
      res.status(400).json({ error: 'accountTitle, accountNumber, bankName, and method are required' });
      return;
    }

    const validMethods = ['easypaisa', 'jazzcash', 'bank', 'usdt'];
    if (!validMethods.includes(method)) {
      res.status(400).json({ error: `method must be one of: ${validMethods.join(', ')}` });
      return;
    }

    // Check if already bound
    const existing = await db.collection('bank_bindings').doc(uid).get();
    if (existing.exists && existing.data()?.locked) {
      res.status(400).json({ error: 'Bank details are already locked. Contact support to change.' });
      return;
    }

    await db.collection('bank_bindings').doc(uid).set({
      uid,
      accountTitle: accountTitle.trim(),
      accountNumber: accountNumber.trim(),
      bankName: bankName.trim(),
      method,
      locked: true,
      createdAt: existing.exists ? existing.data()?.createdAt : new Date(),
      updatedAt: new Date(),
    });

    res.json({ success: true, message: 'Bank details saved and locked' });
  } catch (error) {
    console.error('Bank binding error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /account/bank
 * Get saved bank/wallet binding.
 */
router.get('/bank', verifyAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const uid = req.uid!;
    const doc = await db.collection('bank_bindings').doc(uid).get();

    if (!doc.exists) {
      res.json({ bound: false });
      return;
    }

    const data = doc.data()!;
    res.json({
      bound: true,
      accountTitle: data.accountTitle,
      accountNumber: data.accountNumber,
      bankName: data.bankName,
      method: data.method,
      locked: data.locked || false,
    });
  } catch (error) {
    console.error('Bank fetch error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /account/task-history
 * Get user's task completion history from ledger.
 */
router.get('/task-history', verifyAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const uid = req.uid!;
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);

    const entries = await db.collection(Collections.LEDGER)
      .doc(uid)
      .collection('entries')
      .orderBy('createdAt', 'desc')
      .limit(limit)
      .get();

    const history = entries.docs.map(doc => {
      const d = doc.data();
      return {
        id: doc.id,
        type: d.type,
        amount: d.amount,
        currency: d.currency || 'coins',
        taskType: d.taskType || null,
        createdAt: d.createdAt?.toMillis?.() || d.createdAt || 0,
      };
    });

    res.json({ history });
  } catch (error) {
    console.error('Task history error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /account/frozen
 * Get user's frozen amount (pending withdrawals).
 */
router.get('/frozen', verifyAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const uid = req.uid!;

    const pending = await db.collection(Collections.WITHDRAWALS)
      .where('uid', '==', uid)
      .where('status', '==', 'pending')
      .get();

    let frozenCoins = 0;
    pending.docs.forEach(doc => {
      frozenCoins += doc.data().coinAmount || 0;
    });

    res.json({ frozenCoins });
  } catch (error) {
    console.error('Frozen amount error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
