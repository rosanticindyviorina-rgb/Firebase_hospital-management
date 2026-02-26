import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { generalLimiter } from './middleware/rateLimiter';
import securityRoutes from './routes/securityRoutes';
import userRoutes from './routes/userRoutes';
import taskRoutes from './routes/taskRoutes';
import adminRoutes from './routes/adminRoutes';

const app = express();
const PORT = process.env.PORT || 8080;

// Global middleware
app.use(helmet());
app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? ['https://kamyabi-cash.web.app', 'https://kamyabi-cash.firebaseapp.com']
    : '*',
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

// Config endpoint (public, for app to read ad_provider etc.)
app.get('/config', async (_req, res) => {
  try {
    const { getAppConfig } = await import('./services/adminService');
    const config = await getAppConfig();
    res.json({
      ad_provider: config.ad_provider || 'admob',
      maintenance_mode: config.maintenance_mode || false,
      min_app_version: config.min_app_version || 1,
    });
  } catch (error) {
    console.error('Config fetch error:', error);
    res.status(500).json({ error: 'Internal server error' });
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
