'use strict';
const { verifySupabaseAccessToken, isJwtExpiredError } = require('./supabaseJwtVerify');

/**
 * Verifies Supabase Auth JWT from Authorization: Bearer <access_token>.
 * HS256 (legacy secret) or RS256/ES256 via JWKS — see supabaseJwtVerify.js.
 * Sets req.supabaseUser = { id: sub (uuid), email }.
 */
function supabaseAuthMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authorization Bearer token required' });
  }

  const token = authHeader.slice(7).trim();
  if (!token) {
    return res.status(401).json({ error: 'Authorization Bearer token required' });
  }

  verifySupabaseAccessToken(token)
    .then((decoded) => {
      const sub = decoded.sub;
      if (!sub) {
        return res.status(401).json({ error: 'Invalid token payload' });
      }
      req.supabaseUser = {
        id: typeof sub === 'string' ? sub : String(sub),
        email: typeof decoded.email === 'string' ? decoded.email : null,
      };
      return next();
    })
    .catch((err) => {
      if (err.code === 'MISSING_SECRET') {
        console.error('[AUTH]', err.message);
        return res.status(500).json({ error: 'Server missing Supabase JWT configuration' });
      }
      if (isJwtExpiredError(err)) {
        return res.status(401).json({ error: 'Token expired', code: 'TOKEN_EXPIRED' });
      }
      console.error('[AUTH] JWT verify failed:', err.name || err.constructor?.name, err.message);
      return res.status(401).json({ error: 'Invalid token', code: 'INVALID_TOKEN' });
    });
}

module.exports = { supabaseAuthMiddleware };
