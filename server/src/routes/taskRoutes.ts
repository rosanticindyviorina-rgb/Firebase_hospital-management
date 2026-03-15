import { Router, Response } from 'express';
import { AuthenticatedRequest, verifyAuth } from '../middleware/authMiddleware';
import { taskLimiter } from '../middleware/rateLimiter';
import { claimTask, getTaskStatus } from '../services/taskService';
import { executeSpin, executeScratch } from '../services/spinService';
import { claimRedeemCode } from '../services/redeemService';
import { claimMetaTask, getMetaTaskStatus } from '../services/metaTaskService';
import { claimLoyaltyReward, getLoyaltyStatus } from '../services/loyaltyService';
import { TASK_TYPES, META_TASKS } from '../config/constants';

const router = Router();

/**
 * POST /tasks/claim — Claims a core task reward (coins).
 */
router.post('/claim', taskLimiter, verifyAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { taskType } = req.body;

    // Check if it's a Meta task — route to Meta handler
    if (taskType && META_TASKS.includes(taskType)) {
      const result = await claimMetaTask(req.uid!, taskType);
      if (!result.success) {
        res.status(400).json({ error: result.error, nextMetaCycleAt: result.nextMetaCycleAt });
        return;
      }
      res.json({
        success: true,
        reward: result.reward,
        currency: 'coins',
        isHalfReward: result.isHalfReward,
        nextMetaCycleAt: result.nextMetaCycleAt,
        metaProgress: result.metaProgress,
      });
      return;
    }

    if (!taskType || !Object.values(TASK_TYPES).includes(taskType)) {
      res.status(400).json({
        error: `Invalid taskType. Must be one of: ${Object.values(TASK_TYPES).join(', ')}`,
      });
      return;
    }

    const result = await claimTask(req.uid!, taskType);

    if (!result.success) {
      res.status(400).json({ error: result.error, nextTaskAt: result.nextTaskAt });
      return;
    }

    res.json({
      success: true,
      reward: result.reward,
      currency: 'coins',
      nextTaskAt: result.nextTaskAt,
      networkCooldowns: result.networkCooldowns,
    });
  } catch (error) {
    console.error('Task claim error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /tasks/status — Gets current task/timer status (includes Meta + Loyalty).
 */
router.get('/status', verifyAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const [coreStatus, metaStatus, loyaltyStatus] = await Promise.all([
      getTaskStatus(req.uid!),
      getMetaTaskStatus(req.uid!),
      getLoyaltyStatus(req.uid!),
    ]);

    res.json({
      ...coreStatus,
      meta: metaStatus,
      loyalty: loyaltyStatus,
    });
  } catch (error) {
    console.error('Task status error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /tasks/spin — Execute spin wheel (Task 4).
 */
router.post('/spin', taskLimiter, verifyAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const result = await executeSpin(req.uid!);
    if (!result.success) {
      res.status(400).json({ error: result.error });
      return;
    }
    res.json({ success: true, prize: result.prize, label: result.label, spinId: result.spinId, currency: 'coins' });
  } catch (error) {
    console.error('Spin error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /tasks/scratch — Execute scratch card (Task 8).
 */
router.post('/scratch', taskLimiter, verifyAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const result = await executeScratch(req.uid!);
    if (!result.success) {
      res.status(400).json({ error: result.error });
      return;
    }
    res.json({ success: true, prize: result.prize, label: result.label, scratchId: result.spinId, currency: 'coins' });
  } catch (error) {
    console.error('Scratch error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /tasks/redeem — Claim a redeem code for coins.
 */
router.post('/redeem', taskLimiter, verifyAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { code } = req.body;
    if (!code) {
      res.status(400).json({ error: 'code is required' });
      return;
    }
    const result = await claimRedeemCode(req.uid!, code);
    if (!result.success) {
      res.status(400).json({ error: result.error });
      return;
    }
    res.json({ success: true, coinsAwarded: result.coinsAwarded, currency: 'coins' });
  } catch (error) {
    console.error('Redeem error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /tasks/loyalty — Claim daily loyalty reward (one per day).
 */
router.post('/loyalty', taskLimiter, verifyAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const result = await claimLoyaltyReward(req.uid!);
    if (!result.success) {
      res.status(400).json({ error: result.error });
      return;
    }
    res.json({
      success: true,
      reward: result.reward,
      currency: 'coins',
      dayOfMonth: result.dayOfMonth,
      streakDay: result.streakDay,
    });
  } catch (error) {
    console.error('Loyalty error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
