/**
 * Base application error class
 */
class AppError extends Error {
  constructor(message, statusCode, errorCode) {
    super(message);
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    this.isOperational = true; // Flag for predictable errors

    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * 400 - Validation or bad request
 */
class ValidationError extends AppError {
  constructor(message = 'Validation failed', errorCode = 'VALIDATION_ERROR') {
    super(message, 400, errorCode);
  }
}

/**
 * 401 - Authentication or Authorization failures
 */
class AuthError extends AppError {
  constructor(message = 'Unauthorized', errorCode = 'AUTH_REQUIRED') {
    super(message, 401, errorCode);
  }
}

/**
 * 403 - Permission denied
 */
class ForbiddenError extends AppError {
  constructor(message = 'Forbidden access', errorCode = 'FORBIDDEN') {
    super(message, 403, errorCode);
  }
}

/**
 * 404 - Resource not found
 */
class NotFoundError extends AppError {
  constructor(message = 'Resource not found', errorCode = 'NOT_FOUND') {
    super(message, 404, errorCode);
  }
}

/**
 * 409 - Data conflict (e.g. unique constraint)
 */
class ConflictError extends AppError {
  constructor(message = 'Resource already exists', errorCode = 'CONFLICT') {
    super(message, 409, errorCode);
  }
}

/**
 * 429 - Rate limit exceeded
 */
class RateLimitError extends AppError {
  constructor(message = 'Too many requests', errorCode = 'RATE_LIMIT_EXCEEDED') {
    super(message, 429, errorCode);
  }
}

module.exports = {
  AppError,
  ValidationError,
  AuthError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  RateLimitError
};
