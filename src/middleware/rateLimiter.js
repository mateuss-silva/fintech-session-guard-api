const rateLimit = require('express-rate-limit');

/**
 * Global rate limiter — 100 requests per 15 minutes
 */
const globalLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10),
  max: parseInt(process.env.RATE_LIMIT_MAX || '100', 10),
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'RATE_LIMIT_EXCEEDED',
    message: 'Too many requests. Please try again later.',
  },
  skip: (req, res) => req.path.includes('/stream'),
});

/**
 * Auth-specific rate limiter — 5 attempts per 15 minutes (anti brute-force)
 */
const authLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10),
  max: parseInt(process.env.AUTH_RATE_LIMIT_MAX || '5', 10),
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'AUTH_RATE_LIMIT_EXCEEDED',
    message: 'Too many authentication attempts. Please try again later.',
  },
});

/**
 * Sensitive operations rate limiter — 3 attempts per 5 minutes
 */
const sensitiveLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'SENSITIVE_RATE_LIMIT_EXCEEDED',
    message: 'Too many sensitive operation attempts. Please try again later.',
  },
});

module.exports = { globalLimiter, authLimiter, sensitiveLimiter };
