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
    console.error('Redis connection error:', error.message);
});


const syncQueue = new Queue('sync-queue', { connection });

syncQueue.on('error', (error) => {
    console.error('Sync Queue error:', error.message);
});


// Schedule daily sync job
const scheduleDailySync = async () => {
    // Remove existing repeatable jobs to avoid duplicates on restart
    const repeatableJobs = await syncQueue.getRepeatableJobs();
    for (const job of repeatableJobs) {
        await syncQueue.removeRepeatableByKey(job.key);
    }

    await syncQueue.add('daily-sync', {}, {
        repeat: {
            pattern: '0 0 * * *' // Every day at midnight
        }
    });
};

scheduleDailySync();

module.exports = { syncQueue, connection };

