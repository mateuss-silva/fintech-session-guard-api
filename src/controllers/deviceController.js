const { queryOne, queryAll, runSql } = require('../config/database');
const { generateSecureToken } = require('../utils/crypto');
const { logger } = require('../middleware/logger');

/**
 * POST /api/device/register
 */
function registerDevice(req, reply) {
  try {
    const { deviceFingerprint, platform, model } = req.body;

    if (!deviceFingerprint || !platform) {
      return reply.code(400).send({
        error: 'VALIDATION_ERROR',
        message: 'Device fingerprint and platform are required',
      });
    }

    // Check if device already registered
    const existing = queryOne(
      'SELECT * FROM devices WHERE user_id = ? AND device_fingerprint = ?',
      [req.user.id, deviceFingerprint]
    );

    if (existing) {
      logger.info(`📱 Device already registered for user ${req.user.id}`, { deviceId: existing.id });
      return reply.send({
        message: 'Device already registered',
        device: {
          id: existing.id,
          platform: existing.platform,
          isTrusted: existing.is_trusted === 1,
          integrityStatus: existing.integrity_status,
        },
      });
    }

    const deviceId = uuidv4();

    runSql(
      'INSERT INTO devices (id, user_id, device_fingerprint, platform, model) VALUES (?, ?, ?, ?, ?)',
      [deviceId, req.user.id, deviceFingerprint, platform, model || '']
    );

    logger.success(`📱 New device registered: ${platform} ${model} for user ${req.user.id}`, { deviceId });

    return reply.code(201).send({
      message: 'Device registered successfully',
      device: {
        id: deviceId,
        platform,
        model: model || '',
        isTrusted: false,
        integrityStatus: 'unknown',
      },
    });
  } catch (error) {
    logger.error(`❌ Register device error for user ${req.user?.id}: ${error.message}`);
    throw error;
  }
}

/**
 * POST /api/device/verify
 */
function verifyDeviceIntegrity(req, reply) {
  try {
    const { deviceId, isRooted, isEmulator, hasDebugger } = req.body;

    if (!deviceId) {
      return reply.code(400).send({
        error: 'VALIDATION_ERROR',
        message: 'Device ID is required',
      });
    }

    const device = queryOne('SELECT * FROM devices WHERE id = ? AND user_id = ?',
      [deviceId, req.user.id]);

    if (!device) {
      return reply.code(404).send({
        error: 'DEVICE_NOT_FOUND',
        message: 'Device not found',
      });
    }

    let integrityStatus = 'verified';
    const flags = [];

    if (isRooted) {
      integrityStatus = 'compromised';
      flags.push('rooted_jailbroken');
    }
    if (isEmulator) {
      integrityStatus = 'compromised';
      flags.push('emulator_detected');
    }
    if (hasDebugger) {
      integrityStatus = 'suspicious';
      flags.push('debugger_attached');
    }

    runSql(
      'UPDATE devices SET integrity_status = ?, is_trusted = ? WHERE id = ?',
      [integrityStatus, integrityStatus === 'verified' ? 1 : 0, deviceId]
    );

    const response = {
      message: 'Device integrity verified',
      deviceId,
      integrityStatus,
      isTrusted: integrityStatus === 'verified',
    };

    if (flags.length > 0) {
      response.flags = flags;
      response.warning = 'Device integrity issues detected. Some features may be restricted.';
    }

    logger.info(`🛡️ Device integrity verified for user ${req.user.id}`, { deviceId, status: integrityStatus });

    return reply.send(response);
  } catch (error) {
    logger.error(`❌ Verify device error for user ${req.user?.id}: ${error.message}`);
    throw error;
  }
}

/**
 * GET /api/device/list
 */
function listDevices(req, reply) {
  try {
    const devices = queryAll(
      'SELECT id, platform, model, is_trusted, integrity_status, registered_at FROM devices WHERE user_id = ? ORDER BY registered_at DESC',
      [req.user.id]
    );

    logger.info(`📱 Device list fetched for user ${req.user.id}`);
    return reply.send({
      devices: devices.map((d) => ({
        id: d.id,
        platform: d.platform,
        model: d.model,
        isTrusted: d.is_trusted === 1,
        integrityStatus: d.integrity_status,
        registeredAt: d.registered_at,
      })),
    });
  } catch (error) {
    logger.error(`❌ List devices error for user ${req.user?.id}: ${error.message}`);
    throw error;
  }
}

/**
 * POST /api/bio/challenge
 */
function createBiometricChallenge(req, reply) {
  try {
    const { operationType } = req.body;
    const validOps = ['transfer', 'settings', 'password_change'];

    if (!operationType || !validOps.includes(operationType)) {
      return reply.code(400).send({
        error: 'VALIDATION_ERROR',
        message: `Operation type must be one of: ${validOps.join(', ')}`,
      });
    }

    const challengeId = uuidv4();
    const challengeToken = generateSecureToken(32);
    const expiresAt = new Date(Date.now() + 2 * 60 * 1000); // 2 minutes

    runSql(
      'INSERT INTO biometric_challenges (id, user_id, challenge_token, operation_type, expires_at) VALUES (?, ?, ?, ?, ?)',
      [challengeId, req.user.id, challengeToken, operationType, expiresAt.toISOString()]
    );

    logger.info(`🛡️ Biometric challenge created for user ${req.user.id}`, { operationType });
    return reply.send({
      message: 'Biometric challenge created',
      challengeToken,
      operationType,
      expiresAt: expiresAt.toISOString(),
      expiresInSeconds: 120,
    });
  } catch (error) {
    logger.error(`❌ Create challenge error for user ${req.user?.id}: ${error.message}`);
    throw error;
  }
}

/**
 * POST /api/bio/verify
 */
function verifyBiometric(req, reply) {
  try {
    const { challengeToken, biometricSuccess } = req.body;

    if (!challengeToken) {
      return reply.code(400).send({
        error: 'VALIDATION_ERROR',
        message: 'Challenge token is required',
      });
    }

    const challenge = queryOne(
      'SELECT * FROM biometric_challenges WHERE challenge_token = ? AND user_id = ?',
      [challengeToken, req.user.id]
    );

    if (!challenge) {
      return reply.code(404).send({
        error: 'CHALLENGE_NOT_FOUND',
        message: 'Biometric challenge not found',
      });
    }

    if (new Date(challenge.expires_at).getTime() < Date.now()) {
      runSql('DELETE FROM biometric_challenges WHERE id = ?', [challenge.id]);
      return reply.code(410).send({
        error: 'CHALLENGE_EXPIRED',
        message: 'Biometric challenge has expired. Request a new one.',
      });
    }

    if (!biometricSuccess) {
      return reply.code(403).send({
        error: 'BIOMETRIC_FAILED',
        message: 'Biometric verification failed on device',
      });
    }

    runSql(
      'UPDATE biometric_challenges SET verified = 1, verified_at = CURRENT_TIMESTAMP WHERE id = ?',
      [challenge.id]
    );

    logger.success(`🔐 Biometric verified successfully for user ${req.user.id}`, { operation: challenge.operation_type });

    return reply.send({
      message: 'Biometric verified successfully',
      challengeToken,
      operationType: challenge.operation_type,
      verified: true,
    });
  } catch (error) {
    logger.error(`❌ Verify biometric error for user ${req.user?.id}: ${error.message}`);
    throw error;
  }
}

module.exports = {
  registerDevice,
  verifyDeviceIntegrity,
  listDevices,
  createBiometricChallenge,
  verifyBiometric,
};
