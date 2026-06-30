const { authenticateUser, authorizeRoles } = require('../../middleware/auth.middleware');
const submissionController = require('../../controllers/submission.controller');

async function submissionRoutes(fastify) {
    fastify.get('/mine', { preHandler: [authenticateUser, authorizeRoles('creator')] }, submissionController.getMySubmissions);
    fastify.get('/campaign/:campaignId', { preHandler: [authenticateUser, authorizeRoles('brand', 'admin')] }, submissionController.getCampaignSubmissions);
    fastify.post('/apply', { preHandler: [authenticateUser, authorizeRoles('creator')] }, submissionController.applyCampaign);
    fastify.patch('/:id/submit', { preHandler: [authenticateUser, authorizeRoles('creator')] }, submissionController.submitCampaignUrl);
    fastify.post('/', { preHandler: [authenticateUser, authorizeRoles('creator')] }, submissionController.submitCampaign);
    fastify.patch('/:id/approve', { preHandler: [authenticateUser, authorizeRoles('brand', 'admin')] }, submissionController.approveSubmission);
    fastify.patch('/:id/reject', { preHandler: [authenticateUser, authorizeRoles('brand', 'admin')] }, submissionController.rejectSubmission);
}

module.exports = submissionRoutes;
