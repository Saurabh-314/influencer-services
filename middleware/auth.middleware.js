const jwt = require('jsonwebtoken');
const db = require('../models');
const users = db.models.users;

const authenticateUser = async (request, reply) => {
    try {
        const authHeader = request.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return reply.status(401).send({ success: false, message: 'No token provided' });
        }

        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        const user = await users.findByPk(decoded.id);
        if (!user) {
            return reply.status(401).send({ success: false, message: 'Invalid token' });
        }

        if (user.status !== 'active') {
            return reply.status(403).send({ success: false, message: 'User account is not active' });
        }

        request.user = user;
    } catch (error) {
        return reply.status(401).send({ success: false, message: 'Unauthorized' });
    }
};

const authorizeRoles = (...roles) => {
    return async (request, reply) => {
        if (!roles.includes(request.user.role)) {
            return reply.status(403).send({
                success: false,
                message: `Role (${request.user.role}) is not allowed to access this resource`,
            });
        }
    };
};

module.exports = {
    authenticateUser,
    authorizeRoles,
};
