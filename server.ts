import 'dotenv/config';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getAnalyticsSummary, recordAnalyticsEvent } from './server/analyticsStore.ts';
import {
  claimInitialOwnerPasscode,
  getOwnerAuthStatus,
  verifyOwnerLogin,
  verifyOwnerToken,
} from './server/authStore.ts';
import { getCachedSnapshot, runLiveSync } from './server/dataSync.ts';
import { getNewsletterSummary, subscribeNewsletter } from './server/newsletterStore.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

function requireOwnerAuth(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) {
  if (!verifyOwnerToken(req.headers.authorization)) {
    res.status(401).json({ ok: false, error: 'Owner authentication required' });
    return;
  }
  next();
}

async function createServer() {
  const app = express();
  app.use(express.json({ limit: '64kb' }));

  app.get('/api/health', (_req, res) => {
    const snap = getCachedSnapshot();
    res.json({
      ok: true,
      lastSyncAt: snap.lastSyncAt,
      nextScheduledSyncAt: snap.nextScheduledSyncAt,
      feeds: snap.feeds,
    });
  });

  // Public read of market snapshot
  app.get('/api/market-data', (_req, res) => {
    const snap = getCachedSnapshot();
    res.json(snap);
  });

  // Public write of anonymous non-PII analytics events
  app.post('/api/analytics/event', (req, res) => {
    const { type, target, sessionId } = req.body ?? {};
    const result = recordAnalyticsEvent({ type, target, sessionId });
    if (!result.ok) {
      res.status(400).json({ ok: false, error: 'Invalid analytics event payload' });
      return;
    }
    res.json({ ok: true });
  });

  // Public newsletter subscription endpoint
  app.post('/api/newsletter/subscribe', (req, res) => {
    const result = subscribeNewsletter(req.body?.email, req.body?.track);
    if (!result.ok) {
      res.status(400).json({ ok: false, error: result.error });
      return;
    }
    res.json({ ok: true, alreadySubscribed: result.alreadySubscribed });
  });

  // Owner-only authentication endpoints for hidden analytics page
  app.get('/api/owner/auth-status', (_req, res) => {
    res.json(getOwnerAuthStatus());
  });

  app.post('/api/owner/setup', (req, res) => {
    const result = claimInitialOwnerPasscode(req.body?.passcode);
    if (!result.ok) {
      res.status(400).json({ ok: false, error: result.error });
      return;
    }
    res.json({ ok: true, token: result.token });
  });

  app.post('/api/owner/login', (req, res) => {
    const result = verifyOwnerLogin(req.body?.passcode);
    if (!result.ok) {
      res.status(401).json({ ok: false, error: result.error });
      return;
    }
    res.json({ ok: true, token: result.token });
  });

  // Protected owner-only routes
  app.get('/api/analytics/summary', requireOwnerAuth, (_req, res) => {
    res.json(getAnalyticsSummary());
  });

  app.get('/api/newsletter/subscribers', requireOwnerAuth, (_req, res) => {
    res.json(getNewsletterSummary());
  });

  app.post('/api/sync/refresh', requireOwnerAuth, async (_req, res) => {
    try {
      const snap = await runLiveSync(false);
      res.json({ ok: true, snapshot: snap });
    } catch (err) {
      res.status(500).json({
        ok: false,
        error: err instanceof Error ? err.message : 'Sync failed',
      });
    }
  });

  if (!IS_PRODUCTION) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    if (fs.existsSync(distDir)) {
      app.use(express.static(distDir));
      app.get('/{*splat}', (_req, res) => {
        res.sendFile(path.join(distDir, 'index.html'));
      });
    }
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Boundry UK server listening on http://0.0.0.0:${PORT}`);
    void runLiveSync(true);
    const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;
    setInterval(() => {
      void runLiveSync(true);
    }, TWENTY_FOUR_HOURS_MS);
  });
}

createServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
