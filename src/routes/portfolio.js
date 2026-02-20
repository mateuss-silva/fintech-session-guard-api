const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { checkSessionTimeout } = require('../middleware/sessionTimeout');
const portfolioController = require('../controllers/portfolioController');

// All portfolio routes require authentication + session check
router.use(authenticate, checkSessionTimeout);


router.get('/', portfolioController.getPortfolio);

module.exports = router;
