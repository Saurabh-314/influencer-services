const submissionController = require('../controllers/submission.controller');
const { authenticateUser, authorizeRoles } = require('../middleware/auth.middleware');

module.exports = async function (fastify, opts) {
    fastify.post('/', { preHandler: [authenticateUser, authorizeRoles('creator')] }, submissionController.submitCampaign);
    fastify.patch('/:id/approve', { preHandler: [authenticateUser, authorizeRoles('admin')] }, submissionController.approveSubmission);
};

