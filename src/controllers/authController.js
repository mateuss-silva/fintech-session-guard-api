const { v4: uuidv4 } = require('uuid');
const { queryOne, queryAll, runSql } = require('../config/database');
const { hashPassword, comparePassword } = require('../utils/crypto');
const {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
  hashToken,
  calculateExpiry,
} = require('../utils/tokens');
const {
  ValidationError,
  AuthError,
  ConflictError,
  AppError
} = require('../utils/errors');
const { logger } = require('../middleware/logger');

const REFRESH_EXPIRY = process.env.REFRESH_TOKEN_EXPIRY || '7d';

/**
 * @swagger
 * /api/auth/register:
 *   post:
 *     summary: Register a new user
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password, name]
 *             properties:
 *               email: { type: string, format: email, example: "user@example.com" }
 *               password: { type: string, minLength: 8, example: "SecurePass123!" }
 *               name: { type: string, example: "John Doe" }
 *     responses:
 *       201:
 *         description: User created successfully
 *       400:
 *         description: Validation error or weak password
 *       409:
 *         description: User already exists
 */
async function register(req, reply) {
  try {
    const { email, password, name } = req.body;

    if (!email || !password || !name) {
      throw new ValidationError('Email, password, and name are required');
    }

    if (password.length < 8) {
      throw new ValidationError('Password must be at least 8 characters long', 'WEAK_PASSWORD');
    }

    const existing = queryOne('SELECT id FROM users WHERE email = ?', [email]);

    if (existing) {
      throw new ConflictError('A user with this email already exists', 'USER_EXISTS');
    }

    const userId = uuidv4();
    const passwordHash = await hashPassword(password);

    runSql('INSERT INTO users (id, email, password_hash, name) VALUES (?, ?, ?, ?)',
      [userId, email, passwordHash, name]);

    logger.success(`👤 User registered: ${email}`, { userId });

    return reply.code(201).send({
      message: 'User registered successfully',
      userId,
    });
  } catch (error) {
    logger.error(`❌ Registration failed for ${req.body.email}: ${error.message}`);
    throw error;
  }
}

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     summary: Authenticate user and return session tokens
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email: { type: string, format: email, example: "demo@fintech.com" }
 *               password: { type: string, example: "Demo@2024!" }
 *               deviceId: { type: string, description: "Unique identifier for the device", example: "uuid-device-123" }
 *     responses:
 *       200:
 *         description: Login successful. Returns Access and Refresh tokens.
 *       401:
 *         description: Invalid credentials
 */
async function login(req, reply) {
  try {
    const { email, password, deviceId } = req.body;

    if (!email || !password) {
      throw new ValidationError('Email and password are required');
    }

    const user = queryOne('SELECT * FROM users WHERE email = ?', [email]);

    if (!user) {
      throw new AuthError('Invalid email or password', 'INVALID_CREDENTIALS');
    }

    const passwordMatch = await comparePassword(password, user.password_hash);
    if (!passwordMatch) {
      throw new AuthError('Invalid email or password', 'INVALID_CREDENTIALS');
    }

    // Generate tokens
    const { token: accessToken, jti } = generateAccessToken(user.id, deviceId);
    const { token: refreshToken, tokenId, familyId } = generateRefreshToken(user.id, null, deviceId);

    // Store refresh token hash
    const tokenHash = hashToken(refreshToken);
    const expiresAt = calculateExpiry(REFRESH_EXPIRY);

    runSql(
      'INSERT INTO refresh_tokens (id, user_id, token_hash, device_id, family_id, expires_at) VALUES (?, ?, ?, ?, ?, ?)',
      [tokenId, user.id, tokenHash, deviceId || null, familyId, expiresAt.toISOString()]
    );

    // Create session
    const sessionId = uuidv4();
    runSql(
      'INSERT INTO sessions (id, user_id, device_id, token_jti, ip_address, user_agent) VALUES (?, ?, ?, ?, ?, ?)',
      [sessionId, user.id, deviceId || null, jti, req.ip, req.headers['user-agent'] || '']
    );

    logger.success(`🔑 Login successful: ${email}`, { userId: user.id, deviceId: deviceId || 'unknown' });

    return reply.send({
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      }
    });
  } catch (error) {
    logger.warn(`🚫 Login failed for ${req.body?.email}: ${error.message}`);
    throw error;
  }
}

