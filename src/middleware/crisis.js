'use strict';
const { getDB } = require('../config/db');

// Crisis keywords — expand as needed
const CRISIS_KEYWORDS = [
  'suicide',
  'suicidal',
  'kill myself',
  'end my life',
  'want to die',
  'no reason to live',
  'self harm',
  'self-harm',
  'hurt myself',
  'hurting myself',
  'cutting myself',
  'i want to end it',
  'end it all',
  'not worth living',
];

const HELPLINE_RESPONSE = {
  crisis: true,
  reply: `Main yahan hoon, tumhari baat sun raha hoon 💙\n\nIf you're going through something really tough right now, please know you're not alone. Trained counsellors are available right now — completely free and confidential:\n\n📞 **iCall**: 9152987821 (Mon–Sat, 8am–10pm)\n📞 **KIRAN Mental Health Helpline**: 1800-599-0019 (24/7, FREE)\n📞 **Vandrevala Foundation**: 1860-2662-345 (24/7)\n\nPlease reach out to them. I care about you, and I'm here to keep talking too. 💙`,
  helplines: [
    { name: 'iCall', number: '9152987821', hours: 'Mon–Sat, 8am–10pm' },
    { name: 'KIRAN', number: '1800-599-0019', hours: '24/7 FREE' },
    { name: 'Vandrevala Foundation', number: '1860-2662-345', hours: '24/7' },
  ],
};

/**
 * Crisis detection middleware.
 * Intercepts POST /api/chat/message BEFORE the LLM is called.
 * If crisis keywords are found:
 *   - Saves user message to DB
 *   - Logs the crisis event
 *   - Returns helpline info immediately (no LLM call)
 */
function crisisDetectionMiddleware(req, res, next) {
  const message = (req.body && req.body.message) ? req.body.message : '';
  const lower = message.toLowerCase();

  const detected = CRISIS_KEYWORDS.some((kw) => lower.includes(kw));

  if (!detected) return next();

  // Log crisis event (non-blocking)
  try {
    const db = getDB();
    db.prepare(`
      INSERT INTO logs (user_id, action, detail)
      VALUES (?, 'crisis_detected', ?)
    `).run(
      req.user ? req.user.id : null,
      JSON.stringify({ sessionId: req.body.sessionId, messageSnippet: message.slice(0, 50) })
    );
  } catch (logErr) {
    console.error('[CRISIS] Failed to log crisis event:', logErr.message);
  }

  // Mark on request so route handler knows (optional, safeguard)
  req.crisisDetected = true;

  return res.status(200).json(HELPLINE_RESPONSE);
}

/**
 * Utility for WebSocket handler to check crisis without Express res.
 */
function detectCrisis(message) {
  const lower = (message || '').toLowerCase();
  return CRISIS_KEYWORDS.some((kw) => lower.includes(kw));
}

module.exports = { crisisDetectionMiddleware, detectCrisis, HELPLINE_RESPONSE };
