const { Queue } = require('bullmq');
const Redis = require('ioredis');

// Use REDIS_URL if available (Railway), otherwise fall back to individual env vars
const connection = process.env.REDIS_URL
    ? new Redis(process.env.REDIS_URL, {
        maxRetriesPerRequest: null,
        enableReadyCheck: false
    })
    : new Redis({
        host: process.env.REDIS_HOST || '127.0.0.1',
        port: process.env.REDIS_PORT || 6379,
        maxRetriesPerRequest: null,
        enableReadyCheck: false
    });

connection.on('error', (error) => {
    // console.error('Redis connection error (Campaign Queue):', error.message);
});

const campaignQueue = new Queue('campaign-queue', { connection });

campaignQueue.on('error', (error) => {
    // console.error('Campaign Queue error:', error.message);
});


module.exports = {
    campaignQueue,
    connection
};

