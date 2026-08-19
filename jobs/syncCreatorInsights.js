const { Op } = require('sequelize');
const db = require('../models');
const { syncAccountInsights } = require('../services/instagramInsights.service');

const social_accounts = db.models.social_accounts;
const INTERVAL_MS = 6 * 60 * 60 * 1000;

async function syncDueInstagramAccounts(logger = console) {
    const accounts = await social_accounts.findAll({
        where: {
            platform: 'instagram',
            is_connected: true,
            status: { [Op.ne]: 'inactive' },
        },
    });

    let synced = 0;
    let failed = 0;

    for (const account of accounts) {
        try {
            await syncAccountInsights(account, { force: true });
            synced += 1;
        } catch (error) {
            failed += 1;
            logger.error?.(
                `Creator insights sync failed for account ${account.id}: ${error.message}`,
            ) || console.error(error);
        }
    }

    return { synced, failed, total: accounts.length };
}

function startCreatorInsightsSyncJob(logger = console) {
    const run = async () => {
        try {
            const result = await syncDueInstagramAccounts(logger);
            if (result.total) {
                logger.info?.(
                    `Creator insights job: ${result.synced} synced, ${result.failed} failed of ${result.total}`,
                );
            }
        } catch (error) {
            logger.error?.(`Creator insights job error: ${error.message}`);
        }
    };

    run();
    return setInterval(run, INTERVAL_MS);
}

module.exports = {
    startCreatorInsightsSyncJob,
    syncDueInstagramAccounts,
};
