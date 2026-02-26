import { Router } from 'express';
import { AuthenticatedRequest, verifyAuth } from '../middleware/authMiddleware';
import { securityLimiter } from '../middleware/rateLimiter';
import { attestDevice, processSecurityReport } from '../services/securityService';
import { Response } from 'express';

const router = Router();

/**
 * POST /security/attest
 * Verifies device integrity, fingerprint, Play Integrity token.
 * Called at app startup and periodically.
 */
router.post('/attest', securityLimiter, verifyAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { integrityToken, deviceFingerprint, appVersion, detectedIssues } = req.body;

    if (!integrityToken || !deviceFingerprint) {
      res.status(400).json({ error: 'integrityToken and deviceFingerprint are required' });
      return;
    }

    const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()
      || req.socket.remoteAddress
      || '0.0.0.0';

    const verdict = await attestDevice(req.uid!, {
      integrityToken,
      deviceFingerprint,
      appVersion: appVersion || 1,
      detectedIssues: detectedIssues || [],
    }, clientIp);

    if (verdict.banned) {
      res.status(403).json({
        allowed: false,
        banned: true,
        reason: verdict.reason,
      });
      return;
    }

    res.json({ allowed: true, banned: false });
  } catch (error) {
    console.error('Attestation error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /security/report
 * Receives security violation reports from the client.
 * Client detected root/emulator/vpn/clone → server verifies and may ban.
 */
router.post('/report', securityLimiter, verifyAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { violations, evidence } = req.body;

    if (!violations || !Array.isArray(violations)) {
      res.status(400).json({ error: 'violations array is required' });
      return;
    }

    const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()
      || req.socket.remoteAddress
      || '0.0.0.0';

    const result = await processSecurityReport(
      req.uid!,
      violations,
      evidence || {},
      clientIp
    );

    if (result.banned) {
      res.status(403).json({
        banned: true,
        reason: result.reason,
      });
      return;
    }

    res.json({ banned: false });
  } catch (error) {
    console.error('Security report error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
