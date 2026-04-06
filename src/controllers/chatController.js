'use strict';
const { getDB } = require('../config/db');
const { getLLMAdapter } = require('../services/llm');
const { buildPrompt } = require('../services/promptBuilder');
const { getMemory, shouldSummarize, runSummarization } = require('../services/memoryService');

const HISTORY_LIMIT = 5; // messages to include in prompt context

// ── POST /api/chat/session ────────────────────────────────────────────────────
function createSession(req, res) {
  const { title } = req.body;
  const db = getDB();
  const sessionResult = db.prepare(`
    INSERT INTO sessions (user_id, title) VALUES (?, ?)
  `).run(req.user.id, title || 'New Conversation');
  const sessionId = Number(sessionResult.lastInsertRowid);

  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId);
  return res.status(201).json({ sessionId: session.id, title: session.title, createdAt: session.created_at });
}

// ── GET /api/chat/sessions ────────────────────────────────────────────────────
function getSessions(req, res) {
  const db = getDB();
  const sessions = db.prepare(`
    SELECT s.id, s.title, s.created_at, s.last_message_at,
           (SELECT text FROM messages WHERE session_id = s.id ORDER BY created_at DESC LIMIT 1) as lastMessage
    FROM sessions s
    WHERE s.user_id = ?
    ORDER BY CASE WHEN s.last_message_at IS NULL THEN 1 ELSE 0 END,
             s.last_message_at DESC,
             s.created_at DESC
    LIMIT 50
  `).all(req.user.id);
  return res.json({ sessions });
}

// ── GET /api/chat/history ─────────────────────────────────────────────────────
function getHistory(req, res) {
  const { sessionId, limit = 50, offset = 0 } = req.query;
  if (!sessionId) return res.status(400).json({ error: 'sessionId query param required' });

  const db = getDB();
  // Verify ownership
  const session = db.prepare('SELECT * FROM sessions WHERE id = ? AND user_id = ?').get(sessionId, req.user.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });

  const messages = db.prepare(`
    SELECT id, sender, text, created_at FROM messages
    WHERE session_id = ?
    ORDER BY created_at ASC
    LIMIT ? OFFSET ?
  `).all(sessionId, parseInt(limit), parseInt(offset));

  return res.json({ sessionId: parseInt(sessionId), title: session.title, messages });
}

// ── POST /api/chat/message (REST fallback, full reply) ────────────────────────
async function sendMessage(req, res) {
  const { sessionId, message } = req.body;
  if (!sessionId || !message) {
    return res.status(400).json({ error: 'sessionId and message are required' });
  }

  const db = getDB();
  // Verify session ownership
  const session = db.prepare('SELECT * FROM sessions WHERE id = ? AND user_id = ?').get(sessionId, req.user.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });

  // Save user message
  db.prepare(`INSERT INTO messages (session_id, sender, text) VALUES (?, 'user', ?)`).run(sessionId, message);
  db.prepare(`UPDATE sessions SET last_message_at = datetime('now') WHERE id = ?`).run(sessionId);

  // Fetch conversation history for context
  const history = db.prepare(`
    SELECT sender, text FROM messages
    WHERE session_id = ?
    ORDER BY created_at DESC
    LIMIT ?
  `).all(sessionId, HISTORY_LIMIT * 2).reverse();

  // Get user settings for persona/language
  const user = db.prepare('SELECT tone, language FROM users WHERE id = ?').get(req.user.id);
  const memory = getMemory(req.user.id);

  // Build prompt
  const messages = buildPrompt({
    userMessage: message,
    history: history.slice(0, -1), // exclude the message we just added
    memorySummary: memory?.summary || null,
    tone: user?.tone || 'friend',
    language: user?.language || 'hinglish',
  });

  // Call LLM
  const llm = getLLMAdapter();
  let reply;
  try {
    reply = await llm.chat(messages);
  } catch (err) {
    console.error('[CHAT] LLM error:', err.message);
    return res.status(503).json({ error: 'AI service temporarily unavailable. Please try again.' });
  }

  // Save AI reply
  db.prepare(`INSERT INTO messages (session_id, sender, text) VALUES (?, 'assistant', ?)`).run(sessionId, reply);
  db.prepare(`INSERT INTO logs (user_id, action, detail) VALUES (?, 'chat', ?)`).run(
    req.user.id,
    JSON.stringify({ sessionId, messageLength: message.length })
  );

  // Trigger async summarisation if needed (non-blocking)
  if (shouldSummarize(sessionId)) {
    setImmediate(() => runSummarization(sessionId, req.user.id).catch(console.error));
  }

  return res.json({ reply, sessionId });
}

// ── GET /api/chat/stream (SSE streaming reply) ────────────────────────────────
async function streamMessage(req, res) {
  const { sessionId, message } = req.query;
  if (!sessionId || !message) {
    return res.status(400).json({ error: 'sessionId and message query params required' });
  }

  const db = getDB();
  const session = db.prepare('SELECT * FROM sessions WHERE id = ? AND user_id = ?').get(sessionId, req.user.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });

  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // nginx won't buffer
  res.flushHeaders();

  // Save user message
  db.prepare(`INSERT INTO messages (session_id, sender, text) VALUES (?, 'user', ?)`).run(sessionId, message);
  db.prepare(`UPDATE sessions SET last_message_at = datetime('now') WHERE id = ?`).run(sessionId);

  const history = db.prepare(`
    SELECT sender, text FROM messages WHERE session_id = ?
    ORDER BY created_at DESC LIMIT ?
  `).all(sessionId, HISTORY_LIMIT * 2).reverse();

  const user = db.prepare('SELECT tone, language FROM users WHERE id = ?').get(req.user.id);
  const memory = getMemory(req.user.id);

  const messages = buildPrompt({
    userMessage: message,
    history: history.slice(0, -1),
    memorySummary: memory?.summary || null,
    tone: user?.tone || 'friend',
    language: user?.language || 'hinglish',
  });

  const llm = getLLMAdapter();
  let fullReply = '';

  try {
    for await (const delta of llm.streamChat(messages)) {
      fullReply += delta;
      res.write(`data: ${JSON.stringify({ delta, done: false })}\n\n`);
    }
  } catch (err) {
    console.error('[CHAT/SSE] LLM error:', err.message);
    res.write(`data: ${JSON.stringify({ error: 'AI service error', done: true })}\n\n`);
    return res.end();
  }

  // Send done signal
  res.write(`data: ${JSON.stringify({ delta: '', done: true })}\n\n`);
  res.end();

  // Save full AI reply
  if (fullReply) {
    db.prepare(`INSERT INTO messages (session_id, sender, text) VALUES (?, 'assistant', ?)`).run(sessionId, fullReply);
    if (shouldSummarize(sessionId)) {
      setImmediate(() => runSummarization(sessionId, req.user.id).catch(console.error));
    }
  }
}

// ── POST /api/chat/summarize (on-demand) ──────────────────────────────────────
async function summarizeSession(req, res) {
  const { sessionId } = req.body;
  if (!sessionId) return res.status(400).json({ error: 'sessionId required' });

  const db = getDB();
  const session = db.prepare('SELECT * FROM sessions WHERE id = ? AND user_id = ?').get(sessionId, req.user.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });

  await runSummarization(sessionId, req.user.id);
  const memory = getMemory(req.user.id);
  return res.json({ summary: memory?.summary || 'No summary generated yet.', updatedAt: memory?.updatedAt });
}

module.exports = { createSession, getSessions, getHistory, sendMessage, streamMessage, summarizeSession };
