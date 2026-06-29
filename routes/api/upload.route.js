const { authenticateUser, authorizeRoles } = require('../../middleware/auth.middleware');
const uploadController = require('../../controllers/upload.controller');

async function uploadRoutes(fastify) {
    fastify.post('/campaign-image', {
        preHandler: [authenticateUser, authorizeRoles('brand')],
    }, uploadController.uploadCampaignImage);
}

module.exports = uploadRoutes;
