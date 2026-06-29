require('dotenv').config();

const fastify = require('fastify')({ logger: true });
const path = require('path');
const { startPayoutReleaseJob } = require('./jobs/releasePayouts');

fastify.register(require('@fastify/helmet'), {
    crossOriginResourcePolicy: { policy: 'cross-origin' },
});
fastify.register(require('@fastify/formbody'));
fastify.register(require('@fastify/multipart'), {
    limits: {
        fileSize: 5 * 1024 * 1024,
        files: 1,
    },
});
fastify.register(require('@fastify/static'), {
    root: path.join(__dirname, 'uploads'),
    prefix: '/uploads/',
});

fastify.register(require('@fastify/cors'), {
    origin: [
        'https://app.melotap.com',
        'http://localhost:5173',
        'http://localhost:3000',
    ],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    credentials: true,
});

fastify.addHook('onRequest', (request, reply, done) => {
    reply.json = (data) => reply.send(data);
    done();
});

fastify.register(require('./routes/api/api.route'), { prefix: '/api' });

fastify.get('/', async (request, reply) => {
    return { message: 'Welcome to Influencer Marketing Platform API' };
});

fastify.setErrorHandler((error, request, reply) => {
    fastify.log.error(error);
    reply.status(error.statusCode || 500).send({
        success: false,
        message: error.message || 'Internal Server Error',
    });
});

const PORT = process.env.PORT || 5000;

const start = async () => {
    try {
        await fastify.listen({ port: PORT, host: '0.0.0.0' });
        console.log(`Server is running on port ${PORT}`);
        startPayoutReleaseJob(fastify.log);
    } catch (err) {
        fastify.log.error(err);
        process.exit(1);
    }
};

start();

module.exports = fastify;
