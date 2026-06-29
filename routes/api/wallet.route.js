const { authenticateUser, authorizeRoles } = require('../../middleware/auth.middleware');
const walletController = require('../../controllers/wallet.controller');

async function walletRoutes(fastify) {
    fastify.get('/', { preHandler: [authenticateUser] }, walletController.getWallet);
    fastify.get('/transactions', { preHandler: [authenticateUser] }, walletController.getTransactions);
    fastify.post('/topup/order', { preHandler: [authenticateUser, authorizeRoles('brand')] }, walletController.createTopupOrder);
    fastify.post('/topup/verify', { preHandler: [authenticateUser, authorizeRoles('brand')] }, walletController.verifyTopup);
}

module.exports = walletRoutes;
