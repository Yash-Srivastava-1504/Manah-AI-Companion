'use strict';
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { getDB } = require('../config/db');

function generateAccessToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '1h' }
  );
}

function generateRefreshToken(user) {
  return jwt.sign(
    { id: user.id },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d' }
  );
}

function storeRefreshToken(userId, token) {
  const db = getDB();
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  db.prepare(`
    INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES (?, ?, ?)
  `).run(userId, token, expiresAt);
}

// ── POST /api/auth/signup ─────────────────────────────────────────────────────
async function signup(req, res) {
  const { email, password, name } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }

  const db = getDB();
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase());
  if (existing) {
    return res.status(409).json({ error: 'An account with this email already exists' });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const displayName = name || email.split('@')[0];

  const insertResult = db.prepare(`
    INSERT INTO users (email, password_hash, name) VALUES (?, ?, ?)
  `).run(email.toLowerCase(), passwordHash, displayName);
  const userId = Number(insertResult.lastInsertRowid);

  // Create default settings
  db.prepare(`
    INSERT OR IGNORE INTO user_settings (user_id) VALUES (?)
  `).run(userId);

  const user = db.prepare('SELECT id, name, email, language, tone, avatar FROM users WHERE id = ?').get(userId);
  const accessToken = generateAccessToken(user);
  const refreshToken = generateRefreshToken(user);
  storeRefreshToken(userId, refreshToken);

  // Log event
  db.prepare(`INSERT INTO logs (user_id, action, detail) VALUES (?, 'signup', ?)`).run(userId, '{}');

  res.cookie('refreshToken', refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 30 * 24 * 60 * 60 * 1000,
  });

  return res.status(201).json({ token: accessToken, refreshToken, user });
}

// ── POST /api/auth/login ──────────────────────────────────────────────────────
async function login(req, res) {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  const db = getDB();
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase());

  if (!user) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  // Update last_login
  db.prepare(`UPDATE users SET last_login = datetime('now') WHERE id = ?`).run(user.id);

  const accessToken = generateAccessToken(user);
  const refreshToken = generateRefreshToken(user);
  storeRefreshToken(user.id, refreshToken);

  db.prepare(`INSERT INTO logs (user_id, action, detail) VALUES (?, 'login', ?)`).run(user.id, '{}');

  res.cookie('refreshToken', refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 30 * 24 * 60 * 60 * 1000,
  });

  return res.json({
    token: accessToken,
    refreshToken,
    user: { id: user.id, name: user.name, email: user.email, language: user.language, tone: user.tone, avatar: user.avatar },
  });
}

// ── POST /api/auth/refresh ────────────────────────────────────────────────────
function refresh(req, res) {
  const incomingToken = req.body.refreshToken || req.cookies?.refreshToken;
  if (!incomingToken) {
    return res.status(401).json({ error: 'Refresh token required' });
  }

  let decoded;
  try {
    decoded = jwt.verify(incomingToken, process.env.JWT_REFRESH_SECRET);
  } catch {
    return res.status(401).json({ error: 'Invalid or expired refresh token' });
  }

  const db = getDB();
  const stored = db.prepare(`
    SELECT * FROM refresh_tokens WHERE token = ? AND user_id = ? AND expires_at > datetime('now')
  `).get(incomingToken, decoded.id);

  if (!stored) {
    return res.status(401).json({ error: 'Refresh token has been revoked or expired' });
  }

  const user = db.prepare('SELECT id, email, name FROM users WHERE id = ?').get(decoded.id);
  if (!user) return res.status(401).json({ error: 'User not found' });

  const newAccessToken = generateAccessToken(user);
  return res.json({ token: newAccessToken });
}

// ── POST /api/auth/logout ─────────────────────────────────────────────────────
function logout(req, res) {
  const token = req.body.refreshToken || req.cookies?.refreshToken;
  if (token) {
    try {
      const db = getDB();
      db.prepare('DELETE FROM refresh_tokens WHERE token = ?').run(token);
    } catch (_) { /* ignore */ }
  }
  res.clearCookie('refreshToken');
  return res.json({ message: 'Logged out successfully' });
}

module.exports = { signup, login, refresh, logout };
