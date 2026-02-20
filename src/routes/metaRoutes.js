const express = require('express');
const router = express.Router();
const metaController = require('../controllers/metaController');
const auth = require('../middleware/auth');

/**
 * @swagger
 * tags:
 *   name: Meta
 *   description: UI metadata and labels
 */

/**
 * @swagger
 * /api/meta/labels:
 *   get:
 *     summary: Get asset type labels for UI display
 *     tags: [Meta]
 *     responses:
 *       200:
 *         description: Map of internal keys to display names
 */
router.get('/labels', metaController.getAssetLabels);

/**
 * @swagger
 * /api/meta/security:
 *   get:
 *     summary: Get security features metadata for dashboard
 *     tags: [Meta]
 *     responses:
 *       200:
 *         description: Dashboard configuration and feature list
 */
router.get('/security', metaController.getSecurityFeatures);

module.exports = router;
