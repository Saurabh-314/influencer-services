const leaderboardController = require('../controllers/leaderboard.controller');
const { authenticateUser } = require('../middleware/auth.middleware');

module.exports = async function (fastify, opts) {
    fastify.get('/', { preHandler: [authenticateUser] }, leaderboardController.getLeaderboard);
};

