const accountController = require('../../controllers/account.controller');
const { authenticateUser } = require('../../middleware/auth.middleware');

async function accountRoutes(fastify) {
    fastify.get('/', { preHandler: [authenticateUser] }, accountController.getConnectedAccounts);
    fastify.get('/:id', { preHandler: [authenticateUser] }, accountController.getAccountDetail);
    fastify.post('/connect', { preHandler: [authenticateUser] }, accountController.connectAccount);
    fastify.get('/connect/instagram', { preHandler: [authenticateUser] }, accountController.connectInstagram);
    fastify.get('/callback/instagram', accountController.instagramCallback);
    fastify.post('/:id/sync', { preHandler: [authenticateUser] }, accountController.syncAccountData);
}

module.exports = accountRoutes;