/**
 * @swagger
 * /api/auth/refresh:
 *   post:
 *     summary: Rotate tokens using a refresh token
 *     description: Implements token rotation. If a refresh token is reused, all tokens in the family are revoked for security.
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [refreshToken]
 *             properties:
 *               refreshToken: { type: string }
 *               deviceId: { type: string }
 *     responses:
 *       200:
 *         description: Tokens refreshed successfully
 *       401:
 *         description: Invalid refresh token or reuse detected
 */
async function refresh(req, reply) {
  try {
    const { refreshToken, deviceId } = req.body;

    if (!refreshToken) {
      throw new ValidationError('Refresh token is required');
    }

    // Verify the JWT
    const decoded = verifyRefreshToken(refreshToken);
    if (!decoded) {
      throw new AuthError('Refresh token is invalid or expired', 'INVALID_REFRESH_TOKEN');
    }

    const tokenHash = hashToken(refreshToken);

    // Find the stored refresh token
    const storedToken = queryOne(
      'SELECT * FROM refresh_tokens WHERE token_hash = ? AND user_id = ?',
      [tokenHash, decoded.sub]
    );

    if (!storedToken) {
      throw new AuthError('Refresh token not found', 'INVALID_REFRESH_TOKEN');
    }

    // 🚨 REUSE DETECTION: If token is already revoked, someone stole it!
    if (storedToken.revoked) {
      console.warn(`⚠️ SECURITY ALERT: Refresh token reuse detected for user ${decoded.sub}!`);
      console.warn(`   Family: ${storedToken.family_id} — Revoking ALL tokens in family`);

      // Revoke ALL tokens in this family
      runSql(
        'UPDATE refresh_tokens SET revoked = 1, revoked_at = CURRENT_TIMESTAMP WHERE family_id = ?',
        [storedToken.family_id]
      );

      // Invalidate ALL active sessions for this user
      runSql('UPDATE sessions SET is_active = 0 WHERE user_id = ?', [decoded.sub]);

      throw new AuthError('Security violation: token reuse detected. All sessions have been invalidated.', 'TOKEN_REUSE_DETECTED');
    }

    // Revoke the current refresh token
    runSql(
      'UPDATE refresh_tokens SET revoked = 1, revoked_at = CURRENT_TIMESTAMP WHERE id = ?',
      [storedToken.id]
    );

    // Invalidate old session(s) for this specific device (if provided)
    // This prevents a refresh on one device from killing sessions on another.
    if (deviceId) {
      runSql('UPDATE sessions SET is_active = 0 WHERE user_id = ? AND device_id = ? AND is_active = 1', [decoded.sub, deviceId]);
    } else {
      // If no device ID, we fallback to invalidating all (though modern apps should always have deviceId)
      runSql('UPDATE sessions SET is_active = 0 WHERE user_id = ? AND is_active = 1', [decoded.sub]);
    }

    // Generate new token pair (same family)
    const { token: newAccessToken, jti } = generateAccessToken(decoded.sub, deviceId);
    const { token: newRefreshToken, tokenId: newTokenId } = generateRefreshToken(
      decoded.sub, storedToken.family_id, deviceId
    );

    // Store new refresh token
    const newTokenHash = hashToken(newRefreshToken);
    const expiresAt = calculateExpiry(REFRESH_EXPIRY);

    runSql(
      'INSERT INTO refresh_tokens (id, user_id, token_hash, device_id, family_id, expires_at) VALUES (?, ?, ?, ?, ?, ?)',
      [newTokenId, decoded.sub, newTokenHash, deviceId || null, storedToken.family_id, expiresAt.toISOString()]
    );

    // Create new session
    const sessionId = uuidv4();
    runSql(
      'INSERT INTO sessions (id, user_id, device_id, token_jti, ip_address, user_agent) VALUES (?, ?, ?, ?, ?, ?)',
      [sessionId, decoded.sub, deviceId || null, jti, req.ip, req.headers['user-agent'] || '']
    );

    logger.info(`🔄 Token refresh successful for user ${decoded.sub}`);

    return reply.send({
      message: 'Tokens refreshed successfully',
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
      tokenType: 'Bearer',
      expiresIn: process.env.ACCESS_TOKEN_EXPIRY || '15m',
    });
  } catch (error) {
    logger.error(`❌ Token refresh failed: ${error.message}`);
    throw error;
  }
}

