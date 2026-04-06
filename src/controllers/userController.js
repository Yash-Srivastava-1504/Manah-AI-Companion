'use strict';
const { getDB } = require('../config/db');

// ── GET /api/user/profile ─────────────────────────────────────────────────────
function getProfile(req, res) {
  const db = getDB();
  const user = db.prepare('SELECT id, name, email, language, tone, avatar, created_at FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  return res.json(user);
}

// ── PUT /api/user/profile ─────────────────────────────────────────────────────
function updateProfile(req, res) {
  const { name, language, tone, avatar } = req.body;
  const allowed = { name, language, tone, avatar };

  // Validate language
  if (language && !['en', 'hi', 'hinglish'].includes(language)) {
    return res.status(400).json({ error: 'Invalid language. Must be en, hi, or hinglish.' });
  }
  // Validate tone
  if (tone && !['didi', 'bhaiya', 'friend'].includes(tone)) {
    return res.status(400).json({ error: 'Invalid tone. Must be didi, bhaiya, or friend.' });
  }

  const db = getDB();
  // Build dynamic SET clause for provided fields only
  const fields = Object.entries(allowed).filter(([, v]) => v !== undefined);
  if (fields.length === 0) {
    return res.status(400).json({ error: 'No fields to update' });
  }

  const setClauses = fields.map(([k]) => `${k} = ?`).join(', ');
  const values = fields.map(([, v]) => v);

  db.prepare(`UPDATE users SET ${setClauses} WHERE id = ?`).run(...values, req.user.id);

  const updated = db.prepare('SELECT id, name, email, language, tone, avatar FROM users WHERE id = ?').get(req.user.id);
  return res.json(updated);
}

// ── DELETE /api/user/account ──────────────────────────────────────────────────
function deleteAccount(req, res) {
  const db = getDB();
  // Cascade delete (foreign keys ON DELETE CASCADE handle the rest)
  db.prepare('DELETE FROM users WHERE id = ?').run(req.user.id);
  res.clearCookie('refreshToken');
  return res.json({ message: 'Account and all associated data deleted successfully.' });
}

module.exports = { getProfile, updateProfile, deleteAccount };
