import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { generalLimiter } from './middleware/rateLimiter';
import securityRoutes from './routes/securityRoutes';
import userRoutes from './routes/userRoutes';
import taskRoutes from './routes/taskRoutes';
import adminRoutes from './routes/adminRoutes';
import withdrawalRoutes from './routes/withdrawalRoutes';

const app = express();
const PORT = process.env.PORT || 8080;

// Global middleware
app.use(helmet());
app.use(cors({
  origin: '*',
  credentials: true,
}));
app.use(express.json({ limit: '1mb' }));
app.use(generalLimiter);

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API routes
app.use('/security', securityRoutes);
app.use('/users', userRoutes);
app.use('/tasks', taskRoutes);
app.use('/admin', adminRoutes);
app.use('/withdrawals', withdrawalRoutes);

// Config endpoint (public, for app to read ad_provider etc.)
app.get('/config', async (_req, res) => {
  try {
    const { getAppConfig } = await import('./services/adminService');
    const config = await getAppConfig();
    res.json({
      ad_provider: config.ad_provider || 'admob',
      maintenance_mode: config.maintenance_mode || false,
      min_app_version: config.min_app_version || 1,
      exchange_rate_coins: config.exchange_rate_coins || 2000,
      exchange_rate_pkr: config.exchange_rate_pkr || 50,
      daily_ad_limit: config.daily_ad_limit || 8,
      min_withdrawal_coins: config.min_withdrawal_coins || 15000,
    });
  } catch (error) {
    console.error('Config fetch error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Seed endpoint — creates system user + referral code for first signups
app.post('/seed', async (_req, res) => {
  try {
    const { db, Collections, firebaseAdmin: fa } = await import('./config/firebase');
    const { getDefaultTaskProgress } = await import('./config/constants');
    const seedCode = 'KCTEST01';
    const systemUid = 'system';

    const codeDoc = await db.collection(Collections.REFERRAL_CODES).doc(seedCode).get();
    if (codeDoc.exists) {
      return res.json({ success: true, message: 'Seed already exists', code: seedCode });
    }

    const now = fa.firestore.FieldValue.serverTimestamp();
    const batch = db.batch();

    // System user (needed so batch.update calls don't fail for first real user)
    batch.set(db.collection(Collections.USERS).doc(systemUid), {
      uid: systemUid,
      phone: '+000000000000',
      status: 'active',
      referralCode: seedCode,
      coinBalance: 0,
      totalCoinsEarned: 0,
      balance: 0,
      totalEarned: 0,
      adWatchCount: 0,
      taskProgress: getDefaultTaskProgress(),
      createdAt: now,
      updatedAt: now,
    });

    // System referral doc
    batch.set(db.collection(Collections.REFERRALS).doc(systemUid), {
      uid: systemUid,
      inviterUid: null,
      referralChain: {},
      childrenL1: [],
      verifiedInvitesL1: 0,
      createdAt: now,
    });

    // System ledger placeholder
    batch.set(db.collection(Collections.LEDGER).doc(systemUid).collection('entries').doc('seed'), {
      uid: systemUid,
      type: 'system_seed',
      amount: 0,
      currency: 'coins',
      createdAt: now,
    });

    // Seed referral code
    batch.set(db.collection(Collections.REFERRAL_CODES).doc(seedCode), {
      code: seedCode,
      ownerUid: systemUid,
      active: true,
      usedCount: 0,
      createdAt: now,
    });

    await batch.commit();
    return res.json({ success: true, message: 'Seed created', code: seedCode });
  } catch (error) {
    console.error('Seed error:', error);
    return res.status(500).json({ error: 'Seed failed', detail: String(error) });
  }
});

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Error handler
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`Kamyabi Cash server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});

export default app;
