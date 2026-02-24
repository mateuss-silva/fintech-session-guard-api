const { verifyAccessToken } = require('../utils/tokens');
const { queryOne } = require('../config/database');

/**
 * Authentication middleware
 * Verifies JWT access token and validates active session
 * Binds token to device — prevents token use from different device
 */
function authenticate(request, reply, done) {
  let token;
  const authHeader = request.headers.authorization;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  } else if (request.query && request.query.token) {
    token = request.query.token;
  } else if (request.body && request.body.token) {
    token = request.body.token;
  }

  if (!token) {
    reply.code(401).send({
      error: 'MISSING_TOKEN',
      message: 'Access token is required',
    });
    return;
  }

  const decoded = verifyAccessToken(token);

  if (!decoded) {
    reply.code(401).send({
      error: 'INVALID_TOKEN',
      message: 'Access token is invalid or expired',
    });
    return;
  }

  // Validate that the session is still active in the database
  const session = queryOne(
    'SELECT * FROM sessions WHERE token_jti = ? AND user_id = ? AND is_active = 1',
    [decoded.jti, decoded.sub]
  );

  if (!session) {
    const { logger } = require('./logger');
    logger.warn(`🚫 Unauthorized: Session not found or inactive for user ${decoded.sub}`);
    reply.code(401).send({
      error: 'SESSION_INVALID',
      message: 'Session has been invalidated. Please login again.',
    });
    return;
  }

  // Validate device binding
  if (decoded.deviceId && session.device_id && decoded.deviceId !== session.device_id) {
    const { runSql } = require('../config/database');
    const { logger } = require('./logger');
    logger.error(`⚠️ SECURITY ALERT: Device mismatch for user ${decoded.sub}. Session invalidated.`);
    runSql('UPDATE sessions SET is_active = 0 WHERE id = ?', [session.id]);
    reply.code(401).send({
      error: 'DEVICE_MISMATCH',
      message: 'Token used from unauthorized device. Session invalidated.',
    });
    return;
  }

  // Attach user info to request
  request.user = {
    id: decoded.sub,
    jti: decoded.jti,
    deviceId: decoded.deviceId,
    sessionId: session.id,
  };

  done();
}

module.exports = { authenticate };
