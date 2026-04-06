'use strict';
require('dotenv').config();

const http = require('http');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');

const { initDB } = require('./src/config/db');
const { rateLimiter } = require('./src/middleware/rateLimiter');
const authRoutes = require('./src/routes/auth');
const userRoutes = require('./src/routes/user');
const chatRoutes = require('./src/routes/chat');
const moodRoutes = require('./src/routes/mood');
const settingsRoutes = require('./src/routes/settings');
const companionRoutes = require('./src/routes/companion');
const { setupWebSocket } = require('./src/websocket/wsChat');
const { startSummarizationJob } = require('./src/jobs/summarizationJob');
const { getLLMProviderLabel } = require('./src/services/llm');

const app = express();
const PORT = process.env.PORT || 3001;

/** Local Vite ports + optional FRONTEND_URL / CORS_ORIGINS — see .env.example */
function getCorsAllowedOrigins() {
  const fromList = process.env.CORS_ORIGINS?.trim();
  if (fromList) {
    return fromList.split(',').map((s) => s.trim()).filter(Boolean);
  }
  const defaults = new Set([
    'http://localhost:5173',
    'http://localhost:8080',
    'http://127.0.0.1:5173',
    'http://127.0.0.1:8080',
  ]);
  const single = process.env.FRONTEND_URL?.trim();
  if (single) defaults.add(single);
  return [...defaults];
}

const corsAllowedOrigins = getCorsAllowedOrigins();

// ── Security & Parsing Middleware ─────────────────────────────────────────────
app.use(helmet());
app.use(
  cors({
    origin(origin, callback) {
      if (!origin) return callback(null, true);
      if (corsAllowedOrigins.includes(origin)) return callback(null, true);
      return callback(null, false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  }),
);
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// ── Global Rate Limiter ───────────────────────────────────────────────────────
app.use(rateLimiter);

// ── Health Check ──────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'manah-backend', timestamp: new Date().toISOString() });
});

// ── API Routes ────────────────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/user', userRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/mood', moodRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/companion', companionRoutes);

// ── 404 Handler ───────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// ── Global Error Handler ──────────────────────────────────────────────────────
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error('[ERROR]', err.message || err);
  const status = err.status || 500;
  res.status(status).json({ error: err.message || 'Internal server error' });
});

// ── Bootstrap ─────────────────────────────────────────────────────────────────
async function bootstrap() {
  // Initialise database (creates tables if they don't exist)
  initDB();

  // Create HTTP server (needed for WebSocket upgrade)
  const server = http.createServer(app);

  // Attach WebSocket handler
  setupWebSocket(server);

  // Start background summarisation cron job
  startSummarizationJob();

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`\n[ERROR] Port ${PORT} is already in use. Stop the other process or set PORT in .env.\n`);
      console.error('  Windows: netstat -ano | findstr :' + PORT + '   then   taskkill /PID <pid> /F\n');
      process.exit(1);
    }
    throw err;
  });

  server.listen(PORT, () => {
    console.log(`\n🌿 Manah Backend running on http://localhost:${PORT}`);
    console.log(`💬 Companion API (Supabase JWT): POST /api/companion/chat`);
    console.log(`🔌 WebSocket (legacy SQLite chat): ws://localhost:${PORT}/ws/chat`);
    console.log(`🤖 LLM: ${process.env.USE_MOCK_LLM === 'true' ? '🧪 MOCK' : `✨ ${getLLMProviderLabel()}`}\n`);
  });
}

if (require.main === module) {
  bootstrap().catch((err) => {
    console.error('Failed to start server:', err);
    process.exit(1);
  });
}

module.exports = app; // exported for tests
