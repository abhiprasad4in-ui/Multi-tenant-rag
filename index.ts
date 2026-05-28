import express from 'express';
import dotenv from 'dotenv';
import rateLimit from 'express-rate-limit';
import { tenantRouter } from './api/tenant.routes';
import { documentRouter } from './api/document.routes';
import { queryRouter } from './api/query.routes';
import { errorHandler } from './middleware/tenant.middleware';
import { testConnection } from './models/db';
import { migrate } from './models/migrate';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// ─── Global Middleware ─────────────────────────────────────────────────────
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// Rate limiting — guard against abuse
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  message: { error: 'Too many requests. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

// Stricter limit for query endpoint (LLM calls are expensive)
const queryLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 20,
  message: { error: 'Query rate limit exceeded. Please wait.' },
});

// ─── Routes ───────────────────────────────────────────────────────────────
app.use('/tenant', tenantRouter);
app.use('/tenant/:tenantId/documents', documentRouter);
app.use('/tenant/:tenantId/query', queryLimiter, queryRouter);

// GET /health — liveness check
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'multi-tenant-rag',
    timestamp: new Date().toISOString(),
  });
});

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Global error handler
app.use(errorHandler);

// ─── Bootstrap ─────────────────────────────────────────────────────────────
async function bootstrap(): Promise<void> {
  try {
    await testConnection();
    await migrate();
    app.listen(PORT, () => {
      console.log(`🚀 Server running on http://localhost:${PORT}`);
      console.log(`📖 Health check: http://localhost:${PORT}/health`);
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

bootstrap();

export { app }; // exported for tests
