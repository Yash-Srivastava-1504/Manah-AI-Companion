'use strict';
const jwt = require('jsonwebtoken');

/**
 * Verifies JWT from Authorization header or cookie.
 * Attaches req.user = { id, email } on success.
 */
function authMiddleware(req, res, next) {
  let token = null;

  // 1. Check Authorization header: "Bearer <token>"
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  }

  // 2. Check signed cookie (for WebSocket fallback)
  if (!token && req.cookies && req.cookies.accessToken) {
    token = req.cookies.accessToken;
  }

  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = { id: decoded.id, email: decoded.email };
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired', code: 'TOKEN_EXPIRED' });
    }
    return res.status(401).json({ error: 'Invalid token' });
  }
}

/**
 * Verify a token string directly (used by WebSocket handler).
 * Returns decoded payload or throws.
 */
function verifyToken(token) {
  return jwt.verify(token, process.env.JWT_SECRET);
}

module.exports = { authMiddleware, verifyToken };