/**
 * @swagger
 * /api/auth/logout:
 *   post:
 *     summary: Log out current user and invalidate session
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               refreshToken: { type: string }
 *     responses:
 *       200:
 *         description: Logged out successfully
 */
function logout(req, reply) {
  try {
    const { refreshToken } = req.body;

    // Invalidate the current session
    if (req.user) {
      runSql('UPDATE sessions SET is_active = 0 WHERE id = ?', [req.user.sessionId]);
    }

    // Revoke refresh token if provided
    if (refreshToken) {
      const tokenHash = hashToken(refreshToken);
      runSql(
        'UPDATE refresh_tokens SET revoked = 1, revoked_at = CURRENT_TIMESTAMP WHERE token_hash = ?',
        [tokenHash]
      );
    }

    logger.info(`👋 Logout successful`, { userId: req.user?.id });
    return reply.send({ message: 'Logged out successfully' });
  } catch (error) {
    logger.error(`❌ Logout failed: ${error.message}`);
    throw error;
  }
}

/**
 * @swagger
 * /api/auth/sessions:
 *   get:
 *     summary: List all active sessions for the current user
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of active sessions
 */
function listSessions(req, reply) {
  try {
    const sessions = queryAll(
      'SELECT id, device_id, ip_address, user_agent, last_activity, created_at FROM sessions WHERE user_id = ? AND is_active = 1 ORDER BY last_activity DESC',
      [req.user.id]
    );

    return reply.send({ sessions });
  } catch (error) {
    throw error;
  }
}

/**
 * @swagger
 * /api/auth/sessions/{sessionId}:
 *   delete:
 *     summary: Revoke a specific active session
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: sessionId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Session revoked successfully
 *       404:
 *         description: Session not found
 */
function revokeSession(req, reply) {
  const { NotFoundError } = require('../utils/errors');
  try {
    const { sessionId } = req.params;
    const result = runSql(
      'UPDATE sessions SET is_active = 0 WHERE id = ? AND user_id = ?',
      [sessionId, req.user.id]
    );

    if (result.changes === 0) {
      throw new NotFoundError('Session not found');
    }

    return reply.send({ message: 'Session revoked successfully' });
  } catch (error) {
    throw error;
  }
}

/**
 * @swagger
 * /api/auth/verify-pin:
 *   post:
 *     summary: Verify transaction PIN
 *     description: Returns a short-lived challenge token for sensitive operations.
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [pin]
 *             properties:
 *               pin: { type: string, pattern: "^[0-9]{4}$", example: "1234" }
 *     responses:
 *       200:
 *         description: PIN verified. Returns challenge token.
 *       401:
 *         description: Invalid PIN
 */
async function verifyPin(req, reply) {
  try {
    const { pin } = req.body;

    if (!pin) {
      throw new ValidationError('PIN is required');
    }

    const user = queryOne('SELECT * FROM users WHERE id = ?', [req.user.id]);

    if (!user.pin_hash) {
      throw new ValidationError('User does not have a PIN set', 'PIN_NOT_SET');
    }

    const pinMatch = await comparePassword(pin, user.pin_hash);
    if (!pinMatch) {
      throw new AuthError('Invalid PIN', 'INVALID_PIN');
    }

    // Generate a "biometric" challenge token effectively signed by PIN
    const challengeToken = uuidv4();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes validity

    runSql(
      'INSERT INTO biometric_challenges (id, user_id, challenge_token, operation_type, expires_at, verified, verified_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [uuidv4(), req.user.id, challengeToken, 'PIN_VERIFICATION', expiresAt.toISOString(), 1, new Date().toISOString()]
    );

    logger.info(`✅ PIN verified for user ${req.user.id}`);

    return reply.send({
      message: 'PIN verified',
      challengeToken,
    });
  } catch (error) {
    logger.warn(`🚫 PIN verification failed for user ${req.user?.id}: ${error.message}`);
    throw error;
  }
}

