import { Router, Response } from 'express';
import { AuthenticatedRequest, verifyAuth } from '../middleware/authMiddleware';
import { taskLimiter } from '../middleware/rateLimiter';
import { transferCoins, getTransferHistory } from '../services/transferService';

const router = Router();

/**
 * POST /transfer — Transfer coins to another user (10% platform fee).
 */
router.post('/', taskLimiter, verifyAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { recipientId, coinAmount } = req.body;

    if (!recipientId || !coinAmount) {
      res.status(400).json({ error: 'recipientId and coinAmount are required' });
      return;
    }

    const amount = parseInt(coinAmount);
    if (isNaN(amount) || amount <= 0) {
      res.status(400).json({ error: 'coinAmount must be a positive integer' });
      return;
    }

    const result = await transferCoins(req.uid!, recipientId, amount);

    if (!result.success) {
      res.status(400).json({ error: result.error });
      return;
    }

    res.json({
      success: true,
      coinsSent: amount,
      fee: result.fee,
      recipientReceived: result.netAmount,
      recipientUid: result.recipientUid,
      currency: 'coins',
    });
  } catch (error) {
    console.error('Transfer error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /transfer/history — Get transfer history for the authenticated user.
 */
router.get('/history', verifyAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const transfers = await getTransferHistory(req.uid!);

    res.json({
      success: true,
      transfers,
    });
  } catch (error) {
    console.error('Transfer history error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
