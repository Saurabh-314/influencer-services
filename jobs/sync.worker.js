const { Worker } = require('bullmq');
const axios = require('axios');
const { SocialAccount } = require('../models');
const { connection } = require('../queues/sync.queue');
const { calculateInfluencerScore } = require('../utils/scoring');

const syncWorker = new Worker('sync-queue', async (job) => {
    console.log(`Starting job: ${job.name}`);

    if (job.name === 'daily-sync') {
        const accounts = await SocialAccount.findAll({
            where: {
                platform: 'instagram',
                is_connected: true
            }
        });

        console.log(`Syncing ${accounts.length} accounts...`);

        for (const account of accounts) {
            try {
                // Fetch fresh data from IG Graph API
                const res = await axios.get(`https://graph.facebook.com/v18.0/${account.account_id}?fields=followers_count,follows_count,media_count&access_token=${account.access_token}`);
                const profile = res.data;

                // Recalculate score
                const newScore = calculateInfluencerScore(profile.followers_count, account.engagement_rate);

                await account.update({
                    followers_count: profile.followers_count,
                    following_count: profile.follows_count,
                    total_posts: profile.media_count,
                    last_synced_at: new Date()
                });

                console.log(`[SUCCESS] Synced account: ${account.username} (New Followers: ${profile.followers_count})`);
            } catch (error) {
                console.error(`[ERROR] Failed to sync account ${account.username}:`, error.response?.data || error.message);
            }
        }
    }
}, { connection });

syncWorker.on('completed', (job) => {
    console.log(`Job ${job.id} completed!`);
});

syncWorker.on('failed', (job, err) => {
    console.error(`Job ${job.id} failed with error ${err.message}`);
});

syncWorker.on('error', (err) => {
    // console.error(`Worker error: ${err.message}`);
});

module.exports = syncWorker;
