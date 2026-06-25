const analyticsController = require('../../controllers/analytics.controller');
const { authenticateUser } = require('../../middleware/auth.middleware');

async function analyticsRoutes(fastify) {
    fastify.get('/stats', { preHandler: [authenticateUser] }, analyticsController.getStats);
}

module.exports = analyticsRoutes;
