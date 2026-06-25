const submissionController = require('../../controllers/submission.controller');
const { authenticateUser, authorizeRoles } = require('../../middleware/auth.middleware');

async function submissionRoutes(fastify) {
    fastify.post('/', { preHandler: [authenticateUser, authorizeRoles('creator')] }, submissionController.submitCampaign);
    fastify.patch('/:id/approve', { preHandler: [authenticateUser, authorizeRoles('admin')] }, submissionController.approveSubmission);
}

module.exports = submissionRoutes;
