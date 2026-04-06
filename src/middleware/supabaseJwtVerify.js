'use strict';
const jwt = require('jsonwebtoken');
const { createRemoteJWKSet, jwtVerify, errors: joseErrors } = require('jose');

function parseJwtParts(token) {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    return { header, payload };
  } catch {
    return null;
  }
}

/**
 * Verifies Supabase Auth access_token.
 * - HS256 (legacy): needs SUPABASE_JWT_SECRET
 * - RS256 / ES256 (current): verified via JWKS at {iss}/.well-known/jwks.json (no secret required)
 */
async function verifySupabaseAccessToken(token) {
  const parsed = parseJwtParts(token);
  if (!parsed) {
    const err = new Error('Malformed token');
    err.name = 'JsonWebTokenError';
    throw err;
  }

  const { alg } = parsed.header;
  if (!alg) {
    const err = new Error('Missing alg');
    err.name = 'JsonWebTokenError';
    throw err;
  }

  if (alg === 'HS256') {
    const secret = process.env.SUPABASE_JWT_SECRET;
    if (!secret) {
      const err = new Error('SUPABASE_JWT_SECRET is not set');
      err.code = 'MISSING_SECRET';
      throw err;
    }
    return jwt.verify(token, secret, { algorithms: ['HS256'] });
  }

  if (alg === 'RS256' || alg === 'ES256' || alg === 'EdDSA') {
    const { iss, aud } = parsed.payload;
    if (typeof iss !== 'string' || !iss.includes('supabase')) {
      const err = new Error('Invalid or unsupported issuer');
      err.name = 'JsonWebTokenError';
      throw err;
    }
    const jwksUrl = `${iss.replace(/\/$/, '')}/.well-known/jwks.json`;
    const JWKS = createRemoteJWKSet(new URL(jwksUrl));

    const verifyOpts = { issuer: iss };
    if (aud != null) {
      verifyOpts.audience = aud;
    }

    const { payload } = await jwtVerify(token, JWKS, verifyOpts);
    return payload;
  }

  const err = new Error(`Unsupported JWT algorithm: ${alg}`);
  err.name = 'JsonWebTokenError';
  throw err;
}

function isJwtExpiredError(err) {
  if (!err) return false;
  if (err.name === 'TokenExpiredError') return true;
  if (err instanceof joseErrors.JWTExpired) return true;
  return false;
}

module.exports = { verifySupabaseAccessToken, isJwtExpiredError };
