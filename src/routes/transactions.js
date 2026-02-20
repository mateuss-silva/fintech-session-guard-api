const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { checkSessionTimeout } = require('../middleware/sessionTimeout');
const { requireBiometric } = require('../middleware/biometric');
const { checkDeviceIntegrity } = require('../middleware/deviceIntegrity');
const { sensitiveLimiter } = require('../middleware/rateLimiter');
const transactionController = require('../controllers/transactionController');

// All transaction routes require authentication + session check
router.use(authenticate, checkSessionTimeout);

// History — no biometric needed
router.get('/history', transactionController.getHistory);

// Sensitive operations — require biometric + device integrity + rate limiting


module.exports = router;
