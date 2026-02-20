const metaController = require('../controllers/metaController');

/**
 * @swagger
 * tags:
 *   name: Meta
 *   description: UI metadata and labels
 */

module.exports = async function (fastify, opts) {
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
  fastify.get('/labels', metaController.getAssetLabels);

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
  fastify.get('/security', metaController.getSecurityFeatures);
};
