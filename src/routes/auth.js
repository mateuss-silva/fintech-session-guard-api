const { authenticate } = require('../middleware/auth');
const { checkSessionTimeout } = require('../middleware/sessionTimeout');
const authController = require('../controllers/authController');

module.exports = async function (fastify, opts) {
  // Public routes
  fastify.post('/register', authController.register);
  fastify.post('/login', authController.login);
  fastify.post('/refresh', authController.refresh);

  // Protected routes
  fastify.post('/logout', { preHandler: [authenticate, checkSessionTimeout] }, authController.logout);
  fastify.get('/sessions', { preHandler: [authenticate, checkSessionTimeout] }, authController.listSessions);
  fastify.delete('/sessions/:sessionId', { preHandler: [authenticate, checkSessionTimeout] }, authController.revokeSession);
  fastify.post('/verify-pin', { preHandler: [authenticate, checkSessionTimeout] }, authController.verifyPin);
};
