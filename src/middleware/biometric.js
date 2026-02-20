const { queryOne, runSql } = require('../config/database');

/**
 * Biometric verification middleware
 * Requires a valid, non-expired biometric challenge token for sensitive operations
 */
function requireBiometric(operationType) {
  return (req, res, next) => {
    const biometricToken = req.headers['x-biometric-token'];

    if (!biometricToken) {
      return res.status(403).json({
        error: 'BIOMETRIC_REQUIRED',
        message: `Biometric verification is required for ${operationType} operations`,
        operationType,
      });
    }

    const challenge = queryOne(
      'SELECT * FROM biometric_challenges WHERE challenge_token = ? AND user_id = ? AND verified = 1 AND operation_type = ?',
      [biometricToken, req.user.id, operationType]
    );

    if (!challenge) {
      return res.status(403).json({
        error: 'BIOMETRIC_INVALID',
        message: 'Biometric challenge is invalid, not verified, or does not match operation type',
      });
    }

    // Check if challenge has expired
    const expiresAt = new Date(challenge.expires_at).getTime();
    if (Date.now() > expiresAt) {
      return res.status(403).json({
        error: 'BIOMETRIC_EXPIRED',
        message: 'Biometric challenge has expired. Please request a new one.',
      });
    }

    // Mark challenge as consumed (one-time use)
    runSql('DELETE FROM biometric_challenges WHERE id = ?', [challenge.id]);

    req.biometricVerified = true;
    next();
  };
}

module.exports = { requireBiometric };
