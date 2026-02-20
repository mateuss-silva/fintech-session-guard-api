const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { checkSessionTimeout } = require('../middleware/sessionTimeout');
const deviceController = require('../controllers/deviceController');

// All device routes require authentication + session check
router.use(authenticate, checkSessionTimeout);

// Device management
router.post('/register', deviceController.registerDevice);
router.post('/verify', deviceController.verifyDeviceIntegrity);
router.get('/list', deviceController.listDevices);

// Biometric challenge/verify
router.post('/bio/challenge', deviceController.createBiometricChallenge);
router.post('/bio/verify', deviceController.verifyBiometric);

module.exports = router;
