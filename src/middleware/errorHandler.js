/**
 * Global Error Handler Middleware
 */
const errorHandler = (err, request, reply) => {
  // Default values
  let statusCode = err.statusCode || 500;
  let errorCode = err.errorCode || 'INTERNAL_ERROR';
  let message = err.message || 'An unexpected error occurred';

  // Specific handling for non-AppError exceptions if needed
  if (err.name === 'SyntaxError' && err.status === 400 && 'body' in err) {
    errorCode = 'INVALID_JSON';
    message = 'Invalid JSON in request body';
    statusCode = 400;
  }

  // Log the error
  const { logger } = require('./logger');

  if (statusCode >= 500) {
    logger.error(`💥 Unhandled Exception: ${err.message}`, {
      url: request.url,
      method: request.method,
      stack: err.stack,
    });
  } else {
    // 4xx errors are usually operational/client errors
    logger.warn(`⚠️ API Error [${errorCode}]: ${message}`, {
      method: request.method,
      url: request.url
    });
  }

  reply.code(statusCode).send({
    error: errorCode,
    message: message,
    // Add stack trace only in development
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
};

module.exports = errorHandler;
