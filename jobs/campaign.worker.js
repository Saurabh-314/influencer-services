const { Worker } = require('bullmq');
const { connection } = require('../queues/campaign.queue');

const worker = new Worker('campaign-queue', async (job) => {
    console.log(`Processing job ${job.id} of type ${job.name}`);

    if (job.name === 'syncAnalytics') {
        // Logic to sync social media analytics
    }
}, { connection });

worker.on('completed', (job) => {
    console.log(`Job ${job.id} completed!`);
});

worker.on('failed', (job, err) => {
    console.log(`Job ${job.id} failed with ${err.message}`);
});

module.exports = worker;
