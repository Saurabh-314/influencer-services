const accountController = require('../../controllers/account.controller');
const { authenticateUser } = require('../../middleware/auth.middleware');

async function accountRoutes(fastify) {
    fastify.get('/', { preHandler: [authenticateUser] }, accountController.getConnectedAccounts);
    fastify.get('/connect/instagram', { preHandler: [authenticateUser] }, accountController.connectInstagram);
    // Register both forms — Instagram may redirect with or without a trailing slash.
    fastify.get('/callback/instagram', accountController.instagramCallback);
    fastify.get('/callback/instagram/', accountController.instagramCallback);
    fastify.post('/connect', { preHandler: [authenticateUser] }, accountController.connectAccount);
    fastify.get('/:id', { preHandler: [authenticateUser] }, accountController.getAccountDetail);
    fastify.post('/:id/sync', { preHandler: [authenticateUser] }, accountController.syncAccountData);
}

module.exports = accountRoutes;
