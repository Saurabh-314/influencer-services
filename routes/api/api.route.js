const authRoutes = require('./auth.route.js');
const campaignRoutes = require('./campaign.route.js');
const submissionRoutes = require('./submission.route.js');
const leaderboardRoutes = require('./leaderboard.route.js');
const analyticsRoutes = require('./analytics.route.js');
const accountRoutes = require('./account.route.js');
const walletRoutes = require('./wallet.route.js');
const uploadRoutes = require('./upload.route.js');

async function apiRoutes(fastify) {
    fastify.register(authRoutes, { prefix: '/auth' });
    fastify.register(campaignRoutes, { prefix: '/campaigns' });
    fastify.register(submissionRoutes, { prefix: '/submissions' });
    fastify.register(leaderboardRoutes, { prefix: '/leaderboard' });
    fastify.register(analyticsRoutes, { prefix: '/analytics' });
    fastify.register(accountRoutes, { prefix: '/social-accounts' });
    fastify.register(walletRoutes, { prefix: '/wallet' });
    fastify.register(uploadRoutes, { prefix: '/uploads' });
}

module.exports = apiRoutes;
