const fastify = require('fastify')({ logger: true });
const path = require('path');
const { sequelize } = require('./models');
require('dotenv').config();

// Initialize Workers
require('./jobs/sync.worker');

// Plugins
fastify.register(require('@fastify/helmet'));
fastify.register(require('@fastify/cors'));
fastify.register(require('@fastify/formbody'));
fastify.register(require('@fastify/static'), {
    root: path.join(__dirname, 'uploads'),
    prefix: '/uploads/',
});

// Express Compatibility Hook
fastify.addHook('onRequest', (request, reply, done) => {
    reply.json = (data) => reply.send(data);
    done();
});

// Routes Registration
fastify.register(require('./routes/auth.routes'), { prefix: '/api/auth' });
fastify.register(require('./routes/campaign.routes'), { prefix: '/api/campaigns' });
fastify.register(require('./routes/submission.routes'), { prefix: '/api/submissions' });
fastify.register(require('./routes/leaderboard.routes'), { prefix: '/api/leaderboard' });
fastify.register(require('./routes/analytics.routes'), { prefix: '/api/analytics' });
fastify.register(require('./routes/account.routes'), { prefix: '/api/social-accounts' });

fastify.get('/', async (request, reply) => {
    return { message: 'Welcome to Influencer Marketing Platform API' };
});

// Error Handler
fastify.setErrorHandler((error, request, reply) => {
    fastify.log.error(error);
    reply.status(error.statusCode || 500).send({
        success: false,
        message: error.message || 'Internal Server Error'
    });
});

const PORT = process.env.PORT || 5000;

const start = async () => {
    try {
        // await sequelize.authenticate();
        // console.log('Database connected successfully.');
        // await sequelize.sync({ alter: false });
        // console.log('Database synced successfully.');

        await fastify.listen({ port: PORT, host: '0.0.0.0' });
        console.log(`Server is running on port ${PORT}`);
    } catch (err) {
        fastify.log.error(err);
        process.exit(1);
    }
};

start();

module.exports = fastify;
