const leaderboardController = require('../../controllers/leaderboard.controller');
const { authenticateUser } = require('../../middleware/auth.middleware');

async function leaderboardRoutes(fastify) {
    fastify.get('/', { preHandler: [authenticateUser] }, leaderboardController.getLeaderboard);
}

module.exports = leaderboardRoutes;
