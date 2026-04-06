'use strict';
const { getDB } = require('../config/db');
const { buildSummarizationPrompt } = require('./promptBuilder');
const { getLLMAdapter } = require('./llm');

const MESSAGES_PER_SUMMARY = 5; // trigger summarisation every N user messages

/**
 * Get the latest memory summary for a user.
 * @param {number} userId
 * @returns {{ summary: string, updatedAt: string } | null}
 */
function getMemory(userId) {
  const db = getDB();
  const row = db.prepare(`
    SELECT summary, updated_at FROM memory
    WHERE user_id = ?
    ORDER BY updated_at DESC
    LIMIT 1
  `).get(userId);
  return row || null;
}

/**
 * Upsert (insert or update) a memory summary for a user.
 * One summary per user — we always overwrite.
 */
function saveMemory(userId, summary, sessionId = null) {
  const db = getDB();
  const existing = db.prepare('SELECT id FROM memory WHERE user_id = ?').get(userId);

  if (existing) {
    db.prepare(`
      UPDATE memory SET summary = ?, session_id = ?, updated_at = datetime('now')
      WHERE user_id = ?
    `).run(summary, sessionId, userId);
  } else {
    db.prepare(`
      INSERT INTO memory (user_id, session_id, summary)
      VALUES (?, ?, ?)
    `).run(userId, sessionId, summary);
  }
}

/**
 * Check if a session needs summarisation.
 * Returns true if (new user messages since last summary) >= threshold.
 */
function shouldSummarize(sessionId) {
  const db = getDB();
  const row = db.prepare(`
    SELECT COUNT(*) as count FROM messages
    WHERE session_id = ?
      AND sender = 'user'
      AND created_at > COALESCE(
        (SELECT updated_at FROM memory WHERE session_id = ? ORDER BY updated_at DESC LIMIT 1),
        '1970-01-01'
      )
  `).get(sessionId, sessionId);
  return (row?.count || 0) >= MESSAGES_PER_SUMMARY;
}

/**
 * Run summarisation for a session.
 * Fetches recent messages, calls LLM, stores result in memory table.
 * @param {number} sessionId
 * @param {number} userId
 */
async function runSummarization(sessionId, userId) {
  const db = getDB();
  const llm = getLLMAdapter();

  // Get last 20 messages for context
  const messages = db.prepare(`
    SELECT sender, text FROM messages
    WHERE session_id = ?
    ORDER BY created_at DESC
    LIMIT 20
  `).all(sessionId).reverse();

  if (messages.length < 2) return; // Not enough to summarise

  console.log(`[MEMORY] Running summarisation for session ${sessionId}, user ${userId}`);

  try {
    const prompt = buildSummarizationPrompt(messages);
    const summary = await llm.chat(prompt);
    saveMemory(userId, summary.trim(), sessionId);
    console.log(`[MEMORY] Summary saved for user ${userId}: "${summary.slice(0, 80)}…"`);
  } catch (err) {
    console.error('[MEMORY] Summarisation failed:', err.message);
  }
}

/**
 * Find all sessions that need summarisation (for batch cron job).
 * Returns array of { sessionId, userId }
 */
function getSessionsNeedingSummary() {
  const db = getDB();
  const rows = db.prepare(`
    SELECT s.id as sessionId, s.user_id as userId,
           COUNT(m.id) as userMsgCount
    FROM sessions s
    JOIN messages m ON m.session_id = s.id AND m.sender = 'user'
    WHERE m.created_at > COALESCE(
      (SELECT updated_at FROM memory WHERE user_id = s.user_id ORDER BY updated_at DESC LIMIT 1),
      '1970-01-01'
    )
    GROUP BY s.id
    HAVING userMsgCount >= ?
  `).all(MESSAGES_PER_SUMMARY);
  return rows;
}

module.exports = {
  getMemory,
  saveMemory,
  shouldSummarize,
  runSummarization,
  getSessionsNeedingSummary,
};
