import { Router } from 'express';
import { AuthenticatedRequest, verifyAuth } from '../middleware/authMiddleware';
import { startGamingSession, endGamingSession, getGamingStatus } from '../services/gamingService';

const router = Router();

// Start a gaming session
router.post('/start', verifyAuth, async (req, res) => {
  try {
    const uid = (req as AuthenticatedRequest).uid;
    const { platform } = req.body;
    if (!platform) return res.status(400).json({ success: false, error: 'Platform required' });

    const result = await startGamingSession(uid, platform);
    res.json(result);
  } catch (error) {
    console.error('Gaming start error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// End a gaming session
router.post('/end', verifyAuth, async (req, res) => {
  try {
    const uid = (req as AuthenticatedRequest).uid;
    const { platform, coinsEarned } = req.body;
    if (!platform) return res.status(400).json({ success: false, error: 'Platform required' });

    const result = await endGamingSession(uid, platform, Number(coinsEarned) || 0);
    res.json(result);
  } catch (error) {
    console.error('Gaming end error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// Get gaming status for all platforms
router.get('/status', verifyAuth, async (req, res) => {
  try {
    const uid = (req as AuthenticatedRequest).uid;
    const result = await getGamingStatus(uid);
    res.json(result);
  } catch (error) {
    console.error('Gaming status error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

export default router;
