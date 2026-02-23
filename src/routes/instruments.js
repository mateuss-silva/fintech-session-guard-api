const { authenticate } = require('../middleware/auth');
const { checkSessionTimeout } = require('../middleware/sessionTimeout');
const instrumentController = require('../controllers/instrumentController');

module.exports = async function (fastify, opts) {
  fastify.get(
    '/:id/history',
    { preHandler: [authenticate, checkSessionTimeout] },
    instrumentController.getInstrumentHistory
  );
};
