const authController = require('../controllers/auth.controller');

module.exports = async function (fastify, opts) {
    fastify.post('/register', authController.register);
    fastify.post('/login', authController.login);
    fastify.post('/refresh-token', authController.refreshToken);
};

