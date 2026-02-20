const { verifyAccessToken } = require('../utils/tokens');
const { queryOne } = require('../config/database');

/**
 * Authentication middleware
 * Verifies JWT access token and validates active session
 * Binds token to device — prevents token use from different device
 */
function authenticate(request, reply, done) {
  const authHeader = request.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    reply.code(401).send({
      error: 'MISSING_TOKEN',
      message: 'Access token is required',
    });
    return;
  }

  const token = authHeader.split(' ')[1];
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
    reply.code(401).send({
      error: 'SESSION_INVALID',
      message: 'Session has been invalidated. Please login again.',
    });
    return;
  }

  // Validate device binding
  if (decoded.deviceId && session.device_id && decoded.deviceId !== session.device_id) {
    const { runSql } = require('../config/database');
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
