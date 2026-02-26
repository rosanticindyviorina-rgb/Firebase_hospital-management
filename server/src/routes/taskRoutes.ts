import { Router, Response } from 'express';
import { AuthenticatedRequest, verifyAuth } from '../middleware/authMiddleware';
import { taskLimiter } from '../middleware/rateLimiter';
import { claimTask, getTaskStatus } from '../services/taskService';
import { executeSpin } from '../services/spinService';
import { TASK_TYPES } from '../config/constants';

const router = Router();

/**
 * POST /tasks/claim
 * Claims a task reward. Server validates timers, eligibility, and credits reward.
 */
router.post('/claim', taskLimiter, verifyAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { taskType } = req.body;

    if (!taskType || !Object.values(TASK_TYPES).includes(taskType)) {
      res.status(400).json({
        error: `Invalid taskType. Must be one of: ${Object.values(TASK_TYPES).join(', ')}`,
      });
      return;
    }

    const result = await claimTask(req.uid!, taskType);

    if (!result.success) {
      res.status(400).json({
        error: result.error,
        nextTaskAt: result.nextTaskAt,
      });
      return;
    }

    res.json({
      success: true,
      reward: result.reward,
      nextTaskAt: result.nextTaskAt,
    });
  } catch (error) {
    console.error('Task claim error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /tasks/status
 * Gets the current task/timer status for the authenticated user.
 */
router.get('/status', verifyAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const status = await getTaskStatus(req.uid!);
    res.json(status);
  } catch (error) {
    console.error('Task status error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /tasks/spin
 * Executes spin wheel (Task 4). Server decides outcome.
 */
router.post('/spin', taskLimiter, verifyAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const result = await executeSpin(req.uid!);

    if (!result.success) {
      res.status(400).json({ error: result.error });
      return;
    }

    res.json({
      success: true,
      prize: result.prize,
      label: result.label,
      spinId: result.spinId,
    });
  } catch (error) {
    console.error('Spin error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
