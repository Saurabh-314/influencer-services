const campaignController = require('../controllers/campaign.controller');
const { authenticateUser, authorizeRoles } = require('../middleware/auth.middleware');

module.exports = async function (fastify, opts) {
    fastify.get('/', { preHandler: [authenticateUser] }, campaignController.getAllCampaigns);
    fastify.get('/:id', { preHandler: [authenticateUser] }, campaignController.getCampaignById);
    fastify.post('/', { preHandler: [authenticateUser, authorizeRoles('admin')] }, campaignController.createCampaign);
};