async function getPinStatus(req, reply) {
  const user = queryOne('SELECT pin_hash FROM users WHERE id = ?', [req.user.id]);
  return reply.send({ hasPinConfigured: !!(user && user.pin_hash) });
}

async function setPin(req, reply) {
  try {
    const { pin } = req.body;
    if (!pin || pin.length !== 4 || !/^\d{4}$/.test(pin)) {
      throw new ValidationError('PIN must be exactly 4 digits', 'INVALID_PIN_FORMAT');
    }
    const pinHash = await hashPassword(pin);
    runSql('UPDATE users SET pin_hash = ? WHERE id = ?', [pinHash, req.user.id]);
    return reply.send({ message: 'PIN configured successfully' });
  } catch (error) {
    throw error;
  }
}

async function getBiometricChallenge(req, reply) {
  try {
    const challenge = uuidv4();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes validity

    runSql(
      'INSERT INTO biometric_challenges (id, user_id, challenge_token, operation_type, expires_at) VALUES (?, ?, ?, ?, ?)',
      [uuidv4(), req.user.id, challenge, 'BIOMETRIC_AUTH', expiresAt.toISOString()]
    );

    logger.info(`🛡️ [HANDSHAKE] Biometric challenge generated for user ${req.user.id}: ${challenge}`);
    return reply.send({ challenge });
  } catch (error) {
    logger.error(`❌ Failed to generate biometric challenge: ${error.message}`);
    throw error;
  }
}

async function verifyBiometric(req, reply) {
  try {
    const { challenge, signature } = req.body;

    if (!challenge || !signature) {
      throw new ValidationError('Challenge and signature are required');
    }

    // In this challenge/demo, we accept a dummy signature 'local-auth-success-' + challenge
    // In a real production app, this would involve verifying a cryptographic signature
    const expectedSignature = `local-auth-success-${challenge}`;
    if (signature !== expectedSignature) {
      throw new AuthError('Invalid biometric signature', 'INVALID_SIGNATURE');
    }

    logger.debug(`🤝 [HANDSHAKE] Verifying biometric signature for challenge: ${challenge}`);

    // Find the challenge in the DB
    const storedChallenge = queryOne(
      'SELECT * FROM biometric_challenges WHERE challenge_token = ? AND user_id = ? AND operation_type = ? AND expires_at > CURRENT_TIMESTAMP',
      [challenge, req.user.id, 'BIOMETRIC_AUTH']
    );

    if (!storedChallenge) {
      throw new AuthError('Invalid or expired biometric challenge', 'INVALID_CHALLENGE');
    }

    // Mark as verified
    runSql(
      'UPDATE biometric_challenges SET verified = 1, verified_at = CURRENT_TIMESTAMP WHERE id = ?',
      [storedChallenge.id]
    );

    logger.success(`🔐 [HANDSHAKE] Biometric verification successful for user ${req.user.id}. Challenge ${challenge} is now marked as VERIFIED.`);

    // For simplicity in this demo, the challenge token itself becomes the biometricToken 
    // that the trade logic expects.
    logger.success(`🔐 Biometric verification successful for user ${req.user.id}`);
    return reply.send({ biometricToken: challenge });
  } catch (error) {
    logger.warn(`🚫 Biometric verification failed for user ${req.user?.id}: ${error.message}`);
    throw error;
  }
}

module.exports = {
  register,
  login,
  refresh,
  logout,
  listSessions,
  revokeSession,
  verifyPin,
  getPinStatus,
  setPin,
  getBiometricChallenge,
  verifyBiometric,
};
