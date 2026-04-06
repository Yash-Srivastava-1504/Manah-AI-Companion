'use strict';
const rateLimit = require('express-rate-limit');

const rateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100,            // 100 requests per window per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please slow down and try again in a moment.' },
  handler: (req, res, next, options) => {
    console.warn(`[RATE_LIMIT] IP ${req.ip} exceeded limit`);
    res.status(options.statusCode).json(options.message);
  },
});

// Tighter limiter for auth routes (20 req/min)
const authRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many authentication attempts. Please try again later.' },
});

module.exports = { rateLimiter, authRateLimiter };
