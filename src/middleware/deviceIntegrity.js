const { queryOne } = require('../config/database');

/**
 * Device integrity middleware
 * Blocks sensitive operations on devices with compromised integrity (root/jailbreak)
 */
function checkDeviceIntegrity(req, reply) {
  if (!req.user || !req.user.deviceId) {
    return;
  }

  const device = queryOne(
    'SELECT * FROM devices WHERE id = ? AND user_id = ?',
    [req.user.deviceId, req.user.id]
  );

  if (!device) {
    req.deviceIntegrity = 'unregistered';
    return;
  }

  if (device.integrity_status === 'compromised') {
    return reply.code(403).send({
      error: 'DEVICE_COMPROMISED',
      message: 'This device has been flagged as compromised (rooted/jailbroken). Sensitive operations are blocked.',
      recommendation: 'Please use a device with verified integrity.',
    });
  }

  req.deviceIntegrity = device.integrity_status;
  req.deviceTrusted = device.is_trusted === 1;
}

module.exports = { checkDeviceIntegrity };
