require('dotenv').config();

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

const fastify = require('fastify')({
    logger: true,
    bodyLimit: MAX_UPLOAD_BYTES + (512 * 1024),
    ignoreTrailingSlash: true,
});
const path = require('path');
const { startPayoutReleaseJob } = require('./jobs/releasePayouts');

fastify.register(require('@fastify/helmet'), {
    crossOriginResourcePolicy: { policy: 'cross-origin' },
});
fastify.register(require('@fastify/formbody'));
fastify.register(require('@fastify/multipart'), {
    limits: {
        fileSize: MAX_UPLOAD_BYTES,
        files: 1,
        fields: 10,
        fieldSize: 1024,
        parts: 11,
    },
});
fastify.register(require('@fastify/static'), {
    root: path.join(__dirname, 'uploads'),
    prefix: '/uploads/',
});

const corsOrigins = [
    'https://app.melotap.com',
    'https://www.app.melotap.com',
    'https://melotap.com',
    'https://www.melotap.com',
    'http://localhost:5173',
    'https://localhost:5173',
    'http://localhost:3000',
];

if (process.env.CLIENT_URL) {
    const clientUrl = process.env.CLIENT_URL.replace(/\/$/, '');
    if (!corsOrigins.includes(clientUrl)) {
        corsOrigins.push(clientUrl);
    }
}

fastify.register(require('@fastify/cors'), {
    origin: corsOrigins,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'Origin', 'X-Requested-With'],
    exposedHeaders: ['Content-Disposition'],
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

    if (error.code === 'FST_REQ_FILE_TOO_LARGE' || error.statusCode === 413) {
        return reply.status(413).send({
            success: false,
            message: 'File is too large. Maximum upload size is 5MB.',
        });
    }

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
