// Options for @fastify/rate-limit

/**
 * Global rate limiter — 100 requests per 15 minutes
 */
const globalLimiterOptions = {
  timeWindow: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10),
  max: parseInt(process.env.RATE_LIMIT_MAX || '100', 10),
  errorResponseBuilder: function (request, context) {
    return {
      error: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many requests. Please try again later.',
    };
  }
};

/**
 * Auth-specific rate limiter — 5 attempts per 15 minutes (anti brute-force)
 */
const authLimiterConfig = {
  timeWindow: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10),
  max: parseInt(process.env.AUTH_RATE_LIMIT_MAX || '5', 10),
  errorResponseBuilder: function (request, context) {
    return {
      error: 'AUTH_RATE_LIMIT_EXCEEDED',
      message: 'Too many authentication attempts. Please try again later.',
    };
  }
};

/**
 * Sensitive operations rate limiter — 3 attempts per 5 minutes
 */
const sensitiveLimiterConfig = {
  timeWindow: 5 * 60 * 1000,
  max: 3,
  errorResponseBuilder: function (request, context) {
    return {
      error: 'SENSITIVE_RATE_LIMIT_EXCEEDED',
      message: 'Too many sensitive operation attempts. Please try again later.',
    };
  }
};

module.exports = { globalLimiterOptions, authLimiterConfig, sensitiveLimiterConfig };
