'use strict';
const { WebSocketServer } = require('ws');
const url = require('url');
const { verifyToken } = require('../middleware/auth');
const { getDB } = require('../config/db');
const { getLLMAdapter } = require('../services/llm');
const { buildPrompt } = require('../services/promptBuilder');
const { getMemory, shouldSummarize, runSummarization } = require('../services/memoryService');
const { detectCrisis, HELPLINE_RESPONSE } = require('../middleware/crisis');

const HISTORY_LIMIT = 5;

/**
 * Attach a WebSocket server to an existing HTTP server.
 * Clients connect to: ws://localhost:3001/ws/chat
 *
 * Auth: clients must pass JWT as query param ?token=<jwt>
 *       OR the server reads the accessToken cookie.
 *
 * Protocol (JSON frames):
 *   CLIENT → SERVER: { "sessionId": 42, "message": "Haan yaar..." }
 *   SERVER → CLIENT: { "delta": "...", "done": false }  (streaming chunks)
 *   SERVER → CLIENT: { "delta": "", "done": true }       (final frame)
 *   SERVER → CLIENT: { "error": "..." }                  (on error)
 *   SERVER → CLIENT: { "crisis": true, "reply": "...", "helplines": [...] }
 */
function setupWebSocket(server) {
  const wss = new WebSocketServer({ noServer: true });

  // ── HTTP upgrade handler ───────────────────────────────────────────────────
  server.on('upgrade', (req, socket, head) => {
    // Only handle /ws/chat path
    const { pathname, query } = url.parse(req.url, true);
    if (pathname !== '/ws/chat') {
      socket.destroy();
      return;
    }

    // Extract JWT: prefer query param, fall back to cookie header
    let token = query.token || null;
    if (!token) {
      const cookieHeader = req.headers.cookie || '';
      const match = cookieHeader.match(/(?:^|;\s*)accessToken=([^;]+)/);
      if (match) token = match[1];
    }

    if (!token) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    let decoded;
    try {
      decoded = verifyToken(token);
    } catch {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    // Attach user to request so we can access in connection handler
    req.wsUser = { id: decoded.id, email: decoded.email };

    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req);
    });
  });

  // ── Connection handler ─────────────────────────────────────────────────────
  wss.on('connection', (ws, req) => {
    const user = req.wsUser;
    console.log(`[WS] User ${user.id} connected`);

    ws.on('message', async (raw) => {
      let payload;
      try {
        payload = JSON.parse(raw.toString());
      } catch {
        ws.send(JSON.stringify({ error: 'Invalid JSON' }));
        return;
      }

      const { sessionId, message } = payload;
      if (!sessionId || !message) {
        ws.send(JSON.stringify({ error: 'sessionId and message are required' }));
        return;
      }

      const db = getDB();

      // Verify session ownership
      const session = db.prepare(
        'SELECT * FROM sessions WHERE id = ? AND user_id = ?'
      ).get(sessionId, user.id);

      if (!session) {
        ws.send(JSON.stringify({ error: 'Session not found or access denied' }));
        return;
      }

      // ── Crisis detection (skip LLM) ──────────────────────────────────────
      if (detectCrisis(message)) {
        try {
          db.prepare(`
            INSERT INTO logs (user_id, action, detail)
            VALUES (?, 'crisis_detected', ?)
          `).run(user.id, JSON.stringify({ sessionId, messageSnippet: message.slice(0, 50) }));
        } catch (e) {
          console.error('[WS] Crisis log error:', e.message);
        }
        ws.send(JSON.stringify(HELPLINE_RESPONSE));
        return;
      }

      // ── Save user message ─────────────────────────────────────────────────
      db.prepare(`INSERT INTO messages (session_id, sender, text) VALUES (?, 'user', ?)`).run(sessionId, message);
      db.prepare(`UPDATE sessions SET last_message_at = datetime('now') WHERE id = ?`).run(sessionId);

      // ── Build prompt ──────────────────────────────────────────────────────
      const history = db.prepare(`
        SELECT sender, text FROM messages
        WHERE session_id = ?
        ORDER BY created_at DESC LIMIT ?
      `).all(sessionId, HISTORY_LIMIT * 2).reverse();

      const userData = db.prepare('SELECT tone, language FROM users WHERE id = ?').get(user.id);
      const memory = getMemory(user.id);

      const messages = buildPrompt({
        userMessage: message,
        history: history.slice(0, -1),
        memorySummary: memory?.summary || null,
        tone: userData?.tone || 'friend',
        language: userData?.language || 'hinglish',
      });

      // ── Stream from LLM ───────────────────────────────────────────────────
      const llm = getLLMAdapter();
      let fullReply = '';

      try {
        for await (const delta of llm.streamChat(messages)) {
          if (ws.readyState !== ws.OPEN) break;
          fullReply += delta;
          ws.send(JSON.stringify({ delta, done: false }));
        }
      } catch (err) {
        console.error('[WS] LLM stream error:', err.message);
        if (ws.readyState === ws.OPEN) {
          ws.send(JSON.stringify({ error: 'AI service temporarily unavailable', done: true }));
        }
        return;
      }

      // ── Send done frame ────────────────────────────────────────────────────
      if (ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify({ delta: '', done: true }));
      }

      // ── Save assistant reply & trigger summarization ───────────────────────
      if (fullReply) {
        db.prepare(`INSERT INTO messages (session_id, sender, text) VALUES (?, 'assistant', ?)`).run(sessionId, fullReply);
        db.prepare(`INSERT INTO logs (user_id, action, detail) VALUES (?, 'chat_ws', ?)`).run(
          user.id,
          JSON.stringify({ sessionId, messageLength: message.length })
        );

        if (shouldSummarize(sessionId)) {
          setImmediate(() => runSummarization(sessionId, user.id).catch(console.error));
        }
      }
    });

    ws.on('close', () => {
      console.log(`[WS] User ${user.id} disconnected`);
    });

    ws.on('error', (err) => {
      console.error(`[WS] Connection error for user ${user.id}:`, err.message);
    });
  });

  console.log('[WS] WebSocket server attached to HTTP server');
  return wss;
}

module.exports = { setupWebSocket };
