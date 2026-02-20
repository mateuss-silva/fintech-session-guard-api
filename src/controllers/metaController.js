/**
 * Controller for metadata and UI configuration.
 * Centralizes labels and descriptions to allow backend-driven UI updates.
 */

const assetLabels = {
  'renda_fixa': 'Fixed Income',
  'fii': 'REITs',
  'acao': 'Stocks',
  'crypto': 'Crypto',
  'currency': 'Currency'
};

const securityFeatures = [
  {
    id: 'token_rotation',
    icon: 'sync_lock_rounded',
    title: 'Token Rotation',
    description: 'Refresh tokens are rotated on every use. Reuse detection prevents session hijacking.',
    color: 'secondary'
  },
  {
    id: 'session_monitor',
    icon: 'timer_outlined',
    title: 'Session Monitor',
    description: '15-minute inactivity timeout (NIST AC-11). Client + server dual enforcement.',
    color: 'warning'
  },
  {
    id: 'biometric',
    icon: 'fingerprint',
    title: 'Biometric Verification',
    description: 'Required for transactions (OWASP M1). Backend challenge-response protocol.',
    color: 'profit'
  },
  {
    id: 'device_integrity',
    icon: 'security_rounded',
    title: 'Device Integrity',
    description: 'Root/jailbreak detection. Blocks compromised devices from sensitive operations.',
    color: 'loss'
  },
  {
    id: 'secure_storage',
    icon: 'storage_rounded',
    title: 'Secure Storage',
    description: 'Tokens in Keychain/Keystore (OWASP M9). Never uses SharedPreferences.',
    color: 'accent'
  }
];

function getAssetLabels(req, res) {
  res.json(assetLabels);
}

function getSecurityFeatures(req, res) {
  res.json({
    status: 'active',
    timeout: 15,
    features: securityFeatures
  });
}

module.exports = {
  getAssetLabels,
  getSecurityFeatures
};
