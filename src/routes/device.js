const { authenticate } = require('../middleware/auth');
const { checkSessionTimeout } = require('../middleware/sessionTimeout');
const deviceController = require('../controllers/deviceController');

module.exports = async function (fastify, opts) {
  fastify.addHook('preHandler', authenticate);
  fastify.addHook('preHandler', checkSessionTimeout);

  // Device management
  fastify.post('/register', deviceController.registerDevice);
  fastify.post('/verify', deviceController.verifyDeviceIntegrity);
  fastify.get('/list', deviceController.listDevices);

  // Biometric challenge/verify
  fastify.post('/bio/challenge', deviceController.createBiometricChallenge);
  fastify.post('/bio/verify', deviceController.verifyBiometric);
};
