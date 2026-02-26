import { Router, Response } from 'express';
import { AuthenticatedRequest, verifyAuth } from '../middleware/authMiddleware';
import { authLimiter } from '../middleware/rateLimiter';
import { validateReferralCode, createUser, getUserProfile } from '../services/userService';

const router = Router();

/**
 * POST /users/validate-referral
 * Validates a referral code before auth.
 * No auth required (pre-registration check).
 */
router.post('/validate-referral', authLimiter, async (req, res: Response) => {
  try {
    const { code } = req.body;

    if (!code || typeof code !== 'string') {
      res.status(400).json({ error: 'Referral code is required' });
      return;
    }

    const result = await validateReferralCode(code.toUpperCase().trim());
    res.json({ valid: result.valid });
  } catch (error) {
    console.error('Referral validation error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /users/create
 * Creates a new user after phone auth + referral validation.
 * Requires Firebase Auth token.
 */
router.post('/create', authLimiter, verifyAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { phone, referralCode, deviceFingerprint } = req.body;

    if (!phone || !referralCode || !deviceFingerprint) {
      res.status(400).json({ error: 'phone, referralCode, and deviceFingerprint are required' });
      return;
    }

    const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()
      || req.socket.remoteAddress
      || '0.0.0.0';

    const result = await createUser({
      uid: req.uid!,
      phone,
      referralCode: referralCode.toUpperCase().trim(),
      deviceFingerprint,
      clientIp,
    });

    if (!result.success) {
      res.status(400).json({ error: result.error });
      return;
    }

    res.status(201).json({ success: true });
  } catch (error) {
    console.error('User creation error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /users/profile
 * Gets the authenticated user's profile.
 */
router.get('/profile', verifyAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const profile = await getUserProfile(req.uid!);

    if (!profile) {
      res.status(404).json({ error: 'Profile not found' });
      return;
    }

    // Return safe fields only (no internal data)
    res.json({
      uid: profile.uid,
      phone: profile.phone,
      status: profile.status,
      referralCode: profile.referralCode,
      balance: profile.balance,
      totalEarned: profile.totalEarned,
      taskProgress: profile.taskProgress,
      nextCycleAt: profile.nextCycleAt,
      nextTaskAt: profile.nextTaskAt,
      createdAt: profile.createdAt,
    });
  } catch (error) {
    console.error('Profile fetch error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
