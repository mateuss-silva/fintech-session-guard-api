const { authenticate } = require('../middleware/auth');
const { checkSessionTimeout } = require('../middleware/sessionTimeout');
const portfolioController = require('../controllers/portfolioController');

module.exports = async function (fastify, opts) {
  fastify.addHook('preHandler', authenticate);
  fastify.addHook('preHandler', checkSessionTimeout);

  fastify.get('/', portfolioController.getPortfolio);
  fastify.get('/summary', portfolioController.getPortfolio);
  fastify.get('/stream', portfolioController.streamPortfolio);
  fastify.post('/stream', portfolioController.streamPortfolio);
};
