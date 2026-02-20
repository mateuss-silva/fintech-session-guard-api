const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { checkSessionTimeout } = require('../middleware/sessionTimeout');
const { authLimiter } = require('../middleware/rateLimiter');
const authController = require('../controllers/authController');

// Public routes (with auth rate limiting)
router.post('/register', authLimiter, authController.register);
router.post('/login', authLimiter, authController.login);
router.post('/refresh', authLimiter, authController.refresh);

// Protected routes
router.post('/logout', authenticate, checkSessionTimeout, authController.logout);
router.get('/sessions', authenticate, checkSessionTimeout, authController.listSessions);
router.delete('/sessions/:sessionId', authenticate, checkSessionTimeout, authController.revokeSession);
router.post('/verify-pin', authenticate, checkSessionTimeout, authController.verifyPin);

module.exports = router;
