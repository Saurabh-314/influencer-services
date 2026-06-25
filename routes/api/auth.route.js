const authController = require('../../controllers/auth.controller');

async function authRoutes(fastify) {
    fastify.post('/register', authController.register);
    fastify.post('/login', authController.login);
    fastify.post('/refresh-token', authController.refreshToken);
}

module.exports = authRoutes;
