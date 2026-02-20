const { queryOne } = require('../config/database');

/**
 * Device integrity middleware
 * Blocks sensitive operations on devices with compromised integrity (root/jailbreak)
 */
function checkDeviceIntegrity(req, res, next) {
  if (!req.user || !req.user.deviceId) {
    return next();
  }

  const device = queryOne(
    'SELECT * FROM devices WHERE id = ? AND user_id = ?',
    [req.user.deviceId, req.user.id]
  );

  if (!device) {
    req.deviceIntegrity = 'unregistered';
    return next();
  }

  if (device.integrity_status === 'compromised') {
    return res.status(403).json({
      error: 'DEVICE_COMPROMISED',
      message: 'This device has been flagged as compromised (rooted/jailbroken). Sensitive operations are blocked.',
      recommendation: 'Please use a device with verified integrity.',
    });
  }

  req.deviceIntegrity = device.integrity_status;
  req.deviceTrusted = device.is_trusted === 1;
  next();
}

module.exports = { checkDeviceIntegrity };
