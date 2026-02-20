const { authenticate } = require('../middleware/auth');
const { checkSessionTimeout } = require('../middleware/sessionTimeout');
const transactionController = require('../controllers/transactionController');

module.exports = async function (fastify, opts) {
  fastify.addHook('preHandler', authenticate);
  fastify.addHook('preHandler', checkSessionTimeout);

  fastify.get('/history', transactionController.getHistory);
};
