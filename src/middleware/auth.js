const { verifyAccessToken } = require('../utils/tokens');
const { queryOne } = require('../config/database');

/**
 * Authentication middleware
 * Verifies JWT access token and validates active session
 * Binds token to device — prevents token use from different device
 */
function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      error: 'MISSING_TOKEN',
      message: 'Access token is required',
    });
  }

  const token = authHeader.split(' ')[1];
  const decoded = verifyAccessToken(token);

  if (!decoded) {
    return res.status(401).json({
      error: 'INVALID_TOKEN',
      message: 'Access token is invalid or expired',
    });
  }

  // Validate that the session is still active in the database
  const session = queryOne(
    'SELECT * FROM sessions WHERE token_jti = ? AND user_id = ? AND is_active = 1',
    [decoded.jti, decoded.sub]
  );

  if (!session) {
    return res.status(401).json({
      error: 'SESSION_INVALID',
      message: 'Session has been invalidated. Please login again.',
    });
  }

  // Validate device binding
  if (decoded.deviceId && session.device_id && decoded.deviceId !== session.device_id) {
    const { runSql } = require('../config/database');
    runSql('UPDATE sessions SET is_active = 0 WHERE id = ?', [session.id]);
    return res.status(401).json({
      error: 'DEVICE_MISMATCH',
      message: 'Token used from unauthorized device. Session invalidated.',
    });
  }

  // Attach user info to request
  req.user = {
    id: decoded.sub,
    jti: decoded.jti,
    deviceId: decoded.deviceId,
    sessionId: session.id,
  };

  next();
}

module.exports = { authenticate };
