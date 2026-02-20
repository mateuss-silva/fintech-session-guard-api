/**
 * Global Error Handler Middleware
 */
const errorHandler = (err, req, res, next) => {
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
  // In production, we'd use a real logger like Winston/Pino
  if (statusCode >= 500) {
    console.error('💥 Unhandled Exception:', {
      url: req.originalUrl,
      method: req.method,
      error: err.message,
      stack: err.stack,
    });
  } else {
    // 4xx errors are usually operational/client errors
    console.warn(`⚠️ API Error [${errorCode}]: ${message} (${req.method} ${req.originalUrl})`);
  }

  res.status(statusCode).json({
    error: errorCode,
    message: message,
    // Add stack trace only in development
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
};

module.exports = errorHandler;
