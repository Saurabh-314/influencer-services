const analyticsController = require('../../controllers/analytics.controller');
const { authenticateUser, authorizeRoles } = require('../../middleware/auth.middleware');

async function analyticsRoutes(fastify) {
    fastify.get('/stats', { preHandler: [authenticateUser] }, analyticsController.getStats);
    fastify.get('/brand-overview', { preHandler: [authenticateUser, authorizeRoles('brand', 'admin')] }, analyticsController.getBrandOverview);
    fastify.get('/earnings', { preHandler: [authenticateUser, authorizeRoles('creator')] }, analyticsController.getEarnings);
}

module.exports = analyticsRoutes;
