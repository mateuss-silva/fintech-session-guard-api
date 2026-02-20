const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');

const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'default-access-secret';
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'default-refresh-secret';
const ACCESS_EXPIRY = process.env.ACCESS_TOKEN_EXPIRY || '15m';
const REFRESH_EXPIRY = process.env.REFRESH_TOKEN_EXPIRY || '7d';

/**
 * Generate an access token with a unique JTI for session binding
 */
function generateAccessToken(userId, deviceId = null) {
  const jti = uuidv4();
  const token = jwt.sign(
    {
      sub: userId,
      jti,
      deviceId,
      type: 'access',
    },
    ACCESS_SECRET,
    { expiresIn: ACCESS_EXPIRY }
  );
  return { token, jti };
}

/**
 * Generate a refresh token with family tracking for rotation detection
 */
function generateRefreshToken(userId, familyId = null, deviceId = null) {
  const tokenId = uuidv4();
  const family = familyId || uuidv4();

  const token = jwt.sign(
    {
      sub: userId,
      jti: tokenId,
      familyId: family,
      deviceId,
      type: 'refresh',
    },
    REFRESH_SECRET,
    { expiresIn: REFRESH_EXPIRY }
  );

  return { token, tokenId, familyId: family };
}

/**
 * Verify an access token
 */
function verifyAccessToken(token) {
  try {
    return jwt.verify(token, ACCESS_SECRET);
  } catch (error) {
    return null;
  }
}

/**
 * Verify a refresh token
 */
function verifyRefreshToken(token) {
  try {
    return jwt.verify(token, REFRESH_SECRET);
  } catch (error) {
    return null;
  }
}

/**
 * Hash a token for secure storage
 */
function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Calculate expiry date from JWT duration string
 */
function calculateExpiry(duration) {
  const match = duration.match(/^(\d+)([smhd])$/);
  if (!match) return new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // default 7d

  const value = parseInt(match[1]);
  const unit = match[2];

  const multipliers = {
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
  };

  return new Date(Date.now() + value * multipliers[unit]);
}

module.exports = {
  generateAccessToken,
  generateRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  hashToken,
  calculateExpiry,
};
