const adminController = require('../../controllers/admin.controller');
const { authenticateUser, authorizeRoles } = require('../../middleware/auth.middleware');

async function adminRoutes(fastify) {
    fastify.get('/creators', {
        preHandler: [authenticateUser, authorizeRoles('admin')],
    }, adminController.getCreators);

    fastify.get('/brands', {
        preHandler: [authenticateUser, authorizeRoles('admin')],
    }, adminController.getBrands);

    fastify.get('/creators/:id', {
        preHandler: [authenticateUser, authorizeRoles('admin')],
    }, adminController.getCreatorById);

    fastify.get('/brands/:id', {
        preHandler: [authenticateUser, authorizeRoles('admin')],
    }, adminController.getBrandById);

    fastify.post('/creators/:id/insights', {
        preHandler: [authenticateUser, authorizeRoles('admin')],
    }, adminController.getCreatorInsights);
}

module.exports = adminRoutes;
