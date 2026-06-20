const analyticsController = require('../controllers/analytics.controller');
const { authenticateUser } = require('../middleware/auth.middleware');

module.exports = async function (fastify, opts) {
    fastify.get('/stats', { preHandler: [authenticateUser] }, analyticsController.getStats);
};

