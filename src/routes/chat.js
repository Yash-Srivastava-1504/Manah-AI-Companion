'use strict';
const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth');
const { crisisDetectionMiddleware } = require('../middleware/crisis');
const {
  createSession,
  getSessions,
  getHistory,
  sendMessage,
  streamMessage,
  summarizeSession,
} = require('../controllers/chatController');

// All chat routes require authentication
router.use(authMiddleware);

// POST /api/chat/session — create a new session
router.post('/session', createSession);

// GET /api/chat/sessions — list user's sessions
router.get('/sessions', getSessions);

// GET /api/chat/history?sessionId=X — message history
router.get('/history', getHistory);

// POST /api/chat/message — REST fallback (full reply, no streaming)
// Crisis detection middleware runs BEFORE LLM is called
router.post('/message', crisisDetectionMiddleware, sendMessage);

// GET /api/chat/stream?sessionId=X&message=Y — SSE streaming reply
router.get('/stream', streamMessage);

// POST /api/chat/summarize — on-demand summarisation
router.post('/summarize', summarizeSession);

module.exports = router;
